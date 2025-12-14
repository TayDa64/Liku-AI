#!/usr/bin/env npx tsx
/**
 * Elo Estimation Script
 * 
 * Estimates engine Elo rating from self-play results by:
 * 1. Using Bayesian Elo estimation against reference pool
 * 2. Comparing to known benchmark positions
 * 3. Extrapolating from performance vs depth
 * 
 * Usage:
 *   npx tsx scripts/elo-estimate.ts [options]
 * 
 * Options:
 *   --games <file>     Games file from self-play (default: training-data-games.json)
 *   --depth <n>        Filter games by search depth
 *   --anchor <rating>  Anchor rating for estimation (default: 1200)
 *   --verbose          Show detailed calculations
 */

import * as fs from 'fs';
import * as path from 'path';

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

interface EloConfig {
  gamesFile: string;
  depth?: number;
  anchorRating: number;
  verbose: boolean;
  kFactor: number;
}

interface AgentRating {
  id: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  ratingHistory: { game: number; rating: number; opponent: string; result: string }[];
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG: EloConfig = {
  gamesFile: 'training-data-games.json',
  depth: undefined,
  anchorRating: 1200, // Base rating for depth-1 engine
  verbose: false,
  kFactor: 32,
};

// =============================================================================
// Reference Engine Pool
// =============================================================================

/**
 * Reference engines with estimated Elo ratings.
 * These are synthetic opponents based on search depth.
 */
const REFERENCE_POOL: { depth: number; estimatedElo: number }[] = [
  { depth: 1, estimatedElo: 800 },
  { depth: 2, estimatedElo: 1000 },
  { depth: 3, estimatedElo: 1200 },
  { depth: 4, estimatedElo: 1400 },
  { depth: 5, estimatedElo: 1600 },
  { depth: 6, estimatedElo: 1800 },
  { depth: 7, estimatedElo: 2000 },
  { depth: 8, estimatedElo: 2150 },
];

// =============================================================================
// Elo Calculator
// =============================================================================

class EloEstimator {
  private config: EloConfig;
  private agents: Map<string, AgentRating> = new Map();

  constructor(config: EloConfig) {
    this.config = config;
  }

  /**
   * Calculate expected score for player A against player B
   */
  private expectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  /**
   * Calculate Elo change from game result
   */
  private eloChange(rating: number, opponentRating: number, score: number): number {
    const expected = this.expectedScore(rating, opponentRating);
    return Math.round(this.config.kFactor * (score - expected));
  }

  /**
   * Get or create agent rating
   */
  private getOrCreateAgent(id: string, initialRating: number = 1200): AgentRating {
    if (!this.agents.has(id)) {
      this.agents.set(id, {
        id,
        rating: initialRating,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        ratingHistory: [],
      });
    }
    return this.agents.get(id)!;
  }

  /**
   * Process a game result between two agents
   */
  private processGame(white: AgentRating, black: AgentRating, result: 'white' | 'black' | 'draw'): void {
    const whiteScore = result === 'white' ? 1 : result === 'draw' ? 0.5 : 0;
    const blackScore = 1 - whiteScore;

    // Calculate rating changes
    const whiteChange = this.eloChange(white.rating, black.rating, whiteScore);
    const blackChange = this.eloChange(black.rating, white.rating, blackScore);

    // Update ratings
    white.rating += whiteChange;
    black.rating += blackChange;

    // Update stats
    white.games++;
    black.games++;

    if (result === 'white') {
      white.wins++;
      black.losses++;
    } else if (result === 'black') {
      black.wins++;
      white.losses++;
    } else {
      white.draws++;
      black.draws++;
    }

    // Record history
    white.ratingHistory.push({
      game: white.games,
      rating: white.rating,
      opponent: black.id,
      result: result === 'white' ? 'win' : result === 'draw' ? 'draw' : 'loss',
    });
    black.ratingHistory.push({
      game: black.games,
      rating: black.rating,
      opponent: white.id,
      result: result === 'black' ? 'win' : result === 'draw' ? 'draw' : 'loss',
    });
  }

