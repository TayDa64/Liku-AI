# Liku-AI Development Roadmap

## Overview

Liku-AI is a fork of LikuBuddy focused on **real-time AI agent communication** via WebSocket. This document tracks all planned features, integration points, and improvements.

**Version Target**: 2.0.0 (stable WebSocket release)  
**Current**: 2.0.0-alpha.1

---

## 🎯 Phase 1: Core WebSocket Integration (v2.0.0-alpha)

### 1.1 WebSocket Server Foundation ✅
- [x] Create `LikuWebSocketServer` class
- [x] Implement event-driven architecture with EventEmitter
- [x] Define `GameState`, `AICommand`, `AIResponse` interfaces
- [x] Add client connection/disconnection handling
- [x] Implement `broadcastState()` for real-time updates
- [x] Add command acknowledgment system

### 1.2 WebSocket Client Library ✅
- [x] Create `LikuAIClient` class for AI agents
- [x] Implement `sendKey()`, `sendAction()`, `query()` methods
- [x] Add auto-reconnection with configurable interval
- [x] Add pending request tracking with timeouts
- [x] Export types for TypeScript consumers

### 1.3 Game State Integration ✅
- [x] Modify `GameStateLogger.ts` to also broadcast via WebSocket
- [x] Create unified state object that works for both file and WebSocket
- [x] Add WebSocket server startup to `src/index.tsx`
- [x] Handle graceful shutdown of WebSocket server on exit
- [x] Add `--no-websocket` CLI flag for legacy mode

### 1.4 Command Handler Integration ✅
- [x] Create `CommandRouter` to map WebSocket commands to game actions
- [x] Integrate with `useInput` hook in game components
- [x] Add synthetic key event generation for WebSocket commands
- [x] Support both key-level and action-level commands
- [x] Add rate limiting for command spam protection

---

## 🎯 Phase 2: Enhanced AI Tools (v2.0.0-beta)

### 2.1 Structured Game State ✅
- [x] Define per-game state schemas (Dino, Snake, TicTacToe)
- [x] Add obstacle prediction data to Dino state
- [x] Add pathfinding hints to Snake state
- [x] Add minimax evaluation to TicTacToe state
- [x] Include game-specific decision recommendations

### 2.2 AI Action API ✅
- [x] Create high-level action vocabulary:
  - `jump`, `duck` (Dino)
  - `turn_left`, `turn_right`, `go_straight` (Snake)
  - `place_mark`, `undo` (TicTacToe)
- [x] Map actions to key sequences
- [x] Add action validation (is action valid in current state?)
- [x] Return action results in response

### 2.3 Query System ✅
- [x] Implement query handlers for:
  - `gameState` - Full current state
  - `possibleActions` - Valid actions now
  - `history` - Recent game events
  - `stats` - Player statistics
  - `leaderboard` - High scores
- [x] Add query result caching for performance
- [x] Support query subscriptions (continuous updates)

### 2.4 Event Streaming ✅
- [x] Add event types:
  - `game:start`, `game:end`, `game:pause`
  - `score:update`, `level:up`
  - `collision`, `powerup`, `obstacle:spawn`
- [x] Allow clients to subscribe to specific event types
- [x] Include event timestamps for replay synchronization

---

## 🎯 Phase 3: Multi-Agent Support (v2.0.0-rc)

### 3.1 Agent Identity ✅ Complete
- [x] Add agent authentication/identification on connect
- [x] Assign unique agent IDs
- [x] Track agent metrics (commands sent, latency)
- [x] Support agent metadata (name, type, version)
- [x] Implement AgentRole system (player, spectator, admin, trainer)
- [x] Add permission checking per role
- [x] Session management with activity tracking
- [x] 32 tests for agent system

### 3.2 Concurrent Agent Management ✅ Complete
- [x] Define turn-taking protocol for multiple agents
- [x] Add agent priority system
- [x] Implement command queuing with fairness
- [x] Add spectator mode (receive state, no commands)
- [x] Support multiple turn modes (FREE, ROUND_ROBIN, PRIORITY, TIMED, COOPERATIVE)
- [x] 25 tests for turn management

### 3.3 Agent Coordination Protocol ✅ Complete
- [x] Define inter-agent messaging format
- [x] Add broadcast vs direct message support
- [x] Create coordination primitives (lock, sync, barrier)
- [x] Support collaborative game modes (teams, shared state)
- [x] Topic-based pub/sub subscriptions
- [x] Request/response messaging pattern
- [x] Optimistic concurrency for shared state
- [x] 28 tests for coordination system

