/**
 * ChessEndgame - Endgame Tablebase Interface
 * 
 * Provides integration with Syzygy tablebases for perfect endgame play.
 * Tablebases contain precomputed optimal moves for positions with ≤6 pieces.
 * 
 * Features:
 * - WDL (Win/Draw/Loss) probing
 * - DTZ (Distance to Zeroing) for optimal 50-move rule handling
 * - DTM (Distance to Mate) when available
 * - Online API fallback when local tablebases unavailable
 * 
 * Note: Actual tablebase files are large (~1GB for 6-piece) and must be
 * downloaded separately. This module provides the interface and can use
 * the lichess.org API as a fallback.
 */

import { Chess, Square } from 'chess.js';

// =============================================================================
// Types
// =============================================================================

/** Tablebase probe result */
export interface TablebaseResult {
  /** Position evaluation: win, draw, loss, or unknown */
  wdl: 'win' | 'draw' | 'loss' | 'unknown';
  /** Distance to zeroing move (for 50-move rule) */
  dtz: number | null;
  /** Distance to mate (if available) */
  dtm: number | null;
  /** Best move in this position */
  bestMove: string | null;
  /** All moves with their evaluations */
  moves: TablebaseMove[];
  /** Whether result is from cache */
  cached: boolean;
  /** Source of the result */
  source: 'local' | 'api' | 'cache';
}

/** Individual move evaluation from tablebase */
export interface TablebaseMove {
  /** Move in UCI notation (e.g., "e2e4") */
  uci: string;
  /** Move in SAN notation (e.g., "e4") */
  san: string;
  /** Win/Draw/Loss for this move */
  wdl: 'win' | 'draw' | 'loss';
  /** Distance to zeroing after this move */
  dtz: number | null;
  /** Distance to mate after this move */
  dtm: number | null;
  /** Is this a zeroing move (capture or pawn move) */
  zeroing: boolean;
  /** Category: best, good, ok, bad, worst */
  category: 'best' | 'good' | 'ok' | 'bad' | 'worst';
}

/** Tablebase configuration */
export interface TablebaseConfig {
  /** Enable tablebase probing */
  enabled: boolean;
  /** Path to local Syzygy tablebase files */
  path: string | null;
  /** Use online API when local files unavailable */
  useOnlineApi: boolean;
  /** API endpoint for online probing */
  apiEndpoint: string;
  /** Maximum pieces for tablebase lookup (usually 6 or 7) */
  maxPieces: number;
  /** Cache size in number of positions */
  cacheSize: number;
  /** API request timeout in ms */
  timeout: number;
}

/** Default tablebase configuration */
export const DEFAULT_TABLEBASE_CONFIG: TablebaseConfig = {
  enabled: true,
  path: null,
  useOnlineApi: true,
  apiEndpoint: 'https://tablebase.lichess.ovh/standard',
  maxPieces: 6,
  cacheSize: 10000,
  timeout: 5000,
};

// =============================================================================
// Cache
// =============================================================================

/** Simple LRU cache for tablebase results */
class TablebaseCache {
  private cache: Map<string, TablebaseResult> = new Map();
  private maxSize: number;
  
  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
  }
  
  get(fen: string): TablebaseResult | null {
    const normalized = this.normalizeFen(fen);
    const result = this.cache.get(normalized);
    if (result) {
      // Move to end (most recently used)
      this.cache.delete(normalized);
      this.cache.set(normalized, { ...result, cached: true });
      return { ...result, cached: true };
    }
    return null;
  }
  
  set(fen: string, result: TablebaseResult): void {
    const normalized = this.normalizeFen(fen);
    
    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    
    this.cache.set(normalized, { ...result, cached: false });
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  get size(): number {
    return this.cache.size;
  }
  
  /** Normalize FEN for cache key (remove move counters) */
  private normalizeFen(fen: string): string {
    return fen.split(' ').slice(0, 4).join(' ');
  }
}

// =============================================================================
// ChessEndgame Class
// =============================================================================

export class ChessEndgame {
  private config: TablebaseConfig;
  private cache: TablebaseCache;
  private chess: Chess;
  
  constructor(config?: Partial<TablebaseConfig>) {
    this.config = { ...DEFAULT_TABLEBASE_CONFIG, ...config };
    this.cache = new TablebaseCache(this.config.cacheSize);
    this.chess = new Chess();
  }
  
