#!/usr/bin/env node
/**
 * Check AI Game Status
 * 
 * Reads the ai-game-state.json file to get the current game status.
 * This allows one AI to check on another AI's game in the background.
 * 
 * Usage:
 *   node scripts/check-game-status.js           # Pretty print status
 *   node scripts/check-game-status.js --json    # Output raw JSON
 *   node scripts/check-game-status.js --watch   # Watch for changes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_STATE_FILE = path.join(__dirname, '..', 'ai-game-state.json');

function readGameState() {
  try {
    if (!fs.existsSync(JSON_STATE_FILE)) {
      return null;
    }
    const content = fs.readFileSync(JSON_STATE_FILE, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function formatBoard(board) {
  if (!board || !Array.isArray(board)) return '  (no board)';
  return [
    `  ${board[0][0] || '·'} │ ${board[0][1] || '·'} │ ${board[0][2] || '·'}`,
    ' ───┼───┼───',
    `  ${board[1][0] || '·'} │ ${board[1][1] || '·'} │ ${board[1][2] || '·'}`,
    ' ───┼───┼───',
    `  ${board[2][0] || '·'} │ ${board[2][1] || '·'} │ ${board[2][2] || '·'}`,
  ].join('\n');
}

function prettyPrint(state) {
  if (!state) {
    console.log('❌ No game state found. Is an AI player running?');
    console.log('   Start with: node scripts/ai-player.js host Claude');
    return;
  }

  const statusEmoji = {
    playing: '🎮',
    waiting: '⏳',
    complete: '🏁',
    idle: '💤',
  };

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║               📊 AI GAME STATUS                            ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Player: ${state.player.name.padEnd(20)} Role: ${state.player.role.padEnd(8)} ║`);
  console.log(`║  Playing as: ${(state.player.slot || 'TBD').padEnd(5)}          Opponent: ${(state.match.opponent || 'None').padEnd(10)} ║`);
  console.log(`║  Status: ${statusEmoji[state.status] || '❓'} ${state.status.padEnd(20)}                ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  
  if (state.match.code) {
    console.log(`║  Match Code: ${state.match.code.padEnd(20)}                 ║`);
  }
  
  if (state.game.inProgress && state.game.board) {
    console.log('║  Board:                                                    ║');
    const boardLines = formatBoard(state.game.board).split('\n');
    boardLines.forEach(line => {
      console.log(`║    ${line.padEnd(54)} ║`);
    });
    console.log(`║  Turn: ${state.game.currentTurn === 'you' ? 'YOUR TURN!' : 'Waiting...'}                                         ║`);
  }
  
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Series: ${state.series.wins}W - ${state.series.losses}L - ${state.series.draws}D (${state.series.played}/${state.series.total} games)                  ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Last Updated: ${state.timestamp.slice(11, 19)}                                ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
}

// Parse args
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const watchMode = args.includes('--watch');

if (watchMode) {
  console.log('👀 Watching for game status changes... (Ctrl+C to stop)\n');
  let lastContent = '';
  
  setInterval(() => {
    const state = readGameState();
    const content = JSON.stringify(state);
    if (content !== lastContent) {
      lastContent = content;
      console.clear();
      if (jsonMode) {
        console.log(JSON.stringify(state, null, 2));
      } else {
        prettyPrint(state);
      }
    }
  }, 500);
} else {
  const state = readGameState();
  if (jsonMode) {
    console.log(JSON.stringify(state, null, 2));
  } else {
    prettyPrint(state);
  }
}
