# LikuBuddy AI Agent Core Manual

> **For All AI Models** - Claude, Gemini, ChatGPT, Grok, LLaMA, etc.

## ⚡ TL;DR - Quick Start

```powershell
# 1. Spawn game in separate window (REQUIRED)
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd C:\dev\Liku-AI; node dist/index.js"

# 2. Read state file to see current screen
Get-Content .\likubuddy-state.txt

# 3. Send keys to interact
.\send-keys.ps1 -Key "{DOWN}"      # Navigate
.\send-keys.ps1 -Key "{ENTER}"     # Select
```

---

## 🚨 Critical Rules

1. **SEPARATE TERMINAL** - Game MUST run in its own window, not inline
2. **READ STATE FIRST** - Always check `likubuddy-state.txt` before acting
3. **NAVIGATE → POLL → CONFIRM** - Never blind-send ENTER after navigation

---

## 🚀 Starting the Game

```powershell
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd C:\dev\Liku-AI; node dist/index.js"
```

This spawns a window titled "LikuBuddy Game Window". All `send-keys.ps1` commands auto-target this window.

---

## 👁️ Reading Game State

The file `likubuddy-state.txt` contains real-time game state.

**For VS Code / Chat Interfaces:**
- Use `#file:likubuddy-state.txt` attachment directly - don't waste terminal calls!

**For Terminal-Only Agents:**
```powershell
Get-Content .\likubuddy-state.txt
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

```powershell
.\send-keys.ps1 -Key "<KEY_CODE>"
```

**Key Codes:**
| Key | Code |
|-----|------|
| Arrows | `{UP}`, `{DOWN}`, `{LEFT}`, `{RIGHT}` |
| Enter | `{ENTER}` |
| Escape | `{ESC}` |
| Space | ` ` (space character) |
| Tab | `{TAB}` |
| Letters | Just the letter: `e`, `f`, `r` |

### Navigation Pattern (ALWAYS USE THIS)

```powershell
# Step 1: Navigate
.\send-keys.ps1 -Key "{DOWN}{DOWN}"

# Step 2: Poll state to verify position
Get-Content .\likubuddy-state.txt

# Step 3: Confirm only after verifying
.\send-keys.ps1 -Key "{ENTER}"
```

⚠️ **Rapid key stacking may drop keys** - If `{DOWN}{DOWN}{DOWN}` doesn't move 3 positions, send individual keys with verification between.

---

## 🎬 AI Identity (Intro Video)

Register your identity before playing Chess to trigger your intro video:

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.liku-ai" | Out-Null
Set-Content -Path "$env:USERPROFILE\.liku-ai\current-agent.txt" -Value "claude"
```

**Supported IDs:** `claude`, `gemini`, `chatgpt`, `grok` (and aliases like `anthropic`, `openai`, etc.)

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
| "Could not activate window" | Game not running - restart it |
| Keys not registering | Try single keys with delays |
| Game crashed | Restart with Start-Process command |
| Stuck | Send `{ESC}` multiple times |

---

## ⚠️ Safety

- Do NOT delete source files
- Do NOT modify `likubuddy-state.txt` - only read it
- Do NOT run `npm start` inline - always use Start-Process