  /**
   * Probe tablebase for a position
   * @param fen Position in FEN notation
   * @returns Tablebase result or null if position not in tablebase
   */
  async probe(fen: string): Promise<TablebaseResult | null> {
    // Check if position qualifies for tablebase
    if (!this.isTablebasePosition(fen)) {
      return null;
    }
    
    // Check cache first
    const cached = this.cache.get(fen);
    if (cached) {
      return cached;
    }
    
    // Try local tablebase first (stub - requires native module)
    if (this.config.path) {
      const local = await this.probeLocal(fen);
      if (local) {
        this.cache.set(fen, local);
        return local;
      }
    }
    
    // Fall back to online API
    if (this.config.useOnlineApi) {
      const api = await this.probeApi(fen);
      if (api) {
        this.cache.set(fen, api);
        return api;
      }
    }
    
    return null;
  }
  
  /**
   * Check if position qualifies for tablebase lookup
   */
  isTablebasePosition(fen: string): boolean {
    const pieceCount = this.countPieces(fen);
    return pieceCount <= this.config.maxPieces;
  }
  
  /**
   * Count pieces in position
   */
  countPieces(fen: string): number {
    const position = fen.split(' ')[0];
    let count = 0;
    for (const char of position) {
      if (/[pnbrqkPNBRQK]/.test(char)) {
        count++;
      }
    }
    return count;
  }
  
  /**
   * Get best move from tablebase
   * @param fen Position in FEN notation
   * @returns Best move in SAN notation or null
   */
  async getBestMove(fen: string): Promise<string | null> {
    const result = await this.probe(fen);
    return result?.bestMove || null;
  }
  
  /**
   * Check if position is winning for side to move
   */
  async isWinning(fen: string): Promise<boolean> {
    const result = await this.probe(fen);
    return result?.wdl === 'win';
  }
  
  /**
   * Check if position is drawn
   */
  async isDrawn(fen: string): Promise<boolean> {
    const result = await this.probe(fen);
    return result?.wdl === 'draw';
  }
  
  /**
   * Probe local Syzygy tablebase files
   * Note: This is a stub - actual implementation requires a native module
   * like 'syzygy' or 'ffish' to read tablebase files
   */
  private async probeLocal(_fen: string): Promise<TablebaseResult | null> {
    // TODO: Implement local Syzygy tablebase reading
    // This would require:
    // 1. A native Node.js module for reading .rtbw/.rtbz files
    // 2. The tablebase files downloaded (large: ~1GB for 6-piece)
    // 
    // Options for implementation:
    // - Use 'syzygy' npm package (if available)
    // - Use WebAssembly port of Syzygy probing code
    // - Call external probe tool via child_process
    // - Use WASM module from lichess
    
    return null;
  }
  
