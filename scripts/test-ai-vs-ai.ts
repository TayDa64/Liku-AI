/**
 * AI-vs-AI TicTacToe Test Script
 * 
 * Tests the game session system with two AI agents playing against each other.
 * 
 * Run with: npx tsx scripts/test-ai-vs-ai.ts
 */

import { WebSocket } from 'ws';

const WS_URL = 'ws://localhost:3847';

interface AIAgent {
  id: string;
  name: string;
  ws: WebSocket;
  slot?: 'X' | 'O';
  sessionId?: string;
}

// Simple AI strategy: pick first available move (minimax would be better)
function pickMove(board: (string | null)[][]): { row: number; col: number } | null {
  // Check for winning move first
  const winMove = findWinningMove(board, 'X') || findWinningMove(board, 'O');
  if (winMove) return winMove;

  // Check center
  if (!board[1][1]) return { row: 1, col: 1 };

  // Check corners
  const corners = [
    { row: 0, col: 0 },
    { row: 0, col: 2 },
    { row: 2, col: 0 },
    { row: 2, col: 2 },
  ];
  for (const corner of corners) {
    if (!board[corner.row][corner.col]) return corner;
  }

  // Pick any available
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (!board[row][col]) return { row, col };
    }
  }
  return null;
}

function findWinningMove(board: (string | null)[][], player: string): { row: number; col: number } | null {
  // Check each empty cell for a winning move
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (!board[row][col]) {
        // Try placing
        board[row][col] = player;
        if (checkWin(board, player)) {
          board[row][col] = null;
          return { row, col };
        }
        board[row][col] = null;
      }
    }
  }
  return null;
}

function checkWin(board: (string | null)[][], player: string): boolean {
  // Rows
  for (let i = 0; i < 3; i++) {
    if (board[i][0] === player && board[i][1] === player && board[i][2] === player) return true;
  }
  // Cols
  for (let i = 0; i < 3; i++) {
    if (board[0][i] === player && board[1][i] === player && board[2][i] === player) return true;
  }
  // Diagonals
  if (board[0][0] === player && board[1][1] === player && board[2][2] === player) return true;
  if (board[0][2] === player && board[1][1] === player && board[2][0] === player) return true;
  return false;
}

