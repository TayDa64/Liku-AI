/**
 * Game Session Manager for Liku-AI
 * 
 * Implements AI-vs-AI and multi-player game sessions
 * - Player slot assignment (X/O for TicTacToe, White/Black for Chess)
 * - Session-scoped turn management
 * - Move validation per player slot
 * - Spectator access
 * 
 * Integrates with:
 * - AgentManager (agent identity)
 * - TurnManager (turn control per session)
 * - CoordinationManager (shared state)
 * 
 * @module websocket/sessions
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { TurnManager, TurnMode, TurnConfig } from './turns.js';
import { AgentRole } from './agents.js';

/**
 * Supported game types for sessions
 */
export type GameType = 'tictactoe' | 'chess' | 'connect4';

/**
 * Player slot identifiers per game type
 */
export type TicTacToeSlot = 'X' | 'O';
export type ChessSlot = 'white' | 'black';
export type PlayerSlot = TicTacToeSlot | ChessSlot | string;

/**
 * Game mode types
 */
export type GameMode = 'human_vs_human' | 'human_vs_ai' | 'ai_vs_ai';

/**
 * Player type
 */
export type PlayerType = 'human' | 'ai' | 'spectator';

/**
 * Player in a session
 */
export interface SessionPlayer {
  /** Agent ID (from AgentManager) */
  agentId: string;
  /** Display name */
  name: string;
  /** Player type */
  type: PlayerType;
  /** AI provider (for AI players) */
  aiProvider?: 'gemini' | 'openai' | 'anthropic' | 'local';
  /** Assigned slot (X/O, white/black) */
  slot: PlayerSlot;
  /** Is player ready */
  ready: boolean;
  /** Join timestamp */
  joinedAt: number;
}

/**
 * TicTacToe board cell
 */
export type TicTacToeCell = 'X' | 'O' | null;

/**
 * TicTacToe game-specific state
 */
export interface TicTacToeSessionState {
  board: TicTacToeCell[][];
  currentPlayer: TicTacToeSlot;
  moveCount: number;
  winner: TicTacToeSlot | 'draw' | null;
  winningLine: { row: number; col: number }[] | null;
  lastMove: { row: number; col: number; player: TicTacToeSlot } | null;
}

/**
 * Game session state (union for different game types)
 */
export type GameSessionState = TicTacToeSessionState; // Extend with | ChessSessionState etc.

/**
 * Move result
 */
export interface MoveResult {
  success: boolean;
  error?: string;
  gameOver?: boolean;
  winner?: PlayerSlot | 'draw' | null;
  nextPlayer?: PlayerSlot;
  state?: GameSessionState;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Game type */
  gameType: GameType;
  /** Game mode */
  mode: GameMode;
  /** Turn time limit (ms, 0 = no limit) */
  turnTimeMs: number;
  /** Allow spectators */
  allowSpectators: boolean;
  /** Auto-start when all players ready */
  autoStart: boolean;
  /** Starting player slot ('X', 'O', or 'random' for fair coin flip) */
  startingPlayer?: 'X' | 'O' | 'random';
  /** Randomly assign slots to players (true for fair play) */
  randomSlotAssignment?: boolean;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Game session
 */
export interface GameSession {
  /** Unique session ID */
  id: string;
  /** Session configuration */
  config: SessionConfig;
  /** Players by slot */
  players: Map<PlayerSlot, SessionPlayer>;
  /** Spectator agent IDs */
  spectators: Set<string>;
  /** Session-scoped turn manager */
  turnManager: TurnManager;
  /** Current game state */
  state: GameSessionState;
  /** Session status */
  status: 'waiting' | 'ready' | 'playing' | 'paused' | 'finished';
  /** Created timestamp */
  createdAt: number;
  /** Started timestamp */
  startedAt?: number;
  /** Ended timestamp */
  endedAt?: number;
  /** Move history */
  moveHistory: Array<{
    player: PlayerSlot;
    move: unknown;
    timestamp: number;
  }>;
}

/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  gameType: 'tictactoe',
  mode: 'ai_vs_ai',
  turnTimeMs: 30000,
  allowSpectators: true,
  autoStart: true,
};

