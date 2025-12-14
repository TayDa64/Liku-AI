/**
 * ChessEvaluator - Position evaluation function
 * 
 * Implements a comprehensive evaluation function for chess positions including:
 * - Material balance
 * - Piece-square tables (positional bonuses)
 * - Pawn structure analysis
 * - Mobility evaluation
 * - King safety
 * - Center control
 * - Game phase tapering (blend opening and endgame values)
 * 
 * All values are in centipawns from White's perspective (positive = White advantage).
 */

import { Chess } from 'chess.js';
import {
  Board,
  Color,
  EvaluationBreakdown,
  EvaluatorConfig,
  PawnStructure,
  Piece,
  PieceType,
  Square,
} from './types.js';

// =============================================================================
// Material Values (Centipawns)
// =============================================================================

/** Middlegame piece values */
const MG_PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

/** Endgame piece values */
const EG_PIECE_VALUES: Record<PieceType, number> = {
  p: 120,  // Pawns more valuable in endgame
  n: 300,  // Knights slightly weaker
  b: 320,  // Bishops stay strong
  r: 520,  // Rooks more valuable
  q: 900,  // Queen stays constant
  k: 20000,
};

/** Phase values for determining game phase */
const PHASE_VALUES: Record<PieceType, number> = {
  p: 0,
  n: 1,
  b: 1,
  r: 2,
  q: 4,
  k: 0,
};

const TOTAL_PHASE = 24; // 4N + 4B + 4R + 2Q = 4 + 4 + 8 + 8 = 24

// =============================================================================
// Piece-Square Tables (from White's perspective, rank 1 at bottom)
// Values are added to piece values based on square position
// =============================================================================

/**
 * Pawn PST - Encourage central pawns and advancement
 * Note: Array index 0 = rank 8 (top), index 7 = rank 1 (bottom) for display
 * We flip for black pieces
 */
const PAWN_MG: number[][] = [
  [  0,   0,   0,   0,   0,   0,   0,   0],  // Rank 8 (impossible for pawn)
  [ 50,  50,  50,  50,  50,  50,  50,  50],  // Rank 7 (pre-promotion)
  [ 10,  10,  20,  30,  30,  20,  10,  10],  // Rank 6
  [  5,   5,  10,  25,  25,  10,   5,   5],  // Rank 5
  [  0,   0,   0,  20,  20,   0,   0,   0],  // Rank 4
  [  5,  -5, -10,   0,   0, -10,  -5,   5],  // Rank 3
  [  5,  10,  10, -20, -20,  10,  10,   5],  // Rank 2
  [  0,   0,   0,   0,   0,   0,   0,   0],  // Rank 1 (impossible for pawn)
];

const PAWN_EG: number[][] = [
  [  0,   0,   0,   0,   0,   0,   0,   0],
  [ 80,  80,  80,  80,  80,  80,  80,  80],  // Very valuable near promotion
  [ 50,  50,  50,  50,  50,  50,  50,  50],
  [ 30,  30,  30,  30,  30,  30,  30,  30],
  [ 20,  20,  20,  20,  20,  20,  20,  20],
  [ 10,  10,  10,  10,  10,  10,  10,  10],
  [  0,   0,   0,   0,   0,   0,   0,   0],
  [  0,   0,   0,   0,   0,   0,   0,   0],
];

