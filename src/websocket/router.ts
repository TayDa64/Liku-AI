/**
 * Command Router for Liku-AI WebSocket Server
 * 
 * Maps incoming WebSocket commands to game actions with:
 * - Rate limiting to prevent spam
 * - Input validation and sanitization
 * - Action-level and key-level command support
 * - Per-client command tracking
 * - Matchmaking for cross-chat AI pairing
 * 
 * @module websocket/router
 */

import { EventEmitter } from 'events';
import type { AICommand, AIResponse } from './server.js';
import { stateManager } from './state.js';
import { 
  GameSessionManager, 
  gameSessionManager as defaultSessionManager,
  GameType,
  GameMode,
  PlayerType,
  PlayerSlot,
  SessionConfig,
} from './sessions.js';
import { 
  MatchmakingManager, 
  getMatchmakingManager,
  getMatchInstructions,
  MatchRequest,
} from './matchmaking.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxCommandsPerSecond: number;
  maxBurstCommands: number;
  cooldownMs: number;
  banDurationMs: number;
  maxBansBeforePermanent: number;
}

/**
 * Client tracking for rate limiting
 */
interface ClientState {
  commandCount: number;
  windowStart: number;
  burstCount: number;
  lastCommand: number;
  banCount: number;
  bannedUntil: number;
  isBanned: boolean;
}

/**
 * High-level game actions
 */
export type GameAction = 
  // Dino actions
  | 'jump'
  | 'duck'
  // Snake actions
  | 'turn_left'
  | 'turn_right'
  | 'turn_up'
  | 'turn_down'
  | 'go_straight'
  // TicTacToe actions
  | 'place_mark'
  | 'select_cell'
  // Chess actions
  | 'chess_move'      // Make a chess move (e.g., e4, Nf3, O-O)
  | 'chess_resign'    // Resign the game
  | 'chess_draw_offer'// Offer a draw
  | 'chess_draw_accept' // Accept a draw offer
  | 'chess_draw_decline' // Decline a draw offer
  | 'chess_undo_request' // Request to undo last move
  | 'chess_undo_accept'  // Accept undo request
  | 'chess_undo_decline' // Decline undo request
  | 'chess_get_moves'    // Get legal moves for a piece/position
  | 'chess_get_hint'     // Request AI hint for best move
  // Session actions (AI-vs-AI)
  | 'game_create'
  | 'game_join'
  | 'game_move'
  | 'game_forfeit'
  | 'game_ready'
  | 'game_spectate'
  | 'send_chat'  // Pre-game and in-game chat between players
  | 'request_rematch' // Request to play again after game ends
  // Matchmaking actions (cross-chat AI pairing)
  | 'host_game'
  | 'join_match'
  | 'cancel_match'
  | 'list_matches'
  | 'spectate_match'
  // Universal actions
  | 'start'
  | 'restart'
  | 'pause'
  | 'quit'
  | 'confirm'
  | 'cancel'
  | 'menu_up'
  | 'menu_down'
  | 'menu_select';

/**
 * Valid keyboard keys for direct key commands
 */
export type ValidKey = 
  | 'up' | 'down' | 'left' | 'right'
  | 'space' | 'enter' | 'escape'
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
  | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z'
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/**
 * Query types supported by the router
 */
export type QueryType = 
  | 'gameState'
  | 'possibleActions'
  | 'history'
  | 'stats'
  | 'leaderboard'
  | 'serverInfo'
  | 'clientInfo';

/**
 * Action mapping to key sequences
 */
const ACTION_TO_KEYS: Record<GameAction, ValidKey[]> = {
  // Dino
  jump: ['space'],
  duck: ['down'],
  // Snake
  turn_left: ['left'],
  turn_right: ['right'],
  turn_up: ['up'],
  turn_down: ['down'],
  go_straight: [], // No-op
  // TicTacToe
  place_mark: ['enter'],
  select_cell: ['enter'],
  // Chess actions (no key mappings - handled separately)
  chess_move: [],
  chess_resign: [],
  chess_draw_offer: [],
  chess_draw_accept: [],
  chess_draw_decline: [],
  chess_undo_request: [],
  chess_undo_accept: [],
  chess_undo_decline: [],
  chess_get_moves: [],
  chess_get_hint: [],
  // Session actions (no key mappings - handled separately)
  game_create: [],
  game_join: [],
  game_move: [],
  game_forfeit: [],
  game_ready: [],
  game_spectate: [],
  send_chat: [],  // Chat action - no key mapping
  request_rematch: [], // Rematch action - no key mapping
  // Matchmaking actions (no key mappings - handled separately)
  host_game: [],
  join_match: [],
  cancel_match: [],
  list_matches: [],
  spectate_match: [],
  // Universal
  start: ['enter'],
  restart: ['enter'],
  pause: ['escape'],
  quit: ['q'],
  confirm: ['enter'],
  cancel: ['escape'],
  menu_up: ['up'],
  menu_down: ['down'],
  menu_select: ['enter'],
};

