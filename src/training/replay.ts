/**
 * @fileoverview ReplayEngine - Session playback with seek, pause, speed controls
 * 
 * Enables replaying recorded game sessions with:
 * - Play/pause/stop controls
 * - Seek to any frame
 * - Variable playback speed (0.25x to 4x)
 * - Frame-by-frame stepping
 * - Event emission for UI synchronization
 * - WebSocket broadcast for remote viewers
 */

import { EventEmitter } from 'events';
import type { RecordedSession, RecordedFrame, RecordedAction } from './recorder.js';

/**
 * Playback state enumeration
 */
export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped';

/**
 * Playback speed multipliers
 */
export type PlaybackSpeed = 0.25 | 0.5 | 1 | 1.5 | 2 | 4;

/**
 * Replay configuration options
 */
export interface ReplayConfig {
  /** Initial playback speed (default: 1) */
  speed?: PlaybackSpeed;
  /** Auto-play on load (default: false) */
  autoPlay?: boolean;
  /** Loop when complete (default: false) */
  loop?: boolean;
  /** Frame interval in ms (default: 500) */
  frameInterval?: number;
  /** Emit events during playback (default: true) */
  emitEvents?: boolean;
}

/**
 * Replay progress information
 */
export interface ReplayProgress {
  /** Current frame index (0-based) */
  currentFrame: number;
  /** Total frames in session */
  totalFrames: number;
  /** Elapsed time in ms */
  elapsedTime: number;
  /** Total duration in ms */
  totalDuration: number;
  /** Progress percentage (0-100) */
  percentage: number;
}

/**
 * Frame data emitted during playback
 */
export interface PlaybackFrame {
  /** Frame index */
  index: number;
  /** Frame data */
  frame: RecordedFrame;
  /** Action at this frame (if any) */
  action: RecordedAction | null;
  /** Whether this is the last frame */
  isLast: boolean;
  /** Progress info */
  progress: ReplayProgress;
}

/**
 * Replay events interface for TypeScript
 */
export interface ReplayEvents {
  'play': () => void;
  'pause': () => void;
  'stop': () => void;
  'seek': (frame: number) => void;
  'frame': (data: PlaybackFrame) => void;
  'speed': (speed: PlaybackSpeed) => void;
  'complete': (session: RecordedSession) => void;
  'error': (error: Error) => void;
}

/**
 * ReplayEngine class for session playback
 */
export class ReplayEngine extends EventEmitter {
  private session: RecordedSession | null = null;
  private config: Required<ReplayConfig>;
  private state: PlaybackState = 'idle';
  private currentFrameIndex: number = 0;
  private playbackTimer: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private pausedTime: number = 0;

  constructor(config: ReplayConfig = {}) {
    super();
    this.config = {
      speed: config.speed ?? 1,
      autoPlay: config.autoPlay ?? false,
      loop: config.loop ?? false,
      frameInterval: config.frameInterval ?? 500,
      emitEvents: config.emitEvents ?? true
    };
  }

  /**
   * Load a recorded session for playback
   */
  load(session: RecordedSession): void {
    if (this.state === 'playing') {
      this.stop();
    }

    this.session = session;
    this.currentFrameIndex = 0;
    this.state = 'idle';
    this.startTime = 0;
    this.pausedTime = 0;

    if (this.config.autoPlay && session.frames.length > 0) {
      this.play();
    }
  }

  /**
   * Unload the current session
   */
  unload(): void {
    this.stop();
    this.session = null;
    this.currentFrameIndex = 0;
    this.state = 'idle';
  }

  /**
   * Start or resume playback
   */
  play(): boolean {
    if (!this.session || this.session.frames.length === 0) {
      this.emitError(new Error('No session loaded'));
      return false;
    }

    if (this.state === 'playing') {
      return true; // Already playing
    }

    // If stopped or at end, restart from beginning
    if (this.state === 'stopped' || this.currentFrameIndex >= this.session.frames.length) {
      this.currentFrameIndex = 0;
      this.pausedTime = 0;
    }

    this.state = 'playing';
    this.startTime = Date.now() - this.pausedTime;
    this.scheduleNextFrame();

    if (this.config.emitEvents) {
      this.emit('play');
    }

    return true;
  }

