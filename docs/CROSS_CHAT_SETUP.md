# Cross-Chat AI vs AI Setup Guide

This guide explains how to set up two AI agents (in separate chat windows/terminals) to play TicTacToe against each other.

## The Challenge

When two AIs are in separate chat windows or terminals, they need a way to:
1. **Discover** each other (the match code problem)
2. **Connect** to the same game session
3. **Play** without seeing each other's output

## Solution: The Match Code Bridge

The system uses two mechanisms:

### 1. File-Based Discovery (`current-match.txt`)
When AI #1 hosts a game, the match code is automatically saved to `current-match.txt`. AI #2 can read this file to find the code.

### 2. Query-Based Discovery (`list-matches.js`)
Run `node scripts/list-matches.js` to see all pending matches and their codes.

---

## Quick Setup (4 Terminals)

### Terminal 1: Server
```bash
node scripts/start-server.js
```

### Terminal 2: List/Watch Matches (Optional but helpful)
```bash
node scripts/list-matches.js          # One-time check
node scripts/list-matches.js --watch  # Continuous watch
```

### Terminal 3: AI #1 (Host)
```bash
node scripts/ai-player.js host Claude
```
This will:
- Host a TicTacToe game
- Display the match code (e.g., `LIKU-XXXX`)
- Save it to `current-match.txt`

### Terminal 4: AI #2 (Guest)

**Option A - With code:**
```bash
node scripts/ai-player.js join LIKU-XXXX GPT5
```

**Option B - Auto-discover (reads from current-match.txt):**
```bash
node scripts/ai-player.js join GPT5
```

---

## Using Real AI Chat Windows

When using VS Code Copilot or other AI chat interfaces:

### Chat Window 1 (Host AI)
Tell the AI:
```
Connect to the Liku game server and host a TicTacToe game.
Server URL: ws://localhost:3847?name=Claude&type=ai
```

The AI will receive a match code. You can:
1. Copy it manually to the other chat
2. Run `node scripts/list-matches.js` in a terminal to see it
3. Check `current-match.txt` (if using ai-player.js)

### Chat Window 2 (Guest AI)
Tell the AI:
```
Join the Liku game with code LIKU-XXXX
Server URL: ws://localhost:3847?name=GPT5&type=ai
```

---

## Match Code Discovery Methods

| Method | Command | When to Use |
|--------|---------|-------------|
| List matches | `node scripts/list-matches.js` | To see all pending games |
| Watch matches | `node scripts/list-matches.js --watch` | Continuous monitoring |
| Read file | `cat current-match.txt` | Quick lookup after hosting |
| Auto-join | `node scripts/ai-player.js join Name` | Automatic code discovery |

---

## Observing the Game

To watch the game in real-time:

```bash
# Watch any pending game (auto-discovers)
node scripts/observe-game.js

# Watch a specific match
node scripts/observe-game.js LIKU-XXXX

# Also write state to file
node scripts/observe-game.js --file
```

The observer shows:
- Live board updates
- Move history with reasoning
- Player turns

---

## Complete Workflow Example

```
┌─────────────────────────────────────────────────────────────┐
│ Terminal 1: Server                                          │
│ $ node scripts/start-server.js                              │
│ [Server running on port 3847]                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Terminal 2: Observer                                        │
│ $ node scripts/observe-game.js --file                       │
│ [Waiting for game...]                                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Terminal 3: Host (or Chat Window 1)                         │
│ $ node scripts/ai-player.js host Claude                     │
│ MATCH CODE: LIKU-A1B2                                       │
│ 📁 Saved to current-match.txt                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Terminal 4: Guest (or Chat Window 2)                        │
│ $ node scripts/ai-player.js join GPT5                       │
│ 📁 Found match code in current-match.txt: LIKU-A1B2         │
│ [Game starts...]                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "No match code provided and current-match.txt not found"
- Make sure the host AI has connected and hosted a game first
- Run `node scripts/list-matches.js` to check pending matches

### Match code expired
- Match codes expire after 5 minutes
- The host AI must stay connected while waiting for the guest

### Server not running
```bash
# Check if server is running
curl http://localhost:3848/health

# Start it if not
node scripts/start-server.js
```

### Can't find the match code in chat window
- The AI's console output may not be visible in chat
- Use `node scripts/list-matches.js` in a separate terminal to find codes
