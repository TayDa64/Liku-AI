# Liku-AI WebSocket Protocol Specification

**Version**: 1.0.0  
**Last Updated**: December 2024

---

## Overview

The Liku-AI WebSocket API provides real-time bidirectional communication between AI agents and the Liku game platform. This document specifies the complete protocol for connecting, sending commands, receiving state updates, and handling errors.

## Connection

### Endpoint
```
ws://localhost:3847
```

### Handshake
Standard WebSocket handshake with optional protocol header:
```
Sec-WebSocket-Protocol: liku-ai-v1
```

### Welcome Message
Upon successful connection, the server sends:
```json
{
  "type": "welcome",
  "clientId": "uuid-v4-string",
  "protocolVersion": "1.0.0",
  "serverTime": 1703123456789,
  "capabilities": ["state", "commands", "queries", "events"]
}
```

---

## Message Format

All messages are JSON with the following base structure:

```typescript
interface BaseMessage {
  type: string;           // Message type identifier
  requestId?: string;     // Optional request tracking ID
  timestamp?: number;     // Unix timestamp in milliseconds
}
```

---

## Client → Server Messages

### 1. Key Command (`key`)
Send a raw keyboard key press.

```json
{
  "type": "key",
  "key": "ArrowUp",
  "requestId": "req-123"
}
```

**Supported Keys:**
| Key | Description |
|-----|-------------|
| `ArrowUp` | Move up / Jump |
| `ArrowDown` | Move down / Duck |
| `ArrowLeft` | Move left |
| `ArrowRight` | Move right |
| `Enter` | Confirm / Start |
| `Escape` | Exit / Menu |
| `Space` | Jump / Action |

### 2. Action Command (`action`)
Send a high-level game action (recommended over raw keys).

```json
{
  "type": "action",
  "action": "jump",
  "requestId": "req-124"
}
```

**Action Vocabulary:**

| Action | Games | Mapped Key |
|--------|-------|------------|
| `jump` | Dino | Space |
| `duck` | Dino | ArrowDown |
| `stand` | Dino | ArrowUp |
| `turn_left` | Snake | ArrowLeft |
| `turn_right` | Snake | ArrowRight |
| `turn_up` | Snake | ArrowUp |
| `turn_down` | Snake | ArrowDown |
| `start` | All | Enter |
| `restart` | All | Enter |
| `pause` | All | Escape |
| `select` | Menu | Enter |
| `navigate_up` | Menu | ArrowUp |
| `navigate_down` | Menu | ArrowDown |

### 3. Query Command (`query`)
Request specific game data.

```json
{
  "type": "query",
  "query": "gameState",
  "requestId": "req-125"
}
```

**Query Types:**
- `gameState` - Current full game state
- `possibleActions` - Valid actions in current state
- `history` - Recent state history (last 100 states)
- `stats` - Player statistics from database

### 4. Subscribe (`subscribe`)
Subscribe to specific event types.

```json
{
  "type": "subscribe",
  "events": ["game:start", "score:update", "collision"]
}
```

### 5. Unsubscribe (`unsubscribe`)
Stop receiving specific event types.

```json
{
  "type": "unsubscribe",
  "events": ["score:update"]
}
```

### 6. Ping (`ping`)
Keep-alive message. Server responds with `pong`.

```json
{
  "type": "ping",
  "timestamp": 1703123456789
}
```

---

## Server → Client Messages

### 1. State Broadcast (`state`)
Periodic game state updates (every frame during gameplay).

```json
{
  "type": "state",
  "timestamp": 1703123456789,
  "source": "websocket",
  "game": "snake",
  "status": "playing",
  "score": 15,
  "level": 1,
  "frame": "┌──────────────┐\n│              │\n│   ●●●>       │\n│         🍎   │\n│              │\n└──────────────┘",
  "structuredData": { /* Game-specific data */ }
}
```

### 2. Response (`response`)
Direct response to a client request.

```json
{
  "type": "response",
  "requestId": "req-123",
  "success": true,
  "action": "jump",
  "result": {
    "executed": true,
    "message": "Command executed successfully"
  },
  "latencyMs": 2
}
```

### 3. Event (`event`)
Game events for subscribed clients.

```json
{
  "type": "event",
  "event": "score:update",
  "data": {
    "previousScore": 10,
    "newScore": 15,
    "cause": "food_eaten"
  },
  "timestamp": 1703123456789
}
```

### 4. Error (`error`)
Error response for failed requests.

```json
{
  "type": "error",
  "requestId": "req-123",
  "code": "RATE_LIMITED",
  "message": "Too many requests. Please slow down.",
  "retryAfter": 1000
}
```

