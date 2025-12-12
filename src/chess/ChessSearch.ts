/**
 * ChessSearch - Alpha-Beta Search with Enhancements
 * 
 * Implements a professional-grade chess search algorithm including:
 * - Alpha-beta pruning with fail-soft
 * - Iterative deepening with aspiration windows
 * - Quiescence search to avoid horizon effect
 * - Transposition table with Zobrist hashing
 * - Move ordering (hash move, MVV-LVA, killers, history)
 * - Null move pruning
 * - Late move reductions (LMR)
 * - Principal variation search (PVS)
 * - Check extensions
 * - Time management
 */

import { Chess, Move as ChessJsMove } from 'chess.js';
import { ChessEvaluator } from './ChessEvaluator.js';
import {
  Color,
  DEFAULT_SEARCH_CONFIG,
  Move,
  PieceType,
  SearchConfig,
  SearchResult,
  SearchStats,
  Square,
  TTEntry,
  TTEntryType,
} from './types.js';

// =============================================================================
// Constants
// =============================================================================

const INFINITY = 100000;
const MATE_SCORE = 50000;
const MATE_THRESHOLD = 49000;

/** MVV-LVA values for capture ordering */
const MVV_VALUES: Record<PieceType, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 100,
};

const LVA_VALUES: Record<PieceType, number> = {
  p: 6, n: 5, b: 5, r: 4, q: 3, k: 2,
};

// =============================================================================
// Zobrist Hashing
// =============================================================================

/** Generate random 64-bit-like number (using two 32-bit numbers) */
function randomHash(): string {
  return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
}

// Pre-generate Zobrist keys
const ZOBRIST: {
  pieces: Record<string, Record<string, string>>; // [square][piece] -> hash
  turn: string;
  castling: Record<string, string>;
  enPassant: Record<string, string>;
} = {
  pieces: {},
  turn: randomHash(),
  castling: { K: randomHash(), Q: randomHash(), k: randomHash(), q: randomHash() },
  enPassant: {},
};

