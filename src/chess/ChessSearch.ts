/**
 * ChessSearch - Alpha-Beta Search with Enhancements
 * 
 * Implements a professional-grade chess search algorithm including:
 * - Alpha-beta pruning with fail-soft
 * - Iterative deepening with aspiration windows
 * - Quiescence search to avoid horizon effect
 * - Transposition table with proper Zobrist hashing (64-bit BigInt keys)
 * - Move ordering (hash move, MVV-LVA, killers, history)
 * - Null move pruning
 * - Late move reductions (LMR)
 * - Principal variation search (PVS)
 * - Check extensions
 * - Time management
 */

import { Chess, Move as ChessJsMove } from 'chess.js';
import { ChessEvaluator } from './ChessEvaluator.js';
import { computeZobristHash } from './ChessZobrist.js';
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
// Transposition Table (Bucket-Based)
// =============================================================================

/**
 * Bucket-based Transposition Table
 * Uses 4 entries per bucket for better cache performance and replacement
 */
class TranspositionTable {
  private buckets: (TTEntry | null)[][];
  private numBuckets: number;
  private currentAge: number = 0;
  private entries: number = 0;

  constructor(sizeMB: number) {
    // Estimate ~48 bytes per entry (BigInt + numbers + string)
    // 4 entries per bucket
    const totalEntries = Math.floor((sizeMB * 1024 * 1024) / 48);
    this.numBuckets = Math.floor(totalEntries / 4);
    
    // Initialize buckets
    this.buckets = new Array(this.numBuckets);
    for (let i = 0; i < this.numBuckets; i++) {
      this.buckets[i] = [null, null, null, null];
    }
  }

  /**
   * Store an entry in the table
   */
  store(hash: bigint, depth: number, score: number, type: TTEntryType, bestMove: string): void {
    const idx = Number(hash % BigInt(this.numBuckets));
    const bucket = this.buckets[idx];
    
    // Find best slot to use:
    // 1. Same hash (update existing)
    // 2. Empty slot
    // 3. Lowest depth entry
    // 4. Oldest entry
    let replaceIdx = 0;
    let lowestPriority = Infinity;
    
    for (let i = 0; i < 4; i++) {
      const entry = bucket[i];
      
      // Empty slot - use it
      if (!entry) {
        replaceIdx = i;
        break;
      }
      
      // Same position - always replace
      if (entry.hash === hash) {
        // Only replace if new entry is deeper or same depth
        if (depth >= entry.depth) {
          replaceIdx = i;
          break;
        }
        return; // Don't replace deeper entry with shallower
      }
      
      // Calculate replacement priority (lower = more likely to replace)
      // Prioritize replacing: old entries, shallow entries, non-exact bounds
      const agePenalty = (this.currentAge - entry.age) * 8;
      const depthValue = entry.depth * 2;
      const typeBonus = entry.type === 'EXACT' ? 4 : 0;
      const priority = depthValue + typeBonus - agePenalty;
      
      if (priority < lowestPriority) {
        lowestPriority = priority;
        replaceIdx = i;
      }
    }
    
    // Store the entry
    const wasEmpty = bucket[replaceIdx] === null;
    bucket[replaceIdx] = {
      hash,
      depth,
      score,
      type,
      bestMove,
      age: this.currentAge,
    };
    
    if (wasEmpty) {
      this.entries++;
    }
  }