### 3.4 AI-vs-AI Game Sessions ✅ Complete
- [x] Create GameSessionManager for multi-player game sessions
- [x] Implement player slot assignment (X/O for TicTacToe, white/black for Chess)
- [x] Add session-scoped turn management
- [x] Integrate with router (game:create, game:join, game:move, game:forfeit actions)
- [x] Extend TicTacToe with `mode: 'local' | 'websocket' | 'spectate'` prop
- [x] Add minimax hints for AI agents (`getStateForAgent()`)
- [x] Server broadcasts session events (turnChanged, moveMade, gameEnded)
- [x] Export session types and manager from index.ts
- [x] 32 tests for session system

---

## 🎯 Phase 4: Training & Analytics (v2.1.0) ✅ Complete

### 4.1 Training Data Export ✅
- [x] Record game sessions with full state history (SessionRecorder)
- [x] Export in common ML formats (JSON, CSV, TFRecord, JSONL)
- [x] Include action-reward pairs for RL training
- [x] Add session metadata (agent, difficulty, outcome)
- [x] State observation normalizers for TicTacToe, Snake, Dino

### 4.2 Replay System ✅
- [x] ReplayEngine with session loading and playback
- [x] Implement replay playback via WebSocket events
- [x] Add seek/pause/speed controls (0.25x to 4x)
- [x] Frame stepping (forward/backward)
- [x] ReplayController for multi-replay synchronization
- [x] Clip creation from frame ranges

### 4.3 Performance Analytics ✅
- [x] AnalyticsEngine with session processing
- [x] Per-agent statistics (wins, losses, draws, win rate)
- [x] Elo rating system with K-factor and rating history
- [x] Agent comparison (head-to-head, strengths, matchups)
- [x] Move timing analysis and distribution
- [x] Global stats (total games, AI vs AI count, games by hour)
- [x] Data export/import for analytics state

### 4.4 A/B Testing Framework ✅
- [x] ABTestFramework with experiment creation
- [x] Support multiple AI strategies simultaneously
- [x] Weighted variant assignment
- [x] Sample recording per variant
- [x] Statistical significance calculation (chi-squared)
- [x] Experiment lifecycle (draft, running, paused, completed)
- [x] Strategy performance comparison with recommendations
- [x] 93 tests for training module

---

## 🎯 Phase 5: Remote Play (v2.2.0)

### 5.1 Spectator Mode ✅ Complete
- [x] StateDiffer - JSON Patch RFC 6902 for efficient state updates
- [x] SpectatorManager - Session management with quality tiers (high/medium/low)
- [x] ChatManager - Real-time chat with moderation, reactions, rate limiting
- [x] ChatPanel.tsx - Full chat UI with message display, reactions, input
- [x] SpectatorBar.tsx - Spectator count, quality selector, quick reactions
- [x] Game-specific spectator limits (Snake:100, TicTacToe:50, etc.)
- [x] 93 tests for spectator module

### 5.2 Cloud Deployment ✅ Complete
- [x] Dockerfile - Multi-stage build with Node.js 20 Alpine
- [x] docker-compose.yml - Local dev with Redis for session storage
- [x] Kubernetes manifests - Namespace, ConfigMap, Deployment, Service, HPA, Ingress
- [x] Health endpoints - /health, /ready, /live, /metrics (Prometheus format)
- [x] Horizontal Pod Autoscaler - Scale 2-10 pods based on CPU/memory
- [x] WebSocket sticky sessions via Ingress annotations

