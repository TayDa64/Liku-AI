#!/usr/bin/env npx tsx
/**
 * Self-Play Training Script
 * 
 * Generates training data from AI vs AI chess games.
 * Records positions, evaluations, and game outcomes for ML training.
 * 
 * Usage:
 *   npx tsx scripts/self-play.ts [options]
 * 
 * Options:
 *   --games <n>        Number of games to play (default: 10)
 *   --depth <n>        Search depth for both sides (default: 4)
 *   --output <file>    Output file for training data (default: training-data.jsonl)
 *   --verbose          Show game progress
 *   --randomize        Add random opening moves for variety
 */

import { Chess } from 'chess.js';
import * as fs from 'fs';
import * as path from 'path';
import { ChessSearch } from '../src/chess/ChessSearch.js';
import { ChessEvaluator } from '../src/chess/ChessEvaluator.js';
import { ChessOpenings } from '../src/chess/ChessOpenings.js';

// =============================================================================
// Types
// =============================================================================

interface TrainingPosition {
  fen: string;
  evaluation: number;
  bestMove: string;
  depth: number;
  gameResult: 'white' | 'black' | 'draw';
  ply: number;
  phase: 'opening' | 'middlegame' | 'endgame';
}

interface GameRecord {
  id: string;
  startTime: string;
  endTime: string;
  result: 'white' | 'black' | 'draw';
  termination: string;
  moveCount: number;
  pgn: string;
  positions: TrainingPosition[];
  whiteDepth: number;
  blackDepth: number;
  openingName?: string;
}

interface SelfPlayConfig {
  games: number;
  depth: number;
  whiteDepth?: number;
  blackDepth?: number;
  depthRange?: { min: number; max: number };
  outputFile: string;
  verbose: boolean;
  randomize: boolean;
  timePerMove: number;
  ttSizeMB: number;
}

interface SelfPlayStats {
  gamesPlayed: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  totalPositions: number;
  totalMoves: number;
  avgGameLength: number;
  avgNps: number;
  startTime: number;
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG: SelfPlayConfig = {
  games: 10,
  depth: 4,
  whiteDepth: undefined,
  blackDepth: undefined,
  depthRange: undefined,
  outputFile: 'training-data.jsonl',
  verbose: false,
  randomize: true,
  timePerMove: 5000,
  ttSizeMB: 32,
};

// =============================================================================
// Self-Play Engine
// =============================================================================

class SelfPlayEngine {
  private config: SelfPlayConfig;
  private evaluator: ChessEvaluator;
  private search: ChessSearch;
  private openings: ChessOpenings;
  private stats: SelfPlayStats;
  private outputStream: fs.WriteStream | null = null;

  constructor(config: SelfPlayConfig) {
    this.config = config;
    this.evaluator = new ChessEvaluator();
    this.search = new ChessSearch(this.evaluator, {
      maxDepth: config.depth,
      maxTime: config.timePerMove,
      ttSizeMB: config.ttSizeMB,
      useNullMove: true,
      useFutilityPruning: true,
      useLMR: true,
      useKillerMoves: true,
      useHistoryHeuristic: true,
      useQuiescence: true,
      usePVS: true,
      useAspirationWindows: false, // Can cause issues at low depth
    });
    this.openings = new ChessOpenings();
    this.stats = this.initStats();
  }

