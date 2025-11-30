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

### 1.3 Game State Integration 🔲
- [ ] Modify `GameStateLogger.ts` to also broadcast via WebSocket
- [ ] Create unified state object that works for both file and WebSocket
- [ ] Add WebSocket server startup to `src/index.tsx`
- [ ] Handle graceful shutdown of WebSocket server on exit
- [ ] Add `--no-websocket` CLI flag for legacy mode

### 1.4 Command Handler Integration 🔲
- [ ] Create `CommandRouter` to map WebSocket commands to game actions
- [ ] Integrate with `useInput` hook in game components
- [ ] Add synthetic key event generation for WebSocket commands
- [ ] Support both key-level and action-level commands
- [ ] Add rate limiting for command spam protection

---

## 🎯 Phase 2: Enhanced AI Tools (v2.0.0-beta)

### 2.1 Structured Game State 🔲
- [ ] Define per-game state schemas (Dino, Snake, TicTacToe)
- [ ] Add obstacle prediction data to Dino state
- [ ] Add pathfinding hints to Snake state
- [ ] Add minimax evaluation to TicTacToe state
- [ ] Include game-specific decision recommendations

### 2.2 AI Action API 🔲
- [ ] Create high-level action vocabulary:
  - `jump`, `duck` (Dino)
  - `turn_left`, `turn_right`, `go_straight` (Snake)
  - `place_mark`, `undo` (TicTacToe)
- [ ] Map actions to key sequences
- [ ] Add action validation (is action valid in current state?)
- [ ] Return action results in response

### 2.3 Query System 🔲
- [ ] Implement query handlers for:
  - `gameState` - Full current state
  - `possibleActions` - Valid actions now
  - `history` - Recent game events
  - `stats` - Player statistics
  - `leaderboard` - High scores
- [ ] Add query result caching for performance
- [ ] Support query subscriptions (continuous updates)

### 2.4 Event Streaming 🔲
- [ ] Add event types:
  - `game:start`, `game:end`, `game:pause`
  - `score:update`, `level:up`
  - `collision`, `powerup`, `obstacle:spawn`
- [ ] Allow clients to subscribe to specific event types
- [ ] Include event timestamps for replay synchronization

---

## 🎯 Phase 3: Multi-Agent Support (v2.0.0-rc)

### 3.1 Agent Identity 🔲
- [ ] Add agent authentication/identification on connect
- [ ] Assign unique agent IDs
- [ ] Track agent metrics (commands sent, latency)
- [ ] Support agent metadata (name, type, version)

### 3.2 Concurrent Agent Management 🔲
- [ ] Define turn-taking protocol for multiple agents
- [ ] Add agent priority system
- [ ] Implement command queuing with fairness
- [ ] Add spectator mode (receive state, no commands)

### 3.3 Agent Coordination Protocol 🔲
- [ ] Define inter-agent messaging format
- [ ] Add broadcast vs direct message support
- [ ] Create coordination primitives (lock, sync, barrier)
- [ ] Support collaborative game modes

---

## 🎯 Phase 4: Training & Analytics (v2.1.0)

### 4.1 Training Data Export 🔲
- [ ] Record game sessions with full state history
- [ ] Export in common ML formats (JSON, CSV, TFRecord)
- [ ] Include action-reward pairs for RL training
- [ ] Add session metadata (agent, difficulty, outcome)

### 4.2 Replay System 🔲
- [ ] Store game replays in SQLite
- [ ] Implement replay playback via WebSocket
- [ ] Add seek/pause/speed controls
- [ ] Support replay annotation

### 4.3 Performance Analytics 🔲
- [ ] Track per-agent performance metrics
- [ ] Generate skill progression graphs
- [ ] Compare human vs AI performance
- [ ] Export analytics to dashboard

### 4.4 A/B Testing Framework 🔲
- [ ] Support multiple AI strategies simultaneously
- [ ] Random assignment to strategy groups
- [ ] Statistical significance calculation
- [ ] Strategy performance comparison

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
- [ ] PowerShell script escaping needs hardening
- [ ] File polling and WebSocket should share state format
- [ ] Need comprehensive error handling in WebSocket server

### Medium Priority
- [ ] Add unit tests for WebSocket module
- [ ] Document WebSocket protocol formally
- [ ] Add connection health monitoring
- [ ] Implement backpressure for slow clients

### Low Priority
- [ ] Consider Socket.io as alternative to raw ws
- [ ] Add WebSocket compression (permessage-deflate)
- [ ] Profile memory usage with many connections
- [ ] Add metrics/tracing integration

---

## 📁 File Structure (Planned)

```
src/
├── websocket/
│   ├── server.ts          ✅ WebSocket server
│   ├── client.ts          ✅ AI agent client library
│   ├── index.ts           ✅ Module exports
│   ├── router.ts          🔲 Command routing
│   ├── state.ts           🔲 Unified state management
│   ├── events.ts          🔲 Event definitions
│   └── protocol.ts        🔲 Protocol constants
├── ai/
│   ├── actions.ts         🔲 High-level action definitions
│   ├── queries.ts         🔲 Query handlers
│   └── training.ts        🔲 Training data export
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
| State Latency | <5ms | TBD |
| Command Latency | <10ms | TBD |
| Concurrent Clients | 100+ | TBD |
| Memory per Client | <1MB | TBD |
| Test Coverage | >80% | 0% |

---

## 🗓️ Timeline

| Phase | Target Date | Status |
|-------|-------------|--------|
| Alpha (WebSocket Core) | Dec 2024 | 🟡 In Progress |
| Beta (AI Tools) | Jan 2025 | 🔲 Not Started |
| RC (Multi-Agent) | Feb 2025 | 🔲 Not Started |
| 2.0.0 Stable | Mar 2025 | 🔲 Not Started |
| 2.1.0 Training | Q2 2025 | 🔲 Not Started |
| 2.2.0 Remote | Q3 2025 | 🔲 Not Started |

---

*Last Updated: November 30, 2024*
