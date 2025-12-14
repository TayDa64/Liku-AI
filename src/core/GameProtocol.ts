/**
 * GameProtocol - Unified Game Interface for Liku-AI
 * 
 * Provides a consistent contract for all games in the platform:
 * - Turn-based games (Chess, TicTacToe, Connect4)
 * - Real-time games (Snake, DinoRun)
 * 
 * Benefits:
 * - Multi-game agents can use same interface
 * - WebSocket sessions can handle any game type
 * - Training/replay systems work across games
 * - Self-play and tournaments become trivial
 * 
 * @module core/GameProtocol
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Game timing mode
 */
export type GameTiming = 'turn-based' | 'real-time';

/**
 * Player identifier (varies by game)
 * - TicTacToe: 'X' | 'O'
 * - Chess: 'w' | 'b'
 * - Snake: 'player' (single player)
 */
export type PlayerId = string;

/**
 * Base action type (games extend with specifics)
 */
export interface GameAction {
  /** Action type identifier */
  type: string;
  /** Action payload (game-specific) */
  payload: unknown;
  /** Timestamp when action was created */
  timestamp?: number;
}

/**
 * Result of applying an action
 */
export interface ActionResult {
  /** Whether the action was valid and applied */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Reward/score change from this action (for RL) */
  reward?: number;
  /** Whether game ended due to this action */
  gameEnded?: boolean;
  /** Winner if game ended */
  winner?: PlayerId | 'draw' | null;
}

/**
 * Game state metadata (common across all games)
 */
export interface GameMeta {
  /** Game type identifier */
  gameType: string;
  /** Current turn number (0-indexed) */
  turnNumber: number;
  /** Player to move (null for real-time games) */
  currentPlayer: PlayerId | null;
  /** Whether game has ended */
  isTerminal: boolean;
  /** Winner if game ended */
  winner: PlayerId | 'draw' | null;
  /** Game timing mode */
  timing: GameTiming;
  /** Timestamp of last state change */
  lastUpdate: number;
}

/**
 * AI suggestion for best action
 */
export interface AISuggestion<TAction extends GameAction = GameAction> {
  /** Recommended action */
  action: TAction;
  /** Evaluation score (game-specific units) */
  evaluation?: number;
  /** Human-readable explanation */
  explanation?: string;
  /** Search depth (for turn-based) */
  depth?: number;
  /** Time taken to compute (ms) */
  computeTime?: number;
}

// =============================================================================
// Main Protocol Interface
// =============================================================================

/**
 * GameProtocol - Universal game interface
 * 
 * @typeParam TState - Game-specific state type
 * @typeParam TAction - Game-specific action type
 * 
 * @example
 * ```typescript
 * // TicTacToe
 * const game: GameProtocol<TicTacToeState, TicTacToeAction> = new TicTacToeProtocol();
 * game.applyAction({ type: 'place', payload: { row: 1, col: 1 } });
 * 
 * // Chess
 * const chess: GameProtocol<ChessState, ChessAction> = new ChessProtocol();
 * chess.applyAction({ type: 'move', payload: { san: 'e4' } });
 * ```
 */
export interface GameProtocol<
  TState = unknown,
  TAction extends GameAction = GameAction