  /**
   * Probe online tablebase API (lichess.org)
   */
  private async probeApi(fen: string): Promise<TablebaseResult | null> {
    try {
      const url = `${this.config.apiEndpoint}?fen=${encodeURIComponent(fen)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      return this.parseApiResponse(fen, data);
    } catch (error) {
      // Network error, timeout, or API unavailable
      return null;
    }
  }
  
  /**
   * Parse lichess tablebase API response
   */
  private parseApiResponse(fen: string, data: any): TablebaseResult | null {
    if (!data || data.category === 'unknown') {
      return null;
    }
    
    // Parse WDL from category
    let wdl: 'win' | 'draw' | 'loss' | 'unknown';
    const cat = data.category;
    if (cat === 'win' || cat === 'cursed-win' || cat === 'maybe-win') {
      wdl = 'win';
    } else if (cat === 'loss' || cat === 'blessed-loss' || cat === 'maybe-loss') {
      wdl = 'loss';
    } else if (cat === 'draw') {
      wdl = 'draw';
    } else {
      wdl = 'unknown';
    }
    
    // Parse moves
    const moves: TablebaseMove[] = [];
    if (data.moves && Array.isArray(data.moves)) {
      this.chess.load(fen);
      
      for (const m of data.moves) {
        let moveWdl: 'win' | 'draw' | 'loss';
        const moveCat = m.category;
        if (moveCat === 'win' || moveCat === 'cursed-win') {
          moveWdl = 'win';
        } else if (moveCat === 'loss' || moveCat === 'blessed-loss') {
          moveWdl = 'loss';
        } else {
          moveWdl = 'draw';
        }
        
        // Convert UCI to SAN
        let san = m.san || m.uci;
        try {
          const move = this.chess.move(m.uci);
          if (move) {
            san = move.san;
            this.chess.undo();
          }
        } catch {
          // Keep UCI notation if conversion fails
        }
        
        moves.push({
          uci: m.uci,
          san,
          wdl: moveWdl,
          dtz: m.dtz ?? null,
          dtm: m.dtm ?? null,
          zeroing: m.zeroing ?? false,
          category: this.categorizeMove(m.category),
        });
      }
    }
    
    // Find best move
    const bestMove = moves.length > 0 ? moves[0].san : null;
    
    return {
      wdl,
      dtz: data.dtz ?? null,
      dtm: data.dtm ?? null,
      bestMove,
      moves,
      cached: false,
      source: 'api',
    };
  }
  
  /**
   * Categorize move based on lichess category
   */
  private categorizeMove(category: string): TablebaseMove['category'] {
    switch (category) {
      case 'win':
      case 'cursed-win':
        return 'best';
      case 'maybe-win':
        return 'good';
      case 'draw':
        return 'ok';
      case 'maybe-loss':
        return 'bad';
      case 'blessed-loss':
      case 'loss':
        return 'worst';
      default:
        return 'ok';
    }
  }
  
  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.cacheSize,
    };
  }
  
  /**
   * Update configuration
   */
  configure(config: Partial<TablebaseConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Recreate cache if size changed
    if (config.cacheSize && config.cacheSize !== this.cache.size) {
      this.cache = new TablebaseCache(config.cacheSize);
    }
  }
  
  /**
   * Check if tablebases are available (either local or API)
   */
  isAvailable(): boolean {
    return this.config.enabled && (!!this.config.path || this.config.useOnlineApi);
  }
}

/**
 * Create endgame tablebase instance
 */
export function createChessEndgame(config?: Partial<TablebaseConfig>): ChessEndgame {
  return new ChessEndgame(config);
}

/**
 * Material combinations that are always drawn
 * (insufficient mating material)
 */
export const DRAWN_ENDGAMES = [
  'KvK',      // King vs King
  'KBvK',     // King+Bishop vs King
  'KNvK',     // King+Knight vs King
  'KvKB',     // King vs King+Bishop
  'KvKN',     // King vs King+Knight
  'KBvKB',    // King+Bishop vs King+Bishop (same color)
  'KNvKN',    // King+Knight vs King+Knight
  'KNNvK',    // King+2Knights vs King (can't force mate)
];

/**
 * Check if position has insufficient mating material
 */
export function isInsufficientMaterial(fen: string): boolean {
  const position = fen.split(' ')[0];
  
  // Count pieces
  const pieces: Record<string, number> = {};
  let totalPieces = 0;
  
  for (const char of position) {
    if (/[pnbrqkPNBRQK]/.test(char)) {
      const lower = char.toLowerCase();
      pieces[lower] = (pieces[lower] || 0) + 1;
      totalPieces++;
    }
  }
  
  // Kings only
  if (totalPieces === 2) return true;
  
  // King + minor piece vs King
  if (totalPieces === 3) {
    if (pieces['n'] === 1 || pieces['b'] === 1) return true;
  }
  
  // King + 2 knights vs King (can't force mate)
  if (totalPieces === 4 && pieces['n'] === 2) {
    const whitePieces = (fen.match(/[PNBRQK]/g) || []).length;
    if (whitePieces === 1 || whitePieces === 3) return true;
  }
  
  // King + bishop vs King + bishop (same color)
  if (totalPieces === 4 && pieces['b'] === 2) {
    // Check if bishops are same color
    const bishopSquares: string[] = [];
    let rank = 8;
    let file = 1;
    
    for (const char of position) {
      if (char === '/') {
        rank--;
        file = 1;
      } else if (/[0-9]/.test(char)) {
        file += parseInt(char);
      } else {
        if (char.toLowerCase() === 'b') {
          bishopSquares.push(`${file}${rank}`);
        }
        file++;
      }
    }
    
    if (bishopSquares.length === 2) {
      const [b1, b2] = bishopSquares;
      const color1 = (parseInt(b1[0]) + parseInt(b1[1])) % 2;
      const color2 = (parseInt(b2[0]) + parseInt(b2[1])) % 2;
      if (color1 === color2) return true;
    }
  }
  
  return false;
}
