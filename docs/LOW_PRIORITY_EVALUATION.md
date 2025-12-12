# Low Priority Tasks Evaluation

## Overview

This document evaluates the three "Low Priority" tasks from `TODO.md` and provides recommendations on whether they should be prioritized for the Liku-AI project.

---

## Task 1: Socket.io Compatibility Layer

### Description
> Consider Socket.io as alternative to raw `ws` _(prototype compatibility layer without regressing existing `ws` API or breaking `LikuWebSocketClient`)_

### Current State
- Liku-AI uses raw `ws` (WebSocket) library
- Works well with existing infrastructure
- ~476 tests passing, ~95% coverage

### Pros of Socket.io
- Built-in reconnection handling
- Room/namespace support
- Automatic serialization (JSON, MessagePack)
- Fallback to long-polling for legacy browsers
- Event-based API (familiar to many developers)

### Cons of Socket.io
- Heavier dependency (~40KB vs ~5KB for ws)
- Not compatible with raw WebSocket clients (needs socket.io-client)
- Additional protocol overhead
- Would require rewriting client library
- Overkill for terminal-based AI games

### Recommendation: **SKIP** ❌
**Reason**: The raw `ws` library is working perfectly. Socket.io adds complexity without solving real problems. Liku-AI is a terminal application, not a web app needing browser fallbacks. The existing WebSocket implementation with custom reconnection, heartbeat, and rate limiting already covers all needs.

---

## Task 2: WebSocket Compression (permessage-deflate)

### Description
> Add WebSocket compression (permessage-deflate) _(negotiate `permessage-deflate` without increasing latency for low-bandwidth games)_

### Current State
- Game states are small JSON objects (~1-5KB)
- Latency is already ~1-2ms
- No compression enabled

### Analysis

#### Compression Savings Estimate
| Data Type | Uncompressed | Compressed | Savings |
|-----------|--------------|------------|---------|
| Chess state | ~2KB | ~0.5KB | 75% |
| TicTacToe state | ~500B | ~200B | 60% |
| Snake state | ~3KB | ~0.8KB | 73% |

#### Latency Impact
- Compression: +0.5-2ms CPU time
- Network savings: -0.1-0.5ms (depends on bandwidth)
- **Net effect**: Likely +0.3-1.5ms latency

#### Implementation Effort
```javascript
// ws library has built-in support
const wss = new WebSocketServer({
  port: 3847,
  perMessageDeflate: {
    zlibDeflateOptions: { level: 6 },
    threshold: 1024, // Only compress messages >1KB
  }
});
```

### Recommendation: **DEFER** ⏸️
**Reason**: The states are already small, and compression would ADD latency due to CPU overhead. This becomes valuable only when:
1. Supporting many concurrent spectators (100+)
2. Running over cellular/slow networks
3. State sizes grow significantly (e.g., full chess analysis with PV)

**Suggested Trigger**: Implement when spectator counts exceed 50 per session or when Chess PV data makes states >10KB.

---

## Task 3: Memory Profiling for Many Connections

### Description
> Profile memory usage with many connections _(sustain 1k+ concurrent sockets without increasing GC pauses or breaking replay/state caching)_

### Current State
- Target: 100+ concurrent clients
- Memory per client: <1MB (untested for scale)
- No profiling data for 1000+ connections

### Why This Matters
1. **Spectator scaling**: Popular games could have hundreds of viewers
2. **AI tournaments**: Multiple AI agents playing simultaneously
3. **Memory leaks**: Long-running servers need stability
4. **Kubernetes scaling**: HPA needs accurate resource limits

### Implementation Steps
```javascript
// 1. Add memory tracking
function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    heapUsed: Math.round(used.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(used.heapTotal / 1024 / 1024) + 'MB',
    external: Math.round(used.external / 1024 / 1024) + 'MB',
    rss: Math.round(used.rss / 1024 / 1024) + 'MB',
  };
}

// 2. Load testing script
async function loadTest(connections = 1000) {
  const clients = [];
  for (let i = 0; i < connections; i++) {
    const client = new LikuAIClient({ url: 'ws://localhost:3847' });
    await client.connect();
    clients.push(client);
  }
  console.log('Memory after ' + connections + ' clients:', getMemoryUsage());
}

// 3. Monitor GC pauses
const v8 = require('v8-profiler-next');
// Capture heap snapshots during load tests
```

### Estimated Per-Client Memory
| Component | Memory |
|-----------|--------|
| WebSocket connection | ~2KB |
| Agent session | ~1KB |
| State subscription | ~0.5KB |
| Message buffers | ~2KB |
| **Total** | ~5-6KB per idle client |

For 1000 clients: ~5-6MB additional heap (very manageable)

### Potential Issues
1. **State broadcasts**: If broadcasting full state to 1000 clients, JSON.stringify becomes bottleneck
2. **Event emitter limits**: Node.js default is 10 listeners (already increased?)
3. **File descriptors**: OS limits (ulimit -n) may cap connections

### Recommendation: **PRIORITIZE** ✅
**Reason**: This is the most valuable low-priority task because:
1. It directly enables scaling for Chess AI tournaments
2. Identifies real bottlenecks before they're problems
3. Provides data for accurate K8s resource limits
4. Low effort to set up basic profiling

**Suggested Action**: Create a load testing script and profile with 100, 500, 1000 connections before Chess implementation.

---

## Summary & Recommendations

| Task | Priority | Verdict | Effort | Value |
|------|----------|---------|--------|-------|
| Socket.io compatibility | Low | **SKIP** | High | Low |
| WebSocket compression | Low | **DEFER** | Medium | Medium |
| Memory profiling | Low | **PRIORITIZE** | Low | High |

### Recommended Order of Work

1. ✅ **Memory Profiling** (before Chess)
   - Create `scripts/load-test.js`
   - Profile with 100/500/1000 connections
   - Document findings in `docs/PERFORMANCE.md`
   - Update K8s resource limits if needed

2. ⏸️ **Compression** (after Chess, if needed)
   - Only if spectator counts justify it
   - Make it configurable, not default

3. ❌ **Socket.io** (never, unless specific need arises)
   - Would only consider if web browser support required
   - Current ws implementation is superior for CLI apps

---

## Chess Implementation Impact

For the Chess AI system planned in `todo-chess.md`:

### Memory Considerations
- Chess state with full analysis: ~5-10KB
- AI search transposition table: ~50-100MB
- Opening book: ~10-20MB
- Per-game state history: ~50KB for long games

**Recommendation**: Profile memory BEFORE implementing Chess to establish baseline, then track impact of each Chess component.

### Connection Scaling
- AI-vs-AI tournaments need stable multi-agent sessions
- Spectators watching grandmaster battles
- Multiple concurrent games

**Conclusion**: Task 3 (memory profiling) directly supports Chess implementation and should be done first.

---

*Created: June 2025*
*For: Liku-AI Development Team*