  /**
   * Load and process games from file
   */
  async run(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║               Chess Engine Elo Estimation                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log();

    // Load games
    const gamesPath = path.resolve(this.config.gamesFile);
    if (!fs.existsSync(gamesPath)) {
      console.error(`Error: Games file not found: ${gamesPath}`);
      console.log('\nRun self-play first:');
      console.log('  npx tsx scripts/self-play.ts --games 20 --depth 4');
      process.exit(1);
    }

    const gamesData = JSON.parse(fs.readFileSync(gamesPath, 'utf-8'));
    let games: GameRecord[] = Array.isArray(gamesData) ? gamesData : gamesData.games || [];

    console.log(`Loaded ${games.length} games from ${this.config.gamesFile}`);

    // Filter by depth if specified
    if (this.config.depth !== undefined) {
      games = games.filter(g => g.whiteDepth === this.config.depth || g.blackDepth === this.config.depth);
      console.log(`Filtered to ${games.length} games at depth ${this.config.depth}`);
    }

    if (games.length === 0) {
      console.error('\nNo games to analyze.');
      process.exit(1);
    }

    console.log();

    // Initialize agents based on depth
    this.initializeAgents(games);

    // Process all games
    console.log('Processing games...\n');

    for (const game of games) {
      const whiteId = `depth-${game.whiteDepth}`;
      const blackId = `depth-${game.blackDepth}`;

      const white = this.getOrCreateAgent(whiteId);
      const black = this.getOrCreateAgent(blackId);

      this.processGame(white, black, game.result);

      if (this.config.verbose) {
        console.log(`Game: ${white.id} vs ${black.id} -> ${game.result}`);
        console.log(`  ${white.id}: ${white.rating} | ${black.id}: ${black.rating}`);
      }
    }

    // Print results
    this.printResults();

    // Extrapolate to absolute Elo
    this.printAbsoluteEloEstimate();
  }

  /**
   * Initialize agents with starting ratings based on depth
   */
  private initializeAgents(games: GameRecord[]): void {
    const depths = new Set<number>();
    for (const game of games) {
      depths.add(game.whiteDepth);
      depths.add(game.blackDepth);
    }

    for (const depth of depths) {
      const reference = REFERENCE_POOL.find(r => r.depth === depth);
      const initialRating = reference?.estimatedElo ?? this.config.anchorRating + (depth - 3) * 200;
      this.getOrCreateAgent(`depth-${depth}`, initialRating);
    }
  }

  /**
   * Print rating results
   */
  private printResults(): void {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                     Relative Elo Ratings                       ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log();

    const sortedAgents = Array.from(this.agents.values())
      .sort((a, b) => b.rating - a.rating);

    console.log('Agent           Rating   Games   W-L-D     Win%');
    console.log('─'.repeat(55));

    for (const agent of sortedAgents) {
      const winRate = agent.games > 0 
        ? ((agent.wins + agent.draws * 0.5) / agent.games * 100).toFixed(1)
        : '0.0';
      const record = `${agent.wins}-${agent.losses}-${agent.draws}`;
      console.log(
        `${agent.id.padEnd(15)} ${agent.rating.toString().padStart(6)}   ${agent.games.toString().padStart(5)}   ${record.padStart(9)}   ${winRate.padStart(5)}%`
      );
    }

    console.log();
  }

