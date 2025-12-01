/**
 * Session Recorder for Liku-AI Training
 * 
 * Records complete game sessions with:
 * - Full state history at each timestep
 * - Action-reward pairs for reinforcement learning
 * - Agent metadata and performance metrics
 * - Timestamps for replay synchronization
 * 
 * Supports multiple recording modes:
 * - FULL: Every state change (high fidelity, large files)
 * - SAMPLED: Fixed interval sampling (balanced)
 * - ACTIONS_ONLY: Only record when actions occur (minimal)
 * 
 * @module training/recorder
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

/**
 * Recording mode determines what gets captured
 */
export enum RecordingMode {
  /** Record every state change */
  FULL = 'full',
  /** Sample at fixed intervals */
  SAMPLED = 'sampled',
  /** Only record action frames */
  ACTIONS_ONLY = 'actions_only',
}

/**
 * Recorded frame representing a single timestep
 */
export interface RecordedFrame {
  /** Frame sequence number */
  frameId: number;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Time since session start (ms) */
  relativeTime: number;
  /** Complete game state at this frame */
  state: GameStateSnapshot;
  /** Action taken at this frame (null if no action) */
  action: RecordedAction | null;
  /** Reward signal for RL training */
  reward: number;
  /** Cumulative reward up to this point */
  cumulativeReward: number;
  /** Is this a terminal state (game over) */
  isTerminal: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Snapshot of game state for recording
 */
export interface GameStateSnapshot {
  /** Game type identifier */
  gameType: 'tictactoe' | 'snake' | 'dino' | 'hangman' | 'sudoku';
  /** Raw game data (game-specific) */
  data: unknown;
  /** Normalized observation vector for ML */
  observation?: number[];
  /** Valid actions at this state */
  validActions: string[];
  /** Current score/points */
  score: number;
  /** Game-specific features */
  features?: Record<string, number>;
}

/**
 * Recorded action with context
 */
export interface RecordedAction {
  /** Action identifier */
  action: string;
  /** Agent who performed the action */
  agentId: string;
  /** Action parameters (e.g., row/col for TicTacToe) */
  params?: Record<string, unknown>;
  /** Time taken to decide (ms) */
  decisionTimeMs: number;
  /** Was this action valid */
  wasValid: boolean;
  /** Action source */
  source: 'human' | 'ai' | 'random' | 'scripted';
}

/**
 * Session outcome information
 */
export interface SessionOutcome {
  /** Final result */
  result: 'win' | 'loss' | 'draw' | 'timeout' | 'forfeit' | 'error';
  /** Winner agent ID (if applicable) */
  winnerId?: string;
  /** Final score */
  finalScore: number;
  /** Total reward accumulated */
  totalReward: number;
  /** Session duration in ms */
  durationMs: number;
  /** Total frames recorded */
  totalFrames: number;
  /** Reason for ending */
  endReason?: string;
}

/**
 * Complete recorded session
 */
export interface RecordedSession {
  /** Unique session identifier */
  sessionId: string;
  /** Recording version for compatibility */
  version: string;
  /** Recording start time */
  startedAt: number;
  /** Recording end time */
  endedAt?: number;
  /** Game type */
  gameType: string;
  /** Game mode (local, websocket, etc.) */
  gameMode: string;
  /** Difficulty setting */
  difficulty?: string;
  /** Recording mode used */
  recordingMode: RecordingMode;
  /** Agents participating */
  agents: AgentInfo[];
  /** All recorded frames */
  frames: RecordedFrame[];
  /** Session outcome */
  outcome?: SessionOutcome;
  /** Session metadata */
  metadata: SessionMetadata;
}

/**
 * Agent information for session
 */
export interface AgentInfo {
  /** Agent identifier */
  id: string;
  /** Display name */
  name: string;
  /** Agent type */
  type: 'human' | 'ai' | 'random';
  /** AI provider if applicable */
  aiProvider?: string;
  /** Model/version info */
  modelVersion?: string;
  /** Player slot (X/O, white/black) */
  slot?: string;
  /** Custom agent metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  /** Environment info */
  environment: {
    platform: string;
    nodeVersion: string;
    appVersion: string;
  };
  /** Recording configuration */
  config: {
    sampleIntervalMs?: number;
    maxFrames?: number;
    includeObservations: boolean;
  };
  /** Custom tags for filtering */
  tags: string[];
  /** Experiment ID if part of A/B test */
  experimentId?: string;
  /** Experiment variant */
  variant?: string;
}

/**
 * Recorder configuration
 */
export interface RecorderConfig {
  /** Recording mode */
  mode: RecordingMode;
  /** Sample interval for SAMPLED mode (ms) */
  sampleIntervalMs: number;
  /** Maximum frames to record (0 = unlimited) */
  maxFrames: number;
  /** Include normalized observations */
  includeObservations: boolean;
  /** Auto-save interval (0 = only on stop) */
  autoSaveIntervalMs: number;
  /** Compress frames in memory */
  compressInMemory: boolean;
}

/**
 * Default recorder configuration
 */
export const DEFAULT_RECORDER_CONFIG: RecorderConfig = {
  mode: RecordingMode.FULL,
  sampleIntervalMs: 100,
  maxFrames: 0,
  includeObservations: true,
  autoSaveIntervalMs: 0,
  compressInMemory: false,
};

/**
 * Reward calculator function type
 */
export type RewardCalculator = (
  prevState: GameStateSnapshot | null,
  action: RecordedAction | null,
  newState: GameStateSnapshot,
  isTerminal: boolean
) => number;

/**
 * Default reward calculators per game type
 */
export const DEFAULT_REWARD_CALCULATORS: Record<string, RewardCalculator> = {
  tictactoe: (prev, action, state, isTerminal) => {
    if (!isTerminal) return 0;
    const data = state.data as { winner?: string };
    if (data.winner === action?.agentId) return 1;
    if (data.winner === 'draw') return 0.5;
    return -1;
  },
  snake: (prev, action, state, isTerminal) => {
    if (isTerminal) return -10; // Death penalty
    const prevScore = prev?.score ?? 0;
    if (state.score > prevScore) return 1; // Food eaten
    return -0.01; // Small time penalty
  },
  dino: (prev, action, state, isTerminal) => {
    if (isTerminal) return -10; // Collision penalty
    const prevScore = prev?.score ?? 0;
    return (state.score - prevScore) * 0.1; // Score-based reward
  },
};

/**
 * SessionRecorder - Records game sessions for ML training
 * 
 * Events:
 * - 'frameRecorded': (frame: RecordedFrame) - New frame recorded
 * - 'sessionStarted': (session: RecordedSession) - Recording started
 * - 'sessionEnded': (session: RecordedSession) - Recording ended
 * - 'autoSaved': (sessionId: string, frameCount: number) - Auto-save triggered
 */
export class SessionRecorder extends EventEmitter {
  private config: RecorderConfig;
  private currentSession: RecordedSession | null = null;
  private frameCounter: number = 0;
  private sessionStartTime: number = 0;
  private lastSampleTime: number = 0;
  private cumulativeReward: number = 0;
  private previousState: GameStateSnapshot | null = null;
  private rewardCalculator: RewardCalculator;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<RecorderConfig>) {
    super();
    this.config = { ...DEFAULT_RECORDER_CONFIG, ...config };
    this.rewardCalculator = () => 0; // Default no-op
  }

