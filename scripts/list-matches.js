#!/usr/bin/env node
/**
 * List active pending matches on the Liku WebSocket server.
 * 
 * Usage:
 *   node scripts/list-matches.js          # List all pending matches
 *   node scripts/list-matches.js --watch  # Continuously watch for matches
 * 
 * This helps Terminal 2 discover match codes created by Terminal 1.
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3847;
const WATCH_MODE = process.argv.includes('--watch') || process.argv.includes('-w');
const MATCH_FILE = path.join(__dirname, '..', 'current-match.txt');

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function queryMatches() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}?name=MatchQuery&type=observer`);
    let resolved = false;

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'action',
        payload: { action: 'list_matches' },
        requestId: 'list-' + Date.now()
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ack' && msg.data?.action === 'list_matches') {
        resolved = true;
        ws.close();
        resolve(msg.data);
      } else if (msg.type === 'error') {
        resolved = true;
        ws.close();
        reject(new Error(msg.data?.message || 'Unknown error'));
      }
    });

    ws.on('error', (err) => {
      if (!resolved) reject(err);
    });

    ws.on('close', () => {
      if (!resolved) reject(new Error('Connection closed before response'));
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!resolved) {
        ws.close();
        reject(new Error('Query timeout'));
      }
    }, 5000);
  });
}

function displayMatches(data, clearScreen = false) {
  if (clearScreen) {
    process.stdout.write('\x1B[2J\x1B[H'); // ANSI clear screen
  }
  
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              🎮 LIKU GAME SERVER - PENDING MATCHES           ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  const available = data.availableMatches || [];
  const myMatches = data.myPendingMatches || [];
  const all = [...available, ...myMatches];
  
  if (all.length === 0) {
    console.log('║                                                              ║');
    console.log('║   No pending matches found.                                  ║');
    console.log('║                                                              ║');
    console.log('║   To create a game, run in another terminal:                 ║');
    console.log('║   node scripts/ai-player.js host YourName                    ║');
    console.log('║                                                              ║');
    
    // Clear the match file if no matches
    if (fs.existsSync(MATCH_FILE)) {
      fs.unlinkSync(MATCH_FILE);
    }
  } else {
    console.log('║                                                              ║');
    
    for (const match of all) {
      const code = match.matchCode;
      const game = match.gameType || 'tictactoe';
      const host = match.hostName || 'Unknown';
      const expires = formatTime(match.expiresIn);
      
      console.log(`║   Match Code:  ${code.padEnd(44)}║`);
      console.log(`║   Game:        ${game.padEnd(44)}║`);
      console.log(`║   Host:        ${host.padEnd(44)}║`);
      console.log(`║   Expires in:  ${expires.padEnd(44)}║`);
      console.log('║   ──────────────────────────────────────────────────────────║');
      console.log('║                                                              ║');
      console.log(`║   To join, run:                                              ║`);
      console.log(`║   node scripts/ai-player.js join ${code} YourName          ║`);
      console.log('║                                                              ║');
      
      // Write the first match code to file for easy access
      fs.writeFileSync(MATCH_FILE, code, 'utf8');
    }
    
    console.log('║   ──────────────────────────────────────────────────────────║');
    console.log('║                                                              ║');
    console.log('║   💡 Match code also saved to: current-match.txt            ║');
    console.log('║      Guest can join without specifying code:                 ║');
    console.log('║      node scripts/ai-player.js join GuestName                ║');
  }
  
  console.log('║                                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  // Show stats
  if (data.stats) {
    console.log(`\n  📊 Server Stats: ${data.stats.waiting || 0} waiting, ${data.stats.matched || 0} matched`);
  }
  
  if (WATCH_MODE) {
    console.log('\n  👀 Watching for matches... (Ctrl+C to stop)\n');
  }
}

async function main() {
  console.log('🔍 Connecting to Liku server on port', PORT, '...');
  
  try {
    if (WATCH_MODE) {
      // Continuous watch mode - clear screen between polls
      while (true) {
        try {
          const data = await queryMatches();
          displayMatches(data, true);
        } catch (err) {
          console.error('Error:', err.message);
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    } else {
      // Single query - no screen clear
      const data = await queryMatches();
      displayMatches(data, false);
    }
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error('\n   Make sure the server is running:');
    console.error('   node scripts/start-server.js');
    process.exit(1);
  }
}

main();
