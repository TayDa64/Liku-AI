#!/usr/bin/env node
/**
 * AI TicTacToe Player - Interactive AI for cross-chat games
 * 
 * Usage:
 *   node scripts/ai-player.js host [name]              # Host a game
 *   node scripts/ai-player.js join [code] [name]       # Join a game
 *   node scripts/ai-player.js join [name]              # Auto-read code from current-match.txt
 * 
 * Options:
 *   --series N    Play N games in a row (default: 1)
 *   --verbose     Show detailed reasoning
 * 
 * Examples:
 *   node scripts/ai-player.js host Claude
 *   node scripts/ai-player.js join Gemini
 *   node scripts/ai-player.js host Claude --series 5
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCH_FILE = path.join(__dirname, '..', 'current-match.txt');
const STATE_FILE = path.join(__dirname, '..', 'ai-game-state.txt');
const JSON_STATE_FILE = path.join(__dirname, '..', 'ai-game-state.json');

// ============================================================================
// Argument Parsing
// ============================================================================

const rawArgs = process.argv.slice(2);
const flags = {
  series: 1,
  verbose: false,
};

// Extract flags
const positionalArgs = [];
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--series' && rawArgs[i + 1]) {
    flags.series = parseInt(rawArgs[i + 1]) || 1;
    i++;
  } else if (rawArgs[i] === '--verbose' || rawArgs[i] === '-v') {
    flags.verbose = true;
  } else if (!rawArgs[i].startsWith('--')) {
    positionalArgs.push(rawArgs[i]);
  }
}

const action = positionalArgs[0] || 'host';
let matchCode = null;
let playerName = null;

if (action === 'host') {
  playerName = positionalArgs[1] || 'HostAI';
} else if (action === 'join') {
  // Check if second arg is a match code or a name
  if (positionalArgs[1]?.startsWith('LIKU-')) {
    matchCode = positionalArgs[1];
    playerName = positionalArgs[2] || 'GuestAI';
  } else {
    playerName = positionalArgs[1] || 'GuestAI';
    // Try to read match code from file
    if (fs.existsSync(MATCH_FILE)) {
      matchCode = fs.readFileSync(MATCH_FILE, 'utf8').trim();
      console.log(`📁 Found match code in current-match.txt: ${matchCode}`);
    } else {
      console.error('❌ No match code provided and current-match.txt not found.');
      console.error('');
      console.error('Usage:');
      console.error('  node scripts/ai-player.js join LIKU-XXXX [name]');
      console.error('  node scripts/ai-player.js join [name]   # reads from current-match.txt');
      console.error('');
      console.error('To see pending matches: node scripts/list-matches.js');
      process.exit(1);
    }
  }
} else {
  console.error('Usage: node scripts/ai-player.js [host|join] [options]');
  process.exit(1);
}

// ============================================================================
// Game State
// ============================================================================

let ws = null;
let sessionId = null;
let mySlot = null;
let opponentName = null;
let board = [[null, null, null], [null, null, null], [null, null, null]];
let pendingMove = false;
let gameInProgress = false;
let waitingForOpponent = false;
let currentMatchCode = null;
let deferredTurn = false; // Track if we need to make a move once we have slot info

// Series tracking
let gamesPlayed = 0;
let wins = 0;
let losses = 0;
let draws = 0;

// ============================================================================
// TicTacToe AI Logic
// ============================================================================

const LINES = [
  [[0, 0], [0, 1], [0, 2]], [[1, 0], [1, 1], [1, 2]], [[2, 0], [2, 1], [2, 2]], // rows
  [[0, 0], [1, 0], [2, 0]], [[0, 1], [1, 1], [2, 1]], [[0, 2], [1, 2], [2, 2]], // cols
  [[0, 0], [1, 1], [2, 2]], [[0, 2], [1, 1], [2, 0]]  // diagonals
];

function findWinningMove(b, symbol) {
  for (const line of LINES) {
    const cells = line.map(([r, c]) => b[r][c]);
    if (cells.filter(x => x === symbol).length === 2 && cells.filter(x => !x).length === 1) {
      const idx = cells.findIndex(x => !x);
      return { pos: line[idx], reason: `Complete winning line` };
    }
  }
  return null;
}

function findBlockingMove(b, oppSymbol) {
  for (const line of LINES) {
    const cells = line.map(([r, c]) => b[r][c]);
    if (cells.filter(x => x === oppSymbol).length === 2 && cells.filter(x => !x).length === 1) {
      const idx = cells.findIndex(x => !x);
      return { pos: line[idx], reason: `Block opponent's winning line` };
    }
  }
  return null;
}

function chooseMove(b, me, opp) {
  // 1. Win if possible
  let m = findWinningMove(b, me);
  if (m) return { ...m, reason: 'WIN: ' + m.reason };

  // 2. Block opponent
  m = findBlockingMove(b, opp);
  if (m) return { ...m, reason: 'BLOCK: ' + m.reason };

  // 3. Take center
  if (!b[1][1]) return { pos: [1, 1], reason: 'STRATEGY: Take center for maximum control' };

  // 4. Take opposite corner
  const cornerPairs = [[[0, 0], [2, 2]], [[0, 2], [2, 0]], [[2, 0], [0, 2]], [[2, 2], [0, 0]]];
  for (const [oppCorner, myCorner] of cornerPairs) {
    if (b[oppCorner[0]][oppCorner[1]] === opp && !b[myCorner[0]][myCorner[1]]) {
      return { pos: myCorner, reason: 'STRATEGY: Take opposite corner' };
    }
  }

  // 5. Take any corner
  for (const [r, c] of [[0, 0], [0, 2], [2, 0], [2, 2]]) {
    if (!b[r][c]) return { pos: [r, c], reason: 'STRATEGY: Take corner for fork potential' };
  }

  // 6. Take any edge
  for (const [r, c] of [[0, 1], [1, 0], [1, 2], [2, 1]]) {
    if (!b[r][c]) return { pos: [r, c], reason: 'FALLBACK: Take edge' };
  }

  return null;
}

// Makes a move if it's our turn
function makeMove() {
  if (pendingMove || !mySlot || !sessionId) return;
  
  pendingMove = true;
  deferredTurn = false;
  
  const opp = mySlot === 'X' ? 'O' : 'X';
  const move = chooseMove(board, mySlot, opp);
  
  if (move) {
    console.log(`\n💭 ${playerName} (${mySlot}): ${move.reason}`);
    console.log(`   → Playing at [${move.pos[0]}, ${move.pos[1]}]`);
    
    send({
      type: 'action',
      payload: {
        action: 'game_move',
        sessionId,
        row: move.pos[0],
        col: move.pos[1],
        reason: move.reason
      },
      requestId: 'move-' + Date.now()
    });
  }
  writeStateFile();
}

// Generates a greeting message for the opponent
function generateGreeting() {
  const greetings = [
    `Hello ${opponentName}! I'm ${playerName}. Good luck and have fun! 🎮`,
    `Hey ${opponentName}! ${playerName} here. May the best AI win! 🤖`,
    `Greetings ${opponentName}! I'm ${playerName}. Ready for a great game? ⚡`,
    `Hi ${opponentName}! ${playerName} reporting for duty. Let's play! 🎯`,
    `${opponentName}! I'm ${playerName}. Prepare for an epic TicTacToe battle! 🔥`,
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

// Generates a game-over message
function generateGameOverMessage(result) {
  if (result === 'win') {
    const messages = [
      `GG ${opponentName}! That was a great game! 🏆`,
      `Well played ${opponentName}! Thanks for the match! 🤝`,
      `Victory! But ${opponentName}, you played well! 🎉`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  } else if (result === 'loss') {
    const messages = [
      `Well played ${opponentName}! You got me this time! 👏`,
      `GG! ${opponentName} was too good! 🎯`,
      `Congrats ${opponentName}! Great strategy! 🌟`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  } else {
    const messages = [
      `A draw! Well played ${opponentName}! 🤝`,
      `Great minds think alike, ${opponentName}! 🧠`,
      `Evenly matched! GG ${opponentName}! ⚖️`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }
}

// ============================================================================
// Display Functions
// ============================================================================

function printBoard(b) {
  console.log('');
  console.log(`  ${b[0][0] || '·'} │ ${b[0][1] || '·'} │ ${b[0][2] || '·'}`);
  console.log(' ───┼───┼───');
  console.log(`  ${b[1][0] || '·'} │ ${b[1][1] || '·'} │ ${b[1][2] || '·'}`);
  console.log(' ───┼───┼───');
  console.log(`  ${b[2][0] || '·'} │ ${b[2][1] || '·'} │ ${b[2][2] || '·'}`);
  console.log('');
}

function printSeriesStatus() {
  console.log(`📊 Series: ${wins}W - ${losses}L - ${draws}D (${gamesPlayed}/${flags.series} games)`);
}

function writeStateFile() {
  const state = `
═══════════════════════════════════════════════════════════════
  🎮 ${playerName} - AI Player State
═══════════════════════════════════════════════════════════════

  Role: ${action === 'host' ? 'HOST' : 'GUEST'}
  Match: ${currentMatchCode || 'None'}
  Session: ${sessionId || 'None'}
  Playing as: ${mySlot || 'TBD'}
  Opponent: ${opponentName || 'Waiting...'}
  Status: ${gameInProgress ? 'In Game' : waitingForOpponent ? 'Waiting for Opponent' : 'Idle'}

  Board:
    ${board[0][0] || '·'} │ ${board[0][1] || '·'} │ ${board[0][2] || '·'}
   ───┼───┼───
    ${board[1][0] || '·'} │ ${board[1][1] || '·'} │ ${board[1][2] || '·'}
   ───┼───┼───
    ${board[2][0] || '·'} │ ${board[2][1] || '·'} │ ${board[2][2] || '·'}

  Series: ${wins}W - ${losses}L - ${draws}D (${gamesPlayed}/${flags.series})

═══════════════════════════════════════════════════════════════
Last Updated: ${new Date().toISOString()}
`.trim();
  
  // JSON state for machine reading
  const jsonState = {
    player: {
      name: playerName,
      role: action === 'host' ? 'HOST' : 'GUEST',
      slot: mySlot,
    },
    match: {
      code: currentMatchCode,
      sessionId: sessionId,
      opponent: opponentName,
    },
    game: {
      inProgress: gameInProgress,
      waitingForOpponent: waitingForOpponent,
      board: board,
      currentTurn: gameInProgress ? (pendingMove ? 'opponent' : 'you') : null,
    },
    series: {
      total: flags.series,
      played: gamesPlayed,
      wins: wins,
      losses: losses,
      draws: draws,
    },
    status: gameInProgress ? 'playing' : waitingForOpponent ? 'waiting' : gamesPlayed >= flags.series ? 'complete' : 'idle',
    timestamp: new Date().toISOString(),
  };
  
  try {
    fs.writeFileSync(STATE_FILE, state, 'utf8');
    fs.writeFileSync(JSON_STATE_FILE, JSON.stringify(jsonState, null, 2), 'utf8');
  } catch (e) {
    // Ignore file write errors
  }
}

// ============================================================================
// WebSocket Event Handlers
// ============================================================================

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleWelcome(data) {
  console.log(`✅ Connected to Liku server`);
  if (flags.verbose) {
    console.log(`   Agent ID: ${data.agent?.id?.slice(0, 12)}...`);
  }
}

function handleAck(msg) {
  const data = msg.data;

  if (data.action === 'host_game') {
    currentMatchCode = data.matchCode;
    waitingForOpponent = true;
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    🎮 GAME HOSTED!                           ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║   Match Code:  ${data.matchCode}                                   ║`);
    console.log(`║   Expires in:  ${data.expiresIn}s                                        ║`);
    console.log('║                                                              ║');
    console.log('║   👉 Share this code with your opponent!                     ║');
    console.log('║                                                              ║');
    console.log('║   They should run:                                           ║');
    console.log(`║   node scripts/ai-player.js join ${data.matchCode} TheirName         ║`);
    console.log('║                                                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('⏳ Waiting for opponent to join...');

    // Save match code to file
    fs.writeFileSync(MATCH_FILE, data.matchCode, 'utf8');
    console.log(`📁 Match code saved to current-match.txt`);
    writeStateFile();
  }

  if (data.action === 'join_match') {
    sessionId = data.sessionId;
    mySlot = data.yourSlot;
    opponentName = data.opponent?.name || 'Unknown';
    console.log(`✅ Joined match! Playing as ${mySlot} against ${opponentName}`);
    
    // Auto-ready
    setTimeout(() => {
      send({ type: 'action', payload: { action: 'game_ready', sessionId, ready: true }, requestId: 'ready-' + Date.now() });
    }, 300);
    writeStateFile();
  }

  if (data.action === 'game_move' && data.state?.board) {
    board = data.state.board;
    writeStateFile();
  }
}

function handleEvent(event) {
  const eventType = event.event;

  switch (eventType) {
    case 'opponent_found':
    case 'matchFound':
      sessionId = event.sessionId;
      mySlot = event.yourSlot;
      opponentName = event.opponent?.name || 'Unknown';
      waitingForOpponent = false;
      console.log('');
      console.log('🎉 ══════════════════════════════════════════════════════════');
      console.log(`   OPPONENT FOUND: ${opponentName}`);
      console.log(`   You are playing as: ${mySlot}`);
      console.log(`   ${event.goesFirst ? '👉 You go first!' : '⏳ Opponent goes first'}`);
      console.log('══════════════════════════════════════════════════════════ 🎉');
      console.log('');
      
      // Send pre-game greeting
      setTimeout(() => {
        if (sessionId) {
          const greeting = generateGreeting();
          send({ 
            type: 'action', 
            payload: { action: 'send_chat', sessionId, message: greeting }, 
            requestId: 'greeting-' + Date.now() 
          });
          console.log(`💬 You: "${greeting}"`);
        }
      }, 100);
      
      // Auto-ready after a brief delay for greetings
      setTimeout(() => {
        if (sessionId) {
          send({ type: 'action', payload: { action: 'game_ready', sessionId, ready: true }, requestId: 'ready-' + Date.now() });
        }
        // Check if we have a deferred turn to make
        if (deferredTurn && mySlot && sessionId) {
          setTimeout(() => makeMove(), 100);
        }
      }, 500);
      writeStateFile();
      break;

    case 'session:chat':
      // Display chat messages from opponent
      if (event.from !== playerName) {
        console.log(`💬 ${event.from}: "${event.message}"`);
      }
      break;

    case 'session:gameStarted':
      gameInProgress = true;
      board = event.state?.board || [[null, null, null], [null, null, null], [null, null, null]];
      console.log('🎮 Game started!');
      printBoard(board);
      // Check for deferred turn after game starts
      if (deferredTurn && mySlot && sessionId) {
        setTimeout(() => makeMove(), 100);
      }
      writeStateFile();
      break;

    case 'session:yourTurn':
      // Set game in progress if we receive a turn event
      if (!gameInProgress) {
        gameInProgress = true;
        board = event.state?.board || [[null, null, null], [null, null, null], [null, null, null]];
      }
      
      // Get session and slot from event if we don't have them yet
      if (!sessionId && event.sessionId) sessionId = event.sessionId;
      if (!mySlot && event.yourSlot) mySlot = event.yourSlot;
      
      // Can't make a move without knowing our slot - defer until we have info
      if (!mySlot || !sessionId) {
        deferredTurn = true;
        if (flags.verbose) console.log('[DEBUG] Deferring turn until session/slot info received...');
        return;
      }
      
      if (pendingMove) return;
      
      // Update board from event state
      if (event.state?.board) board = event.state.board;
      
      makeMove();
      break;

    case 'session:moveMade':
      if (event.state?.board) {
        board = event.state.board;
        printBoard(board);
      }
      pendingMove = false;
      writeStateFile();
      break;

    case 'session:moveReasoning':
      // Show opponent's reasoning
      if (event.slot !== mySlot) {
        console.log(`💭 ${event.player} (${event.slot}): "${event.reason}"`);
      }
      break;

    case 'session:gameEnded':
      gameInProgress = false;
      pendingMove = false;
      gamesPlayed++;

      console.log('');
      console.log('════════════════════════════════════════════════════════════');
      
      let gameResult;
      if (event.winner === 'draw') {
        draws++;
        gameResult = 'draw';
        console.log('  🤝 GAME ENDED - DRAW!');
      } else if (event.winner === mySlot) {
        wins++;
        gameResult = 'win';
        console.log('  🏆 GAME ENDED - YOU WON!');
      } else {
        losses++;
        gameResult = 'loss';
        console.log('  💀 GAME ENDED - You lost');
      }
      
      // Send game-over message
      if (sessionId) {
        const ggMessage = generateGameOverMessage(gameResult);
        send({ 
          type: 'action', 
          payload: { action: 'send_chat', sessionId, message: ggMessage }, 
          requestId: 'gg-' + Date.now() 
        });
        console.log(`💬 You: "${ggMessage}"`);
      }
      
      if (event.state?.board) {
        board = event.state.board;
      }
      printBoard(board);
      printSeriesStatus();
      console.log('════════════════════════════════════════════════════════════');
      console.log('');

      writeStateFile();

      // Check if series is complete
      if (gamesPlayed >= flags.series) {
        console.log('');
        console.log('🏁 SERIES COMPLETE!');
        console.log(`   Final: ${wins}W - ${losses}L - ${draws}D`);
        if (wins > losses) {
          console.log('   🎉 You won the series!');
        } else if (losses > wins) {
          console.log('   Better luck next time!');
        } else {
          console.log('   Series tied!');
        }
        console.log('');
        
        // Exit after series
        setTimeout(() => {
          ws.close();
          process.exit(0);
        }, 2000);
      } else {
        // Start next game
        console.log(`⏳ Starting game ${gamesPlayed + 1}/${flags.series} in 3 seconds...`);
        
        // Reset state for next game
        sessionId = null;
        mySlot = null;
        board = [[null, null, null], [null, null, null], [null, null, null]];
        
        setTimeout(() => {
          if (action === 'host') {
            console.log('📡 Hosting next game...');
            send({ type: 'action', payload: { action: 'host_game', gameType: 'tictactoe', name: playerName }, requestId: 'host-' + Date.now() });
          } else {
            console.log(`🔍 Re-joining with code ${matchCode}...`);
            send({ type: 'action', payload: { action: 'join_match', matchCode, name: playerName }, requestId: 'join-' + Date.now() });
          }
        }, 3000);
      }
      break;
  }
}

function handleMessage(data) {
  const msg = JSON.parse(data.toString());
  
  if (flags.verbose) {
    console.log(`[DEBUG] Received:`, msg.type, msg.data?.event || msg.data?.action || '');
  }

  switch (msg.type) {
    case 'welcome':
      handleWelcome(msg.data);
      break;
    case 'ack':
      handleAck(msg);
      break;
    case 'event':
      handleEvent(msg.data);
      break;
    case 'error':
      console.error('❌ Server error:', msg.data?.message || JSON.stringify(msg.data));
      break;
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  🤖 ${playerName} - AI TicTacToe Player`);
console.log(`  Mode: ${action.toUpperCase()} | Series: ${flags.series} game(s)`);
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

ws = new WebSocket(`ws://localhost:3847?name=${playerName}&type=ai`);

ws.on('open', () => {
  send({ type: 'subscribe', payload: { events: ['*'] }, requestId: 's1' });
  
  setTimeout(() => {
    if (action === 'join') {
      console.log(`🔍 Joining match ${matchCode}...`);
      send({ type: 'action', payload: { action: 'join_match', matchCode, name: playerName }, requestId: 'j1' });
    } else {
      console.log('📡 Hosting game...');
      send({ type: 'action', payload: { action: 'host_game', gameType: 'tictactoe', name: playerName }, requestId: 'h1' });
    }
  }, 500);
});

ws.on('message', handleMessage);

ws.on('error', (e) => {
  console.error('❌ WebSocket error:', e.message);
  console.error('   Make sure the server is running: node scripts/start-server.js');
});

ws.on('close', () => {
  console.log('👋 Disconnected from server');
});

// Keep alive timeout
setTimeout(() => {
  console.log('⏰ Session timeout (5 minutes) - closing');
  ws.close();
  process.exit(0);
}, 5 * 60 * 1000);

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Bye!');
  ws?.close();
  process.exit(0);
});
