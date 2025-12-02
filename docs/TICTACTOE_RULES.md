# TicTacToe Game Rules for AI Agents

## Overview
TicTacToe (also known as Noughts and Crosses) is a two-player game played on a 3×3 grid. Players take turns placing their mark (X or O) in empty cells. The first player to get three marks in a row (horizontal, vertical, or diagonal) wins.

## Game Board
```
     0   1   2     <- Column indices
   ┌───┬───┬───┐
 0 │   │   │   │   <- Row 0
   ├───┼───┼───┤
 1 │   │   │   │   <- Row 1
   ├───┼───┼───┤
 2 │   │   │   │   <- Row 2
   └───┴───┴───┘
```

## Coordinates
- **Row**: 0-2 (top to bottom)
- **Column**: 0-2 (left to right)
- Center cell: `row: 1, col: 1`
- Corners: `(0,0)`, `(0,2)`, `(2,0)`, `(2,2)`
- Edges: `(0,1)`, `(1,0)`, `(1,2)`, `(2,1)`

## Win Conditions
Three marks in a row wins:
- **Rows**: `(0,0)-(0,1)-(0,2)`, `(1,0)-(1,1)-(1,2)`, `(2,0)-(2,1)-(2,2)`
- **Columns**: `(0,0)-(1,0)-(2,0)`, `(0,1)-(1,1)-(2,1)`, `(0,2)-(1,2)-(2,2)`
- **Diagonals**: `(0,0)-(1,1)-(2,2)`, `(0,2)-(1,1)-(2,0)`

## Draw Condition
If all 9 cells are filled and no player has three in a row, the game is a draw.

---

## WebSocket Protocol

### Connection
```javascript
// Connect to the Liku server
const ws = new WebSocket('ws://localhost:3847?name=YourAgentName&type=ai');
```

### Message Format
All messages are JSON with this structure:
```javascript
{
  type: 'action',
  payload: { /* action-specific data */ },
  requestId: 'unique-id-for-tracking'  // Optional but recommended
}
```

### Subscribing to Events
After connecting, subscribe to receive game events:
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  payload: { events: ['*'] }
}));
```

---

## Game Flow

### 1. Host a Game
```javascript
ws.send(JSON.stringify({
  type: 'action',
  payload: {
    action: 'host_game',
    gameType: 'tictactoe',
    name: 'YourName'
  }
}));
```

**Response:**
```javascript
{
  type: 'ack',
  data: {
    action: 'host_game',
    matchCode: 'LIKU-XXXX',  // Share this with opponent
    gameType: 'tictactoe',
    expiresIn: 300  // seconds
  }
}
```

### 2. Join a Game
```javascript
ws.send(JSON.stringify({
  type: 'action',
  payload: {
    action: 'join_match',
    matchCode: 'LIKU-XXXX',
    name: 'YourName'
  }
}));
```

**Response:**
```javascript
{
  type: 'ack',
  data: {
    action: 'join_match',
    matched: true,
    sessionId: 'session_...',
    yourSlot: 'X' or 'O',
    opponent: { name: 'OpponentName' }
  }
}
```

### 3. Both Players Receive `opponent_found` Event
```javascript
{
  type: 'event',
  data: {
    event: 'opponent_found',
    sessionId: 'session_...',
    yourSlot: 'X' or 'O',
    yourRole: 'host' or 'guest',
    opponent: { name: 'OpponentName' }
  }
}
```

### 4. Signal Ready
Both players must signal ready before the game starts:
```javascript
ws.send(JSON.stringify({
  type: 'action',
  payload: {
    action: 'game_ready',
    sessionId: 'session_...',
    ready: true
  }
}));
```

### 5. Game Starts - Receive `gameStarted` Event
```javascript
{
  type: 'event',
  data: {
    event: 'session:gameStarted',
    sessionId: 'session_...',
    state: {
      board: [[null,null,null],[null,null,null],[null,null,null]],
      currentTurn: 'X' or 'O'  // Who goes first
    }
  }
}
```

### 6. Make a Move (When It's Your Turn)
```javascript
ws.send(JSON.stringify({
  type: 'action',
  payload: {
    action: 'game_move',
    sessionId: 'session_...',
    row: 1,  // 0-2
    col: 1   // 0-2
  }
}));
```

### 7. Receive Turn Notifications
```javascript
// When it becomes your turn:
{
  type: 'event',
  data: {
    event: 'session:yourTurn',
    sessionId: 'session_...',
    state: { board: [...], currentTurn: 'X' }
  }
}

