/**
 * Turn-Taking & Concurrent Agent Management for Liku-AI
 * 
 * Implements Phase 3.2: Concurrent Agent Management
 * - Turn-taking protocol for multiple agents
 * - Agent priority system
 * - Command queuing with fairness
 * - Spectator mode enforcement
 * 
 * @module websocket/turns
 */

import { EventEmitter } from 'events';
import { AgentRole } from './agents.js';

/**
 * Turn mode defines how agents take turns
 */
export enum TurnMode {
  /** Free-for-all: all agents can send commands anytime */
  FREE = 'free',
  /** Round-robin: agents take turns in order */
  ROUND_ROBIN = 'round_robin',
  /** Priority: higher priority agents go first */
  PRIORITY = 'priority',
  /** Timed: each agent has a time limit per turn */
  TIMED = 'timed',
  /** Cooperative: multiple agents can act simultaneously */
  COOPERATIVE = 'cooperative',
}

/**
 * Command priority levels
 */
export enum CommandPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3,
  SYSTEM = 4,
}

/**
 * A queued command from an agent
 */
export interface QueuedCommand {
  /** Unique command ID */
  id: string;
  /** Agent ID that sent the command */
  agentId: string;
  /** Command type */
  type: 'key' | 'action';
  /** Command payload */
  payload: unknown;
  /** Priority level */
  priority: CommandPriority;
  /** Timestamp when queued */
  queuedAt: number;
  /** Request ID for response correlation */
  requestId?: string;
}

/**
 * Turn state for an agent
 */
export interface AgentTurnState {
  /** Agent ID */
  agentId: string;
  /** Is it currently this agent's turn */
  isCurrentTurn: boolean;
  /** Commands remaining in this turn */
  commandsRemaining: number;
  /** Time remaining in turn (ms) for TIMED mode */
  timeRemainingMs?: number;
  /** Total turns taken */
  turnsTaken: number;
  /** Position in turn order */
  orderPosition: number;
  /** Agent priority (higher = goes first in PRIORITY mode) */
  priority: number;
}

/**
 * Configuration for turn management
 */
export interface TurnConfig {
  /** Turn mode to use */
  mode: TurnMode;
  /** Commands per turn in ROUND_ROBIN mode */
  commandsPerTurn: number;
  /** Time per turn in TIMED mode (ms) */
  turnTimeMs: number;
  /** Allow command queueing when not your turn */
  allowQueueing: boolean;
  /** Maximum queue size per agent */
  maxQueueSize: number;
  /** Auto-skip agents that don't act within timeout */
  autoSkipTimeoutMs: number;
}

/**
 * Default turn configuration
 */
export const DEFAULT_TURN_CONFIG: TurnConfig = {
  mode: TurnMode.FREE,
  commandsPerTurn: 1,
  turnTimeMs: 30000, // 30 seconds
  allowQueueing: true,
  maxQueueSize: 10,
  autoSkipTimeoutMs: 60000, // 1 minute
};

/**
 * TurnManager - Manages turn-taking for multiple agents
 */
export class TurnManager extends EventEmitter {
  private config: TurnConfig;
  private turnOrder: string[] = []; // Agent IDs in turn order
  private currentTurnIndex: number = 0;
  private agentStates: Map<string, AgentTurnState> = new Map();
  private commandQueue: QueuedCommand[] = [];
  private turnTimer: NodeJS.Timeout | null = null;
  private skipTimer: NodeJS.Timeout | null = null;
  private commandCounter: number = 0;
  private spectators: Set<string> = new Set();

  constructor(config?: Partial<TurnConfig>) {
    super();
    this.config = { ...DEFAULT_TURN_CONFIG, ...config };
  }

