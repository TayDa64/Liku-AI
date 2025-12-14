/**
 * ChessZobrist - Proper 64-bit Zobrist Hashing
 * 
 * Implements efficient position hashing for transposition table:
 * - True 64-bit keys using BigInt for minimal collisions
 * - Pre-generated random keys for pieces, castling, en passant, side
 * - Incremental update support (XOR in/out pieces)
 * - Compatible with standard Zobrist implementations
 * 
 * @module chess/ChessZobrist
 */

import { Chess } from 'chess.js';

// =============================================================================
// Types
// =============================================================================

/** Zobrist key tables */
export interface ZobristKeys {
  /** Piece keys: [colorIndex][pieceIndex][squareIndex] */
  pieces: bigint[][][];
  /** Key for black to move (XOR when it's black's turn) */
  sideToMove: bigint;
  /** Castling rights keys [K, Q, k, q] */
  castling: bigint[];
  /** En passant file keys [a-h files] */
  enPassant: bigint[];
}

/** Piece type to index mapping */
const PIECE_INDEX: Record<string, number> = {
  p: 0, n: 1, b: 2, r: 3, q: 4, k: 5,
};

/** Color to index mapping */
const COLOR_INDEX: Record<string, number> = {
  w: 0, b: 1,
};

// =============================================================================
// Random Number Generation
// =============================================================================

/**
 * Generate a pseudo-random 64-bit BigInt
 * Uses a seeded PRNG for reproducibility across sessions
 */
class PRNG {
  private state: bigint;

  constructor(seed: bigint = 0x12345678ABCDEF01n) {
    this.state = seed;
  }

  /** 
   * xorshift64* algorithm - fast, high-quality PRNG
   * Used by many chess engines (Stockfish uses similar)
   */
  next(): bigint {
    let x = this.state;
    x ^= x >> 12n;
    x ^= x << 25n;
    x ^= x >> 27n;
    this.state = x;
    return (x * 0x2545F4914F6CDD1Dn) & 0xFFFFFFFFFFFFFFFFn;
  }
}

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate all Zobrist keys
 * Uses deterministic PRNG seed so keys are identical across runs
 */
function generateZobristKeys(): ZobristKeys {
  // Seed chosen for good distribution (prime-based)
  const rng = new PRNG(0x1234567890ABCDEFn);

  // Piece keys: 2 colors × 6 piece types × 64 squares = 768 keys
  const pieces: bigint[][][] = [];
  for (let color = 0; color < 2; color++) {
    pieces[color] = [];
    for (let piece = 0; piece < 6; piece++) {
      pieces[color][piece] = [];
      for (let square = 0; square < 64; square++) {
        pieces[color][piece][square] = rng.next();
      }
    }
  }

  // Side to move key (XOR when black to move)
  const sideToMove = rng.next();

  // Castling keys: K, Q, k, q
  const castling = [rng.next(), rng.next(), rng.next(), rng.next()];

  // En passant file keys: a-h (only need file, not full square)
  const enPassant = [];
  for (let file = 0; file < 8; file++) {
    enPassant.push(rng.next());
  }

  return { pieces, sideToMove, castling, enPassant };
}

// Pre-generate keys at module load (deterministic, ~768 BigInts)
const ZOBRIST_KEYS = generateZobristKeys();

// =============================================================================
// Hash Computation
// =============================================================================

/**
 * Convert algebraic square to index (0-63)
 * a1=0, b1=1, ... h1=7, a2=8, ... h8=63
 */
function squareToIndex(square: string): number {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
  const rank = parseInt(square[1]) - 1; // 0-7
  return rank * 8 + file;
}

/**
 * Compute Zobrist hash from FEN string
 * This is the "full computation" method - use for initial position
 * 
 * @param fen - Chess position in FEN notation
 * @returns 64-bit hash as BigInt
 */
export function computeZobristHash(fen: string): bigint {
  let hash = 0n;
  
  const parts = fen.split(' ');
  const position = parts[0];
  const turn = parts[1];
  const castling = parts[2];
  const enPassant = parts[3];

  // Hash pieces
  const rows = position.split('/');
  for (let rank = 7; rank >= 0; rank--) {
    const row = rows[7 - rank];
    let file = 0;
    
    for (const char of row) {
      if (/\d/.test(char)) {
        // Empty squares - skip
        file += parseInt(char);
      } else {
        // Piece
        const color = char === char.toUpperCase() ? 0 : 1;
        const pieceType = PIECE_INDEX[char.toLowerCase()];
        const squareIndex = rank * 8 + file;
        
        hash ^= ZOBRIST_KEYS.pieces[color][pieceType][squareIndex];
        file++;
      }
    }
  }

  // Hash side to move
  if (turn === 'b') {
    hash ^= ZOBRIST_KEYS.sideToMove;
  }

  // Hash castling rights
  if (castling !== '-') {
    if (castling.includes('K')) hash ^= ZOBRIST_KEYS.castling[0];
    if (castling.includes('Q')) hash ^= ZOBRIST_KEYS.castling[1];
    if (castling.includes('k')) hash ^= ZOBRIST_KEYS.castling[2];
    if (castling.includes('q')) hash ^= ZOBRIST_KEYS.castling[3];
  }

  // Hash en passant file (only if there's an en passant square)
  if (enPassant !== '-') {
    const epFile = enPassant.charCodeAt(0) - 'a'.charCodeAt(0);
    hash ^= ZOBRIST_KEYS.enPassant[epFile];
  }

  return hash;
}

