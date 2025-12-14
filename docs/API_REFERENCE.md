# API Reference

Complete reference for the Liku-AI WebSocket API and TypeScript modules.

---

## Table of Contents

- [WebSocket Protocol](#websocket-protocol)
- [Client Commands](#client-commands)
- [Server Events](#server-events)
- [Query System](#query-system)
- [Chess Actions](#chess-actions)
- [TypeScript API](#typescript-api)
- [Error Codes](#error-codes)

---

## WebSocket Protocol

### Connection

```
Endpoint: ws://localhost:3847
Protocol: liku-ai-v1
```

### Message Format

All messages are JSON with this base structure:

```typescript
interface Message {
  type: string;        // Message type
  requestId?: string;  // Optional tracking ID
  timestamp?: number;  // Unix timestamp (ms)
}
```

### Welcome Message

Received on successful connection:

```json
{
  "type": "welcome",
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "protocolVersion": "1.0.0",
  "serverTime": 1702584000000,
  "capabilities": ["state", "commands", "queries", "events"]
}
```

---

## Client Commands

### Key Command

Send raw keyboard input.

```json
{
  "type": "key",
  "key": "ArrowUp",
  "requestId": "req-001"
}
```

**Supported Keys:**

| Key | Description | Games |
|-----|-------------|-------|
| `ArrowUp` | Move up / Jump | All |
| `ArrowDown` | Move down / Duck | All |
| `ArrowLeft` | Move left | Snake, Chess |
| `ArrowRight` | Move right | Snake, Chess |
| `Enter` | Confirm / Select | All |
| `Escape` | Exit / Cancel | All |
| `Space` | Jump / Action | Dino |

### Action Command

Send high-level game actions (recommended).

```json
{
  "type": "action",
  "action": "jump",
  "params": {},
  "requestId": "req-002"
}
```

**Action Vocabulary:**

| Action | Games | Description |
|--------|-------|-------------|
| `jump` | Dino | Jump over obstacle |
| `duck` | Dino | Duck under obstacle |
| `stand` | Dino | Return to standing |
| `turn_left` | Snake | Turn snake left |
| `turn_right` | Snake | Turn snake right |
| `turn_up` | Snake | Turn snake up |
| `turn_down` | Snake | Turn snake down |
| `place_mark` | TicTacToe | Place X/O at position |
| `chess_move` | Chess | Make chess move |
| `start` | All | Start game |
| `restart` | All | Restart game |
| `pause` | All | Pause game |

### Subscribe Command

Subscribe to specific events.

```json
{
  "type": "subscribe",
  "events": ["game:start", "game:end", "score:update"],
  "requestId": "req-003"
}
```

### Query Command

Request data from server.

```json
{
  "type": "query",
  "query": "gameState",
  "params": {},
  "requestId": "req-004"
}
```

---

## Server Events

### State Update

Broadcast whenever game state changes.

```json
{
  "type": "state",
  "game": "chess",
  "state": {
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "turn": "black",
    "gameOver": false,
    "legalMoves": ["e5", "e6", "d5", "d6", "..."]
  },
  "timestamp": 1702584001000
}
```

### Event Notification

```json
{
  "type": "event",
  "event": "game:end",
  "data": {
    "winner": "white",
    "reason": "checkmate"
  },
  "timestamp": 1702584002000
}
```

### Command Acknowledgment

```json
{
  "type": "ack",
  "requestId": "req-001",
  "success": true,
  "result": { "moved": true }
}
```

### Error Response

```json
{
  "type": "error",
  "requestId": "req-001",
  "code": "INVALID_ACTION",
  "message": "Action 'fly' is not valid for game 'chess'"
}
```

---

## Query System

### Available Queries

| Query | Description | Response |
|-------|-------------|----------|
| `gameState` | Current game state | Full state object |
| `possibleActions` | Valid actions now | `string[]` |
| `history` | Recent game events | `Event[]` |
| `stats` | Player statistics | `Stats` object |
| `leaderboard` | High scores | `LeaderboardEntry[]` |
| `agentInfo` | Connected agent info | `AgentInfo` object |

### Query Examples

**Get Current State:**
```json
{ "type": "query", "query": "gameState" }
```

Response:
```json
{
  "type": "queryResult",
  "query": "gameState",
  "result": {
    "game": "snake",
    "score": 45,
    "snake": [[10, 10], [10, 11], [10, 12]],
    "food": [5, 5],
    "direction": "up",
    "gameOver": false
  }
}
```

**Get Possible Actions:**
```json
{ "type": "query", "query": "possibleActions" }
```

Response:
```json
{
  "type": "queryResult",
  "query": "possibleActions",
  "result": ["turn_left", "turn_right", "turn_up"]
}
```

---

## Chess Actions

### Make Move

```json
{
  "type": "action",
  "action": "chess_move",
  "params": {
    "move": "e4",      // SAN notation
    "sessionId": "game-123"
  }
}
```

Alternative move formats:
- SAN: `"e4"`, `"Nf3"`, `"O-O"`, `"exd5"`
- UCI: `"e2e4"`, `"g1f3"`, `"e1g1"`

### Resign

```json
{
  "type": "action",
  "action": "chess_resign",
  "params": { "sessionId": "game-123" }
}
```

### Offer Draw

```json
{
  "type": "action",
  "action": "chess_draw_offer",
  "params": { "sessionId": "game-123" }
}
```

### Get Hint

```json
{
  "type": "action",
  "action": "chess_hint",
  "params": {
    "sessionId": "game-123",
    "depth": 4
  }
}
```

Response:
```json
{
  "type": "ack",
  "result": {
    "bestMove": "Nf3",
    "evaluation": 0.35,
    "pv": ["Nf3", "Nc6", "Bb5"]
  }
}
```

---

## TypeScript API

### LikuAIClient

```typescript
import { LikuAIClient } from 'liku-ai';

const client = new LikuAIClient('ws://localhost:3847', {
  heartbeatInterval: 30000,
  reconnectInterval: 1000,
  maxReconnectAttempts: 10,
});

// Event handlers
client.on('connected', () => console.log('Connected!'));
client.on('state', (state) => console.log('State:', state));
client.on('event', (event) => console.log('Event:', event));
client.on('error', (error) => console.error('Error:', error));
client.on('disconnected', () => console.log('Disconnected'));

// Send commands
client.sendKey('ArrowUp');
client.sendAction('jump');
client.sendAction('chess_move', { move: 'e4' });

// Query data
const state = await client.query('gameState');
const actions = await client.query('possibleActions');

// Subscribe to events
client.subscribe(['game:start', 'game:end']);

// Disconnect
client.disconnect();
```

### ChessAI

```typescript
import { ChessAI } from 'liku-ai/chess';

const ai = new ChessAI({
  difficulty: 'advanced', // beginner | intermediate | advanced | grandmaster
  maxDepth: 6,
  maxTime: 5000, // ms
  useOpeningBook: true,
});

// Get best move
const move = await ai.getMove(fen);
console.log(move); // { move: 'Nf3', evaluation: 0.35, depth: 6 }

// Get move with explanation (requires Gemini API key)
const explained = await ai.getMoveWithExplanation(fen);
console.log(explained.explanation);
// "Nf3 develops the knight to a strong central square..."
```

### SessionRecorder

```typescript
import { SessionRecorder, DataExporter } from 'liku-ai/training';

// Record a session
const recorder = new SessionRecorder({
  gameType: 'chess',
  agents: [{ id: 'white', type: 'ai' }, { id: 'black', type: 'ai' }],
});

recorder.start();
recorder.recordFrame(state, action, reward);
const session = recorder.end('white_wins');

// Export data
const exporter = new DataExporter();
await exporter.export(session, 'game.jsonl', 'jsonl');
```

### AnalyticsEngine

```typescript
import { AnalyticsEngine } from 'liku-ai/training';

const analytics = new AnalyticsEngine({
  initialRating: 1200,
  kFactor: 32,
});

// Process sessions
analytics.processSession(session);

// Get agent stats
const stats = analytics.getAgentStats('agent-1');
console.log(stats.rating, stats.winRate);

// Compare agents
const comparison = analytics.compareAgents('agent-1', 'agent-2');
console.log(comparison.headToHead);
```

---

## Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `INVALID_MESSAGE` | Malformed JSON | Check message format |
| `INVALID_ACTION` | Unknown action type | See action vocabulary |
| `INVALID_PARAMS` | Missing/wrong params | Check required params |
| `RATE_LIMITED` | Too many requests | Reduce command rate |
| `NOT_YOUR_TURN` | Action out of turn | Wait for your turn |
| `GAME_NOT_FOUND` | Invalid session ID | Check session exists |
| `GAME_OVER` | Game already ended | Start new game |
| `UNAUTHORIZED` | Auth required | Provide JWT token |
| `INTERNAL_ERROR` | Server error | Report bug |

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Commands | 100/s | Per client |
| Queries | 50/s | Per client |
| Connections | 1000 | Total |

---

## Health Endpoints

```
GET http://localhost:3848/health   # Overall health
GET http://localhost:3848/ready    # Ready for traffic
GET http://localhost:3848/live     # Liveness probe
GET http://localhost:3848/metrics  # Prometheus metrics
```

---

*For more details, see [WEBSOCKET_PROTOCOL.md](./WEBSOCKET_PROTOCOL.md)*