  /**
   * Add an agent to the turn system
   */
  addAgent(agentId: string, role: AgentRole, priority: number = CommandPriority.NORMAL): void {
    if (role === AgentRole.SPECTATOR) {
      this.spectators.add(agentId);
      this.emit('spectatorAdded', agentId);
      return;
    }

    if (this.agentStates.has(agentId)) {
      return; // Already added
    }

    // Insert based on priority for PRIORITY mode
    let insertIndex = this.turnOrder.length;
    if (this.config.mode === TurnMode.PRIORITY) {
      insertIndex = this.turnOrder.findIndex(id => {
        const state = this.agentStates.get(id);
        return state && state.priority < priority;
      });
      if (insertIndex === -1) insertIndex = this.turnOrder.length;
    }

    this.turnOrder.splice(insertIndex, 0, agentId);

    // Update order positions for all agents
    this.turnOrder.forEach((id, idx) => {
      const state = this.agentStates.get(id);
      if (state) state.orderPosition = idx;
    });

    const state: AgentTurnState = {
      agentId,
      isCurrentTurn: this.turnOrder.length === 1, // First agent gets turn
      commandsRemaining: this.config.commandsPerTurn,
      turnsTaken: 0,
      orderPosition: insertIndex,
      priority,
    };

    if (this.config.mode === TurnMode.TIMED) {
      state.timeRemainingMs = this.config.turnTimeMs;
    }

    this.agentStates.set(agentId, state);
    this.emit('agentAdded', agentId, state);

    // Start turn timer if this is the first agent
    if (this.turnOrder.length === 1 && this.config.mode === TurnMode.TIMED) {
      this.startTurnTimer();
    }
  }

  /**
   * Remove an agent from the turn system
   */
  removeAgent(agentId: string): void {
    if (this.spectators.has(agentId)) {
      this.spectators.delete(agentId);
      this.emit('spectatorRemoved', agentId);
      return;
    }

    const index = this.turnOrder.indexOf(agentId);
    if (index === -1) return;

    const wasCurrentTurn = this.currentTurnIndex === index;
    this.turnOrder.splice(index, 1);
    this.agentStates.delete(agentId);

    // Remove queued commands for this agent
    this.commandQueue = this.commandQueue.filter(cmd => cmd.agentId !== agentId);

    // Adjust current turn index
    if (this.turnOrder.length > 0) {
      if (wasCurrentTurn || this.currentTurnIndex >= this.turnOrder.length) {
        this.currentTurnIndex = this.currentTurnIndex % this.turnOrder.length;
        this.updateCurrentTurn();
      }
    } else {
      this.currentTurnIndex = 0;
      this.stopTurnTimer();
    }

    // Update order positions
    this.turnOrder.forEach((id, idx) => {
      const state = this.agentStates.get(id);
      if (state) state.orderPosition = idx;
    });

    this.emit('agentRemoved', agentId);
  }

  /**
   * Check if an agent can send a command
   */
  canSendCommand(agentId: string): { allowed: boolean; reason?: string } {
    // Spectators can never send commands
    if (this.spectators.has(agentId)) {
      return { allowed: false, reason: 'Spectators cannot send commands' };
    }

    const state = this.agentStates.get(agentId);
    if (!state) {
      return { allowed: false, reason: 'Agent not registered' };
    }

    // Free mode always allows
    if (this.config.mode === TurnMode.FREE) {
      return { allowed: true };
    }

    // Cooperative mode always allows
    if (this.config.mode === TurnMode.COOPERATIVE) {
      return { allowed: true };
    }

    // Check if it's this agent's turn
    if (!state.isCurrentTurn) {
      if (this.config.allowQueueing) {
        return { allowed: true }; // Will be queued
      }
      return { allowed: false, reason: 'Not your turn' };
    }

    // Check commands remaining for ROUND_ROBIN
    if (this.config.mode === TurnMode.ROUND_ROBIN && state.commandsRemaining <= 0) {
      return { allowed: false, reason: 'No commands remaining this turn' };
    }

    // Check time remaining for TIMED
    if (this.config.mode === TurnMode.TIMED && (state.timeRemainingMs ?? 0) <= 0) {
      return { allowed: false, reason: 'Turn time expired' };
    }

    return { allowed: true };
  }

