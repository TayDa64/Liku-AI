/**
 * Chess Module Type Definitions
 * 
 * Comprehensive TypeScript interfaces for the Liku-AI chess system.
 * Based on chess.js conventions with extensions for AI evaluation and WebSocket integration.
 */

// =============================================================================
// Core Chess Types
// =============================================================================

/** Chess piece colors */
export type Color = 'w' | 'b';

/** Chess piece types (lowercase) */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** Piece symbol (uppercase = white, lowercase = black) */
export type PieceSymbol = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** Square notation (a1-h8) */
export type Square = 
  | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'a7' | 'a8'
  | 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'b7' | 'b8'
  | 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8'
  | 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7' | 'd8'
  | 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6' | 'e7' | 'e8'
  | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8'
  | 'g1' | 'g2' | 'g3' | 'g4' | 'g5' | 'g6' | 'g7' | 'g8'
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'h7' | 'h8';

/** Move flags from chess.js */
export type MoveFlag = 
  | 'n'  // Normal move
  | 'b'  // Pawn push of two squares
  | 'e'  // En passant capture
  | 'c'  // Standard capture
  | 'p'  // Promotion
  | 'k'  // Kingside castling
  | 'q'; // Queenside castling

// =============================================================================
// Piece Representation
// =============================================================================

/** A piece on the board */
export interface Piece {
  type: PieceType;
  color: Color;
}

/** A piece with its position */
export interface PieceOnBoard extends Piece {
  square: Square;
}

// =============================================================================
// Move Representation
// =============================================================================

/** Input format for making moves */
export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PieceType;
}

/** Full move information (from chess.js verbose mode) */
export interface Move {
  /** Source square */
  from: Square;
  /** Target square */
  to: Square;
  /** Standard Algebraic Notation (e.g., "Nf3", "O-O") */
  san: string;
  /** Long Algebraic Notation (e.g., "g1f3") */
  lan: string;
  /** Piece type that moved */
  piece: PieceType;
  /** Piece type captured (if any) */
  captured?: PieceType;
  /** Piece type promoted to (if pawn promotion) */
  promotion?: PieceType;
  /** Move flags */
  flags: string;
  /** FEN before the move */
  before: string;
  /** FEN after the move */
  after: string;
  /** Color of the player who made the move */
  color: Color;
}

/** Options for move generation */
export interface MoveOptions {
  /** Only generate moves for this square */
  square?: Square;
  /** Include verbose move information */
  verbose?: boolean;
  /** Only generate legal moves (default: true) */
  legal?: boolean;
  /** Only generate captures */
  piece?: PieceType;
}

// =============================================================================
// Game State
// =============================================================================

/** Castling rights */
export interface CastlingRights {
  /** White can castle kingside */
  whiteKingside: boolean;
  /** White can castle queenside */
  whiteQueenside: boolean;
  /** Black can castle kingside */
  blackKingside: boolean;
  /** Black can castle queenside */
  blackQueenside: boolean;
}

/** Captured pieces tracking */
export interface CapturedPieces {
  white: PieceType[];  // Pieces captured BY white (black's pieces)
  black: PieceType[];  // Pieces captured BY black (white's pieces)
}

/** Game termination reasons */
export type GameEndReason = 
  | 'checkmate'
  | 'stalemate'
  | 'insufficient_material'
  | 'threefold_repetition'
  | 'fifty_move_rule'
  | 'agreement'
  | 'resignation'
  | 'timeout'
  | 'abandonment';

/** Game result */
export interface GameResult {
  /** Winner color (null for draw) */
  winner: Color | null;
  /** Reason for game end */
  reason: GameEndReason;
  /** Final score string */
  score: '1-0' | '0-1' | '1/2-1/2';
}

// =============================================================================
// Board Representation
// =============================================================================

/** 8x8 board array (rank 8 to rank 1, file a to file h) */
export type Board = (Piece | null)[][];

/** Board position for hashing */
export interface BoardPosition {
  board: Board;
  turn: Color;
  castling: CastlingRights;
  enPassant: Square | null;
}

// =============================================================================
// Evaluation Types
// =============================================================================

/** Material count by piece type */
export interface MaterialCount {
  pawns: number;
  knights: number;
  bishops: number;
  rooks: number;
  queens: number;
}

