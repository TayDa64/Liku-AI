# LikuBuddy Chess - AI Instructions

> **Prerequisites:** Read [LIKU-CORE.md](../../LIKU-CORE.md) first for setup and navigation.

## ⚡ TL;DR - Optimal Chess Play

### 🪟 Windows (PowerShell)

```powershell
# 1. Switch to TEXT MODE (one-time)
.\send-keys.ps1 -Key "{TAB}"

# 2. Make moves - text first, ENTER separate
.\send-keys.ps1 -Key "e4"
.\send-keys.ps1 -Key "{ENTER}"

# 3. Read state for AI response + legal moves
Get-Content .\likubuddy-state.txt
```

### 🐧 Linux / macOS / Codespaces (Bash)

```bash
# 1. Switch to TEXT MODE (one-time)
./send-keys.sh -Key "{TAB}"
# or: node send-command.js --key tab

# 2. Make moves - text first, ENTER separate
./send-keys.sh -Key "e4"
./send-keys.sh -Key "{ENTER}"
# or: node send-command.js --key "e4" && node send-command.js --key enter

# 3. Read state for AI response + legal moves
cat likubuddy-state.txt
```

**Golden Rule:** TEXT MODE + separate ENTER = fastest, most reliable

---

## 🎯 Input Modes

### TEXT MODE (⭐ RECOMMENDED)

Switch with `{TAB}`. Type SAN notation directly.

**Windows:**
```powershell
.\send-keys.ps1 -Key "Nf3"       # Type move
.\send-keys.ps1 -Key "{ENTER}"   # Submit (SEPARATE!)
```

**Linux/macOS/Codespaces:**
```bash
./send-keys.sh -Key "Nf3"        # Type move
./send-keys.sh -Key "{ENTER}"    # Submit (SEPARATE!)
# or
node send-command.js --key "Nf3"
node send-command.js --key enter
```

**Why TEXT MODE:**
- ✅ Single move notation (saves tokens)
- ✅ No cursor navigation needed
- ✅ Invalid moves auto-clear
- ✅ Commands work: `hint`, `undo`, `flip`, `new`, `resign`

**⚠️ CRITICAL:** Never combine text + ENTER in one SendKeys call!

**Windows:**
```powershell
# ❌ WRONG - ENTER may not register
.\send-keys.ps1 -Key "e4{ENTER}"

# ✅ CORRECT - Always separate
.\send-keys.ps1 -Key "e4"
.\send-keys.ps1 -Key "{ENTER}"
```

**Linux/macOS:**
```bash
# ✅ CORRECT - Always separate
./send-keys.sh -Key "e4"
./send-keys.sh -Key "{ENTER}"
```

### CURSOR MODE

Arrow keys to navigate board, ENTER to select/move.

**Windows:**
```powershell
# Select piece at e2, move to e4
.\send-keys.ps1 -Key "{ENTER}"      # Select piece at cursor
.\send-keys.ps1 -Key "{UP}{UP}"     # Move cursor to target
.\send-keys.ps1 -Key "{ENTER}"      # Complete move
```

**Linux/macOS:**
```bash
# Select piece at e2, move to e4
./send-keys.sh -Key "{ENTER}"       # Select piece at cursor
./send-keys.sh -Key "{UP}"          # Move cursor up
./send-keys.sh -Key "{UP}"          # Move cursor up again
./send-keys.sh -Key "{ENTER}"       # Complete move
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

   **Windows:**
   ```powershell
   .\send-keys.ps1 -Key "hint"
   .\send-keys.ps1 -Key "{ENTER}"
   ```

   **Linux/macOS:**
   ```bash
   ./send-keys.sh -Key "hint"
   ./send-keys.sh -Key "{ENTER}"
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

