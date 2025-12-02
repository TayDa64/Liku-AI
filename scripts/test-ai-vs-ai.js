/**
 * AI-vs-AI TicTacToe Test Script
 * 
 * Tests the WebSocket-based AI-vs-AI game session functionality
 * Two AI agents connect, create a session, and play TicTacToe
 */

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:3847';

// Simple AI that uses the minimax hint from the server
class SimpleAI {
  constructor(name, slot) {
    this.name = name;
    this.slot = slot; // 'X' or 'O'
    this.ws = null;
    this.agentId = null;
    this.sessionId = null;
    this.isMyTurn = false;
    this.gameOver = false;
    this.board = [
      [null, null, null],
      [null, null, null],
      [null, null, null]
    ];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_URL}?name=${this.name}&type=ai`);
      
      this.ws.on('open', () => {
        console.log(`[${this.name}] Connected to server`);
        // Subscribe to all events
        this.send({
          type: 'subscribe',
          payload: {
            events: ['*', 'session:gameStarted', 'session:yourTurn', 'session:moveMade', 'session:gameEnded', 'session:playerJoined', 'session:turnChanged']
          },
          requestId: `subscribe-${Date.now()}`
        });
        resolve();
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      });

      this.ws.on('error', (err) => {
        console.error(`[${this.name}] Error:`, err.message);
        reject(err);
      });

      this.ws.on('close', () => {
        console.log(`[${this.name}] Disconnected`);
      });
    });
  }

  handleMessage(msg) {
    // Verbose logging for debugging
    if (msg.type === 'ack' || msg.type === 'event') {
      console.log(`[${this.name}] MSG:`, JSON.stringify(msg, null, 2));
    }
    
    switch (msg.type) {
      case 'welcome':
        this.agentId = msg.data.agent.id;
        console.log(`[${this.name}] Registered as agent: ${this.agentId.slice(0, 8)}...`);
        break;

      case 'ack':
        if (msg.data?.sessionId) {
          this.sessionId = msg.data.sessionId;
          console.log(`[${this.name}] Session: ${msg.data.action} - ${this.sessionId?.slice(0, 8) || 'N/A'}`);
        }
        if (msg.data?.action === 'game_move' && msg.data?.move) {
          console.log(`[${this.name}] Move confirmed at (${msg.data.move.row},${msg.data.move.col})`);
        }
        break;

      case 'event':
        this.handleEvent(msg.data);
        break;

      case 'error':
        console.error(`[${this.name}] Error:`, msg.data);
        break;
    }
  }

  handleEvent(event) {
    const eventType = event.event;
    
    switch (eventType) {
      case 'session:created':
        // Session ID is in event.id (not event.sessionId)
        const createdId = event.id || event.sessionId;
        if (createdId) {
          this.sessionId = createdId;
        }
        console.log(`[${this.name}] Session created: ${createdId?.slice(0, 12) || 'unknown'}`);
        break;

      case 'session:playerJoined':
        console.log(`[${this.name}] Player joined: ${event.agentId?.slice(0, 8)} as ${event.slot || event.player?.slot}`);
        break;

      case 'session:gameStarted':
        console.log(`[${this.name}] Game started!`);
        // Check if it's our turn based on state
        if (event.state?.currentTurn === this.slot) {
          this.checkTurn(this.slot);
        }
        break;

      case 'session:yourTurn':
        console.log(`[${this.name}] 🎯 It's my turn! (slot: ${event.slot})`);
        this.checkTurn(event.slot);
        break;

      case 'session:turnChanged':
        console.log(`[${this.name}] Turn changed to: ${event.slot}`);
        break;

      case 'session:moveMade':
        console.log(`[${this.name}] Move made by ${event.agentId?.slice(0, 8) || 'player'} at (${event.move?.row ?? event.row},${event.move?.col ?? event.col})`);
        // Update local board state
        if (event.state?.board) {
          this.board = event.state.board;
          this.printBoard(event.state.board);
        } else if (event.board) {
          this.board = event.board;
          this.printBoard(event.board);
        }
        break;

      case 'session:gameEnded':
        this.gameOver = true;
        console.log(`\n[${this.name}] 🎮 GAME OVER!`);
        console.log(`[${this.name}] Winner: ${event.winner || 'Draw'}`);
        if (event.winningLine) {
          console.log(`[${this.name}] Winning line: ${JSON.stringify(event.winningLine)}`);
        }
        break;
        
