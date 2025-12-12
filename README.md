# Liku-AI 🎮🤖

**AI-Enhanced Terminal Game Platform with Real-Time WebSocket Communication**

A real-time AI agent platform and terminal game companion featuring a grandmaster-level chess engine, WebSocket API, and comprehensive training tools.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-476%20passing-brightgreen.svg)]()

## ✨ Features

### 🎯 Terminal Games
- **♟️ Chess** - Full chess engine with AI opponent (beginner to grandmaster)
- **🐍 Snake** - Classic snake game with AI-friendly state
- **🦖 Dino Run** - Chrome dinosaur game clone
- **⭕ Tic-Tac-Toe** - With minimax AI and multiplayer support
- **📝 Hangman** - Word guessing game
- **🔢 Sudoku** - Number puzzle game

### 🔌 WebSocket API
Real-time bidirectional communication for AI agents:
- Game state streaming (<1ms latency)
- Command execution (keys, actions)
- Query system (stats, leaderboards)
- Multi-agent coordination
- AI-vs-AI game sessions

### ♟️ Chess Engine
Production-ready chess system:
- **chess.js** foundation for move generation
- Alpha-beta search with modern enhancements (TT, LMR, null move, PVS)
- Comprehensive evaluation (material, PST, pawn structure, mobility, king safety)
- Opening book with 20+ named openings
- Gemini AI integration for move explanation
- Unicode board display with chalk-based rendering

### 📊 Training & Analytics
- Session recording and replay
- Multi-format export (JSON, CSV, TFRecord)
- Elo rating system
- A/B testing framework for AI strategies

## 🚀 Quick Start

### Prerequisites
- Node.js 20.x or higher
- npm 10.x or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/TayDa64/LikuBuddy.git
cd LikuBuddy

# Install dependencies
npm install

# Build
npm run build

# Run
npm start
```

### As Gemini CLI Extension

```bash
# Install as Gemini extension
gemini extensions install .

# Launch via Gemini CLI
/liku
```

## 🎮 Usage

### Terminal UI
Navigate with arrow keys, select with Enter, escape to go back.

### Chess vs AI
```bash
# Start the app and select "Let's Play" → "Chess vs AI"

# Or run AI battle script:
node scripts/chess-ai-battle.js --white=minimax --black=gemini --depth=6
```

### WebSocket Client (for AI agents)

```typescript
import { LikuAIClient } from 'liku-ai';

const client = new LikuAIClient('ws://localhost:3847');

// Connect and receive state
client.on('state', (state) => {
  console.log('Game state:', state);
});

// Send commands
client.sendKey('ArrowUp');
client.sendAction('chess_move', { move: 'e2e4' });

// Query data
const stats = await client.query('stats');
```

## 📁 Project Structure

```
src/
├── chess/           # Chess engine (ChessEngine, Evaluator, Search, AI, Openings)
├── websocket/       # WebSocket server, client, router, sessions
├── training/        # Recording, replay, analytics, A/B testing
├── ui/              # Ink/React terminal UI components
│   ├── games/       # Game components (Chess, Snake, Dino, TicTacToe...)
│   └── components/  # Shared UI components
├── core/            # Game state logging, database tools
├── services/        # Database service (SQLite)
└── index.tsx        # Entry point
```

## 🔧 Configuration

### WebSocket Server
Default port: `3847`

```bash
# Disable WebSocket server
npm start -- --no-websocket
```

### Chess AI Difficulty
| Level | Search Depth | Description |
|-------|--------------|-------------|
| Beginner | 2 | Makes mistakes, good for learning |
| Intermediate | 4 | Casual player strength |
| Advanced | 6 | Strong club player |
| Grandmaster | 8+ | Near-optimal play |

## 📊 Performance

| Metric | Value |
|--------|-------|
| State Latency | ~1ms |
| Command Latency | ~2ms |
| Concurrent Clients | 1000+ tested |
| Memory per Client | ~10KB |
| Test Coverage | ~95% (476 tests) |

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

## 🐳 Docker

```bash
# Build image
docker build -t liku-ai .

# Run container
docker run -p 3847:3847 liku-ai

# Docker Compose (with Redis)
docker-compose up
```

## 📚 Documentation

- [WebSocket Protocol](docs/WEBSOCKET_PROTOCOL.md)
- [Chess Implementation](todo-chess.md)
- [Development Roadmap](TODO.md)
- [Performance Benchmarks](docs/PERFORMANCE.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [chess.js](https://github.com/jhlywa/chess.js) - Chess move generation
- [Ink](https://github.com/vadimdemedes/ink) - React for CLI
- [chalk](https://github.com/chalk/chalk) - Terminal string styling
- [Chess Programming Wiki](https://www.chessprogramming.org/) - Chess engine algorithms

---

**Version**: 2.0.0-alpha.1  
**Last Updated**: December 2025
