#!/usr/bin/env node
/**
 * AutoPlayer CLI - Run the auto-player from command line
 * 
 * Usage:
 *   npm run autoplay -- --game dino
 *   npm run autoplay -- --game dino --verbose
 *   npm run autoplay -- --game dino --dry-run
 */

import { AutoPlayer, GameType } from './AutoPlayer.js';

// Parse command line arguments
function parseArgs(): {
  game: GameType;
  pollInterval: number;
  verbose: boolean;
  dryRun: boolean;
  maxLoops: number;
  help: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    game: 'auto' as GameType,
    pollInterval: 30,
    verbose: false,
    dryRun: false,
    maxLoops: 0,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--game':
      case '-g':
        if (i + 1 < args.length) {
          const game = args[++i]?.toLowerCase();
          if (['dino', 'snake', 'tictactoe', 'auto'].includes(game)) {
            result.game = game as GameType;
          }
        }
        break;
        
      case '--poll':
      case '-p':
        if (i + 1 < args.length) {
          result.pollInterval = parseInt(args[++i], 10) || 30;
        }
        break;
        
      case '--verbose':
      case '-v':
        result.verbose = true;
        break;
        
      case '--dry-run':
      case '-d':
        result.dryRun = true;
        break;
        
      case '--max-loops':
      case '-m':
        if (i + 1 < args.length) {
          result.maxLoops = parseInt(args[++i], 10) || 0;
        }
        break;
        
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }
  
  return result;
}

function printHelp(): void {
  console.log(`
🎮 LikuBuddy AutoPlayer - Fast Polling AI Controller

Usage:
  npx ts-node src/autoplayer/cli.ts [options]
  npm run autoplay -- [options]

Options:
  --game, -g <name>     Game to play: dino, snake, tictactoe, auto (default: auto)
  --poll, -p <ms>       Polling interval in ms (default: 30)
  --verbose, -v         Show detailed decision logs
  --dry-run, -d         Parse state and decide, but don't send keys
  --max-loops, -m <n>   Stop after N loops (default: 0 = infinite)
  --help, -h            Show this help

Examples:
  # Play Dino Run automatically
  npm run autoplay -- --game dino

  # Verbose mode to see all decisions
  npm run autoplay -- --game dino --verbose

  # Test without actually sending keys
  npm run autoplay -- --game dino --dry-run --verbose

  # Run for 1000 loops then stop
  npm run autoplay -- --game dino --max-loops 1000

Controls:
  Press Ctrl+C to stop the auto-player

Notes:
  • Make sure LikuBuddy is running in a SEPARATE terminal window
  • The game should be started and in the playing state
  • For Dino Run, the auto-player will handle starting/restarting
`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     🤖 LikuBuddy AutoPlayer v1.0.0 🤖      ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log('║  Fast Polling AI - Target: <50ms/loop      ║');
  console.log('║  Press Ctrl+C to stop                      ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
  
  const player = new AutoPlayer({
    game: args.game,
    pollInterval: args.pollInterval,
    verbose: args.verbose,
    dryRun: args.dryRun,
    maxLoops: args.maxLoops
  });
  
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    player.stop();
  });
  
  process.on('SIGTERM', () => {
    player.stop();
  });
  
  try {
    const stats = await player.start();
    
    // Exit with appropriate code
    if (stats.gameScore !== undefined && stats.gameScore >= 500) {
      console.log('\n🏆 TARGET ACHIEVED: Score >= 500!');
      process.exit(0);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ AutoPlayer error:', error);
    process.exit(1);
  }
}

main();
