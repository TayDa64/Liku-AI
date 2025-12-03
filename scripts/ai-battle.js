#!/usr/bin/env node
/**
 * AI Battle - True AI vs AI TicTacToe using Gemini API
 * 
 * Two AI players make real decisions using Gemini's reasoning,
 * creating unique, non-deterministic gameplay every time.
 * 
 * Usage:
 *   node scripts/ai-battle.js                    # Default: 5-game series
 *   node scripts/ai-battle.js --series 3         # Best-of-3 series
 *   node scripts/ai-battle.js --delay 1000       # 1s delay between moves
 * 
 * Requires: GEMINI_API_KEY environment variable
 */

import WebSocket from 'ws';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// Configuration
// ============================================================================

const args = process.argv.slice(2);
const config = {
  series: 5,
  delay: 0,
  verbose: false,
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--series' && args[i + 1]) {
    config.series = parseInt(args[i + 1]) || 5;
    i++;
  } else if (args[i] === '--delay' && args[i + 1]) {
    config.delay = parseInt(args[i + 1]) || 0;
    i++;
  } else if (args[i] === '--verbose' || args[i] === '-v') {
    config.verbose = true;
  }
}

// AI Personas
const AI_PERSONAS = {
  player1: {
    name: 'Nova',
    emoji: '🌟',
    color: '\x1b[36m',
    style: 'strategic and analytical',
  },
  player2: {
    name: 'Spark',
    emoji: '⚡',
    color: '\x1b[33m',
    style: 'creative and unpredictable',
  },
};

// ============================================================================
// Gemini AI Integration
// ============================================================================

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error('\x1b[31m❌ Error: GEMINI_API_KEY environment variable not set\x1b[0m');
  console.error('\nSet it with:');
  console.error('  $env:GEMINI_API_KEY = "your-api-key"    # PowerShell');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Primary model - gemini-2.0-flash is the fastest and most quota-friendly
const MODEL_NAME = 'gemini-2.0-flash';

function getModel() {
  return genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      maxOutputTokens: 300,
    },
  });
}

async function callWithRetry(prompt, maxRetries = 2) {
  let lastError = null;
  
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      const model = getModel();
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      lastError = error;
      
      // If rate limited, wait and retry
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        // Wait before retry
        if (retry < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 3000)); // Wait 3 seconds
        }
      } else {
        throw error; // Non-rate-limit error
      }
    }
  }
  
  throw lastError;
}

/**
 * Get AI's move decision using Gemini API
 */
async function getAIMove(board, mySymbol, persona, moveNumber) {
  const oppSymbol = mySymbol === 'X' ? 'O' : 'X';
  
  // Build a clear board representation
  let boardStr = '';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = board[r][c];
      boardStr += cell ? ` ${cell} ` : `(${r},${c})`;
      if (c < 2) boardStr += '|';
    }
    boardStr += '\n';
    if (r < 2) boardStr += '---+---+---\n';
  }
  
  const prompt = `You are ${persona.name}, playing TicTacToe as "${mySymbol}".

Board (empty cells show row,col coordinates):
${boardStr}

This is move #${moveNumber}. Pick ONE empty cell.

Reply with EXACTLY this format (no extra text):
THINK: [brief reason, under 8 words]
PLAY: row,col

Example:
THINK: Center gives best control
PLAY: 1,1`;

  try {
    const response = await callWithRetry(prompt);
    
    if (config.verbose) {
      console.log(`\n[${persona.name} RAW RESPONSE]:\n${response}\n`);
    }
    
    // Parse response - be flexible with format
    const thinkMatch = response.match(/THINK:\s*(.+?)(?:\n|$)/i);
    const playMatch = response.match(/PLAY:\s*(\d)\s*,\s*(\d)/i);
    
    if (playMatch) {
      const row = parseInt(playMatch[1]);
      const col = parseInt(playMatch[2]);
      const reasoning = thinkMatch ? thinkMatch[1].trim() : 'Strategic play';
      
      // Validate move
      if (row >= 0 && row <= 2 && col >= 0 && col <= 2 && !board[row][col]) {
        return { row, col, reasoning };
      }
      
      // Invalid move - find valid alternative
      if (config.verbose) {
        console.log(`[${persona.name}] Invalid move [${row},${col}], finding alternative...`);
      }
    }
    
    // Fallback: smart move selection
    const reasoning = thinkMatch ? thinkMatch[1].trim() : 'Best available';
    
    // Priority: center > corners > edges
    if (!board[1][1]) return { row: 1, col: 1, reasoning: reasoning + ' (center)' };
    for (const [r, c] of [[0,0], [0,2], [2,0], [2,2]]) {
      if (!board[r][c]) return { row: r, col: c, reasoning: reasoning + ' (corner)' };
    }
    for (const [r, c] of [[0,1], [1,0], [1,2], [2,1]]) {
      if (!board[r][c]) return { row: r, col: c, reasoning: reasoning + ' (edge)' };
    }
    
    return null;
  } catch (error) {
    // Log error to file for debugging
    const fs = await import('fs');
    fs.appendFileSync('ai-battle-errors.log', `[${new Date().toISOString()}] ${persona.name}: ${error.message}\n`);
    
    // Emergency fallback
    if (!board[1][1]) return { row: 1, col: 1, reasoning: 'Taking center' };
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (!board[r][c]) return { row: r, col: c, reasoning: 'Available move' };
      }
    }
    return null;
  }
}

