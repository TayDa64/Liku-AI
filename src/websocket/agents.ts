/**
 * Agent Identity & Management System for Liku-AI
 * 
 * Implements Phase 3.1: Agent Identity
 * - Agent authentication and identification
 * - Unique agent IDs with metadata
 * - Per-agent metrics tracking
 * - Agent roles and permissions
 * 
 * @module websocket/agents
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

/**
 * Agent roles defining capabilities
 */
export enum AgentRole {
  /** Full control - can send commands and receive state */
  PLAYER = 'player',
  /** Read-only - can receive state but not send commands */
  SPECTATOR = 'spectator',
  /** Administrative - can manage other agents */
  ADMIN = 'admin',
  /** Training mode - records actions for ML */
  TRAINER = 'trainer',
}

/**
 * Agent authentication credentials
 */
export interface AgentCredentials {
  /** Agent name (display name) */
  name: string;
  /** Optional authentication token */
  token?: string;
  /** Agent type/framework identifier */
  type?: string;
  /** Agent version string */
  version?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent session information
 */
export interface AgentSession {
  /** Unique session ID */
  sessionId: string;
  /** Agent identity */
  agent: AgentInfo;
  /** WebSocket client ID */
  clientId: string;
  /** Session start time */
  startTime: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Is session active */
  active: boolean;
}

/**
 * Full agent information
 */
export interface AgentInfo {
  /** Unique agent ID (persistent across sessions) */
  id: string;
  /** Display name */
  name: string;
  /** Agent role */
  role: AgentRole;
  /** Agent type (e.g., 'gemini', 'openai', 'custom') */
  type: string;
  /** Agent version */
  version: string;
  /** First seen timestamp */
  firstSeen: number;
  /** Total sessions */
  totalSessions: number;
  /** Custom metadata */
  metadata: Record<string, unknown>;
}

/**
 * Agent metrics for performance tracking
 */
export interface AgentMetrics {
  /** Agent ID */
  agentId: string;
  /** Total commands sent */
  commandsSent: number;
  /** Total states received */
  statesReceived: number;
  /** Total queries made */
  queriesMade: number;
  /** Average command latency (ms) */
  avgLatencyMs: number;
  /** Games played */
  gamesPlayed: number;
  /** Games won */
  gamesWon: number;
  /** High score achieved */
  highScore: number;
  /** Total playtime (ms) */
  totalPlaytimeMs: number;
  /** Commands per minute (recent) */
  commandsPerMinute: number;
  /** Error count */
  errorCount: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Agent permission check result
 */
export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * AgentManager - Manages agent identities, sessions, and metrics
 */
export class AgentManager extends EventEmitter {
  private agents: Map<string, AgentInfo> = new Map();
  private sessions: Map<string, AgentSession> = new Map();
  private clientToSession: Map<string, string> = new Map();
  private metrics: Map<string, AgentMetrics> = new Map();
  private tokens: Map<string, string> = new Map(); // token -> agentId
  
  // Rate limiting per agent
  private commandTimestamps: Map<string, number[]> = new Map();
  private readonly COMMANDS_WINDOW_MS = 60000; // 1 minute window

  constructor() {
    super();
  }

  /**
   * Register or authenticate an agent
   * Returns existing agent if token matches, creates new otherwise
   */
  registerAgent(credentials: AgentCredentials): AgentInfo {
    // Check if token maps to existing agent
    if (credentials.token && this.tokens.has(credentials.token)) {
      const agentId = this.tokens.get(credentials.token)!;
      const agent = this.agents.get(agentId);
      if (agent) {
        // Update metadata if provided
        if (credentials.metadata) {
          agent.metadata = { ...agent.metadata, ...credentials.metadata };
        }
        agent.totalSessions++;
        return agent;
      }
    }

    // Create new agent
    const agentId = `agent_${randomUUID()}`;
    const agent: AgentInfo = {
      id: agentId,
      name: credentials.name || 'Anonymous Agent',
      role: AgentRole.PLAYER, // Default role
      type: credentials.type || 'unknown',
      version: credentials.version || '1.0.0',
      firstSeen: Date.now(),
      totalSessions: 1,
      metadata: credentials.metadata || {},
    };

    this.agents.set(agentId, agent);

    // Store token mapping if provided
    if (credentials.token) {
      this.tokens.set(credentials.token, agentId);
    }

    // Initialize metrics
    this.initializeMetrics(agentId);

    this.emit('agentRegistered', agent);
    return agent;
  }

  /**
   * Create a new session for an agent
   */
  createSession(agentId: string, clientId: string): AgentSession | null {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return null;
    }

    const sessionId = `session_${randomUUID()}`;
    const session: AgentSession = {
      sessionId,
      agent,
      clientId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      active: true,
    };

    this.sessions.set(sessionId, session);
    this.clientToSession.set(clientId, sessionId);

    this.emit('sessionStarted', session);
    return session;
  }

  /**
   * End an agent session
   */
  endSession(clientId: string): AgentSession | null {
    const sessionId = this.clientToSession.get(clientId);
    if (!sessionId) {
      return null;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.active = false;
    const duration = Date.now() - session.startTime;

    // Update metrics
    const metrics = this.metrics.get(session.agent.id);
    if (metrics) {
      metrics.totalPlaytimeMs += duration;
      metrics.lastUpdated = Date.now();
    }

    this.clientToSession.delete(clientId);
    this.sessions.delete(sessionId);

    this.emit('sessionEnded', session, duration);
    return session;
  }

  /**
   * Get session by client ID
   */
  getSessionByClientId(clientId: string): AgentSession | null {
    const sessionId = this.clientToSession.get(clientId);
    if (!sessionId) {
      return null;
    }
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentInfo | null {
    return this.agents.get(agentId) || null;
  }

  /**
   * Set agent role
   */
  setAgentRole(agentId: string, role: AgentRole): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }
    
    const previousRole = agent.role;
    agent.role = role;
    
    this.emit('roleChanged', agent, previousRole, role);
    return true;
  }