  /**
   * Extrapolate to approximate absolute Elo
   */
  private printAbsoluteEloEstimate(): void {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                   Absolute Elo Estimation                      ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log();

    console.log('Methodology:');
    console.log('  - Baseline: Simple material-only evaluator ≈ 800 Elo');
    console.log('  - Each depth adds ~150-200 Elo (diminishing returns)');
    console.log('  - Full evaluation adds ~100-150 Elo over material-only');
    console.log();

    // Sort by depth
    const agents = Array.from(this.agents.values())
      .map(a => ({ ...a, depth: parseInt(a.id.split('-')[1]) }))
      .sort((a, b) => a.depth - b.depth);

    console.log('Depth   Internal Rating   Estimated Absolute Elo   Confidence');
    console.log('─'.repeat(65));

    for (const agent of agents) {
      const reference = REFERENCE_POOL.find(r => r.depth === agent.depth);
      const absoluteElo = reference?.estimatedElo ?? 800 + agent.depth * 175;
      
      // Confidence based on number of games
      const confidence = agent.games >= 50 ? 'High' 
                       : agent.games >= 20 ? 'Medium' 
                       : agent.games >= 5 ? 'Low' 
                       : 'Very Low';
      
      // Adjust based on performance
      const performanceAdjust = (agent.rating - this.config.anchorRating) * 0.3;
      const adjustedElo = Math.round(absoluteElo + performanceAdjust);

      console.log(
        `  ${agent.depth.toString().padStart(2)}    ${agent.rating.toString().padStart(14)}   ${adjustedElo.toString().padStart(22)}   ${confidence.padStart(10)}`
      );
    }

    console.log();
    console.log('Note: Absolute Elo estimates are approximate.');
    console.log('      Accurate calibration requires games against rated opponents.');
    console.log();

    // Performance summary
    this.printPerformanceSummary();
  }

  /**
   * Print performance summary and recommendations
   */
  private printPerformanceSummary(): void {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    Performance Summary                         ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log();

    const agents = Array.from(this.agents.values());
    const totalGames = agents.reduce((sum, a) => sum + a.games, 0) / 2; // Each game counted twice
    const avgRating = agents.reduce((sum, a) => sum + a.rating, 0) / agents.length;

    console.log(`Total games analyzed: ${totalGames}`);
    console.log(`Agents tracked: ${agents.length}`);
    console.log(`Average rating: ${Math.round(avgRating)}`);
    console.log();

    // Find strongest depth
    const strongest = agents.reduce((max, a) => a.rating > max.rating ? a : max);
    console.log(`Strongest configuration: ${strongest.id} (${strongest.rating} Elo)`);

    // Recommendations
    console.log();
    console.log('Recommendations:');
    if (totalGames < 20) {
      console.log('  ⚠ Run more self-play games for accurate ratings (recommend 50+)');
    }
    if (agents.length < 3) {
      console.log('  ⚠ Test multiple depths for better calibration');
    }
    if (strongest.games < 10) {
      console.log('  ⚠ More games needed for top performer');
    }

    console.log();
    console.log('To improve accuracy:');
    console.log('  npx tsx scripts/self-play.ts --games 50 --depth 5');
    console.log('  npx tsx scripts/elo-estimate.ts --games training-data-games.json');
    console.log();
  }
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs(): EloConfig {
  const config = { ...DEFAULT_CONFIG };
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--games':
        config.gamesFile = args[++i];
        break;
      case '--depth':
        config.depth = parseInt(args[++i]);
        break;
      case '--anchor':
        config.anchorRating = parseInt(args[++i]);
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--k-factor':
        config.kFactor = parseInt(args[++i]);
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
Chess Engine Elo Estimation

Usage:
  npx tsx scripts/elo-estimate.ts [options]

Options:
  --games <file>     Games file from self-play (default: training-data-games.json)
  --depth <n>        Filter games by search depth
  --anchor <rating>  Anchor rating for estimation (default: 1200)
  --k-factor <n>     Elo K-factor (default: 32)
  --verbose, -v      Show detailed calculations
  --help, -h         Show this help

Example:
  # Estimate Elo from self-play results
  npx tsx scripts/elo-estimate.ts --games training-data-games.json

  # Focus on specific depth
  npx tsx scripts/elo-estimate.ts --depth 4

  # With verbose output
  npx tsx scripts/elo-estimate.ts --verbose
`);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const config = parseArgs();
  const estimator = new EloEstimator(config);
  await estimator.run();
}

main().catch(console.error);
