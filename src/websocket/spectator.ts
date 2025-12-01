/**
 * @fileoverview Spectator Manager - Read-only game viewing system
 * 
 * Manages spectator connections with:
 * - Per-game spectator limits based on game type
 * - Efficient state diffing for bandwidth optimization
 * - Quality tiers based on connection latency
 * - Spectator count broadcasting
 * - Integration with existing agent role system
 */

import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import { StateDiffer, type DiffResult, type PatchDocument } from './differ.js';

/**
 * Game type configuration for spectator limits
 */
export interface GameSpectatorConfig {
  /** Maximum spectators allowed */
  maxSpectators: number;
  /** State broadcast interval in ms */
  broadcastInterval: number;
  /** Enable state diffing */
  useDiffing: boolean;
  /** Quality tier thresholds */
  qualityTiers: QualityTierConfig;
}

/**
 * Quality tier configuration
 */
export interface QualityTierConfig {
  /** High quality: <50ms latency, full updates */
  high: { maxLatency: number; updateInterval: number };
  /** Medium quality: 50-150ms latency, reduced updates */
  medium: { maxLatency: number; updateInterval: number };
  /** Low quality: >150ms latency, minimal updates */
  low: { maxLatency: number; updateInterval: number };
}

/**
 * Default quality tiers
 */
export const DEFAULT_QUALITY_TIERS: QualityTierConfig = {
  high: { maxLatency: 50, updateInterval: 50 },
  medium: { maxLatency: 150, updateInterval: 100 },
  low: { maxLatency: Infinity, updateInterval: 200 },
};

/**
 * Per-game type spectator configurations
 */
export const GAME_SPECTATOR_CONFIGS: Record<string, GameSpectatorConfig> = {
  tictactoe: {
    maxSpectators: 50,
    broadcastInterval: 100,
    useDiffing: true,
    qualityTiers: DEFAULT_QUALITY_TIERS,
  },
  snake: {
    maxSpectators: 100,
    broadcastInterval: 50,
    useDiffing: true,
    qualityTiers: DEFAULT_QUALITY_TIERS,
  },
  dino: {
    maxSpectators: 100,
    broadcastInterval: 33, // ~30fps
    useDiffing: true,
    qualityTiers: DEFAULT_QUALITY_TIERS,
  },
  hangman: {
    maxSpectators: 50,
    broadcastInterval: 200,
    useDiffing: true,
    qualityTiers: DEFAULT_QUALITY_TIERS,
  },
  sudoku: {
    maxSpectators: 20,
    broadcastInterval: 500,
    useDiffing: true,
    qualityTiers: DEFAULT_QUALITY_TIERS,
  },
};

/**
 * Default config for unknown game types
 */
export const DEFAULT_SPECTATOR_CONFIG: GameSpectatorConfig = {
  maxSpectators: 50,
  broadcastInterval: 100,
  useDiffing: true,
  qualityTiers: DEFAULT_QUALITY_TIERS,
};

/**
 * Quality tier levels
 */
export type QualityTier = 'high' | 'medium' | 'low';

/**
 * Spectator connection info
 */
export interface SpectatorInfo {
  /** Unique spectator ID */
  id: string;
  /** WebSocket connection */
  socket: WebSocket;
  /** Game session being watched */
  sessionId: string;
  /** Display name (optional) */
  displayName?: string;
  /** Join timestamp */
  joinedAt: number;
  /** Current quality tier */
  qualityTier: QualityTier;
  /** Average latency in ms */
  latency: number;
  /** Last state hash (for diffing) */
  lastStateHash?: string;
  /** Last full state sent */
  lastState?: unknown;
  /** Messages received count */
  messagesReceived: number;
  /** Bytes sent */
  bytesSent: number;
}

/**
 * Game session spectator state
 */
export interface SessionSpectatorState {
  /** Session ID */
  sessionId: string;
  /** Game type */
  gameType: string;
  /** Configuration for this game type */
  config: GameSpectatorConfig;
  /** Current spectators */
  spectators: Map<string, SpectatorInfo>;
  /** Current game state */
  currentState?: unknown;
  /** Last broadcast timestamp */
  lastBroadcast: number;
  /** Broadcast timer handle */
  broadcastTimer?: ReturnType<typeof setInterval>;
  /** State differ instance */
  differ: StateDiffer;
}

/**
 * Spectator events
 */