  /**
   * Probe the table for an entry
   */
  probe(hash: bigint): TTEntry | null {
    const idx = Number(hash % BigInt(this.numBuckets));
    const bucket = this.buckets[idx];
    
    for (const entry of bucket) {
      if (entry && entry.hash === hash) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Start a new search (increment age for replacement strategy)
   */
  newSearch(): void {
    this.currentAge++;
  }

  /**
   * Clear the table
   */
  clear(): void {
    for (let i = 0; i < this.numBuckets; i++) {
      this.buckets[i] = [null, null, null, null];
    }
    this.entries = 0;
    this.currentAge = 0;
  }

  /**
   * Get table fill percentage (per mille)
   */
  getHashFull(): number {
    const maxEntries = this.numBuckets * 4;
    return Math.round((this.entries / maxEntries) * 1000);
  }

  /**
   * Get number of entries
   */
  getSize(): number {
    return this.entries;
  }

  /**
   * Get current age
   */
  getAge(): number {
    return this.currentAge;
  }
}

// =============================================================================
// ChessSearch Class
// =============================================================================

export class ChessSearch {
  private config: SearchConfig;
  private evaluator: ChessEvaluator;
  private chess: Chess;
  
  // Transposition table (bucket-based with proper Zobrist hashing)
  private tt: TranspositionTable;
  
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
    
    // Initialize bucket-based TT with proper Zobrist hashing
    this.tt = new TranspositionTable(this.config.ttSizeMB);
    
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
    this.tt.newSearch(); // Increment TT age for replacement strategy
    
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
    
    // CRITICAL: Restore original position and validate bestMove is legal
    // This guards against transposition table hash collisions returning stale moves
    // AND against position being in wrong state after search
    this.chess.load(fen);
    const legalMoves = this.chess.moves();
    if (bestMove && !legalMoves.includes(bestMove)) {
      console.warn(`Search returned invalid move "${bestMove}" - falling back to first legal move`);
      console.warn(`Legal moves: ${legalMoves.join(', ')}`);
      console.warn(`FEN: ${fen}`);
      // Fall back to first legal move (not ideal but safe)
      bestMove = legalMoves[0] || '';
      // Clear PV since it's corrupted
      pv = bestMove ? [bestMove] : [];
    }
    
    return {
      bestMove,
      score: bestScore,
      depth: completedDepth,
      seldepth: this.stats.seldepth,
      nodes: this.stats.nodes,
      time: elapsed,
      pv,
      aborted: this.stopSearch,
      hashFull: this.tt.getHashFull(),
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
    
    // Check for draw by repetition or 50-move rule
    // Note: isDraw() is expensive, so we check less frequently at deeper plies
    if (ply > 0 && this.chess.isDraw()) {
      return 0;
    }
    
    // Terminal node
    if (depth <= 0) {
      if (this.config.useQuiescence) {
        return this.quiescence(alpha, beta, ply);
      }
      return this.evaluator.evaluateFromChess(this.chess);
    }
    
    this.stats.nodes++;
    
    const inCheck = this.chess.isCheck();
    
    // Check extension
    if (inCheck) {
      depth++;
    }
    
    // Probe transposition table with proper Zobrist hash
    const hash = computeZobristHash(this.chess.fen());
    const ttEntry = this.tt.probe(hash);
    let ttMove: string | null = null;
    
    // Generate legal moves early - needed for TT validation and later move ordering
    const currentFen = this.chess.fen();
    const verboseMoves = this.chess.moves({ verbose: true }) as ChessJsMove[];
    const legalMovesSan = verboseMoves.map(m => m.san);
    
    if (ttEntry && ttEntry.depth >= depth) {
      this.stats.ttHits++;
      
      // Validate TT move is legal in current position (guards against hash collisions)
      if (ttEntry.bestMove && legalMovesSan.includes(ttEntry.bestMove)) {
        ttMove = ttEntry.bestMove;
      }
      
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
      // Validate TT move even at lower depth
      if (ttEntry.bestMove && legalMovesSan.includes(ttEntry.bestMove)) {
        ttMove = ttEntry.bestMove;
      }
    }
    
    // Null move pruning
    if (this.config.useNullMove && !isPV && !inCheck && depth >= 3 && this.hasNonPawnMaterial()) {
      // Make null move
      const fen = this.chess.fen();
      const parts = fen.split(' ');
      parts[1] = parts[1] === 'w' ? 'b' : 'w';
      parts[3] = '-'; // Clear en passant
      const nullFen = parts.join(' ');
      
      try {
        this.chess.load(nullFen);
        const R = depth > 6 ? 3 : 2;
        const nullScore = -this.alphaBeta(depth - R - 1, -beta, -beta + 1, false, ply + 1);
        this.chess.load(fen); // Restore original position
        
        if (this.stopSearch) return 0;
        
        if (nullScore >= beta) {
          this.stats.nullMoveCutoffs++;
          return beta;
        }
      } catch (e) {
        this.chess.load(fen); // Restore on error
        throw e;
      }
    }
    
    // Futility pruning - skip moves unlikely to raise alpha
    // Only at shallow depths (<= 3), not in PV, not in check, not near mate
    let futilityPruning = false;
    let staticEval = 0;
    const FUTILITY_MARGINS = [0, 200, 300, 500]; // centipawns by depth
    
    if (this.config.useFutilityPruning && 
        !isPV && 
        !inCheck && 
        depth <= 3 && 
        Math.abs(alpha) < MATE_THRESHOLD &&
        Math.abs(beta) < MATE_THRESHOLD) {
      staticEval = this.evaluator.evaluateFromChess(this.chess);
      const futilityMargin = FUTILITY_MARGINS[depth];
      
      // If even a large improvement can't raise alpha, enable futility pruning
      if (staticEval + futilityMargin <= alpha) {
        futilityPruning = true;
      }
    }
    
    // Order moves (verboseMoves already generated above for TT validation)
    const moves = this.orderMoves(verboseMoves, ply, ttMove);
    
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
      // Ensure position is correct before making move
      if (this.chess.fen() !== currentFen) {
        this.chess.load(currentFen);
      }
      
      // Futility pruning: skip quiet moves that can't improve alpha
      // Don't prune first move, captures, promotions, or moves giving check
      if (futilityPruning && 
          movesSearched > 0 && 
          !move.captured && 
          !move.promotion) {
        // Quick check if move gives check (make/unmake)
        this.chess.move(move.san);
        const givesCheck = this.chess.isCheck();
        this.chess.undo();
        
        if (!givesCheck) {
          this.stats.futilityPrunes++;
          continue; // Skip this move
        }
      }
      
      this.chess.move(move.san);
      let score: number;
      
      try {
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
      } finally {
        this.chess.undo();
      }
      
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
    
    // Store in transposition table with proper Zobrist hash
    let ttType: TTEntryType;
    if (bestScore <= origAlpha) {
      ttType = 'UPPER';
    } else if (bestScore >= beta) {
      ttType = 'LOWER';
    } else {
      ttType = 'EXACT';
    }
    
    this.tt.store(hash, depth, bestScore, ttType, bestMove);
    
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
    const currentFen = this.chess.fen();
    
    // Safety check for illegal positions (missing king)
    if (!currentFen.includes('k') || !currentFen.includes('K')) {
      return 0; // Position is illegal, return draw score
    }
    
    const standPat = this.evaluator.evaluateFromChess(this.chess);
    
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
      // Ensure position is correct before making move
      if (this.chess.fen() !== currentFen) {
        this.chess.load(currentFen);
      }
      
      // Delta pruning - skip captures that can't improve alpha
      const captureValue = MVV_VALUES[move.captured as PieceType] * 100;
      if (standPat + captureValue + 200 < alpha) {
        continue;
      }
      
      this.chess.move(move.san);
      let score: number;
      try {
        score = -this.quiescence(-beta, -alpha, ply + 1);
      } finally {
        this.chess.undo();
      }
      
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
      futilityPrunes: 0,
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
    return this.tt.getSize();
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