  /**
   * Pause playback
   */
  pause(): boolean {
    if (this.state !== 'playing') {
      return false;
    }

    this.clearTimer();
    this.state = 'paused';
    this.pausedTime = Date.now() - this.startTime;

    if (this.config.emitEvents) {
      this.emit('pause');
    }

    return true;
  }

  /**
   * Stop playback and reset to beginning
   */
  stop(): boolean {
    this.clearTimer();
    this.state = 'stopped';
    this.currentFrameIndex = 0;
    this.pausedTime = 0;

    if (this.config.emitEvents) {
      this.emit('stop');
    }

    return true;
  }

  /**
   * Toggle play/pause state
   */
  toggle(): boolean {
    if (this.state === 'playing') {
      return this.pause();
    } else {
      return this.play();
    }
  }

  /**
   * Seek to a specific frame
   */
  seek(frameIndex: number): boolean {
    if (!this.session) {
      this.emitError(new Error('No session loaded'));
      return false;
    }

    const maxFrame = this.session.frames.length - 1;
    const targetFrame = Math.max(0, Math.min(frameIndex, maxFrame));

    const wasPlaying = this.state === 'playing';
    if (wasPlaying) {
      this.clearTimer();
    }

    this.currentFrameIndex = targetFrame;

    // Calculate elapsed time based on frame timestamps
    if (this.session.frames.length > 0) {
      const currentFrame = this.session.frames[targetFrame];
      const firstFrame = this.session.frames[0];
      this.pausedTime = currentFrame.timestamp - firstFrame.timestamp;
    }

    if (this.config.emitEvents) {
      this.emit('seek', targetFrame);
      // Emit the current frame
      this.emitCurrentFrame();
    }

    if (wasPlaying) {
      this.startTime = Date.now() - this.pausedTime;
      this.scheduleNextFrame();
    }

    return true;
  }

  /**
   * Seek to a percentage of the session (0-100)
   */
  seekPercent(percent: number): boolean {
    if (!this.session) {
      return false;
    }
    const frameIndex = Math.floor((percent / 100) * (this.session.frames.length - 1));
    return this.seek(frameIndex);
  }

  /**
   * Step forward one frame
   */
  stepForward(): boolean {
    if (!this.session) {
      return false;
    }

    if (this.state === 'playing') {
      this.pause();
    }

    if (this.currentFrameIndex < this.session.frames.length - 1) {
      this.currentFrameIndex++;
      this.emitCurrentFrame();
      return true;
    }

    return false;
  }

  /**
   * Step backward one frame
   */
  stepBackward(): boolean {
    if (!this.session) {
      return false;
    }

    if (this.state === 'playing') {
      this.pause();
    }

    if (this.currentFrameIndex > 0) {
      this.currentFrameIndex--;
      this.emitCurrentFrame();
      return true;
    }

    return false;
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: PlaybackSpeed): void {
    const validSpeeds: PlaybackSpeed[] = [0.25, 0.5, 1, 1.5, 2, 4];
    if (!validSpeeds.includes(speed)) {
      this.emitError(new Error(`Invalid speed: ${speed}`));
      return;
    }

    this.config.speed = speed;

    // Reschedule if playing
    if (this.state === 'playing') {
      this.clearTimer();
      this.scheduleNextFrame();
    }

    if (this.config.emitEvents) {
      this.emit('speed', speed);
    }
  }

  /**
   * Get current playback speed
   */
  getSpeed(): PlaybackSpeed {
    return this.config.speed;
  }

  /**
   * Set loop mode
   */
  setLoop(loop: boolean): void {
    this.config.loop = loop;
  }

  /**
   * Get current playback state
   */
  getState(): PlaybackState {
    return this.state;
  }

  /**
   * Get current session
   */
  getSession(): RecordedSession | null {
    return this.session;
  }

  /**
   * Get current frame index
   */
  getCurrentFrameIndex(): number {
    return this.currentFrameIndex;
  }

