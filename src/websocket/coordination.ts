/**
 * Agent Coordination Protocol for Liku-AI
 * 
 * Implements Phase 3.3: Agent Coordination
 * - Inter-agent messaging
 * - Broadcast vs direct message
 * - Coordination primitives (lock, sync, barrier)
 * - Collaborative game modes support
 * 
 * @module websocket/coordination
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

/**
 * Message types for agent-to-agent communication
 */
export enum CoordinationMessageType {
  /** Direct message to specific agent */
  DIRECT = 'direct',
  /** Broadcast to all agents */
  BROADCAST = 'broadcast',
  /** Broadcast to agents in same group/team */
  TEAM = 'team',
  /** System notification */
  SYSTEM = 'system',
  /** Request/response pattern */
  REQUEST = 'request',
  /** Response to a request */
  RESPONSE = 'response',
}

/**
 * Coordination primitive types
 */
export enum PrimitiveType {
  /** Mutual exclusion lock */
  LOCK = 'lock',
  /** Synchronization point (barrier) */
  BARRIER = 'barrier',
  /** Countdown latch */
  LATCH = 'latch',
  /** Shared variable/state */
  SHARED = 'shared',
}

/**
 * A message between agents
 */
export interface AgentMessage {
  /** Unique message ID */
  id: string;
  /** Message type */
  type: CoordinationMessageType;
  /** Sender agent ID */
  from: string;
  /** Recipient agent ID (for DIRECT) or group (for TEAM) */
  to?: string;
  /** Message topic/channel */
  topic?: string;
  /** Message payload */
  payload: unknown;
  /** Timestamp */
  timestamp: number;
  /** Request ID for request/response correlation */
  requestId?: string;
  /** Time-to-live in ms (message expires after) */
  ttl?: number;
}

/**
 * Lock state
 */
export interface Lock {
  /** Lock ID */
  id: string;
  /** Lock name */
  name: string;
  /** Agent holding the lock (null if free) */
  holder: string | null;
  /** Agents waiting for the lock */
  waitQueue: string[];
  /** When lock was acquired */
  acquiredAt?: number;
  /** Max hold time in ms */
  maxHoldTime: number;
  /** Release timer */
  releaseTimer?: NodeJS.Timeout;
}

/**
 * Barrier state
 */
export interface Barrier {
  /** Barrier ID */
  id: string;
  /** Barrier name */
  name: string;
  /** Number of agents required to proceed */
  count: number;
  /** Agents currently waiting */
  waiting: Set<string>;
  /** Whether barrier has been released */
  released: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Timeout in ms (0 = no timeout) */
  timeout: number;
  /** Timeout timer */
  timeoutTimer?: NodeJS.Timeout;
}

/**
 * Shared state
 */
export interface SharedState {
  /** State ID */
  id: string;
  /** State name */
  name: string;
  /** Current value */
  value: unknown;
  /** Agent who last modified */
  lastModifiedBy: string | null;
  /** Last modification timestamp */
  lastModifiedAt: number;
  /** Version number for optimistic concurrency */
  version: number;
  /** Agents subscribed to changes */
  subscribers: Set<string>;
}

/**
 * Agent team/group
 */
export interface AgentTeam {
  /** Team ID */
  id: string;
  /** Team name */
  name: string;
  /** Member agent IDs */
  members: Set<string>;
  /** Team leader (if any) */
  leader?: string;
  /** Team metadata */
  metadata: Record<string, unknown>;
  /** Created timestamp */
  createdAt: number;
}

/**
 * Result of coordination operation
 */
export interface CoordinationResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * CoordinationManager - Manages agent-to-agent coordination
 */
export class CoordinationManager extends EventEmitter {
  private messages: AgentMessage[] = [];
  private locks: Map<string, Lock> = new Map();
  private barriers: Map<string, Barrier> = new Map();
  private sharedStates: Map<string, SharedState> = new Map();
  private teams: Map<string, AgentTeam> = new Map();
  private agentTeams: Map<string, Set<string>> = new Map(); // agentId -> teamIds
  private subscriptions: Map<string, Set<string>> = new Map(); // topic -> agentIds
  private pendingRequests: Map<string, { resolve: (msg: AgentMessage) => void; timeout: NodeJS.Timeout }> = new Map();
  
