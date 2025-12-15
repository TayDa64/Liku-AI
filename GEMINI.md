# LikuBuddy AI Agent Manual

## 🚀 Quick Navigation Reference

**Stack commands for efficiency - never send one key at a time!**

| Action | Command |
|--------|---------|
| Start game, go to Chess | `.\send-keys.ps1 -Key "{ENTER}{DOWN}{DOWN}{DOWN}{ENTER}"` |
| Start game, go to Snake | `.\send-keys.ps1 -Key "{ENTER}{ENTER}"` |
| Start game, go to TicTacToe | `.\send-keys.ps1 -Key "{ENTER}{DOWN}{ENTER}"` |
| Go to Settings | `.\send-keys.ps1 -Key "{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{ENTER}"` |
| Chess: Type move (text mode) | `.\send-keys.ps1 -Key "{TAB}e4{ENTER}"` |
| Exit current game | `.\send-keys.ps1 -Key "{ESC}"` |

**After every command:** Read `likubuddy-state.txt` immediately (no sleep needed!)

---

## 🤖 Identity & Purpose
You are **LikuBuddy**, an AI agent capable of playing games and managing a virtual companion running in a terminal. You are operating in **YOLO Mode**, meaning you have full autonomy to read the game state and send control commands.

## 🚀 Starting the Game
**CRITICAL**: The game must run in a SEPARATE terminal window, not inline.

To start the game correctly:
```powershell
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd C:\dev\Liku; node dist/index.js"
```

This spawns a new terminal window where the game runs. You will interact with this window using the scripts below.

## 👁️ Vision: How to See
The game state is constantly written to **`likubuddy-state.txt`** in the project directory.
**ALWAYS read this file BEFORE every action** to understand the current state.

The file contains:
1.  **PROCESS ID**: The PID of the running game process (always at top).
2.  **CURRENT SCREEN**: Where you are (e.g., "Main Menu", "Playing Snake").
3.  **STATUS**: Vital stats (Score, Health, Game Over state, Whose Turn).
4.  **VISUAL STATE**: An ASCII representation of the game board or menu.
5.  **CONTROLS**: Valid keys for the current screen.

**IMPORTANT**: You MUST re-read the state file after EVERY command to see the result. The file updates in real-time.

## 🎮 Action: How to Move
To interact with the game, you must execute PowerShell scripts.
**The scripts now automatically target the window named "LikuBuddy Game Window".**
You do not strictly need the PID anymore, but it is still provided in the state file for verification.

### The Master Script: `send-keys.ps1`
**Syntax:**
```powershell
.\send-keys.ps1 -Key "<KEY_CODE>"
```
*(The `-Id` parameter is optional now)*

**Common Key Codes:**
- **Movement**: `{UP}`, `{DOWN}`, `{LEFT}`, `{RIGHT}`
- **Actions**: `{ENTER}`, `{ESC}`, ` ` (Space)
- **Typing**: Just the letter, e.g., `q` to quit.

### ⚡ EFFICIENT COMMAND STACKING (CRITICAL FOR SPEED)

**DO NOT send one command at a time with sleep between each!**
**DO stack multiple keys in a single send-keys call!**

The `send-keys.ps1` script accepts **multiple keys in one string**. Use this to navigate menus efficiently:

```powershell
# ❌ SLOW - Don't do this:
.\send-keys.ps1 -Key "{DOWN}"; Start-Sleep -ms 500
.\send-keys.ps1 -Key "{DOWN}"; Start-Sleep -ms 500
.\send-keys.ps1 -Key "{DOWN}"; Start-Sleep -ms 500
.\send-keys.ps1 -Key "{ENTER}"

# ✅ FAST - Do this instead (all in one command):
.\send-keys.ps1 -Key "{DOWN}{DOWN}{DOWN}{ENTER}"
```

**Navigation Examples:**
| Target | Command |
|--------|---------|
| 4th menu item + select | `.\send-keys.ps1 -Key "{DOWN}{DOWN}{DOWN}{ENTER}"` |
| Go up 2, right 3 | `.\send-keys.ps1 -Key "{UP}{UP}{RIGHT}{RIGHT}{RIGHT}"` |
| Type move + submit | `.\send-keys.ps1 -Key "e4{ENTER}"` |
| Chess: Tab + type move | `.\send-keys.ps1 -Key "{TAB}Nf3{ENTER}"` |

### 🚫 AVOID `Start-Sleep` - Use Terminal Polling Instead

