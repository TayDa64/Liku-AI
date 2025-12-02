#!/usr/bin/env node
/**
 * AI Game Observer - Live Spectator Terminal
 * 
 * A passive observer that displays AI-vs-AI games in real-time
 * without interfering with gameplay. Uses ANSI escape codes for
 * smooth, flicker-free updates.
 * 
 * Usage:
 *   node scripts/observe-game.js              # Watch any active game
 *   node scripts/observe-game.js LIKU-XXXX    # Watch specific match
 *   node scripts/observe-game.js --file       # Also write to ai-game-state.txt
 * 
 * The observer is READ-ONLY and does not send any game commands.
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

// Configuration
const WS_URL = 'ws://localhost:3847';
const MATCH_CODE = process.argv.find(arg => arg.startsWith('LIKU-'));
const WRITE_FILE = process.argv.includes('--file');
const STATE_FILE = path.join(process.cwd(), 'ai-game-state.txt');

// ANSI escape codes for smooth rendering
const ANSI = {
  clear: '\x1b[2J\x1b[H',        // Clear screen and move to top
  home: '\x1b[H',                 // Move cursor to top-left
  hide: '\x1b[?25l',              // Hide cursor
  show: '\x1b[?25h',              // Show cursor
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  // Backgrounds
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

// Game state
let gameState = {
  matchCode: null,
  sessionId: null,
  status: 'connecting',
  players: { X: null, O: null },
  board: [[null, null, null], [null, null, null], [null, null, null]],
  currentTurn: null,
  moveHistory: [],
  winner: null,
  gameNumber: 0,
  lastUpdate: Date.now(),
};

// Render the game board with box-drawing characters
function renderBoard(board) {
  const cellWidth = 5;
  const lines = [];
  
  // Column headers
  lines.push(`${ANSI.gray}       1     2     3${ANSI.reset}`);
  lines.push(`${ANSI.gray}     ┌─────┬─────┬─────┐${ANSI.reset}`);
  
  const rowLabels = ['A', 'B', 'C'];
  
  for (let r = 0; r < 3; r++) {
    let row = `${ANSI.gray}  ${rowLabels[r]}  │${ANSI.reset}`;
    for (let c = 0; c < 3; c++) {
      const cell = board[r][c];
      let cellStr;
      if (cell === 'X') {
        cellStr = `${ANSI.cyan}${ANSI.bold}  X  ${ANSI.reset}`;
      } else if (cell === 'O') {
        cellStr = `${ANSI.magenta}${ANSI.bold}  O  ${ANSI.reset}`;
      } else {
        cellStr = `${ANSI.dim}  ·  ${ANSI.reset}`;
      }
      row += cellStr + `${ANSI.gray}│${ANSI.reset}`;
    }
    lines.push(row);
    
    if (r < 2) {
      lines.push(`${ANSI.gray}     ├─────┼─────┼─────┤${ANSI.reset}`);
    }
  }
  
  lines.push(`${ANSI.gray}     └─────┴─────┴─────┘${ANSI.reset}`);
  
  return lines.join('\n');
}

// Render move history with reasoning
function renderMoveHistory(moves, maxMoves = 9) {
  if (moves.length === 0) {
    return `${ANSI.dim}  No moves yet...${ANSI.reset}`;
  }
  
  const lines = [];
  const displayMoves = moves.slice(-maxMoves);
  
  for (const move of displayMoves) {
    const playerColor = move.slot === 'X' ? ANSI.cyan : ANSI.magenta;
    const rowLabel = ['A', 'B', 'C'][move.row];
    const colLabel = move.col + 1;
    const position = `${rowLabel}${colLabel}`;
    
    let line = `  ${ANSI.gray}${move.moveNum}.${ANSI.reset} `;
    line += `${playerColor}${ANSI.bold}${move.slot}${ANSI.reset} `;
    line += `${ANSI.white}${move.player.padEnd(12)}${ANSI.reset} `;
    line += `${ANSI.yellow}${position}${ANSI.reset}`;
    
    if (move.reason) {
      line += ` ${ANSI.dim}- "${move.reason}"${ANSI.reset}`;
    }
    
    lines.push(line);
  }
  
  return lines.join('\n');
}

// Render the full display
function render() {
  const lines = [];
  
  // Header
  lines.push('');
  lines.push(`${ANSI.bgBlue}${ANSI.white}${ANSI.bold}  🎮 TicTacToe AI Battle - Live Observer  ${ANSI.reset}`);
  lines.push('');
  
  // Match info
  if (gameState.matchCode) {
    lines.push(`  ${ANSI.gray}Match:${ANSI.reset} ${ANSI.yellow}${gameState.matchCode}${ANSI.reset}    ${ANSI.gray}Game:${ANSI.reset} ${gameState.gameNumber || 1}`);
  }
  
  // Players
  const xPlayer = gameState.players.X || 'Waiting...';
  const oPlayer = gameState.players.O || 'Waiting...';
  lines.push('');
  lines.push(`  ${ANSI.cyan}${ANSI.bold}X${ANSI.reset} ${xPlayer.padEnd(15)} vs ${ANSI.magenta}${ANSI.bold}O${ANSI.reset} ${oPlayer}`);
  lines.push('');
  
  // Board
  lines.push(renderBoard(gameState.board));
  lines.push('');
  
  // Status line
  if (gameState.winner) {
    if (gameState.winner === 'draw') {
      lines.push(`  ${ANSI.yellow}${ANSI.bold}🤝 GAME OVER - DRAW${ANSI.reset}`);
    } else {
      const winnerName = gameState.players[gameState.winner] || gameState.winner;
      const winColor = gameState.winner === 'X' ? ANSI.cyan : ANSI.magenta;
      lines.push(`  ${winColor}${ANSI.bold}🏆 WINNER: ${winnerName} (${gameState.winner})${ANSI.reset}`);
    }
  } else if (gameState.currentTurn) {
    const turnColor = gameState.currentTurn === 'X' ? ANSI.cyan : ANSI.magenta;
    const turnPlayer = gameState.players[gameState.currentTurn] || '?';
    lines.push(`  ${turnColor}▶ ${turnPlayer}'s turn (${gameState.currentTurn})${ANSI.reset}`);
  } else if (gameState.status === 'waiting') {
    lines.push(`  ${ANSI.yellow}⏳ Waiting for players to ready up...${ANSI.reset}`);
  } else if (gameState.status === 'connecting') {
    lines.push(`  ${ANSI.gray}🔌 Connecting to server...${ANSI.reset}`);
  }
  
  lines.push('');
  lines.push(`${ANSI.gray}  ─────────────────────────────────────────${ANSI.reset}`);
  lines.push(`  ${ANSI.bold}Move History:${ANSI.reset}`);
  lines.push(renderMoveHistory(gameState.moveHistory));
  lines.push('');
  lines.push(`${ANSI.gray}  ─────────────────────────────────────────${ANSI.reset}`);
  lines.push(`  ${ANSI.dim}Press Ctrl+C to exit${ANSI.reset}`);
  lines.push('');
  
  // Use cursor positioning for flicker-free update
  process.stdout.write(ANSI.home + lines.join('\n'));
}

// Write state to file (optional)
function writeStateFile() {
  if (!WRITE_FILE) return;
  
  const rowLabels = ['A', 'B', 'C'];
  let boardStr = '';
  for (let r = 0; r < 3; r++) {
    boardStr += `  ${rowLabels[r]} `;
    for (let c = 0; c < 3; c++) {
      boardStr += ` ${gameState.board[r][c] || '.'} `;
      if (c < 2) boardStr += '|';
    }
    boardStr += '\n';
    if (r < 2) boardStr += '    ---+---+---\n';
  }
  
  let content = `MATCH: ${gameState.matchCode || 'N/A'}\n`;
  content += `SESSION: ${gameState.sessionId || 'N/A'}\n`;
  content += `GAME: ${gameState.gameNumber || 1}\n`;
  content += `STATUS: ${gameState.winner ? `Game Over - ${gameState.winner}` : gameState.currentTurn ? `${gameState.currentTurn}'s Turn` : 'Waiting'}\n`;
  content += `\nPLAYERS:\n`;
  content += `  X: ${gameState.players.X || 'TBD'}\n`;
  content += `  O: ${gameState.players.O || 'TBD'}\n`;
  content += `\nBOARD:\n      1   2   3\n${boardStr}\n`;
  content += `MOVE HISTORY:\n`;
  
  for (const move of gameState.moveHistory) {
    const pos = `${rowLabels[move.row]}${move.col + 1}`;
    content += `  ${move.moveNum}. ${move.slot} (${move.player}): ${pos}`;
    if (move.reason) content += ` - "${move.reason}"`;
    content += '\n';
  }
  
  content += `\nLAST UPDATE: ${new Date().toISOString()}\n`;
  
  try {
    fs.writeFileSync(STATE_FILE, content, 'utf-8');
  } catch (err) {
    // Silently ignore file write errors
  }
}

// Connect to server
function connect() {
  const ws = new WebSocket(`${WS_URL}?name=Observer&type=spectator`);
  
  ws.on('open', () => {
    gameState.status = 'connected';
    
    // Subscribe to all events (read-only)
    ws.send(JSON.stringify({
      type: 'subscribe',
      payload: { events: ['*'] },
      requestId: 'obs-sub'
    }));
    
    // If specific match code provided, try to spectate it
    if (MATCH_CODE) {
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'action',
          payload: { action: 'spectate_match', matchCode: MATCH_CODE },
          requestId: 'obs-spectate'
        }));
      }, 300);
    }
    
    render();
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(msg);
    } catch (err) {
      // Ignore parse errors
    }
  });
  
  ws.on('close', () => {
    gameState.status = 'disconnected';
    render();
    console.log(`\n${ANSI.yellow}Disconnected from server. Reconnecting in 3s...${ANSI.reset}`);
    setTimeout(connect, 3000);
  });
  
  ws.on('error', (err) => {
    // Silently handle errors, will reconnect
  });
}

// Handle incoming messages
function handleMessage(msg) {
  const data = msg.data || {};
  
  // Track match code
  if (data.matchCode && !gameState.matchCode) {
    gameState.matchCode = data.matchCode;
  }
  
  // Track session
  if (data.sessionId) {
    gameState.sessionId = data.sessionId;
  }
  
  // Handle events
  if (data.event) {
    switch (data.event) {
      case 'session:playerJoined':
      case 'opponent_found':
        if (data.host) {
          gameState.players[data.host.slot] = data.host.name;
        }
        if (data.guest) {
          gameState.players[data.guest.slot] = data.guest.name;
        }
        if (data.yourSlot && data.opponent) {
          // This is from a player's perspective
        }
        gameState.status = 'waiting';
        break;
        
      case 'session:gameStarted':
        gameState.status = 'playing';
        gameState.gameNumber++;
        gameState.moveHistory = [];
        gameState.winner = null;
        gameState.board = [[null, null, null], [null, null, null], [null, null, null]];
        if (data.state) {
          gameState.currentTurn = data.state.currentPlayer;
          if (data.state.board) {
            gameState.board = data.state.board;
          }
        }
        break;
        
      case 'session:moveMade':
        if (data.state?.board) {
          gameState.board = data.state.board;
        }
        if (data.move) {
          // Add to history if we have the info
          const moveNum = gameState.moveHistory.length + 1;
          const existingMove = gameState.moveHistory.find(
            m => m.row === data.move.row && m.col === data.move.col
          );
          if (!existingMove) {
            gameState.moveHistory.push({
              moveNum,
              row: data.move.row,
              col: data.move.col,
              slot: data.move.player || data.player || '?',
              player: data.playerName || data.move.player || '?',
              reason: null, // Will be filled by moveReasoning event
            });
          }
        }
        if (data.state?.currentPlayer) {
          gameState.currentTurn = data.state.currentPlayer;
        }
        break;
        
      case 'session:moveReasoning':
        // Find the most recent move and add reasoning
        if (data.move && data.reason) {
          const move = gameState.moveHistory.find(
            m => m.row === data.move.row && m.col === data.move.col && !m.reason
          );
          if (move) {
            move.reason = data.reason;
            move.player = data.player || move.player;
            move.slot = data.slot || move.slot;
          }
        }
        break;
        
      case 'session:yourTurn':
      case 'session:turnChanged':
        if (data.state?.currentPlayer) {
          gameState.currentTurn = data.state.currentPlayer;
        }
        if (data.currentPlayer) {
          gameState.currentTurn = data.currentPlayer;
        }
        break;
        
      case 'session:gameEnded':
        gameState.winner = data.winner || 'draw';
        gameState.currentTurn = null;
        if (data.state?.board) {
          gameState.board = data.state.board;
        }
        break;
        
      case 'session:stateUpdate':
        if (data.state?.board) {
          gameState.board = data.state.board;
        }
        if (data.state?.currentPlayer) {
          gameState.currentTurn = data.state.currentPlayer;
        }
        break;
    }
  }
  
  // Also check for direct state updates
  if (data.state?.board) {
    gameState.board = data.state.board;
  }
  
  // Check for player info in various formats
  if (data.host?.name && data.host?.slot) {
    gameState.players[data.host.slot] = data.host.name;
  }
  if (data.guest?.name && data.guest?.slot) {
    gameState.players[data.guest.slot] = data.guest.name;
  }
  
  gameState.lastUpdate = Date.now();
  render();
  writeStateFile();
}

// Main
function main() {
  // Clear screen and hide cursor
  process.stdout.write(ANSI.clear + ANSI.hide);
  
  // Show cursor on exit
  process.on('SIGINT', () => {
    process.stdout.write(ANSI.show + '\n');
    process.exit(0);
  });
  
  process.on('exit', () => {
    process.stdout.write(ANSI.show);
  });
  
  console.log(`${ANSI.cyan}Starting AI Game Observer...${ANSI.reset}`);
  if (MATCH_CODE) {
    console.log(`${ANSI.gray}Will spectate match: ${MATCH_CODE}${ANSI.reset}`);
  }
  if (WRITE_FILE) {
    console.log(`${ANSI.gray}Writing state to: ${STATE_FILE}${ANSI.reset}`);
  }
  
  setTimeout(() => {
    process.stdout.write(ANSI.clear);
    connect();
  }, 500);
}

main();
