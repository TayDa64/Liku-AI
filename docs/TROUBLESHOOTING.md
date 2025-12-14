# Troubleshooting Guide

Common issues and solutions for Liku-AI.

---

## Table of Contents

- [Installation Issues](#installation-issues)
- [WebSocket Connection Issues](#websocket-connection-issues)
- [Chess Engine Issues](#chess-engine-issues)
- [Game UI Issues](#game-ui-issues)
- [Performance Issues](#performance-issues)
- [Docker Issues](#docker-issues)
- [FAQ](#faq)

---

## Installation Issues

### `npm install` fails with native module errors

**Symptom**: Error messages about `better-sqlite3` or `node-gyp` during install.

**Solution**:
```bash
# Windows: Install build tools
npm install --global windows-build-tools

# macOS: Install Xcode command line tools
xcode-select --install

# Linux: Install build essentials
sudo apt-get install build-essential python3
```

### TypeScript compilation errors

**Symptom**: `npm run build` shows type errors.

**Solution**:
```bash
# Clean rebuild
rm -rf dist node_modules
npm install
npm run build
```

### Node.js version mismatch

**Symptom**: `SyntaxError: Unexpected token` or ES module errors.

**Solution**:
```bash
# Check version (requires 20.x+)
node --version

# Use nvm to install correct version
nvm install 20
nvm use 20
```

---

## WebSocket Connection Issues

### Connection refused on port 3847

**Symptom**: `Error: connect ECONNREFUSED 127.0.0.1:3847`

**Solutions**:

1. **Server not running**:
   ```bash
   # Start the server first
   npm run server
   # Or start the full app
   npm start
   ```

2. **Port already in use**:
   ```bash
   # Find process using port
   # Windows
   netstat -ano | findstr :3847
   taskkill /PID <pid> /F
   
   # Linux/macOS
   lsof -i :3847
   kill -9 <pid>
   ```

3. **Firewall blocking**:
   ```bash
   # Windows: Allow through firewall
   netsh advfirewall firewall add rule name="Liku-AI" dir=in action=allow protocol=TCP localport=3847
   ```

### WebSocket connection drops frequently

**Symptom**: Client disconnects every few seconds.

**Solutions**:

1. **Enable heartbeat** (client-side):
   ```typescript
   const client = new LikuAIClient('ws://localhost:3847', {
     heartbeatInterval: 30000, // 30 seconds
     reconnectInterval: 1000,
   });
   ```

2. **Check rate limits**: Default is 100 commands/second. Reduce command frequency.

3. **Network issues**: Check for proxy/VPN interference.

### "Invalid message format" errors

**Symptom**: Server logs show JSON parse errors.

**Solution**: Ensure messages follow the protocol:
```typescript
// ✅ Correct format
ws.send(JSON.stringify({
  type: 'action',
  action: 'jump',
  requestId: 'req-123'
}));

// ❌ Wrong - missing type
ws.send(JSON.stringify({ action: 'jump' }));
```

---

## Chess Engine Issues

### "Invalid move" errors during search

**Symptom**: Chess AI returns invalid moves or crashes.

**Cause**: This was a known bug in v2.3.0 where the evaluator corrupted the chess instance.

**Solution**: Update to v2.3.1+:
```bash
git pull origin master
npm run build
```

### Chess AI plays very slowly

**Symptom**: AI takes >10 seconds per move at depth 4.

**Solutions**:

1. **Reduce search depth**:
   ```typescript
   const ai = new ChessAI({ maxDepth: 3 }); // Default is 4
   ```

2. **Increase time limit**:
   ```typescript
   const move = ai.getMove(fen, { maxTime: 10000 }); // 10 seconds
   ```

3. **Check system resources**: Chess search is CPU-intensive.

### Opening book not working

**Symptom**: AI doesn't recognize openings.

**Solution**: Ensure you're using standard opening moves:
```typescript
// Italian Game should be recognized
// 1. e4 e5 2. Nf3 Nc6 3. Bc4
```

---

## Game UI Issues

### Terminal displays garbled characters

**Symptom**: Unicode chess pieces show as `?` or boxes.

**Solutions**:

1. **Use a Unicode-compatible terminal**:
   - Windows Terminal (recommended)
   - iTerm2 (macOS)
   - Modern Linux terminals with UTF-8

2. **Set terminal encoding**:
   ```bash
   # PowerShell
   [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
   
   # Bash
   export LANG=en_US.UTF-8
   ```

### Colors not displaying

**Symptom**: No colors in terminal output.

**Solutions**:

1. **Enable colors in terminal**:
   ```bash
   # Force colors
   export FORCE_COLOR=1
   ```

2. **Check terminal compatibility**: Some terminals don't support 256 colors.

### Keyboard input not working

**Symptom**: Arrow keys or Enter don't respond.

**Solutions**:

1. **Focus the terminal**: Click inside the terminal window.

2. **Raw mode issues** (rare):
   ```bash
   # Reset terminal
   reset
   # Or
   stty sane
   ```

---

## Performance Issues

### High memory usage

**Symptom**: Process using >500MB RAM.

**Solutions**:

1. **Clear transposition table**:
   ```typescript
   search.clearTT(); // Call periodically
   ```

2. **Reduce TT size**:
   ```typescript
   const search = new ChessSearch(evaluator, {
     ttSizeMB: 16, // Default is 32
   });
   ```

### Slow state broadcasts

**Symptom**: State updates lagging behind game.

**Solutions**:

1. **Reduce broadcast frequency**:
   ```typescript
   // In GameStateLogger
   broadcastInterval: 100, // ms, default is 50
   ```

2. **Enable state diffing**:
   ```typescript
   // Only send changes, not full state
   useDiffs: true,
   ```

### CPU spikes during AI games

**Symptom**: 100% CPU during chess AI play.

**Solution**: This is expected during search. Options:
- Reduce search depth
- Add delays between moves
- Use web workers (future feature)

---

## Docker Issues

### Container won't start

**Symptom**: `docker run` exits immediately.

**Solutions**:

1. **Check logs**:
   ```bash
   docker logs <container-id>
   ```

2. **Missing environment variables**:
   ```bash
   docker run -e GEMINI_API_KEY=your-key liku-ai
   ```

### Can't connect to container WebSocket

**Symptom**: Connection refused to containerized server.

**Solution**: Ensure port mapping:
```bash
docker run -p 3847:3847 liku-ai
```

### Build fails on ARM64 (M1/M2 Mac)

**Symptom**: `better-sqlite3` build errors on Apple Silicon.

**Solution**:
```bash
# Use platform flag
docker build --platform linux/amd64 -t liku-ai .
```

---

## FAQ

### Q: How do I disable the WebSocket server?

```bash
npm start -- --no-websocket
```

### Q: How do I change the WebSocket port?

```bash
# Environment variable
export LIKU_WS_PORT=8080
npm start

# Or in code
const server = new LikuWebSocketServer({ port: 8080 });
```

### Q: Can I run multiple AI agents simultaneously?

Yes! Each agent connects as a separate WebSocket client:
```typescript
const agent1 = new LikuAIClient('ws://localhost:3847');
const agent2 = new LikuAIClient('ws://localhost:3847');
```

### Q: How do I export training data?

```typescript
import { DataExporter } from 'liku-ai/training';

const exporter = new DataExporter();
await exporter.export(session, 'training.jsonl', 'jsonl');
```

### Q: Why does chess AI lose to simple positions?

The current engine is ~1200-1400 Elo at depth 3-4. For stronger play:
- Increase depth (slower)
- Wait for chessops migration (v2.4.0)
- Use Stockfish.wasm for analysis

### Q: How do I report a bug?

1. Check existing [GitHub Issues](https://github.com/TayDa64/Liku-AI/issues)
2. Include:
   - Node.js version (`node --version`)
   - OS and terminal
   - Steps to reproduce
   - Error messages/logs

---

## Getting Help

- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/TayDa64/Liku-AI/issues)
- **Discussions**: [GitHub Discussions](https://github.com/TayDa64/Liku-AI/discussions)

---

*Last Updated: December 2025*