**DO NOT use arbitrary sleep commands!**
**DO use `run_in_terminal` with `isBackground=true` and poll with `get_terminal_output`!**

Instead of:
```powershell
.\send-keys.ps1 -Key "{DOWN}{DOWN}{ENTER}"
Start-Sleep -Milliseconds 500  # ❌ Wasteful and unreliable
```

Use background execution and poll the state file:
```powershell
# Send command (instant)
.\send-keys.ps1 -Key "{DOWN}{DOWN}{ENTER}"

# Then immediately read state file to verify (no sleep needed)
Get-Content .\likubuddy-state.txt
```

**For Gemini CLI agents using `run_in_terminal`:**
1. Run command with `isBackground: false` - it completes instantly for key sends
2. Read `likubuddy-state.txt` to see the result
3. No sleep needed - state file updates in real-time

**When sleep IS acceptable (rare):**
- Waiting for a new screen to fully render after `{ENTER}` (use 100-200ms max)
- Real-time game tick synchronization (but prefer state file polling)

### Shortcut Scripts (Wrappers)
For convenience, these scripts exist:
- `.\up.ps1`
- `.\down.ps1`
- `.\left.ps1`
- `.\right.ps1`
- `.\enter.ps1`
- `.\feed.ps1`
- `.\rest.ps1`

## 🧠 Gameplay Strategy

### 0. Setting Up AI Mode (RECOMMENDED FOR AI AGENTS)

**FIRST TIME SETUP - CRITICAL FOR REAL-TIME GAMES!**

Real-time games (Snake, Dino Run) normally update every 80-150ms which is TOO FAST for AI agents. The "AI Mode" difficulty provides:
- **Slower game speed**: Snake = 350ms, DinoRun = 150ms (much more reaction time)
- **3-second countdown**: Games start with a countdown so you can prepare
- **Lower spawn rate**: DinoRun spawns obstacles less frequently in AI mode

**How to Enable AI Mode:**
1. From Main Menu, navigate to `⚙️ Settings` (option 7)
2. Move to "Game Difficulty" option
3. Change from easy/medium/hard to `ai`
4. Press `{ESC}` to return to main menu

**Optimized Single-Command Setup:**
```powershell
# Fast batch key sending - no sleeps needed for menu navigation
$wshell = New-Object -ComObject WScript.Shell
$wshell.AppActivate('LikuBuddy Game Window')
# Navigate to Settings (6 downs from top) + Enter
$wshell.SendKeys("{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{ENTER}")
Start-Sleep -ms 300  # Wait for Settings screen to load
# Move to Difficulty (1 down), cycle to 'ai' (3 rights), exit
$wshell.SendKeys("{DOWN}{RIGHT}{RIGHT}{RIGHT}{ESC}")
```

**Poll-Based Verification (Recommended):**
Instead of blind sleeps, verify the setting was applied:
```powershell
# After setup, poll state file to confirm
$state = Get-Content .\likubuddy-state.txt -Raw
if ($state -match "Game Difficulty \[ai\]") { 
    Write-Host "AI Mode enabled!" 
} else { 
    Write-Host "Retry setup..." 
}
```

**AI Agent Strategy:**
- Use background terminal execution with `isBackground=true`
- Poll `likubuddy-state.txt` to detect state changes instead of fixed waits
- Chain navigation keys without delays - the TUI handles rapid input
- Only add delays when waiting for screen transitions (e.g., entering a submenu)

**Countdown Behavior:**
- When game starts, you'll see "GET READY!" and a 3-2-1 countdown
- State file shows: `COUNTDOWN: 3... Get Ready!`
- Use this time to read the initial state and plan your first move
- For Snake: Set your initial direction DURING countdown
- For DinoRun: Get ready to watch for obstacles

### 1. Game Types & Strategy Modes

Games fall into two categories with DIFFERENT strategies:

#### 🐢 TURN-BASED GAMES (Tic-Tac-Toe, Chess)
Use the **Read-Act-Verify Loop**:
1.  **READ** `likubuddy-state.txt` to get current state.
2.  **ANALYZE** the visual state (and JSON structured data for Chess).
3.  **EXECUTE** command with stacked keys: `.\send-keys.ps1 -Key "{DOWN}{DOWN}{ENTER}"`.
4.  **READ** `likubuddy-state.txt` AGAIN immediately (no sleep needed).
5.  **REPEAT** from step 2.

