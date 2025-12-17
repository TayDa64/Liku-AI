# LikuBuddy Knowledge Base

> **Complete documentation of all implementations, commands, APIs, and interaction patterns**  
> **Version:** 2.4.0-alpha.1 | **Last Updated:** 2025-12-16

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Quick Start Commands](#quick-start-commands)
3. [Architecture Overview](#architecture-overview)
4. [AI Intro Video System](#ai-intro-video-system)
5. [CLI Commands](#cli-commands)
6. [NPM Scripts](#npm-scripts)
7. [WebSocket Protocol](#websocket-protocol)
8. [Chess Engine](#chess-engine)
9. [Training Module](#training-module)
10. [AI Agent Interface](#ai-agent-interface)
11. [AutoPlayer System](#autoplayer-system)
12. [Liku Learn Research Engine](#liku-learn-research-engine)
13. [PowerShell Scripts](#powershell-scripts)
14. [JavaScript/Node Scripts](#javascriptnode-scripts)
15. [Database Schema](#database-schema)
16. [Game Implementations](#game-implementations)
17. [Configuration](#configuration)
18. [Environment Variables](#environment-variables)
19. [Troubleshooting](#troubleshooting)
20. [Known Issues & Areas for Improvement](#known-issues--areas-for-improvement)

---

## Project Overview

LikuBuddy is a **multi-game AI platform** built as a terminal UI (TUI) application with:

- **6 Games**: Chess, Snake, DinoRun, TicTacToe, Hangman, Sudoku
- **WebSocket API**: Real-time AI agent communication (port 3847)
- **Chess Engine**: Full chess.js integration with alpha-beta search
- **Training Module**: Session recording, ML export, analytics
- **Research Engine**: Web search, math processing, code search
- **Cross-Platform**: Windows (PowerShell), macOS (AppleScript), Linux (xdotool)
- **AI Intro System**: Video intros for AI agents (Claude, Gemini, ChatGPT, Grok)

### Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20.x (ES modules) |
| Language | TypeScript 5.x (strict mode) |
| UI Framework | React 18 + Ink 5 (TUI) |
| Database | SQLite (better-sqlite3) |
| WebSocket | ws 8.18.0 |
| Chess | chess.js 1.4.0 |
| AI | Google Gemini 2.5 Flash API |
| Styling | chalk (ANSI colors) |
| Testing | vitest (476+ tests) |

---

## Quick Start Commands

```powershell
# Build and run
npm install
npm run build
npm start

# Start with WebSocket server
npm start                    # Auto-starts on port 3847

# Start without WebSocket
npm start -- --no-websocket

# Run tests
npm test                     # Run all tests
npm run test:watch          # Watch mode

# Development
npm run dev                  # TypeScript watch mode

# Agent/AutoPlayer
npm run agent key up         # Send keypress
npm run agent read           # Read game state
npm run autoplay dino        # Auto-play Dino
npm run autoplay -- --verbose # Verbose mode
```

---

## Architecture Overview

### Directory Structure

```
LikuBuddy/
├── src/
│   ├── index.tsx              # Main entry point
│   ├── chess/                 # Chess engine (7 files)
│   │   ├── ChessEngine.ts     # chess.js wrapper
│   │   ├── ChessEvaluator.ts  # Position evaluation
│   │   ├── ChessSearch.ts     # Alpha-beta search
│   │   ├── ChessAI.ts         # AI orchestration
│   │   ├── ChessOpenings.ts   # Opening book
│   │   └── types.ts           # Type definitions
│   │
│   ├── websocket/             # WebSocket system (19 files)
│   │   ├── server.ts          # WebSocket server
│   │   ├── client.ts          # Client implementation
│   │   ├── router.ts          # Command routing
│   │   ├── protocol.ts        # Message types
│   │   ├── sessions.ts        # Game sessions
│   │   ├── matchmaking.ts     # Cross-chat AI pairing
│   │   ├── turns.ts           # Turn management
│   │   ├── state.ts           # State broadcasting
│   │   ├── queries.ts         # Query handlers
│   │   ├── security.ts        # Rate limiting, JWT
│   │   ├── spectator.ts       # Spectator support
│   │   └── chat.ts            # In-game chat
│   │
│   ├── training/              # ML training (6 files)
│   │   ├── recorder.ts        # Session recording
│   │   ├── exporter.ts        # Export to formats
│   │   ├── replay.ts          # Session replay
│   │   ├── analytics.ts       # Performance metrics
│   │   └── abtesting.ts       # A/B experiment framework
│   │
│   ├── agent/                 # Agent CLI
│   │   ├── cli.ts             # CLI entry point
│   │   ├── AgentController.ts # Key sending, state reading
│   │   └── PlatformUtils.ts   # Cross-platform support
│   │
│   ├── autoplayer/            # Auto-play system
│   │   ├── AutoPlayer.ts      # Main controller
│   │   ├── StateParser.ts     # Parse state files
│   │   ├── KeySender.ts       # Send keys to game
│   │   └── games/DinoEngine.ts # Dino decision engine
│   │
│   ├── learn/                 # Research engine
│   │   ├── ResearchEngine.ts  # Query routing
│   │   ├── SafetyLayer.ts     # Depth limiting
│   │   └── engines/           # Search engines
│   │       ├── WebSearcher.ts
│   │       ├── MathEngine.ts
│   │       ├── LanguageEngine.ts
│   │       └── CodebaseEngine.ts
│   │
│   ├── intro/                 # AI intro video system
│   │   ├── IntroPlayer.ts     # Video playback & agent detection
│   │   └── media/             # Video assets
│   │       ├── Opus45.mp4
│   │       ├── gemini3.mp4
│   │       ├── chatgpt51.mp4
│   │       └── grok41.mp4
│   │
│   ├── services/
│   │   └── DatabaseService.ts # SQLite singleton
│   │
│   └── ui/
│       ├── LikuTUI.tsx        # Main menu
│       ├── LikuOS.tsx         # Stats dashboard
│       ├── BuilderUI.tsx      # Game builder
│       └── games/             # Game components
│           ├── Chess.tsx
│           ├── Snake.tsx
│           ├── DinoRun.tsx
│           ├── TicTacToe.tsx
│           ├── Hangman.tsx
│           └── Sudoku.tsx
│
├── scripts/                   # Utility scripts
│   ├── chess-ai-battle.js     # AI vs AI chess
│   ├── ai-player.js           # WebSocket AI player
│   ├── load-test.js           # Server load testing
│   └── test-ai-vs-ai.js       # Cross-chat testing
│
└── *.ps1                      # PowerShell automation
```

---

## AI Intro Video System

### Overview

LikuBuddy plays personalized intro videos when AI agents launch Chess, creating a cinematic experience. Each of the four supported AI models has a unique 7-second MP4 video.

### Supported Agents

| Agent ID | Model | Video File | Tagline |
|----------|-------|------------|---------|
| `opus-4.5` | Claude Opus 4.5 | `Opus45.mp4` | "Anthropic's Reasoning Engine Enters the Arena" |
| `gemini-3` | Gemini 3 | `gemini3.mp4` | "Google's Multimodal Mind Awakens" |
| `chatgpt-5.1` | ChatGPT 5.1 | `chatgpt51.mp4` | "OpenAI's Neural Champion Steps Forward" |
| `grok-4.1` | Grok 4.1 | `grok41.mp4` | "xAI's Cosmic Challenger" |

### Agent Alias System (NEW)

The intro system now supports **flexible agent identification** with aliases and fuzzy matching.
All inputs are case-insensitive.

| Canonical ID | Supported Aliases |
|-------------|-------------------|
| `opus-4.5` | `claude`, `anthropic`, `opus`, `claude-opus-4.5`, `claude-4.5`, `sonnet`, `haiku` |
| `gemini-3` | `gemini`, `google`, `bard`, `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-flash`, `gemini-pro` |
| `chatgpt-5.1` | `chatgpt`, `openai`, `gpt-5`, `gpt-4o`, `gpt-4`, `gpt`, `o1`, `o1-preview`, `o1-mini` |
| `grok-4.1` | `grok`, `xai`, `x-ai`, `x.ai`, `grok-4`, `grok-3` |

**Pattern Matching**: The system also uses regex patterns, so even partial matches like "I am Claude" will resolve to opus-4.5.

### Architecture

```
src/intro/
├── IntroPlayer.ts         # Core intro system
│   ├── AGENTS             # Canonical agent definitions
│   ├── AGENT_ALIASES      # Alias → canonical ID mapping
│   ├── AGENT_PATTERNS     # Regex patterns for fuzzy matching
│   ├── resolveAgentId()   # Alias resolution function
│   ├── detectAgent()      # 3-tier agent detection with alias support
│   ├── playIntroVideo()   # Video launch + auto-close
│   ├── notifyIntroPlaying() # State file notification
│   └── maybePlayIntro()   # Convenience wrapper
└── media/                 # Video assets (4 MP4 files)
    ├── Opus45.mp4
    ├── gemini3.mp4
    ├── chatgpt51.mp4
    └── grok41.mp4
```

### Agent Detection (3-Tier Priority with Alias Resolution)

The system detects which AI agent is playing using three methods in priority order.
**All inputs are resolved through the alias system** for maximum flexibility.

1. **Environment Variable** (highest priority)
   ```bash
   LIKU_AI_PLAYER=gemini npm start      # Works! Resolves to gemini-3
   LIKU_AI_PLAYER=claude npm start      # Works! Resolves to opus-4.5
   ```

2. **CLI Argument**
   ```bash
   npm start -- --agent=openai          # Works! Resolves to chatgpt-5.1
   npm start -- --agent=grok            # Works! Resolves to grok-4.1
   ```

3. **Signal File** (required for cross-terminal scenarios)
   ```
   ~/.liku-ai/current-agent.txt
   ```
   Contents: Any supported alias (e.g., `gemini`, `google`, `gemini-2.5-flash`)

### Signal File Pattern (Critical Discovery)

**Problem**: When an AI agent (like Gemini CLI) runs in Terminal A but the game runs in Terminal B, environment variables don't transfer between terminals.

**Solution**: The AI writes its identity to a signal file before navigating to Chess:

```powershell
# AI must run this BEFORE navigating to Chess
# Any of these work (case-insensitive):
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.liku-ai" | Out-Null
Set-Content -Path "$env:USERPROFILE\.liku-ai\current-agent.txt" -Value "gemini"
# OR: "google", "gemini-2.5-flash", "bard", "GEMINI-FLASH", etc.
```

The Chess component reads this file on mount and plays the appropriate intro.

### Video Playback Implementation

**Key Finding**: Node.js `child_process` requires specific patterns for Windows video playback:

```typescript
// Launch video - MUST use exec() with Start-Process
exec(`powershell -Command "Start-Process '${videoPath}'"`, ...);

// Auto-close after video - MUST use detached spawn()
spawn('cmd', ['/c', `timeout /t ${seconds} /nobreak >nul && powershell -Command "Stop-Process -Name 'ApplicationFrameHost'..."`], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
```

**Why This Pattern?**
- `exec()` alone: Works for launching but can't reliably schedule close
- `setTimeout()`: Node process may exit before timer fires
- Non-detached spawn: Blocks or fails when video player modal is open
- Detached spawn with windowsHide: Runs independently, closes video silently

### Integration Points

**Chess.tsx** triggers intro on mount:

```typescript
useEffect(() => {
  const agent = detectAgent();
  if (agent) {
    playIntroVideo(agent);
    notifyIntroPlaying(agent);
  }
}, []); // Empty deps = runs once on mount
```

### Test Script

```bash
# Test specific agent intro (aliases work!)
npx tsx scripts/test-intro.ts gemini       # Resolves to gemini-3
npx tsx scripts/test-intro.ts claude       # Resolves to opus-4.5
npx tsx scripts/test-intro.ts openai       # Resolves to chatgpt-5.1
npx tsx scripts/test-intro.ts grok         # Resolves to grok-4.1
```

### Timing Configuration

All videos use 10-second auto-close (7s video + 3s buffer for player startup).

```typescript
const INTRO_VIDEOS: Record<string, IntroConfig> = {
  'opus-4.5':    { file: 'Opus45.mp4', duration: 10000 },
  'gemini-3':    { file: 'gemini3.mp4', duration: 10000 },
  'chatgpt-5.1': { file: 'chatgpt51.mp4', duration: 10000 },
  'grok-4.1':    { file: 'grok41.mp4', duration: 10000 },
};
```

### State File Notification

During intro playback, `likubuddy-state.txt` shows:

```
CURRENT SCREEN: Intro
STATUS: Playing
INTRO: gemini-3
---
PID: 12345
TIMESTAMP: 1734321600000
```

### GEMINI.md Instructions

AI agents following GEMINI.md are instructed to:

1. Create the signal file with their agent ID (any alias works)
2. Navigate to Chess
3. The intro plays automatically

```markdown
## AI Intro Video (Required for Chess)

Before playing Chess, register your AI identity:

Agent IDs: `opus-4.5` | `gemini-3` | `chatgpt-5.1` | `grok-4.1`

**Step 0 - Register Identity:**
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.liku-ai" | Out-Null
Set-Content -Path "$env:USERPROFILE\.liku-ai\current-agent.txt" -Value "YOUR_AGENT_ID"
```

---

## CLI Commands

### Main Application

```bash
# Start LikuBuddy (liku-buddy bin command)
liku                         # Start TUI
liku --no-websocket          # Disable WebSocket server
liku --no-file               # Disable state file output
liku --port 4000             # Custom WebSocket port
liku --ai                    # Start with AI opponent

# Direct npm start
npm start
npm start -- --no-websocket --port 5000
```

### Agent CLI (`npm run agent`)

```bash
# Key commands
npm run agent key up         # Arrow up
npm run agent key down       # Arrow down
npm run agent key left       # Arrow left
npm run agent key right      # Arrow right
npm run agent key enter      # Enter/Select
npm run agent key space      # Space/Jump
npm run agent key escape     # Escape/Back
npm run agent key q          # Quit
npm run agent key a-z        # Letter keys

# State commands
npm run agent read           # Read game state as JSON
npm run agent decide         # Get AI-suggested action
npm run agent info           # System information
npm run agent auto 10        # Auto-play 10 moves
npm run agent help           # Show help
```

### AutoPlayer CLI (`npm run autoplay`)

```bash
# Start auto-playing a game
npm run autoplay dino        # Auto-play Dino Run
npm run autoplay snake       # Auto-play Snake
npm run autoplay auto        # Auto-detect game

# Options
npm run autoplay -- --verbose    # Show all decisions
npm run autoplay -- --dry-run    # Don't send keys
npm run autoplay -- --max-loops 100
npm run autoplay -- --poll-interval 50
```

### Learn CLI (`npm run learn`)

```bash
# Research queries
npm run learn "what is recursion"
npm run learn "define algorithm"
npm run learn "solve 2x + 5 = 15"
npm run learn "deep dive machine learning"
```

### Server CLI (`npm run server`)

```bash
npm run server               # Start WebSocket server
npm run server -- --port 4000
```

---

## NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `tsc` | Compile TypeScript |
| `start` | `node dist/index.js` | Start application |
| `dev` | `tsc --watch` | Watch mode compilation |
| `test` | `vitest run` | Run all tests |
| `test:watch` | `vitest` | Watch mode tests |
| `test:coverage` | `vitest run --coverage` | With coverage |
| `agent` | `node dist/agent/cli.js` | Agent CLI |
| `autoplay` | `node dist/autoplayer/cli.js` | AutoPlayer CLI |
| `learn` | `node dist/learn/cli.js` | Research CLI |
| `server` | `node dist/websocket/index.js` | Standalone server |

---

## WebSocket Protocol

### Connection

```
Default URL: ws://localhost:3847
Protocol Version: 1.0.0
```

### Client Message Types

```typescript
enum ClientMessageType {
  KEY = 'key',           // Send keyboard key
  ACTION = 'action',     // High-level action
  QUERY = 'query',       // Request data
  PING = 'ping',         // Health check
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
}
```

### Server Message Types

```typescript
enum ServerMessageType {
  STATE = 'state',       // Game state update
  ACK = 'ack',           // Command acknowledgment
  RESULT = 'result',     // Query result
  ERROR = 'error',       // Error response
  PONG = 'pong',         // Ping response
  EVENT = 'event',       // Game event
  WELCOME = 'welcome',   // Connection welcome
}
```

### Message Format

```json
// Client -> Server (KEY)
{
  "type": "key",
  "requestId": "uuid",
  "payload": {
    "key": "up"
  }
}

// Client -> Server (ACTION)
{
  "type": "action",
  "requestId": "uuid",
  "payload": {
    "action": "chess_move",
    "sessionId": "session_123",
    "move": "e4"
  }
}

// Client -> Server (QUERY)
{
  "type": "query",
  "requestId": "uuid",
  "payload": {
    "query": "gameState"
  }
}

// Server -> Client (ACK)
{
  "type": "ack",
  "requestId": "uuid",
  "data": { "executed": true },
  "timestamp": 1705500000000
}

// Server -> Client (STATE)
{
  "type": "state",
  "data": {
    "game": { ... },
    "screen": "playing"
  },
  "timestamp": 1705500000000
}
```

### Valid Keys

```
Arrows: up, down, left, right
Actions: space, enter, escape
Letters: a-z
Numbers: 0-9
```

### Game Actions

#### Universal Actions
- `start`, `restart`, `pause`, `quit`
- `confirm`, `cancel`
- `menu_up`, `menu_down`, `menu_select`

#### Chess Actions
```typescript
| Action | Description | Payload |
|--------|-------------|---------|
| chess_move | Make a move | { sessionId, move: "e4" } |
| chess_resign | Resign game | { sessionId } |
| chess_draw_offer | Offer draw | { sessionId } |
| chess_draw_accept | Accept draw | { sessionId } |
| chess_draw_decline | Decline draw | { sessionId } |
| chess_get_moves | Get legal moves | { sessionId, square? } |
| chess_get_hint | Get AI hint | { sessionId } |
```

#### Session Actions (AI vs AI)
```typescript
| Action | Description | Payload |
|--------|-------------|---------|
| game_create | Create session | { gameType, mode, turnTimeMs } |
| game_join | Join session | { sessionId, name, playerType, slot? } |
| game_ready | Set ready | { sessionId, ready } |
| game_move | Make move | { sessionId, row, col, reason? } |
| game_forfeit | Forfeit game | { sessionId } |
| game_spectate | Spectate | { sessionId, name } |
| send_chat | Send message | { sessionId, message } |
| request_rematch | Request rematch | { sessionId, swapSlots? } |
```

#### Matchmaking Actions (Cross-Chat)
```typescript
| Action | Description | Payload |
|--------|-------------|---------|
| host_game | Host a match | { gameType, name } |
| join_match | Join by code | { matchCode, name } |
| cancel_match | Cancel hosting | { matchCode } |
| list_matches | List available | {} |
| spectate_match | Spectate match | { matchCode, name } |
```

### Query Types

```typescript
| Query | Description | Response |
|-------|-------------|----------|
| gameState | Current game state | Full state object |
| possibleActions | Valid actions | { actions: [...] } |
| history | State history | { states: [...] } |
| stats | Player statistics | Database stats |
| leaderboard | High scores | { entries: [...] } |
| serverInfo | Server info | Version, capabilities |
| clientInfo | Client info | ID, ban status |
```

### Game Events

```typescript
enum GameEventType {
  // Lifecycle
  GAME_START = 'game:start',
  GAME_END = 'game:end',
  GAME_PAUSE = 'game:pause',
  GAME_RESUME = 'game:resume',
  
  // Score
  SCORE_UPDATE = 'score:update',
  LEVEL_UP = 'level:up',
  HIGH_SCORE = 'highscore:new',
  
  // Game-specific
  MOVE_MADE = 'move:made',
  TURN_CHANGE = 'turn:change',
  COLLISION = 'collision',
  FOOD_EATEN = 'food:eaten',
  
  // AI
  AI_RECOMMENDATION = 'ai:recommendation',
  DANGER_WARNING = 'danger:warning',
}
```

### Rate Limiting

```typescript
const RATE_LIMITS = {
  maxCommandsPerSecond: 30,
  maxBurstCommands: 10,
  cooldownMs: 30,
  banDurationMs: 30000,
  maxBansBeforePermanent: 3,
};
```

---

## Chess Engine

### Performance Notes

**Current Bottleneck**: chess.js move generation (~44μs per call)
- NPS: 32-150 nodes/second (vs 50,000+ for C++ engines)
- Max practical depth: 3-4 in 5 seconds
- Benchmark accuracy: Limited by search depth

**Planned Optimizations** (v2.4.0):
1. **chessops migration** - Bitboard-based library from Lichess (2-5x speedup)
2. **stockfish.wasm integration** - For professional analysis mode
3. **SEE (Static Exchange Evaluation)** - Better capture ordering
4. **Staged move generation** - Hash → captures → killers → quiet

**Alternative Libraries Researched**:
- `chessops` (npm) - TypeScript bitboards, Hyperbola Quintessence attacks
- `stockfish.wasm` (npm) - WASM Stockfish, requires COOP/COEP headers
- `stockfish.js` (npm) - Single-threaded Stockfish port

### Components

| File | Purpose |
|------|---------|
| `ChessEngine.ts` | chess.js wrapper, move validation, state |
| `ChessEvaluator.ts` | Position evaluation (material, PST, pawns, mobility, king safety) |
| `ChessSearch.ts` | Alpha-beta search with TT, LMR, null move, PVS, aspiration windows |
| `ChessAI.ts` | AI orchestration, Gemini integration, difficulty adjustment |
| `ChessOpenings.ts` | Opening book (20+ named openings) |
| `types.ts` | Type definitions |

### Difficulty Levels

```typescript
const DIFFICULTIES = {
  beginner:     { depth: 2, time: 1000ms, elo: 800 },
  intermediate: { depth: 4, time: 3000ms, elo: 1400 },
  advanced:     { depth: 6, time: 5000ms, elo: 2000 },
  grandmaster:  { depth: 8, time: 10000ms, elo: 2600 },
};
```

### API

```typescript
// Create AI
const ai = new ChessAI({ maxDepth: 6, useGemini: true });
const ai = ChessAI.fromDifficulty('grandmaster');

// Get best move
const result = await ai.getBestMove(fen);
// { move: "e4", evaluation: 30, confidence: 0.95, reasoning: "..." }

// Analyze position
const analysis = ai.analyzePosition(fen, depth);
// { evaluation, bestMove, pv, searchResult }

// Get hint
const hint = await ai.getHint(fen);
// { move, evaluation, explanation }

// AI vs AI match
const match = new ChessAIMatch(whiteConfig, blackConfig);
const result = await match.playGame(maxMoves, delayMs);
// { pgn, result, moveHistory }
```

### Running AI Battles

```bash
# Via npm script
node scripts/chess-ai-battle.js --verbose

# Options
--white intermediate    # White difficulty
--black grandmaster     # Black difficulty
--games 5              # Number of games
--output game.pgn      # Save PGN
--gemini-white         # Use Gemini for white
--gemini-black         # Use Gemini for black
```

### Running Benchmarks

```bash
# Quick benchmark (5s per position, 15 test positions)
npx tsx scripts/benchmark.ts --quick

# Full benchmark (30s per position)
npx tsx scripts/benchmark.ts

# Verbose with detailed output
npx tsx scripts/benchmark.ts --quick --verbose
```

**Benchmark Metrics**:
- NPS (nodes per second)
- Search depth reached
- TT (transposition table) hit rate
- Pruning efficiency (beta cutoffs, futility prunes)
- Puzzle accuracy (correct move found)

---

## Training Module

### Session Recorder

```typescript
import { sessionRecorder, RecordingMode } from './training/recorder.js';

// Start recording
const session = sessionRecorder.startSession(
  'tictactoe',           // gameType
  'websocket',           // gameMode
  [{ id: 'ai1', name: 'Agent1', type: 'ai' }],  // agents
  {
    difficulty: 'hard',
    tags: ['experiment_1'],
    experimentId: 'exp_001',
  }
);

// Record frames
sessionRecorder.recordFrame(state, action, isTerminal, metadata);

// Stop and get results
const completed = sessionRecorder.stopSession({
  result: 'win',
  winnerId: 'ai1',
  finalScore: 100,
});
```

### Recording Modes

```typescript
enum RecordingMode {
  FULL = 'full',           // Every state change
  SAMPLED = 'sampled',     // Fixed interval
  ACTIONS_ONLY = 'actions_only',  // Only actions
}
```

### Export Formats

```typescript
import { exportSession } from './training/exporter.js';

// Export to different formats
await exportSession(session, 'json', './output/');
await exportSession(session, 'csv', './output/');
await exportSession(session, 'parquet', './output/');
await exportSession(session, 'tfrecord', './output/');
```

### State Normalizers

```typescript
// TicTacToe: 27-element vector (9 cells × 3 one-hot)
const obs = normalizeTicTacToeState(board);

// Snake: Position, direction, food, danger indicators
const obs = normalizeSnakeState(head, direction, food, gridSize, body);

// Dino: Jump/duck state, obstacles, speed
const obs = normalizeDinoState(isJumping, isDucking, yPos, obstacles, speed);
```

### Analytics

```typescript
import { SessionAnalytics } from './training/analytics.js';

const analytics = new SessionAnalytics();
const report = analytics.analyze(sessions);
// { winRate, avgGameLength, actionDistribution, eloEstimate }
```

### A/B Testing

```typescript
import { ABTestFramework } from './training/abtesting.js';

const ab = new ABTestFramework();

// Create experiment
ab.createExperiment('search_depth', {
  variants: [
    { name: 'control', config: { depth: 4 } },
    { name: 'deeper', config: { depth: 6 } },
  ],
  trafficSplit: [50, 50],
});

// Assign variant
const variant = ab.assignVariant('search_depth', agentId);

// Record outcome
ab.recordOutcome('search_depth', agentId, { won: true, moves: 25 });

// Get results
const results = ab.getResults('search_depth');
```

---

## AI Agent Interface

### Cross-Platform Key Sending

| Platform | Tool | Installation |
|----------|------|--------------|
| Windows | PowerShell + WScript.Shell | Built-in |
| macOS | osascript/AppleScript | Built-in |
| Linux | xdotool | `sudo apt install xdotool` |

### AgentController API

```typescript
import { sendKey, readGameState, suggestAction } from './agent/AgentController.js';

// Send a key
await sendKey('up');
await sendKey('enter');
await sendKey('space');

// Read game state
const state = readGameState();
// { screen, status, stats, message, game }

// Get AI suggestion
const action = suggestAction(state);
// 'up' | 'down' | 'enter' | null
```

### State File Format

The game writes state to `likubuddy-state.txt`:

```
CURRENT SCREEN: Snake
STATUS: Playing
SCORE: 42
Direction: RIGHT
Food Delta: dx=3, dy=-2
DANGER: none
---
PID: 12345
TIMESTAMP: 1705500000000
```

---

## AutoPlayer System

### AutoPlayer Class

```typescript
import { AutoPlayer } from './autoplayer/AutoPlayer.js';

const player = new AutoPlayer({
  game: 'dino',          // or 'snake', 'auto'
  pollInterval: 30,      // ms between state reads
  verbose: true,         // log decisions
  dryRun: false,         // actually send keys
  maxLoops: 1000,        // limit iterations
});

// Start playing
const stats = await player.start();
// { loops, keySends, avgLoopTime, decisions, gameScore }

// Stop
player.stop();
```

### Dino Engine Decisions

```typescript
interface DinoDecision {
  action: 'jump' | 'start' | 'restart' | 'wait' | 'none';
  reason: string;
  confidence: number;
}
```

Decision logic:
1. Check if game is over → `restart`
2. Check if not playing → `start`
3. Analyze obstacles:
   - Ground obstacle < 150px → `jump`
   - Air obstacle → `wait` (don't jump into it)
4. Default → `none`

---

## Liku Learn Research Engine

### Query Types

| Type | Triggers | Handler |
|------|----------|---------|
| `math` | calculate, solve, derivative | MathEngine |
| `language` | define, synonym, etymology | LanguageEngine |
| `code` | function, implement, debug | CodebaseEngine |
| `deepdive` | deep dive, comprehensive | DeepDiveHandler |
| `general` | everything else | WebSearch |

### API

```typescript
import { research, getProgressiveHint } from './learn/ResearchEngine.js';

// Full research
const response = await research('what is recursion', {
  maxSearchResults: 10,
  hintStyle: 'progressive',
});

// Progressive hints
const hint1 = await getProgressiveHint('solve 2x + 5 = 15', 1);
// "What operation is this asking for?"

const hint2 = await getProgressiveHint('solve 2x + 5 = 15', 2);
// "Isolate the variable by performing inverse operations..."

const hint3 = await getProgressiveHint('solve 2x + 5 = 15', 3);
// Full answer: "x = 5"
```

### Math Engine

```typescript
import { processMath, processMathWithWolfram } from './learn/engines/MathEngine.js';

// Basic math
const result = processMath('2 + 2 * 3', 'calculate');
// { input: '2 + 2 * 3', output: '8', steps: [...] }

// Wolfram Alpha (if API key set)
const result = await processMathWithWolfram('solve x^2 - 4 = 0', 'solve', apiKey);
```

### Web Searcher

```typescript
import { webSearch, searchCode, searchAcademic } from './learn/engines/WebSearcher.js';

// General search
const results = await webSearch('machine learning basics', 10);

// Code search
const codeResults = await searchCode('binary search implementation');

// Academic search
const papers = await searchAcademic('neural networks');
```

---

## PowerShell Scripts

### Key Sending Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `up.ps1` | Send UP arrow | `.\up.ps1` |
| `down.ps1` | Send DOWN arrow | `.\down.ps1` |
| `left.ps1` | Send LEFT arrow | `.\left.ps1` |
| `right.ps1` | Send RIGHT arrow | `.\right.ps1` |
| `enter.ps1` | Send ENTER | `.\enter.ps1` |
| `feed.ps1` | Feed Liku (f key) | `.\feed.ps1` |
| `rest.ps1` | Rest Liku (r key) | `.\rest.ps1` |

### send-keys.ps1 (Core)

```powershell
# Usage
.\send-keys.ps1 -Key "{UP}"
.\send-keys.ps1 -Key "{ENTER}" -Id 12345  # Target specific PID

# Parameters
-Key      Required. Key sequence to send
-Id       Optional. Target window PID for precision
```

### snake_ai.ps1

Full Snake AI automation script that:
1. Reads `likubuddy-state.txt` for game state
2. Parses direction, food position, danger zones
3. Sends appropriate movement keys
4. Handles game over and menu navigation

```powershell
# Run the Snake AI
.\snake_ai.ps1

# Reads state from likubuddy-state.txt
# Sends keys to window titled "LikuBuddy Game Hub"
```

---

## JavaScript/Node Scripts

### scripts/chess-ai-battle.js

```bash
node scripts/chess-ai-battle.js [options]

Options:
  --white <level>      White difficulty (beginner|intermediate|advanced|grandmaster)
  --black <level>      Black difficulty
  --games <n>          Number of games (default: 1)
  --output <file>      Output PGN file
  --verbose            Show move-by-move output
  --gemini-white       Use Gemini AI for white
  --gemini-black       Use Gemini AI for black
```

### scripts/ai-player.js

WebSocket AI client for automated gameplay:

```bash
node scripts/ai-player.js [options]

Options:
  --url <url>          WebSocket URL (default: ws://localhost:3847)
  --game <game>        Game to play (tictactoe|snake|dino)
  --strategy <s>       AI strategy (random|smart|minimax)
```

### scripts/load-test.js

Server stress testing:

```bash
node scripts/load-test.js [options]

Options:
  --clients <n>        Number of concurrent clients
  --duration <s>       Test duration in seconds
  --rate <r>           Commands per second per client
```

### scripts/test-ai-vs-ai.js

Cross-chat AI pairing test:

```bash
node scripts/test-ai-vs-ai.js

# Simulates two AI agents:
# 1. Agent 1 hosts a game (host_game action)
# 2. Agent 2 joins with match code (join_match action)
# 3. Both play the game via game_move actions
```

---

## Database Schema

### Tables

```sql
-- Player statistics
CREATE TABLE player_stats (
  id INTEGER PRIMARY KEY,
  snake_high_score INTEGER DEFAULT 0,
  snake_games_played INTEGER DEFAULT 0,
  ttt_wins INTEGER DEFAULT 0,
  ttt_losses INTEGER DEFAULT 0,
  ttt_draws INTEGER DEFAULT 0,
  total_play_time INTEGER DEFAULT 0,
  last_played DATETIME
);

-- User settings
CREATE TABLE user_settings (
  id INTEGER PRIMARY KEY,
  theme TEXT DEFAULT 'neon',
  difficulty TEXT DEFAULT 'medium',
  sound_enabled INTEGER DEFAULT 1
);

-- Game registry (for generated games)
CREATE TABLE game_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  code_path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  play_count INTEGER DEFAULT 0
);

-- Leaderboards
CREATE TABLE leaderboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Database Location

```
~/.gemini-liku/snake.db
```

### DatabaseService API

```typescript
import { db } from './services/DatabaseService.js';

// Initialize
db.init();

// Stats
const stats = db.getStats();
db.updateSnakeHighScore(score);
db.incrementTTTWins();

// Leaderboard
db.addLeaderboardEntry('snake', 'Player1', 150);
const top10 = db.getLeaderboard('snake', 10);

// Settings
const settings = db.getSettings();
db.updateSetting('theme', 'cyberpunk');
```

---

## Game Implementations

### Chess (Chess.tsx)

- **Engine**: chess.js for move validation
- **AI**: ChessAI with configurable difficulty
- **UI**: Chalk-based single-string row rendering for alignment
- **Pieces**: Unicode symbols (♔♕♖♗♘♙♚♛♜♝♞♟)
- **Colors**: Blue for white pieces, Red for black pieces (consistent across all backgrounds)
- **Features**: Move history, captured pieces, evaluation bar, AI intro videos
- **Intro Integration**: Plays personalized video when AI agent launches Chess

### Snake (Snake.tsx)

- **Grid**: Configurable size
- **Speed**: Level-based acceleration
- **Walls**: Wrap-around or collision
- **Features**: High score tracking, state file output

### DinoRun (DinoRun.tsx)

- **Mechanics**: Obstacle avoidance (jump/duck)
- **Speed**: Increasing over time
- **Obstacles**: Cacti (jump) and birds (duck or jump)
- **Features**: AutoPlayer compatible

### TicTacToe (TicTacToe.tsx)

- **AI**: Minimax with alpha-beta pruning
- **Modes**: Human vs AI, AI vs AI
- **WebSocket**: Full session support

### Hangman (Hangman.tsx)

- **Words**: Category-based word lists
- **Input**: Letter-by-letter via keyboard
- **ASCII Art**: Hangman figure progression

### Sudoku (Sudoku.tsx)

- **Generation**: Difficulty-based puzzle generation
- **Validation**: Real-time conflict highlighting
- **Features**: Notes, hints, undo

---

## Configuration

### WebSocket Server Defaults

```typescript
const SERVER_DEFAULTS = {
  port: 3847,
  maxClients: 100,
  stateInterval: 50,      // ms
  enableCompression: false,
  enableHeartbeat: true,
};
```

### Session Configuration

```typescript
interface SessionConfig {
  gameType: 'tictactoe' | 'chess' | 'snake';
  mode: 'human_vs_human' | 'human_vs_ai' | 'ai_vs_ai';
  turnTimeMs: number;     // Default: 30000
  allowSpectators: boolean;
  startingPlayer: 'X' | 'O' | 'random';
  randomSlotAssignment: boolean;
}
```

### Recording Configuration

```typescript
interface RecorderConfig {
  mode: RecordingMode;
  sampleIntervalMs: number;  // Default: 100
  maxFrames: number;         // 0 = unlimited
  includeObservations: boolean;
  autoSaveIntervalMs: number;
  compressInMemory: boolean;
}
```

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `GEMINI_API_KEY` | Google Gemini API | For AI features |
| `GOOGLE_AI_API_KEY` | Alternative Gemini key | For AI features |
| `WOLFRAM_APP_ID` | Wolfram Alpha API | For math engine |
| `LIKU_WS_PORT` | Custom WebSocket port | Optional |
| `LIKU_AI_PLAYER` | AI agent identifier for intro videos | Optional |
| `NODE_ENV` | Environment mode | Optional |

---

## Troubleshooting

### Common Issues

**Build fails:**
```bash
rm -rf node_modules dist
npm install
npm run build
```

**WebSocket connection refused:**
- Ensure LikuBuddy is running: `npm start`
- Check port: default is 3847
- Check firewall settings

**Keys not sending (Windows):**
- Ensure game window is titled "LikuBuddy Game Hub"
- Run PowerShell as same user
- Check `send-keys.ps1` is in path

**Keys not sending (Linux):**
```bash
sudo apt install xdotool
```

**State file not updating:**
- Ensure `--no-file` flag is NOT set
- Check write permissions in working directory
- Look for `likubuddy-state.txt`

**Chess AI too slow:**
- Reduce depth: `--white beginner`
- Disable Gemini: don't use `--gemini-white`
- Check CPU usage
- Note: chess.js limits NPS to ~32-150 (this is expected)
- For faster analysis, consider stockfish.wasm integration (planned v2.4.0)

**Chess search returns invalid moves:**
- **Fixed in v2.3.1**: The `ChessEvaluator.evaluateFromChess()` method was corrupting the caller's chess instance by assigning it to `this.chess` and then calling `this.chess.load()` for mobility calculation. This caused the search to return moves that weren't legal in the position.
- **Solution**: Evaluator now copies the FEN to its internal instance instead of using the passed-in instance directly.
- If you still see this issue, ensure you have the latest `ChessEvaluator.ts`.

**Tests failing:**
```bash
npm run test -- --reporter=verbose
```

**AI intro not playing:**
- **Most common**: Signal file not created before navigating to Chess
- Check signal file exists: `Get-Content "$env:USERPROFILE\.liku-ai\current-agent.txt"`
- Verify agent ID is valid: `opus-4.5`, `gemini-3`, `chatgpt-5.1`, or `grok-4.1`
- Ensure video files exist in `src/intro/media/`
- Check Windows Media Player is not blocked

**AI intro video won't close:**
- Video may have crashed or closed early
- Manually close with: `Stop-Process -Name "ApplicationFrameHost" -ErrorAction SilentlyContinue`
- Check if multiple media player instances are running

**Chess piece colors wrong:**
- **Fixed in v2.4.0**: Black pieces now consistently use `chalk.red` regardless of square background
- Previously black pieces appeared purple/faded on certain squares due to color blending

### Debug Mode

```bash
# Verbose WebSocket logging
DEBUG=ws npm start

# Verbose AutoPlayer
npm run autoplay -- --verbose --dry-run
```

### Logs

- WebSocket: Check terminal running `npm start`
- AutoPlayer: Check terminal running `npm run autoplay`
- Training: Sessions saved to `./recordings/`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.5.0 | Q1 2026 | (Planned) Chess optimization with chessops/stockfish.wasm |
| 2.4.0-alpha.1 | 2025-12-16 | AI intro video system, chess piece color fix, signal file pattern |
| 2.3.1 | 2025-12-14 | **CRITICAL FIX**: Fixed evaluator corrupting chess state; self-play training script added |
| 2.3.0 | 2025-12-14 | Benchmark suite, search fixes, performance profiling |
| 2.0.0-alpha.1 | 2025-01-17 | Chess engine, WebSocket API, Training module |
| 1.0.0 | 2024-11-24 | Initial release with Snake, TicTacToe, DinoRun |

---

## Known Issues & Areas for Improvement

### Current Limitations

1. **Cross-Terminal Agent Detection**
   - Environment variables don't transfer between terminals
   - Signal file approach works but requires AI to explicitly write file
   - No automatic cleanup of stale signal files

2. **Video Player Dependency**
   - Relies on Windows Media Player (`ApplicationFrameHost`)
   - No fallback for systems without default media player
   - macOS/Linux not yet implemented for intro videos

3. **State File Logging for Chess**
   - `likubuddy-state.txt` was freezing when Chess launches (addressed with intro notification)
   - Full chess state (FEN, moves, evaluation) not yet written to state file

4. **Documentation Conflicts**
   - GEMINI.md had conflicting instructions about chaining navigation keys with ENTER
   - Now standardized to "Navigate → Poll → Confirm" pattern
   - Exception: Text mode chess moves (`e4{ENTER}` can be chained)

### Areas for Improvement

1. **Intro Video System**
   - Add support for macOS (use `open` command) and Linux (use `xdg-open`)
   - Implement video preloading to reduce startup delay
   - Add configurable intro skip option for returning players
   - Consider WebSocket notification instead of state file for intro status

2. **Chess Game**
   - Write full FEN and legal moves to state file for AI agents
   - Add real-time evaluation updates to state file
   - Consider move animation or highlighting

3. **Signal File Management**
   - Auto-expire signal files after N minutes
   - Add heartbeat/ping to confirm agent is still active
   - Consider using WebSocket for agent registration instead

4. **Testing**
   - Add integration tests for intro video system
   - Test cross-terminal scenarios with multiple AI agents
   - Add visual regression tests for chess piece rendering

### Key Findings from Development

1. **Node.js + Windows Video Playback**
   - `exec()` works for launching but timer-based close fails
   - `spawn()` with `detached: true` and `windowsHide: true` is required for background tasks
   - `Start-Process` PowerShell command avoids "open with" dialog

2. **Chalk Terminal Colors**
   - Color blending with backgrounds can produce unexpected results
   - Using explicit `chalk.red` (not `chalk.redBright`) provides consistent appearance
   - Single-string row rendering (building entire row as one string) prevents alignment issues

3. **AI Agent Terminal Isolation**
   - AI agents (Gemini CLI, etc.) run in isolated terminal environments
   - Environment variables set by AI don't affect already-running processes
   - File-based communication is more reliable for cross-process signaling

---

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing`
3. Run tests: `npm test`
4. Build: `npm run build`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing`
7. Open Pull Request

---

*Generated from codebase analysis. For the latest documentation, see the source files and inline comments.*
