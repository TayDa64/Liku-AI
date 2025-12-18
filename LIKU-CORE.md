# LikuBuddy AI Agent Core Manual

> **For All AI Models** - Claude, Gemini, ChatGPT, Grok, LLaMA, etc.

## ⚡ TL;DR - Quick Start

### 🪟 Windows (PowerShell)

```powershell
# 1. Spawn game in separate window (REQUIRED)
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd C:\dev\Liku-AI; node dist/index.js"

# 2. Read state file to see current screen
Get-Content .\likubuddy-state.txt

# 3. Send keys to interact
.\send-keys.ps1 -Key "{DOWN}"      # Navigate
.\send-keys.ps1 -Key "{ENTER}"     # Select
```

### 🐧 Linux / macOS / Codespaces (Bash)

```bash
# 1. Start game in background
node dist/index.js &

# 2. Read state file
cat likubuddy-state.txt

# 3. Send keys via WebSocket (cross-platform)
./send-keys.sh -Key "{DOWN}"       # Navigate
./send-keys.sh -Key "{ENTER}"      # Select

# Alternative: Direct WebSocket command
node send-command.js --key down
node send-command.js --key enter
```

> **Note for Codespaces/Headless:** The `send-keys.sh` script uses WebSocket instead of GUI keystroke injection, so it works without a display server.

---

## 🚨 Critical Rules

1. **SEPARATE TERMINAL** - Game MUST run in its own window, not inline
2. **READ STATE FIRST** - Always check `likubuddy-state.txt` before acting
3. **NAVIGATE → POLL → CONFIRM** - Never blind-send ENTER after navigation

---

## 🚀 Starting the Game

### 🪟 Windows

```powershell
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd C:\dev\Liku-AI; node dist/index.js"
```

This spawns a window titled "LikuBuddy Game Window". All `send-keys.ps1` commands auto-target this window.

### 🐧 Linux / macOS / Codespaces

```bash
# Option 1: Background process (recommended for AI agents)
cd /workspaces/Liku-AI  # or your project path
node dist/index.js &

# Option 2: Separate terminal/tmux session
tmux new-session -d -s liku 'node dist/index.js'
```

> **Headless Environments:** The game renders to the terminal but also writes state to `likubuddy-state.txt` and accepts commands via WebSocket (port 3847). No GUI needed!

---

## 👁️ Reading Game State

The file `likubuddy-state.txt` contains real-time game state.

**For VS Code / Chat Interfaces:**
- Use `#file:likubuddy-state.txt` attachment directly - don't waste terminal calls!

**For Terminal-Only Agents:**
```powershell
# Windows
Get-Content .\likubuddy-state.txt
```

```bash
# Linux/macOS
cat likubuddy-state.txt
```

### State File Format

| Model Type | Use This Section |
|------------|------------------|
| Claude, Gemini, LLaMA | Top: STATUS, VISUAL STATE, CONTROLS |
| ChatGPT, GPT-4o | Bottom: `STRUCTURED STATE (JSON):` |

**Key Fields:**
- `CURRENT SCREEN` - Where you are (Main Menu, Playing Chess, etc.)
- `STATUS` - Game-specific info (score, turn, health)
- `VISUAL STATE` - ASCII board or menu
- `CONTROLS` - Valid keys for current screen

---

## 🎮 Sending Commands

### 🪟 Windows (PowerShell)

```powershell
.\send-keys.ps1 -Key "<KEY_CODE>"
```

### 🐧 Linux / macOS / Codespaces (Bash)

```bash
# Option 1: Shell script (PowerShell-compatible syntax)
./send-keys.sh -Key "{DOWN}"

# Option 2: Direct Node.js command
node send-command.js --key down
node send-command.js --key enter
node send-command.js --key "e4"     # Text input (chess moves)
```

### Key Codes

| Key | PowerShell | Bash/Node |
|-----|------------|-----------|
| Arrows | `{UP}`, `{DOWN}`, `{LEFT}`, `{RIGHT}` | `up`, `down`, `left`, `right` |
| Enter | `{ENTER}` | `enter` |
| Escape | `{ESC}` | `escape` |
| Space | ` ` (space character) | `space` |
| Tab | `{TAB}` | `tab` |
| Letters | Just the letter: `e`, `f`, `r` | Same: `e`, `f`, `r` |

### Navigation Pattern (ALWAYS USE THIS)

**Windows:**
```powershell
# Step 1: Navigate
.\send-keys.ps1 -Key "{DOWN}{DOWN}"

# Step 2: Poll state to verify position
Get-Content .\likubuddy-state.txt

# Step 3: Confirm only after verifying
.\send-keys.ps1 -Key "{ENTER}"
```

**Linux/macOS/Codespaces:**
```bash
# Step 1: Navigate
./send-keys.sh -Key "{DOWN}"
./send-keys.sh -Key "{DOWN}"

# Step 2: Poll state to verify position
cat likubuddy-state.txt

# Step 3: Confirm only after verifying
./send-keys.sh -Key "{ENTER}"
```

⚠️ **Rapid key stacking may drop keys** - If `{DOWN}{DOWN}{DOWN}` doesn't move 3 positions, send individual keys with verification between.

---

## 🎬 AI Identity (Intro Video)

Register your identity before playing Chess to trigger your intro video:

