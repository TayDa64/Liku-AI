#!/usr/bin/env node

/**
 * Chess AI Battle Script
 * 
 * Runs AI vs AI chess matches with configurable parameters.
 * Supports Gemini vs Minimax, different difficulty levels,
 * and outputs game analysis.
 * 
 * Usage:
 *   node scripts/chess-ai-battle.js [options]
 * 
 * Options:
 *   --white <difficulty>   White player difficulty (beginner|intermediate|advanced|grandmaster)
 *   --black <difficulty>   Black player difficulty
 *   --games <n>            Number of games to play (default: 1)
 *   --output <file>        Output PGN file
 *   --verbose              Show move-by-move output
 *   --gemini-white         Use Gemini AI for white
 *   --gemini-black         Use Gemini AI for black
 */

import { ChessAI, ChessAIMatch } from '../src/chess/index.js';

// =============================================================================
// Command Line Parsing
// =============================================================================

function parseArgs(args) {
  const options = {
    whiteDifficulty: 'intermediate',
    blackDifficulty: 'intermediate',
    games: 1,
    output: null,
    verbose: false,
    geminiWhite: false,
    geminiBlack: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--white':
        options.whiteDifficulty = args[++i];
        break;
      case '--black':
        options.blackDifficulty = args[++i];
        break;
      case '--games':
        options.games = parseInt(args[++i], 10);
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--gemini-white':
        options.geminiWhite = true;
        break;
      case '--gemini-black':
        options.geminiBlack = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Chess AI Battle Script

Usage:
  node scripts/chess-ai-battle.js [options]

Options:
  --white <level>     White player difficulty (beginner|intermediate|advanced|grandmaster)
  --black <level>     Black player difficulty
  --games <n>         Number of games to play (default: 1)
  --output <file>     Output PGN file
  --verbose           Show move-by-move output
  --gemini-white      Use Gemini AI for white (requires GEMINI_API_KEY)
  --gemini-black      Use Gemini AI for black (requires GEMINI_API_KEY)
  --help              Show this help message

Examples:
  # Two intermediate AIs play one game
  node scripts/chess-ai-battle.js --verbose

  # Grandmaster vs beginner, 5 games
  node scripts/chess-ai-battle.js --white grandmaster --black beginner --games 5

  # Gemini vs Minimax
  node scripts/chess-ai-battle.js --white intermediate --gemini-white --black grandmaster
`);
}

// =============================================================================
// Display Functions
// =============================================================================

function displayBoard(fen) {
  const PIECE_DISPLAY = {
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
  };

  const position = fen.split(' ')[0];
  const rows = position.split('/');
  
  console.log('\n  ┌───┬───┬───┬───┬───┬───┬───┬───┐');
  
  rows.forEach((row, rankIdx) => {
    let rowDisplay = `${8 - rankIdx} │`;
    
    for (const char of row) {
      if (/\d/.test(char)) {
        for (let i = 0; i < parseInt(char, 10); i++) {
          rowDisplay += '   │';
        }
      } else {
        const piece = PIECE_DISPLAY[char] || char;
        rowDisplay += ` ${piece} │`;
      }
    }
    
    console.log(rowDisplay);
    
    if (rankIdx < 7) {
      console.log('  ├───┼───┼───┼───┼───┼───┼───┼───┤');
    }
  });
  
  console.log('  └───┴───┴───┴───┴───┴───┴───┴───┘');
  console.log('    a   b   c   d   e   f   g   h\n');
}

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatEval(cp) {
  if (Math.abs(cp) > 10000) {
    const mateIn = Math.ceil((50000 - Math.abs(cp)) / 2);
    return cp > 0 ? `#${mateIn}` : `#-${mateIn}`;
  }
  const pawns = cp / 100;
  return pawns >= 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}

// =============================================================================
// Match Runner
// =============================================================================

async function runMatch(options) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                   CHESS AI BATTLE                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log(`White: ${options.whiteDifficulty}${options.geminiWhite ? ' (Gemini)' : ' (Minimax)'}`);
  console.log(`Black: ${options.blackDifficulty}${options.geminiBlack ? ' (Gemini)' : ' (Minimax)'}`);
  console.log(`Games: ${options.games}\n`);

  // Create AI players
  const whiteAI = ChessAI.fromDifficulty(options.whiteDifficulty, {
    useGemini: options.geminiWhite,
  });

  const blackAI = ChessAI.fromDifficulty(options.blackDifficulty, {
    useGemini: options.geminiBlack,
  });

  // Create match
  const match = new ChessAIMatch(whiteAI, blackAI);

  // Stats tracking
  const results = {
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    games: [],
  };

  // Play games
  for (let gameNum = 1; gameNum <= options.games; gameNum++) {
    console.log(`\n────────────────────────────────────────`);
    console.log(`           GAME ${gameNum} of ${options.games}`);
    console.log(`────────────────────────────────────────\n`);

    const gameResult = await playGame(match, options.verbose);
    results.games.push(gameResult);

    // Update stats
    if (gameResult.result === '1-0') {
      results.whiteWins++;
      console.log('\n✓ White wins!');
    } else if (gameResult.result === '0-1') {
      results.blackWins++;
      console.log('\n✓ Black wins!');
    } else {
      results.draws++;
      console.log('\n═ Draw');
    }

    console.log(`Result: ${gameResult.result}`);
    console.log(`Moves: ${gameResult.moves.length}`);
    console.log(`Total time: ${formatTime(gameResult.totalTime)}`);
  }

  // Print summary
  printSummary(results, options);

  // Save PGN if requested
  if (options.output) {
    savePGN(results, options);
  }

  return results;
}