  private initStats(): SelfPlayStats {
    return {
      gamesPlayed: 0,
      whiteWins: 0,
      blackWins: 0,
      draws: 0,
      totalPositions: 0,
      totalMoves: 0,
      avgGameLength: 0,
      avgNps: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Run self-play session
   */
  async run(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           Chess Self-Play Training Generator                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log();
    console.log(`Configuration:`);
    console.log(`  Games: ${this.config.games}`);
    if (this.config.depthRange) {
      console.log(`  Depth range: ${this.config.depthRange.min}-${this.config.depthRange.max}`);
    } else if (this.config.whiteDepth || this.config.blackDepth) {
      console.log(`  White depth: ${this.config.whiteDepth ?? this.config.depth}`);
      console.log(`  Black depth: ${this.config.blackDepth ?? this.config.depth}`);
    } else {
      console.log(`  Depth: ${this.config.depth}`);
    }
    console.log(`  Time/move: ${this.config.timePerMove}ms`);
    console.log(`  Output: ${this.config.outputFile}`);
    console.log(`  Randomize openings: ${this.config.randomize}`);
    console.log();

    // Open output file
    const outputPath = path.resolve(this.config.outputFile);
    this.outputStream = fs.createWriteStream(outputPath, { flags: 'a' });

    const allGames: GameRecord[] = [];

    for (let gameNum = 1; gameNum <= this.config.games; gameNum++) {
      if (this.config.verbose) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`Game ${gameNum}/${this.config.games}`);
        console.log('─'.repeat(60));
      } else {
        process.stdout.write(`\rPlaying game ${gameNum}/${this.config.games}...`);
      }

      const game = await this.playGame(gameNum);
      allGames.push(game);

      // Update stats
      this.stats.gamesPlayed++;
      this.stats.totalMoves += game.moveCount;
      this.stats.totalPositions += game.positions.length;

      if (game.result === 'white') this.stats.whiteWins++;
      else if (game.result === 'black') this.stats.blackWins++;
      else this.stats.draws++;

      // Write positions to file
      for (const pos of game.positions) {
        this.outputStream.write(JSON.stringify(pos) + '\n');
      }

      if (this.config.verbose) {
        console.log(`Result: ${game.result} (${game.termination})`);
        console.log(`Moves: ${game.moveCount}, Positions: ${game.positions.length}`);
        if (game.openingName) {
          console.log(`Opening: ${game.openingName}`);
        }
      }
    }

    this.outputStream.end();
    console.log('\n');

    // Print summary
    this.printSummary();

    // Write game records separately
    const gamesPath = outputPath.replace('.jsonl', '-games.json');
    fs.writeFileSync(gamesPath, JSON.stringify(allGames, null, 2));
    console.log(`\nGame records saved to: ${gamesPath}`);
  }

  /**
   * Determine depths for this game
   */
  private getGameDepths(gameId: number): { whiteDepth: number; blackDepth: number } {
    // If depth range specified, pick randomly within range
    if (this.config.depthRange) {
      const { min, max } = this.config.depthRange;
      const whiteDepth = min + Math.floor(Math.random() * (max - min + 1));
      const blackDepth = min + Math.floor(Math.random() * (max - min + 1));
      return { whiteDepth, blackDepth };
    }

    // If specific depths configured, use them
    const whiteDepth = this.config.whiteDepth ?? this.config.depth;
    const blackDepth = this.config.blackDepth ?? this.config.depth;
    return { whiteDepth, blackDepth };
  }