**Windows:**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.liku-ai" | Out-Null
Set-Content -Path "$env:USERPROFILE\.liku-ai\current-agent.txt" -Value "claude"
```

**Linux/macOS:**
```bash
mkdir -p ~/.liku-ai
echo "claude" > ~/.liku-ai/current-agent.txt
```

**Supported IDs:** `claude`, `gemini`, `chatgpt`, `grok` (and aliases like `anthropic`, `openai`, `google`, etc.)

### ⏳ Intro Video Handling (CRITICAL)

When entering Chess, your intro video plays for **10 seconds**. The state file will show:

```
INTRO: Playing claude intro video for 10s (PID: 12345)
```

**⚠️ DO NOT send any commands while intro is playing!** Commands during intro will be lost or cause navigation errors.

**Polling Method (Recommended):**

```powershell
# Windows - Poll until intro finishes
do {
    Start-Sleep -Seconds 1
    $state = Get-Content .\likubuddy-state.txt -Raw
} while ($state -match "INTRO:")
# Now safe to send commands
```

```bash
# Linux/macOS - Poll until intro finishes
while grep -q "INTRO:" likubuddy-state.txt 2>/dev/null; do
    sleep 1
done
# Now safe to send commands
```

**Simple Wait Method:**
```powershell
Start-Sleep -Seconds 12  # 10s video + 2s buffer
```

---

## 📋 Main Menu Navigation

From the Main Menu, items are (0-indexed):

| Index | Item | Action |
|-------|------|--------|
| 0 | 🎮 Let's Play | Opens Games submenu |
| 1 | 🔨 Build a Game | AI game generator |
| 2 | 🌟 Community Games | User-generated games |
| 3 | 🎓 Liku Learn | Wisdom Center |
| 4 | 💻 LikuOS Stats | Detailed stats |
| 5 | 🍖 Feed Liku | XP -10, Hunger -20 |
| 6 | 💤 Rest | Energy +30, Hunger +10 |
| 7 | ⚙️ Settings | Theme/difficulty |
| 8 | 🚪 Exit | Quit |

**Shortcuts (Main Menu only):** `f` = Feed, `r` = Rest

### Games Submenu

| Index | Game | Energy Cost |
|-------|------|-------------|
| 0 | 🐍 Snake | 10 |
| 1 | ❌⭕ Tic-Tac-Toe | 5 |
| 2 | 🦖 Dino Run | 10 |
| 3 | 📝 Hangman | 5 |
| 4 | 🧩 Sudoku | 5 |
| 5 | ♟️ Chess | 5 |
| 6 | 🔙 Back | - |

---

## 📚 Game-Specific Instructions

Based on `CURRENT SCREEN` in state file, read the appropriate doc:

| Screen Contains | Read This Doc |
|-----------------|---------------|
| `Playing Chess` | [docs/ai/LIKU-CHESS.md](docs/ai/LIKU-CHESS.md) |
| `Playing Snake` | [docs/ai/LIKU-SNAKE.md](docs/ai/LIKU-SNAKE.md) |
| `Playing Tic-Tac-Toe` | [docs/ai/LIKU-TICTACTOE.md](docs/ai/LIKU-TICTACTOE.md) |
| `Playing Dino` | [docs/ai/LIKU-DINORUN.md](docs/ai/LIKU-DINORUN.md) |
| `Settings` | [docs/ai/LIKU-SETTINGS.md](docs/ai/LIKU-SETTINGS.md) |

**Example workflow:**
1. Read state file → See "Playing Chess"
2. Read `docs/ai/LIKU-CHESS.md` for chess-specific strategy
3. Play the game following that doc's instructions

---

## ⚡ Energy Management

- **Cannot play games with 0% energy!**
- Check `STATUS` line for current energy
- Use `💤 Rest` (index 6) to restore +30 energy
- Energy costs: Snake/Dino = 10, Others = 5

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Could not activate window" (Windows) | Game not running - restart it |
| "Connection timeout" (Linux/Codespace) | Game not running or WebSocket disabled - start with `node dist/index.js` |
| Keys not registering | Try single keys with delays |
| Game crashed | Restart with Start-Process (Win) or `node dist/index.js &` (Linux) |
| Stuck | Send `{ESC}` / `escape` multiple times |

---

## 🌐 Platform-Specific Notes

### GitHub Codespaces / Headless Linux

The game works fully in headless environments:

1. **No display needed** - State is written to `likubuddy-state.txt`
2. **WebSocket API** - Commands sent via `send-command.js` or `send-keys.sh`
3. **Port forwarding** - If running remotely, forward port 3847 for WebSocket

```bash
# Start game in background
node dist/index.js &

# Verify it's running
cat likubuddy-state.txt

# Send commands
node send-command.js --key down
node send-command.js --key enter
```

### Windows vs Linux Command Equivalents

| Windows (PowerShell) | Linux/macOS (Bash) |
|---------------------|-------------------|
| `.\send-keys.ps1 -Key "{DOWN}"` | `./send-keys.sh -Key "{DOWN}"` |
| `Get-Content .\likubuddy-state.txt` | `cat likubuddy-state.txt` |
| `Start-Process pwsh ...` | `node dist/index.js &` |

---

## ⚠️ Safety

- Do NOT delete source files
- Do NOT modify `likubuddy-state.txt` - only read it
- Do NOT run `npm start` inline - always use Start-Process