/**
 * Valid keys set for fast lookup
 */
const VALID_KEYS = new Set<string>([
  'up', 'down', 'left', 'right',
  'space', 'enter', 'escape',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
]);

/**
 * Valid actions set for fast lookup
 */
const VALID_ACTIONS = new Set<string>(Object.keys(ACTION_TO_KEYS));

/**
 * CommandRouter - Routes and validates WebSocket commands
 * 
 * Events:
 * - 'key': (key: ValidKey, clientId: string) - Key press to execute
 * - 'action': (action: GameAction, clientId: string) - Action to execute
 * - 'query': (query: QueryType, clientId: string, callback: (result: unknown) => void)
 * - 'error': (error: Error, clientId: string)
 * - 'rateLimit': (clientId: string, reason: string)
 * - 'ban': (clientId: string, duration: number)
 */
export class CommandRouter extends EventEmitter {
  private clients: Map<string, ClientState> = new Map();
  private config: RateLimitConfig;
  private commandLog: Array<{ clientId: string; command: string; timestamp: number }> = [];
  private maxLogSize = 1000;
  private sessionManager: GameSessionManager;

  constructor(config?: Partial<RateLimitConfig>, sessionManager?: GameSessionManager) {
    super();
    this.config = {
      maxCommandsPerSecond: config?.maxCommandsPerSecond ?? 30,
      maxBurstCommands: config?.maxBurstCommands ?? 10,
      cooldownMs: config?.cooldownMs ?? 30,
      banDurationMs: config?.banDurationMs ?? 30000,
      maxBansBeforePermanent: config?.maxBansBeforePermanent ?? 3,
    };
    this.sessionManager = sessionManager ?? defaultSessionManager;
  }