  /**
   * Play a single self-play game
   */
  private async playGame(gameId: number): Promise<GameRecord> {
    const chess = new Chess();
    const positions: TrainingPosition[] = [];
    const startTime = new Date().toISOString();
    let openingName: string | undefined;

    // Determine depths for this game
    const { whiteDepth, blackDepth } = this.getGameDepths(gameId);

    // Optional: Start from a random opening position for variety
    if (this.config.randomize) {
      const randomMoves = this.getRandomOpening();
      for (const move of randomMoves) {
        try {
          chess.move(move);
        } catch {
          break;
        }
      }
      openingName = this.openings.getOpeningName(chess.fen());
    }

    if (this.config.verbose && (whiteDepth !== blackDepth || this.config.depthRange)) {
      console.log(`  White depth: ${whiteDepth}, Black depth: ${blackDepth}`);
    }

    let ply = chess.history().length;
    let totalNps = 0;
    let searchCount = 0;

    // Play the game
    while (!chess.isGameOver()) {
      const fen = chess.fen();
      const isWhiteTurn = chess.turn() === 'w';
      const currentDepth = isWhiteTurn ? whiteDepth : blackDepth;
      
      // Search for best move with current player's depth
      const result = this.search.search(fen, currentDepth, this.config.timePerMove);
      
      if (!result.bestMove) {
        if (this.config.verbose) {
          console.log('  No best move found, ending game');
        }
        break;
      }

      totalNps += result.nps;
      searchCount++;

      // Record position before making move
      positions.push({
        fen,
        evaluation: result.score,
        bestMove: result.bestMove,
        depth: result.depth,
        gameResult: 'draw', // Will be updated after game ends
        ply,
        phase: this.getGamePhase(chess),
      });

      // Make the move - try SAN first, then algebraic notation
      try {
        chess.move(result.bestMove);
      } catch (e) {
        // Move might be in different format, try to find it in legal moves
        const legalMoves = chess.moves({ verbose: true });
        const matchingMove = legalMoves.find(m => 
          m.san === result.bestMove || 
          m.lan === result.bestMove ||
          `${m.from}${m.to}` === result.bestMove
        );
        
        if (matchingMove) {
          chess.move(matchingMove.san);
        } else {
          if (this.config.verbose) {
            console.log(`  Invalid move: ${result.bestMove}, legal: ${chess.moves().slice(0, 5).join(', ')}...`);
          }
          break;
        }
      }

      ply++;

      if (this.config.verbose && ply % 10 === 0) {
        const turn = chess.turn() === 'w' ? 'Black' : 'White';
        console.log(`  ${Math.ceil(ply / 2)}. ${result.bestMove} (${turn}, eval: ${result.score}, depth: ${result.depth})`);
      }

      // Limit game length
      if (ply > 300) {
        break;
      }
    }

    // Determine result
    let result: 'white' | 'black' | 'draw';
    let termination: string;

    if (chess.isCheckmate()) {
      result = chess.turn() === 'w' ? 'black' : 'white';
      termination = 'checkmate';
    } else if (chess.isStalemate()) {
      result = 'draw';
      termination = 'stalemate';
    } else if (chess.isDraw()) {
      result = 'draw';
      if (chess.isThreefoldRepetition()) {
        termination = 'threefold repetition';
      } else if (chess.isInsufficientMaterial()) {
        termination = 'insufficient material';
      } else {
        termination = '50-move rule';
      }
    } else {
      result = 'draw';
      termination = 'game too long';
    }

    // Update all positions with final game result
    for (const pos of positions) {
      pos.gameResult = result;
    }

    // Update NPS stat
    if (searchCount > 0) {
      const avgNps = totalNps / searchCount;
      this.stats.avgNps = (this.stats.avgNps * (this.stats.gamesPlayed) + avgNps) / (this.stats.gamesPlayed + 1);
    }

    return {
      id: `game_${gameId}_${Date.now()}`,
      startTime,
      endTime: new Date().toISOString(),
      result,
      termination,
      moveCount: chess.history().length,
      pgn: chess.pgn(),
      positions,
      whiteDepth,
      blackDepth,
      openingName,
    };
  }