  /**
   * Start recording a new session
   */
  startSession(
    gameType: string,
    gameMode: string,
    agents: AgentInfo[],
    options?: {
      difficulty?: string;
      tags?: string[];
      experimentId?: string;
      variant?: string;
      rewardCalculator?: RewardCalculator;
    }
  ): RecordedSession {
    if (this.currentSession) {
      throw new Error('Session already in progress. Call stopSession() first.');
    }

    // Set up reward calculator
    this.rewardCalculator = options?.rewardCalculator 
      || DEFAULT_REWARD_CALCULATORS[gameType] 
      || (() => 0);

    const session: RecordedSession = {
      sessionId: `rec_${randomUUID()}`,
      version: '1.0.0',
      startedAt: Date.now(),
      gameType,
      gameMode,
      difficulty: options?.difficulty,
      recordingMode: this.config.mode,
      agents,
      frames: [],
      metadata: {
        environment: {
          platform: process.platform,
          nodeVersion: process.version,
          appVersion: '2.0.0',
        },
        config: {
          sampleIntervalMs: this.config.sampleIntervalMs,
          maxFrames: this.config.maxFrames,
          includeObservations: this.config.includeObservations,
        },
        tags: options?.tags || [],
        experimentId: options?.experimentId,
        variant: options?.variant,
      },
    };

    this.currentSession = session;
    this.frameCounter = 0;
    this.sessionStartTime = session.startedAt;
    this.lastSampleTime = 0;
    this.cumulativeReward = 0;
    this.previousState = null;

    // Setup auto-save if configured
    if (this.config.autoSaveIntervalMs > 0) {
      this.autoSaveInterval = setInterval(() => {
        this.emit('autoSaved', session.sessionId, session.frames.length);
      }, this.config.autoSaveIntervalMs);
    }

    this.emit('sessionStarted', session);
    return session;
  }

