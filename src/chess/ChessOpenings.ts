/**
 * ChessOpenings - Opening Book Database
 * 
 * Provides opening moves for early game to:
 * - Save computation time
 * - Play theoretically sound moves
 * - Add variety to AI games
 * 
 * Includes major openings:
 * - Italian Game, Ruy Lopez, Scotch
 * - Sicilian Defense variations
 * - French Defense
 * - Caro-Kann Defense
 * - Queen's Gambit
 * - King's Indian, Nimzo-Indian
 * - English Opening
 */

import { Chess } from 'chess.js';
import { BookMove, Opening, Square } from './types.js';

// =============================================================================
// Opening Book Data
// =============================================================================

/**
 * Opening book stored as position hash -> moves
 * Each position can have multiple candidate moves with weights
 */
const OPENING_BOOK: Map<string, BookMove[]> = new Map();

/**
 * Named openings for display
 */
const NAMED_OPENINGS: Opening[] = [
  // King's Pawn Openings
  {
    eco: 'C50',
    name: 'Italian Game',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
  },
  {
    eco: 'C60',
    name: 'Ruy Lopez',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
  },
  {
    eco: 'C45',
    name: 'Scotch Game',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'],
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3 0 3',
  },
  {
    eco: 'C44',
    name: "King's Knight Opening",
    moves: ['e4', 'e5', 'Nf3'],
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
  },
  
  // Sicilian Defense
  {
    eco: 'B20',
    name: 'Sicilian Defense',
    moves: ['e4', 'c5'],
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
  },
  {
    eco: 'B90',
    name: 'Sicilian Najdorf',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
    fen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
  },
  {
    eco: 'B33',
    name: 'Sicilian Sveshnikov',
    moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5'],
    fen: 'r1bqkb1r/pp1p1ppp/2n2n2/4p3/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
  },
  {
    eco: 'B40',
    name: 'Sicilian Dragon',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'],
    fen: 'rnbqkb1r/pp2pp1p/3p1np1/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
  },
  
  // French Defense
  {
    eco: 'C00',
    name: 'French Defense',
    moves: ['e4', 'e6'],
    fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  },
  {
    eco: 'C11',
    name: 'French Defense Classical',
    moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'],
    fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 2 4',
  },
  
  // Caro-Kann
  {
    eco: 'B10',
    name: 'Caro-Kann Defense',
    moves: ['e4', 'c6'],
    fen: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  },
  {
    eco: 'B12',
    name: 'Caro-Kann Advance',
    moves: ['e4', 'c6', 'd4', 'd5', 'e5'],
    fen: 'rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3',
  },
  
  // Queen's Pawn Openings
  {
    eco: 'D00',
    name: "Queen's Pawn Game",
    moves: ['d4', 'd5'],
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6 0 2',
  },
  {
    eco: 'D30',
    name: "Queen's Gambit",
    moves: ['d4', 'd5', 'c4'],
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2',
  },
  {
    eco: 'D35',
    name: "Queen's Gambit Declined",
    moves: ['d4', 'd5', 'c4', 'e6'],
    fen: 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
  },
  {
    eco: 'D20',
    name: "Queen's Gambit Accepted",
    moves: ['d4', 'd5', 'c4', 'dxc4'],
    fen: 'rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
  },
  
  // Indian Defenses
  {
    eco: 'E60',
    name: "King's Indian Defense",
    moves: ['d4', 'Nf6', 'c4', 'g6'],
    fen: 'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
  },
  {
    eco: 'E20',
    name: 'Nimzo-Indian Defense',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'],
    fen: 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4',
  },
  {
    eco: 'E00',
    name: "Queen's Indian Defense",
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'],
    fen: 'rnbqkb1r/p1pp1ppp/1p2pn2/8/2PP4/5N2/PP2PPPP/RNBQKB1R w KQkq - 0 4',
  },
  
  // English Opening
  {
    eco: 'A10',
    name: 'English Opening',
    moves: ['c4'],
    fen: 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1',
  },
  {
    eco: 'A20',
    name: 'English Opening Reversed Sicilian',
    moves: ['c4', 'e5'],
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/2P5/8/PP1PPPPP/RNBQKBNR w KQkq e6 0 2',
  },
  
  // London System
  {
    eco: 'D00',
    name: 'London System',
    moves: ['d4', 'd5', 'Bf4'],
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR b KQkq - 1 2',
  },
];