  /**
   * Queue a command from an agent
   */
  queueCommand(
    agentId: string, 
    type: 'key' | 'action', 
    payload: unknown, 
    requestId?: string,
    priority: CommandPriority = CommandPriority.NORMAL
  ): { queued: boolean; executed: boolean; queuePosition?: number; reason?: string } {
    const canSend = this.canSendCommand(agentId);
    
    if (!canSend.allowed && !this.config.allowQueueing) {
      return { queued: false, executed: false, reason: canSend.reason };
    }

    const state = this.agentStates.get(agentId);
    if (!state) {
      return { queued: false, executed: false, reason: 'Agent not registered' };
    }

    const command: QueuedCommand = {
      id: `cmd_${++this.commandCounter}`,
      agentId,
      type,
      payload,
      priority,
      queuedAt: Date.now(),
      requestId,
    };

    // If it's the agent's turn and in allowed modes, execute immediately
    if (state.isCurrentTurn && 
        (this.config.mode === TurnMode.FREE || 
         this.config.mode === TurnMode.COOPERATIVE ||
         (this.config.mode === TurnMode.ROUND_ROBIN && state.commandsRemaining > 0) ||
         (this.config.mode === TurnMode.TIMED && (state.timeRemainingMs ?? 0) > 0))) {
      
      this.executeCommand(command);
      return { queued: false, executed: true };
    }

    // Check queue size limit
    const agentQueueSize = this.commandQueue.filter(c => c.agentId === agentId).length;
    if (agentQueueSize >= this.config.maxQueueSize) {
      return { queued: false, executed: false, reason: 'Queue full' };
    }

    // Add to queue (sorted by priority, then time)
    let insertIndex = this.commandQueue.findIndex(
      c => c.priority < priority || (c.priority === priority && c.queuedAt > command.queuedAt)
    );
    if (insertIndex === -1) insertIndex = this.commandQueue.length;
    this.commandQueue.splice(insertIndex, 0, command);

    this.emit('commandQueued', command, insertIndex);
    return { queued: true, executed: false, queuePosition: insertIndex };
  }

  /**
   * Execute a command
   */
  private executeCommand(command: QueuedCommand): void {
    const state = this.agentStates.get(command.agentId);
    if (state && this.config.mode === TurnMode.ROUND_ROBIN) {
      state.commandsRemaining--;
      
      if (state.commandsRemaining <= 0) {
        this.nextTurn();
      }
    }

    this.emit('commandExecuted', command);
  }

  /**
   * Advance to the next turn
   */
  nextTurn(): void {
    if (this.turnOrder.length === 0) return;

    // Clear current turn
    const currentAgent = this.turnOrder[this.currentTurnIndex];
    const currentState = this.agentStates.get(currentAgent);
    if (currentState) {
      currentState.isCurrentTurn = false;
      currentState.turnsTaken++;
    }

    // Advance to next agent
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.turnOrder.length;
    this.updateCurrentTurn();

    // Reset timer for timed mode
    if (this.config.mode === TurnMode.TIMED) {
      this.startTurnTimer();
    }

    // Process queued commands for new current agent
    this.processQueue();
  }

  /**
   * Update the current turn state
   */
  private updateCurrentTurn(): void {
    const currentAgent = this.turnOrder[this.currentTurnIndex];
    const state = this.agentStates.get(currentAgent);
    if (state) {
      state.isCurrentTurn = true;
      state.commandsRemaining = this.config.commandsPerTurn;
      if (this.config.mode === TurnMode.TIMED) {
        state.timeRemainingMs = this.config.turnTimeMs;
      }
    }

    this.emit('turnChanged', currentAgent, state);
    
    // Start auto-skip timer
    if (this.config.autoSkipTimeoutMs > 0) {
      this.startSkipTimer();
    }
  }

  /**
   * Process queued commands
   */
  private processQueue(): void {
    const currentAgent = this.turnOrder[this.currentTurnIndex];
    
    // Execute queued commands for current agent
    while (this.commandQueue.length > 0) {
      const nextCmd = this.commandQueue.find(c => c.agentId === currentAgent);
      if (!nextCmd) break;

      const state = this.agentStates.get(currentAgent);
      if (this.config.mode === TurnMode.ROUND_ROBIN && state && state.commandsRemaining <= 0) {
        break;
      }

      // Remove from queue and execute
      this.commandQueue = this.commandQueue.filter(c => c.id !== nextCmd.id);
      this.executeCommand(nextCmd);
    }
  }