  /**
   * Route an incoming command from a client
   * Returns a response to send back to the client
   */
  route(clientId: string, command: AICommand): AIResponse {
    const now = Date.now();

    // Initialize or get client state
    if (!this.clients.has(clientId)) {
      this.clients.set(clientId, {
        commandCount: 0,
        windowStart: now,
        burstCount: 0,
        lastCommand: 0,
        banCount: 0,
        bannedUntil: 0,
        isBanned: false,
      });
    }

    const client = this.clients.get(clientId)!;

    // Check if client is banned
    if (client.isBanned) {
      if (now < client.bannedUntil) {
        const remainingMs = client.bannedUntil - now;
        return this.errorResponse(
          `Rate limited. Try again in ${Math.ceil(remainingMs / 1000)} seconds.`,
          command.requestId
        );
      } else {
        // Ban expired
        client.isBanned = false;
      }
    }

    // Rate limiting: sliding window
    if (now - client.windowStart >= 1000) {
      client.windowStart = now;
      client.commandCount = 0;
    }

    // Check rate limit
    if (client.commandCount >= this.config.maxCommandsPerSecond) {
      this.handleRateLimitViolation(clientId, client, 'Commands per second exceeded');
      return this.errorResponse('Rate limit exceeded', command.requestId);
    }

    // Check burst limit (commands too close together)
    if (now - client.lastCommand < this.config.cooldownMs) {
      client.burstCount++;
      if (client.burstCount >= this.config.maxBurstCommands) {
        this.handleRateLimitViolation(clientId, client, 'Burst limit exceeded');
        return this.errorResponse('Too many commands too fast', command.requestId);
      }
    } else {
      client.burstCount = 0;
    }

    // Update tracking
    client.commandCount++;
    client.lastCommand = now;

    // Log command
    this.logCommand(clientId, command);

    // Route based on command type
    try {
      switch (command.type) {
        case 'key':
          return this.handleKeyCommand(clientId, command);
        case 'action':
          return this.handleActionCommand(clientId, command);
        case 'query':
          return this.handleQueryCommand(clientId, command);
        default:
          return this.errorResponse(`Unknown command type: ${command.type}`, command.requestId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.emit('error', new Error(message), clientId);
      return this.errorResponse(message, command.requestId);
    }
  }

  /**
   * Handle a key command
   */
  private handleKeyCommand(clientId: string, command: AICommand): AIResponse {
    const key = command.payload.key?.toLowerCase();

    if (!key) {
      return this.errorResponse('Key is required', command.requestId);
    }

    // Sanitize and validate key
    const sanitizedKey = this.sanitizeInput(key);
    
    if (!VALID_KEYS.has(sanitizedKey)) {
      return this.errorResponse(`Invalid key: ${key}`, command.requestId);
    }

    // Emit key event for game to handle
    this.emit('key', sanitizedKey as ValidKey, clientId);

    return {
      type: 'ack',
      requestId: command.requestId,
      data: { 
        executed: true, 
        key: sanitizedKey,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Handle an action command
   */
  private handleActionCommand(clientId: string, command: AICommand): AIResponse {
    const action = command.payload.action?.toLowerCase();

    if (!action) {
      return this.errorResponse('Action is required', command.requestId);
    }

    // Sanitize and validate action
    const sanitizedAction = this.sanitizeInput(action);

    if (!VALID_ACTIONS.has(sanitizedAction)) {
      return this.errorResponse(
        `Invalid action: ${action}. Valid actions: ${Array.from(VALID_ACTIONS).join(', ')}`,
        command.requestId
      );
    }

    const gameAction = sanitizedAction as GameAction;

    // Handle session actions separately (AI-vs-AI game management)
    if (this.isSessionAction(gameAction)) {
      return this.handleSessionAction(clientId, gameAction, command);
    }

    // Handle chess actions (chess-specific commands)
    if (this.isChessAction(gameAction)) {
      return this.handleChessAction(clientId, gameAction, command);
    }

    // Handle matchmaking actions (cross-chat AI pairing)
    if (this.isMatchmakingAction(gameAction)) {
      return this.handleMatchmakingAction(clientId, gameAction, command);
    }

    const keys = ACTION_TO_KEYS[gameAction];

    // Emit action event
    this.emit('action', gameAction, clientId);

    // Also emit corresponding keys
    for (const key of keys) {
      this.emit('key', key, clientId);
    }

    return {
      type: 'ack',
      requestId: command.requestId,
      data: {
        executed: true,
        action: gameAction,
        mappedKeys: keys,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Check if action is a session action
   */
  private isSessionAction(action: GameAction): boolean {
    return action.startsWith('game_') || action === 'send_chat' || action === 'request_rematch';
  }

  /**
   * Check if action is a chess action
   */
  private isChessAction(action: GameAction): boolean {
    return action.startsWith('chess_');
  }

  /**
   * Check if action is a matchmaking action
   */
  private isMatchmakingAction(action: GameAction): boolean {
    return ['host_game', 'join_match', 'cancel_match', 'list_matches'].includes(action);
  }

  /**
   * Handle session-related actions (AI-vs-AI games)
   */
  private handleSessionAction(clientId: string, action: GameAction, command: AICommand): AIResponse {
    const payload = command.payload;

    switch (action) {
      case 'game_create': {
        const config: Partial<SessionConfig> = {
          gameType: (payload.gameType as GameType) || 'tictactoe',
          mode: (payload.mode as GameMode) || 'ai_vs_ai',
          turnTimeMs: payload.turnTimeMs ?? 30000,
          allowSpectators: payload.allowSpectators ?? true,
        };

        const session = this.sessionManager.createSession(config);

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'game_create',
            sessionId: session.id,
            config: session.config,
            status: session.status,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'game_join': {
        const sessionId = payload.sessionId as string;
        if (!sessionId) {
          return this.errorResponse('sessionId is required', command.requestId);
        }

        const name = (payload.name as string) || `Agent_${clientId.slice(0, 8)}`;
        const type = (payload.playerType as PlayerType) || 'ai';
        const preferredSlot = payload.slot as PlayerSlot | undefined;
        const aiProvider = payload.aiProvider as 'gemini' | 'openai' | 'anthropic' | 'local' | undefined;

        const result = this.sessionManager.joinSession(
          sessionId,
          clientId,
          name,
          type,
          preferredSlot,
          aiProvider
        );

        if (!result.success) {
          return this.errorResponse(result.error || 'Failed to join session', command.requestId);
        }

        const session = this.sessionManager.getSession(sessionId);

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'game_join',
            sessionId,
            slot: result.slot,
            status: session?.status,
            players: session ? [...session.players.entries()].map(([slot, p]) => ({
              slot,
              name: p.name,
              type: p.type,
              ready: p.ready,
            })) : [],
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'game_ready': {
        const sessionId = payload.sessionId as string;
        if (!sessionId) {
          return this.errorResponse('sessionId is required', command.requestId);
        }

        const ready = payload.ready !== false;
        const success = this.sessionManager.setPlayerReady(sessionId, clientId, ready);

        if (!success) {
          return this.errorResponse('Failed to set ready status', command.requestId);
        }

        const session = this.sessionManager.getSession(sessionId);

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'game_ready',
            sessionId,
            ready,
            status: session?.status,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'send_chat': {
        const sessionId = payload.sessionId as string;
        if (!sessionId) {
          return this.errorResponse('sessionId is required', command.requestId);
        }

        const message = payload.message as string;
        if (!message || typeof message !== 'string') {
          return this.errorResponse('message is required', command.requestId);
        }

        // Limit message length
        const truncatedMessage = message.slice(0, 500);
        
        // Get session to find player info
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
          return this.errorResponse('Session not found', command.requestId);
        }

        // Find the player by agentId (players Map is keyed by slot, not agentId)
        let player = null;
        let playerSlot = '';
        for (const [slot, p] of session.players) {
          if (p.agentId === clientId) {
            player = p;
            playerSlot = slot as string;
            break;
          }
        }
        
        if (!player) {
          return this.errorResponse('You are not in this session', command.requestId);
        }

        // Emit the chat message for the opponent and spectators
        this.emit('chatMessage', {
          sessionId,
          senderId: clientId,
          senderName: player.name,
          senderSlot: playerSlot,
          message: truncatedMessage,
          type: session.status === 'playing' ? 'game' : 'pregame',
          timestamp: Date.now(),
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'send_chat',
            sessionId,
            message: truncatedMessage,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'request_rematch': {
        const sessionId = payload.sessionId as string;
        if (!sessionId) {
          return this.errorResponse('sessionId is required', command.requestId);
        }

        // Get session
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
          return this.errorResponse('Session not found', command.requestId);
        }

        // Find the player by agentId
        let player = null;
        let playerSlot = '';
        for (const [slot, p] of session.players) {
          if (p.agentId === clientId) {
            player = p;
            playerSlot = slot as string;
            break;
          }
        }
        
        if (!player) {
          return this.errorResponse('You are not in this session', command.requestId);
        }

        // Request the rematch (swap slots for fairness by default)
        const swapSlots = payload.swapSlots !== false; // Default to true
        const result = this.sessionManager.resetSessionForRematch(sessionId, swapSlots);
        
        if (!result.success) {
          return this.errorResponse(result.error || 'Failed to reset session', command.requestId);
        }

        // Find the requester's new slot after reset
        let newSlot = '';
        const resetSession = result.session!;
        for (const [slot, p] of resetSession.players) {
          if (p.agentId === clientId) {
            newSlot = slot as string;
            break;
          }
        }

        // Emit rematch event for both players
        this.emit('sessionRematch', {
          sessionId,
          requestedBy: player.name,
          swapSlots,
          players: Array.from(resetSession.players.entries()).map(([slot, p]) => ({
            slot,
            name: p.name,
            agentId: p.agentId,
          })),
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'request_rematch',
            sessionId,
            yourSlot: newSlot,
            swapSlots,
            status: resetSession.status,
            message: 'Rematch ready - both players need to ready up',
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'game_move': {
        const sessionId = payload.sessionId as string;
        if (!sessionId) {
          return this.errorResponse('sessionId is required', command.requestId);
        }

        const row = payload.row as number;
        const col = payload.col as number;
        const reason = (payload.reason as string) || undefined; // AI's reasoning for the move

        if (typeof row !== 'number' || typeof col !== 'number') {
          return this.errorResponse('row and col are required for move', command.requestId);
        }

        const result = this.sessionManager.submitMove(sessionId, clientId, { row, col });

        if (!result.success) {
          return this.errorResponse(result.error || 'Invalid move', command.requestId);
        }

        // Emit move with reasoning for spectators and opponent
        if (reason) {
          this.emit('moveReasoning', {
            sessionId,
            agentId: clientId,
            move: { row, col },
            reason,
          });
        }

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'game_move',
            sessionId,
            move: { row, col },
            reason, // Include reasoning in ack
            gameOver: result.gameOver,
            winner: result.winner,
            nextPlayer: result.nextPlayer,
            state: result.state,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'game_forfeit': {
        const sessionId = payload.sessionId as string;
        if (!sessionId) {
          return this.errorResponse('sessionId is required', command.requestId);
        }

        const success = this.sessionManager.forfeit(sessionId, clientId);

        if (!success) {
          return this.errorResponse('Failed to forfeit', command.requestId);
        }

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'game_forfeit',
            sessionId,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'game_spectate': {
        const sessionId = payload.sessionId as string;
        if (!sessionId) {
          return this.errorResponse('sessionId is required', command.requestId);
        }

        const name = (payload.name as string) || `Spectator_${clientId.slice(0, 8)}`;
        const result = this.sessionManager.joinSession(
          sessionId,
          clientId,
          name,
          'spectator'
        );

        if (!result.success) {
          return this.errorResponse(result.error || 'Failed to spectate', command.requestId);
        }

        const session = this.sessionManager.getSession(sessionId);

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'game_spectate',
            sessionId,
            state: session?.state,
            status: session?.status,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      default:
        return this.errorResponse(`Unknown session action: ${action}`, command.requestId);
    }
  }

  /**
   * Handle chess-specific actions
   */
  private handleChessAction(clientId: string, action: GameAction, command: AICommand): AIResponse {
    const payload = command.payload;
    const sessionId = payload.sessionId as string;

    if (!sessionId) {
      return this.errorResponse('sessionId is required for chess actions', command.requestId);
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return this.errorResponse('Session not found', command.requestId);
    }

    if (session.config.gameType !== 'chess') {
      return this.errorResponse('Session is not a chess game', command.requestId);
    }

    // Find player by agentId
    let playerSlot: string | null = null;
    let player = null;
    for (const [slot, p] of session.players) {
      if (p.agentId === clientId) {
        playerSlot = slot;
        player = p;
        break;
      }
    }

    switch (action) {
      case 'chess_move': {
        const move = payload.move as string;
        if (!move) {
          return this.errorResponse('move is required (e.g., e4, Nf3, O-O)', command.requestId);
        }

        if (!player) {
          return this.errorResponse('You are not a player in this game', command.requestId);
        }

        // Emit the move for the chess engine to validate and execute
        this.emit('chessMove', {
          sessionId,
          agentId: clientId,
          playerSlot,
          move,
          reasoning: payload.reasoning as string | undefined,
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'chess_move',
            sessionId,
            move,
            playerSlot,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'chess_resign': {
        if (!player) {
          return this.errorResponse('You are not a player in this game', command.requestId);
        }

        this.emit('chessResign', {
          sessionId,
          agentId: clientId,
          playerSlot,
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'chess_resign',
            sessionId,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'chess_draw_offer': {
        if (!player) {
          return this.errorResponse('You are not a player in this game', command.requestId);
        }

        this.emit('chessDrawOffer', {
          sessionId,
          agentId: clientId,
          playerSlot,
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'chess_draw_offer',
            sessionId,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'chess_draw_accept': {
        if (!player) {
          return this.errorResponse('You are not a player in this game', command.requestId);
        }

        this.emit('chessDrawAccept', {
          sessionId,
          agentId: clientId,
          playerSlot,
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'chess_draw_accept',
            sessionId,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'chess_draw_decline': {
        if (!player) {
          return this.errorResponse('You are not a player in this game', command.requestId);
        }

        this.emit('chessDrawDecline', {
          sessionId,
          agentId: clientId,
          playerSlot,
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'chess_draw_decline',
            sessionId,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'chess_get_moves': {
        const square = payload.square as string | undefined;

        this.emit('chessGetMoves', {
          sessionId,
          agentId: clientId,
          square, // Optional: get moves for specific piece
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'chess_get_moves',
            sessionId,
            square,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'chess_get_hint': {
        if (!player) {
          return this.errorResponse('You are not a player in this game', command.requestId);
        }

        this.emit('chessGetHint', {
          sessionId,
          agentId: clientId,
          playerSlot,
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'chess_get_hint',
            sessionId,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'chess_undo_request': {
        if (!player) {
          return this.errorResponse('You are not a player in this game', command.requestId);
        }

        this.emit('chessUndoRequest', {
          sessionId,
          agentId: clientId,
          playerSlot,
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'chess_undo_request',
            sessionId,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'chess_undo_accept': {
        if (!player) {
          return this.errorResponse('You are not a player in this game', command.requestId);
        }

        this.emit('chessUndoAccept', {
          sessionId,
          agentId: clientId,
          playerSlot,
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'chess_undo_accept',
            sessionId,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      case 'chess_undo_decline': {
        if (!player) {
          return this.errorResponse('You are not a player in this game', command.requestId);
        }

        this.emit('chessUndoDecline', {
          sessionId,
          agentId: clientId,
          playerSlot,
        });

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            executed: true,
            action: 'chess_undo_decline',
            sessionId,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
      }

      default:
        return this.errorResponse(`Unknown chess action: ${action}`, command.requestId);
    }
  }

  /**
   * Handle matchmaking actions (cross-chat AI pairing)
   */
  private handleMatchmakingAction(clientId: string, action: GameAction, command: AICommand): AIResponse {
    const payload = command.payload;
    const matchmaker = getMatchmakingManager();

    switch (action) {
      case 'host_game': {
        const gameType = (payload.gameType as string) || 'tictactoe';
        const name = (payload.name as string) || `Agent_${clientId.slice(0, 8)}`;

        try {
          const match = matchmaker.hostGame(clientId, name, gameType);
          const instructions = getMatchInstructions(match.matchCode, gameType);

          return {
            type: 'ack',
            requestId: command.requestId,
            data: {
              action: 'host_game',
              matchCode: match.matchCode,
              gameType: match.gameType,
              expiresIn: Math.round((match.expiresAt - Date.now()) / 1000),
              status: 'waiting',
              instructions,
              message: `Share this code with your opponent: ${match.matchCode}`,
            },
            timestamp: Date.now(),
          };
        } catch (err) {
          return this.errorResponse((err as Error).message, command.requestId);
        }
      }

      case 'join_match': {
        const matchCode = payload.matchCode as string;
        const name = (payload.name as string) || `Agent_${clientId.slice(0, 8)}`;

        if (!matchCode) {
          return this.errorResponse('matchCode is required', command.requestId);
        }

        try {
          const match = matchmaker.joinMatch(matchCode, clientId, name);

          // FAIR PLAY: Randomly assign slots to prevent host advantage
          // This ensures neither player has a systematic advantage
          const randomSlot = Math.random() < 0.5;
          const hostSlot: PlayerSlot = randomSlot ? 'X' : 'O';
          const guestSlot: PlayerSlot = randomSlot ? 'O' : 'X';

          // Create a game session for the matched players with random starting player
          const sessionConfig: Partial<SessionConfig> = {
            gameType: match.gameType as GameType,
            mode: 'ai_vs_ai' as GameMode,
            turnTimeMs: 30000,
            allowSpectators: true,
            startingPlayer: 'random',  // Fair: random who goes first
            randomSlotAssignment: true,
          };

          const session = this.sessionManager.createSession(sessionConfig);
          
          // Get the actual starting player from the session state
          const startingPlayer = (session.state as { currentPlayer: string }).currentPlayer;

          // Join both players with randomly assigned slots
          this.sessionManager.joinSession(session.id, match.hostAgentId, match.hostName, 'ai', hostSlot);
          this.sessionManager.joinSession(session.id, clientId, name, 'ai', guestSlot);

          // Associate session with match
          matchmaker.setSessionId(match.matchCode, session.id);

          // Emit match found event for both players with their actual slots
          this.emit('matchFound', {
            matchCode: match.matchCode,
            sessionId: session.id,
            host: { id: match.hostAgentId, name: match.hostName, slot: hostSlot },
            guest: { id: clientId, name, slot: guestSlot },
            gameType: match.gameType,
            startingPlayer,
          });

          return {
            type: 'ack',
            requestId: command.requestId,
            data: {
              action: 'join_match',
              matched: true,
              matchCode: match.matchCode,
              sessionId: session.id,
              gameType: match.gameType,
              opponent: {
                name: match.hostName,
              },
              yourSlot: guestSlot,
              startingPlayer,
              goesFirst: guestSlot === startingPlayer,
              message: `Matched! You are playing as ${guestSlot} against ${match.hostName}. ${guestSlot === startingPlayer ? 'You go first!' : `${match.hostName} (${hostSlot}) goes first.`}`,
              nextSteps: [
                'Call action: game_ready with sessionId to indicate you are ready',
                'When both players are ready, the game will start',
                'Make moves with action: game_move, sessionId, row, col',
              ],
            },
            timestamp: Date.now(),
          };
        } catch (err) {
          return this.errorResponse((err as Error).message, command.requestId);
        }
      }

      case 'cancel_match': {
        const matchCode = payload.matchCode as string;

        if (!matchCode) {
          return this.errorResponse('matchCode is required', command.requestId);
        }

        try {
          matchmaker.cancelMatch(matchCode, clientId);

          return {
            type: 'ack',
            requestId: command.requestId,
            data: {
              action: 'cancel_match',
              matchCode,
              cancelled: true,
            },
            timestamp: Date.now(),
          };
        } catch (err) {
          return this.errorResponse((err as Error).message, command.requestId);
        }
      }

      case 'list_matches': {
        const waiting = matchmaker.listWaitingMatches();
        const myMatches = matchmaker.getAgentMatches(clientId);

        return {
          type: 'ack',
          requestId: command.requestId,
          data: {
            action: 'list_matches',
            myPendingMatches: myMatches.map(m => ({
              matchCode: m.matchCode,
              gameType: m.gameType,
              createdAt: m.createdAt,
              expiresIn: Math.round((m.expiresAt - Date.now()) / 1000),
            })),
            availableMatches: waiting.filter(m => m.hostAgentId !== clientId).map(m => ({
              matchCode: m.matchCode,
              gameType: m.gameType,
              hostName: m.hostName,
              expiresIn: Math.round((m.expiresAt - Date.now()) / 1000),
            })),
            stats: matchmaker.getStats(),
          },
          timestamp: Date.now(),
        };
      }

      case 'spectate_match': {
        const matchCode = payload.matchCode as string;
        const name = (payload.name as string) || `Spectator_${clientId.slice(0, 8)}`;

        if (!matchCode) {
          return this.errorResponse('matchCode is required', command.requestId);
        }

        try {
          // Get the match to find the session
          const match = matchmaker.getMatch(matchCode);
          if (!match) {
            return this.errorResponse('Match not found or expired', command.requestId);
          }

          if (!match.sessionId) {
            return this.errorResponse('Game has not started yet - wait for both players', command.requestId);
          }

          // Join as spectator
          const result = this.sessionManager.joinSession(
            match.sessionId,
            clientId,
            name,
            'spectator'
          );

          if (!result.success) {
            return this.errorResponse(result.error || 'Failed to spectate', command.requestId);
          }

          const session = this.sessionManager.getSession(match.sessionId);
          const players: Record<string, string> = {};
          if (session) {
            for (const [slot, player] of session.players) {
              players[slot] = player.name;
            }
          }

          return {
            type: 'ack',
            requestId: command.requestId,
            data: {
              action: 'spectate_match',
              matchCode,
              sessionId: match.sessionId,
              gameType: match.gameType,
              players,
              state: session?.state,
              status: session?.status,
              message: 'You are now spectating this match',
            },
            timestamp: Date.now(),
          };
        } catch (err) {
          return this.errorResponse((err as Error).message, command.requestId);
        }
      }

      default:
        return this.errorResponse(`Unknown matchmaking action: ${action}`, command.requestId);
    }
  }

  /**
   * Handle a query command
   */
  private handleQueryCommand(clientId: string, command: AICommand): AIResponse {
    const query = command.payload.query?.toLowerCase();

    if (!query) {
      return this.errorResponse('Query is required', command.requestId);
    }

    // Handle built-in queries
    switch (query) {
      case 'serverinfo':
        return {
          type: 'result',
          requestId: command.requestId,
          data: {
            version: '2.0.0',
            protocol: 'liku-ai-v1',
            capabilities: ['key', 'action', 'query', 'state'],
            rateLimits: this.config,
          },
          timestamp: Date.now(),
        };

      case 'clientinfo':
        const clientState = this.clients.get(clientId);
        return {
          type: 'result',
          requestId: command.requestId,
          data: {
            clientId,
            commandCount: clientState?.commandCount ?? 0,
            banCount: clientState?.banCount ?? 0,
            isBanned: clientState?.isBanned ?? false,
          },
          timestamp: Date.now(),
        };

      case 'possibleactions':
        return {
          type: 'result',
          requestId: command.requestId,
          data: {
            actions: Array.from(VALID_ACTIONS),
            keys: Array.from(VALID_KEYS),
          },
          timestamp: Date.now(),
        };

      case 'gamestate':
        // Return current unified game state directly
        const currentState = stateManager.get();
        return {
          type: 'result',
          requestId: command.requestId,
          data: currentState ?? { error: 'No game state available' },
          timestamp: Date.now(),
        };

      case 'history':
        // Return recent state history
        const history = stateManager.getHistory(10);
        return {
          type: 'result',
          requestId: command.requestId,
          data: { states: history, count: history.length },
          timestamp: Date.now(),
        };

      default:
        // Emit query event for external handlers
        return new Promise<AIResponse>((resolve) => {
          const timeout = setTimeout(() => {
            resolve({
              type: 'error',
              requestId: command.requestId,
              data: { message: 'Query timeout' },
              timestamp: Date.now(),
            });
          }, 5000);

          this.emit('query', query, clientId, (result: unknown) => {
            clearTimeout(timeout);
            resolve({
              type: 'result',
              requestId: command.requestId,
              data: result,
              timestamp: Date.now(),
            });
          });
        }) as unknown as AIResponse; // Will be handled asynchronously
    }
  }

  /**
   * Handle rate limit violation
   */
  private handleRateLimitViolation(clientId: string, client: ClientState, reason: string): void {
    client.banCount++;
    
    if (client.banCount >= this.config.maxBansBeforePermanent) {
      // Permanent ban (until restart)
      client.isBanned = true;
      client.bannedUntil = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      this.emit('ban', clientId, 24 * 60 * 60 * 1000);
    } else {
      // Temporary ban
      client.isBanned = true;
      client.bannedUntil = Date.now() + this.config.banDurationMs;
      this.emit('ban', clientId, this.config.banDurationMs);
    }

    this.emit('rateLimit', clientId, reason);
  }

  /**
   * Sanitize user input to prevent injection attacks
   */
  private sanitizeInput(input: string): string {
    // Remove any non-alphanumeric characters except underscore
    return input.replace(/[^a-z0-9_]/gi, '').toLowerCase();
  }

  /**
   * Create an error response
   */
  private errorResponse(message: string, requestId?: string): AIResponse {
    return {
      type: 'error',
      requestId,
      data: { message },
      timestamp: Date.now(),
    };
  }

  /**
   * Log command for analytics
   */
  private logCommand(clientId: string, command: AICommand): void {
    this.commandLog.push({
      clientId,
      command: `${command.type}:${command.payload.key || command.payload.action || command.payload.query}`,
      timestamp: Date.now(),
    });

    if (this.commandLog.length > this.maxLogSize) {
      this.commandLog.shift();
    }
  }

  /**
   * Get command statistics
   */
  getStats(): {
    totalClients: number;
    bannedClients: number;
    recentCommands: number;
    topActions: Array<{ action: string; count: number }>;
  } {
    const now = Date.now();
    const recentWindow = 60000; // Last minute
    const recentCommands = this.commandLog.filter(c => now - c.timestamp < recentWindow);

    // Count actions
    const actionCounts = new Map<string, number>();
    for (const cmd of recentCommands) {
      actionCounts.set(cmd.command, (actionCounts.get(cmd.command) || 0) + 1);
    }

    const topActions = Array.from(actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    let bannedClients = 0;
    for (const client of this.clients.values()) {
      if (client.isBanned) bannedClients++;
    }

    return {
      totalClients: this.clients.size,
      bannedClients,
      recentCommands: recentCommands.length,
      topActions,
    };
  }

  /**
   * Remove a client from tracking
   */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  /**
   * Unban a client
   */
  unbanClient(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      client.isBanned = false;
      client.bannedUntil = 0;
      client.banCount = 0;
      return true;
    }
    return false;
  }

  /**
   * Get all valid actions for documentation
   */
  static getValidActions(): GameAction[] {
    return Array.from(VALID_ACTIONS) as GameAction[];
  }

  /**
   * Get all valid keys for documentation
   */
  static getValidKeys(): ValidKey[] {
    return Array.from(VALID_KEYS) as ValidKey[];
  }

  /**
   * Get action to key mapping for documentation
   */
  static getActionKeyMapping(): Record<GameAction, ValidKey[]> {
    return { ...ACTION_TO_KEYS };
  }
}

// Singleton instance
export const commandRouter = new CommandRouter();