/** Material balance (positive = white advantage) */
export interface MaterialBalance {
  white: MaterialCount;
  black: MaterialCount;
  total: number;  // Centipawns
}

/** Pawn structure analysis */
export interface PawnStructure {
  /** Number of doubled pawns */
  doubled: number;
  /** Number of isolated pawns */
  isolated: number;
  /** Number of passed pawns */
  passed: number;
  /** Number of backward pawns */
  backward: number;
  /** Number of connected pawn pairs */
  connected: number;
  /** Pawn islands count */
  islands: number;
}

/** Position evaluation breakdown */
export interface EvaluationBreakdown {
  /** Material balance */
  material: number;
  /** Piece-square table scores */
  pieceSquares: number;
  /** Pawn structure score */
  pawnStructure: number;
  /** Mobility score */
  mobility: number;
  /** King safety score */
  kingSafety: number;
  /** Center control score */
  centerControl: number;
  /** Bishop pair bonus */
  bishopPair: number;
  /** Rook on open file bonus */
  rookOpenFile: number;
  /** Total evaluation */
  total: number;
  /** Game phase (0 = endgame, 256 = opening) */
  gamePhase: number;
}

// =============================================================================
// Search Types
// =============================================================================

/** Transposition table entry type */
export type TTEntryType = 'EXACT' | 'LOWER' | 'UPPER';

/**
 * Transposition table entry
 * Uses BigInt for proper 64-bit Zobrist hashing
 */
export interface TTEntry {
  /** Position hash (64-bit Zobrist key) */
  hash: bigint;
  /** Search depth */
  depth: number;
  /** Evaluation score */
  score: number;
  /** Entry type (exact, lower bound, upper bound) */
  type: TTEntryType;
  /** Best move found */
  bestMove: string;
  /** Age (for replacement strategy) */
  age: number;
}

/**
 * Legacy TT entry with string hash (for backward compatibility)
 * @deprecated Use TTEntry with bigint hash instead
 */
export interface TTEntryLegacy {
  hash: string;
  depth: number;
  score: number;
  type: TTEntryType;
  bestMove: string;
  age: number;
}

/** Search statistics */
export interface SearchStats {
  /** Total nodes searched */
  nodes: number;
  /** Depth reached */
  depth: number;
  /** Selective depth (quiescence) */
  seldepth: number;
  /** Search time in milliseconds */
  time: number;
  /** Nodes per second */
  nps: number;
  /** Transposition table hits */
  ttHits: number;
  /** Transposition table cutoffs */
  ttCutoffs: number;
  /** Beta cutoffs */
  betaCutoffs: number;
  /** Null move cutoffs */
  nullMoveCutoffs: number;
  /** Futility prunes */
  futilityPrunes: number;
  /** Late move reductions */
  lmrReductions: number;
  /** Quiescence nodes */
  qNodes: number;
  /** SEE prunes in quiescence */
  seePrunes: number;
  /** Counter-move table hits */
  counterMoveHits: number;
}

/** Search result */
export interface SearchResult {
  /** Best move in SAN notation */
  bestMove: string;
  /** Evaluation score in centipawns */
  score: number;
  /** Search depth completed */
  depth: number;
  /** Selective depth */
  seldepth: number;
  /** Nodes searched */
  nodes: number;
  /** Search time in ms */
  time: number;
  /** Principal variation (best line) */
  pv: string[];
  /** Whether search was aborted */
  aborted: boolean;
  /** Hash table fill percentage */
  hashFull: number;
  /** Nodes per second */
  nps: number;
  /** Ponder move - expected opponent reply (2nd move in PV) */
  ponderMove?: string;
}

/** Multi-PV search result - contains multiple principal variations */
export interface MultiPVResult {
  /** Array of PV lines, sorted by score (best first) */
  lines: Array<{
    /** Moves in this line */
    pv: string[];
    /** Evaluation score in centipawns */
    score: number;
    /** Rank (1 = best, 2 = second best, etc.) */
    rank: number;
  }>;
  /** Search depth completed */
  depth: number;
  /** Selective depth */
  seldepth: number;
  /** Total nodes searched */
  nodes: number;
  /** Search time in ms */
  time: number;
  /** Whether search was aborted */
  aborted: boolean;
  /** Hash table fill percentage */
  hashFull: number;
  /** Nodes per second */
  nps: number;
}

