/**
 * Liku-AI Matchmaking System
 * 
 * Enables two AI models from separate chat windows to discover
 * each other and play games via a simple handshake protocol.
 * 
 * Protocol Flow:
 * ═══════════════════════════════════════════════════════════════
 * 
 * AGENT 1 (Host/Creator)              SERVER                AGENT 2 (Joiner)
 *     │                                  │                        │
 *     │─── connect() ──────────────────►│                        │
 *     │◄── welcome + agentId ───────────│                        │
 *     │                                  │                        │
 *     │─── host_game(tictactoe) ───────►│                        │
 *     │◄── matchCode: "LIKU-A1B2" ──────│                        │
 *     │                                  │                        │
 *     │    [Agent 1 shares matchCode    │                        │
 *     │     with Agent 2 via user]      │                        │
 *     │                                  │                        │
 *     │                                  │◄─── connect() ─────────│
 *     │                                  │──── welcome + agentId ►│
 *     │                                  │                        │
 *     │                                  │◄── join_match(LIKU-A1B2)│
 *     │◄── opponent_found ──────────────│──── opponent_found ────►│
 *     │                                  │                        │
 *     │◄── game_start ──────────────────│──── game_start ────────►│
 *     │                                  │                        │
 *     │◄──────── [Game Session] ────────┼────────────────────────►│
 * 
 * @module websocket/matchmaking
 */

import { EventEmitter } from 'events';

// Match code format: LIKU-XXXX (4 alphanumeric chars)
const MATCH_CODE_LENGTH = 4;
const MATCH_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion

export interface MatchRequest {
  matchCode: string;
  hostAgentId: string;
  hostName: string;
  gameType: string;
  createdAt: number;
  expiresAt: number;
  status: 'waiting' | 'matched' | 'expired' | 'cancelled';
  guestAgentId?: string;
  guestName?: string;
  sessionId?: string;
}

export interface MatchmakingConfig {
  matchCodeTTL: number;      // How long match codes are valid (ms)
  maxPendingMatches: number; // Max pending matches per agent
  cleanupInterval: number;   // How often to clean expired matches (ms)
}

const DEFAULT_CONFIG: MatchmakingConfig = {
  matchCodeTTL: 5 * 60 * 1000,     // 5 minutes
  maxPendingMatches: 3,
  cleanupInterval: 30 * 1000,      // 30 seconds
};

/**
 * Generates a human-readable match code
 * Format: LIKU-XXXX where X is alphanumeric (no confusing chars)
 */
function generateMatchCode(): string {
  let code = '';
  for (let i = 0; i < MATCH_CODE_LENGTH; i++) {
    code += MATCH_CODE_CHARS[Math.floor(Math.random() * MATCH_CODE_CHARS.length)];
  }
  return `LIKU-${code}`;
}

/**
 * Validates match code format
 */
function isValidMatchCode(code: string): boolean {
  return /^LIKU-[A-HJ-NP-Z2-9]{4}$/i.test(code);
}

/**
 * MatchmakingManager handles discovery and pairing of AI agents
 * for multiplayer game sessions.
 */