// =============================================================================
// Initialize Opening Book
// =============================================================================

function initializeOpeningBook(): void {
  const chess = new Chess();
  
  // Add all named openings
  for (const opening of NAMED_OPENINGS) {
    chess.reset();
    let position = chess.fen().split(' ').slice(0, 4).join(' ');
    
    for (let i = 0; i < opening.moves.length; i++) {
      const move = opening.moves[i];
      
      // Add move to current position
      const existingMoves = OPENING_BOOK.get(position) || [];
      const existingMove = existingMoves.find(m => m.move === move);
      
      if (existingMove) {
        existingMove.weight += 100;
      } else {
        existingMoves.push({
          move,
          weight: 100,
          games: 1000,
        });
        OPENING_BOOK.set(position, existingMoves);
      }
      
      // Make the move
      chess.move(move);
      position = chess.fen().split(' ').slice(0, 4).join(' ');
    }
  }
  
  // Add common responses
  addCommonResponses();
}

/**
 * Add common response moves for popular positions
 */
function addCommonResponses(): void {
  // Starting position
  addBookMoves('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', [
    { move: 'e4', weight: 100 },
    { move: 'd4', weight: 95 },
    { move: 'Nf3', weight: 70 },
    { move: 'c4', weight: 65 },
  ]);
  
  // After 1.e4
  addBookMoves('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', [
    { move: 'e5', weight: 100 },
    { move: 'c5', weight: 95 },
    { move: 'e6', weight: 70 },
    { move: 'c6', weight: 65 },
    { move: 'd5', weight: 50 },
    { move: 'Nf6', weight: 40 },
  ]);
  
  // After 1.d4
  addBookMoves('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -', [
    { move: 'd5', weight: 100 },
    { move: 'Nf6', weight: 95 },
    { move: 'e6', weight: 60 },
    { move: 'f5', weight: 30 },
  ]);
  
  // After 1.e4 e5
  addBookMoves('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', [
    { move: 'Nf3', weight: 100 },
    { move: 'Nc3', weight: 40 },
    { move: 'Bc4', weight: 35 },
    { move: 'f4', weight: 25 },
  ]);
  
  // After 1.e4 e5 2.Nf3
  addBookMoves('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -', [
    { move: 'Nc6', weight: 100 },
    { move: 'Nf6', weight: 60 },
    { move: 'd6', weight: 30 },
  ]);
  
  // After 1.e4 e5 2.Nf3 Nc6
  addBookMoves('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -', [
    { move: 'Bb5', weight: 100 },  // Ruy Lopez
    { move: 'Bc4', weight: 90 },   // Italian
    { move: 'd4', weight: 70 },    // Scotch
    { move: 'Nc3', weight: 50 },   // Four Knights
  ]);
  
  // After 1.e4 c5 (Sicilian)
  addBookMoves('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', [
    { move: 'Nf3', weight: 100 },
    { move: 'Nc3', weight: 60 },
    { move: 'c3', weight: 40 },
    { move: 'd4', weight: 30 },
  ]);
  
  // After 1.d4 d5
  addBookMoves('rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', [
    { move: 'c4', weight: 100 },   // Queen's Gambit
    { move: 'Nf3', weight: 70 },
    { move: 'Bf4', weight: 60 },   // London
    { move: 'e3', weight: 40 },
  ]);
  
  // After 1.d4 Nf6
  addBookMoves('rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', [
    { move: 'c4', weight: 100 },
    { move: 'Nf3', weight: 70 },
    { move: 'Bg5', weight: 50 },
  ]);
  
  // After 1.d4 Nf6 2.c4
  addBookMoves('rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -', [
    { move: 'e6', weight: 100 },
    { move: 'g6', weight: 90 },
    { move: 'c5', weight: 60 },
    { move: 'd5', weight: 50 },
  ]);
}

/**
 * Helper to add moves to a position
 */
function addBookMoves(fen: string, moves: Array<{ move: string; weight: number }>): void {
  // Normalize FEN (remove move counters)
  const key = fen.split(' ').slice(0, 4).join(' ');
  const existing = OPENING_BOOK.get(key) || [];
  
  for (const m of moves) {
    const existingIdx = existing.findIndex(e => e.move === m.move);
    if (existingIdx >= 0) {
      existing[existingIdx].weight = Math.max(existing[existingIdx].weight, m.weight);
    } else {
      existing.push({ move: m.move, weight: m.weight });
    }
  }
  
  OPENING_BOOK.set(key, existing);
}

