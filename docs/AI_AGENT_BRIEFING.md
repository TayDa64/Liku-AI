# Liku TicTacToe AI Agent Briefing

You are about to play TicTacToe against another AI agent via WebSocket. This document contains everything you need to play fairly.

## Connection Details
- **Server**: `ws://localhost:3847`
- **Connect URL**: `ws://localhost:3847?name=YourName&type=ai`

## Quick Protocol Reference

### 1. After Connecting, Subscribe to Events
```json
{"type": "subscribe", "payload": {"events": ["*"]}, "requestId": "sub-1"}
```

### 2. Host a Game (if you're hosting)
```json
{"type": "action", "payload": {"action": "host_game", "gameType": "tictactoe", "name": "YourName"}, "requestId": "host-1"}
```
You'll receive a match code like `LIKU-XXXX` - share this with your opponent.

### 3. Join a Game (if joining)
```json
{"type": "action", "payload": {"action": "join_match", "matchCode": "LIKU-XXXX", "name": "YourName"}, "requestId": "join-1"}
```

### 4. Signal Ready
After receiving `opponent_found` event:
```json
{"type": "action", "payload": {"action": "game_ready", "sessionId": "YOUR_SESSION_ID", "ready": true}, "requestId": "ready-1"}
```

### 5. Make Moves (when it's your turn)
```json
{"type": "action", "payload": {"action": "game_move", "sessionId": "YOUR_SESSION_ID", "row": 1, "col": 1}, "requestId": "move-1"}
```

## Board Layout
```
     Col 0  Col 1  Col 2
Row 0  [0,0] [0,1] [0,2]
Row 1  [1,0] [1,1] [1,2]   <- Center is [1,1]
Row 2  [2,0] [2,1] [2,2]
```

## Key Events to Handle

| Event | Meaning |
|-------|---------|
| `opponent_found` | Match made! Contains `yourSlot` (X or O) and `sessionId` |
| `session:gameStarted` | Game begins. Check `state.currentTurn` to see if you go first |
| `session:yourTurn` | It's your turn to move |
| `session:moveMade` | A move was made. Check `state.board` for current state |
| `session:gameEnded` | Game over. Check `winner` (X, O, or "draw") |

## Optimal Strategy (for fair play)

Use this priority order:
1. **WIN**: If you have 2-in-a-row with an empty third cell, take it
2. **BLOCK**: If opponent has 2-in-a-row with an empty third cell, block it
3. **CENTER**: Take center [1,1] if available
4. **CORNER**: Take any corner [(0,0), (0,2), (2,0), (2,2)]
5. **EDGE**: Take any edge [(0,1), (1,0), (1,2), (2,1)]

## Fair Play Notes

- **Slots are randomly assigned** - you might get X or O
- **Starting player is random** - whoever's slot matches `currentTurn` goes first
- **Check `goesFirst` field** in `opponent_found` event to know if you start
- **Wait for `yourTurn` event** before making moves to avoid "Not your turn" errors
- With perfect play from both sides, the game should end in a draw

## Example Game Flow

```
1. Connect → Receive welcome
2. Subscribe to events
3. Host game → Receive match code
4. Opponent joins → Receive opponent_found (yourSlot: "X", goesFirst: true)
5. Send game_ready
6. Receive gameStarted (state.currentTurn: "X")
7. Since goesFirst=true, make first move
8. Receive moveMade with updated board
9. Wait for yourTurn event
10. Make next move
... repeat until gameEnded
```

## Detecting Check for Win/Block

To check if player P can win:
```
For each line (row, col, diagonal):
  Count P marks and empty cells
  If P has 2 marks AND 1 empty → that empty is a winning/blocking move
```

Lines to check:
- Rows: [0,0]-[0,1]-[0,2], [1,0]-[1,1]-[1,2], [2,0]-[2,1]-[2,2]
- Cols: [0,0]-[1,0]-[2,0], [0,1]-[1,1]-[2,1], [0,2]-[1,2]-[2,2]  
- Diags: [0,0]-[1,1]-[2,2], [0,2]-[1,1]-[2,0]

Good luck! 🎮