// =============================================================================
// AI Types
// =============================================================================

/** AI difficulty levels */
export type AIDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'grandmaster';

/** AI personality types */
export type AIPersonality = 'aggressive' | 'defensive' | 'positional' | 'tactical' | 'balanced';

/** AI configuration */
export interface AIConfig {
  /** AI name/identifier */
  name: string;
  /** Search depth limit */
  maxDepth: number;
  /** Time limit per move in ms */
  maxTime: number;
  /** Use opening book */
  useOpeningBook: boolean;
  /** AI personality affects evaluation weights */
  personality: AIPersonality;
  /** Target ELO for move selection randomness */
  targetElo?: number;
  /** Use Gemini API for move selection */
  useGemini: boolean;
}

/** AI move result */
export interface AIMove {
  /** Selected move in SAN notation */
  move: string;
  /** Position evaluation */
  evaluation: number;
  /** Confidence in move (0-1) */
  confidence: number;
  /** Human-readable reasoning (from Gemini) */
  reasoning?: string;
  /** Detailed search information */
  searchInfo?: SearchResult;
  /** Opening name if from book */
  openingName?: string;
  /** Alternative moves considered */
  alternatives?: Array<{
    move: string;
    evaluation: number;
  }>;
}

// =============================================================================
// WebSocket State Types
// =============================================================================

/** Chess game state for WebSocket transmission */
export interface ChessState {
  /** Current FEN string */
  fen: string;
  /** Current turn */
  turn: Color;
  /** Full move number */
  moveNumber: number;
  /** Half-move clock (for 50-move rule) */
  halfMoveClock: number;
  /** Is the current player in check */
  isCheck: boolean;
  /** Is the game over by checkmate */
  isCheckmate: boolean;
  /** Is the game over by stalemate */
  isStalemate: boolean;
  /** Is the game a draw */
  isDraw: boolean;
  /** Draw reason if applicable */
  drawReason?: 'stalemate' | 'insufficient_material' | 'threefold_repetition' | 'fifty_move_rule' | 'agreement';
  /** Is the game over */
  isGameOver: boolean;
  /** Game result if over */
  result?: GameResult;
  /** Legal moves in SAN notation */
  legalMoves: string[];
  /** Legal moves in verbose format */
  legalMovesVerbose: Move[];
  /** Last move played */
  lastMove: Move | null;
  /** Move history in SAN notation */
  history: string[];
  /** Captured pieces */
  capturedPieces: CapturedPieces;
  /** PGN string */
  pgn: string;
  /** ASCII board representation */
  ascii: string;
  /** Position evaluation in centipawns (+ = white advantage) */
  evaluation?: number;
  /** Evaluation breakdown */
  evaluationBreakdown?: EvaluationBreakdown;
  /** Recommended best move */
  bestMove?: string;
  /** Principal variation */
  pv?: string[];
  /** Opening name */
  opening?: string;
  /** Castling rights */
  castling: CastlingRights;
  /** En passant target square */
  enPassant: Square | null;
  /** Time remaining (if time control) */
  timeRemaining?: {
    white: number;
    black: number;
  };
}

// =============================================================================
// Session Types
// =============================================================================

/** Chess time control */
export interface TimeControl {
  /** Initial time in seconds */
  initial: number;
  /** Increment per move in seconds */
  increment: number;
}

/** Chess session configuration */
export interface ChessSessionConfig {
  /** White player ID or 'human' or 'ai' */
  white: string;
  /** Black player ID or 'human' or 'ai' */
  black: string;
  /** Starting position FEN (default: standard) */
  startingFen?: string;
  /** Time control */
  timeControl?: TimeControl;
  /** AI config for AI players */
  aiConfig?: AIConfig;
  /** Rated game */
  rated?: boolean;
}

/** Chess WebSocket actions */
export type ChessAction =
  | { type: 'chess:move'; move: string; }
  | { type: 'chess:resign'; }
  | { type: 'chess:draw_offer'; }
  | { type: 'chess:draw_accept'; }
  | { type: 'chess:draw_decline'; }
  | { type: 'chess:takeback_request'; }
  | { type: 'chess:takeback_accept'; }
  | { type: 'chess:takeback_decline'; }
  | { type: 'chess:analyze'; fen?: string; depth?: number; }
  | { type: 'chess:hint'; }
  | { type: 'chess:get_state'; };

