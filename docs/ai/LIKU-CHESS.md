# LikuBuddy Chess - AI Instructions

> **Prerequisites:** Read [LIKU-CORE.md](../../LIKU-CORE.md) first for setup and navigation.

## ⚡ TL;DR - Optimal Chess Play

```powershell
# 1. Switch to TEXT MODE (one-time)
.\send-keys.ps1 -Key "{TAB}"

# 2. Make moves - text first, ENTER separate
.\send-keys.ps1 -Key "e4"
.\send-keys.ps1 -Key "{ENTER}"

# 3. Read state for AI response + legal moves
Get-Content .\likubuddy-state.txt
```

**Golden Rule:** TEXT MODE + separate ENTER = fastest, most reliable

---

## 🎯 Input Modes

### TEXT MODE (⭐ RECOMMENDED)

Switch with `{TAB}`. Type SAN notation directly.

```powershell
.\send-keys.ps1 -Key "Nf3"       # Type move
.\send-keys.ps1 -Key "{ENTER}"   # Submit (SEPARATE!)
```

**Why TEXT MODE:**
- ✅ Single move notation (saves tokens)
- ✅ No cursor navigation needed
- ✅ Invalid moves auto-clear
- ✅ Commands work: `hint`, `undo`, `flip`, `new`, `resign`

**⚠️ CRITICAL:** Never combine text + ENTER in one SendKeys call!
```powershell
# ❌ WRONG - ENTER may not register
.\send-keys.ps1 -Key "e4{ENTER}"

# ✅ CORRECT - Always separate
.\send-keys.ps1 -Key "e4"
.\send-keys.ps1 -Key "{ENTER}"
```

### CURSOR MODE

Arrow keys to navigate board, ENTER to select/move.

```powershell
# Select piece at e2, move to e4
.\send-keys.ps1 -Key "{ENTER}"      # Select piece at cursor
.\send-keys.ps1 -Key "{UP}{UP}"     # Move cursor to target
.\send-keys.ps1 -Key "{ENTER}"      # Complete move
```

**Cursor position shown in JSON:** `"cursorSquare": "e2"`

---

## 📊 Reading Chess State

### Visual State Header (after moves)

```
MOVE: 5 | MODE: TEXT | EVAL: +35
CAPTURED BY WHITE: p n | BY BLACK: none
```

### JSON Structured State

```json
{
  "type": "chess",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "turn": "w",
  "moveNumber": 1,
  "legalMoves": ["a2a3", "a2a4", "b1c3", ...],
  "legalMovesSan": ["a3", "a4", "Nc3", ...],
  "isCheck": false,
  "isCheckmate": false,
  "evaluation": 35,
  "inputMode": "text",
  "cursorSquare": "e2"
}
```

**Key Fields:**
| Field | Description |
|-------|-------------|
| `fen` | Complete board position (FEN notation) |
| `turn` | `"w"` or `"b"` |
| `legalMovesSan` | Valid moves in SAN notation - USE THIS |
| `evaluation` | Centipawns (positive = white advantage) |
| `inputMode` | Current mode: `"text"` or `"cursor"` |
| `cursorSquare` | Cursor position (cursor mode only) |

---

## 📝 Move Notation (SAN)

| Move Type | Example |
|-----------|---------|
| Pawn move | `e4`, `d5` |
| Piece move | `Nf3`, `Bc4`, `Qd7` |
| Capture | `Bxc6`, `exd5` |
| Kingside castle | `O-O` |
| Queenside castle | `O-O-O` |
| Check | `Qd7+` |
| Promotion | `e8=Q` |

---

## 🧠 Strategy Tips

1. **Use `legalMovesSan`** - Only these moves are valid
2. **Check `evaluation`** - Positive = white winning
3. **Watch `isCheck`** - Must escape if true
4. **Request `hint`** if stuck:
   ```powershell
   .\send-keys.ps1 -Key "hint"
   .\send-keys.ps1 -Key "{ENTER}"
   ```

---

## 🎮 Text Commands

| Command | Action |
|---------|--------|
| `hint` | Get AI suggestion |
| `undo` | Take back last move |
| `flip` | Flip board orientation |
| `new` | Start new game |
| `resign` | Forfeit game |

---

## ⌨️ Hotkeys (Both Modes)

| Key | Action |
|-----|--------|
| `{TAB}` | Toggle text/cursor mode |
| `h` | Get hint |
| `u` | Undo move |
| `f` | Flip board |
| `r` | Resign |
| `{ESC}` | Exit to menu |

---

## 🎬 AI Intro Video

Before your first Chess game, register your identity:

```powershell
Set-Content -Path "$env:USERPROFILE\.liku-ai\current-agent.txt" -Value "claude"
```

Your epic intro plays when entering Chess!

---

## 📋 Complete Game Flow

```powershell
# 1. Navigate to Chess (from Games Menu, index 5)
.\send-keys.ps1 -Key "{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}"
Get-Content .\likubuddy-state.txt  # Verify on Chess
.\send-keys.ps1 -Key "{ENTER}"     # Enter (wait for intro)

# 2. Wait for game to load (~15s for intro)
Start-Sleep -Seconds 15
Get-Content .\likubuddy-state.txt

# 3. Switch to text mode
.\send-keys.ps1 -Key "{TAB}"

# 4. Play moves
.\send-keys.ps1 -Key "e4"
.\send-keys.ps1 -Key "{ENTER}"

# 5. Read state, see AI response, repeat
Get-Content .\likubuddy-state.txt
```

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Move not accepted | Check `legalMovesSan` for valid moves |
| Text not appearing | Make sure in TEXT mode (check JSON `inputMode`) |
| ENTER not working | Send text and ENTER as separate commands |
| Wrong cursor position | Check `cursorSquare` in JSON |