// Initialize on module load
initializeOpeningBook();

// =============================================================================
// ChessOpenings Class
// =============================================================================

export class ChessOpenings {
  private chess: Chess;
  
  constructor() {
    this.chess = new Chess();
  }
  
  /**
   * Get a book move for a position
   * @param fen - Position in FEN notation
   * @returns Book move or null if not in book
   */
  getMove(fen: string): { move: string; opening?: string } | null {
    // Normalize FEN
    const key = fen.split(' ').slice(0, 4).join(' ');
    const moves = OPENING_BOOK.get(key);
    
    if (!moves || moves.length === 0) {
      return null;
    }
    
    // Select move based on weight (higher weight = more likely)
    const totalWeight = moves.reduce((sum, m) => sum + m.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const move of moves) {
      random -= move.weight;
      if (random <= 0) {
        return {
          move: move.move,
          opening: this.getOpeningName(fen, move.move),
        };
      }
    }
    
    // Fallback to highest weight
    const best = moves.reduce((a, b) => a.weight > b.weight ? a : b);
    return {
      move: best.move,
      opening: this.getOpeningName(fen, best.move),
    };
  }
  
  /**
   * Get all book moves for a position
   * @param fen - Position in FEN notation
   */
  getMoves(fen: string): BookMove[] {
    const key = fen.split(' ').slice(0, 4).join(' ');
    return OPENING_BOOK.get(key) || [];
  }
  
  /**
   * Check if position is in book
   * @param fen - Position in FEN notation
   */
  inBook(fen: string): boolean {
    const key = fen.split(' ').slice(0, 4).join(' ');
    return OPENING_BOOK.has(key);
  }
  
  /**
   * Get opening name for a position/move
   */
  getOpeningName(fen: string, move?: string): string | undefined {
    this.chess.load(fen);
    
    if (move) {
      this.chess.move(move);
    }
    
    const history = this.chess.history();
    
    // Find matching opening
    for (const opening of NAMED_OPENINGS) {
      if (this.matchesOpening(history, opening.moves)) {
        return opening.name;
      }
    }
    
    return undefined;
  }
  
  /**
   * Check if history matches opening moves
   */
  private matchesOpening(history: string[], openingMoves: string[]): boolean {
    if (history.length < openingMoves.length) {
      // Check if history is prefix of opening
      for (let i = 0; i < history.length; i++) {
        if (history[i] !== openingMoves[i]) return false;
      }
      return true;
    }
    
    // Check if opening is prefix of history
    for (let i = 0; i < openingMoves.length; i++) {
      if (history[i] !== openingMoves[i]) return false;
    }
    return true;
  }
  
  /**
   * Get all known opening names
   */
  getOpeningList(): Array<{ eco: string; name: string }> {
    return NAMED_OPENINGS.map(o => ({ eco: o.eco, name: o.name }));
  }
  
  /**
   * Get opening by ECO code
   */
  getOpeningByEco(eco: string): Opening | undefined {
    return NAMED_OPENINGS.find(o => o.eco === eco);
  }
  
  /**
   * Get opening by name
   */
  getOpeningByName(name: string): Opening | undefined {
    return NAMED_OPENINGS.find(o => 
      o.name.toLowerCase().includes(name.toLowerCase())
    );
  }
  
  /**
   * Get random opening for variety
   */
  getRandomOpening(): Opening {
    return NAMED_OPENINGS[Math.floor(Math.random() * NAMED_OPENINGS.length)];
  }
  
  /**
   * Add custom book move
   */
  addMove(fen: string, move: string, weight: number = 50): void {
    const key = fen.split(' ').slice(0, 4).join(' ');
    const existing = OPENING_BOOK.get(key) || [];
    
    const idx = existing.findIndex(m => m.move === move);
    if (idx >= 0) {
      existing[idx].weight = Math.max(existing[idx].weight, weight);
    } else {
      existing.push({ move, weight });
    }
    
    OPENING_BOOK.set(key, existing);
  }
}

/**
 * Create opening book instance
 */
export function createChessOpenings(): ChessOpenings {
  return new ChessOpenings();
}