export interface SpectatorEvents {
  /** Spectator joined a session */
  'spectator:join': { spectatorId: string; sessionId: string; count: number };
  /** Spectator left a session */
  'spectator:leave': { spectatorId: string; sessionId: string; count: number };
  /** Spectator count changed */
  'spectator:count': { sessionId: string; count: number };
  /** Quality tier changed */
  'spectator:quality': { spectatorId: string; tier: QualityTier; latency: number };
  /** State broadcasted */
  'spectator:broadcast': { sessionId: string; spectatorCount: number; usedDiff: boolean };
}

/**
 * Spectator manager configuration
 */
export interface SpectatorManagerConfig {
  /** Enable latency-based quality adaptation */
  enableQualityAdaptation: boolean;
  /** Latency measurement interval in ms */
  latencyCheckInterval: number;
  /** Custom game configs (override defaults) */
  gameConfigs?: Partial<Record<string, Partial<GameSpectatorConfig>>>;
}

/**
 * Default manager configuration
 */
export const DEFAULT_MANAGER_CONFIG: SpectatorManagerConfig = {
  enableQualityAdaptation: true,
  latencyCheckInterval: 5000,
};

/**
 * SpectatorManager - Manages spectator connections and state broadcasting
 */
export class SpectatorManager extends EventEmitter {
  private config: SpectatorManagerConfig;
  private sessions: Map<string, SessionSpectatorState> = new Map();
  private spectatorToSession: Map<string, string> = new Map();
  private latencyTimer?: ReturnType<typeof setInterval>;

  constructor(config?: Partial<SpectatorManagerConfig>) {
    super();
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };

