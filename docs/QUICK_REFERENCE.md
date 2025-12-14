# Liku-AI Quick Reference

One-page reference for common commands and configurations.

---

## CLI Commands

```bash
# Main Commands
npm start                    # Launch terminal UI
npm run server              # Start WebSocket server only
npm run server:verbose      # Server with debug output
npm test                    # Run test suite
npm run build               # Compile TypeScript

# AI Battle & Training
node scripts/chess-ai-battle.js --depth=4
npx tsx scripts/self-play.ts --games 20 --depth-range 2-4
npx tsx scripts/elo-estimate.ts --verbose
npx tsx scripts/benchmark.ts

# Development
npm run dev                 # Watch mode (auto-rebuild)
npx vitest run              # Tests without watch
```

---

## Keyboard Controls

### General Navigation
| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate menus |
| `Enter` | Select / Confirm |
| `Escape` | Back / Exit |

### Chess
| Key | Action |
|-----|--------|
| `↑` `↓` `←` `→` | Move cursor |
| `Enter` | Select / Move piece |
| `h` | Get hint |
| `u` | Undo move |
| `r` | Resign |
| `d` | Offer draw |
| `f` | Flip board |

### Snake
| Key | Action |
|-----|--------|
| `↑` `↓` `←` `→` | Change direction |

### Dino Run
| Key | Action |
|-----|--------|
| `Space` / `↑` | Jump |
| `↓` | Duck |

---

## WebSocket Quick Reference

### Connection
```
ws://localhost:3847
```

### Send Key
```json
{"type": "key", "key": "ArrowUp"}
```

### Send Action
```json
{"type": "action", "action": "jump"}
```

### Chess Move
```json
{"type": "action", "action": "chess_move", "params": {"move": "e4"}}
```

### Query State
```json
{"type": "query", "query": "gameState"}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LIKU_WS_PORT` | `3847` | WebSocket port |
| `LIKU_HEALTH_PORT` | `3848` | Health endpoint port |
| `GEMINI_API_KEY` | — | AI move explanations |

---

## Health Endpoints

```
GET http://localhost:3848/health   # Overall health
GET http://localhost:3848/ready    # Ready check
GET http://localhost:3848/live     # Liveness probe
GET http://localhost:3848/metrics  # Prometheus metrics
```

---

## Chess Difficulty Levels

| Level | Depth | Elo | Time/Move |
|-------|-------|-----|-----------|
| Beginner | 2 | ~1000 | <1s |
| Intermediate | 3-4 | ~1200 | 2-5s |
| Advanced | 5-6 | ~1500 | 10-30s |
| Grandmaster | 7+ | ~1800+ | 60s+ |

---

## Common File Locations

```
~/.gemini-liku/snake.db     # SQLite database
training-data.jsonl          # Self-play positions
training-data-games.json     # Game records
dist/                        # Compiled JavaScript
```

---

## Docker Commands

```bash
docker build -t liku-ai .
docker run -p 3847:3847 -p 3848:3848 liku-ai
docker-compose up
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 3847 in use | `netstat -ano \| findstr :3847` → `taskkill /PID <id> /F` |
| Connection refused | Start server: `npm run server` |
| Build errors | `rm -rf dist && npm run build` |
| Module not found | `rm -rf node_modules && npm install` |

---

*Full docs: [docs/](./docs/) • Issues: [GitHub](https://github.com/TayDa64/Liku-AI/issues)*