/**
 * Generate AI greeting
 */
async function getAIGreeting(persona, opponentName, gameNum) {
  const prompt = `You are ${persona.name}, a ${persona.style} AI.
Generate a brief, friendly greeting for ${opponentName} before game ${gameNum}.
Keep it under 12 words. Include one emoji. Be creative!
Reply with ONLY the greeting.`;

  try {
    return (await callWithRetry(prompt)).slice(0, 80);
  } catch {
    return `Ready for game ${gameNum}, ${opponentName}! 🎮`;
  }
}

/**
 * Generate game-over message
 */
async function getAIGameOverMessage(persona, result) {
  const outcomes = { win: 'won', loss: 'lost', draw: 'drew' };
  const prompt = `You ${outcomes[result]} a TicTacToe game.
Generate a brief, sportsmanlike response under 10 words with one emoji.
Reply with ONLY the message.`;

  try {
    return (await callWithRetry(prompt)).slice(0, 60);
  } catch {
    return result === 'win' ? 'Great game! 🎉' : result === 'loss' ? 'Well played! 👏' : 'Good match! 🤝';
  }
}

// ============================================================================
// Visual Display
// ============================================================================

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';

// Centralized game state (only host manages this)
const gameState = {
  games: [],           // { board, winner, p1Symbol, p2Symbol }
  chatLog: [],         // { name, message, color }
  scores: { p1: 0, p2: 0, draws: 0 },
  currentGame: 0,
  totalGames: config.series,
  status: 'Starting...',
};

function renderBoard(board, gameNum, winner, p1Symbol, p2Symbol) {
  const lines = [];
  const p1 = AI_PERSONAS.player1;
  const p2 = AI_PERSONAS.player2;
  
  let header;
  if (winner === 'draw') {
    header = `${DIM}G${gameNum}: Draw${RESET}`;
  } else if (winner === p1.name) {
    header = `${p1.color}G${gameNum}: ${p1.emoji}${RESET}`;
  } else if (winner === p2.name) {
    header = `${p2.color}G${gameNum}: ${p2.emoji}${RESET}`;
  } else {
    header = `${CYAN}G${gameNum}${RESET}`;
  }
  
  lines.push(header);
  lines.push(`${DIM}┌───┬───┬───┐${RESET}`);
  
  for (let r = 0; r < 3; r++) {
    const cells = board[r].map(cell => {
      if (cell === p1Symbol) return `${p1.color}${BOLD} ${cell} ${RESET}`;
      if (cell === p2Symbol) return `${p2.color}${BOLD} ${cell} ${RESET}`;
      return `${DIM} · ${RESET}`;
    });
    lines.push(`${DIM}│${RESET}${cells.join(`${DIM}│${RESET}`)}${DIM}│${RESET}`);
    if (r < 2) lines.push(`${DIM}├───┼───┼───┤${RESET}`);
  }
  
  lines.push(`${DIM}└───┴───┴───┘${RESET}`);
  return lines;
}