/**
 * GameSessionManager - Manages game sessions for multi-player/AI-vs-AI games
 */
export class GameSessionManager extends EventEmitter {
  private sessions: Map<string, GameSession> = new Map();
  private agentSessions: Map<string, Set<string>> = new Map(); // agentId -> sessionIds
  private waitingQueue: Map<GameType, string[]> = new Map(); // For matchmaking

  constructor() {
    super();
  }

  /**
   * Create a new game session
   */
  createSession(config: Partial<SessionConfig> = {}): GameSession {
    const fullConfig: SessionConfig = { ...DEFAULT_SESSION_CONFIG, ...config };
    
    const turnConfig: Partial<TurnConfig> = {
      mode: TurnMode.ROUND_ROBIN,
      commandsPerTurn: 1,
      turnTimeMs: fullConfig.turnTimeMs,
      allowQueueing: false,
    };

    const session: GameSession = {
      id: `session_${randomUUID()}`,
      config: fullConfig,
      players: new Map(),
      spectators: new Set(),
      turnManager: new TurnManager(turnConfig),
      state: this.createInitialState(fullConfig.gameType, fullConfig.startingPlayer || 'random'),
      status: 'waiting',
      createdAt: Date.now(),
      moveHistory: [],
    };

    // Setup turn manager events
    this.setupTurnManagerEvents(session);

    this.sessions.set(session.id, session);
    this.emit('sessionCreated', session);

    return session;
  }

  /**
   * Create initial game state based on game type
   * @param gameType - The type of game
   * @param startingPlayer - Who starts first ('X', 'O', or 'random')
   */
  private createInitialState(gameType: GameType, startingPlayer: 'X' | 'O' | 'random' = 'random'): GameSessionState {
    // Determine starting player - use random coin flip for fairness if 'random'
    const firstPlayer: TicTacToeSlot = startingPlayer === 'random' 
      ? (Math.random() < 0.5 ? 'X' : 'O')
      : startingPlayer;
    
    switch (gameType) {
      case 'tictactoe':
        return {
          board: [
            [null, null, null],
            [null, null, null],
            [null, null, null],
          ],
          currentPlayer: firstPlayer,
          moveCount: 0,
          winner: null,
          winningLine: null,
          lastMove: null,
        };
      
      case 'chess':
      case 'connect4':
      default:
        // Placeholder - implement when needed
        return {
          board: [
            [null, null, null],
            [null, null, null],
            [null, null, null],
          ],
          currentPlayer: 'X',
          moveCount: 0,
          winner: null,
          winningLine: null,
          lastMove: null,
        };
    }
  }

  /**
   * Setup event listeners for a session's turn manager
   */
  private setupTurnManagerEvents(session: GameSession): void {
    session.turnManager.on('turnChanged', (agentId: string) => {
      // Find the player's slot
      for (const [slot, player] of session.players) {
        if (player.agentId === agentId) {
          this.emit('turnChanged', session.id, slot, agentId);
          break;
        }
      }
    });

    session.turnManager.on('turnTimeout', (agentId: string) => {
      this.emit('turnTimeout', session.id, agentId);
    });
  }

  /**
   * Join a session as a player
   */
  joinSession(
    sessionId: string,
    agentId: string,
    name: string,
    type: PlayerType,
    preferredSlot?: PlayerSlot,
    aiProvider?: 'gemini' | 'openai' | 'anthropic' | 'local'
  ): { success: boolean; slot?: PlayerSlot; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (session.status !== 'waiting') {
      return { success: false, error: 'Session already started' };
    }

    // Handle spectator
    if (type === 'spectator') {
      if (!session.config.allowSpectators) {
        return { success: false, error: 'Spectators not allowed' };
      }
      session.spectators.add(agentId);
      this.trackAgentSession(agentId, sessionId);
      this.emit('spectatorJoined', session.id, agentId);
      return { success: true };
    }

    // Determine available slots
    const slots = this.getSlotsForGameType(session.config.gameType);
    let assignedSlot: PlayerSlot | undefined;

    if (preferredSlot && slots.includes(preferredSlot) && !session.players.has(preferredSlot)) {
      assignedSlot = preferredSlot;
    } else {
      // Assign first available slot
      for (const slot of slots) {
        if (!session.players.has(slot)) {
          assignedSlot = slot;
          break;
        }
      }
    }

    if (!assignedSlot) {
      return { success: false, error: 'No available player slots' };
    }

    const player: SessionPlayer = {
      agentId,
      name,
      type,
      aiProvider,
      slot: assignedSlot,
      ready: false,
      joinedAt: Date.now(),
    };

    session.players.set(assignedSlot, player);
    this.trackAgentSession(agentId, sessionId);

    // Add to turn manager
    session.turnManager.addAgent(agentId, AgentRole.PLAYER);

    this.emit('playerJoined', session.id, player);

    // Check if session is ready to start
    if (this.isSessionReady(session) && session.config.autoStart) {
      this.startSession(sessionId);
    }

    return { success: true, slot: assignedSlot };
  }