### 5.3 Network Security ✅ Complete
- [x] Add secure WebSocket (wss://) support via TLS configuration
- [x] Implement JWT authentication tokens with HMAC signing
- [x] Add connection encryption (TLS 1.2/1.3 with secure cipher suites)
- [x] Support NAT traversal / TURN servers (ICE candidate handling, signaling)
- [x] SecurityManager - TLS config, JWT generation/validation, token refresh
- [x] TURNManager - ICE servers, time-limited credentials, peer connections
- [x] 83 tests for security and TURN modules

---

## 🎯 Phase 6: Chess Engine (v2.3.0) ✅ Complete

### 6.1 Core Chess Engine ✅
- [x] Install chess.js for move generation and validation
- [x] Create ChessEngine wrapper with state tracking
- [x] Define comprehensive TypeScript types (Color, PieceType, Square, Move, ChessState)
- [x] Implement position hashing for repetition detection
- [x] Track captured pieces and game history

### 6.2 Position Evaluation ✅
- [x] Material evaluation with standard centipawn values
- [x] Piece-square tables for opening, middlegame, and endgame
- [x] Tapered evaluation (0-256 scale blending phases)
- [x] Pawn structure evaluation (doubled, isolated, passed pawns)
- [x] Mobility scoring for all piece types
- [x] King safety with pawn shield and tropism
- [x] Bishop pair bonus, rook on open file bonus

### 6.3 Search Algorithm ✅
- [x] Alpha-beta pruning with fail-soft
- [x] Iterative deepening with configurable depth
- [x] Quiescence search for tactical stability
- [x] Transposition table with Zobrist hashing
- [x] MVV-LVA move ordering
- [x] Killer move heuristic (2 killers per ply)
- [x] History heuristic for quiet move ordering
- [x] Null move pruning with R=3 reduction
- [x] Late move reductions (LMR)
- [x] Principal variation search (PVS)
- [x] Aspiration windows for faster cutoffs
- [x] Check extensions

### 6.4 AI Player Integration ✅
- [x] ChessAI class orchestrating evaluation, search, opening book
- [x] Gemini API integration for move explanation
- [x] Difficulty presets (beginner/intermediate/advanced/grandmaster)
- [x] Time-based search termination
- [x] ChessAIMatch for AI vs AI battles

### 6.5 Opening Book ✅
- [x] 20+ named openings (Italian, Ruy Lopez, Sicilian variants, French, Caro-Kann, etc.)
- [x] Weighted move selection for variety
- [x] Opening name detection from move sequence

### 6.6 WebSocket Integration ✅
- [x] Chess actions in router (chess_move, chess_resign, chess_draw_offer, etc.)
- [x] Session manager support for chess game type
- [x] Chess events (chessMove, chessResign, chessDrawOffer, etc.)

### 6.7 Terminal UI ✅
- [x] Chess.tsx Ink component with Unicode board display
- [x] Chalk-based single-string row rendering for alignment
- [x] Move input with SAN notation (e4, Nf3, O-O)
- [x] Cursor-based movement (arrow keys + Enter)
- [x] AI difficulty selection (beginner to grandmaster)
- [x] Game controls (undo, resign, draw, hint, flip)
- [x] Evaluation display and captured pieces
- [x] Visual highlights (cursor, selected, legal moves, last move)

### 6.8 AI Battle Script ✅
- [x] scripts/chess-ai-battle.js for AI vs AI matches
- [x] Configurable difficulty for both sides
- [x] Support Gemini vs Minimax
- [x] PGN export for game analysis
- [x] Match statistics and summary

---

## 🎯 Phase 7: Chess Engine Performance Optimization (v2.4.0)

### 7.1 Benchmark Suite ✅
- [x] Create `scripts/benchmark.ts` with comprehensive test positions
- [x] Tactical puzzles (15 positions: forks, pins, skewers, mate threats)
- [x] Perft validation for move generation correctness
- [x] NPS (nodes per second) measurement
- [x] Metrics: depth reached, TT hit rate, pruning efficiency

### 7.2 Performance Analysis ✅
- [x] Profile chess.js operations (~44μs per `moves()` call, ~23μs per `isDraw()`)
- [x] Identify bottleneck: chess.js legal move generation
- [x] Current performance: ~32-150 NPS (chess.js limited)
- [x] Comparison: C++ engines achieve 50,000-500,000+ NPS

### 7.3 Alternative Chess Libraries (Research Complete)
- [ ] **chessops** - Lichess's TypeScript library with bitboard implementation
  - Uses Hyperbola Quintessence for sliding pieces (faster than Magic Bitboards)
  - SquareSet implemented as bitboards for efficient operations
  - Supports Chess960 and 7 variants
  - GPL-3.0 license, actively maintained
- [ ] **stockfish.wasm** - WebAssembly Stockfish for professional analysis
  - ~400KB total size, multi-threaded with SharedArrayBuffer
  - Requires COOP/COEP headers for browser use
  - Can be used as analysis backend while keeping custom search
- [ ] **Custom Move Generator** - For maximum performance
  - Implement 0x88 board representation
  - Bitboard attack tables for sliding pieces
  - Staged move generation (hash → captures → killers → quiet)

### 7.4 Migration Path Options

#### Option A: chessops Migration (Recommended for 2-3x speedup)
```typescript
// Replace chess.js with chessops
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';

// Benefits:
// - Bitboard-based move generation
// - Faster legal move checking
// - Native TypeScript with good types
// - Used by Lichess (battle-tested)
```

#### Option B: Hybrid Stockfish Analysis (For professional strength)
```typescript
// Use stockfish.wasm for deep analysis
const Stockfish = require('stockfish.wasm');
const sf = await Stockfish();
sf.postMessage('uci');
sf.postMessage(`position fen ${fen}`);
sf.postMessage('go depth 20');
```

#### Option C: Custom Engine (Maximum performance, high effort)
- Implement own bitboard representation
- Use WASM for hot paths
- Target: 100,000+ NPS

### 7.5 Planned Improvements
- [ ] Evaluate chessops as chess.js replacement
- [ ] Add optional Stockfish.wasm for analysis mode
- [ ] Implement SEE (Static Exchange Evaluation) for better capture ordering
- [ ] Add futility pruning margins tuning
- [ ] Consider WASM compilation for evaluator
- [ ] Add NNUE-style evaluation (future)

### 7.6 Self-Play Training Loop ✅
- [x] Generate training data from self-play games (`scripts/self-play.ts`)
- [x] Implement game result collection with move timing
- [x] Export training data for ML evaluation tuning (JSONL format)
- [x] Elo estimation from self-play results (`scripts/elo-estimate.ts`)
- [x] Asymmetric depth support (--white-depth, --black-depth, --depth-range)

### 7.7 Critical Bug Fix (v2.3.1) ✅
- [x] Fixed `ChessEvaluator.evaluateFromChess()` corrupting caller's chess instance
- [x] Root cause: Evaluator's mobility calculation called `this.chess.load()` on external instance
- [x] Solution: Copy FEN to internal instance instead of using external reference directly

---

## 🐛 Known Issues & Technical Debt

### High Priority
- [x] PowerShell script escaping needs hardening
- [x] File polling and WebSocket should share state format
- [x] Need comprehensive error handling in WebSocket server

### Medium Priority
- [x] Add unit tests for WebSocket module
- [x] Document WebSocket protocol formally (`docs/WEBSOCKET_PROTOCOL.md`)
- [x] Add connection health monitoring (heartbeat)
- [x] Implement backpressure for slow clients (rate limiting)

### Low Priority
- [ ] Consider Socket.io as alternative to raw ws _(prototype compatibility layer without regressing existing `ws` API or breaking `LikuWebSocketClient`)_ → **SKIP** (see [LOW_PRIORITY_EVALUATION.md](docs/LOW_PRIORITY_EVALUATION.md))
- [ ] Add WebSocket compression (permessage-deflate) _(negotiate `permessage-deflate` without increasing latency for low-bandwidth games)_ → **DEFER** (see [LOW_PRIORITY_EVALUATION.md](docs/LOW_PRIORITY_EVALUATION.md))
- [x] Profile memory usage with many connections ✅ **COMPLETE** - Tested 100/500/1000 connections with EXCELLENT results (see [PERFORMANCE.md](docs/PERFORMANCE.md))
- [x] Add metrics/tracing integration (Prometheus format)

---

## 📁 File Structure (Current)

```
src/
├── websocket/
│   ├── server.ts          ✅ WebSocket server with TLS, JWT, health endpoints
│   ├── client.ts          ✅ AI agent client with heartbeat, exponential backoff
│   ├── index.ts           ✅ Module exports
│   ├── router.ts          ✅ Command routing with rate limiting + chess actions
│   ├── state.ts           ✅ Unified state management, game-specific schemas
│   ├── protocol.ts        ✅ Protocol constants, validation, error codes
│   ├── queries.ts         ✅ Query handlers with caching
│   ├── events.ts          ✅ Event streaming with filters
│   ├── agents.ts          ✅ Agent identity, roles, sessions, metrics
│   ├── turns.ts           ✅ Turn management (5 modes: FREE, ROUND_ROBIN, etc.)
│   ├── coordination.ts    ✅ Inter-agent messaging, locks, barriers, teams
│   ├── sessions.ts        ✅ Game sessions for AI-vs-AI multiplayer
│   ├── differ.ts          ✅ JSON Patch RFC 6902 state diffing
│   ├── spectator.ts       ✅ SpectatorManager with quality tiers
│   ├── chat.ts            ✅ ChatManager with moderation, reactions
│   ├── security.ts        ✅ TLS/WSS config, JWT auth, token validation
│   └── turn.ts            ✅ TURN/STUN NAT traversal, ICE signaling
├── chess/
│   ├── index.ts           ✅ Module exports
│   ├── types.ts           ✅ TypeScript types (Color, PieceType, Square, Move, etc.)
│   ├── ChessEngine.ts     ✅ chess.js wrapper with state tracking
│   ├── ChessEvaluator.ts  ✅ Position evaluation (material, PST, pawn, mobility)
│   ├── ChessSearch.ts     ✅ Alpha-beta search with all modern enhancements
│   ├── ChessAI.ts         ✅ AI player with Gemini integration, difficulty levels
│   └── ChessOpenings.ts   ✅ Opening book with 20+ named openings
├── training/
│   ├── index.ts           ✅ Module exports
│   ├── recorder.ts        ✅ SessionRecorder for game session recording
│   ├── exporter.ts        ✅ DataExporter (JSON, CSV, TFRecord, JSONL)
│   ├── replay.ts          ✅ ReplayEngine with playback controls
│   ├── analytics.ts       ✅ AnalyticsEngine with Elo ratings, agent stats
│   └── abtesting.ts       ✅ ABTestFramework for AI strategy comparison
├── ui/
│   ├── components/
│   │   ├── index.ts       ✅ Component exports
│   │   ├── ChatPanel.tsx  ✅ Chat UI with messages, reactions, input
│   │   └── SpectatorBar.tsx ✅ Spectator count, quality, quick reactions
│   └── games/
│       ├── Snake.tsx      ✅ Uses createSnakeState()
│       ├── DinoRun.tsx    ✅ Uses createDinoState()
│       ├── TicTacToe.tsx  ✅ Uses createTicTacToeState() + WebSocket mode
│       └── Chess.tsx      ✅ Full chess UI with AI opponent, board display
├── core/
│   ├── GameStateLogger.ts ✅ Broadcasts via WebSocket + file
│   └── ...
scripts/
├── chess-ai-battle.js     ✅ AI vs AI chess matches with configurable difficulty
k8s/                       ✅ Kubernetes deployment manifests
├── namespace.yaml         ✅ liku-ai namespace
├── configmap.yaml         ✅ Application configuration
├── deployment.yaml        ✅ Main app deployment with probes
├── service.yaml           ✅ ClusterIP + headless services
├── hpa.yaml               ✅ Horizontal Pod Autoscaler (2-10 pods)
├── redis.yaml             ✅ Redis for session storage
├── ingress.yaml           ✅ NGINX Ingress with WebSocket support
└── kustomization.yaml     ✅ Kustomize configuration
Dockerfile                 ✅ Multi-stage production build
Dockerfile.dev             ✅ Development build with hot reload
docker-compose.yml         ✅ Local dev stack with Redis
.dockerignore              ✅ Docker build exclusions
│   └── ...
└── ...existing files...
```

---

## 🔧 Configuration Options (Planned)

```typescript
interface LikuAIConfig {
  websocket: {
    enabled: boolean;       // Enable WebSocket server
    port: number;           // Default: 3847
    maxClients: number;     // Max concurrent connections
    rateLimit: number;      // Commands per second per client
  };
  state: {
    broadcastInterval: number;  // ms between state broadcasts
    includeRawFrame: boolean;   // Include ASCII game frame
    compressState: boolean;     // Use msgpack/compression
  };
  training: {
    recordSessions: boolean;    // Save training data
    exportFormat: 'json' | 'csv' | 'tfrecord';
    replayRetention: number;    // Days to keep replays
  };
}
```

---

## 📋 Migration Guide (from LikuBuddy)

### For Users
1. Install Liku-AI: `npm install liku-ai`
2. All existing features work unchanged
3. WebSocket server starts automatically on port 3847
4. Use `--no-websocket` flag to disable

### For AI Developers
1. Replace file polling with WebSocket client
2. Connect to `ws://localhost:3847`
3. Receive state via `state` events
4. Send commands via `key`/`action` messages

### Breaking Changes
- Package name: `gemini-cli-liku-extension` → `liku-ai`
- Minimum Node.js: 18.x → 20.x (for WebSocket improvements)

---

## 📊 Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| State Latency | <5ms | ✅ ~1ms |
| Command Latency | <10ms | ✅ ~2ms |
| Concurrent Clients | 100+ | ✅ 1000 (tested) |
| Memory per Client | <1MB | ✅ ~10KB |
| Test Coverage | >80% | ✅ ~95% (514 tests) |

---

## 🗓️ Timeline

| Phase | Target Date | Status |
|-------|-------------|--------|
| Alpha (WebSocket Core) | Dec 2024 | ✅ Complete |
| Beta (AI Tools) | Jan 2025 | ✅ Complete |
| RC (Multi-Agent) | Feb 2025 | ✅ Complete |
| 2.0.0 Stable | Mar 2025 | 🔲 Not Started |
| 2.1.0 Training | Q2 2025 | ✅ Complete |
| 2.2.0 Remote (5.1-5.3) | Q3 2025 | ✅ Complete |
| 2.3.0 Chess Engine | Q3 2025 | ✅ Complete |
| 2.4.0 Chess Optimization | Q1 2026 | 🔲 Planned |

---

*Last Updated: December 2025*