/** Chess WebSocket events */
export type ChessEvent =
  | { type: 'chess:state'; state: ChessState; }
  | { type: 'chess:move_made'; move: Move; state: ChessState; }
  | { type: 'chess:game_over'; result: GameResult; state: ChessState; }
  | { type: 'chess:draw_offered'; by: Color; }
  | { type: 'chess:draw_declined'; by: Color; }
  | { type: 'chess:takeback_requested'; by: Color; }
  | { type: 'chess:takeback_declined'; by: Color; }
  | { type: 'chess:analysis'; evaluation: number; pv: string[]; depth: number; }
  | { type: 'chess:hint'; move: string; evaluation: number; }
  | { type: 'chess:error'; message: string; code: string; };

// =============================================================================
// Opening Book Types
// =============================================================================

/** Opening book move */
export interface BookMove {
  /** Move in SAN notation */
  move: string;
  /** Weight/frequency of this move */
  weight: number;
  /** Win rate from this position */
  winRate?: number;
  /** Number of games with this move */
  games?: number;
}

/** Opening information */
export interface Opening {
  /** ECO code (e.g., "B96") */
  eco: string;
  /** Opening name */
  name: string;
  /** Variation name */
  variation?: string;
  /** Moves in SAN notation */
  moves: string[];
  /** Final FEN after moves */
  fen: string;
}

// =============================================================================
// Configuration Types
// =============================================================================

/** Chess engine configuration */
export interface ChessEngineConfig {
  /** Initial FEN position */
  initialFen?: string;
  /** Validate moves strictly */
  validateMoves?: boolean;
  /** Track move history */
  trackHistory?: boolean;
  /** Enable position hashing */
  enableHashing?: boolean;
}

/** Chess evaluator configuration */
export interface EvaluatorConfig {
  /** Use opening book positions */
  useOpeningBook?: boolean;
  /** Enable endgame-specific evaluation */
  useEndgameEval?: boolean;
  /** Evaluate king safety */
  evaluateKingSafety?: boolean;
  /** Evaluate pawn structure */
  evaluatePawnStructure?: boolean;
  /** Evaluate piece mobility */
  evaluateMobility?: boolean;
  /** Custom piece values (centipawns) */
  pieceValues?: {
    pawn: number;
    knight: number;
    bishop: number;
    rook: number;
    queen: number;
  };
}

/** Chess search configuration */
export interface SearchConfig {
  /** Maximum search depth */
  maxDepth: number;
  /** Maximum search time in ms */
  maxTime: number;
  /** Use quiescence search */
  useQuiescence: boolean;
  /** Use transposition table */
  useTranspositionTable: boolean;
  /** Transposition table size in MB */
  ttSizeMB: number;
  /** Use killer move heuristic */
  useKillerMoves: boolean;
  /** Use history heuristic */
  useHistoryHeuristic: boolean;
  /** Use Late Move Reductions */
  useLMR: boolean;
  /** Use Null Move Pruning */
  useNullMove: boolean;
  /** Use Futility Pruning */
  useFutilityPruning: boolean;
  /** Use aspiration windows */
  useAspirationWindows: boolean;
  /** Use Principal Variation Search */
  usePVS: boolean;
  /** Maximum quiescence depth */
  maxQuiescenceDepth: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Standard starting position FEN */
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Material values in centipawns */
export const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

/** Unicode chess piece symbols */
export const PIECE_UNICODE: Record<PieceSymbol, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

/** File letters */
export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

/** Rank numbers */
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

/** All squares */
export const SQUARES: Square[] = FILES.flatMap(f => RANKS.map(r => `${f}${r}` as Square));

/** Default search configuration */
export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  maxDepth: 6,
  maxTime: 5000,
  useQuiescence: true,
  useTranspositionTable: true,
  ttSizeMB: 64,
  useKillerMoves: true,
  useHistoryHeuristic: true,
  useLMR: true,
  useNullMove: true,
  useFutilityPruning: true,
  useAspirationWindows: true,
  usePVS: true,
  maxQuiescenceDepth: 8,
};

/** Default AI configuration */
export const DEFAULT_AI_CONFIG: AIConfig = {
  name: 'LikuChess',
  maxDepth: 6,
  maxTime: 5000,
  useOpeningBook: true,
  personality: 'balanced',
  useGemini: false,
};
