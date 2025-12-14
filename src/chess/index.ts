/**
 * Chess Module - Liku-AI
 * 
 * Comprehensive chess system with:
 * - Full game engine (move generation, validation, FEN/PGN)
 * - Position evaluation (material, positional, structural)
 * - Alpha-beta search with modern enhancements
 * - AI player with Gemini integration
 * - Opening book database
 * - WebSocket state integration
 * 
 * @module chess
 */

// Core Engine
export {
  ChessEngine,
  createChessEngine,
  isValidFen,
  parseFen,
  getSquareColor,
  squareToCoords,
  coordsToSquare,
} from './ChessEngine.js';

// Evaluation
export {
  ChessEvaluator,
  createChessEvaluator,
  quickEvaluate,
} from './ChessEvaluator.js';

// Search
export {
  ChessSearch,
  createChessSearch,
  perft,
  divide,
} from './ChessSearch.js';

// Zobrist Hashing
export {
  computeZobristHash,
  updateHashAfterMove,
} from './ChessZobrist.js';

// AI Player
export {
  ChessAI,
  createChessAI,
  ChessAIMatch,
  createChessAIMatch,
} from './ChessAI.js';

// Opening Book
export {
  ChessOpenings,
  createChessOpenings,
} from './ChessOpenings.js';

// Types
export type {
  // Core types
  Color,
  PieceType,
  PieceSymbol,
  Square,
  MoveFlag,
  Piece,
  PieceOnBoard,
  MoveInput,
  Move,
  MoveOptions,
  Board,
  BoardPosition,
  
  // Game state
  CastlingRights,
  CapturedPieces,
  GameEndReason,
  GameResult,
  ChessState,
  
  // Evaluation
  MaterialCount,
  MaterialBalance,
  PawnStructure,
  EvaluationBreakdown,
  
  // Search
  TTEntry,
  TTEntryType,
  SearchStats,
  SearchResult,
  
  // AI
  AIDifficulty,
  AIPersonality,
  AIConfig,
  AIMove,
  
  // WebSocket
  ChessAction,
  ChessEvent,
  TimeControl,
  ChessSessionConfig,
  
  // Opening book
  BookMove,
  Opening,
  
  // Configuration
  ChessEngineConfig,
  EvaluatorConfig,
  SearchConfig,
} from './types.js';

// Constants
export {
  STARTING_FEN,
  PIECE_VALUES,
  PIECE_UNICODE,
  FILES,
  RANKS,
  SQUARES,
  DEFAULT_SEARCH_CONFIG,
  DEFAULT_AI_CONFIG,
} from './types.js';

/**
 * Quick start: Create a complete chess game environment
 */
export function createChessGame(options?: {
  fen?: string;
  aiConfig?: Partial<import('./types.js').AIConfig>;
}) {
  const { ChessEngine } = require('./ChessEngine.js');
  const { ChessAI } = require('./ChessAI.js');
  const { ChessEvaluator } = require('./ChessEvaluator.js');
  
  const engine = new ChessEngine({ initialFen: options?.fen });
  const evaluator = new ChessEvaluator();
  const ai = new ChessAI(options?.aiConfig);
  
  return {
    engine,
    evaluator,
    ai,
    
    /** Make a move */
    move: (move: string) => engine.move(move),
    
    /** Get AI's best move */
    getAIMove: () => ai.getBestMove(engine.fen()),
    
    /** Get current state */
    getState: () => ({
      ...engine.getState(),
      evaluation: evaluator.evaluate(engine.fen()),
    }),
    
    /** Get FEN */
    fen: () => engine.fen(),
    
    /** Check if game is over */
    isGameOver: () => engine.isGameOver(),
    
    /** Reset game */
    reset: (fen?: string) => engine.reset(fen),
  };
}