/** Knight PST - Prefer center, avoid edges */
const KNIGHT_MG: number[][] = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20,   0,   0,   0,   0, -20, -40],
  [-30,   0,  10,  15,  15,  10,   0, -30],
  [-30,   5,  15,  20,  20,  15,   5, -30],
  [-30,   0,  15,  20,  20,  15,   0, -30],
  [-30,   5,  10,  15,  15,  10,   5, -30],
  [-40, -20,   0,   5,   5,   0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const KNIGHT_EG: number[][] = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20,   0,   0,   0,   0, -20, -40],
  [-30,   0,  10,  15,  15,  10,   0, -30],
  [-30,   5,  15,  20,  20,  15,   5, -30],
  [-30,   0,  15,  20,  20,  15,   0, -30],
  [-30,   5,  10,  15,  15,  10,   5, -30],
  [-40, -20,   0,   5,   5,   0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

/** Bishop PST - Prefer diagonals, avoid corners */
const BISHOP_MG: number[][] = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10,   0,   0,   0,   0,   0,   0, -10],
  [-10,   0,   5,  10,  10,   5,   0, -10],
  [-10,   5,   5,  10,  10,   5,   5, -10],
  [-10,   0,  10,  10,  10,  10,   0, -10],
  [-10,  10,  10,  10,  10,  10,  10, -10],
  [-10,   5,   0,   0,   0,   0,   5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const BISHOP_EG: number[][] = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10,   0,   0,   0,   0,   0,   0, -10],
  [-10,   0,   5,  10,  10,   5,   0, -10],
  [-10,   5,   5,  10,  10,   5,   5, -10],
  [-10,   0,  10,  10,  10,  10,   0, -10],
  [-10,  10,  10,  10,  10,  10,  10, -10],
  [-10,   5,   0,   0,   0,   0,   5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

/** Rook PST - 7th rank bonus, open files */
const ROOK_MG: number[][] = [
  [  0,   0,   0,   0,   0,   0,   0,   0],
  [  5,  10,  10,  10,  10,  10,  10,   5],  // 7th rank bonus
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [  0,   0,   0,   5,   5,   0,   0,   0],
];

const ROOK_EG: number[][] = [
  [  0,   0,   0,   0,   0,   0,   0,   0],
  [  5,  10,  10,  10,  10,  10,  10,   5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [  0,   0,   0,   5,   5,   0,   0,   0],
];

/** Queen PST - Slight center preference, avoid early development */
const QUEEN_MG: number[][] = [
  [-20, -10, -10,  -5,  -5, -10, -10, -20],
  [-10,   0,   0,   0,   0,   0,   0, -10],
  [-10,   0,   5,   5,   5,   5,   0, -10],
  [ -5,   0,   5,   5,   5,   5,   0,  -5],
  [  0,   0,   5,   5,   5,   5,   0,  -5],
  [-10,   5,   5,   5,   5,   5,   0, -10],
  [-10,   0,   5,   0,   0,   0,   0, -10],
  [-20, -10, -10,  -5,  -5, -10, -10, -20],
];

const QUEEN_EG: number[][] = [
  [-20, -10, -10,  -5,  -5, -10, -10, -20],
  [-10,   0,   0,   0,   0,   0,   0, -10],
  [-10,   0,   5,   5,   5,   5,   0, -10],
  [ -5,   0,   5,   5,   5,   5,   0,  -5],
  [  0,   0,   5,   5,   5,   5,   0,  -5],
  [-10,   5,   5,   5,   5,   5,   0, -10],
  [-10,   0,   5,   0,   0,   0,   0, -10],
  [-20, -10, -10,  -5,  -5, -10, -10, -20],
];

/** King PST - Middlegame: castle, stay safe */
const KING_MG: number[][] = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [ 20,  20,   0,   0,   0,   0,  20,  20],  // Castled position bonus
  [ 20,  30,  10,   0,   0,  10,  30,  20],
];

/** King PST - Endgame: centralize */
const KING_EG: number[][] = [
  [-50, -40, -30, -20, -20, -30, -40, -50],
  [-30, -20, -10,   0,   0, -10, -20, -30],
  [-30, -10,  20,  30,  30,  20, -10, -30],
  [-30, -10,  30,  40,  40,  30, -10, -30],
  [-30, -10,  30,  40,  40,  30, -10, -30],
  [-30, -10,  20,  30,  30,  20, -10, -30],
  [-30, -30,   0,   0,   0,   0, -30, -30],
  [-50, -30, -30, -30, -30, -30, -30, -50],
];

/** PST mapping by piece type */
const PST_MG: Record<PieceType, number[][]> = {
  p: PAWN_MG,
  n: KNIGHT_MG,
  b: BISHOP_MG,
  r: ROOK_MG,
  q: QUEEN_MG,
  k: KING_MG,
};

const PST_EG: Record<PieceType, number[][]> = {
  p: PAWN_EG,
  n: KNIGHT_EG,
  b: BISHOP_EG,
  r: ROOK_EG,
  q: QUEEN_EG,
  k: KING_EG,
};

// =============================================================================
// Evaluation Constants
// =============================================================================

/** Bonus for bishop pair */
const BISHOP_PAIR_BONUS = 30;

/** Pawn structure penalties */
const DOUBLED_PAWN_PENALTY = -10;
const ISOLATED_PAWN_PENALTY = -20;
const BACKWARD_PAWN_PENALTY = -10;

/** Pawn structure bonuses */
const PASSED_PAWN_BONUS = [0, 10, 20, 30, 50, 70, 90, 0]; // By rank
const CONNECTED_PAWN_BONUS = 5;

/** Rook bonuses */
const ROOK_OPEN_FILE_BONUS = 15;
const ROOK_SEMI_OPEN_FILE_BONUS = 10;
const ROOK_ON_SEVENTH_BONUS = 20;

/** King safety */
const KING_PAWN_SHIELD_BONUS = 10; // Per pawn
const KING_OPEN_FILE_PENALTY = -25;

/** Mobility weights */
const MOBILITY_WEIGHTS: Record<PieceType, number> = {
  p: 0,
  n: 4,
  b: 5,
  r: 2,
  q: 1,
  k: 0,
};

/** Center squares */
const CENTER_SQUARES: Square[] = ['d4', 'd5', 'e4', 'e5'];
const EXTENDED_CENTER: Square[] = ['c3', 'c4', 'c5', 'c6', 'd3', 'd4', 'd5', 'd6', 'e3', 'e4', 'e5', 'e6', 'f3', 'f4', 'f5', 'f6'];

// =============================================================================
// Pawn Hash Table
// =============================================================================

/**
 * Pawn hash table entry
 */
interface PawnHashEntry {
  score: number;
}

/**
 * Pawn hash table for caching pawn structure evaluation
 * Since pawn structure only depends on pawn positions, we can cache it
 */
class PawnHashTable {
  private table: Map<string, PawnHashEntry> = new Map();
  private maxSize: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number = 50000) {
    this.maxSize = maxSize;
  }

  /**
   * Extract pawn-only key from FEN
   * Only considers pawn positions, ignoring other pieces
   */
  getPawnKey(board: ReturnType<Chess['board']>): string {
    let key = '';
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'p') {
          key += piece.color + rank + file;
        }
      }
    }
    return key;
  }

  probe(key: string): PawnHashEntry | null {
    const entry = this.table.get(key);
    if (entry) {
      this.hits++;
      return entry;
    }
    this.misses++;
    return null;
  }

  store(key: string, score: number): void {
    // Evict if table is full
    if (this.table.size >= this.maxSize) {
      // Simple eviction: delete first 25% of entries
      const keysToDelete = Array.from(this.table.keys()).slice(0, Math.floor(this.maxSize / 4));
      for (const k of keysToDelete) {
        this.table.delete(k);
      }
    }
    this.table.set(key, { score });
  }

  clear(): void {
    this.table.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.table.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

// =============================================================================
// ChessEvaluator Class
// =============================================================================

export class ChessEvaluator {
  private config: EvaluatorConfig;
  private chess: Chess;
  private pawnHash: PawnHashTable;

  constructor(config: EvaluatorConfig = {}) {
    this.config = {
      useOpeningBook: false,
      useEndgameEval: true,
      evaluateKingSafety: true,
      evaluatePawnStructure: true,
      evaluateMobility: true,
      ...config,
    };
    this.chess = new Chess();
    this.pawnHash = new PawnHashTable();
  }

  /**
   * Evaluate a position
   * @param fen - Position in FEN notation
   * @returns Evaluation in centipawns (positive = white advantage)
   */
  evaluate(fen: string): number {
    this.chess.load(fen);
    return this.evaluateInternal();
  }

  /**
   * Evaluate directly from a Chess instance (avoids FEN parsing overhead)
   * @param chess - Chess.js instance with position already loaded
   * @returns Evaluation in centipawns (positive = white advantage)
   */
  evaluateFromChess(chess: Chess): number {
    // Load the position from the external chess instance into our internal one
    // This prevents us from modifying the caller's chess instance
    this.chess.load(chess.fen());
    return this.evaluateInternal();
  }

  /**
   * Internal evaluation logic
   * Note: Does NOT check for checkmate/draw as the search handles these
   */
  private evaluateInternal(): number {
    const breakdown = this.getEvaluationBreakdownInternal();
    return breakdown.total;
  }

  /**
   * Get detailed evaluation breakdown
   * @param fen - Position in FEN notation
   */
  getEvaluationBreakdown(fen: string): EvaluationBreakdown {
    this.chess.load(fen);
    return this.getEvaluationBreakdownInternal();
  }

  /**
   * Internal evaluation breakdown (assumes chess position is already loaded)
   */
  private getEvaluationBreakdownInternal(): EvaluationBreakdown {
    const board = this.chess.board();
    
    // Calculate game phase
    const phase = this.calculatePhase(board);
    
    // Material
    const material = this.evaluateMaterial(board, phase);
    
    // Piece-square tables
    const pieceSquares = this.evaluatePieceSquares(board, phase);
    
    // Pawn structure
    const pawnStructure = this.config.evaluatePawnStructure 
      ? this.evaluatePawnStructure(board) 
      : 0;
    
    // Mobility
    const mobility = this.config.evaluateMobility
      ? this.evaluateMobility()
      : 0;
    
    // King safety
    const kingSafety = this.config.evaluateKingSafety
      ? this.evaluateKingSafety(board, phase)
      : 0;
    
    // Center control
    const centerControl = this.evaluateCenterControl(board);
    
    // Bishop pair
    const bishopPair = this.evaluateBishopPair(board);
    
    // Rook on open file
    const rookOpenFile = this.evaluateRookOpenFiles(board);
    
    // Total
    const total = material + pieceSquares + pawnStructure + mobility + 
                  kingSafety + centerControl + bishopPair + rookOpenFile;

    return {
      material,
      pieceSquares,
      pawnStructure,
      mobility,
      kingSafety,
      centerControl,
      bishopPair,
      rookOpenFile,
      total: Math.round(total),
      gamePhase: phase,
    };
  }

  /**
   * Calculate game phase (0 = endgame, 256 = opening)
   */
  private calculatePhase(board: ReturnType<Chess['board']>): number {
    let phase = 0;
    
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.type !== 'k') {
          phase += PHASE_VALUES[piece.type as PieceType];
        }
      }
    }
    
    // Normalize to 0-256 range
    return Math.min(256, Math.round((phase / TOTAL_PHASE) * 256));
  }

  /**
   * Evaluate material with tapered values
   */
  private evaluateMaterial(board: ReturnType<Chess['board']>, phase: number): number {
    let mgWhite = 0, mgBlack = 0;
    let egWhite = 0, egBlack = 0;
    
    for (const row of board) {
      for (const piece of row) {
        if (piece) {
          const type = piece.type as PieceType;
          if (piece.color === 'w') {
            mgWhite += MG_PIECE_VALUES[type];
            egWhite += EG_PIECE_VALUES[type];
          } else {
            mgBlack += MG_PIECE_VALUES[type];
            egBlack += EG_PIECE_VALUES[type];
          }
        }
      }
    }
    
    const mgScore = mgWhite - mgBlack;
    const egScore = egWhite - egBlack;
    
    return this.taperScore(mgScore, egScore, phase);
  }

  /**
   * Evaluate piece-square tables with tapered values
   */
  private evaluatePieceSquares(board: ReturnType<Chess['board']>, phase: number): number {
    let mgScore = 0, egScore = 0;
    
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (!piece) continue;
        
        const type = piece.type as PieceType;
        const pstMg = PST_MG[type];
        const pstEg = PST_EG[type];
        
        // For white, use direct index. For black, flip vertically
        const pstRank = piece.color === 'w' ? rank : 7 - rank;
        
        if (piece.color === 'w') {
          mgScore += pstMg[pstRank][file];
          egScore += pstEg[pstRank][file];
        } else {
          mgScore -= pstMg[pstRank][file];
          egScore -= pstEg[pstRank][file];
        }
      }
    }
    
    return this.taperScore(mgScore, egScore, phase);
  }

  /**
   * Taper between middlegame and endgame scores
   */
  private taperScore(mgScore: number, egScore: number, phase: number): number {
    return Math.round((mgScore * phase + egScore * (256 - phase)) / 256);
  }

  /**
   * Evaluate pawn structure (with hash table caching)
   */
  private evaluatePawnStructure(board: ReturnType<Chess['board']>): number {
    // Check pawn hash table first
    const pawnKey = this.pawnHash.getPawnKey(board);
    const cached = this.pawnHash.probe(pawnKey);
    if (cached) {
      return cached.score;
    }
    
    // Calculate pawn structure
    const whitePawns = this.getPawnsByFile(board, 'w');
    const blackPawns = this.getPawnsByFile(board, 'b');
    
    let score = 0;
    
    // Evaluate white pawns
    score += this.evaluatePawnStructureForColor(whitePawns, blackPawns, 'w');
    
    // Evaluate black pawns
    score -= this.evaluatePawnStructureForColor(blackPawns, whitePawns, 'b');
    
    // Store in pawn hash table
    this.pawnHash.store(pawnKey, score);
    
    return score;
  }

  /**
   * Get pawn positions organized by file
   */
  private getPawnsByFile(board: ReturnType<Chess['board']>, color: Color): number[][] {
    const pawns: number[][] = Array(8).fill(null).map(() => []);
    
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'p' && piece.color === color) {
          // Convert to rank number (1-8)
          const actualRank = 8 - rank;
          pawns[file].push(actualRank);
        }
      }
    }
    
    return pawns;
  }

  /**
   * Evaluate pawn structure for one color
   */
  private evaluatePawnStructureForColor(
    ownPawns: number[][],
    oppPawns: number[][],
    color: Color
  ): number {
    let score = 0;
    
    for (let file = 0; file < 8; file++) {
      const pawnsOnFile = ownPawns[file];
      
      // Doubled pawns
      if (pawnsOnFile.length > 1) {
        score += DOUBLED_PAWN_PENALTY * (pawnsOnFile.length - 1);
      }
      
      for (const rank of pawnsOnFile) {
        // Isolated pawns (no friendly pawns on adjacent files)
        const hasNeighbor = (file > 0 && ownPawns[file - 1].length > 0) ||
                           (file < 7 && ownPawns[file + 1].length > 0);
        if (!hasNeighbor) {
          score += ISOLATED_PAWN_PENALTY;
        }
        
        // Passed pawns (no enemy pawns ahead on same or adjacent files)
        const isPassed = this.isPassedPawn(file, rank, oppPawns, color);
        if (isPassed) {
          const passedRank = color === 'w' ? rank : 9 - rank;
          score += PASSED_PAWN_BONUS[passedRank] || 0;
        }
        
        // Connected pawns
        if (file > 0 && ownPawns[file - 1].includes(rank)) {
          score += CONNECTED_PAWN_BONUS;
        }
      }
    }
    
    return score;
  }

  /**
   * Check if a pawn is passed
   */
  private isPassedPawn(file: number, rank: number, oppPawns: number[][], color: Color): boolean {
    const filesToCheck = [file - 1, file, file + 1].filter(f => f >= 0 && f < 8);
    
    for (const f of filesToCheck) {
      for (const oppRank of oppPawns[f]) {
        if (color === 'w' && oppRank > rank) return false;
        if (color === 'b' && oppRank < rank) return false;
      }
    }
    
    return true;
  }

  /**
   * Evaluate mobility (number of legal moves)
   */
  private evaluateMobility(): number {
    // Current side mobility
    const currentMoves = this.chess.moves().length;
    
    // Switch sides and count opponent mobility
    const fen = this.chess.fen();
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    
    try {
      this.chess.load(parts.join(' '));
      const oppMoves = this.chess.moves().length;
      this.chess.load(fen); // Restore
      
      const currentColor = parts[1] === 'b' ? 'w' : 'b'; // Original color
      const mobilityDiff = currentMoves - oppMoves;
      
      return currentColor === 'w' ? mobilityDiff * 2 : -mobilityDiff * 2;
    } catch {
      this.chess.load(fen);
      return 0;
    }
  }

  /**
   * Evaluate king safety
   */
  private evaluateKingSafety(board: ReturnType<Chess['board']>, phase: number): number {
    if (phase < 64) return 0; // Skip in endgame
    
    let whiteKingSafety = 0;
    let blackKingSafety = 0;
    
    // Find kings
    let whiteKingFile = -1, whiteKingRank = -1;
    let blackKingFile = -1, blackKingRank = -1;
    
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece?.type === 'k') {
          if (piece.color === 'w') {
            whiteKingFile = file;
            whiteKingRank = rank;
          } else {
            blackKingFile = file;
            blackKingRank = rank;
          }
        }
      }
    }
    
    // Evaluate pawn shield for white
    if (whiteKingRank >= 6) { // King on 1st or 2nd rank
      whiteKingSafety += this.evaluatePawnShield(board, whiteKingFile, whiteKingRank, 'w');
    }
    
    // Evaluate pawn shield for black
    if (blackKingRank <= 1) { // King on 7th or 8th rank
      blackKingSafety += this.evaluatePawnShield(board, blackKingFile, blackKingRank, 'b');
    }
    
    return Math.round(((whiteKingSafety - blackKingSafety) * phase) / 256);
  }

  /**
   * Evaluate pawn shield around king
   */
  private evaluatePawnShield(
    board: ReturnType<Chess['board']>,
    kingFile: number,
    kingRank: number,
    color: Color
  ): number {
    let score = 0;
    const direction = color === 'w' ? -1 : 1;
    const shieldRank = kingRank + direction;
    
    if (shieldRank < 0 || shieldRank > 7) return 0;
    
    // Check files around king
    for (let f = Math.max(0, kingFile - 1); f <= Math.min(7, kingFile + 1); f++) {
      const piece = board[shieldRank][f];
      if (piece?.type === 'p' && piece.color === color) {
        score += KING_PAWN_SHIELD_BONUS;
      }
    }
    
    return score;
  }

  /**
   * Evaluate center control
   */
  private evaluateCenterControl(board: ReturnType<Chess['board']>): number {
    let score = 0;
    
    for (const sq of CENTER_SQUARES) {
      const file = sq.charCodeAt(0) - 97;
      const rank = 8 - parseInt(sq[1], 10);
      const piece = board[rank][file];
      
      if (piece) {
        // Piece on center square
        const bonus = piece.type === 'p' ? 10 : 5;
        score += piece.color === 'w' ? bonus : -bonus;
      }
    }
    
    return score;
  }

  /**
   * Evaluate bishop pair bonus
   */
  private evaluateBishopPair(board: ReturnType<Chess['board']>): number {
    let whiteBishops = 0, blackBishops = 0;
    
    for (const row of board) {
      for (const piece of row) {
        if (piece?.type === 'b') {
          if (piece.color === 'w') whiteBishops++;
          else blackBishops++;
        }
      }
    }
    
    let score = 0;
    if (whiteBishops >= 2) score += BISHOP_PAIR_BONUS;
    if (blackBishops >= 2) score -= BISHOP_PAIR_BONUS;
    
    return score;
  }

  /**
   * Evaluate rooks on open/semi-open files
   */
  private evaluateRookOpenFiles(board: ReturnType<Chess['board']>): number {
    let score = 0;
    
    // Find pawns by file
    const whitePawnFiles = new Set<number>();
    const blackPawnFiles = new Set<number>();
    
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece?.type === 'p') {
          if (piece.color === 'w') whitePawnFiles.add(file);
          else blackPawnFiles.add(file);
        }
      }
    }
    
    // Evaluate rooks
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece?.type === 'r') {
          const hasOwnPawn = piece.color === 'w' 
            ? whitePawnFiles.has(file) 
            : blackPawnFiles.has(file);
          const hasOppPawn = piece.color === 'w'
            ? blackPawnFiles.has(file)
            : whitePawnFiles.has(file);
          
          let bonus = 0;
          if (!hasOwnPawn && !hasOppPawn) {
            bonus = ROOK_OPEN_FILE_BONUS;
          } else if (!hasOwnPawn) {
            bonus = ROOK_SEMI_OPEN_FILE_BONUS;
          }
          
          // 7th rank bonus
          const actualRank = piece.color === 'w' ? 8 - rank : rank + 1;
          if (actualRank === 7) {
            bonus += ROOK_ON_SEVENTH_BONUS;
          }
          
          score += piece.color === 'w' ? bonus : -bonus;
        }
      }
    }
    
    return score;
  }

  /**
   * Analyze pawn structure for a position
   */
  analyzePawnStructure(fen: string): { white: PawnStructure; black: PawnStructure } {
    this.chess.load(fen);
    const board = this.chess.board();
    
    const whitePawns = this.getPawnsByFile(board, 'w');
    const blackPawns = this.getPawnsByFile(board, 'b');
    
    return {
      white: this.getPawnStructureDetails(whitePawns, blackPawns, 'w'),
      black: this.getPawnStructureDetails(blackPawns, whitePawns, 'b'),
    };
  }

  private getPawnStructureDetails(
    ownPawns: number[][],
    oppPawns: number[][],
    color: Color
  ): PawnStructure {
    let doubled = 0, isolated = 0, passed = 0, backward = 0, connected = 0;
    let islands = 0;
    let inIsland = false;
    
    for (let file = 0; file < 8; file++) {
      const pawnsOnFile = ownPawns[file];
      
      if (pawnsOnFile.length > 0) {
        if (!inIsland) {
          islands++;
          inIsland = true;
        }
      } else {
        inIsland = false;
        continue;
      }
      
      // Doubled
      if (pawnsOnFile.length > 1) {
        doubled += pawnsOnFile.length - 1;
      }
      
      for (const rank of pawnsOnFile) {
        // Isolated
        const hasNeighbor = (file > 0 && ownPawns[file - 1].length > 0) ||
                           (file < 7 && ownPawns[file + 1].length > 0);
        if (!hasNeighbor) isolated++;
        
        // Passed
        if (this.isPassedPawn(file, rank, oppPawns, color)) passed++;
        
        // Connected
        if (file > 0 && ownPawns[file - 1].includes(rank)) connected++;
      }
    }
    
    return { doubled, isolated, passed, backward, connected, islands };
  }

  /**
   * Clear the pawn hash table
   */
  clearPawnHash(): void {
    this.pawnHash.clear();
  }

  /**
   * Get pawn hash table statistics
   */
  getPawnHashStats(): { hits: number; misses: number; size: number; hitRate: number } {
    return this.pawnHash.getStats();
  }
}

/**
 * Create a new evaluator instance
 */
export function createChessEvaluator(config?: EvaluatorConfig): ChessEvaluator {
  return new ChessEvaluator(config);
}

/**
 * Quick static evaluation for sorting moves
 */
export function quickEvaluate(fen: string): number {
  const chess = new Chess(fen);
  
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -30000 : 30000;
  }
  if (chess.isDraw()) {
    return 0;
  }
  
  // Simple material count
  let score = 0;
  const board = chess.board();
  
  for (const row of board) {
    for (const piece of row) {
      if (piece) {
        const value = MG_PIECE_VALUES[piece.type as PieceType];
        score += piece.color === 'w' ? value : -value;
      }
    }
  }
  
  return score;
}