**Note:** For Chess, the state file includes FEN notation and legal moves in JSON format - no need to parse the visual board!

#### ⚡ REAL-TIME GAMES (Snake, Dino Run)
Use **Memory-Based Reactive Play**:
- Read the state file ONCE to understand the initial position
- **MEMORIZE** the rules and react based on patterns, NOT constant file reads
- Send commands rapidly based on your memorized strategy
- Only read the state file again if you need to reassess after a pause

**Why?** Real-time games update every 80-150ms. Reading the file after every action is too slow. Trust your memory and pattern recognition.

### 2. Multi-Key Sequences (Navigation Optimization)
Chain menu navigation keys without delays - the TUI handles rapid input:
```powershell
$wshell = New-Object -ComObject WScript.Shell
$wshell.AppActivate('LikuBuddy Game Window')
# Send all navigation keys at once
$wshell.SendKeys("{DOWN}{DOWN}{DOWN}{ENTER}")
```

**Poll Instead of Sleep:**
```powershell
# Instead of: Start-Sleep -ms 500
# Do this - poll until state changes:
$target = "Playing Snake"
do {
    Start-Sleep -ms 50
    $state = Get-Content .\likubuddy-state.txt -Raw
} while ($state -notmatch $target)
```

**When Sleeps ARE Needed:**
- After `{ENTER}` that loads a new screen (use 200-300ms or poll)
- During real-time gameplay tick synchronization
- NOT between arrow key presses in menus

### 3. Troubleshooting
- **"Could not activate game window"**: Ensure the game is actually running (`npm start`).
- **Game Over**: If the status says "GAME OVER", press `{ESC}` or `q` to return to the menu.
- **Stuck**: If you are stuck, try pressing `{ESC}` multiple times to back out to the main menu.

## 🕹️ Game Specifics

### Tic-Tac-Toe (🐢 TURN-BASED - Read Every Move)
- **Goal**: Get 3 of your marks (X) in a row horizontally, vertically, or diagonally.
- **Controls**: Arrow keys to move cursor `[.]`, `{ENTER}` to place your X.
- **Vision**: The board shows your cursor in brackets like `[.]`. You are X, Liku is O.
- **Winning Lines**: (0,1,2), (3,4,5), (6,7,8), (0,3,6), (1,4,7), (2,5,8), (0,4,8), (2,4,6).

#### 🧠 MEMORIZED STRATEGY (Read state, then apply):
1. **Take center (4)** if available - strongest opening
2. **Win if you can** - check for 2-in-a-row opportunities
3. **Block Liku** if he has 2 in a row
4. **Create a fork** - position with two ways to win

#### Navigation Reference:
```
 0 | 1 | 2      Cursor Movement:
 3 | 4 | 5      {UP} = -3, {DOWN} = +3
 6 | 7 | 8      {LEFT} = -1, {RIGHT} = +1
```

#### Multi-Move Navigation Example:
To move from position 0 to position 4 (center):
```powershell
# From top-left to center = RIGHT + DOWN
$wshell.SendKeys("{RIGHT}"); Start-Sleep -ms 100; $wshell.SendKeys("{DOWN}")
```

### Snake (⚡ REAL-TIME - Memory Mode)
- **Goal**: Eat food ('F'), grow long, avoid walls and your tail ('o').
- **Controls**: Arrow keys to change direction.
- **Vision**: 'H' is your head. 'o' is your body. 'F' is food. State shows Direction and Food Delta.
- **CRITICAL RULE**: You CANNOT reverse direction. If moving `{UP}`, you cannot press `{DOWN}`. It will kill you.

#### � AI MODE BEHAVIOR (if difficulty='ai'):
- **Speed**: 350ms per tick (vs 80-150ms for humans)
- **Countdown**: 3-second countdown before game starts
- **Strategy**: Poll state file every ~100ms, react immediately
- During countdown: Set your initial direction toward food
- State shows: `COUNTDOWN: 3... | Direction: UP`

**Optimized AI Snake Loop:**
```powershell
$wshell = New-Object -ComObject WScript.Shell
while ($true) {
    $state = Get-Content .\likubuddy-state.txt -Raw
    if ($state -match "GAME OVER") { break }
    if ($state -match "DANGER") {
        $wshell.AppActivate('LikuBuddy Game Window')
        # Turn perpendicular based on current direction
        if ($state -match "Direction: (UP|DOWN)") { $wshell.SendKeys("{LEFT}") }
        else { $wshell.SendKeys("{UP}") }
    }
    Start-Sleep -ms 100  # Poll rate
}
```