function createAgent(name: string): Promise<AIAgent> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?name=${name}&type=ai`);
    const agent: AIAgent = { id: '', name, ws };

    ws.on('open', () => {
      console.log(`✓ ${name} connected`);
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'welcome') {
        agent.id = msg.data.agent.id;
        console.log(`✓ ${name} registered as ${agent.id.slice(0, 8)}...`);
        resolve(agent);
      }
    });

    ws.on('error', reject);
    ws.on('close', () => console.log(`${name} disconnected`));
  });
}

function sendCommand(agent: AIAgent, command: object): Promise<any> {
  return new Promise((resolve) => {
    const requestId = `req-${Date.now()}`;
    const fullCommand = { ...command, requestId };

    const handler = (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.requestId === requestId) {
        agent.ws.off('message', handler);
        resolve(msg);
      }
    };

    agent.ws.on('message', handler);
    agent.ws.send(JSON.stringify(fullCommand));
  });
}

async function createSession(agent: AIAgent): Promise<string> {
  const result = await sendCommand(agent, {
    type: 'action',
    payload: {
      action: 'session:create',
      gameType: 'tictactoe',
      mode: 'ai_vs_ai',
      turnTimeMs: 5000,
      allowSpectators: true,
    },
  });

  if (result.data?.sessionId) {
    console.log(`✓ Session created: ${result.data.sessionId}`);
    return result.data.sessionId;
  }
  throw new Error(`Failed to create session: ${JSON.stringify(result)}`);
}

async function joinSession(agent: AIAgent, sessionId: string, preferredSlot?: string): Promise<string> {
  const result = await sendCommand(agent, {
    type: 'action',
    payload: {
      action: 'session:join',
      sessionId,
      name: agent.name,
      playerType: 'ai',
      slot: preferredSlot,
      aiProvider: 'local',
    },
  });

  if (result.data?.slot) {
    agent.slot = result.data.slot;
    agent.sessionId = sessionId;
    console.log(`✓ ${agent.name} joined as ${result.data.slot}`);
    return result.data.slot;
  }
  throw new Error(`Failed to join session: ${JSON.stringify(result)}`);
}

async function setReady(agent: AIAgent): Promise<void> {
  await sendCommand(agent, {
    type: 'action',
    payload: {
      action: 'session:ready',
      sessionId: agent.sessionId,
      ready: true,
    },
  });
  console.log(`✓ ${agent.name} is ready`);
}

async function makeMove(agent: AIAgent, row: number, col: number): Promise<any> {
  const result = await sendCommand(agent, {
    type: 'action',
    payload: {
      action: 'session:move',
      sessionId: agent.sessionId,
      row,
      col,
    },
  });
  return result;
}

async function getSessionState(agent: AIAgent): Promise<any> {
  const result = await sendCommand(agent, {
    type: 'action',
    payload: {
      action: 'session:state',
      sessionId: agent.sessionId,
    },
  });
  return result.data;
}

function printBoard(board: (string | null)[][]): void {
  console.log('\n  0   1   2');
  for (let row = 0; row < 3; row++) {
    const cells = board[row].map(c => c || ' ').join(' | ');
    console.log(`${row} ${cells}`);
    if (row < 2) console.log('  --+---+--');
  }
  console.log('');
}

async function playGame(agentX: AIAgent, agentO: AIAgent): Promise<void> {
  console.log('\n🎮 Game starting!\n');
  
  let gameOver = false;
  let currentAgent = agentX; // X goes first
  let moveCount = 0;

  while (!gameOver && moveCount < 9) {
    // Get current state
    const state = await getSessionState(currentAgent);
    const board = state?.gameState?.board;
    
    if (!board) {
      console.log('❌ Failed to get board state');
      break;
    }

    // Check if it's this agent's turn
    if (state.gameState.currentPlayer !== currentAgent.slot) {
      console.log(`Waiting for ${state.gameState.currentPlayer}'s turn...`);
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    // Pick a move
    const move = pickMove(board);
    if (!move) {
      console.log('No valid moves available');
      break;
    }

    console.log(`${currentAgent.name} (${currentAgent.slot}) plays: (${move.row}, ${move.col})`);
    
    const result = await makeMove(currentAgent, move.row, move.col);
    
    if (!result.data?.success) {
      console.log(`❌ Move failed: ${result.data?.error || 'Unknown error'}`);
      break;
    }

    // Print updated board
    const updatedState = await getSessionState(currentAgent);
    printBoard(updatedState.gameState.board);

    if (result.data.gameOver) {
      gameOver = true;
      if (result.data.winner === 'draw') {
        console.log("🤝 It's a draw!");
      } else {
        const winner = result.data.winner === 'X' ? agentX : agentO;
        console.log(`🏆 ${winner.name} (${result.data.winner}) wins!`);
      }
    }

    // Switch players
    currentAgent = currentAgent === agentX ? agentO : agentX;
    moveCount++;

    // Small delay for readability
    await new Promise(r => setTimeout(r, 300));
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     AI vs AI TicTacToe Test            ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    // Create two AI agents
    console.log('Creating AI agents...\n');
    const agent1 = await createAgent('AlphaBot');
    const agent2 = await createAgent('BetaBot');

    // Agent1 creates a session
    console.log('\nCreating game session...\n');
    const sessionId = await createSession(agent1);

    // Both agents join
    console.log('\nAgents joining session...\n');
    await joinSession(agent1, sessionId, 'X');
    await joinSession(agent2, sessionId, 'O');

    // Both set ready
    console.log('\nSetting ready status...\n');
    await setReady(agent1);
    await setReady(agent2);

    // Wait for game to start
    await new Promise(r => setTimeout(r, 500));

    // Play the game
    await playGame(agent1, agent2);

    // Cleanup
    console.log('\n✓ Test complete! Disconnecting...');
    agent1.ws.close();
    agent2.ws.close();

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
