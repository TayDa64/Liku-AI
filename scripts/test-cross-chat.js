/**
 * Cross-Chat AI vs AI Test Script
 * 
 * Simulates two AI agents from different chat windows
 * discovering each other and playing a game.
 * 
 * Usage:
 *   Terminal 1: npm run server
 *   Terminal 2: node scripts/test-cross-chat.js host
 *   Terminal 3: node scripts/test-cross-chat.js join LIKU-XXXX
 * 
 * Or run automated test (best of 5):
 *   node scripts/test-cross-chat.js auto
 */

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:3847';
const MODE = process.argv[2] || 'auto'; // 'host', 'join', or 'auto'
const MATCH_CODE = process.argv[3]; // For 'join' mode
const BEST_OF = 5; // Best of 5 series

class ChatAgent {
  constructor(name, role, strategy = 'smart') {
    this.name = name;
    this.role = role; // 'host' or 'guest'
    this.strategy = strategy; // 'smart', 'random', 'defensive'
    this.ws = null;
    this.agentId = null;
    this.sessionId = null;
    this.matchCode = null;
    this.slot = null;
    this.board = [[null, null, null], [null, null, null], [null, null, null]];
    this.gameOver = false;
    this.isMyTurn = false;
    
    // Series tracking
    this.wins = 0;
    this.losses = 0;
    this.draws = 0;
    this.gamesPlayed = 0;
    this.onGameEnd = null; // Callback for series management
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_URL}?name=${this.name}&type=ai`);
      
      this.ws.on('open', () => {
        console.log(`[${this.name}] 🔌 Connected to Liku server`);
        this.send({ type: 'subscribe', payload: { events: ['*'] }, requestId: `sub-${Date.now()}` });
        resolve();
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      });

      this.ws.on('error', reject);
      this.ws.on('close', () => console.log(`[${this.name}] Disconnected`));
    });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        this.agentId = msg.data.agent.id;
        console.log(`[${this.name}] ✅ Registered as: ${this.agentId.slice(0, 8)}...`);
        break;

      case 'ack':
        this.handleAck(msg);
        break;

      case 'event':
        this.handleEvent(msg.data);
        break;

      case 'error':
        console.error(`[${this.name}] ❌ Error:`, JSON.stringify(msg.data));
        break;
    }
  }

  handleAck(msg) {
    const data = msg.data;
    
    if (data.action === 'host_game') {
      this.matchCode = data.matchCode;
      console.log(`[${this.name}] 🎯 Match Code: ${data.matchCode}`);
    }
    
    if (data.action === 'join_match') {
      this.sessionId = data.sessionId;
      this.slot = data.yourSlot;
      console.log(`[${this.name}] 🎮 Joined! Playing as ${data.yourSlot} vs ${data.opponent.name}`);
      
      // Auto ready
      setTimeout(() => this.setReady(), 300);
    }

    if (data.action === 'game_ready') {
      // Silently ready
    }

    if (data.action === 'game_move') {
      if (data.state?.board) {
        this.board = data.state.board;
      }
    }
    
    if (data.action === 'cancel_match') {
      // Match cancelled successfully
    }
  }

  handleEvent(event) {
    const eventType = event.event;

    switch (eventType) {
      case 'opponent_found':
        this.sessionId = event.sessionId;
        this.slot = event.yourSlot;
        console.log(`[${this.name}] 🎉 Opponent found: ${event.opponent.name} | You are ${event.yourSlot}`);
        
        // Send greeting
        setTimeout(() => {
          if (this.sessionId) {
            const greeting = `Hello ${event.opponent.name}! I'm ${this.name}. Let's have a good game! 🎮`;
            this.send({
              type: 'action',
              payload: { action: 'send_chat', sessionId: this.sessionId, message: greeting },
              requestId: 'greeting-' + Date.now()
            });
          }
        }, 100);
        
        // Auto ready after opponent found
        setTimeout(() => this.setReady(), 500);
        break;

      case 'session:chat':
        // Display chat messages
        if (event.from !== this.name) {
          console.log(`[${this.name}] 💬 ${event.from}: "${event.message}"`);
        }
        break;

      case 'session:gameStarted':
        if (event.state?.currentTurn === this.slot) {
          this.isMyTurn = true;
          setTimeout(() => this.makeMove(), 200);
        }
        break;

      case 'session:yourTurn':
        this.isMyTurn = true;
        setTimeout(() => this.makeMove(), 200);
        break;

      case 'session:moveMade':
        if (event.state?.board) {
          this.board = event.state.board;
        }
        break;

      case 'session:moveReasoning':
        // Display opponent's reasoning for their move
        if (event.slot !== this.slot) {
          console.log(`[${this.name}] 💭 ${event.player} (${event.slot}): "${event.reason}"`);
        }
        break;

      case 'session:gameEnded':
        this.gameOver = true;
        this.gamesPlayed++;
        
        let result;
        if (event.winner === 'draw') {
          this.draws++;
          result = 'draw';
          console.log(`\n[${this.name}] 🤝 GAME ${this.gamesPlayed} - DRAW`);
        } else if (event.winner === this.slot) {
          this.wins++;
          result = 'win';
          console.log(`\n[${this.name}] 🏆 GAME ${this.gamesPlayed} - YOU WON!`);
        } else {
          this.losses++;
          result = 'loss';
          console.log(`\n[${this.name}] 💀 GAME ${this.gamesPlayed} - You lost`);
        }
        
        console.log(`[${this.name}] 📊 Series: ${this.wins}W - ${this.losses}L - ${this.draws}D`);
        
        // Notify series manager
        if (this.onGameEnd) {
          this.onGameEnd(result);
        }
        break;
    }
  }

  resetForNewGame() {
    this.board = [[null, null, null], [null, null, null], [null, null, null]];
    this.gameOver = false;
    this.isMyTurn = false;
    this.sessionId = null;
  }

  printBoard() {
    console.log(`[${this.name}] Board:`);
    for (let row = 0; row < 3; row++) {
      const cells = this.board[row].map(c => c || '.').join(' | ');
      console.log(`         ${cells}`);
      if (row < 2) console.log(`        ---+---+---`);
    }
  }

  makeMove() {
    if (!this.isMyTurn || this.gameOver || !this.sessionId) return;

    // Find empty cells
    const emptyCells = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (!this.board[row][col]) {
          emptyCells.push([row, col]);
        }
      }
    }

    if (emptyCells.length === 0) return;

    let move = null;
    let reason = ''; // Reasoning for the move
    const opponent = this.slot === 'X' ? 'O' : 'X';

    if (this.strategy === 'smart') {
      // 1. Check if we can win
      move = this.findWinningMove(this.slot);
      if (move) {
        reason = `Taking winning position to complete my three-in-a-row.`;
      }
      
      // 2. Block opponent's winning move
      if (!move) {
        move = this.findWinningMove(opponent);
        if (move) {
          reason = `Blocking ${opponent}'s winning threat - must prevent their three-in-a-row.`;
        }
      }
      
      // 3. Take center if available
      if (!move && !this.board[1][1]) {
        move = [1, 1];
        reason = `Claiming center for maximum control - it connects to 4 winning lines.`;
      }
      
      // 4. Take a corner (prefer opposite corner strategy)
      if (!move) {
        const corners = [[0, 0], [0, 2], [2, 0], [2, 2]];
        for (const [r, c] of corners) {
          if (!this.board[r][c]) {
            move = [r, c];
            reason = `Taking corner to create forking opportunities and control diagonals.`;
            break;
          }
        }
      }
      
      // 5. Take any edge
      if (!move) {
        const edges = [[0, 1], [1, 0], [1, 2], [2, 1]];
        for (const [r, c] of edges) {
          if (!this.board[r][c]) {
            move = [r, c];
            reason = `Taking edge as fallback - fewer winning lines but maintains pressure.`;
            break;
          }
        }
      }
    } else if (this.strategy === 'random') {
      // Pure random - will lose often
      move = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      reason = `Random selection - exploring unpredictable play.`;
    } else if (this.strategy === 'aggressive') {
      // Try to win, but don't always block
      move = this.findWinningMove(this.slot);
      if (move) {
        reason = `Going for the win!`;
      }
      
      // 50% chance to block
      if (!move && Math.random() > 0.5) {
        move = this.findWinningMove(opponent);
        if (move) {
          reason = `Blocking opponent's threat.`;
        }
      }
      
      // Prefer center and corners
      if (!move) {
        const priorities = [[1, 1], [0, 0], [2, 2], [0, 2], [2, 0]];
        for (const [r, c] of priorities) {
          if (!this.board[r][c]) {
            move = [r, c];
            reason = `Aggressive positioning at key cell.`;
            break;
          }
        }
      }
      
      if (!move) {
        move = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        reason = `Taking available space.`;
      }
    }
    
    if (!move) {
      move = emptyCells[0];
      reason = `Only option remaining.`;
    }

    const [row, col] = move;
    
    this.send({
      type: 'action',
      payload: { action: 'game_move', sessionId: this.sessionId, row, col, reason },
      requestId: `move-${Date.now()}`
    });
    this.isMyTurn = false;
  }

  findWinningMove(player) {
    // Check all possible winning lines
    const lines = [
      // Rows
      [[0, 0], [0, 1], [0, 2]],
      [[1, 0], [1, 1], [1, 2]],
      [[2, 0], [2, 1], [2, 2]],
      // Columns
      [[0, 0], [1, 0], [2, 0]],
      [[0, 1], [1, 1], [2, 1]],
      [[0, 2], [1, 2], [2, 2]],
      // Diagonals
      [[0, 0], [1, 1], [2, 2]],
      [[0, 2], [1, 1], [2, 0]],
    ];

    for (const line of lines) {
      const values = line.map(([r, c]) => this.board[r][c]);
      const playerCount = values.filter(v => v === player).length;
      const emptyCount = values.filter(v => v === null).length;
      
      // If player has 2 in a line and 1 empty, that's a winning/blocking move
      if (playerCount === 2 && emptyCount === 1) {
        const emptyIdx = values.indexOf(null);
        return line[emptyIdx];
      }
    }
    return null;
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  hostGame(gameType = 'tictactoe') {
    console.log(`[${this.name}] 📡 Hosting ${gameType} game...`);
    this.send({
      type: 'action',
      payload: { action: 'host_game', gameType, name: this.name },
      requestId: `host-${Date.now()}`
    });
  }

  joinMatch(matchCode) {
    console.log(`[${this.name}] 🔍 Joining match ${matchCode}...`);
    this.send({
      type: 'action',
      payload: { action: 'join_match', matchCode, name: this.name },
      requestId: `join-${Date.now()}`
    });
  }

  setReady() {
    if (!this.sessionId) return;
    this.send({
      type: 'action',
      payload: { action: 'game_ready', sessionId: this.sessionId, ready: true },
      requestId: `ready-${Date.now()}`
    });
  }

  close() {
    this.ws?.close();
  }
}