  /**
   * Record a frame
   */
  recordFrame(
    state: GameStateSnapshot,
    action: RecordedAction | null = null,
    isTerminal: boolean = false,
    metadata?: Record<string, unknown>
  ): RecordedFrame | null {
    if (!this.currentSession) {
      throw new Error('No session in progress. Call startSession() first.');
    }

    const now = Date.now();
    const relativeTime = now - this.sessionStartTime;

    // Check recording mode constraints
    if (this.config.mode === RecordingMode.ACTIONS_ONLY && !action) {
      return null; // Skip non-action frames
    }

    if (this.config.mode === RecordingMode.SAMPLED) {
      if (relativeTime - this.lastSampleTime < this.config.sampleIntervalMs && !action && !isTerminal) {
        return null; // Skip until sample interval
      }
      this.lastSampleTime = relativeTime;
    }

    // Check max frames
    if (this.config.maxFrames > 0 && this.frameCounter >= this.config.maxFrames) {
      return null; // Max frames reached
    }

    // Calculate reward
    const reward = this.rewardCalculator(this.previousState, action, state, isTerminal);
    this.cumulativeReward += reward;

    const frame: RecordedFrame = {
      frameId: this.frameCounter++,
      timestamp: now,
      relativeTime,
      state: this.config.includeObservations ? state : { ...state, observation: undefined },
      action,
      reward,
      cumulativeReward: this.cumulativeReward,
      isTerminal,
      metadata,
    };

    this.currentSession.frames.push(frame);
    this.previousState = state;

    this.emit('frameRecorded', frame);
    return frame;
  }

  /**
   * Stop recording and finalize session
   */
  stopSession(outcome: SessionOutcome): RecordedSession {
    if (!this.currentSession) {
      throw new Error('No session in progress.');
    }

    // Clear auto-save
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    this.currentSession.endedAt = Date.now();
    this.currentSession.outcome = {
      ...outcome,
      totalReward: this.cumulativeReward,
      durationMs: this.currentSession.endedAt - this.currentSession.startedAt,
      totalFrames: this.currentSession.frames.length,
    };

    const session = this.currentSession;
    this.currentSession = null;
    this.previousState = null;

    this.emit('sessionEnded', session);
    return session;
  }

  /**
   * Get current session (if recording)
   */
  getCurrentSession(): RecordedSession | null {
    return this.currentSession;
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.currentSession !== null;
  }

  /**
   * Get frame count for current session
   */
  getFrameCount(): number {
    return this.currentSession?.frames.length ?? 0;
  }

  /**
   * Set custom reward calculator
   */
  setRewardCalculator(calculator: RewardCalculator): void {
    this.rewardCalculator = calculator;
  }