> {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  
  /** Unique game type identifier (e.g., 'tictactoe', 'chess', 'snake') */
  readonly gameType: string;
  
  /** Human-readable game name */
  readonly displayName: string;
  
  /** Game timing mode */
  readonly timing: GameTiming;
  
  /** Number of players (1 for single-player games) */
  readonly playerCount: number;
  
  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------
  
  /**
   * Get current game state (full, game-specific)
   */
  getState(): TState;
  
  /**
   * Get game metadata (common format)
   */
  getMeta(): GameMeta;
  
  /**
   * Serialize state for WebSocket/storage
   * Should be JSON-serializable
   */
  serialize(): string;
  
  /**
   * Load state from serialized form
   * @param data - Previously serialized state
   */
  deserialize(data: string): void;
  
  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  
  /**
   * Get all legal actions in current state
   * For real-time games, returns currently available inputs
   */
  getLegalActions(): TAction[];
  
  /**
   * Check if a specific action is legal
   */
  isLegalAction(action: TAction): boolean;
  
  /**
   * Apply an action to the game state
   * @returns Result indicating success and any rewards
   */
  applyAction(action: TAction): ActionResult;
  
  // ---------------------------------------------------------------------------
  // Game Flow
  // ---------------------------------------------------------------------------
  
  /**
   * Check if game has ended
   */
  isGameOver(): boolean;
  
  /**
   * Get winner (null if game ongoing or draw)
   */
  getWinner(): PlayerId | 'draw' | null;
  
  /**
   * Get current player (null for real-time games)
   */
  getCurrentPlayer(): PlayerId | null;
  
  /**
   * Reset game to initial state
   */
  reset(): void;
  
  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  
  /**
   * Render game state as ASCII art for terminal display
   */
  renderAscii(): string;
  
  // ---------------------------------------------------------------------------
  // AI (Optional)
  // ---------------------------------------------------------------------------
  
  /**
   * Get AI suggestion for best action
   * @param options - AI configuration (depth, time limit, etc.)
   */
  getAISuggestion?(options?: {
    depth?: number;
    timeLimit?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
  }): Promise<AISuggestion<TAction>>;
  
  // ---------------------------------------------------------------------------
  // Events (Optional)
  // ---------------------------------------------------------------------------
  
  /**
   * Subscribe to state changes
   */
  onStateChange?(callback: (state: TState, meta: GameMeta) => void): () => void;
}

// =============================================================================
// Protocol Factory
// =============================================================================

/**
 * Registry of game protocol factories
 */
const protocolRegistry = new Map<string, () => GameProtocol>();

/**
 * Register a game protocol factory
 */
export function registerProtocol(
  gameType: string, 
  factory: () => GameProtocol
): void {
  protocolRegistry.set(gameType, factory);
}

/**
 * Create a game protocol instance by type
 */
export function createProtocol(gameType: string): GameProtocol | null {
  const factory = protocolRegistry.get(gameType);
  return factory ? factory() : null;
}

/**
 * Get list of registered game types
 */
export function getRegisteredGameTypes(): string[] {
  return Array.from(protocolRegistry.keys());
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a protocol supports AI suggestions
 */
export function hasAISupport(
  protocol: GameProtocol
): protocol is GameProtocol & Required<Pick<GameProtocol, 'getAISuggestion'>> {
  return typeof protocol.getAISuggestion === 'function';
}

/**
 * Check if a protocol is turn-based
 */
export function isTurnBased(protocol: GameProtocol): boolean {
  return protocol.timing === 'turn-based';
}

/**
 * Check if a protocol is real-time
 */
export function isRealTime(protocol: GameProtocol): boolean {
  return protocol.timing === 'real-time';
}

// =============================================================================
// Abstract Base Class (Optional Helper)
// =============================================================================

/**
 * Abstract base class providing common functionality
 * Games can extend this or implement GameProtocol directly
 */
export abstract class BaseGameProtocol<
  TState = unknown,
  TAction extends GameAction = GameAction
> implements GameProtocol<TState, TAction> {
  abstract readonly gameType: string;
  abstract readonly displayName: string;
  abstract readonly timing: GameTiming;
  abstract readonly playerCount: number;
  
  protected state!: TState;
  protected meta!: GameMeta;
  protected stateListeners: Set<(state: TState, meta: GameMeta) => void> = new Set();
  
  abstract getState(): TState;
  abstract getMeta(): GameMeta;
  abstract getLegalActions(): TAction[];
  abstract applyAction(action: TAction): ActionResult;
  abstract isGameOver(): boolean;
  abstract getWinner(): PlayerId | 'draw' | null;
  abstract getCurrentPlayer(): PlayerId | null;
  abstract reset(): void;
  abstract renderAscii(): string;
  
  serialize(): string {
    return JSON.stringify({
      state: this.getState(),
      meta: this.getMeta(),
    });
  }
  
  deserialize(data: string): void {
    const parsed = JSON.parse(data);
    // Subclasses should override to properly restore state
    this.state = parsed.state;
    this.meta = parsed.meta;
  }
  
  isLegalAction(action: TAction): boolean {
    return this.getLegalActions().some(
      a => a.type === action.type && 
           JSON.stringify(a.payload) === JSON.stringify(action.payload)
    );
  }
  
  onStateChange(callback: (state: TState, meta: GameMeta) => void): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }
  
  protected notifyStateChange(): void {
    const state = this.getState();
    const meta = this.getMeta();
    for (const listener of this.stateListeners) {
      listener(state, meta);
    }
  }
}