/**
 * Get the Zobrist key for a piece on a square
 * Used for incremental updates
 */
export function getPieceKey(color: 'w' | 'b', pieceType: string, square: string): bigint {
  const colorIdx = COLOR_INDEX[color];
  const pieceIdx = PIECE_INDEX[pieceType.toLowerCase()];
  const squareIdx = squareToIndex(square);
  return ZOBRIST_KEYS.pieces[colorIdx][pieceIdx][squareIdx];
}

/**
 * Get the Zobrist key for side to move
 */
export function getSideKey(): bigint {
  return ZOBRIST_KEYS.sideToMove;
}

/**
 * Get the Zobrist key for a castling right
 */
export function getCastlingKey(right: 'K' | 'Q' | 'k' | 'q'): bigint {
  const index = ['K', 'Q', 'k', 'q'].indexOf(right);
  return ZOBRIST_KEYS.castling[index];
}

/**
 * Get the Zobrist key for en passant on a file
 */
export function getEnPassantKey(file: number): bigint {
  return ZOBRIST_KEYS.enPassant[file];
}

// =============================================================================
// Incremental Update Helpers
// =============================================================================

/**
 * Update hash after a move (incremental - faster than full recompute)
 * 
 * This XORs out the old state and XORs in the new state
 * 
 * @param oldHash - Hash before the move
 * @param chess - Chess.js instance AFTER the move was made
 * @param move - The move that was made (from chess.js verbose format)
 * @returns New hash
 */
export function updateHashAfterMove(
  oldHash: bigint,
  chess: Chess,
  move: {
    from: string;
    to: string;
    piece: string;
    color: 'w' | 'b';
    captured?: string;
    promotion?: string;
    flags: string;
  }
): bigint {
  let hash = oldHash;
  const colorIdx = COLOR_INDEX[move.color];
  const pieceIdx = PIECE_INDEX[move.piece];
  const fromIdx = squareToIndex(move.from);
  const toIdx = squareToIndex(move.to);

  // Remove piece from origin
  hash ^= ZOBRIST_KEYS.pieces[colorIdx][pieceIdx][fromIdx];

  // Handle capture (remove captured piece)
  if (move.captured) {
    const capturedColorIdx = 1 - colorIdx;
    const capturedPieceIdx = PIECE_INDEX[move.captured];
    
    // En passant capture - piece is not on 'to' square
    if (move.flags.includes('e')) {
      const epSquareIdx = move.color === 'w' 
        ? toIdx - 8  // Captured pawn is one rank below
        : toIdx + 8; // Captured pawn is one rank above
      hash ^= ZOBRIST_KEYS.pieces[capturedColorIdx][capturedPieceIdx][epSquareIdx];
    } else {
      hash ^= ZOBRIST_KEYS.pieces[capturedColorIdx][capturedPieceIdx][toIdx];
    }
  }

  // Add piece to destination (handle promotion)
  if (move.promotion) {
    const promoIdx = PIECE_INDEX[move.promotion];
    hash ^= ZOBRIST_KEYS.pieces[colorIdx][promoIdx][toIdx];
  } else {
    hash ^= ZOBRIST_KEYS.pieces[colorIdx][pieceIdx][toIdx];
  }

  // Handle castling (move the rook)
  if (move.flags.includes('k')) {
    // Kingside castle
    const rookFromIdx = squareToIndex(move.color === 'w' ? 'h1' : 'h8');
    const rookToIdx = squareToIndex(move.color === 'w' ? 'f1' : 'f8');
    const rookIdx = PIECE_INDEX['r'];
    hash ^= ZOBRIST_KEYS.pieces[colorIdx][rookIdx][rookFromIdx];
    hash ^= ZOBRIST_KEYS.pieces[colorIdx][rookIdx][rookToIdx];
  } else if (move.flags.includes('q')) {
    // Queenside castle
    const rookFromIdx = squareToIndex(move.color === 'w' ? 'a1' : 'a8');
    const rookToIdx = squareToIndex(move.color === 'w' ? 'd1' : 'd8');
    const rookIdx = PIECE_INDEX['r'];
    hash ^= ZOBRIST_KEYS.pieces[colorIdx][rookIdx][rookFromIdx];
    hash ^= ZOBRIST_KEYS.pieces[colorIdx][rookIdx][rookToIdx];
  }

  // Toggle side to move
  hash ^= ZOBRIST_KEYS.sideToMove;

  // Note: Castling rights and en passant changes are complex to track incrementally
  // For now, we handle them in the full recompute path. A production engine would
  // track these changes incrementally too.

  return hash;
}

// =============================================================================
// Verification / Testing
// =============================================================================

/**
 * Verify that incremental and full hash computation match
 * Used for debugging/testing
 */
export function verifyHash(chess: Chess, incrementalHash: bigint): boolean {
  const fullHash = computeZobristHash(chess.fen());
  return fullHash === incrementalHash;
}

/**
 * Get the pre-generated Zobrist keys (for testing/debugging)
 */
export function getZobristKeys(): Readonly<ZobristKeys> {
  return ZOBRIST_KEYS;
}

// =============================================================================
// Export Constants
// =============================================================================

export { ZOBRIST_KEYS, PIECE_INDEX, COLOR_INDEX, squareToIndex };