### 5. Pong (`pong`)
Response to client ping.

```json
{
  "type": "pong",
  "timestamp": 1703123456789,
  "serverTime": 1703123456790
}
```

---

## Structured Game States

### Snake Game State

```json
{
  "type": "state",
  "game": "snake",
  "structuredData": {
    "snake": {
      "head": { "x": 10, "y": 5 },
      "body": [
        { "x": 9, "y": 5 },
        { "x": 8, "y": 5 }
      ],
      "direction": "right",
      "length": 3
    },
    "food": { "x": 15, "y": 8 },
    "grid": {
      "width": 20,
      "height": 15
    },
    "dangers": [
      {
        "type": "wall",
        "position": { "x": 0, "y": 5 },
        "distanceFromHead": 10
      }
    ],
    "pathfinding": {
      "distanceToFood": 8,
      "optimalDirection": "right",
      "openPathDirections": ["up", "right", "down"],
      "blockedDirections": ["left"]
    },
    "recommendation": {
      "action": "go_straight",
      "reason": "Direct path to food is clear",
      "confidence": 0.95
    }
  }
}
```

### Dino Game State

```json
{
  "type": "state",
  "game": "dino",
  "structuredData": {
    "dino": {
      "y": 0,
      "isJumping": false,
      "isDucking": false,
      "canJump": true
    },
    "obstacles": [
      {
        "type": "cactus",
        "x": 45,
        "width": 3,
        "height": 2
      },
      {
        "type": "bird",
        "x": 80,
        "y": 1,
        "width": 4
      }
    ],
    "nextObstacle": {
      "type": "cactus",
      "distance": 25,
      "framesUntilImpact": 12,
      "urgency": "medium"
    },
    "speed": 1.2,
    "groundY": 0,
    "recommendation": {
      "action": "wait",
      "reason": "Obstacle too far, save jump",
      "shouldJump": false,
      "optimalJumpFrame": 8
    }
  }
}
```

### TicTacToe Game State

```json
{
  "type": "state",
  "game": "tictactoe",
  "structuredData": {
    "board": [
      ["X", null, "O"],
      [null, "X", null],
      [null, null, null]
    ],
    "currentPlayer": "X",
    "moveCount": 4,
    "gameOver": false,
    "winner": null,
    "validMoves": [
      { "row": 0, "col": 1 },
      { "row": 1, "col": 0 },
      { "row": 1, "col": 2 },
      { "row": 2, "col": 0 },
      { "row": 2, "col": 1 },
      { "row": 2, "col": 2 }
    ],
    "minimax": {
      "bestMove": { "row": 2, "col": 2 },
      "evaluation": 1,
      "isWinning": true,
      "movesAnalyzed": 42
    },
    "recommendation": {
      "action": "place_mark",
      "position": { "row": 2, "col": 2 },
      "reason": "Winning move - creates fork",
      "confidence": 1.0
    }
  }
}
```

---

## Error Codes

| Code | Description | Retry? |
|------|-------------|--------|
| `INVALID_MESSAGE` | Malformed JSON or missing fields | No |
| `UNKNOWN_TYPE` | Unknown message type | No |
| `INVALID_KEY` | Key not in allowed list | No |
| `INVALID_ACTION` | Action not recognized | No |
| `RATE_LIMITED` | Too many requests | Yes, after `retryAfter` ms |
| `CLIENT_BANNED` | Client temporarily banned | Yes, after `banExpiresAt` |
| `INTERNAL_ERROR` | Server error | Maybe |
| `NOT_IN_GAME` | Command sent outside of game | No |

---

## Rate Limiting

To prevent abuse and ensure fair access:

| Limit | Value |
|-------|-------|
| Max commands/second | 20 |
| Burst limit | 5 commands in 100ms |
| Cooldown after burst | 50ms |
| Ban threshold | 50 violations |
| Ban duration | 60 seconds |

### Rate Limit Response
```json
{
  "type": "error",
  "code": "RATE_LIMITED",
  "message": "Rate limit exceeded",
  "retryAfter": 50,
  "remaining": 0,
  "reset": 1703123457000
}
```

---

## Heartbeat / Keep-Alive

The server sends ping frames every 30 seconds. Clients must respond with pong within 10 seconds or the connection will be terminated.

**Server Configuration:**
```typescript
{
  heartbeatInterval: 30000,  // 30 seconds
  heartbeatTimeout: 10000,   // 10 seconds
  maxMissedHeartbeats: 2
}
```

---

## Connection Lifecycle

```
1. Client connects to ws://localhost:3847
2. Server accepts, assigns clientId, sends welcome
3. Client optionally subscribes to events
4. During gameplay:
   - Server broadcasts state on every frame
   - Client sends commands as needed
   - Server sends events for subscribed types
5. Client disconnects or connection times out
6. Server cleans up client resources
```

