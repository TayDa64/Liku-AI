<div align="center">

```
██╗     ██╗██╗  ██╗██╗   ██╗       █████╗ ██╗
██║     ██║██║ ██╔╝██║   ██║      ██╔══██╗██║
██║     ██║█████╔╝ ██║   ██║█████╗███████║██║
██║     ██║██╔═██╗ ██║   ██║╚════╝██╔══██║██║
███████╗██║██║  ██╗╚██████╔╝      ██║  ██║██║
╚══════╝╚═╝╚═╝  ╚═╝ ╚═════╝       ╚═╝  ╚═╝╚═╝
```

# Liku-AI

**AI-Enhanced Terminal Game Platform with Real-Time WebSocket Communication**

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-514%20passing-brightgreen?logo=vitest)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Quick Start](#-quick-start) •
[Features](#-features) •
[Documentation](#-documentation) •
[API Reference](docs/API_REFERENCE.md) •
[Contributing](#-contributing)

</div>

---

## 🎯 Overview

Liku-AI is a real-time AI agent platform featuring:

- **🎮 Terminal Games** — Chess, Snake, Dino Run, Tic-Tac-Toe, and more
- **🔌 WebSocket API** — Sub-millisecond latency for AI agent control
- **♟️ Chess Engine** — Alpha-beta search with 20+ openings and Elo rating
- **📊 Training Tools** — Session recording, replay, and A/B testing

```
    +---------------------------------------+
    |           LIKU-AI  CHESS              |
    +---------------------------------------+
    |                                       |
    |       a   b   c   d   e   f   g   h   |
    |     +---+---+---+---+---+---+---+---+ |
    |   8 | r | n | b | q | k | b | n | r | |  Black (k)
    |     +---+---+---+---+---+---+---+---+ |  Captured: P
    |   7 | p | p | p | p |   | p | p | p | |
    |     +---+---+---+---+---+---+---+---+ |
    |   6 |   |   |   |   |   |   |   |   | |
    |     +---+---+---+---+---+---+---+---+ |
    |   5 |   |   |   |   | p |   |   |   | |  Eval: +0.35
    |     +---+---+---+---+---+---+---+---+ |
    |   4 |   |   |   |   | P |   |   |   | |
    |     +---+---+---+---+---+---+---+---+ |
    |   3 |   |   |   |   |   | N |   |   | |
    |     +---+---+---+---+---+---+---+---+ |
    |   2 | P | P | P | P |   | P | P | P | |  White (K) to move
    |     +---+---+---+---+---+---+---+---+ |  Captured: p
    |   1 | R | N | B | Q | K | B |   | R | |
    |     +---+---+---+---+---+---+---+---+ |
    |       a   b   c   d   e   f   g   h   |
    |                                       |
    +---------------------------------------+
    | Nf3  |  Italian Game  |  Depth: 6     |
    +---------------------------------------+
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 20.x** or higher
- **npm 10.x** or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/TayDa64/Liku-AI.git
cd Liku-AI

# Install dependencies
npm install

# Build
npm run build

# Run
npm start
```

### First Run

Navigate with **arrow keys**, select with **Enter**, press **Escape** to go back.

```bash
# Start the terminal UI
npm start

# Or start WebSocket server only
npm run server
```

---

## ✨ Features

### 🎮 Terminal Games

| Game | Description | AI Support |
|------|-------------|------------|
| ♟️ **Chess** | Full engine with difficulty levels | ✅ Minimax + Opening Book |
| 🐍 **Snake** | Classic snake with pathfinding hints | ✅ State-based AI |
| 🦖 **Dino Run** | Chrome dinosaur clone | ✅ Obstacle prediction |
| ⭕ **Tic-Tac-Toe** | With minimax AI | ✅ Perfect play AI |
| 📝 **Hangman** | Word guessing | ❌ Human only |
| 🔢 **Sudoku** | Number puzzle | ❌ Human only |

### 🔌 WebSocket API

Real-time bidirectional communication for AI agents:

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant Server as Liku-AI Server
    participant Game as Game Engine
    
    Agent->>Server: Connect (ws://localhost:3847)
    Server->>Agent: Welcome { clientId, capabilities }
    
    loop Game Loop
        Game->>Server: State Update
        Server->>Agent: State { game, state, timestamp }
        Agent->>Server: Action { action: "chess_move", params: { move: "e4" } }
        Server->>Game: Execute Move
        Server->>Agent: Ack { success: true }
    end
```

### ♟️ Chess Engine

```mermaid
flowchart LR
    subgraph Search["Alpha-Beta Search"]
        ID[Iterative Deepening]
        AB[Alpha-Beta Pruning]
        TT[Transposition Table]
        QS[Quiescence Search]
    end
    
    subgraph Eval["Position Evaluation"]
        MAT[Material]
        PST[Piece-Square Tables]
        PAWN[Pawn Structure]
        MOB[Mobility]
        KING[King Safety]
    end
    
    subgraph Book["Opening Book"]
        OB[20+ Named Openings]
    end
    
    FEN[FEN Position] --> Book
    Book -->|First 10-15 moves| MOVE[Best Move]
    FEN --> Search
    Search --> Eval
    Eval --> MOVE
```

**Performance:**

| Depth | NPS | Time | Estimated Elo |
|-------|-----|------|---------------|
| 2 | ~300 | <1s | ~1000 |
| 3 | ~170 | ~2s | ~1200 |
| 4 | ~140 | ~5s | ~1400 |
| 5 | ~100 | ~15s | ~1600 |

### 📊 Training & Analytics

- **Session Recording** — Capture every frame, action, and reward
- **Multi-format Export** — JSON, CSV, TFRecord, JSONL
- **Elo Rating System** — Track agent skill progression
- **A/B Testing** — Compare AI strategies with statistical significance
- **Self-Play** — Generate training data from AI vs AI games

---

## 🎮 Usage

### Terminal UI

```bash
npm start
```

**Key Commands:**

| Key | Action |
|-----|--------|
| `↑` `↓` `←` `→` | Navigate / Move |
| `Enter` | Select / Confirm |
| `Escape` | Back / Exit |
| `Space` | Jump (Dino) |
| `h` | Hint (Chess) |
| `u` | Undo (Chess) |
| `r` | Resign (Chess) |

### WebSocket Client

```typescript
import { LikuAIClient } from 'liku-ai';

const client = new LikuAIClient('ws://localhost:3847');

// Receive game state
client.on('state', (state) => {
  console.log('Current state:', state);
});

// Send commands
client.sendAction('chess_move', { move: 'e4' });

// Query data
const stats = await client.query('stats');
```

### Chess AI Battle

```bash
# AI vs AI chess match
node scripts/chess-ai-battle.js --white=minimax --black=minimax --depth=4

# Self-play training data generation
npx tsx scripts/self-play.ts --games 20 --depth-range 2-4

# Estimate Elo from games
npx tsx scripts/elo-estimate.ts --verbose
```

### CLI Commands

```bash
# Available commands
npm start           # Terminal UI
npm run server      # WebSocket server only
npm run agent       # Agent info tool
npm run autoplay    # Auto-play games

# Development
npm run dev         # Watch mode
npm test            # Run tests
npm run build       # Compile TypeScript
```

---

## 📊 Performance

| Metric | Value | Notes |
|--------|-------|-------|
| WebSocket Latency | **~1ms** | State broadcast |
| Command Latency | **~2ms** | Action → Response |
| Concurrent Clients | **1000+** | Load tested |
| Memory per Client | **~10KB** | Efficient |
| Chess NPS | **100-300** | chess.js limited |
| Test Coverage | **95%+** | 514 tests |

---

## 🏗️ Architecture

```mermaid
graph TB
    subgraph Client["AI Agents / Users"]
        A1[Agent 1]
        A2[Agent 2]
        UI[Terminal UI]
    end
    
    subgraph Server["Liku-AI Server"]
        WS[WebSocket Server<br/>Port 3847]
        RT[Command Router]
        SM[Session Manager]
        ST[State Manager]
    end
    
    subgraph Games["Game Engines"]
        CH[Chess Engine]
        SN[Snake]
        DN[Dino Run]
        TT[Tic-Tac-Toe]
    end
    
    subgraph Data["Training & Analytics"]
        REC[Session Recorder]
        AN[Analytics Engine]
        EXP[Data Exporter]
    end
    
    A1 & A2 -->|WebSocket| WS
    UI -->|Direct| Games
    WS --> RT
    RT --> SM
    SM --> ST
    ST --> Games
    Games --> REC
    REC --> AN
    AN --> EXP
```

### Project Structure

```
liku-ai/
├── src/
│   ├── chess/           # Chess engine (Search, Eval, AI, Openings)
│   ├── websocket/       # WebSocket server, client, router
│   ├── training/        # Recording, replay, analytics, A/B testing
│   ├── ui/games/        # Game components (Chess, Snake, Dino, TicTacToe)
│   ├── core/            # State logging, database tools
│   └── index.tsx        # Entry point
├── scripts/             # Utility scripts (chess-ai-battle, self-play, elo-estimate)
├── docs/                # Documentation
├── __tests__/           # Test files
├── k8s/                 # Kubernetes manifests
├── Dockerfile           # Production container
└── docker-compose.yml   # Local dev stack
```

---

## 🐳 Docker

```bash
# Build image
docker build -t liku-ai .

# Run container
docker run -p 3847:3847 -p 3848:3848 liku-ai

# Docker Compose (with Redis)
docker-compose up
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run once (CI mode)
npm run test:run

# Specific test file
npx vitest run __tests__/WebSocket.test.ts
```

**Test Coverage:**

| Module | Tests | Coverage |
|--------|-------|----------|
| WebSocket | 179 | ~95% |
| Training | 93 | ~95% |
| Spectator | 93 | ~95% |
| Security | 43 | ~90% |
| TURN | 40 | ~90% |
| **Total** | **514** | **~95%** |

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Quick Reference](docs/QUICK_REFERENCE.md) | One-page command cheatsheet |
| [API Reference](docs/API_REFERENCE.md) | Complete WebSocket API |
| [WebSocket Protocol](docs/WEBSOCKET_PROTOCOL.md) | Protocol specification |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues & solutions |
| [Performance](docs/PERFORMANCE.md) | Load test results |
| [AI Battle Guide](docs/AI_BATTLE_GUIDE.md) | AI vs AI games |
| [Development Roadmap](TODO.md) | Planned features |
| [Chess Implementation](todo-chess.md) | Chess engine details |

---

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LIKU_WS_PORT` | `3847` | WebSocket server port |
| `LIKU_HEALTH_PORT` | `3848` | Health endpoint port |
| `GEMINI_API_KEY` | — | For AI move explanations |

### CLI Flags

```bash
npm start -- --no-websocket  # Disable WebSocket server
npm start -- --port 8080     # Custom port
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [chess.js](https://github.com/jhlywa/chess.js) — Chess move generation
- [Ink](https://github.com/vadimdemedes/ink) — React for CLI
- [chalk](https://github.com/chalk/chalk) — Terminal styling
- [Chess Programming Wiki](https://www.chessprogramming.org/) — Engine algorithms

---

<div align="center">

**Version**: 2.3.1 • **Tests**: 514 passing • **Last Updated**: December 2025

[⬆ Back to top](#liku-ai)

</div>