  /**
   * Update config (only when not recording)
   */
  updateConfig(config: Partial<RecorderConfig>): void {
    if (this.currentSession) {
      throw new Error('Cannot update config while recording.');
    }
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current config
   */
  getConfig(): RecorderConfig {
    return { ...this.config };
  }
}

// ============================================
// State Observation Normalizers
// ============================================

/**
 * Normalize TicTacToe state to observation vector
 * Returns 27-element vector: 9 cells × 3 one-hot (empty, X, O)
 */
export function normalizeTicTacToeState(board: (string | null)[][]): number[] {
  const obs: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = board[r][c];
      obs.push(cell === null ? 1 : 0); // Empty
      obs.push(cell === 'X' ? 1 : 0);  // X
      obs.push(cell === 'O' ? 1 : 0);  // O
    }
  }
  return obs;
}

/**
 * Normalize Snake state to observation vector
 * Returns fixed-size vector with head position, direction, food position, danger indicators
 */
export function normalizeSnakeState(
  head: { x: number; y: number },
  direction: string,
  food: { x: number; y: number },
  gridSize: { width: number; height: number },
  bodyPositions: { x: number; y: number }[]
): number[] {
  const obs: number[] = [
    // Normalized head position
    head.x / gridSize.width,
    head.y / gridSize.height,
    // Direction one-hot (up, down, left, right)
    direction === 'up' ? 1 : 0,
    direction === 'down' ? 1 : 0,
    direction === 'left' ? 1 : 0,
    direction === 'right' ? 1 : 0,
    // Normalized food position
    food.x / gridSize.width,
    food.y / gridSize.height,
    // Relative food direction
    (food.x - head.x) / gridSize.width,
    (food.y - head.y) / gridSize.height,
    // Danger indicators (collision in each direction)
    isDanger(head, 'up', bodyPositions, gridSize) ? 1 : 0,
    isDanger(head, 'down', bodyPositions, gridSize) ? 1 : 0,
    isDanger(head, 'left', bodyPositions, gridSize) ? 1 : 0,
    isDanger(head, 'right', bodyPositions, gridSize) ? 1 : 0,
  ];
  return obs;
}

function isDanger(
  head: { x: number; y: number },
  direction: string,
  body: { x: number; y: number }[],
  gridSize: { width: number; height: number }
): boolean {
  let nextX = head.x;
  let nextY = head.y;
  
  switch (direction) {
    case 'up': nextY--; break;
    case 'down': nextY++; break;
    case 'left': nextX--; break;
    case 'right': nextX++; break;
  }
  
  // Wall collision
  if (nextX < 0 || nextX >= gridSize.width || nextY < 0 || nextY >= gridSize.height) {
    return true;
  }
  
  // Self collision
  return body.some(seg => seg.x === nextX && seg.y === nextY);
}

/**
 * Normalize Dino state to observation vector
 * Returns vector with position, velocity, obstacle distances
 */
export function normalizeDinoState(
  isJumping: boolean,
  isDucking: boolean,
  yPosition: number,
  obstacles: { type: string; distance: number; height: number }[],
  speed: number,
  maxObstacles: number = 3
): number[] {
  const obs: number[] = [
    isJumping ? 1 : 0,
    isDucking ? 1 : 0,
    yPosition / 100, // Normalized Y position
    speed / 20, // Normalized speed
  ];
  
  // Add obstacle features (padded to maxObstacles)
  for (let i = 0; i < maxObstacles; i++) {
    if (i < obstacles.length) {
      const obs_item = obstacles[i];
      obs.push(
        obs_item.type === 'cactus' ? 1 : 0,
        obs_item.type === 'bird' ? 1 : 0,
        obs_item.distance / 1000, // Normalized distance
        obs_item.height / 100 // Normalized height
      );
    } else {
      obs.push(0, 0, 1, 0); // No obstacle placeholder
    }
  }
  
  return obs;
}

// Singleton instance
export const sessionRecorder = new SessionRecorder();