  /**
   * Check if agent has permission for an action
   */
  checkPermission(agentId: string, action: 'command' | 'query' | 'subscribe' | 'admin'): PermissionCheck {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { allowed: false, reason: 'Agent not found' };
    }

    switch (action) {
      case 'command':
        if (agent.role === AgentRole.SPECTATOR) {
          return { allowed: false, reason: 'Spectators cannot send commands' };
        }
        return { allowed: true };

      case 'query':
        // All roles can query
        return { allowed: true };

      case 'subscribe':
        // All roles can subscribe
        return { allowed: true };

      case 'admin':
        if (agent.role !== AgentRole.ADMIN) {
          return { allowed: false, reason: 'Admin role required' };
        }
        return { allowed: true };

      default:
        return { allowed: false, reason: 'Unknown action' };
    }
  }

  /**
   * Initialize metrics for an agent
   */
  private initializeMetrics(agentId: string): void {
    this.metrics.set(agentId, {
      agentId,
      commandsSent: 0,
      statesReceived: 0,
      queriesMade: 0,
      avgLatencyMs: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      highScore: 0,
      totalPlaytimeMs: 0,
      commandsPerMinute: 0,
      errorCount: 0,
      lastUpdated: Date.now(),
    });
  }

  /**
   * Record a command from an agent
   */
  recordCommand(agentId: string, latencyMs?: number): void {
    const metrics = this.metrics.get(agentId);
    if (!metrics) return;

    const now = Date.now();
    metrics.commandsSent++;
    metrics.lastUpdated = now;

    // Update latency average
    if (latencyMs !== undefined) {
      const totalLatency = metrics.avgLatencyMs * (metrics.commandsSent - 1) + latencyMs;
      metrics.avgLatencyMs = totalLatency / metrics.commandsSent;
    }

    // Track for commands per minute calculation
    let timestamps = this.commandTimestamps.get(agentId) || [];
    timestamps.push(now);
    // Keep only timestamps within the window
    timestamps = timestamps.filter(t => now - t < this.COMMANDS_WINDOW_MS);
    this.commandTimestamps.set(agentId, timestamps);
    
    // Calculate commands per minute
    metrics.commandsPerMinute = timestamps.length;
  }

  /**
   * Record a state received by an agent
   */
  recordStateReceived(agentId: string): void {
    const metrics = this.metrics.get(agentId);
    if (metrics) {
      metrics.statesReceived++;
      metrics.lastUpdated = Date.now();
    }
  }

  /**
   * Record a query from an agent
   */
  recordQuery(agentId: string): void {
    const metrics = this.metrics.get(agentId);
    if (metrics) {
      metrics.queriesMade++;
      metrics.lastUpdated = Date.now();
    }
  }

  /**
   * Record a game result for an agent
   */
  recordGameResult(agentId: string, won: boolean, score: number): void {
    const metrics = this.metrics.get(agentId);
    if (metrics) {
      metrics.gamesPlayed++;
      if (won) {
        metrics.gamesWon++;
      }
      if (score > metrics.highScore) {
        metrics.highScore = score;
      }
      metrics.lastUpdated = Date.now();
    }
  }

  /**
   * Record an error for an agent
   */
  recordError(agentId: string): void {
    const metrics = this.metrics.get(agentId);
    if (metrics) {
      metrics.errorCount++;
      metrics.lastUpdated = Date.now();
    }
  }

  /**
   * Get metrics for an agent
   */
  getMetrics(agentId: string): AgentMetrics | null {
    return this.metrics.get(agentId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): AgentSession[] {
    return Array.from(this.sessions.values()).filter(s => s.active);
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by role
   */
  getAgentsByRole(role: AgentRole): AgentInfo[] {
    return Array.from(this.agents.values()).filter(a => a.role === role);
  }

  /**
   * Update agent activity timestamp
   */
  updateActivity(clientId: string): void {
    const session = this.getSessionByClientId(clientId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Get summary statistics
   */
  getStats(): {
    totalAgents: number;
    activeSessions: number;
    agentsByRole: Record<AgentRole, number>;
    totalCommands: number;
    averageLatency: number;
  } {
    const agentsByRole: Record<AgentRole, number> = {
      [AgentRole.PLAYER]: 0,
      [AgentRole.SPECTATOR]: 0,
      [AgentRole.ADMIN]: 0,
      [AgentRole.TRAINER]: 0,
    };

    let totalCommands = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    for (const agent of this.agents.values()) {
      agentsByRole[agent.role]++;
      
      const metrics = this.metrics.get(agent.id);
      if (metrics) {
        totalCommands += metrics.commandsSent;
        if (metrics.avgLatencyMs > 0) {
          totalLatency += metrics.avgLatencyMs;
          latencyCount++;
        }
      }
    }

    return {
      totalAgents: this.agents.size,
      activeSessions: this.getActiveSessions().length,
      agentsByRole,
      totalCommands,
      averageLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
    };
  }

  /**
   * Reset all data (for testing)
   */
  reset(): void {
    this.agents.clear();
    this.sessions.clear();
    this.clientToSession.clear();
    this.metrics.clear();
    this.tokens.clear();
    this.commandTimestamps.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
export const agentManager = new AgentManager();
