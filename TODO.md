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

### 5.1 Network Play 🔲
- [ ] Add secure WebSocket (wss://) support
- [ ] Implement authentication tokens
- [ ] Add connection encryption
- [ ] Support NAT traversal / TURN servers

### 5.2 Cloud Deployment 🔲
- [ ] Create Docker container
- [ ] Add Kubernetes deployment manifests
- [ ] Support horizontal scaling
- [ ] Add load balancing

### 5.3 Spectator Mode 🔲
- [ ] Read-only WebSocket connections
- [ ] Efficient state diffing for bandwidth
- [ ] Support many concurrent spectators
- [ ] Add latency-based quality adjustment

---

## 🐛 Known Issues & Technical Debt

### High Priority
- [x] PowerShell script escaping needs hardening
- [x] File polling and WebSocket should share state format
- [x] Need comprehensive error handling in WebSocket server

### Medium Priority
- [x] Add unit tests for WebSocket module
- [ ] Document WebSocket protocol formally
- [x] Add connection health monitoring (heartbeat)
- [x] Implement backpressure for slow clients (rate limiting)

### Low Priority
- [ ] Consider Socket.io as alternative to raw ws
- [ ] Add WebSocket compression (permessage-deflate)
- [ ] Profile memory usage with many connections
- [ ] Add metrics/tracing integration

---

## 📁 File Structure (Current)

```
src/
├── websocket/
│   ├── server.ts          ✅ WebSocket server with heartbeat, client tracking
│   ├── client.ts          ✅ AI agent client with heartbeat, exponential backoff
│   ├── index.ts           ✅ Module exports
│   ├── router.ts          ✅ Command routing with rate limiting
│   ├── state.ts           ✅ Unified state management, game-specific schemas
│   ├── protocol.ts        ✅ Protocol constants, validation, error codes
│   ├── queries.ts         ✅ Query handlers with caching
│   ├── events.ts          ✅ Event streaming with filters
│   ├── agents.ts          ✅ Agent identity, roles, sessions, metrics
│   ├── turns.ts           ✅ Turn management (5 modes: FREE, ROUND_ROBIN, etc.)
│   ├── coordination.ts    ✅ Inter-agent messaging, locks, barriers, teams
│   └── sessions.ts        ✅ Game sessions for AI-vs-AI multiplayer
├── training/
│   ├── index.ts           ✅ Module exports
│   ├── recorder.ts        ✅ SessionRecorder for game session recording
│   ├── exporter.ts        ✅ DataExporter (JSON, CSV, TFRecord, JSONL)
│   ├── replay.ts          ✅ ReplayEngine with playback controls
│   ├── analytics.ts       ✅ AnalyticsEngine with Elo ratings, agent stats
│   └── abtesting.ts       ✅ ABTestFramework for AI strategy comparison
├── ai/
│   ├── actions.ts         🔲 High-level action definitions (future)
│   └── queries.ts         🔲 Query handlers (merged into websocket/queries.ts)
├── core/
│   ├── GameStateLogger.ts ✅ Broadcasts via WebSocket + file
│   └── ...
├── ui/games/
│   ├── Snake.tsx          ✅ Uses createSnakeState()
│   ├── DinoRun.tsx        ✅ Uses createDinoState()
│   ├── TicTacToe.tsx      ✅ Uses createTicTacToeState() + WebSocket mode
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
| Concurrent Clients | 100+ | TBD |
| Memory per Client | <1MB | TBD |
| Test Coverage | >80% | ✅ ~95% (300 tests) |

---

## 🗓️ Timeline

| Phase | Target Date | Status |
|-------|-------------|--------|
| Alpha (WebSocket Core) | Dec 2024 | ✅ Complete |
| Beta (AI Tools) | Jan 2025 | ✅ Complete |
| RC (Multi-Agent) | Feb 2025 | ✅ Complete |
| 2.0.0 Stable | Mar 2025 | 🔲 Not Started |
| 2.1.0 Training | Q2 2025 | ✅ Complete |
| 2.2.0 Remote | Q3 2025 | 🔲 Not Started |

---

*Last Updated: December 1, 2025*