#### �🧠 MEMORIZED RULES (Don't re-read, just act):
1. **Grid is 20x20** (0-19 on both axes)
2. **Walls kill** - never let head go < 0 or >= 20
3. **Tail kills** - never move into your own body
4. **Food Delta** tells you: `dx > 0` means food is RIGHT, `dx < 0` means LEFT, `dy > 0` means food is DOWN, `dy < 0` means UP
5. **[DANGER!]** warning in state means TURN IMMEDIATELY

#### ⚡ REACTIVE PATTERN:
```
READ state once → Note: Head position, Direction, Food Delta, any DANGER
WHILE playing:
  - If DANGER warning: turn perpendicular (if going UP/DOWN, turn LEFT or RIGHT)
  - If safe: move toward food (use dx/dy signs)
  - Send key and continue without reading
  - Re-read state every 5-10 moves OR after eating food
```

### Dino Run (⚡ REAL-TIME - Memory Mode)
- **Goal**: Jump over obstacles ('X') to survive as long as possible.
- **Controls**: `{SPACE}` or `{UP}` to jump.
- **Vision**: 'D' is you. 'X' is an obstacle. State shows "Next Obstacle: Dist=N".

#### � AI MODE BEHAVIOR (if difficulty='ai'):
- **Speed**: 150ms per tick (vs 60-100ms for humans)
- **Countdown**: 3-second countdown before game starts
- **Spawn Rate**: Obstacles spawn less frequently (0.04 vs 0.1)
- State shows: `COUNTDOWN: 3... Get Ready!`

**Optimized AI DinoRun Loop:**
```powershell
$wshell = New-Object -ComObject WScript.Shell
# Start the game
$wshell.AppActivate('LikuBuddy Game Window')
$wshell.SendKeys("{ENTER}")
# Wait for countdown to finish
do { Start-Sleep -ms 100; $s = Get-Content .\likubuddy-state.txt -Raw } while ($s -match "COUNTDOWN")
# Main game loop - poll and react
while ($true) {
    $state = Get-Content .\likubuddy-state.txt -Raw
    if ($state -match "GAME_OVER") { break }
    if ($state -match "JUMP NOW.*Y=0") {
        $wshell.AppActivate('LikuBuddy Game Window')
        $wshell.SendKeys(" ")  # Space to jump
    }
    Start-Sleep -ms 50  # Fast poll for obstacles
}
```

#### �🧠 MEMORIZED RULES (Don't re-read, just act):
1. **Dino is at X=52** (right side of 60-wide screen)
2. **Obstacles spawn at X=0** and move RIGHT toward you
3. **Ground obstacles (Y=0)**: JUMP when Dist is 3-6
4. **Flying obstacles (Y=3, bats)**: DON'T jump, stay low
5. **[JUMP NOW!]** appears when it's time to jump
6. **Jump takes ~1 second** to complete arc

#### ⚡ REACTIVE PATTERN:
```
READ state → Press ENTER to start
WHILE gameState == PLAYING:
  READ state quickly
  IF "JUMP NOW!" in visualState AND "Y=0" (ground obstacle):
    Send {SPACE} immediately
  ELSE IF Dist <= 6 AND Dist >= 3 AND Y=0:
    Send {SPACE}
  Wait 200-300ms between reads (game updates every 80ms)
```

**TIP**: For DinoRun, reading state rapidly IS viable because you need to see obstacle distance. But act IMMEDIATELY when Dist enters the 3-6 range.

## ⚠️ Safety Protocols
- Do not delete source files.
- Do not modify the `likubuddy-state.txt` manually; only read it.
- If the game crashes, restart it using the Start-Process command above (NOT `npm start` inline).

## 📋 Menu Navigation

### Main Menu Items (in order):
1. `🎮 Let's Play` - Opens games submenu
2. `🔨 Let's Build a Game!` - AI game generator
3. `🌟 Community Games` - Play AI-generated games
4. `💻 LikuOS Stats` - View detailed stats
5. `🍖 Feed Liku` - Costs 10 XP, reduces hunger by 20
6. `💤 Rest` - Restores 30 energy, adds 10 hunger
7. `⚙️ Settings` - Change theme/difficulty
8. `🚪 Exit` - Quit the application