  /**
   * Get player slots for a game type
   */
  private getSlotsForGameType(gameType: GameType): PlayerSlot[] {
    switch (gameType) {
      case 'tictactoe':
        return ['X', 'O'];
      case 'chess':
        return ['white', 'black'];
      case 'connect4':
        return ['red', 'yellow'];
      default:
        return ['player1', 'player2'];
    }
  }

  /**
   * Check if session has all required players
   */
  private isSessionReady(session: GameSession): boolean {
    const requiredSlots = this.getSlotsForGameType(session.config.gameType);
    return requiredSlots.every(slot => session.players.has(slot));
  }

  /**
   * Mark a player as ready
   */
  setPlayerReady(sessionId: string, agentId: string, ready: boolean = true): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    for (const [, player] of session.players) {
      if (player.agentId === agentId) {
        player.ready = ready;
        this.emit('playerReady', session.id, agentId, ready);

        // Check if all players ready and session should start
        if (this.areAllPlayersReady(session) && session.config.autoStart) {
          this.startSession(sessionId);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Check if all players are ready
   */
  private areAllPlayersReady(session: GameSession): boolean {
    if (!this.isSessionReady(session)) return false;
    for (const [, player] of session.players) {
      if (!player.ready) return false;
    }
    return true;
  }

  /**
   * Start a session
   */
  startSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (!this.isSessionReady(session)) {
      return false;
    }

    session.status = 'playing';
    session.startedAt = Date.now();

    // Get the first player from the session state (respects random starting player)
    const state = session.state as TicTacToeSessionState;
    const firstSlot = state.currentPlayer;
    const firstPlayer = session.players.get(firstSlot);
    if (firstPlayer) {
      // Trigger turn for first player
      this.emit('gameStarted', session.id, session.state);
      this.emit('turnChanged', session.id, firstSlot, firstPlayer.agentId);
    }

    return true;
  }

  /**
   * Get the slot that goes first (legacy method - kept for compatibility)
   * Note: For fair play, use session.state.currentPlayer instead
   */
  private getFirstPlayerSlot(gameType: GameType): PlayerSlot {
    switch (gameType) {
      case 'tictactoe':
        return 'X';
      case 'chess':
        return 'white';
      default:
        return 'X';
    }
  }

  /**
   * Submit a move
   */
  submitMove(
    sessionId: string,
    agentId: string,
    move: { row: number; col: number }
  ): MoveResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (session.status !== 'playing') {
      return { success: false, error: 'Game not in progress' };
    }

    // Find player by agentId
    let playerSlot: PlayerSlot | undefined;
    for (const [slot, player] of session.players) {
      if (player.agentId === agentId) {
        playerSlot = slot;
        break;
      }
    }

    if (!playerSlot) {
      return { success: false, error: 'Agent not a player in this session' };
    }

    // Validate it's this player's turn
    const state = session.state as TicTacToeSessionState;
    if (state.currentPlayer !== playerSlot) {
      return { success: false, error: 'Not your turn' };
    }

    // Validate the move
    const { row, col } = move;
    if (row < 0 || row > 2 || col < 0 || col > 2) {
      return { success: false, error: 'Invalid position' };
    }

    if (state.board[row][col] !== null) {
      return { success: false, error: 'Cell already occupied' };
    }

    // Apply the move
    state.board[row][col] = playerSlot as TicTacToeSlot;
    state.moveCount++;
    state.lastMove = { row, col, player: playerSlot as TicTacToeSlot };

    // Record in history
    session.moveHistory.push({
      player: playerSlot,
      move: { row, col },
      timestamp: Date.now(),
    });

    // Check for win
    const winResult = this.checkTicTacToeWin(state.board);
    if (winResult.winner) {
      state.winner = winResult.winner;
      state.winningLine = winResult.line;
      session.status = 'finished';
      session.endedAt = Date.now();

      this.emit('gameEnded', session.id, {
        winner: winResult.winner,
        winningLine: winResult.line,
        state: state,
      });

      return {
        success: true,
        gameOver: true,
        winner: winResult.winner,
        state: state,
      };
    }

    // Check for draw
    if (state.moveCount >= 9) {
      state.winner = 'draw';
      session.status = 'finished';
      session.endedAt = Date.now();

      this.emit('gameEnded', session.id, {
        winner: 'draw',
        state: state,
      });

      return {
        success: true,
        gameOver: true,
        winner: 'draw',
        state: state,
      };
    }

    // Switch turns
    state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
    const nextPlayer = session.players.get(state.currentPlayer);

    this.emit('moveMade', session.id, {
      player: playerSlot,
      move: { row, col },
      state: state,
    });

    if (nextPlayer) {
      // Advance turn in turn manager
      session.turnManager.nextTurn();
      this.emit('turnChanged', session.id, state.currentPlayer, nextPlayer.agentId);
    }

    return {
      success: true,
      gameOver: false,
      nextPlayer: state.currentPlayer,
      state: state,
    };
  }

  /**
   * Check for TicTacToe win
   */
  private checkTicTacToeWin(board: TicTacToeCell[][]): {
    winner: TicTacToeSlot | null;
    line: { row: number; col: number }[] | null;
  } {
    const lines = [
      // Rows
      [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
      [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
      [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
      // Columns
      [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }],
      [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
      [{ row: 0, col: 2 }, { row: 1, col: 2 }, { row: 2, col: 2 }],
      // Diagonals
      [{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
      [{ row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 0 }],
    ];

    for (const line of lines) {
      const [a, b, c] = line;
      const cellA = board[a.row][a.col];
      const cellB = board[b.row][b.col];
      const cellC = board[c.row][c.col];

      if (cellA && cellA === cellB && cellB === cellC) {
        return { winner: cellA, line };
      }
    }

    return { winner: null, line: null };
  }

  /**
   * Get valid moves for current state
   */
  getValidMoves(sessionId: string): { row: number; col: number }[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const state = session.state as TicTacToeSessionState;
    const moves: { row: number; col: number }[] = [];

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (state.board[row][col] === null) {
          moves.push({ row, col });
        }
      }
    }

    return moves;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): GameSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get sessions for an agent
   */
  getAgentSessions(agentId: string): GameSession[] {
    const sessionIds = this.agentSessions.get(agentId) || new Set();
    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is GameSession => s !== undefined);
  }

  /**
   * Track agent's session membership
   */
  private trackAgentSession(agentId: string, sessionId: string): void {
    if (!this.agentSessions.has(agentId)) {
      this.agentSessions.set(agentId, new Set());
    }
    this.agentSessions.get(agentId)!.add(sessionId);
  }

  /**
   * Leave a session
   */
  leaveSession(sessionId: string, agentId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Remove from spectators
    if (session.spectators.has(agentId)) {
      session.spectators.delete(agentId);
      this.emit('spectatorLeft', session.id, agentId);
    }

    // Remove from players
    for (const [slot, player] of session.players) {
      if (player.agentId === agentId) {
        session.players.delete(slot);
        session.turnManager.removeAgent(agentId);
        
        // If game was in progress, forfeit
        if (session.status === 'playing') {
          const otherSlot = slot === 'X' ? 'O' : 'X';
          const state = session.state as TicTacToeSessionState;
          state.winner = otherSlot as TicTacToeSlot;
          session.status = 'finished';
          session.endedAt = Date.now();

          this.emit('playerForfeited', session.id, agentId, slot);
          this.emit('gameEnded', session.id, {
            winner: otherSlot,
            reason: 'forfeit',
            state: state,
          });
        }

        this.emit('playerLeft', session.id, agentId, slot);
        break;
      }
    }

    // Clean up tracking
    const agentSessionSet = this.agentSessions.get(agentId);
    if (agentSessionSet) {
      agentSessionSet.delete(sessionId);
    }

    return true;
  }

  /**
   * Forfeit a game
   */
  forfeit(sessionId: string, agentId: string): boolean {
    return this.leaveSession(sessionId, agentId);
  }

  /**
   * Get session state for an agent (may include AI hints)
   */
  getStateForAgent(sessionId: string, agentId: string): {
    state: GameSessionState;
    isYourTurn: boolean;
    yourSlot: PlayerSlot | null;
    validMoves: { row: number; col: number }[];
    minimax?: { bestMove: { row: number; col: number }; score: number };
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Find agent's slot
    let yourSlot: PlayerSlot | null = null;
    for (const [slot, player] of session.players) {
      if (player.agentId === agentId) {
        yourSlot = slot;
        break;
      }
    }

    const state = session.state as TicTacToeSessionState;
    const isYourTurn = yourSlot === state.currentPlayer;
    const validMoves = this.getValidMoves(sessionId);

    // Calculate minimax hint if it's agent's turn
    let minimax: { bestMove: { row: number; col: number }; score: number } | undefined;
    if (isYourTurn && validMoves.length > 0) {
      minimax = this.calculateBestMove(state, yourSlot as TicTacToeSlot);
    }

    return {
      state,
      isYourTurn,
      yourSlot,
      validMoves,
      minimax,
    };
  }

  /**
   * Calculate best move using minimax
   */
  private calculateBestMove(
    state: TicTacToeSessionState,
    player: TicTacToeSlot
  ): { bestMove: { row: number; col: number }; score: number } {
    const opponent = player === 'X' ? 'O' : 'X';
    
    const minimax = (
      board: TicTacToeCell[][],
      depth: number,
      isMaximizing: boolean
    ): number => {
      const result = this.checkTicTacToeWin(board);
      if (result.winner === player) return 10 - depth;
      if (result.winner === opponent) return depth - 10;
      
      // Check for draw
      let hasEmpty = false;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (board[r][c] === null) hasEmpty = true;
        }
      }
      if (!hasEmpty) return 0;

      if (isMaximizing) {
        let best = -Infinity;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            if (board[r][c] === null) {
              board[r][c] = player;
              best = Math.max(best, minimax(board, depth + 1, false));
              board[r][c] = null;
            }
          }
        }
        return best;
      } else {
        let best = Infinity;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            if (board[r][c] === null) {
              board[r][c] = opponent;
              best = Math.min(best, minimax(board, depth + 1, true));
              board[r][c] = null;
            }
          }
        }
        return best;
      }
    };

    // Clone board
    const board = state.board.map(row => [...row]);
    
    let bestScore = -Infinity;
    let bestMove = { row: 0, col: 0 };

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (board[r][c] === null) {
          board[r][c] = player;
          const score = minimax(board, 0, false);
          board[r][c] = null;

          if (score > bestScore) {
            bestScore = score;
            bestMove = { row: r, col: c };
          }
        }
      }
    }

    return { bestMove, score: bestScore };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): GameSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.status === 'waiting' || s.status === 'playing'
    );
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    playingSessions: number;
    waitingSessions: number;
  } {
    const sessions = Array.from(this.sessions.values());
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status !== 'finished').length,
      playingSessions: sessions.filter(s => s.status === 'playing').length,
      waitingSessions: sessions.filter(s => s.status === 'waiting').length,
    };
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (session.status === 'finished' && session.endedAt) {
        if (now - session.endedAt > maxAgeMs) {
          this.sessions.delete(id);
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  /**
   * Reset manager
   */
  reset(): void {
    for (const [, session] of this.sessions) {
      session.turnManager.reset();
    }
    this.sessions.clear();
    this.agentSessions.clear();
    this.waitingQueue.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
export const gameSessionManager = new GameSessionManager();