  /**
   * Get current frame data
   */
  getCurrentFrame(): RecordedFrame | null {
    if (!this.session || this.currentFrameIndex >= this.session.frames.length) {
      return null;
    }
    return this.session.frames[this.currentFrameIndex];
  }

  /**
   * Get progress information
   */
  getProgress(): ReplayProgress | null {
    if (!this.session || this.session.frames.length === 0) {
      return null;
    }

    const frames = this.session.frames;
    const firstFrame = frames[0];
    const lastFrame = frames[frames.length - 1];
    const currentFrame = frames[this.currentFrameIndex];

    const totalDuration = lastFrame.timestamp - firstFrame.timestamp;
    const elapsedTime = currentFrame.timestamp - firstFrame.timestamp;

    return {
      currentFrame: this.currentFrameIndex,
      totalFrames: frames.length,
      elapsedTime,
      totalDuration,
      percentage: totalDuration > 0 ? (elapsedTime / totalDuration) * 100 : 0
    };
  }

  /**
   * Get action at specific frame (if any)
   */
  getActionAtFrame(frameIndex: number): RecordedAction | null {
    if (!this.session) {
      return null;
    }

    const frame = this.session.frames[frameIndex];
    return frame?.action ?? null;
  }

  /**
   * Export playback state for WebSocket broadcast
   */
  getPlaybackState(): object {
    const progress = this.getProgress();
    return {
      state: this.state,
      speed: this.config.speed,
      loop: this.config.loop,
      currentFrame: this.currentFrameIndex,
      progress: progress,
      sessionId: this.session?.sessionId ?? null,
      gameType: this.session?.gameType ?? null
    };
  }

  /**
   * Create a clip from current session
   */
  createClip(startFrame: number, endFrame: number): RecordedSession | null {
    if (!this.session) {
      return null;
    }

    const frames = this.session.frames;
    const maxFrame = frames.length - 1;

    const start = Math.max(0, Math.min(startFrame, maxFrame));
    const end = Math.max(start, Math.min(endFrame, maxFrame));

    const clipFrames = frames.slice(start, end + 1);
    if (clipFrames.length === 0) {
      return null;
    }

    // Get timestamp range
    const startTime = clipFrames[0].timestamp;
    const endTime = clipFrames[clipFrames.length - 1].timestamp;

    return {
      sessionId: `${this.session.sessionId}_clip_${start}_${end}`,
      version: this.session.version,
      startedAt: startTime,
      endedAt: endTime,
      gameType: this.session.gameType,
      gameMode: this.session.gameMode,
      difficulty: this.session.difficulty,
      recordingMode: this.session.recordingMode,
      agents: [...this.session.agents],
      frames: clipFrames,
      outcome: undefined, // Clips don't have outcomes
      metadata: {
        ...this.session.metadata,
        tags: [...this.session.metadata.tags, 'clip'],
      }
    };
  }

  /**
   * Schedule next frame playback
   */
  private scheduleNextFrame(): void {
    if (!this.session || this.state !== 'playing') {
      return;
    }

    // Calculate interval based on speed
    const interval = this.config.frameInterval / this.config.speed;

    this.playbackTimer = setTimeout(() => {
      this.playFrame();
    }, interval);
  }

  /**
   * Play current frame and advance
   */
  private playFrame(): void {
    if (!this.session || this.state !== 'playing') {
      return;
    }

    // Emit current frame
    this.emitCurrentFrame();

    // Check if at end
    if (this.currentFrameIndex >= this.session.frames.length - 1) {
      if (this.config.loop) {
        // Loop back to beginning
        this.currentFrameIndex = 0;
        this.startTime = Date.now();
        this.pausedTime = 0;
        this.scheduleNextFrame();
      } else {
        // Complete
        this.state = 'stopped';
        if (this.config.emitEvents) {
          this.emit('complete', this.session);
        }
      }
      return;
    }

    // Advance to next frame
    this.currentFrameIndex++;
    this.scheduleNextFrame();
  }