// Main execution
async function runHost() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Cross-Chat AI Game - HOST MODE');
  console.log('  Running as: ChatWindow-1 (Host)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const agent = new ChatAgent('ChatWindow-1', 'host');
  await agent.connect();
  await new Promise(r => setTimeout(r, 500));
  agent.hostGame('tictactoe');

  // Wait for game to complete or timeout
  await new Promise(r => setTimeout(r, 120000)); // 2 minutes
  agent.close();
}

async function runJoin(matchCode) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Cross-Chat AI Game - JOIN MODE');
  console.log('  Running as: ChatWindow-2 (Guest)');
  console.log(`  Joining: ${matchCode}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const agent = new ChatAgent('ChatWindow-2', 'guest');
  await agent.connect();
  await new Promise(r => setTimeout(r, 500));
  agent.joinMatch(matchCode);

  // Wait for game to complete
  let timeout = 60;
  while (!agent.gameOver && timeout > 0) {
    await new Promise(r => setTimeout(r, 1000));
    timeout--;
  }
  agent.close();
}

async function runAuto() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Cross-Chat AI Game - BEST OF ${BEST_OF} SERIES`);
  console.log('  Simulating two chat windows finding each other');
  console.log('  FAIR PLAY: Both agents use SMART strategy');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // FAIR PLAY: Both agents use the same 'smart' strategy
  // The only difference should be who hosts and random slot/starting player
  const host = new ChatAgent('ChatWindow-1', 'host', 'smart');
  const guest = new ChatAgent('ChatWindow-2', 'guest', 'smart');

  const winsNeeded = Math.ceil(BEST_OF / 2);
  let hostSeriesWins = 0;
  let guestSeriesWins = 0;
  let gameNumber = 0;

  try {
    // Connect both
    console.log('Step 1: Both agents connect to server...\n');
    await host.connect();
    await guest.connect();
    await new Promise(r => setTimeout(r, 500));

    while (hostSeriesWins < winsNeeded && guestSeriesWins < winsNeeded && gameNumber < BEST_OF) {
      gameNumber++;
      
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log(`║  🎮 GAME ${gameNumber} of ${BEST_OF}                                            ║`);
      console.log(`║  Series: Host ${hostSeriesWins} - ${guestSeriesWins} Guest                                      ║`);
      console.log('╚══════════════════════════════════════════════════════════════╝\n');

      // Reset agents for new game
      host.resetForNewGame();
      guest.resetForNewGame();

      // Host creates game
      console.log('Step 2: ChatWindow-1 hosts a game...\n');
      host.hostGame('tictactoe');
      
      // Wait for match code
      await new Promise(r => setTimeout(r, 1000));
      
      if (!host.matchCode) {
        throw new Error('Failed to get match code');
      }

      console.log(`\n📋 Match Code: ${host.matchCode}\n`);

      // Guest joins
      console.log('Step 3: ChatWindow-2 joins with the code...\n');
      guest.joinMatch(host.matchCode);

      // Wait for this game to complete
      console.log('Step 4: Game in progress...\n');
      
      await new Promise((resolve) => {
        let resolved = false;
        
        const checkGameOver = () => {
          if (!resolved && (host.gameOver || guest.gameOver)) {
            resolved = true;
            
            // Determine winner
            if (host.wins > hostSeriesWins) {
              hostSeriesWins = host.wins;
            }
            if (guest.wins > guestSeriesWins) {
              guestSeriesWins = guest.wins;
            }
            
            setTimeout(resolve, 1000); // Brief pause between games
          }
        };

        // Set up callbacks
        host.onGameEnd = checkGameOver;
        guest.onGameEnd = checkGameOver;

        // Timeout safety
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }, 30000);
      });

      // Clear match code for next game
      host.matchCode = null;
    }

    // Final results
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  🏆 SERIES COMPLETE!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\n  Final Score: Host ${hostSeriesWins} - ${guestSeriesWins} Guest`);
    console.log(`  Games Played: ${gameNumber}`);
    console.log(`  Draws: ${host.draws}`);
    
    if (hostSeriesWins > guestSeriesWins) {
      console.log('\n  🎉 WINNER: ChatWindow-1 (Host)!\n');
    } else if (guestSeriesWins > hostSeriesWins) {
      console.log('\n  🎉 WINNER: ChatWindow-2 (Guest)!\n');
    } else {
      console.log('\n  🤝 SERIES TIED!\n');
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');

  } finally {
    host.close();
    guest.close();
    process.exit(0);
  }
}

// Entry point
switch (MODE) {
  case 'host':
    runHost();
    break;
  case 'join':
    if (!MATCH_CODE) {
      console.error('Usage: node test-cross-chat.js join LIKU-XXXX');
      process.exit(1);
    }
    runJoin(MATCH_CODE);
    break;
  case 'auto':
  default:
    runAuto();
}
