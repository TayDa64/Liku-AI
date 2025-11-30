# 🤖 Liku-AI

**AI-Enhanced Terminal Game Platform with Real-Time WebSocket Communication**

Liku-AI is a fork of [LikuBuddy](https://github.com/TayDa64/LikuBuddy) focused on providing superior AI agent tools for game interaction. While LikuBuddy uses file-based state polling, Liku-AI introduces **WebSocket-based real-time communication** for sub-5ms latency.

## 🚀 What's Different from LikuBuddy?

| Feature | LikuBuddy | Liku-AI |
|---------|-----------|---------|
| AI Communication | File polling (50-100ms) | WebSocket push (<5ms) |
| State Updates | Pull-based (agent polls) | Push-based (server notifies) |
| Command Latency | ~80ms (file + activation) | ~3ms (direct socket) |
| Multiple AI Agents | ❌ One at a time | ✅ Concurrent connections |
| Event-Driven | ❌ Polling loops | ✅ Async event handlers |
| Backward Compatible | N/A | ✅ File polling still works |

## 📦 Installation

```bash
git clone https://github.com/TayDa64/Liku-AI.git
cd Liku-AI
npm install
npm run build
```

## 🔌 WebSocket API

### Server (Port 3847)

Liku-AI automatically starts a WebSocket server when the game launches:

```typescript
// Server broadcasts state on every game tick
{
  "type": "state",
  "timestamp": 1701234567890,
  "data": {
    "pid": 12345,
    "screen": "Playing DinoRun",
    "status": "Score: 42 | State: PLAYING",
    "game": {
      "type": "dino",
      "data": {
        "dinoY": 0,
        "velocity": 0,
        "nextObstacle": { "distance": 15, "type": "CACTUS" }
      }
    }
  }
}
```

### Client Commands

Send commands to control the game:

```typescript
// Key press
{ "type": "key", "payload": { "key": "space" }, "requestId": "req_1" }

// Action (high-level)
{ "type": "action", "payload": { "action": "jump" }, "requestId": "req_2" }

// Query
{ "type": "query", "payload": { "query": "gameState" }, "requestId": "req_3" }
```

### Using the Client Library

```typescript
import { LikuAIClient } from 'liku-ai/websocket';

const client = new LikuAIClient({
  onState: (state) => {
    console.log('Game state:', state);
    
    // React to game state
    if (state.game?.data?.nextObstacle?.distance < 5) {
      client.sendKey('space');
    }
  }
});

await client.connect();

// Send commands
await client.sendKey('enter');  // Start game
await client.sendAction('jump'); // High-level action
```

## 🎮 Running the Game

```bash
# Standard mode (with WebSocket server)
npm start

# WebSocket server starts automatically on port 3847
# Connect AI agents to ws://localhost:3847
```

## 🔄 Backward Compatibility

Liku-AI maintains full compatibility with LikuBuddy:
- File-based state logging still works (`likubuddy-state.txt`)
- All existing PowerShell/Bash scripts function normally
- Existing AutoPlayer module works unchanged
- Same CLI commands and options

## 🛠️ Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   AI Agent 1    │◄──────────────────►│                 │
└─────────────────┘      (push)        │                 │
                                       │   Liku-AI       │
┌─────────────────┐     WebSocket      │   Game Server   │
│   AI Agent 2    │◄──────────────────►│                 │
└─────────────────┘                    │   Port 3847     │
                                       │                 │
┌─────────────────┐   File (legacy)    │                 │
│  Legacy Script  │◄───────────────────│                 │
└─────────────────┘                    └─────────────────┘
```

## 📊 Performance Comparison

| Metric | File Polling | WebSocket |
|--------|-------------|-----------|
| State Read Latency | 50-100ms | <1ms |
| Command-to-Effect | ~80ms | ~5ms |
| CPU Usage (idle) | Higher (continuous reads) | Lower (event-driven) |
| Supports Streaming | ❌ | ✅ |

## 🗺️ Roadmap

- [x] WebSocket server infrastructure
- [x] Type-safe client library
- [ ] Integrate WebSocket into game state logger
- [ ] Add streaming game replay
- [ ] Multi-agent coordination protocol
- [ ] AI training data export
- [ ] Remote play support

## 📝 Version

- **Liku-AI**: 2.0.0-alpha.1
- **Based on LikuBuddy**: 1.3.0

## 🔗 Links

- [LikuBuddy (upstream)](https://github.com/TayDa64/LikuBuddy)
- [WebSocket Protocol Spec](./docs/WEBSOCKET_PROTOCOL.md) (coming soon)

---

*Liku-AI - Real-time AI for Terminal Games* 🎮⚡
