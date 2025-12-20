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
  // ==========================================================================
  // KING'S PAWN OPENINGS (e4)
  // ==========================================================================
  
  // Italian Game Complex
  {
    eco: 'C50',
    name: 'Italian Game',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
  },
  {
    eco: 'C53',
    name: 'Giuoco Piano',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'],
    fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  },
  {
    eco: 'C54',
    name: 'Giuoco Piano Main Line',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4'],
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2BPP3/2P2N2/PP3PPP/RNBQK2R b KQkq d3 0 5',
  },
  {
    eco: 'C51',
    name: 'Evans Gambit',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'],
    fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/1PB1P3/5N2/P1PP1PPP/RNBQK2R b KQkq b3 0 4',
  },
  {
    eco: 'C55',
    name: 'Two Knights Defense',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'],
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  },
  {
    eco: 'C57',
    name: 'Traxler Counterattack',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'Bc5'],
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p1N1/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 5 5',
  },
  
  // Ruy Lopez Complex
  {
    eco: 'C60',
    name: 'Ruy Lopez',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
  },
  {
    eco: 'C65',
    name: 'Ruy Lopez Berlin Defense',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'],
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  },
  {
    eco: 'C67',
    name: 'Berlin Defense Rio de Janeiro',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O', 'Nxe4'],
    fen: 'r1bqkb1r/pppp1ppp/2n5/1B2p3/4n3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 5',
  },
  {
    eco: 'C78',
    name: 'Ruy Lopez Morphy Defense',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'],
    fen: 'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 5',
  },
  {
    eco: 'C84',
    name: 'Ruy Lopez Closed Defense',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'],
    fen: 'r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 6 6',
  },
  {
    eco: 'C88',
    name: 'Ruy Lopez Marshall Attack',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'O-O', 'c3', 'd5'],
    fen: 'r1bq1rk1/2ppbppp/p1n2n2/1p1pp3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 w - d6 0 9',
  },
  {
    eco: 'C69',
    name: 'Ruy Lopez Exchange Variation',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'],
    fen: 'r1bqkbnr/1ppp1ppp/p1B5/4p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4',
  },
  
  // Scotch Game
  {
    eco: 'C45',
    name: 'Scotch Game',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'],
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3 0 3',
  },
  {
    eco: 'C45',
    name: 'Scotch Game Classical',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Bc5'],
    fen: 'r1bqk1nr/pppp1ppp/2n5/2b5/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5',
  },
  
  // Petrov Defense
  {
    eco: 'C42',
    name: 'Petrov Defense',
    moves: ['e4', 'e5', 'Nf3', 'Nf6'],
    fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  },
  {
    eco: 'C43',
    name: 'Petrov Defense Classical',
    moves: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6', 'Nf3', 'Nxe4'],
    fen: 'rnbqkb1r/ppp2ppp/3p4/8/4n3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 5',
  },
  
  // Four Knights
  {
    eco: 'C47',
    name: 'Four Knights Game',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'],
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4',
  },
  {
    eco: 'C48',
    name: 'Four Knights Spanish',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'Bb5'],
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 5 4',
  },
  
  // Vienna Game
  {
    eco: 'C25',
    name: 'Vienna Game',
    moves: ['e4', 'e5', 'Nc3'],
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2',
  },
  {
    eco: 'C29',
    name: 'Vienna Gambit',
    moves: ['e4', 'e5', 'Nc3', 'Nf6', 'f4'],
    fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4PP2/2N5/PPPP2PP/R1BQKBNR b KQkq f3 0 3',
  },
  
  // King's Gambit
  {
    eco: 'C30',
    name: "King's Gambit",
    moves: ['e4', 'e5', 'f4'],
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2',
  },
  {
    eco: 'C36',
    name: "King's Gambit Accepted",
    moves: ['e4', 'e5', 'f4', 'exf4'],
    fen: 'rnbqkbnr/pppp1ppp/8/8/4Pp2/8/PPPP2PP/RNBQKBNR w KQkq - 0 3',
  },
  
  // ==========================================================================
  // SICILIAN DEFENSE COMPLEX (1.e4 c5)
  // ==========================================================================
  
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
    eco: 'B92',
    name: 'Sicilian Najdorf 6.Be2',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be2'],
    fen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP1BPPP/R1BQK2R b KQkq - 1 6',
  },
  {
    eco: 'B96',
    name: 'Sicilian Najdorf 6.Bg5',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bg5'],
    fen: 'rnbqkb1r/1p2pppp/p2p1n2/6B1/3NP3/2N5/PPP2PPP/R2QKB1R b KQkq - 1 6',
  },
  {
    eco: 'B97',
    name: 'Sicilian Najdorf Poisoned Pawn',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bg5', 'e6', 'f4', 'Qb6'],
    fen: 'rnb1kb1r/1p3ppp/pq1ppn2/6B1/3NPP2/2N5/PPP3PP/R2QKB1R w KQkq - 1 8',
  },
  {
    eco: 'B33',
    name: 'Sicilian Sveshnikov',
    moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5'],
    fen: 'r1bqkb1r/pp1p1ppp/2n2n2/4p3/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
  },
  {
    eco: 'B76',
    name: 'Sicilian Dragon',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'],
    fen: 'rnbqkb1r/pp2pp1p/3p1np1/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
  },
  {
    eco: 'B77',
    name: 'Sicilian Dragon Yugoslav Attack',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'f3'],
    fen: 'rnbqk2r/pp2ppbp/3p1np1/8/3NP3/2N1BP2/PPP3PP/R2QKB1R b KQkq - 0 7',
  },
  {
    eco: 'B35',
    name: 'Sicilian Accelerated Dragon',
    moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6'],
    fen: 'r1bqkbnr/pp1ppp1p/2n3p1/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 0 5',
  },
  {
    eco: 'B80',
    name: 'Sicilian Scheveningen',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e6'],
    fen: 'rnbqkb1r/pp3ppp/3ppn2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
  },
  {
    eco: 'B85',
    name: 'Sicilian Scheveningen Classical',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e6', 'Be2'],
    fen: 'rnbqkb1r/pp3ppp/3ppn2/8/3NP3/2N5/PPP1BPPP/R1BQK2R b KQkq - 1 6',
  },
  {
    eco: 'B56',
    name: 'Sicilian Classical',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'Nc6'],
    fen: 'r1bqkb1r/pp2pppp/2np1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 2 6',
  },
  {
    eco: 'B22',
    name: 'Sicilian Alapin',
    moves: ['e4', 'c5', 'c3'],
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/2P5/PP1P1PPP/RNBQKBNR b KQkq - 0 2',
  },
  {
    eco: 'B23',
    name: 'Sicilian Closed',
    moves: ['e4', 'c5', 'Nc3'],
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2',
  },
  {
    eco: 'B40',
    name: 'Sicilian Kan',
    moves: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'a6'],
    fen: 'rnbqkbnr/1p1p1ppp/p3p3/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 0 5',
  },
  {
    eco: 'B48',
    name: 'Sicilian Taimanov',
    moves: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'Nc6'],
    fen: 'r1bqkbnr/pp1p1ppp/2n1p3/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5',
  },
  
  // ==========================================================================
  // FRENCH DEFENSE (1.e4 e6)
  // ==========================================================================
  
  {
    eco: 'C00',
    name: 'French Defense',
    moves: ['e4', 'e6'],
    fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  },
  {
    eco: 'C03',
    name: 'French Tarrasch',
    moves: ['e4', 'e6', 'd4', 'd5', 'Nd2'],
    fen: 'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPPN1PPP/R1BQKBNR b KQkq - 1 3',
  },
  {
    eco: 'C11',
    name: 'French Classical',
    moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'],
    fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 2 4',
  },
  {
    eco: 'C15',
    name: 'French Winawer',
    moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'],
    fen: 'rnbqk1nr/ppp2ppp/4p3/3p4/1b1PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 2 4',
  },
  {
    eco: 'C16',
    name: 'French Winawer Advance',
    moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5'],
    fen: 'rnbqk1nr/ppp2ppp/4p3/3pP3/1b1P4/2N5/PPP2PPP/R1BQKBNR b KQkq - 0 4',
  },
  {
    eco: 'C02',
    name: 'French Advance',
    moves: ['e4', 'e6', 'd4', 'd5', 'e5'],
    fen: 'rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3',
  },
  {
    eco: 'C01',
    name: 'French Exchange',
    moves: ['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5'],
    fen: 'rnbqkbnr/ppp2ppp/8/3p4/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4',
  },
  
  // ==========================================================================
  // CARO-KANN DEFENSE (1.e4 c6)
  // ==========================================================================
  
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
  {
    eco: 'B13',
    name: 'Caro-Kann Exchange',
    moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'],
    fen: 'rnbqkbnr/pp2pppp/8/3p4/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4',
  },
  {
    eco: 'B14',
    name: 'Caro-Kann Panov Attack',
    moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4'],
    fen: 'rnbqkbnr/pp2pppp/8/3p4/2PP4/8/PP3PPP/RNBQKBNR b KQkq c3 0 4',
  },
  {
    eco: 'B15',
    name: 'Caro-Kann Classical',
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'],
    fen: 'rn1qkbnr/pp2pppp/2p5/5b2/3PN3/8/PPP2PPP/R1BQKBNR w KQkq - 1 5',
  },
  {
    eco: 'B17',
    name: 'Caro-Kann Steinitz',
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nd7'],
    fen: 'r1bqkbnr/pp1npppp/2p5/8/3PN3/8/PPP2PPP/R1BQKBNR w KQkq - 1 5',
  },
  
  // ==========================================================================
  // SCANDINAVIAN DEFENSE (1.e4 d5)
  // ==========================================================================
  
  {
    eco: 'B01',
    name: 'Scandinavian Defense',
    moves: ['e4', 'd5'],
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2',
  },
  {
    eco: 'B01',
    name: 'Scandinavian Main Line',
    moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5'],
    fen: 'rnb1kbnr/ppp1pppp/8/q7/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 4',
  },
  {
    eco: 'B01',
    name: 'Scandinavian Modern',
    moves: ['e4', 'd5', 'exd5', 'Nf6'],
    fen: 'rnbqkb1r/ppp1pppp/5n2/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 1 3',
  },
  
  // ==========================================================================
  // PIRC/MODERN DEFENSE
  // ==========================================================================
  
  {
    eco: 'B07',
    name: 'Pirc Defense',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6'],
    fen: 'rnbqkb1r/ppp1pp1p/3p1np1/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 4',
  },
  {
    eco: 'B06',
    name: 'Modern Defense',
    moves: ['e4', 'g6'],
    fen: 'rnbqkbnr/pppppp1p/6p1/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  },
  
  // ==========================================================================
  // ALEKHINE DEFENSE (1.e4 Nf6)
  // ==========================================================================
  
  {
    eco: 'B02',
    name: 'Alekhine Defense',
    moves: ['e4', 'Nf6'],
    fen: 'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2',
  },
  {
    eco: 'B03',
    name: 'Alekhine Four Pawns Attack',
    moves: ['e4', 'Nf6', 'e5', 'Nd5', 'c4', 'Nb6', 'd4', 'd6', 'f4'],
    fen: 'rnbqkb1r/ppp1pppp/1n1p4/4P3/2PP1P2/8/PP4PP/RNBQKBNR b KQkq f3 0 5',
  },
  
  // ==========================================================================
  // QUEEN'S PAWN OPENINGS (1.d4)
  // ==========================================================================
  
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
    eco: 'D37',
    name: "QGD Orthodox",
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'Be7', 'Bf4'],
    fen: 'rnbqk2r/ppp1bppp/4pn2/3p4/2PP1B2/2N2N2/PP2PPPP/R2QKB1R b KQkq - 3 5',
  },
  {
    eco: 'D52',
    name: "QGD Cambridge Springs",
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Nbd7', 'e3', 'c6', 'Nf3', 'Qa5'],
    fen: 'r1b1kb1r/pp1n1ppp/2p1pn2/q2p2B1/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQkq - 2 7',
  },
  {
    eco: 'D20',
    name: "Queen's Gambit Accepted",
    moves: ['d4', 'd5', 'c4', 'dxc4'],
    fen: 'rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
  },
  {
    eco: 'D21',
    name: "QGA Main Line",
    moves: ['d4', 'd5', 'c4', 'dxc4', 'Nf3'],
    fen: 'rnbqkbnr/ppp1pppp/8/8/2pP4/5N2/PP2PPPP/RNBQKB1R b KQkq - 1 3',
  },
  {
    eco: 'D10',
    name: 'Slav Defense',
    moves: ['d4', 'd5', 'c4', 'c6'],
    fen: 'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
  },
  {
    eco: 'D15',
    name: 'Slav Main Line',
    moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3'],
    fen: 'rnbqkb1r/pp2pppp/2p2n2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R b KQkq - 3 4',
  },
  {
    eco: 'D43',
    name: 'Semi-Slav Defense',
    moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6'],
    fen: 'rnbqkb1r/pp3ppp/2p1pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq - 0 5',
  },
  {
    eco: 'D44',
    name: 'Semi-Slav Botvinnik',
    moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6', 'Bg5', 'dxc4', 'e4'],
    fen: 'rnbqkb1r/pp3ppp/2p1pn2/6B1/2pPP3/2N2N2/PP3PPP/R2QKB1R b KQkq e3 0 6',
  },
  
  // ==========================================================================
  // INDIAN DEFENSES (1.d4 Nf6)
  // ==========================================================================
  
  {
    eco: 'E60',
    name: "King's Indian Defense",
    moves: ['d4', 'Nf6', 'c4', 'g6'],
    fen: 'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
  },
  {
    eco: 'E62',
    name: "King's Indian Fianchetto",
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nf3', 'Bg7', 'g3', 'O-O', 'Bg2'],
    fen: 'rnbq1rk1/ppppppbp/5np1/8/2PP4/5NP1/PP2PPBP/RNBQK2R b KQ - 3 5',
  },
  {
    eco: 'E70',
    name: "King's Indian Classical",
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3'],
    fen: 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP3PPP/R1BQKB1R b KQkq - 1 5',
  },
  {
    eco: 'E73',
    name: "King's Indian Averbakh",
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Be2', 'O-O', 'Bg5'],
    fen: 'rnbq1rk1/ppp1ppbp/3p1np1/6B1/2PPP3/2N5/PP2BPPP/R2QK1NR b KQ - 3 6',
  },
  {
    eco: 'E80',
    name: "King's Indian Saemisch",
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f3'],
    fen: 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N2P2/PP4PP/R1BQKBNR b KQkq - 0 5',
  },
  {
    eco: 'E20',
    name: 'Nimzo-Indian Defense',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'],
    fen: 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4',
  },
  {
    eco: 'E32',
    name: 'Nimzo-Indian Classical',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Qc2'],
    fen: 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PPQ1PPPP/R1B1KBNR b KQkq - 3 4',
  },
  {
    eco: 'E41',
    name: 'Nimzo-Indian Huebner',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3', 'c5', 'Bd3'],
    fen: 'rnbqk2r/pp1p1ppp/4pn2/2p5/1bPP4/2NBP3/PP3PPP/R1BQK1NR b KQkq - 1 5',
  },
  {
    eco: 'E00',
    name: "Queen's Indian Defense",
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'],
    fen: 'rnbqkb1r/p1pp1ppp/1p2pn2/8/2PP4/5N2/PP2PPPP/RNBQKB1R w KQkq - 0 4',
  },
  {
    eco: 'E15',
    name: "Queen's Indian Main Line",
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'g3', 'Bb7', 'Bg2'],
    fen: 'rn1qkb1r/pbpp1ppp/1p2pn2/8/2PP4/5NP1/PP2PPBP/RNBQK2R b KQkq - 2 5',
  },
  {
    eco: 'A55',
    name: 'Old Indian Defense',
    moves: ['d4', 'Nf6', 'c4', 'd6', 'Nc3', 'Nbd7', 'e4', 'e5'],
    fen: 'r1bqkb1r/pppn1ppp/3p1n2/4p3/2PPP3/2N5/PP3PPP/R1BQKBNR w KQkq e6 0 5',
  },
  {
    eco: 'D70',
    name: 'Grunfeld Defense',
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'],
    fen: 'rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq d6 0 4',
  },
  {
    eco: 'D85',
    name: 'Grunfeld Exchange',
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5', 'e4'],
    fen: 'rnbqkb1r/ppp1pp1p/6p1/3n4/3PP3/2N5/PP3PPP/R1BQKBNR b KQkq e3 0 5',
  },
  {
    eco: 'A45',
    name: 'Trompowsky Attack',
    moves: ['d4', 'Nf6', 'Bg5'],
    fen: 'rnbqkb1r/pppppppp/5n2/6B1/3P4/8/PPP1PPPP/RN1QKBNR b KQkq - 2 2',
  },
  {
    eco: 'D00',
    name: 'London System',
    moves: ['d4', 'd5', 'Bf4'],
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR b KQkq - 1 2',
  },
  {
    eco: 'D01',
    name: 'London System Main',
    moves: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3'],
    fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/3P1B2/4PN2/PPP2PPP/RN1QKB1R b KQkq - 1 4',
  },
  {
    eco: 'D03',
    name: 'Torre Attack',
    moves: ['d4', 'Nf6', 'Nf3', 'e6', 'Bg5'],
    fen: 'rnbqkb1r/pppp1ppp/4pn2/6B1/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 2 3',
  },
  {
    eco: 'D05',
    name: 'Colle System',
    moves: ['d4', 'd5', 'Nf3', 'Nf6', 'e3'],
    fen: 'rnbqkb1r/ppp1pppp/5n2/3p4/3P4/4PN2/PPP2PPP/RNBQKB1R b KQkq - 0 3',
  },
  
  // ==========================================================================
  // FLANK OPENINGS
  // ==========================================================================
  
  {
    eco: 'A10',
    name: 'English Opening',
    moves: ['c4'],
    fen: 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1',
  },
  {
    eco: 'A20',
    name: 'English Reversed Sicilian',
    moves: ['c4', 'e5'],
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/2P5/8/PP1PPPPP/RNBQKBNR w KQkq e6 0 2',
  },
  {
    eco: 'A30',
    name: 'English Symmetrical',
    moves: ['c4', 'c5'],
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/2P5/8/PP1PPPPP/RNBQKBNR w KQkq c6 0 2',
  },
  {
    eco: 'A15',
    name: 'English Anglo-Indian',
    moves: ['c4', 'Nf6'],
    fen: 'rnbqkb1r/pppppppp/5n2/8/2P5/8/PP1PPPPP/RNBQKBNR w KQkq - 1 2',
  },
  {
    eco: 'A04',
    name: 'Reti Opening',
    moves: ['Nf3'],
    fen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
  },
  {
    eco: 'A05',
    name: 'Reti King\'s Indian Attack',
    moves: ['Nf3', 'd5', 'g3'],
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/8/5NP1/PPPPPP1P/RNBQKB1R b KQkq - 0 2',
  },
  {
    eco: 'A06',
    name: 'Reti Advance',
    moves: ['Nf3', 'd5', 'c4'],
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/2P5/5N2/PP1PPPPP/RNBQKB1R b KQkq c3 0 2',
  },
  {
    eco: 'A00',
    name: 'Bird Opening',
    moves: ['f4'],
    fen: 'rnbqkbnr/pppppppp/8/8/5P2/8/PPPPP1PP/RNBQKBNR b KQkq f3 0 1',
  },
  {
    eco: 'A02',
    name: 'Bird From\'s Gambit',
    moves: ['f4', 'e5'],
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/5P2/8/PPPPP1PP/RNBQKBNR w KQkq e6 0 2',
  },
  {
    eco: 'E61',
    name: 'Catalan Opening',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3'],
    fen: 'rnbqkb1r/pppp1ppp/4pn2/8/2PP4/6P1/PP2PP1P/RNBQKBNR b KQkq - 0 3',
  },
  {
    eco: 'E04',
    name: 'Catalan Open',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'dxc4'],
    fen: 'rnbqkb1r/ppp2ppp/4pn2/8/2pP4/6P1/PP2PPBP/RNBQK1NR w KQkq - 0 5',
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
  
  // ========== EXPANDED OPENING LINES (Phase 2.5) ==========
  
  // Ruy Lopez main lines after 3...a6
  addBookMoves('r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -', [
    { move: 'Ba4', weight: 100 },  // Main line
    { move: 'Bxc6', weight: 40 },  // Exchange variation
  ]);
  
  // Ruy Lopez after 4.Ba4
  addBookMoves('r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq -', [
    { move: 'Nf6', weight: 100 },  // Berlin/Morphy
    { move: 'b5', weight: 70 },    // Norwegian
    { move: 'd6', weight: 40 },    // Steinitz deferred
  ]);
  
  // Italian Game main line
  addBookMoves('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -', [
    { move: 'Bc5', weight: 100 },  // Giuoco Piano
    { move: 'Nf6', weight: 90 },   // Two Knights
    { move: 'Be7', weight: 40 },   // Hungarian
  ]);
  
  // Giuoco Piano after 3...Bc5
  addBookMoves('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -', [
    { move: 'c3', weight: 100 },   // Main line
    { move: 'd3', weight: 70 },    // Giuoco Pianissimo
    { move: 'b4', weight: 40 },    // Evans Gambit
  ]);
  
  // Sicilian Open after 2...d6 3.d4 cxd4 4.Nxd4
  addBookMoves('rnbqkbnr/pp2pppp/3p4/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq -', [
    { move: 'Nf6', weight: 100 },
    { move: 'g6', weight: 50 },    // Accelerated Dragon
    { move: 'e5', weight: 30 },    // Lowenthal
  ]);
  
  // Sicilian after 4...Nf6 5.Nc3
  addBookMoves('rnbqkb1r/pp2pppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq -', [
    { move: 'a6', weight: 100 },   // Najdorf
    { move: 'e6', weight: 90 },    // Scheveningen
    { move: 'g6', weight: 85 },    // Dragon
    { move: 'Nc6', weight: 70 },   // Classical
    { move: 'e5', weight: 60 },    // Sveshnikov/Kalashnikov
  ]);
  
  // French Winawer after 3.Nc3 Bb4
  addBookMoves('rnbqk1nr/ppp2ppp/4p3/3p4/1b1PP3/2N5/PPP2PPP/R1BQKBNR w KQkq -', [
    { move: 'e5', weight: 100 },   // Advance
    { move: 'exd5', weight: 60 },  // Exchange
    { move: 'Bd2', weight: 40 },
  ]);
  
  // French Tarrasch after 3.Nd2
  addBookMoves('rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/3N4/PPP2PPP/R1BQKBNR b KQkq -', [
    { move: 'Nf6', weight: 100 },
    { move: 'c5', weight: 90 },
    { move: 'dxe4', weight: 60 },
  ]);
  
  // Caro-Kann Classical after 4...Bf5
  addBookMoves('rn1qkbnr/pp2pppp/2p5/3pPb2/3P4/2N5/PPP2PPP/R1BQKBNR w KQkq -', [
    { move: 'Nf3', weight: 100 },  // Classical main
    { move: 'g4', weight: 60 },    // Bayonet attack
    { move: 'Bd3', weight: 50 },
  ]);
  
  // Queen's Gambit Declined main line
  addBookMoves('rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq -', [
    { move: 'Bg5', weight: 100 },  // Orthodox
    { move: 'cxd5', weight: 70 },  // Exchange
    { move: 'Nf3', weight: 60 },
    { move: 'Bf4', weight: 50 },
  ]);
  
  // Slav Defense after 2...c6
  addBookMoves('rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -', [
    { move: 'Nf3', weight: 100 },
    { move: 'Nc3', weight: 90 },
    { move: 'e3', weight: 40 },
  ]);
  
  // King's Indian after 3...Bg7 4.e4
  addBookMoves('rnbqk2r/ppppppbp/5np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR b KQkq -', [
    { move: 'd6', weight: 100 },
    { move: 'O-O', weight: 90 },
    { move: 'd5', weight: 40 },    // Grunfeld
  ]);
  
  // Grunfeld Defense
  addBookMoves('rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq -', [
    { move: 'cxd5', weight: 100 },
    { move: 'Nf3', weight: 70 },
    { move: 'Bf4', weight: 50 },
  ]);
  
  // London System development
  addBookMoves('rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR w KQkq -', [
    { move: 'e3', weight: 100 },
    { move: 'Nf3', weight: 90 },
    { move: 'Nd2', weight: 60 },
  ]);
  
  // Catalan Opening
  addBookMoves('rnbqkb1r/pppp1ppp/4pn2/8/2PP4/6P1/PP2PP1P/RNBQKBNR b KQkq -', [
    { move: 'd5', weight: 100 },
    { move: 'Bb4+', weight: 60 },
    { move: 'c5', weight: 50 },
  ]);
  
  // English vs Symmetrical
  addBookMoves('rnbqkbnr/pp1ppppp/8/2p5/2P5/8/PP1PPPPP/RNBQKBNR w KQkq -', [
    { move: 'Nf3', weight: 100 },
    { move: 'Nc3', weight: 80 },
    { move: 'g3', weight: 70 },
  ]);
  
  // Pirc Defense after 1.e4 d6
  addBookMoves('rnbqkbnr/ppp1pppp/3p4/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', [
    { move: 'd4', weight: 100 },
    { move: 'Nc3', weight: 60 },
    { move: 'Nf3', weight: 50 },
  ]);
  
  // Scandinavian after 1.e4 d5
  addBookMoves('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', [
    { move: 'exd5', weight: 100 },
    { move: 'Nc3', weight: 40 },
    { move: 'e5', weight: 30 },
  ]);
  
  // Alekhine Defense after 1.e4 Nf6
  addBookMoves('rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', [
    { move: 'e5', weight: 100 },
    { move: 'Nc3', weight: 40 },
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