function render() {
  console.clear();
  
  const p1 = AI_PERSONAS.player1;
  const p2 = AI_PERSONAS.player2;
  
  // Header
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}   🤖 AI BATTLE: ${p1.name} ${p1.emoji} vs ${p2.name} ${p2.emoji}   │   Powered by Gemini AI${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n`);
  
  // Scoreboard
  console.log(`   ${p1.color}${p1.emoji} ${p1.name}: ${gameState.scores.p1}W${RESET}   │   ${p2.color}${p2.emoji} ${p2.name}: ${gameState.scores.p2}W${RESET}   │   ${DIM}Draws: ${gameState.scores.draws}${RESET}   │   ${YELLOW}${gameState.status}${RESET}\n`);
  
  // Game boards
  if (gameState.games.length > 0) {
    const boardsPerRow = 5;
    const boardLines = gameState.games.map((g, i) => 
      renderBoard(g.board, i + 1, g.winner, g.p1Symbol, g.p2Symbol)
    );
    
    const maxLines = Math.max(...boardLines.map(b => b.length));
    for (let row = 0; row < Math.ceil(boardLines.length / boardsPerRow); row++) {
      for (let line = 0; line < maxLines; line++) {
        const parts = [];
        for (let col = 0; col < boardsPerRow; col++) {
          const idx = row * boardsPerRow + col;
          if (idx < boardLines.length) {
            parts.push((boardLines[idx][line] || '').padEnd(16));
          }
        }
        console.log('   ' + parts.join(' '));
      }
      console.log('');
    }
  }
  
  // Chat log
  console.log(`${DIM}─────────────────────────────────────────────────────────────────────────────────${RESET}`);
  console.log(`${BOLD}${MAGENTA}   💬 CHAT LOG${RESET}`);
  console.log(`${DIM}─────────────────────────────────────────────────────────────────────────────────${RESET}`);
  
  const recentChat = gameState.chatLog.slice(-10).reverse();
  if (recentChat.length === 0) {
    console.log(`   ${DIM}(Waiting for game to start...)${RESET}`);
  } else {
    for (const msg of recentChat) {
      console.log(`   ${msg.color}${msg.name}:${RESET} ${msg.message}`);
    }
  }
  
  console.log(`\n${DIM}   Press Ctrl+C to exit${RESET}`);
}

function addChat(name, message, color) {
  // Prevent duplicate consecutive messages
  const last = gameState.chatLog[gameState.chatLog.length - 1];
  if (last && last.name === name && last.message === message) return;
  
  gameState.chatLog.push({ name, message, color });
  render();
}

function updateCurrentBoard(board) {
  if (gameState.games.length > 0) {
    gameState.games[gameState.games.length - 1].board = JSON.parse(JSON.stringify(board));
    render();
  }
}

function startNewGame(p1Symbol, p2Symbol) {
  gameState.games.push({
    board: [[null, null, null], [null, null, null], [null, null, null]],
    winner: null,
    p1Symbol,
    p2Symbol,
  });
  gameState.currentGame = gameState.games.length;
  gameState.status = `Game ${gameState.currentGame}/${gameState.totalGames}`;
  render();
}

function endCurrentGame(winner, finalBoard) {
  if (gameState.games.length > 0) {
    const game = gameState.games[gameState.games.length - 1];
    game.board = JSON.parse(JSON.stringify(finalBoard));
    
    if (winner === 'draw') {
      game.winner = 'draw';
      gameState.scores.draws++;
    } else if (winner === game.p1Symbol) {
      game.winner = AI_PERSONAS.player1.name;
      gameState.scores.p1++;
    } else {
      game.winner = AI_PERSONAS.player2.name;
      gameState.scores.p2++;
    }
    render();
  }
}

// ============================================================================
// WebSocket Game Client
// ============================================================================

class AIPlayer {
  constructor(persona, isHost) {
    this.persona = persona;
    this.isHost = isHost;
    this.ws = null;
    this.sessionId = null;
    this.mySlot = null;
    this.opponentName = null;
    this.board = [[null, null, null], [null, null, null], [null, null, null]];
    this.moveCount = 0;
    this.pendingMove = false;
    this.gamesPlayed = 0;
  }
  
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:3847?name=${this.persona.name}&type=ai-battle`);
      this.ws.on('open', () => {
        this.send({ type: 'subscribe', payload: { events: ['*'] }, requestId: 'sub' });
        resolve();
      });
      this.ws.on('message', (data) => this.handleMessage(JSON.parse(data.toString())));
      this.ws.on('error', reject);
    });
  }
  
  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
  
  async handleMessage(msg) {
    if (config.verbose && msg.type !== 'event') {
      console.log(`[${this.persona.name}] ${msg.type}:`, JSON.stringify(msg.data).slice(0, 100));
    }
    
    switch (msg.type) {
      case 'ack': await this.handleAck(msg.data); break;
      case 'event': await this.handleEvent(msg.data); break;
      case 'error': console.error(`[${this.persona.name}] Error:`, msg.data?.message); break;
    }
  }
  
  async handleAck(data) {
    if (data.action === 'host_game') {
      this.matchCode = data.matchCode;
      if (this.isHost) {
        gameState.status = `Hosted: ${data.matchCode}`;
        render();
      }
    }
    
    if (data.action === 'join_match') {
      this.sessionId = data.sessionId;
      this.mySlot = data.yourSlot;
      this.opponentName = data.opponent?.name;
      setTimeout(() => this.sendReady(), 200);
    }
    
    if (data.action === 'request_rematch') {
      this.mySlot = data.yourSlot;
    }
  }
  
  async handleEvent(event) {
    switch (event.event) {
      case 'opponent_found':
      case 'matchFound':
        this.sessionId = event.sessionId;
        this.mySlot = event.yourSlot;
        this.opponentName = event.opponent?.name;
        this.moveCount = 0;
        
        // Only host manages display state
        if (this.isHost) {
          const p1Symbol = this.mySlot;
          const p2Symbol = this.mySlot === 'X' ? 'O' : 'X';
          startNewGame(p1Symbol, p2Symbol);
        }
        
        // Send greeting
        const greeting = await getAIGreeting(this.persona, this.opponentName, this.gamesPlayed + 1);
        this.sendChat(greeting);
        addChat(this.persona.name, greeting, this.persona.color);
        
        setTimeout(() => this.sendReady(), 300);
        break;
        
      case 'session:chat':
        // Only display opponent's chat (avoid duplicates from our own sends)
        if (event.from !== this.persona.name) {
          const color = event.from === AI_PERSONAS.player1.name ? AI_PERSONAS.player1.color : AI_PERSONAS.player2.color;
          addChat(event.from, event.message, color);
        }
        break;
        
      case 'session:gameStarted':
        this.board = event.state?.board || [[null, null, null], [null, null, null], [null, null, null]];
        this.moveCount = 0;
        if (this.isHost) updateCurrentBoard(this.board);
        break;
        
      case 'session:yourTurn':
        if (this.pendingMove) return;
        this.pendingMove = true;
        
        if (event.state?.board) this.board = event.state.board;
        this.moveCount++;
        
        // Get AI decision
        const move = await getAIMove(this.board, this.mySlot, this.persona, this.moveCount);
        
        if (move) {
          // Share reasoning
          const chatMsg = `🎯 ${move.reasoning} → [${move.row},${move.col}]`;
          this.sendChat(chatMsg);
          addChat(this.persona.name, chatMsg, this.persona.color);
          
          if (config.delay > 0) {
            await new Promise(r => setTimeout(r, config.delay));
          }
          
          this.send({
            type: 'action',
            payload: {
              action: 'game_move',
              sessionId: this.sessionId,
              row: move.row,
              col: move.col,
            },
            requestId: 'move-' + Date.now()
          });
        }
        break;
        
      case 'session:moveMade':
        this.pendingMove = false;
        if (event.state?.board) {
          this.board = event.state.board;
          if (this.isHost) updateCurrentBoard(this.board);
        }
        break;
        
      case 'session:gameEnded':
        this.pendingMove = false;
        
        // Only host tracks game completion
        if (this.isHost) {
          this.gamesPlayed++;
          
          // Update display
          endCurrentGame(event.winner, event.state?.board || this.board);
          
          // Determine result for this AI
          let result;
          if (event.winner === 'draw') result = 'draw';
          else if (event.winner === this.mySlot) result = 'win';
          else result = 'loss';
          
          // Send game-over message
          const ggMsg = await getAIGameOverMessage(this.persona, result);
          this.sendChat(ggMsg);
          addChat(this.persona.name, ggMsg, this.persona.color);
          
          // Check series completion
          if (this.gamesPlayed >= config.series) {
            gameState.status = '🏁 SERIES COMPLETE!';
            render();
            
            setTimeout(() => {
              const p1 = AI_PERSONAS.player1;
              const p2 = AI_PERSONAS.player2;
              
              console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}`);
              console.log(`${BOLD}   🏆 FINAL RESULTS${RESET}`);
              console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}`);
              console.log(`   ${p1.color}${p1.emoji} ${p1.name}: ${gameState.scores.p1} wins${RESET}`);
              console.log(`   ${p2.color}${p2.emoji} ${p2.name}: ${gameState.scores.p2} wins${RESET}`);
              console.log(`   ${DIM}Draws: ${gameState.scores.draws}${RESET}\n`);
              
              if (gameState.scores.p1 > gameState.scores.p2) {
                console.log(`   ${p1.color}${BOLD}🎉 ${p1.name} WINS THE SERIES! 🎉${RESET}\n`);
              } else if (gameState.scores.p2 > gameState.scores.p1) {
                console.log(`   ${p2.color}${BOLD}🎉 ${p2.name} WINS THE SERIES! 🎉${RESET}\n`);
              } else {
                console.log(`   ${YELLOW}${BOLD}Series tied! Both AIs are evenly matched!${RESET}\n`);
              }
              
              process.exit(0);
            }, 2000);
          } else {
            // Request rematch
            this.board = [[null, null, null], [null, null, null], [null, null, null]];
            this.moveCount = 0;
            
            setTimeout(() => {
              gameState.status = `Starting game ${this.gamesPlayed + 1}/${config.series}...`;
              render();
              
              this.send({
                type: 'action',
                payload: {
                  action: 'request_rematch',
                  sessionId: this.sessionId,
                  swapSlots: true,
                },
                requestId: 'rematch-' + Date.now()
              });
            }, 1500);
          }
        } else {
          // Non-host player just sends their game-over message
          let result;
          if (event.winner === 'draw') result = 'draw';
          else if (event.winner === this.mySlot) result = 'win';
          else result = 'loss';
          
          const ggMsg = await getAIGameOverMessage(this.persona, result);
          this.sendChat(ggMsg);
          addChat(this.persona.name, ggMsg, this.persona.color);
          
          // Reset board
          this.board = [[null, null, null], [null, null, null], [null, null, null]];
          this.moveCount = 0;
        }
        break;
        
      case 'session:rematch':
        // Get new slot
        if (event.players) {
          for (const p of event.players) {
            if (p.name === this.persona.name) {
              this.mySlot = p.slot;
              break;
            }
          }
        }
        
        this.board = [[null, null, null], [null, null, null], [null, null, null]];
        this.moveCount = 0;
        this.pendingMove = false;
        
        // Only host starts new game in display
        if (this.isHost) {
          const p1Symbol = this.mySlot;
          const p2Symbol = this.mySlot === 'X' ? 'O' : 'X';
          startNewGame(p1Symbol, p2Symbol);
        }
        
        setTimeout(() => this.sendReady(), 300);
        break;
    }
  }
  
  sendReady() {
    if (this.sessionId) {
      this.send({
        type: 'action',
        payload: { action: 'game_ready', sessionId: this.sessionId, ready: true },
        requestId: 'ready-' + Date.now()
      });
    }
  }
  
  sendChat(message) {
    if (this.sessionId) {
      this.send({
        type: 'action',
        payload: { action: 'send_chat', sessionId: this.sessionId, message },
        requestId: 'chat-' + Date.now()
      });
    }
  }
  
  hostGame() {
    this.send({
      type: 'action',
      payload: { action: 'host_game', gameType: 'tictactoe', name: this.persona.name },
      requestId: 'host'
    });
  }
  
  joinGame(matchCode) {
    this.send({
      type: 'action',
      payload: { action: 'join_match', matchCode, name: this.persona.name },
      requestId: 'join'
    });
  }
  
  getMatchCode() { return this.matchCode; }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  gameState.status = 'Connecting...';
  render();
  
  const player1 = new AIPlayer(AI_PERSONAS.player1, true);  // Host
  const player2 = new AIPlayer(AI_PERSONAS.player2, false); // Joiner
  
  try {
    await player1.connect();
    await player2.connect();
    
    gameState.status = 'Hosting game...';
    render();
    
    player1.hostGame();
    
    // Wait for match code then join
    const waitForCode = () => {
      const code = player1.getMatchCode();
      if (code) {
        gameState.status = `Joining ${code}...`;
        render();
        player2.joinGame(code);
      } else {
        setTimeout(waitForCode, 100);
      }
    };
    setTimeout(waitForCode, 500);
    
  } catch (error) {
    console.error(`\x1b[31m❌ Failed to connect: ${error.message}\x1b[0m`);
    console.error('\nMake sure WebSocket server is running:');
    console.error('  node dist/websocket/cli.js');
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n👋 Bye!');
  process.exit(0);
});

main();