    if (this.config.enableQualityAdaptation) {
      this.startLatencyMonitoring();
    }
  }

  /**
   * Get game spectator configuration
   */
  getGameConfig(gameType: string): GameSpectatorConfig {
    const baseConfig = GAME_SPECTATOR_CONFIGS[gameType] || DEFAULT_SPECTATOR_CONFIG;
    const override = this.config.gameConfigs?.[gameType];
    
    if (override) {
      return {
        ...baseConfig,
        ...override,
        qualityTiers: { ...baseConfig.qualityTiers, ...override.qualityTiers },
      };
    }
    
    return baseConfig;
  }

  /**
   * Initialize a game session for spectating
   */
  initSession(sessionId: string, gameType: string): SessionSpectatorState {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    const config = this.getGameConfig(gameType);
    const session: SessionSpectatorState = {
      sessionId,
      gameType,
      config,
      spectators: new Map(),
      lastBroadcast: 0,
      differ: new StateDiffer({ maxPatchRatio: 0.5 }),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Add a spectator to a session
   */
  addSpectator(
    sessionId: string,
    spectatorId: string,
    socket: WebSocket,
    displayName?: string
  ): { success: boolean; error?: string; spectatorInfo?: SpectatorInfo } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Check spectator limit
    if (session.spectators.size >= session.config.maxSpectators) {
      return { 
        success: false, 
        error: `Session full (max ${session.config.maxSpectators} spectators)` 
      };
    }

    // Check if already spectating
    if (session.spectators.has(spectatorId)) {
      return { success: false, error: 'Already spectating this session' };
    }

    // Remove from previous session if any
    const previousSessionId = this.spectatorToSession.get(spectatorId);
    if (previousSessionId) {
      this.removeSpectator(spectatorId);
    }

    const spectatorInfo: SpectatorInfo = {
      id: spectatorId,
      socket,
      sessionId,
      displayName,
      joinedAt: Date.now(),
      qualityTier: 'high',
      latency: 0,
      messagesReceived: 0,
      bytesSent: 0,
    };

    session.spectators.set(spectatorId, spectatorInfo);
    this.spectatorToSession.set(spectatorId, sessionId);

    // Start broadcast timer if first spectator
    if (session.spectators.size === 1) {
      this.startBroadcasting(session);
    }

    // Send current state immediately
    if (session.currentState) {
      this.sendFullState(spectatorInfo, session.currentState);
    }

    const count = session.spectators.size;
    this.emit('spectator:join', { spectatorId, sessionId, count });
    this.emit('spectator:count', { sessionId, count });
    this.broadcastSpectatorCount(session);

    return { success: true, spectatorInfo };
  }

  /**
   * Remove a spectator
   */
  removeSpectator(spectatorId: string): boolean {
    const sessionId = this.spectatorToSession.get(spectatorId);
    if (!sessionId) {
      return false;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.spectatorToSession.delete(spectatorId);
      return false;
    }

    session.spectators.delete(spectatorId);
    this.spectatorToSession.delete(spectatorId);

    // Stop broadcast timer if no spectators
    if (session.spectators.size === 0) {
      this.stopBroadcasting(session);
    }

    const count = session.spectators.size;
    this.emit('spectator:leave', { spectatorId, sessionId, count });
    this.emit('spectator:count', { sessionId, count });
    this.broadcastSpectatorCount(session);

    return true;
  }

  /**
   * Update game state for a session
   */
  updateState(sessionId: string, state: unknown): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.currentState = state;

    // If no broadcast timer (no spectators), just store state
    if (!session.broadcastTimer) {
      return;
    }

    // Check if enough time has passed since last broadcast
    const now = Date.now();
    if (now - session.lastBroadcast >= session.config.broadcastInterval) {
      this.broadcastState(session);
    }
  }

  /**
   * Force broadcast current state
   */
  broadcastNow(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.broadcastState(session);
    }
  }

  /**
   * Get spectator count for session
   */
  getSpectatorCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.spectators.size ?? 0;
  }

  /**
   * Get all spectators for session
   */
  getSpectators(sessionId: string): SpectatorInfo[] {
    const session = this.sessions.get(sessionId);
    return session ? Array.from(session.spectators.values()) : [];
  }

  /**
   * Get spectator info
   */
  getSpectator(spectatorId: string): SpectatorInfo | undefined {
    const sessionId = this.spectatorToSession.get(spectatorId);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId)?.spectators.get(spectatorId);
  }

  /**
   * Get spectator info (alias for getSpectator)
   */
  getSpectatorInfo(spectatorId: string): SpectatorInfo | undefined {
    return this.getSpectator(spectatorId);
  }

  /**
   * Set spectator quality tier manually
   */
  setSpectatorQuality(spectatorId: string, tier: QualityTier): boolean {
    const spectator = this.getSpectator(spectatorId);
    if (!spectator) return false;

    spectator.qualityTier = tier;
    this.emit('spectator:quality', { spectatorId, tier, latency: spectator.latency });
    return true;
  }

  /**
   * Update spectator latency
   */
  updateLatency(spectatorId: string, latency: number): void {
    const spectator = this.getSpectator(spectatorId);
    if (!spectator) return;

    spectator.latency = latency;
    const newTier = this.calculateQualityTier(spectator);

    if (newTier !== spectator.qualityTier) {
      spectator.qualityTier = newTier;
      this.emit('spectator:quality', { spectatorId, tier: newTier, latency });
    }
  }

  /**
   * Clean up a session
   */
  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Stop broadcasting
    this.stopBroadcasting(session);

    // Remove all spectators
    for (const spectatorId of session.spectators.keys()) {
      this.spectatorToSession.delete(spectatorId);
      this.emit('spectator:leave', { spectatorId, sessionId, count: 0 });
    }

    this.sessions.delete(sessionId);
    this.emit('spectator:count', { sessionId, count: 0 });
    return true;
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    spectatorCount: number;
    qualityDistribution: Record<QualityTier, number>;
    averageLatency: number;
    totalBytesSent: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const spectators = Array.from(session.spectators.values());
    const qualityDistribution: Record<QualityTier, number> = { high: 0, medium: 0, low: 0 };
    let totalLatency = 0;
    let totalBytesSent = 0;

    for (const spec of spectators) {
      qualityDistribution[spec.qualityTier]++;
      totalLatency += spec.latency;
      totalBytesSent += spec.bytesSent;
    }

    return {
      spectatorCount: spectators.length,
      qualityDistribution,
      averageLatency: spectators.length > 0 ? totalLatency / spectators.length : 0,
      totalBytesSent,
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Array<{ sessionId: string; gameType: string; spectatorCount: number }> {
    return Array.from(this.sessions.values()).map(session => ({
      sessionId: session.sessionId,
      gameType: session.gameType,
      spectatorCount: session.spectators.size,
    }));
  }

  /**
   * Get global stats
   */
  getStats(): { totalSessions: number; totalSpectators: number } {
    let totalSpectators = 0;
    for (const session of this.sessions.values()) {
      totalSpectators += session.spectators.size;
    }
    return {
      totalSessions: this.sessions.size,
      totalSpectators,
    };
  }

  /**
   * Shutdown manager
   */
  shutdown(): void {
    if (this.latencyTimer) {
      clearInterval(this.latencyTimer);
    }

    for (const session of this.sessions.values()) {
      this.stopBroadcasting(session);
    }

    this.sessions.clear();
    this.spectatorToSession.clear();
  }

  // ========================================
  // Private Methods
  // ========================================

  private startBroadcasting(session: SessionSpectatorState): void {
    if (session.broadcastTimer) return;

    session.broadcastTimer = setInterval(() => {
      if (session.currentState) {
        this.broadcastState(session);
      }
    }, session.config.broadcastInterval);
  }

  private stopBroadcasting(session: SessionSpectatorState): void {
    if (session.broadcastTimer) {
      clearInterval(session.broadcastTimer);
      session.broadcastTimer = undefined;
    }
  }

  private broadcastState(session: SessionSpectatorState): void {
    if (!session.currentState || session.spectators.size === 0) return;

    session.lastBroadcast = Date.now();
    let usedDiff = false;

    for (const spectator of session.spectators.values()) {
      // Check quality tier for update interval
      const tier = session.config.qualityTiers[spectator.qualityTier];
      const timeSinceLastSend = Date.now() - (spectator.lastState ? session.lastBroadcast : 0);
      
      if (timeSinceLastSend < tier.updateInterval) {
        continue;
      }

      if (session.config.useDiffing && spectator.lastState) {
        // Try to send diff
        const diffResult = session.differ.diff(spectator.lastState, session.currentState);
        
        if (diffResult.useFallback) {
          this.sendFullState(spectator, session.currentState);
        } else {
          this.sendPatch(spectator, diffResult);
          usedDiff = true;
        }
      } else {
        this.sendFullState(spectator, session.currentState);
      }

      spectator.lastState = this.deepClone(session.currentState);
    }

    this.emit('spectator:broadcast', {
      sessionId: session.sessionId,
      spectatorCount: session.spectators.size,
      usedDiff,
    });
  }

  private sendFullState(spectator: SpectatorInfo, state: unknown): void {
    const message = JSON.stringify({
      type: 'spectator:state',
      payload: {
        full: true,
        state,
        timestamp: Date.now(),
      },
    });

    this.sendToSpectator(spectator, message);
  }

  private sendPatch(spectator: SpectatorInfo, diffResult: DiffResult): void {
    const message = JSON.stringify({
      type: 'spectator:state',
      payload: {
        full: false,
        patch: diffResult.patch,
        timestamp: Date.now(),
      },
    });

    this.sendToSpectator(spectator, message);
  }

  private sendToSpectator(spectator: SpectatorInfo, message: string): void {
    try {
      if (spectator.socket.readyState === 1) { // WebSocket.OPEN
        spectator.socket.send(message);
        spectator.bytesSent += message.length;
        spectator.messagesReceived++;
      }
    } catch (error) {
      // Connection error - will be cleaned up by disconnect handler
    }
  }

  private broadcastSpectatorCount(session: SessionSpectatorState): void {
    const count = session.spectators.size;
    const message = JSON.stringify({
      type: 'spectator:count',
      payload: { sessionId: session.sessionId, count },
    });

    for (const spectator of session.spectators.values()) {
      this.sendToSpectator(spectator, message);
    }
  }

  private calculateQualityTier(spectator: SpectatorInfo): QualityTier {
    const session = this.sessions.get(spectator.sessionId);
    if (!session) return 'medium';

    const tiers = session.config.qualityTiers;
    
    if (spectator.latency <= tiers.high.maxLatency) {
      return 'high';
    } else if (spectator.latency <= tiers.medium.maxLatency) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private startLatencyMonitoring(): void {
    this.latencyTimer = setInterval(() => {
      for (const session of this.sessions.values()) {
        for (const spectator of session.spectators.values()) {
          this.measureLatency(spectator);
        }
      }
    }, this.config.latencyCheckInterval);
  }

  private measureLatency(spectator: SpectatorInfo): void {
    const pingStart = Date.now();
    const pingMessage = JSON.stringify({
      type: 'ping',
      payload: { timestamp: pingStart },
    });

    try {
      if (spectator.socket.readyState === 1) {
        spectator.socket.send(pingMessage);
        // Latency will be updated when pong is received
      }
    } catch {
      // Ignore ping errors
    }
  }

  private deepClone<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  }
}

// Singleton instance
let spectatorManagerInstance: SpectatorManager | null = null;

export function getSpectatorManager(config?: Partial<SpectatorManagerConfig>): SpectatorManager {
  if (!spectatorManagerInstance) {
    spectatorManagerInstance = new SpectatorManager(config);
  }
  return spectatorManagerInstance;
}

export function resetSpectatorManager(): void {
  if (spectatorManagerInstance) {
    spectatorManagerInstance.shutdown();
    spectatorManagerInstance = null;
  }
}
