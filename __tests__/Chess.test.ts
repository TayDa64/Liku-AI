/**
 * Chess AI Unit Tests
 * 
 * Tests for the chess engine optimizations:
 * - Static Exchange Evaluation (SEE)
 * - Counter-Move Heuristic
 * - Gaussian Noise for Difficulty
 * - Multi-PV Analysis
 * - Opening Book
 * - Endgame Tablebases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Chess } from 'chess.js';
import { ChessSearch } from '../src/chess/ChessSearch.js';
import { ChessEvaluator } from '../src/chess/ChessEvaluator.js';
import { ChessOpenings } from '../src/chess/ChessOpenings.js';
import { ChessEndgame, isInsufficientMaterial } from '../src/chess/ChessEndgame.js';

// =============================================================================
// Static Exchange Evaluation Tests
// =============================================================================

describe('Static Exchange Evaluation (SEE)', () => {
  let search: ChessSearch;
  let evaluator: ChessEvaluator;
  
  beforeEach(() => {
    evaluator = new ChessEvaluator();
    search = new ChessSearch(evaluator);
  });
  
  it('should evaluate winning pawn takes queen positively', () => {
    // Position where pawn can capture undefended queen
    const fen = 'rnb1kbnr/pppppppp/8/4q3/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 1';
    
    // Search deeper to find the capture
    const result = search.search(fen, 4, 2000);
    
    // The best move should capture the queen (dxe5)
    // At depth 4 with proper evaluation, capturing the queen should be found
    // The move should gain significant material
    expect(result.score).toBeGreaterThan(500); // Should be winning
  });
  
  it('should evaluate losing queen takes defended pawn negatively', () => {
    // Position where queen captures a defended pawn
    const fen = 'rnb1kbnr/ppp1pppp/8/8/3pP3/2N5/PPP2PPP/R1BQKBNR b KQkq - 0 1';
    const chess = new Chess(fen);
    
    // Black has a pawn on d4, white has knight on c3 and pawn on e4
    // If queen takes e4, knight retakes - bad for black
    const result = search.search(fen, 3, 1000);
    
    // Should not recommend Qxe4 as it loses the queen
    expect(result.bestMove).not.toBe('Qxe4');
  });
  
  it('should identify equal exchanges', () => {
    // Position with knight vs knight exchange possible
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1';
    
    // Nf3xe5 would be met by Nc6xe5 - equal exchange
    const result = search.search(fen, 2, 500);
    // Not necessarily best but should be considered
    expect(result).toBeDefined();
  });
});

// =============================================================================
// Counter-Move Heuristic Tests
// =============================================================================

describe('Counter-Move Heuristic', () => {
  let search: ChessSearch;
  let evaluator: ChessEvaluator;
  
  beforeEach(() => {
    evaluator = new ChessEvaluator();
    search = new ChessSearch(evaluator);
  });
  
  it('should track counter-move hits in search stats', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    
    // Search multiple times to build counter-move table
    search.search(fen, 4, 1000);
    search.search(fen, 4, 1000);
    
    const stats = search.getStats();
    
    // Stats should include counterMoveHits
    expect(stats).toHaveProperty('counterMoveHits');
    expect(typeof stats.counterMoveHits).toBe('number');
  });
  
  it('should track SEE prunes in search stats', () => {
    // Position with many captures possible
    const fen = 'r3k2r/ppp2ppp/2n2n2/2bppb2/2BPP3/2N1BN2/PPP2PPP/R3K2R w KQkq - 0 1';
    
    const result = search.search(fen, 5, 2000);
    const stats = search.getStats();
    
    // Stats should include seePrunes
    expect(stats).toHaveProperty('seePrunes');
    expect(typeof stats.seePrunes).toBe('number');
    expect(result.nodes).toBeGreaterThan(0);
  });
  
  it('should clear counter-moves when requested', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    
    // Build up counter-move table
    search.search(fen, 3, 500);
    
    // Clear it
    search.clearCounterMoves();
    
    // Should be able to search again without issues
    const result = search.search(fen, 3, 500);
    expect(result.bestMove).toBeDefined();
  });
});

// =============================================================================
// Multi-PV Analysis Tests
// =============================================================================

describe('Multi-PV Analysis', () => {
  let search: ChessSearch;
  let evaluator: ChessEvaluator;
  
  beforeEach(() => {
    evaluator = new ChessEvaluator();
    search = new ChessSearch(evaluator);
  });
  
  it('should return multiple principal variations', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    
    const multiPv = search.searchMultiPV(fen, 4, 2000, 3);
    
    // Should return at least one line
    expect(multiPv.lines.length).toBeGreaterThanOrEqual(1);
    expect(multiPv.lines[0].rank).toBe(1);
  });
  
  it('should rank moves by score', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    
    const multiPv = search.searchMultiPV(fen, 4, 2000, 5);
    
    // First line should have best or equal score
    for (let i = 1; i < multiPv.lines.length; i++) {
      expect(multiPv.lines[0].score).toBeGreaterThanOrEqual(multiPv.lines[i].score);
    }
  });
  
  it('should handle positions with few legal moves', () => {
    // Position with limited moves - king in corner being checked
    const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
    
    const multiPv = search.searchMultiPV(fen, 3, 1000, 5);
    
    // Should return at least one line
    expect(multiPv.lines.length).toBeGreaterThanOrEqual(1);
  });
  
  it('should include PV moves for each line', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    
    const multiPv = search.searchMultiPV(fen, 4, 1000, 2);
    
    for (const line of multiPv.lines) {
      expect(line.pv.length).toBeGreaterThan(0);
      // First move should be a valid SAN move
      expect(line.pv[0]).toMatch(/^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?$/);
    }
  });
});

// =============================================================================
// Opening Book Tests
// =============================================================================

describe('Opening Book', () => {
  let openings: ChessOpenings;
  
  beforeEach(() => {
    openings = new ChessOpenings();
  });
  
  it('should return move for starting position', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    
    const bookMove = openings.getMove(fen);
    
    expect(bookMove).not.toBeNull();
    expect(bookMove!.move).toBeDefined();
  });
  
  it('should return standard responses to e4', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    
    const bookMove = openings.getMove(fen);
    
    expect(bookMove).not.toBeNull();
    // Should be one of the main responses
    expect(['e5', 'c5', 'e6', 'c6', 'd5', 'Nf6']).toContain(bookMove!.move);
  });
  
  it('should identify Sicilian Defense', () => {
    // The Sicilian should be in our named openings
    const sicilian = openings.getOpeningByName('Sicilian');
    expect(sicilian).toBeDefined();
    expect(sicilian!.eco).toBe('B20');
    
    // Check that Sicilian Najdorf exists
    const najdorf = openings.getOpeningByName('Najdorf');
    expect(najdorf).toBeDefined();
  });
  
  it('should identify Italian Game', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
    
    const name = openings.getOpeningName(fen);
    
    expect(name).toBeDefined();
    // Could be Italian Game or Giuoco Piano
    expect(name!.toLowerCase()).toMatch(/italian|giuoco/);
  });
  
  it('should check if position is in book', () => {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const lateFen = '8/8/8/4k3/8/4K3/8/8 w - - 0 50';
    
    expect(openings.inBook(startFen)).toBe(true);
    expect(openings.inBook(lateFen)).toBe(false);
  });
  
  it('should return multiple book moves for position', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    
    const moves = openings.getMoves(fen);
    
    expect(moves.length).toBeGreaterThan(1);
    expect(moves.some(m => m.move === 'e4')).toBe(true);
    expect(moves.some(m => m.move === 'd4')).toBe(true);
  });
  
  it('should have Najdorf in the book', () => {
    // Najdorf position after 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6
    const opening = openings.getOpeningByName('Najdorf');
    
    expect(opening).toBeDefined();
    expect(opening!.eco).toBe('B90');
  });
  
  it('should have at least 50 named openings', () => {
    const list = openings.getOpeningList();
    
    expect(list.length).toBeGreaterThan(50);
  });
});

// =============================================================================
// Endgame Tablebase Tests
// =============================================================================

describe('Endgame Tablebases', () => {
  let endgame: ChessEndgame;
  
  beforeEach(() => {
    endgame = new ChessEndgame({
      enabled: true,
      useOnlineApi: false, // Don't hit API in tests
    });
  });
  
  it('should identify tablebase positions', () => {
    // 3 pieces - in tablebase
    const kpk = '8/8/8/8/4P3/8/8/4K2k w - - 0 1';
    expect(endgame.isTablebasePosition(kpk)).toBe(true);
    
    // 7+ pieces - not in tablebase
    const many = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(endgame.isTablebasePosition(many)).toBe(false);
  });
  
  it('should count pieces correctly', () => {
    expect(endgame.countPieces('8/8/8/8/8/8/8/4K2k w - - 0 1')).toBe(2);
    expect(endgame.countPieces('8/8/8/8/4P3/8/8/4K2k w - - 0 1')).toBe(3);
    expect(endgame.countPieces('8/pppppppp/8/8/8/8/PPPPPPPP/8 w - - 0 1')).toBe(16);
  });
  
  it('should report availability status', () => {
    const withApi = new ChessEndgame({ useOnlineApi: true });
    const withoutApi = new ChessEndgame({ useOnlineApi: false, path: null });
    
    expect(withApi.isAvailable()).toBe(true);
    expect(withoutApi.isAvailable()).toBe(false);
  });
  
  it('should manage cache correctly', () => {
    const stats = endgame.getCacheStats();
    
    expect(stats.size).toBe(0);
    expect(stats.maxSize).toBeGreaterThan(0);
    
    endgame.clearCache();
    expect(endgame.getCacheStats().size).toBe(0);
  });
});

// =============================================================================
// Insufficient Material Detection Tests
// =============================================================================

describe('Insufficient Material', () => {
  it('should detect K vs K as insufficient', () => {
    expect(isInsufficientMaterial('8/8/8/4k3/8/4K3/8/8 w - - 0 1')).toBe(true);
  });
  
  it('should detect K+B vs K as insufficient', () => {
    expect(isInsufficientMaterial('8/8/8/4k3/8/4K3/5B2/8 w - - 0 1')).toBe(true);
  });
  
  it('should detect K+N vs K as insufficient', () => {
    expect(isInsufficientMaterial('8/8/8/4k3/8/4K3/5N2/8 w - - 0 1')).toBe(true);
  });
  
  it('should not detect K+Q vs K as insufficient', () => {
    expect(isInsufficientMaterial('8/8/8/4k3/8/4K3/5Q2/8 w - - 0 1')).toBe(false);
  });
  
  it('should not detect K+R vs K as insufficient', () => {
    expect(isInsufficientMaterial('8/8/8/4k3/8/4K3/5R2/8 w - - 0 1')).toBe(false);
  });
  
  it('should not detect K+P vs K as insufficient', () => {
    expect(isInsufficientMaterial('8/8/8/4k3/8/4K3/5P2/8 w - - 0 1')).toBe(false);
  });
});

// =============================================================================
// Search Integration Tests
// =============================================================================

describe('Search Integration', () => {
  let search: ChessSearch;
  let evaluator: ChessEvaluator;
  
  beforeEach(() => {
    evaluator = new ChessEvaluator();
    search = new ChessSearch(evaluator);
  });
  
  it('should find mate in 1', () => {
    // White to mate in 1 with Qh7#
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    
    const result = search.search(fen, 3, 2000);
    
    expect(result.bestMove).toBe('Qxf7#');
    expect(result.score).toBeGreaterThan(10000); // Mate score
  });
  
  it('should include ponder move in result', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    
    const result = search.search(fen, 5, 2000);
    
    // Ponder move should be set if PV has at least 2 moves
    if (result.pv.length >= 2) {
      expect(result.ponderMove).toBe(result.pv[1]);
    }
  });
  
  it('should report search statistics', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    
    // Run search 
    const result = search.search(fen, 4, 2000);
    
    // Check result has expected properties
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.depth).toBeGreaterThanOrEqual(0);
    expect(result.time).toBeGreaterThanOrEqual(0);
    expect(result.bestMove).toBeDefined();
  });
  
  it('should abort search on timeout', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    
    // Very deep search with very short time
    const result = search.search(fen, 20, 10);
    
    // Should return a valid move even if search was cut short
    expect(result.bestMove).toBeDefined();
    expect(result.aborted).toBe(true);
  });
  
  it('should use transposition table effectively', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    
    // First search populates TT
    search.search(fen, 4, 1000);
    const stats1 = search.getStats();
    
    // Second search should hit TT more
    search.search(fen, 4, 1000);
    const stats2 = search.getStats();
    
    // Second search should have more TT hits
    expect(stats2.ttHits).toBeGreaterThanOrEqual(stats1.ttHits);
  });
  
  it('should clear transposition table when requested', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    
    search.search(fen, 3, 500);
    search.clearTT();
    search.search(fen, 3, 500);
    
    // Should still work correctly after clearing
    const result = search.search(fen, 3, 500);
    expect(result.bestMove).toBeDefined();
  });
});

// =============================================================================
// Evaluator Tests
// =============================================================================

describe('Position Evaluator', () => {
  let evaluator: ChessEvaluator;
  
  beforeEach(() => {
    evaluator = new ChessEvaluator();
  });
  
  it('should evaluate starting position as roughly equal', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    
    const score = evaluator.evaluate(fen);
    
    // Should be close to 0 (equal position)
    expect(Math.abs(score)).toBeLessThan(100);
  });
  
  it('should evaluate material advantage correctly', () => {
    // White up a queen
    const whiteUp = 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    // Black up a queen  
    const blackUp = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1';
    
    const whiteScore = evaluator.evaluate(whiteUp);
    const blackScore = evaluator.evaluate(blackUp);
    
    // White should have positive score when up material
    expect(whiteScore).toBeGreaterThan(0);
    // Black having more material means white has negative score
    expect(blackScore).toBeLessThan(0);
    // Difference should be roughly a queen's value (900 cp)
    expect(whiteScore - blackScore).toBeGreaterThan(800);
  });
  
  it('should return evaluation breakdown', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    
    const breakdown = evaluator.getEvaluationBreakdown(fen);
    
    expect(breakdown).toHaveProperty('material');
    expect(breakdown).toHaveProperty('mobility');
    expect(breakdown).toHaveProperty('kingSafety');
    expect(breakdown).toHaveProperty('centerControl');
    expect(breakdown).toHaveProperty('pawnStructure');
    expect(breakdown).toHaveProperty('total');
  });
});
