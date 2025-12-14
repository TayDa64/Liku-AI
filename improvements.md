# LikuBuddy Improvement Roadmap

> **Analysis Date:** December 13, 2025  
> **Current Version:** 2.0.0-alpha.1  
> **Based on:** Grok 4.1 Deep Analysis + Codebase Review

This document outlines **viable improvements** that enhance the platform without risking our already-optimized AI interactions, WebSocket protocol, and core game implementations.

---

## Table of Contents

1. [Current Strengths (DO NOT MODIFY)](#current-strengths-do-not-modify)
2. [Phase 1: Immediate Wins (1-2 weeks)](#phase-1-immediate-wins-1-2-weeks)
3. [Phase 2: Chess Engine Enhancements (2-4 weeks)](#phase-2-chess-engine-enhancements-2-4-weeks)
4. [Phase 3: Platform Unification (1-2 months)](#phase-3-platform-unification-1-2-months)
5. [Phase 4: Advanced Features (3+ months)](#phase-4-advanced-features-3-months)
6. [Deferred/Not Recommended](#deferrednot-recommended)

---

## Current Strengths (DO NOT MODIFY)

These systems are **production-ready** and should not be refactored without critical need:

### ✅ WebSocket Protocol (`src/websocket/`)
- 19-file comprehensive implementation
- Rate limiting, security, sessions, matchmaking all working
- <1ms latency achieved
- Protocol version 1.0.0 stable

### ✅ Chess AI Orchestration (`src/chess/ChessAI.ts`)
- Hybrid flow: Opening Book → Gemini → Minimax is optimal
- Difficulty scaling with ELO targeting works well
- `ChessAIMatch` for self-play is solid

### ✅ Training Module (`src/training/`)
- Session recording with 3 modes (FULL, SAMPLED, ACTIONS_ONLY)
- State normalizers for ML export
- A/B testing framework functional

### ✅ Agent CLI (`src/agent/`)
- Cross-platform key sending (Windows/macOS/Linux)
- State file parsing reliable
- WebSocket client integration complete

### ✅ UI Rendering (`src/ui/`)
- Chalk-based Chess board rendering (alignment fixed)
- Ink/React TUI stable
- All 6 games playable

---

## Phase 1: Immediate Wins (1-2 weeks)

### 1.1 Documentation & Release Polish

**Risk: None | Impact: High (visibility)**

```markdown
Tasks:
- [ ] Fix README.md clone URL (LikuBuddy → Liku-AI if mismatched)
- [ ] Add GitHub Release v2.0.0-alpha.1 with changelog
- [ ] Add badges to README (build status, npm version, license)
- [ ] Create examples/ folder with simple agent scripts
```

**Example: `examples/simple-agent.ts`**
```typescript
// Simple agent that plays TicTacToe via WebSocket
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3847');

ws.on('open', () => {
  // Create a game session
  ws.send(JSON.stringify({
    type: 'action',
    requestId: '1',
    payload: { action: 'game_create', gameType: 'tictactoe', mode: 'ai_vs_ai' }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg.type, msg.data);
});
```

### 1.2 Add Prometheus Metrics Export

**Risk: Low | Impact: Medium (observability)**

**File: `src/services/MetricsService.ts`**
```typescript
/**
 * Prometheus-compatible metrics for monitoring
 */
export class MetricsService {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  histogram(name: string, value: number): void {
    const arr = this.histograms.get(name) || [];
    arr.push(value);
    if (arr.length > 1000) arr.shift(); // Rolling window
    this.histograms.set(name, arr);
  }

  // Export in Prometheus format
  export(): string {
    let output = '';
    
    for (const [name, value] of this.counters) {
      output += `# TYPE ${name} counter\n${name} ${value}\n`;
    }
    
    for (const [name, value] of this.gauges) {
      output += `# TYPE ${name} gauge\n${name} ${value}\n`;
    }
    
    return output;
  }
}

export const metrics = new MetricsService();
```

**Integration points:**
- `src/websocket/server.ts`: Track connections, messages, latency
- `src/chess/ChessSearch.ts`: Track nodes/second, search depth
- `src/training/recorder.ts`: Track sessions recorded

### 1.3 Add Optional JWT Authentication

**Risk: Low | Impact: Medium (security)**

**File: `src/websocket/auth.ts`**
```typescript
import { createHmac } from 'crypto';

export interface AuthConfig {
  enabled: boolean;
  secret: string;
  tokenExpiry: number; // seconds
}

export function generateToken(agentId: string, secret: string): string {
  const payload = {
    agentId,
    exp: Date.now() + 3600000, // 1 hour
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig = createHmac('sha256', secret).update(data).digest('hex');
  return `${data}.${sig}`;
}

export function verifyToken(token: string, secret: string): { valid: boolean; agentId?: string } {
  try {
    const [data, sig] = token.split('.');
    const expectedSig = createHmac('sha256', secret).update(data).digest('hex');
    
    if (sig !== expectedSig) return { valid: false };
    
    const payload = JSON.parse(Buffer.from(data, 'base64').toString());
    if (payload.exp < Date.now()) return { valid: false };
    
    return { valid: true, agentId: payload.agentId };
  } catch {
    return { valid: false };
  }
}
```

**Usage:** Add `--auth` flag to server, require token in WebSocket handshake headers.

---

## Phase 2: Chess Engine Enhancements (2-4 weeks)

### 2.1 Fix Zobrist Hashing (CRITICAL)

**Risk: Medium | Impact: Very High (+200-400 ELO)**

The current implementation uses FEN substrings as hash keys, which defeats transposition table effectiveness.

**File: `src/chess/ChessZobrist.ts` (new)**
```typescript
/**
 * Proper Zobrist hashing for transposition table
 * Uses BigInt for 64-bit keys to minimize collisions
 */

// Pre-generated random keys (should be truly random, using crypto)
const PIECE_KEYS: bigint[][][] = []; // [color][pieceType][square]
const CASTLING_KEYS: bigint[] = [];   // [4 castling rights]
const EP_KEYS: bigint[] = [];         // [8 files]
const SIDE_KEY: bigint = 0n;          // XOR when black to move

function initZobristKeys(): void {
  const crypto = require('crypto');
  
  // Generate piece keys: 2 colors × 6 pieces × 64 squares
  for (let color = 0; color < 2; color++) {
    PIECE_KEYS[color] = [];
    for (let piece = 0; piece < 6; piece++) {
      PIECE_KEYS[color][piece] = [];
      for (let sq = 0; sq < 64; sq++) {
        PIECE_KEYS[color][piece][sq] = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
      }
    }
  }
  
  // Castling keys (4 rights: KQkq)
  for (let i = 0; i < 4; i++) {
    CASTLING_KEYS[i] = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
  }
  
  // En passant file keys
  for (let i = 0; i < 8; i++) {
    EP_KEYS[i] = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
  }
}

// Initialize on module load
initZobristKeys();

export function computeHash(fen: string): bigint {
  let hash = 0n;
  const parts = fen.split(' ');
  const position = parts[0];
  const turn = parts[1];
  const castling = parts[2];
  const ep = parts[3];
  
  // Hash pieces
  let sq = 0;
  for (const char of position) {
    if (char === '/') continue;
    if (/\d/.test(char)) {
      sq += parseInt(char);
      continue;
    }
    
    const color = char === char.toUpperCase() ? 0 : 1;
    const pieceType = 'pnbrqk'.indexOf(char.toLowerCase());
    if (pieceType >= 0) {
      hash ^= PIECE_KEYS[color][pieceType][sq];
    }
    sq++;
  }
  
  // Hash side to move
  if (turn === 'b') hash ^= SIDE_KEY;
  
  // Hash castling rights
  if (castling.includes('K')) hash ^= CASTLING_KEYS[0];
  if (castling.includes('Q')) hash ^= CASTLING_KEYS[1];
  if (castling.includes('k')) hash ^= CASTLING_KEYS[2];
  if (castling.includes('q')) hash ^= CASTLING_KEYS[3];
  
  // Hash en passant
  if (ep !== '-') {
    const file = ep.charCodeAt(0) - 'a'.charCodeAt(0);
    hash ^= EP_KEYS[file];
  }
  
  return hash;
}

export { PIECE_KEYS, CASTLING_KEYS, EP_KEYS, SIDE_KEY };
```

**Integration:** Update `ChessSearch.ts` to use `computeHash()` instead of FEN strings.

### 2.2 Improve Transposition Table

**Risk: Medium | Impact: High**

**Updates to `src/chess/ChessSearch.ts`:**
```typescript
// Replace TTEntry with proper structure
interface TTEntry {
  hash: bigint;           // Full hash for collision detection
  depth: number;
  score: number;
  flag: 'exact' | 'lower' | 'upper';
  bestMove: string;
  age: number;
}

// Use bucket design (4 entries per bucket)
class TranspositionTable {
  private buckets: TTEntry[][];
  private numBuckets: number;
  private currentAge: number = 0;

  constructor(sizeMB: number) {
    // ~64 bytes per entry, 4 per bucket
    this.numBuckets = Math.floor((sizeMB * 1024 * 1024) / (64 * 4));
    this.buckets = new Array(this.numBuckets);
    for (let i = 0; i < this.numBuckets; i++) {
      this.buckets[i] = [];
    }
  }

  store(hash: bigint, entry: Omit<TTEntry, 'hash' | 'age'>): void {
    const idx = Number(hash % BigInt(this.numBuckets));
    const bucket = this.buckets[idx];
    
    // Find slot: prefer same hash, then lowest depth, then oldest
    let replaceIdx = 0;
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i].hash === hash) {
        replaceIdx = i;
        break;
      }
      if (bucket[i].depth < bucket[replaceIdx].depth ||
          bucket[i].age < bucket[replaceIdx].age) {
        replaceIdx = i;
      }
    }
    
    if (bucket.length < 4) {
      bucket.push({ ...entry, hash, age: this.currentAge });
    } else {
      bucket[replaceIdx] = { ...entry, hash, age: this.currentAge };
    }
  }

  probe(hash: bigint): TTEntry | null {
    const idx = Number(hash % BigInt(this.numBuckets));
    const bucket = this.buckets[idx];
    
    for (const entry of bucket) {
      if (entry.hash === hash) {
        return entry;
      }
    }
    return null;
  }

  newSearch(): void {
    this.currentAge++;
  }
}
```

### 2.3 Add Futility Pruning

**Risk: Low | Impact: Medium (+50-100 ELO)**

**Add to `ChessSearch.ts` in `negamax()`:**
```typescript
// Futility pruning - skip moves that can't possibly raise alpha
const FUTILITY_MARGINS = [0, 200, 300, 500]; // centipawns per depth

if (depth <= 3 && 
    !inCheck && 
    !pvNode &&
    Math.abs(alpha) < MATE_THRESHOLD) {
  
  const staticEval = this.evaluator.evaluate(fen);
  const futilityMargin = FUTILITY_MARGINS[depth];
  
  if (staticEval + futilityMargin <= alpha) {
    // Position is so bad that even a big improvement won't help
    // Still search captures in qsearch
    return this.quiescence(fen, alpha, beta, 0);
  }
}
```

### 2.4 Add Pawn Hash Table

**Risk: Low | Impact: Medium (performance)**

```typescript
// Cache expensive pawn structure evaluation
class PawnHashTable {
  private table: Map<string, { score: number; features: PawnFeatures }> = new Map();
  private maxSize: number = 100000;

  getPawnKey(fen: string): string {
    // Extract only pawn positions from FEN
    const position = fen.split(' ')[0];
    return position.replace(/[^pP\/]/g, '');
  }

  probe(fen: string): { score: number; features: PawnFeatures } | null {
    return this.table.get(this.getPawnKey(fen)) || null;
  }

  store(fen: string, score: number, features: PawnFeatures): void {
    if (this.table.size >= this.maxSize) {
      // Simple eviction: clear half
      const keys = Array.from(this.table.keys());
      for (let i = 0; i < keys.length / 2; i++) {
        this.table.delete(keys[i]);
      }
    }
    this.table.set(this.getPawnKey(fen), { score, features });
  }
}
```

### 2.5 Expand Opening Book

**Risk: None | Impact: Medium**

**Option A: Load Polyglot .bin files**
```typescript
// src/chess/PolyglotBook.ts
import { readFileSync } from 'fs';

interface PolyglotEntry {
  key: bigint;
  move: number;
  weight: number;
  learn: number;
}

export class PolyglotBook {
  private entries: Map<bigint, PolyglotEntry[]> = new Map();

  load(path: string): void {
    const buffer = readFileSync(path);
    
    for (let i = 0; i < buffer.length; i += 16) {
      const key = buffer.readBigUInt64BE(i);
      const move = buffer.readUInt16BE(i + 8);
      const weight = buffer.readUInt16BE(i + 10);
      const learn = buffer.readUInt32BE(i + 12);
      
      const existing = this.entries.get(key) || [];
      existing.push({ key, move, weight, learn });
      this.entries.set(key, existing);
    }
  }

  lookup(hash: bigint): { from: string; to: string; promotion?: string } | null {
    const entries = this.entries.get(hash);
    if (!entries || entries.length === 0) return null;
    
    // Weighted random selection
    const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
    let rand = Math.random() * totalWeight;
    
    for (const entry of entries) {
      rand -= entry.weight;
      if (rand <= 0) {
        return this.decodeMove(entry.move);
      }
    }
    
    return this.decodeMove(entries[0].move);
  }

  private decodeMove(move: number): { from: string; to: string; promotion?: string } {
    const toFile = move & 7;
    const toRank = (move >> 3) & 7;
    const fromFile = (move >> 6) & 7;
    const fromRank = (move >> 9) & 7;
    const promo = (move >> 12) & 7;
    
    const files = 'abcdefgh';
    const from = files[fromFile] + (fromRank + 1);
    const to = files[toFile] + (toRank + 1);
    const promotion = promo ? 'nbrq'[promo - 1] : undefined;
    
    return { from, to, promotion };
  }
}
```

**Option B: Expand hard-coded book (simpler)**
- Add 50+ more opening lines from ECO database
- Include popular responses to 1.d4, 1.c4, 1.Nf3

---

## Phase 3: Platform Unification (1-2 months)

### 3.1 GameProtocol Interface

**Risk: Medium | Impact: High (scalability)**

Create a unified interface so all games can be controlled the same way:

**File: `src/core/GameProtocol.ts`**
```typescript
/**
 * Unified game protocol for multi-game agent coordination
 */

export interface GameState {
  gameType: string;
  turn: 'player' | 'ai' | 'X' | 'O' | 'w' | 'b';
  isTerminal: boolean;
  winner?: string;
  score: number;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface GameAction {
  type: 'key' | 'move' | 'cell' | 'custom';
  payload: unknown;
}

export interface GameProtocol {
  readonly id: string;
  
  // State management
  getState(): GameState;
  getSerializedState(): string; // For WebSocket (FEN, JSON grid, etc.)
  
  // Actions
  getLegalActions(): GameAction[];
  applyAction(action: GameAction): { 
    valid: boolean; 
    newState: GameState; 
    reward?: number;
  };
  
  // Rendering
  renderAscii(): string;
  
  // AI (optional)
  getAISuggestion?(difficulty: string): Promise<{
    action: GameAction;
    evaluation?: number;
    explanation?: string;
  }>;
  
  // Lifecycle
  reset(): void;
  isGameOver(): boolean;
}
```

**Implementation priority:**
1. Chess already fits this pattern (adapter needed)
2. TicTacToe (simple, good test case)
3. Snake (real-time, different action space)
4. Others as needed

### 3.2 Self-Play Training Loop

**Risk: Low | Impact: High (research capability)**

**File: `scripts/self-improve.ts`**
```typescript
#!/usr/bin/env node
/**
 * Self-improvement loop for chess engine
 * Plays games against itself, tracks ELO, exports training data
 */

import { ChessAIMatch, ChessAI } from '../src/chess/index.js';
import { sessionRecorder } from '../src/training/recorder.js';
import { writeFileSync } from 'fs';

interface GenerationResult {
  generation: number;
  games: number;
  wins: { white: number; black: number; draws: number };
  avgMoves: number;
  eloEstimate: number;
}

async function selfImprove(config: {
  generations: number;
  gamesPerGen: number;
  baseDepth: number;
  outputDir: string;
}) {
  const results: GenerationResult[] = [];
  
  for (let gen = 0; gen < config.generations; gen++) {
    console.log(`\n=== Generation ${gen + 1}/${config.generations} ===\n`);
    
    const genResult: GenerationResult = {
      generation: gen + 1,
      games: config.gamesPerGen,
      wins: { white: 0, black: 0, draws: 0 },
      avgMoves: 0,
      eloEstimate: 1200 + gen * 50, // Placeholder
    };
    
    let totalMoves = 0;
    const pgns: string[] = [];
    
    for (let g = 0; g < config.gamesPerGen; g++) {
      // Slight variation in depth for diversity
      const whiteDepth = config.baseDepth + (g % 2);
      const blackDepth = config.baseDepth + ((g + 1) % 2);
      
      const match = new ChessAIMatch(
        { maxDepth: whiteDepth, useGemini: false },
        { maxDepth: blackDepth, useGemini: false }
      );
      
      const result = await match.playGame(200, 0);
      
      pgns.push(result.pgn);
      totalMoves += result.moveHistory.length;
      
      if (result.result === '1-0') genResult.wins.white++;
      else if (result.result === '0-1') genResult.wins.black++;
      else genResult.wins.draws++;
      
      process.stdout.write('.');
    }
    
    genResult.avgMoves = totalMoves / config.gamesPerGen;
    results.push(genResult);
    
    // Save PGNs for training
    writeFileSync(
      `${config.outputDir}/gen${gen + 1}.pgn`,
      pgns.join('\n\n')
    );
    
    console.log(`\nResults: W:${genResult.wins.white} B:${genResult.wins.black} D:${genResult.wins.draws}`);
    console.log(`Avg moves: ${genResult.avgMoves.toFixed(1)}`);
  }
  
  // Save summary
  writeFileSync(
    `${config.outputDir}/summary.json`,
    JSON.stringify(results, null, 2)
  );
  
  console.log(`\n✅ Complete! Results saved to ${config.outputDir}/`);
}

// Run
selfImprove({
  generations: 10,
  gamesPerGen: 50,
  baseDepth: 4,
  outputDir: './training-data',
}).catch(console.error);
```

### 3.3 Multi-PV WebSocket Streaming

**Risk: Low | Impact: Medium (analysis features)**

Add real-time search info streaming:

```typescript
// In ChessSearch.ts, emit events during search:
this.emit('searchInfo', {
  depth: currentDepth,
  score: bestScore,
  nodes: this.stats.nodes,
  nps: Math.round(this.stats.nodes / ((Date.now() - startTime) / 1000)),
  pv: this.getPV(),
  time: Date.now() - startTime,
});

// In websocket/server.ts, forward to subscribed clients:
search.on('searchInfo', (info) => {
  broadcastToSession(sessionId, {
    type: 'event',
    data: { event: 'search:info', ...info },
    timestamp: Date.now(),
  });
});
```

---

## Phase 4: Advanced Features (3+ months)

### 4.1 NNUE Evaluation (Future)

**Risk: High | Impact: Very High**

Would require:
- Train neural network on self-play data
- Use TensorFlow.js or ONNX runtime
- HalfKP or HalfKA architecture
- Incremental updates during search

**Recommendation:** Defer until classical improvements exhausted. Current eval is solid.

### 4.2 WASM Search Engine (Future)

**Risk: High | Impact: High (performance)**

Port search to Rust/AssemblyScript for 10-50x speedup:
- Keep TypeScript for orchestration/UI
- WASM for hot path (negamax, eval)
- Worker threads for parallel search

**Recommendation:** Only if NPS becomes bottleneck for target use cases.

### 4.3 Vision Mode for Agents (Future)

**Risk: Medium | Impact: Medium**

```typescript
// Screenshot terminal → PNG → Send to Gemini Vision
import { captureTerminal } from 'ansi-to-image';

async function getVisionMove(terminalContent: string): Promise<string> {
  const image = await captureTerminal(terminalContent);
  const base64 = image.toString('base64');
  
  // Send to Gemini 1.5 Pro Vision
  const response = await genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })
    .generateContent([
      { inlineData: { mimeType: 'image/png', data: base64 } },
      'Analyze this chess position and suggest the best move for the current player.'
    ]);
  
  return parseMove(response.text());
}
```

**Recommendation:** Interesting for demos but not critical for engine strength.

---

## Deferred/Not Recommended

### ❌ Major WebSocket Protocol Changes
- Current protocol is stable and well-documented
- Breaking changes would affect all agent integrations
- Only change for critical security issues

### ❌ React/Ink Framework Replacement
- UI is stable and performant
- Switching to blessed/terminal-kit not worth effort
- Focus on game logic, not rendering

### ❌ Multi-Language Ports
- TypeScript codebase is maintainable
- Python/Rust ports would split effort
- Keep single source of truth

### ❌ Cloud/Serverless Deployment
- Current local-first design is appropriate for alpha
- Cloud adds complexity without clear user demand
- Defer until community requests it

---

## Implementation Checklist

### Week 1-2 (Phase 1)
- [ ] Fix any README inconsistencies
- [ ] Add GitHub Release v2.0.0-alpha.1
- [ ] Create `examples/` folder with 2-3 agent scripts
- [ ] Add MetricsService (optional)
- [ ] Add JWT auth option (optional)

### Week 3-4 (Phase 2 Start)
- [x] Implement proper Zobrist hashing ✅ (Dec 14, 2025)
- [x] Upgrade TranspositionTable to bucket design ✅ (Dec 14, 2025)
- [x] Add futility pruning ✅ (Dec 14, 2025)
- [x] Add pawn hash table ✅ (Dec 14, 2025)

### Month 2 (Phase 2 Complete)
- [x] Expand opening book (Polyglot or extended hard-coded) ✅ (Dec 14, 2025)
- [ ] Run benchmark suite to measure ELO improvement
- [ ] Document chess engine architecture

### Month 3+ (Phase 3)
- [x] Design GameProtocol interface ✅ (Dec 14, 2025) - `src/core/GameProtocol.ts`
- [x] Implement for TicTacToe as proof-of-concept ✅ (Dec 14, 2025) - `src/core/TicTacToeProtocol.ts`
- [x] Add GameProtocol tests (39 passing) ✅ (Dec 14, 2025) - `__tests__/GameProtocol.test.ts`
- [ ] Create self-play training script
- [ ] Add multi-PV streaming

---

## Estimated Impact Summary

| Improvement | ELO Impact | Dev Time | Risk | Status |
|-------------|------------|----------|------|--------|
| Fix Zobrist Hashing | +200-400 | 1-2 days | Medium | ✅ Done |
| Bucket TT Design | +50-100 | 2-3 days | Medium | ✅ Done |
| Futility Pruning | +50-100 | 1 day | Low | ✅ Done |
| Pawn Hash Table | +30-50 | 1 day | Low | ✅ Done |
| Extended Book | +50-100 | 2-3 days | None | ✅ Done |
| GameProtocol | N/A | 1-2 weeks | Medium | ✅ Done |
| TicTacToeProtocol | N/A | 1 day | Low | ✅ Done |
| Self-Play Loop | N/A | 1 week | Low | Pending |
| Metrics/Auth | N/A | 2-3 days | Low | Pending |

**Completed Chess ELO Gain:** +380-750 (Zobrist + Bucket TT + Futility + Pawn Hash + Extended Book)
**Total Potential Chess ELO Gain:** +400-750 (Phase 2 Complete!)

---

## Developer Notes

### Testing Commands
```bash
# Watch mode (interactive, stays running)
npm test

# Single run (for CI/scripts)
npm run test:run

# PowerShell with output filtering (use --run to avoid hang)
npm test -- --run 2>&1 | Select-Object -Last 15
```

### Current Test Status
- **475 tests passing**, 1 skipped
- All chess, WebSocket, training, and session tests green

---

*This roadmap prioritizes safe, high-impact improvements while preserving our stable WebSocket protocol, AI orchestration, and UI rendering systems.*
