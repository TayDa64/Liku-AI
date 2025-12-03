// AI TicTacToe Player - Usage: node scripts/ai-player.js [host|join [CODE]] [name] [--series N]
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCH_FILE = path.join(__dirname, '..', 'current-match.txt');
const STATE_FILE = path.join(__dirname, '..', 'ai-game-state.txt');

// Parse arguments
const args = process.argv.slice(2);
const action = args[0] || 'host';

// Find --series flag
let seriesGames = 1;
const seriesIdx = args.indexOf('--series');
if (seriesIdx !== -1 && args[seriesIdx + 1]) {
  seriesGames = parseInt(args[seriesIdx + 1]) || 1;
  args.splice(seriesIdx, 2);
}

let codeOrName = args[1];
let name = action === 'join' ? (args[2] || 'GuestAI') : (codeOrName || 'HostAI');

// If joining without a code, try to read from current-match.txt
if (action === 'join' && (!codeOrName || !codeOrName.startsWith('LIKU-'))) {
  // First arg after 'join' might be the name, not the code
  if (codeOrName && !codeOrName.startsWith('LIKU-')) {
    name = codeOrName;
    codeOrName = null;
  }
  
  // Try to read match code from file
  if (fs.existsSync(MATCH_FILE)) {
    codeOrName = fs.readFileSync(MATCH_FILE, 'utf8').trim();
    console.log(`📁 Found match code in current-match.txt: ${codeOrName}`);
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

const ws = new WebSocket(`ws://localhost:3847?name=${name}&type=ai`);
let sid = null, sym = null, board = [[null,null,null],[null,null,null],[null,null,null]];
let matchCodeShown = false; // Track if we've already shown the match code
let pendingMove = false; // Prevent duplicate moves

const LINES = [[[0,0],[0,1],[0,2]],[[1,0],[1,1],[1,2]],[[2,0],[2,1],[2,2]],[[0,0],[1,0],[2,0]],[[0,1],[1,1],[2,1]],[[0,2],[1,2],[2,2]],[[0,0],[1,1],[2,2]],[[0,2],[1,1],[2,0]]];

function findMove(b, s, type) {
  for (const l of LINES) {
    const c = l.map(([r,c]) => b[r][c]);
    if (c.filter(x => x === s).length === 2 && c.filter(x => !x).length === 1) {
      return { pos: l[c.findIndex(x => !x)], reason: type };
    }
  }
  return null;
}

function choose(b, me, opp) {
  let m = findMove(b, me, 'WIN');
  if (m) return m;
  m = findMove(b, opp, 'BLOCK');
  if (m) return m;
  if (!b[1][1]) return { pos: [1,1], reason: 'CENTER' };
  for (const [r,c] of [[0,0],[0,2],[2,0],[2,2]]) if (!b[r][c]) return { pos: [r,c], reason: 'CORNER' };
  for (const [r,c] of [[0,1],[1,0],[1,2],[2,1]]) if (!b[r][c]) return { pos: [r,c], reason: 'EDGE' };
  return null;
}

function printBoard(b) {
  console.log(`\n ${b[0][0]||'_'}|${b[0][1]||'_'}|${b[0][2]||'_'}\n ${b[1][0]||'_'}|${b[1][1]||'_'}|${b[1][2]||'_'}\n ${b[2][0]||'_'}|${b[2][1]||'_'}|${b[2][2]||'_'}\n`);
}

ws.on('open', () => {
  console.log(`=== ${name} AI ===`);
  ws.send(JSON.stringify({ type: 'subscribe', payload: { events: ['*'] }, requestId: 's1' }));
  setTimeout(() => {
    if (action === 'join') {
      console.log(`Joining ${codeOrName}...`);
      ws.send(JSON.stringify({ type: 'action', payload: { action: 'join_match', matchCode: codeOrName, name }, requestId: 'j1' }));
    } else {
      console.log('Hosting game...');
      ws.send(JSON.stringify({ type: 'action', payload: { action: 'host_game', gameType: 'tictactoe', name }, requestId: 'h1' }));
    }
  }, 500);
});

ws.on('message', d => {
  const m = JSON.parse(d.toString());
  if (m.data?.sessionId) sid = m.data.sessionId;
  if (m.data?.yourSlot) sym = m.data.yourSlot;
  
  // Only show match code once (host gets it in ack, both get it in matchFound)
  if (m.data?.matchCode && !matchCodeShown && action === 'host') {
    console.log(`MATCH CODE: ${m.data.matchCode}`);
    // Save match code to file for other terminals to find
    fs.writeFileSync(MATCH_FILE, m.data.matchCode, 'utf8');
    console.log(`📁 Saved to current-match.txt (other terminal can join without specifying code)`);
    matchCodeShown = true;
  }
  if (m.data?.state?.board) board = m.data.state.board;
  
  if (m.data?.event === 'session:moveMade') {
    printBoard(board);
    pendingMove = false; // Move was processed, allow next move
  }
  
  if (m.data?.event === 'session:yourTurn' && sid && !pendingMove) {
    pendingMove = true;
    const opp = sym === 'X' ? 'O' : 'X';
    const mv = choose(board, sym, opp);
    if (mv) {
      console.log(`${name}(${sym}): ${mv.reason} -> [${mv.pos}]`);
      ws.send(JSON.stringify({ type: 'action', payload: { action: 'game_move', sessionId: sid, row: mv.pos[0], col: mv.pos[1] }, requestId: 'm'+Date.now() }));
    }
  }
  
  if (m.data?.event === 'session:gameEnded') {
    console.log('=== GAME OVER ===');
    console.log(`Winner: ${m.data.winner || 'DRAW'}`);
    printBoard(board);
  }
});

ws.on('error', e => console.error('Error:', e.message));
setTimeout(() => process.exit(), 300000);