  /**
   * Emit current frame data
   */
  private emitCurrentFrame(): void {
    if (!this.session || !this.config.emitEvents) {
      return;
    }

    const frame = this.session.frames[this.currentFrameIndex];
    if (!frame) {
      return;
    }

    const playbackFrame: PlaybackFrame = {
      index: this.currentFrameIndex,
      frame,
      action: frame.action,
      isLast: this.currentFrameIndex >= this.session.frames.length - 1,
      progress: this.getProgress()!
    };

    this.emit('frame', playbackFrame);
  }

  /**
   * Clear playback timer
   */
  private clearTimer(): void {
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  /**
   * Emit error event
   */
  private emitError(error: Error): void {
    if (this.config.emitEvents) {
      this.emit('error', error);
    }
  }
}

/**
 * ReplayController - manages multiple replay engines for comparison
 */
export class ReplayController {
  private engines: Map<string, ReplayEngine> = new Map();
  private synchronized: boolean = false;
  private masterEngine: string | null = null;

  /**
   * Create a new replay engine
   */
  createEngine(id: string, config?: ReplayConfig): ReplayEngine {
    const engine = new ReplayEngine(config);
    this.engines.set(id, engine);

    if (!this.masterEngine) {
      this.masterEngine = id;
    }

    return engine;
  }

  /**
   * Get an engine by ID
   */
  getEngine(id: string): ReplayEngine | undefined {
    return this.engines.get(id);
  }

  /**
   * Remove an engine
   */
  removeEngine(id: string): boolean {
    const engine = this.engines.get(id);
    if (engine) {
      engine.unload();
      this.engines.delete(id);

      if (this.masterEngine === id) {
        this.masterEngine = this.engines.keys().next().value ?? null;
      }
      return true;
    }
    return false;
  }

  /**
   * Enable synchronized playback
   */
  enableSync(masterId?: string): void {
    this.synchronized = true;
    if (masterId && this.engines.has(masterId)) {
      this.masterEngine = masterId;
    }

    // Sync all engines to master
    const master = this.masterEngine ? this.engines.get(this.masterEngine) : null;
    if (master) {
      this.syncToMaster();
    }
  }

  /**
   * Disable synchronized playback
   */
  disableSync(): void {
    this.synchronized = false;
  }

  /**
   * Play all engines (or just master if synced)
   */
  playAll(): void {
    if (this.synchronized && this.masterEngine) {
      const master = this.engines.get(this.masterEngine);
      if (master) {
        master.play();
        this.syncToMaster();
      }
    } else {
      this.engines.forEach(engine => engine.play());
    }
  }

  /**
   * Pause all engines
   */
  pauseAll(): void {
    this.engines.forEach(engine => engine.pause());
  }

  /**
   * Stop all engines
   */
  stopAll(): void {
    this.engines.forEach(engine => engine.stop());
  }

  /**
   * Seek all engines to a frame
   */
  seekAll(frameIndex: number): void {
    this.engines.forEach(engine => engine.seek(frameIndex));
  }

  /**
   * Set speed for all engines
   */
  setSpeedAll(speed: PlaybackSpeed): void {
    this.engines.forEach(engine => engine.setSpeed(speed));
  }

  /**
   * Get all engine states
   */
  getAllStates(): Map<string, object> {
    const states = new Map<string, object>();
    this.engines.forEach((engine, id) => {
      states.set(id, engine.getPlaybackState());
    });
    return states;
  }

  /**
   * Sync all engines to master position
   */
  private syncToMaster(): void {
    if (!this.masterEngine) return;

    const master = this.engines.get(this.masterEngine);
    if (!master) return;

    const frameIndex = master.getCurrentFrameIndex();
    const speed = master.getSpeed();

    this.engines.forEach((engine, id) => {
      if (id !== this.masterEngine) {
        engine.setSpeed(speed);
        engine.seek(frameIndex);
      }
    });
  }

  /**
   * Get engine count
   */
  get size(): number {
    return this.engines.size;
  }

  /**
   * Clear all engines
   */
  clear(): void {
    this.engines.forEach(engine => engine.unload());
    this.engines.clear();
    this.masterEngine = null;
  }
}

export default ReplayEngine;