      default:
        console.log(`[${this.name}] Unknown event: ${eventType}`);
    }
  }

  checkTurn(currentTurn) {
    if (currentTurn === this.slot && !this.gameOver) {
      this.isMyTurn = true;
      console.log(`[${this.name}] 🎯 My turn!`);
      // Add slight delay to make output readable
      setTimeout(() => this.makeMove(), 500);
    } else {
      this.isMyTurn = false;
    }
  }

  printBoard(board) {
    if (!board) return;
    console.log(`[${this.name}] Board:`);
    for (let row = 0; row < 3; row++) {
      const cells = board[row].map(c => c || '.').join(' | ');
      console.log(`         ${cells}`);
      if (row < 2) console.log(`        ---+---+---`);
    }
  }

  makeMove() {
    if (!this.isMyTurn || this.gameOver) return;

    // Find empty cells from current board state
    const emptyCells = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (!this.board[row][col]) {
          emptyCells.push([row, col]);
        }
      }
    }

    if (emptyCells.length === 0) {
      console.log(`[${this.name}] No empty cells!`);
      return;
    }

    // Simple strategy: prefer center, then corners, then edges
    const priorities = [
      [1, 1], // center
      [0, 0], [0, 2], [2, 0], [2, 2], // corners
      [0, 1], [1, 0], [1, 2], [2, 1]  // edges
    ];

    let move = null;
    for (const [r, c] of priorities) {
      if (emptyCells.some(([er, ec]) => er === r && ec === c)) {
        move = [r, c];
        break;
      }
    }

    // Fallback to first empty cell
    if (!move && emptyCells.length > 0) {
      move = emptyCells[0];
    }

    if (!move) {
      console.log(`[${this.name}] No valid move found!`);
      return;
    }

    const [row, col] = move;
    console.log(`[${this.name}] Making move at (${row}, ${col})`);
    
    this.send({
      type: 'action',
      payload: {
        action: 'game_move',
        sessionId: this.sessionId,
        row,
        col
      },
      requestId: `move-${Date.now()}`
    });
    this.isMyTurn = false;
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  createSession() {
    console.log(`[${this.name}] Creating TicTacToe session...`);
    this.send({
      type: 'action',
      payload: {
        action: 'game_create',
        gameType: 'tictactoe',
        mode: 'ai_vs_ai',
        turnTimeMs: 5000,
        allowSpectators: true
      },
      requestId: `create-${Date.now()}`
    });
  }

  joinSession(sessionId, slot) {
    this.sessionId = sessionId;
    console.log(`[${this.name}] Joining session ${sessionId.slice(0, 8)} as ${slot}...`);
    this.send({
      type: 'action',
      payload: {
        action: 'game_join',
        sessionId,
        slot,
        playerType: 'ai',
        name: this.name
      },
      requestId: `join-${Date.now()}`
    });
  }

  setReady() {
    console.log(`[${this.name}] Setting ready...`);
    this.send({
      type: 'action',
      payload: {
        action: 'game_ready',
        sessionId: this.sessionId,
        ready: true
      },
      requestId: `ready-${Date.now()}`
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Main test
async function main() {
  console.log('='.repeat(60));
  console.log('🎮 AI-vs-AI TicTacToe Test');
  console.log('='.repeat(60));
  console.log('');

  const agent1 = new SimpleAI('Agent-X', 'X');
  const agent2 = new SimpleAI('Agent-O', 'O');

  try {
    // Connect both agents
    console.log('Connecting agents...\n');
    await agent1.connect();
    await agent2.connect();
    
    // Wait for welcome messages
    await new Promise(r => setTimeout(r, 500));

    // Agent 1 creates session
    agent1.createSession();
    
    // Wait for session creation
    await new Promise(r => setTimeout(r, 1000));

    // Get session ID from agent1
    const sessionId = agent1.sessionId;
    if (!sessionId) {
      console.error('Failed to create session!');
      process.exit(1);
    }

    // Agent 1 joins as X
    agent1.joinSession(sessionId, 'X');
    await new Promise(r => setTimeout(r, 500));

    // Agent 2 joins as O
    agent2.joinSession(sessionId, 'O');
    await new Promise(r => setTimeout(r, 500));

    // Both agents set ready
    agent1.setReady();
    agent2.setReady();

    // Wait for game to complete (max 30 seconds)
    console.log('\n⏳ Waiting for game to complete...\n');
    
    let timeout = 30;
    while (!agent1.gameOver && !agent2.gameOver && timeout > 0) {
      await new Promise(r => setTimeout(r, 1000));
      timeout--;
    }

    if (timeout === 0) {
      console.log('⏱️ Timeout - game did not complete in 30 seconds');
    }

    console.log('\n' + '='.repeat(60));
    console.log('Test complete!');
    console.log('='.repeat(60));

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    agent1.close();
    agent2.close();
    process.exit(0);
  }
}

main();