  /**
   * Start the turn timer (for TIMED mode)
   */
  private startTurnTimer(): void {
    this.stopTurnTimer();
    
    this.turnTimer = setTimeout(() => {
      this.emit('turnTimeout', this.turnOrder[this.currentTurnIndex]);
      this.nextTurn();
    }, this.config.turnTimeMs);
  }

  /**
   * Stop the turn timer
   */
  private stopTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  /**
   * Start the auto-skip timer
   */
  private startSkipTimer(): void {
    if (this.skipTimer) {
      clearTimeout(this.skipTimer);
    }

    this.skipTimer = setTimeout(() => {
      this.emit('agentSkipped', this.turnOrder[this.currentTurnIndex], 'timeout');
      this.nextTurn();
    }, this.config.autoSkipTimeoutMs);
  }

  /**
   * Get the current turn state
   */
  getCurrentTurnState(): { currentAgent: string | null; turnOrder: string[]; states: AgentTurnState[] } {
    return {
      currentAgent: this.turnOrder[this.currentTurnIndex] || null,
      turnOrder: [...this.turnOrder],
      states: Array.from(this.agentStates.values()),
    };
  }

  /**
   * Get state for a specific agent
   */
  getAgentTurnState(agentId: string): AgentTurnState | null {
    return this.agentStates.get(agentId) || null;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { total: number; byAgent: Map<string, number>; queue: QueuedCommand[] } {
    const byAgent = new Map<string, number>();
    for (const cmd of this.commandQueue) {
      byAgent.set(cmd.agentId, (byAgent.get(cmd.agentId) || 0) + 1);
    }
    return {
      total: this.commandQueue.length,
      byAgent,
      queue: [...this.commandQueue],
    };
  }

  /**
   * Set agent priority (for PRIORITY mode)
   */
  setAgentPriority(agentId: string, priority: number): boolean {
    const state = this.agentStates.get(agentId);
    if (!state) return false;

    state.priority = priority;

    // Re-sort turn order for PRIORITY mode
    if (this.config.mode === TurnMode.PRIORITY) {
      this.turnOrder.sort((a, b) => {
        const stateA = this.agentStates.get(a);
        const stateB = this.agentStates.get(b);
        return (stateB?.priority ?? 0) - (stateA?.priority ?? 0);
      });

      // Update order positions
      this.turnOrder.forEach((id, idx) => {
        const s = this.agentStates.get(id);
        if (s) s.orderPosition = idx;
      });
    }

    this.emit('priorityChanged', agentId, priority);
    return true;
  }

  /**
   * Check if an agent is a spectator
   */
  isSpectator(agentId: string): boolean {
    return this.spectators.has(agentId);
  }

  /**
   * Get all spectators
   */
  getSpectators(): string[] {
    return Array.from(this.spectators);
  }

  /**
   * Change turn mode
   */
  setMode(mode: TurnMode): void {
    this.config.mode = mode;
    this.emit('modeChanged', mode);

    // Reset turn state for new mode
    if (this.turnOrder.length > 0) {
      this.currentTurnIndex = 0;
      this.updateCurrentTurn();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): TurnConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TurnConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('configUpdated', this.config);
  }

  /**
   * Reset the turn manager
   */
  reset(): void {
    this.stopTurnTimer();
    if (this.skipTimer) {
      clearTimeout(this.skipTimer);
      this.skipTimer = null;
    }
    
    this.turnOrder = [];
    this.currentTurnIndex = 0;
    this.agentStates.clear();
    this.commandQueue = [];
    this.spectators.clear();
    this.commandCounter = 0;
    this.removeAllListeners();
  }
}

// Singleton instance
export const turnManager = new TurnManager();