  private readonly MAX_MESSAGES = 1000;
  private readonly DEFAULT_LOCK_TIMEOUT = 30000; // 30 seconds
  private readonly DEFAULT_REQUEST_TIMEOUT = 10000; // 10 seconds

  constructor() {
    super();
  }

  // ============================================================
  // Messaging
  // ============================================================

  /**
   * Send a direct message to another agent
   */
  sendDirect(from: string, to: string, payload: unknown, topic?: string): AgentMessage {
    const message: AgentMessage = {
      id: `msg_${randomUUID()}`,
      type: CoordinationMessageType.DIRECT,
      from,
      to,
      topic,
      payload,
      timestamp: Date.now(),
    };

    this.storeMessage(message);
    this.emit('message', message);
    this.emit('directMessage', message);
    return message;
  }

  /**
   * Broadcast a message to all agents
   */
  broadcast(from: string, payload: unknown, topic?: string): AgentMessage {
    const message: AgentMessage = {
      id: `msg_${randomUUID()}`,
      type: CoordinationMessageType.BROADCAST,
      from,
      topic,
      payload,
      timestamp: Date.now(),
    };

    this.storeMessage(message);
    this.emit('message', message);
    this.emit('broadcast', message);
    return message;
  }

  /**
   * Send a message to all members of a team
   */
  sendToTeam(from: string, teamId: string, payload: unknown, topic?: string): AgentMessage | null {
    const team = this.teams.get(teamId);
    if (!team) {
      return null;
    }

    const message: AgentMessage = {
      id: `msg_${randomUUID()}`,
      type: CoordinationMessageType.TEAM,
      from,
      to: teamId,
      topic,
      payload,
      timestamp: Date.now(),
    };

    this.storeMessage(message);
    this.emit('message', message);
    this.emit('teamMessage', message, team);
    return message;
  }