  /**
   * Get random opening moves for variety
   */
  private getRandomOpening(): string[] {
    const openings = [
      ['e4', 'e5', 'Nf3', 'Nc6'],           // Italian/Ruy Lopez start
      ['e4', 'c5'],                          // Sicilian
      ['e4', 'e6'],                          // French
      ['e4', 'c6'],                          // Caro-Kann
      ['d4', 'd5', 'c4'],                    // Queen's Gambit
      ['d4', 'Nf6', 'c4', 'g6'],            // King's Indian
      ['d4', 'd5', 'Nf3'],                   // Closed Game
      ['c4', 'e5'],                          // English
      ['Nf3', 'd5', 'g3'],                   // Reti
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],    // Italian
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],    // Ruy Lopez
      ['e4', 'c5', 'Nf3', 'd6'],            // Sicilian Najdorf setup
      ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], // Nimzo-Indian
      ['e4', 'd5'],                          // Scandinavian
      ['e4', 'd6'],                          // Pirc
    ];

    const idx = Math.floor(Math.random() * openings.length);
    return openings[idx];
  }

  /**
   * Determine game phase
   */
  private getGamePhase(chess: Chess): 'opening' | 'middlegame' | 'endgame' {
    const ply = chess.history().length;
    
    // Simple heuristic based on move count and material
    if (ply < 15) return 'opening';
    
    // Count material
    const board = chess.board();
    let totalMaterial = 0;
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.type !== 'k') {
          const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
          totalMaterial += values[piece.type] || 0;
        }
      }
    }

    // Endgame if total material < 26 (roughly missing queens + some pieces)
    if (totalMaterial < 26) return 'endgame';
    
    return 'middlegame';
  }

  /**
   * Print session summary
   */
  private printSummary(): void {
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    const avgGameLength = this.stats.totalMoves / Math.max(1, this.stats.gamesPlayed);

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    Self-Play Summary                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log();
    console.log(`Games played:      ${this.stats.gamesPlayed}`);
    console.log(`White wins:        ${this.stats.whiteWins} (${(this.stats.whiteWins / this.stats.gamesPlayed * 100).toFixed(1)}%)`);
    console.log(`Black wins:        ${this.stats.blackWins} (${(this.stats.blackWins / this.stats.gamesPlayed * 100).toFixed(1)}%)`);
    console.log(`Draws:             ${this.stats.draws} (${(this.stats.draws / this.stats.gamesPlayed * 100).toFixed(1)}%)`);
    console.log();
    console.log(`Total positions:   ${this.stats.totalPositions}`);
    console.log(`Total moves:       ${this.stats.totalMoves}`);
    console.log(`Avg game length:   ${avgGameLength.toFixed(1)} moves`);
    console.log(`Avg NPS:           ${Math.round(this.stats.avgNps)}`);
    console.log();
    console.log(`Total time:        ${elapsed.toFixed(1)}s`);
    console.log(`Avg time/game:     ${(elapsed / this.stats.gamesPlayed).toFixed(1)}s`);
    console.log();
    console.log(`Training data:     ${this.config.outputFile}`);
  }
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs(): SelfPlayConfig {
  const config = { ...DEFAULT_CONFIG };
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--games':
        config.games = parseInt(args[++i], 10);
        break;
      case '--depth':
        config.depth = parseInt(args[++i], 10);
        break;
      case '--white-depth':
        config.whiteDepth = parseInt(args[++i], 10);
        break;
      case '--black-depth':
        config.blackDepth = parseInt(args[++i], 10);
        break;
      case '--depth-range': {
        const range = args[++i].split('-').map(n => parseInt(n, 10));
        if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
          config.depthRange = { min: range[0], max: range[1] };
        }
        break;
      }
      case '--output':
        config.outputFile = args[++i];
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--randomize':
        config.randomize = true;
        break;
      case '--no-randomize':
        config.randomize = false;
        break;
      case '--time':
        config.timePerMove = parseInt(args[++i], 10);
        break;
      case '--tt':
        config.ttSizeMB = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
Chess Self-Play Training Generator

Usage: npx tsx scripts/self-play.ts [options]

Options:
  --games <n>        Number of games to play (default: 10)
  --depth <n>        Search depth for both sides (default: 4)
  --white-depth <n>  Search depth for white only
  --black-depth <n>  Search depth for black only
  --depth-range <m-n> Random depth in range for each side (e.g., 2-5)
  --output <file>    Output file for training data (default: training-data.jsonl)
  --verbose, -v      Show detailed game progress
  --randomize        Start games from various openings (default: true)
  --no-randomize     Always start from initial position
  --time <ms>        Time limit per move in milliseconds (default: 5000)
  --tt <mb>          Transposition table size in MB (default: 32)
  --help, -h         Show this help message

Output Format:
  The training data is saved in JSONL format with one position per line:
  {
    "fen": "...",           // Position in FEN notation
    "evaluation": 45,       // Centipawn evaluation from white's perspective
    "bestMove": "e4",       // Best move found by search
    "depth": 4,             // Search depth reached
    "gameResult": "white",  // Final game result (white/black/draw)
    "ply": 10,              // Move number in the game
    "phase": "opening"      // Game phase (opening/middlegame/endgame)
  }

Examples:
  # Quick test with 5 games
  npx tsx scripts/self-play.ts --games 5 --depth 3 --verbose

  # Full training run
  npx tsx scripts/self-play.ts --games 100 --depth 5 --output chess-training.jsonl

  # Fast games for more variety
  npx tsx scripts/self-play.ts --games 50 --depth 3 --time 2000

  # Asymmetric depth for Elo calibration
  npx tsx scripts/self-play.ts --games 20 --white-depth 4 --black-depth 2 --verbose

  # Random depth range for diverse matchups
  npx tsx scripts/self-play.ts --games 30 --depth-range 2-5 --verbose
`);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const config = parseArgs();
  const engine = new SelfPlayEngine(config);
  
  try {
    await engine.run();
  } catch (error) {
    console.error('Error during self-play:', error);
    process.exit(1);
  }
}

main();