// Initialize piece keys
const files = 'abcdefgh';
const ranks = '12345678';
const pieces = ['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];

for (const f of files) {
  for (const r of ranks) {
    const sq = f + r;
    ZOBRIST.pieces[sq] = {};
    for (const p of pieces) {
      ZOBRIST.pieces[sq][p] = randomHash();
    }
    ZOBRIST.enPassant[sq] = randomHash();
  }
}

// =============================================================================
// ChessSearch Class
// =============================================================================

export class ChessSearch {
  private config: SearchConfig;
  private evaluator: ChessEvaluator;
  private chess: Chess;
  
  // Transposition table
  private tt: Map<string, TTEntry> = new Map();
  private ttAge: number = 0;
  
  // Killer moves (2 per ply)
  private killers: string[][] = [];
  
  // History heuristic
  private history: Map<string, number> = new Map();
  
  // Search stats
  private stats: SearchStats = this.initStats();
  
  // Time management
  private searchStartTime: number = 0;
  private timeLimit: number = 0;
  private stopSearch: boolean = false;
  
  // Principal variation
  private pvTable: string[][] = [];
  private pvLength: number[] = [];

  constructor(evaluator?: ChessEvaluator, config?: Partial<SearchConfig>) {
    this.config = { ...DEFAULT_SEARCH_CONFIG, ...config };
    this.evaluator = evaluator || new ChessEvaluator();
    this.chess = new Chess();
    
    // Initialize killer move array
    for (let i = 0; i < 64; i++) {
      this.killers[i] = ['', ''];
    }
    
    // Initialize PV tables
    for (let i = 0; i < 64; i++) {
      this.pvTable[i] = [];
      this.pvLength[i] = 0;
    }
  }

  /**
   * Search for the best move
   * @param fen - Position to search
   * @param maxDepth - Optional depth override
   * @param maxTime - Optional time limit override (ms)
   */
  search(fen: string, maxDepth?: number, maxTime?: number): SearchResult {
    this.chess.load(fen);
    this.stats = this.initStats();
    this.stopSearch = false;
    this.searchStartTime = Date.now();
    this.timeLimit = maxTime ?? this.config.maxTime;
    this.ttAge++;
    
    const depth = maxDepth ?? this.config.maxDepth;
    
    // Clear history at start of new search
    this.history.clear();
    
    let bestMove = '';
    let bestScore = -INFINITY;
    let completedDepth = 0;
    let pv: string[] = [];
    
    // Iterative deepening
    for (let d = 1; d <= depth; d++) {
      // Reset PV for this iteration
      for (let i = 0; i < 64; i++) {
        this.pvLength[i] = 0;
      }
      
      let alpha = -INFINITY;
      let beta = INFINITY;
      
      // Aspiration windows (after depth 4)
      if (this.config.useAspirationWindows && d > 4 && bestScore !== -INFINITY) {
        alpha = bestScore - 50;
        beta = bestScore + 50;
      }
      
      let score: number;
      let researches = 0;
      
      // Search with aspiration window, re-search if outside window
      do {
        score = this.alphaBeta(d, alpha, beta, true, 0);
        
        if (this.stopSearch) break;
        
        if (score <= alpha) {
          alpha = -INFINITY;
          researches++;
        } else if (score >= beta) {
          beta = INFINITY;
          researches++;
        }
      } while ((score <= alpha || score >= beta) && researches < 3);
      
      if (this.stopSearch && completedDepth > 0) {
        // Use results from last completed iteration
        break;
      }
      
      // Extract PV from table
      if (this.pvLength[0] > 0) {
        pv = [...this.pvTable[0].slice(0, this.pvLength[0])];
        if (pv.length > 0) {
          bestMove = pv[0];
          bestScore = score;
          completedDepth = d;
        }
      }
      
      // If we found a mate, stop searching
      if (Math.abs(score) > MATE_THRESHOLD) {
        break;
      }
    }
    
    const elapsed = Date.now() - this.searchStartTime;
    
    return {
      bestMove,
      score: bestScore,
      depth: completedDepth,
      seldepth: this.stats.seldepth,
      nodes: this.stats.nodes,
      time: elapsed,
      pv,
      aborted: this.stopSearch,
      hashFull: Math.round((this.tt.size / (this.config.ttSizeMB * 1024)) * 1000),
      nps: elapsed > 0 ? Math.round((this.stats.nodes / elapsed) * 1000) : 0,
    };
  }

  /**
   * Alpha-beta search with fail-soft
   */
  private alphaBeta(
    depth: number,
    alpha: number,
    beta: number,
    isPV: boolean,
    ply: number
  ): number {
    // Check time
    if (this.shouldStop()) {
      this.stopSearch = true;
      return 0;
    }
    
    this.pvLength[ply] = 0;
    
    // Check for draw
    if (this.chess.isDraw()) {
      return 0;
    }
    
    // Terminal node
    if (depth <= 0) {
      if (this.config.useQuiescence) {
        return this.quiescence(alpha, beta, ply);
      }
      return this.evaluator.evaluate(this.chess.fen());
    }
    
    this.stats.nodes++;
    
    const inCheck = this.chess.isCheck();
    
    // Check extension
    if (inCheck) {
      depth++;
    }
    
    // Probe transposition table
    const hash = this.computeHash();
    const ttEntry = this.tt.get(hash);
    let ttMove: string | null = null;
    
    if (ttEntry && ttEntry.depth >= depth) {
      this.stats.ttHits++;
      ttMove = ttEntry.bestMove;
      
      if (!isPV) {
        if (ttEntry.type === 'EXACT') {
          this.stats.ttCutoffs++;
          return ttEntry.score;
        } else if (ttEntry.type === 'LOWER' && ttEntry.score >= beta) {
          this.stats.ttCutoffs++;
          return ttEntry.score;
        } else if (ttEntry.type === 'UPPER' && ttEntry.score <= alpha) {
          this.stats.ttCutoffs++;
          return ttEntry.score;
        }
      }
    } else if (ttEntry) {
      ttMove = ttEntry.bestMove;
    }
    
    // Null move pruning
    if (this.config.useNullMove && !isPV && !inCheck && depth >= 3 && this.hasNonPawnMaterial()) {
      // Make null move
      const fen = this.chess.fen();
      const parts = fen.split(' ');
      parts[1] = parts[1] === 'w' ? 'b' : 'w';
      parts[3] = '-'; // Clear en passant
      
      try {
        this.chess.load(parts.join(' '));
        const R = depth > 6 ? 3 : 2;
        const nullScore = -this.alphaBeta(depth - R - 1, -beta, -beta + 1, false, ply + 1);
        this.chess.load(fen);
        
        if (nullScore >= beta) {
          this.stats.nullMoveCutoffs++;
          return beta;
        }
      } catch {
        this.chess.load(fen);
      }
    }
    
    // Generate and order moves
    const moves = this.orderMoves(this.chess.moves({ verbose: true }) as ChessJsMove[], ply, ttMove);
    
    if (moves.length === 0) {
      // Checkmate or stalemate
      if (inCheck) {
        return -MATE_SCORE + ply; // Checkmate
      }
      return 0; // Stalemate
    }
    
    let bestScore = -INFINITY;
    let bestMove = '';
    let movesSearched = 0;
    const origAlpha = alpha;
    
    for (const move of moves) {
      this.chess.move(move);
      let score: number;
      
      // PVS: Search first move with full window, others with null window
      if (movesSearched === 0) {
        score = -this.alphaBeta(depth - 1, -beta, -alpha, isPV, ply + 1);
      } else {
        // Late Move Reductions
        let reduction = 0;
        if (this.config.useLMR && depth >= 3 && movesSearched >= 3 && !inCheck && !move.captured) {
          reduction = Math.floor(Math.sqrt(depth - 1) + Math.sqrt(movesSearched - 1));
          if (isPV) reduction = Math.max(0, reduction - 1);
          this.stats.lmrReductions++;
        }
        
        // Null window search
        score = -this.alphaBeta(depth - 1 - reduction, -alpha - 1, -alpha, false, ply + 1);
        
        // Re-search if failed high
        if (score > alpha && (isPV || reduction > 0)) {
          score = -this.alphaBeta(depth - 1, -beta, -alpha, isPV, ply + 1);
        }
      }
      
      this.chess.undo();
      
      if (this.stopSearch) return 0;
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move.san;
        
        if (score > alpha) {
          alpha = score;
          
          // Update PV
          this.pvTable[ply][0] = move.san;
          for (let i = 0; i < this.pvLength[ply + 1]; i++) {
            this.pvTable[ply][i + 1] = this.pvTable[ply + 1][i];
          }
          this.pvLength[ply] = this.pvLength[ply + 1] + 1;
          
          if (score >= beta) {
            this.stats.betaCutoffs++;
            
            // Update killers for quiet moves
            if (!move.captured) {
              this.updateKillers(move.san, ply);
              this.updateHistory(move, depth);
            }
            
            break;
          }
        }
      }
      
      movesSearched++;
    }
    
    // Store in transposition table
    let ttType: TTEntryType;
    if (bestScore <= origAlpha) {
      ttType = 'UPPER';
    } else if (bestScore >= beta) {
      ttType = 'LOWER';
    } else {
      ttType = 'EXACT';
    }
    
    this.storeEntry(hash, depth, bestScore, ttType, bestMove);
    
    return bestScore;
  }

  /**
   * Quiescence search - search captures until position is quiet
   */
  private quiescence(alpha: number, beta: number, ply: number): number {
    this.stats.qNodes++;
    
    if (ply > this.stats.seldepth) {
      this.stats.seldepth = ply;
    }
    
    // Stand pat
    const standPat = this.evaluator.evaluate(this.chess.fen());
    
    if (standPat >= beta) {
      return beta;
    }
    
    if (standPat > alpha) {
      alpha = standPat;
    }
    
    // Generate captures only
    const allMoves = this.chess.moves({ verbose: true }) as ChessJsMove[];
    const captures = allMoves.filter(m => m.captured);
    
    // Order captures by MVV-LVA
    captures.sort((a, b) => this.mvvLva(b) - this.mvvLva(a));
    
    for (const move of captures) {
      // Delta pruning - skip captures that can't improve alpha
      const captureValue = MVV_VALUES[move.captured as PieceType] * 100;
      if (standPat + captureValue + 200 < alpha) {
        continue;
      }
      
      this.chess.move(move);
      const score = -this.quiescence(-beta, -alpha, ply + 1);
      this.chess.undo();
      
      if (score >= beta) {
        return beta;
      }
      if (score > alpha) {
        alpha = score;
      }
    }
    
    return alpha;
  }

  /**
   * Order moves for better pruning
   */
  private orderMoves(moves: ChessJsMove[], ply: number, ttMove: string | null): ChessJsMove[] {
    const scored: Array<{ move: ChessJsMove; score: number }> = [];
    
    for (const move of moves) {
      let score = 0;
      
      // TT move gets highest priority
      if (ttMove && move.san === ttMove) {
        score = 10000000;
      }
      // Captures: MVV-LVA
      else if (move.captured) {
        score = 1000000 + this.mvvLva(move);
      }
      // Promotions
      else if (move.promotion) {
        const promoValue = MVV_VALUES[move.promotion as PieceType];
        score = 900000 + promoValue * 100;
      }
      // Killer moves
      else if (this.config.useKillerMoves) {
        if (this.killers[ply][0] === move.san) {
          score = 800000;
        } else if (this.killers[ply][1] === move.san) {
          score = 700000;
        }
      }
      
      // History heuristic
      if (this.config.useHistoryHeuristic && score < 700000) {
        const historyKey = `${move.from}${move.to}`;
        score += this.history.get(historyKey) || 0;
      }
      
      scored.push({ move, score });
    }
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    return scored.map(s => s.move);
  }

  /**
   * MVV-LVA scoring for captures
   */
  private mvvLva(move: ChessJsMove): number {
    if (!move.captured) return 0;
    const victim = MVV_VALUES[move.captured as PieceType];
    const attacker = LVA_VALUES[move.piece as PieceType];
    return victim * 10 + attacker;
  }

  /**
   * Update killer moves
   */
  private updateKillers(move: string, ply: number): void {
    if (this.killers[ply][0] !== move) {
      this.killers[ply][1] = this.killers[ply][0];
      this.killers[ply][0] = move;
    }
  }

  /**
   * Update history heuristic
   */
  private updateHistory(move: ChessJsMove, depth: number): void {
    const key = `${move.from}${move.to}`;
    const current = this.history.get(key) || 0;
    this.history.set(key, current + depth * depth);
  }

  /**
   * Check if position has non-pawn material (for null move pruning)
   */
  private hasNonPawnMaterial(): boolean {
    const board = this.chess.board();
    const turn = this.chess.turn();
    
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.color === turn && piece.type !== 'p' && piece.type !== 'k') {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Compute position hash
   */
  private computeHash(): string {
    const fen = this.chess.fen();
    // Use first 4 parts of FEN (position, turn, castling, en passant)
    return fen.split(' ').slice(0, 4).join(' ');
  }

  /**
   * Store entry in transposition table
   */
  private storeEntry(
    hash: string,
    depth: number,
    score: number,
    type: TTEntryType,
    bestMove: string
  ): void {
    const existing = this.tt.get(hash);
    
    // Replace if:
    // - No existing entry
    // - New entry is deeper
    // - Existing entry is from older search
    // - New entry is exact and old was bound
    if (!existing || 
        depth >= existing.depth || 
        existing.age < this.ttAge ||
        (type === 'EXACT' && existing.type !== 'EXACT')) {
      
      // Enforce size limit (rough)
      if (this.tt.size > this.config.ttSizeMB * 1024 * 16) {
        // Clear oldest entries
        const toDelete: string[] = [];
        for (const [key, entry] of this.tt) {
          if (entry.age < this.ttAge - 1) {
            toDelete.push(key);
          }
          if (toDelete.length > this.tt.size / 4) break;
        }
        toDelete.forEach(k => this.tt.delete(k));
      }
      
      this.tt.set(hash, {
        hash,
        depth,
        score,
        type,
        bestMove,
        age: this.ttAge,
      });
    }
  }

  /**
   * Check if we should stop searching
   */
  private shouldStop(): boolean {
    if (this.stopSearch) return true;
    
    // Check time every 1024 nodes
    if (this.stats.nodes % 1024 === 0) {
      const elapsed = Date.now() - this.searchStartTime;
      if (elapsed >= this.timeLimit) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Initialize search statistics
   */
  private initStats(): SearchStats {
    return {
      nodes: 0,
      depth: 0,
      seldepth: 0,
      time: 0,
      nps: 0,
      ttHits: 0,
      ttCutoffs: 0,
      betaCutoffs: 0,
      nullMoveCutoffs: 0,
      lmrReductions: 0,
      qNodes: 0,
    };
  }

  /**
   * Get search statistics
   */
  getStats(): SearchStats {
    return { ...this.stats };
  }

  /**
   * Clear transposition table
   */
  clearTT(): void {
    this.tt.clear();
    this.ttAge = 0;
  }

  /**
   * Set time limit for current/next search
   */
  setTimeLimit(ms: number): void {
    this.timeLimit = ms;
  }

  /**
   * Stop ongoing search
   */
  stop(): void {
    this.stopSearch = true;
  }

  /**
   * Get transposition table size
   */
  getTTSize(): number {
    return this.tt.size;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<SearchConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a new search instance
 */
export function createChessSearch(
  evaluator?: ChessEvaluator,
  config?: Partial<SearchConfig>
): ChessSearch {
  return new ChessSearch(evaluator, config);
}

/**
 * Perft - Performance test for move generation
 */
export function perft(fen: string, depth: number): number {
  const chess = new Chess(fen);
  
  if (depth === 0) return 1;
  
  let nodes = 0;
  const moves = chess.moves();
  
  for (const move of moves) {
    chess.move(move);
    nodes += perft(chess.fen(), depth - 1);
    chess.undo();
  }
  
  return nodes;
}

/**
 * Divide - Perft with per-move breakdown
 */
export function divide(fen: string, depth: number): Map<string, number> {
  const chess = new Chess(fen);
  const result = new Map<string, number>();
  
  const moves = chess.moves();
  
  for (const move of moves) {
    chess.move(move);
    const nodes = perft(chess.fen(), depth - 1);
    result.set(move, nodes);
    chess.undo();
  }
  
  return result;
}