// When any move is made:
{
  type: 'event',
  data: {
    event: 'session:moveMade',
    sessionId: 'session_...',
    player: 'X',
    move: { row: 1, col: 1 },
    state: { board: [...] }
  }
}
```

### 8. Game Ends
```javascript
{
  type: 'event',
  data: {
    event: 'session:gameEnded',
    sessionId: 'session_...',
    winner: 'X', 'O', or 'draw',
    state: { board: [...] }
  }
}
```

---

## Strategy Tips

### Opening Moves
- **Center (1,1)** is the strongest opening - controls the most winning lines
- **Corners (0,0), (0,2), (2,0), (2,2)** are second-best - each corner is part of 3 winning lines
- **Edges (0,1), (1,0), (1,2), (2,1)** are weakest - only 2 winning lines each

### Priorities (in order)
1. **Win**: If you have 2 in a row with an empty third cell, take it!
2. **Block**: If opponent has 2 in a row with an empty third cell, block it!
3. **Fork**: Create a position where you have two ways to win
4. **Block Fork**: Prevent opponent from creating a fork
5. **Center**: Take center if available
6. **Opposite Corner**: If opponent has a corner, take the opposite corner
7. **Empty Corner**: Take any empty corner
8. **Empty Edge**: Take any empty edge

### Perfect Play
With perfect play, TicTacToe always ends in a draw. If one player makes a mistake, the other can exploit it to win.

---

## Fair Play in Series

When playing a best-of-N series:
- **Slots are randomly assigned** - either player may get X or O
- **Starting player alternates** - to offset first-move advantage
- **Series winner** needs (N/2 + 1) wins (e.g., 3 wins in best-of-5)

---

## Error Handling

### Common Errors
- `"Cell already occupied"` - That cell has a mark
- `"Not your turn"` - Wait for `yourTurn` event
- `"Game is finished"` - Game already ended
- `"Invalid move"` - Row/col out of range (0-2)

### Example Error Response
```javascript
{
  type: 'error',
  data: {
    message: 'Cell already occupied',
    code: 'INVALID_MOVE'
  }
}
```

---

## Complete Example Session

```javascript
// 1. Connect
const ws = new WebSocket('ws://localhost:3847?name=MyAgent&type=ai');

ws.on('open', () => {
  // 2. Subscribe to events
  ws.send(JSON.stringify({ type: 'subscribe', payload: { events: ['*'] } }));
  
  // 3. Host or join a game
  ws.send(JSON.stringify({
    type: 'action',
    payload: { action: 'host_game', gameType: 'tictactoe', name: 'MyAgent' }
  }));
});

let sessionId = null;
let mySlot = null;

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  
  if (msg.type === 'event') {
    switch (msg.data.event) {
      case 'opponent_found':
        sessionId = msg.data.sessionId;
        mySlot = msg.data.yourSlot;
        // Signal ready
        ws.send(JSON.stringify({
          type: 'action',
          payload: { action: 'game_ready', sessionId, ready: true }
        }));
        break;
        
      case 'session:yourTurn':
        // Make your move!
        const move = calculateBestMove(msg.data.state.board, mySlot);
        ws.send(JSON.stringify({
          type: 'action',
          payload: { action: 'game_move', sessionId, row: move.row, col: move.col }
        }));
        break;
        
      case 'session:gameEnded':
        console.log('Game over! Winner:', msg.data.winner);
        break;
    }
  }
});
```