---

## TypeScript Types

Full TypeScript types are available via the client library:

```typescript
import { 
  LikuAIClient,
  GameState,
  AICommand,
  AIResponse,
  SnakeGameState,
  DinoGameState,
  TicTacToeGameState
} from 'liku-ai/websocket';

const client = new LikuAIClient('ws://localhost:3847');
client.onState((state: GameState) => {
  if (state.game === 'snake') {
    const snakeData = state.structuredData as SnakeGameState;
    console.log(snakeData.pathfinding.optimalDirection);
  }
});
```

---

## Example: AI Agent Connection

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3847');

ws.on('open', () => {
  console.log('Connected to Liku-AI');
  
  // Subscribe to game events
  ws.send(JSON.stringify({
    type: 'subscribe',
    events: ['game:start', 'collision']
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  
  if (msg.type === 'state' && msg.game === 'dino') {
    const dino = msg.structuredData;
    
    // Use AI recommendation
    if (dino.recommendation.shouldJump) {
      ws.send(JSON.stringify({
        type: 'action',
        action: 'jump',
        requestId: `req-${Date.now()}`
      }));
    }
  }
});

ws.on('close', () => {
  console.log('Disconnected');
});
```

---

## Security Considerations

1. **Input Validation**: All incoming messages are validated against schema
2. **Rate Limiting**: Prevents command spam and DoS attacks
3. **Client Isolation**: Each client has independent rate limit tracking
4. **Graceful Degradation**: Malformed messages are rejected, not crashed
5. **Timeout Handling**: Inactive connections are cleaned up
6. **Ban System**: Repeat offenders are temporarily blocked

---

## Multi-Agent Support (Phase 3)

### Agent Identity

Agents can authenticate and identify themselves on connection:

```
ws://localhost:3847?name=MyBot&type=gemini&token=secret-token
```

Or via headers:
```
X-Liku-Agent-Name: MyBot
X-Liku-Agent-Type: gemini
X-Liku-Agent-Token: secret-token
```

#### Agent Roles
- **player**: Full control - can send commands and receive state
- **spectator**: Read-only - receives state but cannot send commands
- **admin**: Administrative - can manage other agents
- **trainer**: Training mode - records actions for ML

### Turn Management

When `turnMode` is configured, agents take turns:

#### Turn Modes
- **free**: All agents can send commands anytime (default)
- **round_robin**: Agents take turns in order
- **priority**: Higher priority agents go first
- **timed**: Each agent has a time limit per turn
- **cooperative**: Multiple agents can act simultaneously

#### Turn State Message
```json
{
  "type": "event",
  "event": "turn:change",
  "data": {
    "agentId": "agent_xxx",
    "isYourTurn": true,
    "commandsRemaining": 1,
    "timeRemainingMs": 30000
  }
}
```

### Agent Coordination

#### Direct Messaging
```json
{
  "type": "action",
  "action": "message",
  "payload": {
    "to": "agent_target",
    "message": { "strategy": "attack" },
    "topic": "game:tactics"
  }
}
```

#### Broadcast
```json
{
  "type": "action",
  "action": "broadcast",
  "payload": {
    "message": { "announcement": "Ready!" },
    "topic": "game:status"
  }
}
```

#### Team Messaging
```json
{
  "type": "action",
  "action": "teamMessage",
  "payload": {
    "teamId": "team_xxx",
    "message": { "plan": "coordinate" }
  }
}
```

### Coordination Primitives

#### Locks
```json
// Acquire
{
  "type": "action",
  "action": "acquireLock",
  "payload": { "name": "game:control", "timeout": 30000 }
}

// Release
{
  "type": "action",
  "action": "releaseLock",
  "payload": { "name": "game:control" }
}
```

#### Barriers
```json
// Wait at barrier
{
  "type": "action",
  "action": "waitAtBarrier",
  "payload": { "name": "sync-point" }
}
```

#### Shared State
```json
// Update
{
  "type": "action",
  "action": "updateSharedState",
  "payload": {
    "name": "game:score",
    "value": { "team1": 10, "team2": 5 },
    "expectedVersion": 3
  }
}

// Subscribe
{
  "type": "action",
  "action": "subscribeSharedState",
  "payload": { "name": "game:score" }
}
```

---

## Game Sessions (AI-vs-AI Gameplay)

Phase 3.4 adds support for AI-vs-AI gameplay through the GameSessionManager.

### Session Lifecycle

1. **Create Session** - Create a game room
2. **Join Session** - Players join available slots (X/O, white/black)
3. **Game Start** - Auto-starts when all slots filled (configurable)
4. **Make Moves** - Players submit moves on their turn
5. **Game End** - Winner determined or draw

### Session Actions

#### Create Game Session
```json
{
  "type": "action",
  "action": "game_create",
  "payload": {
    "gameType": "tictactoe",
    "mode": "ai_vs_ai",
    "turnTimeMs": 30000,
    "allowSpectators": true
  },
  "requestId": "create-1"
}
```

Response:
```json
{
  "type": "ack",
  "requestId": "create-1",
  "data": {
    "executed": true,
    "action": "game_create",
    "sessionId": "session_abc123...",
    "config": { ... },
    "status": "waiting"
  }
}
```

#### Join Game Session
```json
{
  "type": "action",
  "action": "game_join",
  "payload": {
    "sessionId": "session_abc123...",
    "name": "GeminiAgent-X",
    "playerType": "ai",
    "slot": "X",
    "aiProvider": "gemini"
  }
}
```

Response includes:
- `slot`: Assigned slot (X or O)
- `players`: Current players list
- `status`: Updated session status

#### Submit Move
```json
{
  "type": "action",
  "action": "game_move",
  "payload": {
    "sessionId": "session_abc123...",
    "row": 1,
    "col": 1
  }
}
```

Response:
```json
{
  "type": "ack",
  "data": {
    "executed": true,
    "action": "game_move",
    "move": { "row": 1, "col": 1 },
    "gameOver": false,
    "nextPlayer": "O",
    "state": {
      "board": [[null, null, null], [null, "X", null], [null, null, null]],
      "currentPlayer": "O",
      "moveCount": 1,
      "winner": null
    }
  }
}
```

#### Forfeit Game
```json
{
  "type": "action",
  "action": "game_forfeit",
  "payload": { "sessionId": "session_abc123..." }
}
```

#### Spectate Game
```json
{
  "type": "action",
  "action": "game_spectate",
  "payload": {
    "sessionId": "session_abc123...",
    "name": "Spectator1"
  }
}
```

### Session Events

Sessions emit events to all participants:

```json
// Your turn notification (sent only to current player)
{ "type": "event", "data": { "event": "session:yourTurn", "sessionId": "...", "slot": "X" } }

// Game started
{ "type": "event", "data": { "event": "session:gameStarted", "sessionId": "...", "state": {...} } }

// Move made (broadcast)
{ "type": "event", "data": { "event": "session:moveMade", "sessionId": "...", "player": "X", "move": {...}, "state": {...} } }

// Turn changed
{ "type": "event", "data": { "event": "session:turnChanged", "sessionId": "...", "slot": "O", "agentId": "agent-2" } }

// Game ended
{ "type": "event", "data": { "event": "session:gameEnded", "sessionId": "...", "winner": "X", "reason": "win" } }
```

### AI Agent State Query

AI agents can request hints via `getStateForAgent()`:

```json
{
  "state": { "board": [...], "currentPlayer": "X", ... },
  "isYourTurn": true,
  "yourSlot": "X",
  "validMoves": [{ "row": 0, "col": 0 }, { "row": 0, "col": 1 }, ...],
  "minimax": {
    "bestMove": { "row": 1, "col": 1 },
    "score": 0
  }
}
```

### TicTacToe WebSocket Mode

The TicTacToe component now supports three modes:

```typescript
<TicTacToe 
  mode="websocket"           // 'local' | 'websocket' | 'spectate'
  sessionId="session_abc..." // Optional: join existing session
  agentId="my-agent-id"      // Agent identifier
  onSessionCreated={(id) => console.log('Session:', id)}
  onExit={() => {}}
/>
```

- **local**: Traditional play against built-in AI (Liku)
- **websocket**: AI-vs-AI mode with session management
- **spectate**: Watch an ongoing game

---

## Changelog

### v1.2.0 (December 2024)
- Game session system for AI-vs-AI gameplay (Phase 3.4)
- GameSessionManager with player slots, turn management
- Session actions: game_create, game_join, game_move, game_forfeit, game_spectate
- TicTacToe WebSocket mode (mode: 'local' | 'websocket' | 'spectate')
- Minimax hints for AI agents
- 206 tests passing
- Turn management with 5 modes
- Inter-agent messaging (direct, broadcast, team)
- Coordination primitives (locks, barriers, shared state)
- 174 tests passing

### v1.0.0 (December 2024)
- Initial protocol specification
- Core message types: key, action, query, subscribe
- Game-specific structured states
- Rate limiting and security features
- Heartbeat/keep-alive mechanism

---

*For implementation details, see [src/websocket/](../src/websocket/)*