export class MatchmakingManager extends EventEmitter {
  private matches: Map<string, MatchRequest> = new Map();
  private agentMatches: Map<string, Set<string>> = new Map(); // agentId -> matchCodes
  private config: MatchmakingConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<MatchmakingConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanup();
  }

  /**
   * Host creates a new match and receives a code to share
   */
  hostGame(agentId: string, agentName: string, gameType: string): MatchRequest {
    // Check max pending matches
    const agentPending = this.agentMatches.get(agentId) || new Set();
    if (agentPending.size >= this.config.maxPendingMatches) {
      throw new Error(`Maximum pending matches (${this.config.maxPendingMatches}) reached`);
    }

    // Generate unique match code
    let matchCode: string;
    let attempts = 0;
    do {
      matchCode = generateMatchCode();
      attempts++;
      if (attempts > 100) {
        throw new Error('Failed to generate unique match code');
      }
    } while (this.matches.has(matchCode));

    const now = Date.now();
    const match: MatchRequest = {
      matchCode,
      hostAgentId: agentId,
      hostName: agentName,
      gameType,
      createdAt: now,
      expiresAt: now + this.config.matchCodeTTL,
      status: 'waiting',
    };

    this.matches.set(matchCode, match);
    
    // Track agent's matches
    if (!this.agentMatches.has(agentId)) {
      this.agentMatches.set(agentId, new Set());
    }
    this.agentMatches.get(agentId)!.add(matchCode);

    this.emit('matchCreated', match);
    return match;
  }

  /**
   * Guest joins a match using the shared code
   */
  joinMatch(
    matchCode: string,
    guestAgentId: string,
    guestName: string
  ): MatchRequest {
    const normalizedCode = matchCode.toUpperCase().trim();
    
    if (!isValidMatchCode(normalizedCode)) {
      throw new Error('Invalid match code format. Expected: LIKU-XXXX');
    }

    const match = this.matches.get(normalizedCode);
    
    if (!match) {
      throw new Error('Match not found. The code may have expired or been cancelled.');
    }

    if (match.status !== 'waiting') {
      throw new Error(`Match is no longer available (status: ${match.status})`);
    }

    if (Date.now() > match.expiresAt) {
      match.status = 'expired';
      throw new Error('Match code has expired');
    }

    if (match.hostAgentId === guestAgentId) {
      throw new Error('Cannot join your own match');
    }

    // Update match with guest info
    match.guestAgentId = guestAgentId;
    match.guestName = guestName;
    match.status = 'matched';

    this.emit('matchFound', match);
    
    // Clean up the match after successful pairing (free up agent's slot)
    this.cleanup(normalizedCode);
    
    return match;
  }

  /**
   * Cancel a pending match
   */
  cancelMatch(matchCode: string, agentId: string): boolean {
    const match = this.matches.get(matchCode);
    
    if (!match) {
      return false;
    }

    if (match.hostAgentId !== agentId) {
      throw new Error('Only the host can cancel a match');
    }

    if (match.status !== 'waiting') {
      throw new Error('Can only cancel waiting matches');
    }

    match.status = 'cancelled';
    this.cleanup(matchCode);
    
    this.emit('matchCancelled', match);
    return true;
  }

  /**
   * Associate a game session with a match
   */
  setSessionId(matchCode: string, sessionId: string): void {
    const match = this.matches.get(matchCode);
    if (match) {
      match.sessionId = sessionId;
    }
  }

  /**
   * Get match by code
   */
  getMatch(matchCode: string): MatchRequest | undefined {
    return this.matches.get(matchCode.toUpperCase());
  }

  /**
   * Get all pending matches for an agent
   */
  getAgentMatches(agentId: string): MatchRequest[] {
    const codes = this.agentMatches.get(agentId) || new Set();
    return Array.from(codes)
      .map(code => this.matches.get(code))
      .filter((m): m is MatchRequest => m !== undefined && m.status === 'waiting');
  }

  /**
   * List all waiting matches (for lobby/discovery)
   */
  listWaitingMatches(): MatchRequest[] {
    return Array.from(this.matches.values())
      .filter(m => m.status === 'waiting' && Date.now() < m.expiresAt);
  }

  /**
   * Clean up a specific match
   */
  private cleanup(matchCode: string): void {
    const match = this.matches.get(matchCode);
    if (match) {
      this.matches.delete(matchCode);
      const hostMatches = this.agentMatches.get(match.hostAgentId);
      if (hostMatches) {
        hostMatches.delete(matchCode);
        if (hostMatches.size === 0) {
          this.agentMatches.delete(match.hostAgentId);
        }
      }
    }
  }

  /**
   * Start periodic cleanup of expired matches
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [code, match] of this.matches) {
        if (now > match.expiresAt || match.status === 'cancelled') {
          if (match.status === 'waiting') {
            match.status = 'expired';
            this.emit('matchExpired', match);
          }
          this.cleanup(code);
        }
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Stop cleanup timer
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Get stats
   */
  getStats(): { waiting: number; matched: number; total: number } {
    let waiting = 0;
    let matched = 0;
    for (const match of this.matches.values()) {
      if (match.status === 'waiting') waiting++;
      if (match.status === 'matched') matched++;
    }
    return { waiting, matched, total: this.matches.size };
  }
}

// Singleton instance
let matchmakingManager: MatchmakingManager | null = null;

export function getMatchmakingManager(): MatchmakingManager {
  if (!matchmakingManager) {
    matchmakingManager = new MatchmakingManager();
  }
  return matchmakingManager;
}

export function resetMatchmakingManager(): void {
  if (matchmakingManager) {
    matchmakingManager.stop();
    matchmakingManager = null;
  }
}

/**
 * Protocol message types for matchmaking
 */
export interface MatchmakingMessages {
  // Host creates a match
  host_game: {
    type: 'action';
    payload: {
      action: 'host_game';
      gameType: string;
      name?: string;
    };
  };

  // Host receives match code
  host_game_response: {
    type: 'ack';
    data: {
      action: 'host_game';
      matchCode: string;
      expiresIn: number;
      gameType: string;
      instructions: string;
    };
  };

  // Guest joins with code
  join_match: {
    type: 'action';
    payload: {
      action: 'join_match';
      matchCode: string;
      name?: string;
    };
  };

  // Both receive when matched
  opponent_found: {
    type: 'event';
    data: {
      event: 'opponent_found';
      matchCode: string;
      gameType: string;
      opponent: {
        name: string;
        agentId: string;
      };
      yourRole: 'host' | 'guest';
      sessionId: string;
    };
  };

  // Cancel a pending match
  cancel_match: {
    type: 'action';
    payload: {
      action: 'cancel_match';
      matchCode: string;
    };
  };

  // List waiting matches
  list_matches: {
    type: 'action';
    payload: {
      action: 'list_matches';
    };
  };
}

/**
 * Instructions template for sharing match code
 */
export function getMatchInstructions(matchCode: string, gameType: string): string {
  return `
╔══════════════════════════════════════════════════════════════╗
║                    🎮 MATCH CODE READY!                      ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║   Share this code with your opponent:                        ║
║                                                              ║
║              ┌────────────────────┐                          ║
║              │    ${matchCode}     │                          ║
║              └────────────────────┘                          ║
║                                                              ║
║   Game: ${gameType.padEnd(45)}║
║                                                              ║
║   Your opponent should run:                                  ║
║   ─────────────────────────────────────────────────────────  ║
║   In their chat window, tell Copilot:                        ║
║                                                              ║
║   "Join the Liku game with code ${matchCode}"                ║
║                                                              ║
║   Or use the tool directly:                                  ║
║   action: join_match, matchCode: "${matchCode}"              ║
║                                                              ║
║   Code expires in 5 minutes.                                 ║
╚══════════════════════════════════════════════════════════════╝
`;
}