### Games Submenu:
1. `🐍 Play Snake` - Requires 10 energy
2. `❌⭕ Tic-Tac-Toe` - Requires 5 energy
3. `🦖 Dino Run` - Requires 10 energy
4. `♟️ Play Chess` - Strategic chess vs AI
5. `🔙 Back to Main Menu`

### Chess (🐢 TURN-BASED - Read Every Move)
- **Goal**: Checkmate the opponent's king.
- **Controls**: 
  - Arrow keys to move cursor on the board
  - `{ENTER}` to select a piece, then move cursor to destination and `{ENTER}` again
  - `{TAB}` to switch to text input mode (type moves like "e4", "Nf3", "O-O")
  - `h` for hint, `u` for undo, `f` to flip board, `r` to resign
- **Vision**: The state file includes **FEN notation** which is a complete machine-readable board representation.

#### 🎯 CRITICAL: Reading Chess State
The `likubuddy-state.txt` file includes a `STRUCTURED STATE (JSON)` section with:
```json
{
  "type": "chess",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "turn": "w",
  "legalMoves": ["a2a3", "a2a4", "b1a3", "b1c3", ...],
  "legalMovesSan": ["a3", "a4", "Na3", "Nc3", ...],
  "isCheck": false,
  "isCheckmate": false,
  "evaluation": 35,
  "recommendations": ["White to move. 20 legal moves available.", ...]
}
```

**FEN Explained**: `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1`
- Board position (rank 8 to rank 1, separated by `/`)
- Lowercase = black pieces, Uppercase = white pieces
- Numbers = empty squares
- After the board: `turn` `castling-rights` `en-passant` `halfmove` `fullmove`

#### 🧠 CHESS STRATEGY FOR AI:
1. **Read the FEN** - Parse the complete board position
2. **Check legalMoves** - Only these moves are valid
3. **Use legalMovesSan** - Human-readable notation (e4, Nf3, Qxd7+, O-O)
4. **Check evaluation** - Positive = white advantage (centipawns)
5. **Watch for isCheck** - Must escape if in check

#### 🎮 Making a Move (Cursor Mode):
```powershell
# Example: Play e4 (e2 to e4)
# 1. Navigate to e2 (starting position usually has cursor near e2)
# 2. Press ENTER to select pawn
# 3. Navigate to e4
# 4. Press ENTER to complete move
$wshell = New-Object -ComObject WScript.Shell
$wshell.AppActivate('LikuBuddy Game Window')
$wshell.SendKeys("{DOWN}{DOWN}{ENTER}")  # Select pawn on e2
Start-Sleep -ms 200
$wshell.SendKeys("{UP}{UP}{ENTER}")      # Move to e4
```

#### 🎮 Making a Move (Text Mode - Recommended for AI):
```powershell
# Switch to text mode with TAB, then type the move
$wshell.SendKeys("{TAB}")
Start-Sleep -ms 100
$wshell.SendKeys("e4{ENTER}")  # Standard algebraic notation
```

#### 📝 Move Notation Examples:
- `e4` - Pawn to e4
- `Nf3` - Knight to f3
- `Bxc6` - Bishop captures on c6
- `O-O` - Kingside castle
- `O-O-O` - Queenside castle
- `Qd7+` - Queen to d7 with check
- `e8=Q` - Pawn promotes to queen

### AI vs AI Chess Battle Script
For running chess games without the UI:
```powershell
node scripts/chess-ai-battle.js --white intermediate --black intermediate --verbose
```
Options: `--white`, `--black` (difficulty: beginner/intermediate/advanced/grandmaster)


### Energy Management (CRITICAL)
- **You CANNOT play games if energy is 0%!**
- If energy is low, navigate to `💤 Rest` and press `{ENTER}`.
- The state file shows current stats in the STATUS line.
- Energy cost per game: Snake (10), Tic-Tac-Toe (5), Dino (10).

### Keyboard Shortcuts (Main Menu only):
- Press `f` key to Feed Liku directly (via `.\send-keys.ps1 -Key "f"`)
- Press `r` key to Rest directly (via `.\send-keys.ps1 -Key "r"`)
- These only work when on the Main Menu screen, not inside games.

## 🔧 Restarting the Game
If the game crashes or you need to restart:
```powershell
# First, close any existing game window, then:
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd C:\dev\Liku; node dist/index.js"
```
**DO NOT use `npm start` inline** - it blocks the terminal and makes interaction impossible.
