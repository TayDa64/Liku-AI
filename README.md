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
[For AI Agents](#-for-ai-agents) •
[For Developers](#-for-developers) •
[Games](#-games) •
[API Reference](docs/API_REFERENCE.md)

</div>

---

## ⛔ FOR AI AGENTS: READ THIS FIRST

> **DO NOT run `npm start` in VS Code's integrated terminal!**
> 
> This is a TUI that will hang your IDE. You MUST:
> 1. **Read [LIKU-CORE.md](LIKU-CORE.md)** - Essential setup and launch instructions
> 2. **Read game docs** in `docs/ai/` before playing any game
> 
> The correct way to launch is via `Start-Process` (Windows) or background process (Linux).
> See LIKU-CORE.md for details.

---

## 🎯 What is Liku-AI?

Liku-AI is a **terminal-based game platform** designed for both human players and AI agents. It provides:

| Feature | Description |
|---------|-------------|
| 🎮 **Terminal Games** | Chess, Snake, Dino Run, Tic-Tac-Toe with React/Ink TUI |
| 🤖 **AI Agent API** | Real-time WebSocket control for any AI model |
| ♟️ **Chess Engine** | Alpha-beta search, 20+ openings, Elo rating system |
| 📊 **Training Tools** | Session recording, replay, self-play, A/B testing |
| 🌍 **Cross-Platform** | Windows, macOS, Linux, GitHub Codespaces |

**Use Cases:**
- Play terminal games as a human
- Build AI agents that play games autonomously  
- Train models with recorded game sessions
- Benchmark AI strategies with Elo ratings

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 20.x+ | `node --version` |
| npm | 10.x+ | `npm --version` |

### Installation (All Platforms)

```bash
# Clone repository
git clone https://github.com/TayDa64/Liku-AI.git
cd Liku-AI

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the game!
npm start
```

### First Run

Use **arrow keys** to navigate, **Enter** to select, **Escape** to go back.

```
┌─────────────────────────────────────┐
│           LIKU-AI v2.0              │
├─────────────────────────────────────┤
│  > 🎮 Let's Play                    │
│    ♟️ Chess                         │
│    📊 Stats & Leaderboards          │
│    ⚙️  Settings                     │
│    🚪 Exit                          │
└─────────────────────────────────────┘
```

---

## 🤖 For AI Agents

Liku-AI is designed to be controlled by AI models (Claude, GPT, Gemini, etc.) through a state file + command interface.

### How It Works

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   AI Agent   │ ──── │  State File  │ ──── │   Liku-AI    │
│  (Claude,    │ read │ likubuddy-   │      │   Terminal   │
│   GPT, etc.) │      │ state.txt    │      │     Game     │
└──────────────┘      └──────────────┘      └──────────────┘
       │                                           ▲
       │              ┌──────────────┐             │
       └───────────── │  Commands    │ ────────────┘
              send    │  WebSocket   │   control
                      │  or Scripts  │
                      └──────────────┘
```

### Quick Start for AI Agents

#### Windows (PowerShell)

```powershell
# 1. Start game in separate window
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd C:\dev\Liku-AI; node dist/index.js"

# 2. Read current state
Get-Content .\likubuddy-state.txt

# 3. Send commands
.\send-keys.ps1 -Key "{DOWN}"    # Navigate down
.\send-keys.ps1 -Key "{ENTER}"   # Select item
```

#### macOS / Linux / Codespaces

```bash
# 1. Start game in background
node dist/index.js &

# 2. Read current state
cat likubuddy-state.txt

# 3. Send commands via WebSocket
./send-keys.sh -Key "{DOWN}"     # Navigate down
./send-keys.sh -Key "{ENTER}"    # Select item

# Alternative: Direct WebSocket
node send-command.js --key down
node send-command.js --key enter
```
![codex_playing_chess_Liku-AI](https://github.com/user-attachments/assets/5ae80bb7-1195-4d64-a0ec-2e6cadbce6d6)


### Available Commands

| Command | Windows | macOS/Linux | Description |
|---------|---------|-------------|-------------|
| Navigate Up | `.\send-keys.ps1 -Key "{UP}"` | `./send-keys.sh -Key "{UP}"` | Move selection up |
| Navigate Down | `.\send-keys.ps1 -Key "{DOWN}"` | `./send-keys.sh -Key "{DOWN}"` | Move selection down |
| Select | `.\send-keys.ps1 -Key "{ENTER}"` | `./send-keys.sh -Key "{ENTER}"` | Confirm selection |
| Back | `.\send-keys.ps1 -Key "{ESCAPE}"` | `./send-keys.sh -Key "{ESCAPE}"` | Go back / Exit |
| Jump (Dino) | `.\send-keys.ps1 -Key " "` | `./send-keys.sh -Key " "` | Space bar |
| Chess Move | `.\send-keys.ps1 -Key "e4"` | `./send-keys.sh -Key "e4"` | Type move notation |

### State File Reference

The `likubuddy-state.txt` file updates in real-time with:

```
=== LIKU-AI STATE ===
SCREEN: chess
STATUS: Your turn (White)
TURN: white
FEN: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1

VISUAL STATE:
  a b c d e f g h
8 r n b q k b n r
7 p p p p p p p p
...

STRUCTURED STATE (JSON):
{"screen":"chess","turn":"white","fen":"..."}
```

### AI Agent Documentation

| Document | Purpose |
|----------|---------|
| [LIKU-CORE.md](LIKU-CORE.md) | Complete AI agent manual |
| [docs/ai/LIKU-CHESS.md](docs/ai/LIKU-CHESS.md) | Chess-specific AI guide |
| [docs/ai/LIKU-SNAKE.md](docs/ai/LIKU-SNAKE.md) | Snake AI guide |
| [docs/AI_AGENT_BRIEFING.md](docs/AI_AGENT_BRIEFING.md) | Quick agent briefing |

---

## 🎮 Games

| Game | Description | Controls | AI Support |
|------|-------------|----------|------------|
| ♟️ **Chess** | Full chess engine with 5 difficulty levels | `e4`, `Nf3`, `h` (hint), `u` (undo), `r` (resign) | ✅ Minimax + Opening Book |
| 🐍 **Snake** | Classic snake game | Arrow keys | ✅ State-based AI |
| 🦖 **Dino Run** | Chrome dinosaur clone | Space (jump), Down (duck) | ✅ Obstacle prediction |
| ⭕ **Tic-Tac-Toe** | Unbeatable AI opponent | Number keys 1-9 | ✅ Perfect play AI |
| 📝 **Hangman** | Word guessing game | Letter keys | ❌ Human only |
| 🔢 **Sudoku** | Number puzzle | Number keys | ❌ Human only |

### Chess Engine Details

```
┌─────────────────────────────────────────────────────┐
│                  Chess Engine                       │
├─────────────────────────────────────────────────────┤
│  Search: Alpha-Beta with Iterative Deepening       │
│  Features: Transposition Table, Quiescence Search  │
│  Opening Book: 20+ named openings                  │
│  Evaluation: Material, Position, Pawn Structure    │
├─────────────────────────────────────────────────────┤
│  Difficulty │ Depth │ Time   │ Est. Elo            │
│  ───────────┼───────┼────────┼──────────           │
│  Easy       │ 2     │ <1s    │ ~1000               │
│  Medium     │ 3     │ ~2s    │ ~1200               │
│  Hard       │ 4     │ ~5s    │ ~1400               │
│  Expert     │ 5     │ ~15s   │ ~1600               │
└─────────────────────────────────────────────────────┘
```

---

## 👨‍💻 For Developers

### Project Structure

```
liku-ai/
├── src/
│   ├── index.tsx              # Entry point (React/Ink TUI)
│   ├── chess/                 # Chess engine
│   │   ├── ChessAI.ts         # AI player (minimax)
│   │   ├── ChessEval.ts       # Position evaluation
│   │   ├── ChessSearch.ts     # Alpha-beta search
│   │   └── OpeningBook.ts     # 20+ named openings
│   ├── websocket/             # WebSocket server
│   │   ├── server.ts          # WS server (port 3847)
│   │   ├── router.ts          # Command routing
│   │   └── cli.ts             # Standalone server CLI
│   ├── training/              # Training infrastructure
│   │   ├── SessionRecorder.ts # Record game sessions
│   │   ├── SessionPlayer.ts   # Replay sessions
│   │   └── ABTest.ts          # A/B testing framework
│   ├── ui/games/              # Game components
│   │   ├── Chess.tsx          # Chess UI
│   │   ├── Snake.tsx          # Snake game
│   │   ├── DinoRun.tsx        # Dino game
│   │   └── TicTacToe.tsx      # Tic-Tac-Toe
│   └── core/                  # Core utilities
│       ├── StateLogger.ts     # State file writer
│       └── DatabaseService.ts # SQLite database
├── scripts/                   # Utility scripts
│   ├── chess-ai-battle.js     # AI vs AI matches
│   ├── self-play.ts           # Training data generation
│   └── elo-estimate.ts        # Elo calculation
├── __tests__/                 # Test files (514 tests)
├── docs/                      # Documentation
├── k8s/                       # Kubernetes manifests
├── send-keys.ps1              # Windows keystroke sender
├── send-keys.sh               # macOS/Linux keystroke sender
├── send-command.js            # Cross-platform WebSocket CLI
└── likubuddy-state.txt        # Real-time state file (generated)
```

### NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Start** | `npm start` | Launch terminal UI |
| **Build** | `npm run build` | Compile TypeScript |
| **Dev** | `npm run dev` | Watch mode (auto-rebuild) |
| **Test** | `npm test` | Run Vitest tests |
| **Server** | `npm run server` | WebSocket server only |
| **AI Battle** | `npm run ai-vs-ai` | Run AI vs AI chess match |

### WebSocket API

Connect to `ws://localhost:3847` for real-time communication:

```typescript
// Example: Connect and send commands
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3847');

ws.on('open', () => {
  // Send a key press
  ws.send(JSON.stringify({ type: 'key', key: 'down' }));
  
  // Send a chess move
  ws.send(JSON.stringify({ type: 'action', action: 'chess_move', params: { move: 'e4' } }));
  
  // Query current state
  ws.send(JSON.stringify({ type: 'query', query: 'state' }));
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log('Response:', response);
});
```

**Message Types:**

| Type | Purpose | Example |
|------|---------|---------|
| `key` | Send keystroke | `{ type: 'key', key: 'enter' }` |
| `action` | Game action | `{ type: 'action', action: 'chess_move', params: { move: 'e4' } }` |
| `query` | Request data | `{ type: 'query', query: 'state' }` |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LIKU_WS_PORT` | `3847` | WebSocket server port |
| `LIKU_HEALTH_PORT` | `3848` | Health check endpoint |
| `GEMINI_API_KEY` | — | Google AI for move explanations |

### Testing

```bash
# Run all tests
npm test

# Run once (CI mode)
npm run test:run

# Run specific test file
npx vitest run __tests__/WebSocket.test.ts

# Run with coverage
npx vitest run --coverage
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

### Training & Self-Play

```bash
# Generate training data from AI vs AI games
npx tsx scripts/self-play.ts --games 20 --depth-range 2-4

# Estimate Elo rating from recorded games
npx tsx scripts/elo-estimate.ts --verbose

# Run AI battle with specific settings
node scripts/chess-ai-battle.js --white=minimax --black=minimax --depth=4
```

### Docker Support

```bash
# Build image
docker build -t liku-ai .

# Run container
docker run -p 3847:3847 -p 3848:3848 liku-ai

# Docker Compose (with Redis)
docker-compose up -d
```

---

## 📚 Documentation

### Quick Links

| Document | Audience | Description |
|----------|----------|-------------|
| [LIKU-CORE.md](LIKU-CORE.md) | AI Agents | Complete AI agent operation manual |
| [Quick Reference](docs/QUICK_REFERENCE.md) | Everyone | One-page command cheatsheet |
| [API Reference](docs/API_REFERENCE.md) | Developers | WebSocket API documentation |
| [WebSocket Protocol](docs/WEBSOCKET_PROTOCOL.md) | Developers | Protocol specification |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Everyone | Common issues & solutions |
| [AI Battle Guide](docs/AI_BATTLE_GUIDE.md) | Developers | AI vs AI game setup |
| [Performance](docs/PERFORMANCE.md) | Developers | Benchmarks & load tests |

### AI-Specific Guides

| Game | AI Guide |
|------|----------|
| Chess | [docs/ai/LIKU-CHESS.md](docs/ai/LIKU-CHESS.md) |
| Snake | [docs/ai/LIKU-SNAKE.md](docs/ai/LIKU-SNAKE.md) |
| Tic-Tac-Toe | [docs/ai/LIKU-TICTACTOE.md](docs/ai/LIKU-TICTACTOE.md) |
| Dino Run | [docs/ai/LIKU-DINORUN.md](docs/ai/LIKU-DINORUN.md) |

---

## ❓ Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| **"Cannot find module 'dist/index.js'"** | Run `npm run build` first |
| **WebSocket connection refused** | Ensure server is running: `npm run server` |
| **State file not updating** | Check game is running in separate terminal |
| **Commands not working** | Verify game window has focus (Windows) or WebSocket port 3847 is open |
| **Permission denied on send-keys.sh** | Run `chmod +x send-keys.sh send-command.js` |

### Platform-Specific Notes

**Windows:**
- PowerShell 5.1+ required
- `send-keys.ps1` uses COM automation (requires foreground window)

**macOS:**
- Bash 3.2+ compatible (native macOS shell works)
- `send-keys.sh` uses WebSocket (no GUI requirements)

**Linux / Codespaces:**
- Works fully headless via WebSocket
- No display server required

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Commit** changes: `git commit -m 'Add my feature'`
4. **Push** to branch: `git push origin feature/my-feature`
5. **Open** a Pull Request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/Liku-AI.git
cd Liku-AI

# Install dependencies
npm install

# Start dev mode (auto-rebuild)
npm run dev

# In another terminal, run the app
npm start
```

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [chess.js](https://github.com/jhlywa/chess.js) — Chess move generation & validation
- [Ink](https://github.com/vadimdemedes/ink) — React for command-line interfaces
- [ws](https://github.com/websockets/ws) — WebSocket implementation
- [Vitest](https://vitest.dev/) — Testing framework
- [Chess Programming Wiki](https://www.chessprogramming.org/) — Engine algorithms reference

---

<div align="center">

**Version**: 2.0.0 • **Tests**: 514 passing • **Platforms**: Windows, macOS, Linux

Made with ❤️ for AI agents and humans alike

[⬆ Back to top](#liku-ai)

</div>