  /**
   * Send a request and wait for response
   */
  async request(from: string, to: string, payload: unknown, timeoutMs: number = this.DEFAULT_REQUEST_TIMEOUT): Promise<AgentMessage> {
    const requestId = randomUUID();
    
    const message: AgentMessage = {
      id: `msg_${randomUUID()}`,
      type: CoordinationMessageType.REQUEST,
      from,
      to,
      payload,
      timestamp: Date.now(),
      requestId,
    };

    this.storeMessage(message);
    this.emit('message', message);
    this.emit('request', message);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, timeout });
    });
  }

  /**
   * Respond to a request
   */
  respond(from: string, requestId: string, payload: unknown): AgentMessage | null {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return null; // Request already resolved or timed out
    }

    const message: AgentMessage = {
      id: `msg_${randomUUID()}`,
      type: CoordinationMessageType.RESPONSE,
      from,
      payload,
      timestamp: Date.now(),
      requestId,
    };

    this.storeMessage(message);
    
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);
    pending.resolve(message);

    this.emit('message', message);
    this.emit('response', message);
    return message;
  }

  /**
   * Subscribe to a topic
   */
  subscribeTopic(agentId: string, topic: string): void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic)!.add(agentId);
    this.emit('topicSubscribed', agentId, topic);
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribeTopic(agentId: string, topic: string): void {
    const subscribers = this.subscriptions.get(topic);
    if (subscribers) {
      subscribers.delete(agentId);
      if (subscribers.size === 0) {
        this.subscriptions.delete(topic);
      }
    }
    this.emit('topicUnsubscribed', agentId, topic);
  }

  /**
   * Get subscribers for a topic
   */
  getTopicSubscribers(topic: string): string[] {
    return Array.from(this.subscriptions.get(topic) || []);
  }

  /**
   * Get messages for an agent (including broadcasts and team messages)
   */
  getMessagesFor(agentId: string, since?: number): AgentMessage[] {
    const agentTeamIds = this.agentTeams.get(agentId) || new Set();
    
    return this.messages.filter(msg => {
      // Check TTL
      if (msg.ttl && Date.now() - msg.timestamp > msg.ttl) {
        return false;
      }
      
      // Check timestamp
      if (since && msg.timestamp <= since) {
        return false;
      }

      // Direct to this agent
      if (msg.type === CoordinationMessageType.DIRECT && msg.to === agentId) {
        return true;
      }

      // Broadcast
      if (msg.type === CoordinationMessageType.BROADCAST) {
        return true;
      }

      // Team message
      if (msg.type === CoordinationMessageType.TEAM && msg.to && agentTeamIds.has(msg.to)) {
        return true;
      }

      // Response to this agent's request
      if (msg.type === CoordinationMessageType.RESPONSE) {
        // Check if original request was from this agent
        const originalRequest = this.messages.find(m => 
          m.type === CoordinationMessageType.REQUEST && 
          m.requestId === msg.requestId && 
          m.from === agentId
        );
        return !!originalRequest;
      }

      return false;
    });
  }

  private storeMessage(message: AgentMessage): void {
    this.messages.push(message);
    // Limit message history
    if (this.messages.length > this.MAX_MESSAGES) {
      this.messages = this.messages.slice(-this.MAX_MESSAGES);
    }
  }

  // ============================================================
  // Teams
  // ============================================================

  /**
   * Create a new team
   */
  createTeam(name: string, leaderId?: string, metadata?: Record<string, unknown>): AgentTeam {
    const team: AgentTeam = {
      id: `team_${randomUUID()}`,
      name,
      members: new Set(),
      leader: leaderId,
      metadata: metadata || {},
      createdAt: Date.now(),
    };

    if (leaderId) {
      team.members.add(leaderId);
      this.addAgentToTeam(leaderId, team.id);
    }

    this.teams.set(team.id, team);
    this.emit('teamCreated', team);
    return team;
  }

  /**
   * Join a team
   */
  joinTeam(agentId: string, teamId: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;

    team.members.add(agentId);
    this.addAgentToTeam(agentId, teamId);
    
    this.emit('agentJoinedTeam', agentId, team);
    return true;
  }

  /**
   * Leave a team
   */
  leaveTeam(agentId: string, teamId: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;

    team.members.delete(agentId);
    
    const agentTeamSet = this.agentTeams.get(agentId);
    if (agentTeamSet) {
      agentTeamSet.delete(teamId);
    }

    // If leader leaves, clear leader or assign new one
    if (team.leader === agentId) {
      team.leader = team.members.size > 0 ? Array.from(team.members)[0] : undefined;
    }

    this.emit('agentLeftTeam', agentId, team);
    return true;
  }

  /**
   * Get team by ID
   */
  getTeam(teamId: string): AgentTeam | null {
    return this.teams.get(teamId) || null;
  }

  /**
   * Get teams for an agent
   */
  getAgentTeams(agentId: string): AgentTeam[] {
    const teamIds = this.agentTeams.get(agentId) || new Set();
    return Array.from(teamIds)
      .map(id => this.teams.get(id))
      .filter((t): t is AgentTeam => t !== undefined);
  }

  private addAgentToTeam(agentId: string, teamId: string): void {
    if (!this.agentTeams.has(agentId)) {
      this.agentTeams.set(agentId, new Set());
    }
    this.agentTeams.get(agentId)!.add(teamId);
  }

  // ============================================================
  // Coordination Primitives
  // ============================================================

  /**
   * Acquire a named lock
   */
  async acquireLock(agentId: string, lockName: string, timeout: number = this.DEFAULT_LOCK_TIMEOUT): Promise<CoordinationResult> {
    let lock = this.locks.get(lockName);
    
    if (!lock) {
      // Create new lock
      lock = {
        id: `lock_${randomUUID()}`,
        name: lockName,
        holder: agentId,
        waitQueue: [],
        acquiredAt: Date.now(),
        maxHoldTime: timeout,
      };
      
      // Set auto-release timer
      lock.releaseTimer = setTimeout(() => {
        this.releaseLock(agentId, lockName);
      }, timeout);

      this.locks.set(lockName, lock);
      this.emit('lockAcquired', agentId, lock);
      return { success: true, data: lock };
    }

    if (lock.holder === agentId) {
      // Already holding the lock
      return { success: true, data: lock };
    }

    if (lock.holder === null) {
      // Lock is free
      lock.holder = agentId;
      lock.acquiredAt = Date.now();
      
      // Set auto-release timer
      if (lock.releaseTimer) {
        clearTimeout(lock.releaseTimer);
      }
      lock.releaseTimer = setTimeout(() => {
        this.releaseLock(agentId, lockName);
      }, timeout);

      this.emit('lockAcquired', agentId, lock);
      return { success: true, data: lock };
    }

    // Lock is held by another agent - queue
    return new Promise((resolve) => {
      lock!.waitQueue.push(agentId);
      this.emit('lockWaiting', agentId, lock);

      const waitTimeout = setTimeout(() => {
        // Remove from queue on timeout
        lock!.waitQueue = lock!.waitQueue.filter(id => id !== agentId);
        resolve({ success: false, error: 'Lock acquisition timeout' });
      }, timeout);

      // Listen for lock release
      const onRelease = (releaserId: string, releasedLock: Lock) => {
        if (releasedLock.name === lockName && lock!.waitQueue[0] === agentId) {
          clearTimeout(waitTimeout);
          this.removeListener('lockReleased', onRelease);
          
          // Grant lock to this agent
          lock!.waitQueue.shift();
          lock!.holder = agentId;
          lock!.acquiredAt = Date.now();
          
          if (lock!.releaseTimer) {
            clearTimeout(lock!.releaseTimer);
          }
          lock!.releaseTimer = setTimeout(() => {
            this.releaseLock(agentId, lockName);
          }, timeout);

          this.emit('lockAcquired', agentId, lock);
          resolve({ success: true, data: lock });
        }
      };

      this.on('lockReleased', onRelease);
    });
  }

  /**
   * Release a lock
   */
  releaseLock(agentId: string, lockName: string): CoordinationResult {
    const lock = this.locks.get(lockName);
    if (!lock) {
      return { success: false, error: 'Lock not found' };
    }

    if (lock.holder !== agentId) {
      return { success: false, error: 'Not lock holder' };
    }

    if (lock.releaseTimer) {
      clearTimeout(lock.releaseTimer);
      lock.releaseTimer = undefined;
    }

    lock.holder = null;
    lock.acquiredAt = undefined;

    this.emit('lockReleased', agentId, lock);

    // If agents are waiting, the first will acquire via event
    if (lock.waitQueue.length === 0) {
      // No waiters, remove lock
      this.locks.delete(lockName);
    }

    return { success: true };
  }

  /**
   * Check if lock is held
   */
  isLockHeld(lockName: string): { held: boolean; holder?: string } {
    const lock = this.locks.get(lockName);
    return {
      held: lock?.holder !== null && lock?.holder !== undefined,
      holder: lock?.holder ?? undefined,
    };
  }

  /**
   * Create a barrier that waits for N agents
   */
  createBarrier(name: string, count: number, timeout: number = 0): Barrier {
    const barrier: Barrier = {
      id: `barrier_${randomUUID()}`,
      name,
      count,
      waiting: new Set(),
      released: false,
      createdAt: Date.now(),
      timeout,
    };

    if (timeout > 0) {
      barrier.timeoutTimer = setTimeout(() => {
        this.releaseBarrier(name, 'timeout');
      }, timeout);
    }

    this.barriers.set(name, barrier);
    this.emit('barrierCreated', barrier);
    return barrier;
  }

  /**
   * Wait at a barrier
   */
  async waitAtBarrier(agentId: string, barrierName: string): Promise<CoordinationResult> {
    const barrier = this.barriers.get(barrierName);
    if (!barrier) {
      return { success: false, error: 'Barrier not found' };
    }

    if (barrier.released) {
      return { success: true, data: { alreadyReleased: true } };
    }

    barrier.waiting.add(agentId);
    this.emit('barrierWaiting', agentId, barrier);

    // Check if barrier should release
    if (barrier.waiting.size >= barrier.count) {
      this.releaseBarrier(barrierName, 'count_reached');
      return { success: true, data: { triggered: true } };
    }

    // Wait for release
    return new Promise((resolve) => {
      const onRelease = (releasedBarrier: Barrier, reason: string) => {
        if (releasedBarrier.name === barrierName) {
          this.removeListener('barrierReleased', onRelease);
          resolve({ success: true, data: { reason } });
        }
      };

      this.on('barrierReleased', onRelease);
    });
  }

  /**
   * Release a barrier
   */
  private releaseBarrier(name: string, reason: string): void {
    const barrier = this.barriers.get(name);
    if (!barrier || barrier.released) return;

    barrier.released = true;
    
    if (barrier.timeoutTimer) {
      clearTimeout(barrier.timeoutTimer);
      barrier.timeoutTimer = undefined;
    }

    this.emit('barrierReleased', barrier, reason);
    
    // Clean up
    setTimeout(() => {
      this.barriers.delete(name);
    }, 1000);
  }

  /**
   * Create or get shared state
   */
  createSharedState(name: string, initialValue: unknown): SharedState {
    if (this.sharedStates.has(name)) {
      return this.sharedStates.get(name)!;
    }

    const state: SharedState = {
      id: `shared_${randomUUID()}`,
      name,
      value: initialValue,
      lastModifiedBy: null,
      lastModifiedAt: Date.now(),
      version: 0,
      subscribers: new Set(),
    };

    this.sharedStates.set(name, state);
    this.emit('sharedStateCreated', state);
    return state;
  }

  /**
   * Get shared state
   */
  getSharedState(name: string): SharedState | null {
    return this.sharedStates.get(name) || null;
  }

  /**
   * Update shared state (with optimistic concurrency)
   */
  updateSharedState(
    agentId: string, 
    name: string, 
    value: unknown, 
    expectedVersion?: number
  ): CoordinationResult {
    const state = this.sharedStates.get(name);
    if (!state) {
      return { success: false, error: 'Shared state not found' };
    }

    // Check version for optimistic concurrency
    if (expectedVersion !== undefined && state.version !== expectedVersion) {
      return { 
        success: false, 
        error: 'Version conflict',
        data: { currentVersion: state.version },
      };
    }

    const previousValue = state.value;
    state.value = value;
    state.lastModifiedBy = agentId;
    state.lastModifiedAt = Date.now();
    state.version++;

    this.emit('sharedStateUpdated', state, previousValue, agentId);
    
    // Notify subscribers
    for (const subscriber of state.subscribers) {
      this.emit('sharedStateChange', subscriber, state, previousValue);
    }

    return { success: true, data: { version: state.version } };
  }

  /**
   * Subscribe to shared state changes
   */
  subscribeToSharedState(agentId: string, stateName: string): boolean {
    const state = this.sharedStates.get(stateName);
    if (!state) return false;

    state.subscribers.add(agentId);
    return true;
  }

  /**
   * Unsubscribe from shared state changes
   */
  unsubscribeFromSharedState(agentId: string, stateName: string): boolean {
    const state = this.sharedStates.get(stateName);
    if (!state) return false;

    state.subscribers.delete(agentId);
    return true;
  }

  // ============================================================
  // Cleanup
  // ============================================================

  /**
   * Remove an agent from all coordination structures
   */
  removeAgent(agentId: string): void {
    // Leave all teams
    const teamIds = this.agentTeams.get(agentId) || new Set();
    for (const teamId of teamIds) {
      this.leaveTeam(agentId, teamId);
    }
    this.agentTeams.delete(agentId);

    // Release any held locks
    for (const [name, lock] of this.locks) {
      if (lock.holder === agentId) {
        this.releaseLock(agentId, name);
      }
      // Remove from wait queue
      lock.waitQueue = lock.waitQueue.filter(id => id !== agentId);
    }

    // Remove from barriers
    for (const [, barrier] of this.barriers) {
      barrier.waiting.delete(agentId);
    }

    // Unsubscribe from topics
    for (const [topic, subscribers] of this.subscriptions) {
      subscribers.delete(agentId);
      if (subscribers.size === 0) {
        this.subscriptions.delete(topic);
      }
    }

    // Unsubscribe from shared states
    for (const [, state] of this.sharedStates) {
      state.subscribers.delete(agentId);
    }

    this.emit('agentRemoved', agentId);
  }

  /**
   * Get coordination stats
   */
  getStats(): {
    messageCount: number;
    teamCount: number;
    lockCount: number;
    barrierCount: number;
    sharedStateCount: number;
    topicCount: number;
  } {
    return {
      messageCount: this.messages.length,
      teamCount: this.teams.size,
      lockCount: this.locks.size,
      barrierCount: this.barriers.size,
      sharedStateCount: this.sharedStates.size,
      topicCount: this.subscriptions.size,
    };
  }

  /**
   * Reset all coordination state
   */
  reset(): void {
    // Clear timers
    for (const [, lock] of this.locks) {
      if (lock.releaseTimer) {
        clearTimeout(lock.releaseTimer);
      }
    }
    for (const [, barrier] of this.barriers) {
      if (barrier.timeoutTimer) {
        clearTimeout(barrier.timeoutTimer);
      }
    }
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
    }

    this.messages = [];
    this.locks.clear();
    this.barriers.clear();
    this.sharedStates.clear();
    this.teams.clear();
    this.agentTeams.clear();
    this.subscriptions.clear();
    this.pendingRequests.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
export const coordinationManager = new CoordinationManager();