**Windows:**
```powershell
# Signal file expires after 60 seconds - set right before entering Chess
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Set-Content -Path "$env:USERPROFILE\.liku-ai\current-agent.txt" -Value "claude`n$timestamp"
```

**Linux/macOS:**
```bash
mkdir -p ~/.liku-ai
echo -e "claude\n$(date +%s%3N)" > ~/.liku-ai/current-agent.txt
```

Your epic intro plays when entering Chess!

### ⏳ Intro Timing (CRITICAL)

The intro video plays for **10 seconds**. During playback, the state file shows:

```
INTRO: Playing claude intro video for 10s (PID: 12345)
```

**⚠️ DO NOT send any commands while `INTRO:` appears in the state file!**

Commands sent during intro playback will be lost or cause unexpected navigation.

---

## 📋 Complete Game Flow

### 🪟 Windows (PowerShell)

```powershell
# 1. Navigate to Chess (from Games Menu, index 5)
.\send-keys.ps1 -Key "{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}"
Get-Content .\likubuddy-state.txt  # Verify on Chess
.\send-keys.ps1 -Key "{ENTER}"     # Enter Chess (triggers intro)

# 2. CRITICAL: Wait for intro to finish!
# Option A: Poll until INTRO: disappears (recommended)
do {
    Start-Sleep -Seconds 1
    $state = Get-Content .\likubuddy-state.txt -Raw
} while ($state -match "INTRO:")

# Option B: Simple wait (12s = 10s video + 2s buffer)
# Start-Sleep -Seconds 12

# 3. Verify game is ready
Get-Content .\likubuddy-state.txt  # Should show "Playing Chess"

# 3. Switch to text mode
.\send-keys.ps1 -Key "{TAB}"

# 4. Play moves
.\send-keys.ps1 -Key "e4"
.\send-keys.ps1 -Key "{ENTER}"

# 5. Read state, see AI response, repeat
Get-Content .\likubuddy-state.txt
```

### 🐧 Linux / macOS / Codespaces (Bash)

```bash
# 1. Navigate to Chess (from Games Menu, index 5)
for i in {1..5}; do ./send-keys.sh -Key "{DOWN}"; done
cat likubuddy-state.txt            # Verify on Chess
./send-keys.sh -Key "{ENTER}"      # Enter Chess (triggers intro)

# 2. CRITICAL: Wait for intro to finish!
# Option A: Poll until INTRO: disappears (recommended)
while grep -q "INTRO:" likubuddy-state.txt 2>/dev/null; do
    sleep 1
done

# Option B: Simple wait (12s = 10s video + 2s buffer)
# sleep 12

# 3. Verify game is ready
cat likubuddy-state.txt            # Should show "Playing Chess"

# 3. Switch to text mode
./send-keys.sh -Key "{TAB}"

# 4. Play moves
./send-keys.sh -Key "e4"
./send-keys.sh -Key "{ENTER}"

# 5. Read state, see AI response, repeat
cat likubuddy-state.txt
```

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Move not accepted | Check `legalMovesSan` for valid moves |
| Text not appearing | Make sure in TEXT mode (check JSON `inputMode`) |
| ENTER not working | Send text and ENTER as separate commands |
| Wrong cursor position | Check `cursorSquare` in JSON |
| Connection timeout (Linux) | Ensure game is running: `node dist/index.js &` |
| WebSocket refused | Check port 3847 is not blocked; game may have `--no-websocket` flag |

---

## 🌐 Cross-Platform Command Reference

| Action | Windows | Linux/macOS |
|--------|---------|-------------|
| Switch to text mode | `.\send-keys.ps1 -Key "{TAB}"` | `./send-keys.sh -Key "{TAB}"` |
| Type move | `.\send-keys.ps1 -Key "e4"` | `./send-keys.sh -Key "e4"` |
| Submit move | `.\send-keys.ps1 -Key "{ENTER}"` | `./send-keys.sh -Key "{ENTER}"` |
| Read state | `Get-Content .\likubuddy-state.txt` | `cat likubuddy-state.txt` |
| Get hint | `.\send-keys.ps1 -Key "hint"` | `./send-keys.sh -Key "hint"` |