async function playGame(match, verbose) {
  // Reset match for new game
  match.reset();

  const moves = [];
  let totalTime = 0;

  while (!match.engine.isGameOver()) {
    const turn = match.engine.turn();
    const moveNum = Math.floor(match.engine.getState().moveNumber);
    
    const startTime = Date.now();
    const ai = turn === 'w' ? match.whiteAI : match.blackAI;
    
    try {
      const moveResult = await ai.getBestMove(match.engine.fen());
      const moveTime = Date.now() - startTime;
      totalTime += moveTime;

      // Make the move
      const result = match.engine.move(moveResult.move);
      
      if (!result) {
        console.error(`Invalid move: ${moveResult.move}`);
        break;
      }

      moves.push({
        move: result.san,
        evaluation: moveResult.evaluation,
        time: moveTime,
        fen: match.engine.fen(),
      });

      if (verbose) {
        const moveStr = turn === 'w' ? `${moveNum}. ${result.san}` : `${moveNum}... ${result.san}`;
        console.log(`${moveStr.padEnd(15)} eval: ${formatEval(moveResult.evaluation).padStart(7)}  time: ${formatTime(moveTime)}`);
        
        // Show board every 5 moves or at game end
        if (moves.length % 10 === 0 || match.engine.isGameOver()) {
          displayBoard(match.engine.fen());
        }
      } else if (moves.length % 10 === 0) {
        process.stdout.write('.');
      }
    } catch (error) {
      console.error(`AI error: ${error.message}`);
      break;
    }
  }

  // Determine result
  const state = match.engine.getState();
  let result = '1/2-1/2';
  
  if (state.isCheckmate) {
    result = state.turn === 'w' ? '0-1' : '1-0';
  } else if (state.isDraw) {
    result = '1/2-1/2';
  }

  if (verbose) {
    displayBoard(match.engine.fen());
  }

  return {
    result,
    moves,
    totalTime,
    pgn: match.engine.pgn(),
    fen: match.engine.fen(),
    reason: state.isCheckmate ? 'checkmate' : state.drawReason || 'unknown',
  };
}

function printSummary(results, options) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                     MATCH SUMMARY                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log(`White (${options.whiteDifficulty}): ${results.whiteWins} wins`);
  console.log(`Black (${options.blackDifficulty}): ${results.blackWins} wins`);
  console.log(`Draws: ${results.draws}`);
  
  const totalGames = results.whiteWins + results.blackWins + results.draws;
  const whiteScore = results.whiteWins + results.draws * 0.5;
  const blackScore = results.blackWins + results.draws * 0.5;
  
  console.log(`\nScore: ${whiteScore} - ${blackScore}`);
  console.log(`White win rate: ${((results.whiteWins / totalGames) * 100).toFixed(1)}%`);
  
  // Average game length
  const avgMoves = results.games.reduce((sum, g) => sum + g.moves.length, 0) / results.games.length;
  const avgTime = results.games.reduce((sum, g) => sum + g.totalTime, 0) / results.games.length;
  
  console.log(`\nAverage game length: ${avgMoves.toFixed(1)} moves`);
  console.log(`Average game time: ${formatTime(avgTime)}`);
}

function savePGN(results, options) {
  const fs = require('fs');
  
  let pgnContent = '';
  
  results.games.forEach((game, idx) => {
    pgnContent += `[Event "AI Battle"]\n`;
    pgnContent += `[Site "Liku Chess"]\n`;
    pgnContent += `[Date "${new Date().toISOString().split('T')[0]}"]\n`;
    pgnContent += `[Round "${idx + 1}"]\n`;
    pgnContent += `[White "${options.whiteDifficulty}${options.geminiWhite ? ' (Gemini)' : ''}"]\n`;
    pgnContent += `[Black "${options.blackDifficulty}${options.geminiBlack ? ' (Gemini)' : ''}"]\n`;
    pgnContent += `[Result "${game.result}"]\n\n`;
    pgnContent += game.pgn;
    pgnContent += `\n\n`;
  });

  fs.writeFileSync(options.output, pgnContent);
  console.log(`\nPGN saved to: ${options.output}`);
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // Check for Gemini API key if needed
  if ((options.geminiWhite || options.geminiBlack) && 
      !process.env.GEMINI_API_KEY && !process.env.GOOGLE_AI_API_KEY) {
    console.warn('Warning: No Gemini API key found. Gemini AI features disabled.');
    options.geminiWhite = false;
    options.geminiBlack = false;
  }

  try {
    await runMatch(options);
  } catch (error) {
    console.error('\nMatch error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
