# 🎮 LikuBuddy Extension

**Your AI-powered generative game platform and terminal companion, living right inside your CLI.**

LikuBuddy is a sophisticated Terminal User Interface (TUI) extension for the Gemini CLI. It transforms your terminal into an **AI-Elicited, Database-Backed Generative Game Platform** where you can:

- 🛠️ **Build games** by describing them in natural language
- 🎮 **Play games** - both built-in classics and AI-generated creations
- 📊 **Track progress** with persistent SQLite database
- ❤️ **Care for Liku** - your AI companion with real needs
- 🌟 **Share experiences** through the community games library

Built with **React**, **Ink**, **SQLite**, and **Gemini AI**, it offers a complete game development and playing experience directly in your terminal.

## ✨ Features

### 🛠️ AI-Powered Game Builder
**NEW!** Create games by simply describing them:
*   Tell LikuBuddy what kind of game you want
*   Choose detailed mode (with AI questions) or quick mode (instant generation)
*   AI generates complete, working game code using the Liku SDK
*   Games are automatically installed and ready to play
*   All community games stored in SQLite and accessible from the menu

**Example**: "Make a space shooter where I dodge asteroids" → Complete game in 30 seconds!

### 🕹️ The Game Hub
A central dashboard to manage your activities. Check Liku's stats, launch games, adjust settings, or build new games.

```text
╭──────────────────────────────────────────────────────────╮
│                 🎮 LikuBuddy Game Hub 🎮                 │
│                    Your AI Companion                     │
│ ┌──────────────────────────────────────────────────────┐ │
│ └─Level: 11─XP: 106─Hunger: 90%─Energy: 15%─Happiness: ──┘ │
│   🎮 Let's Play                                          │
│   🍖 Feed Liku (XP -10, Hunger -20)                      │
│   💤 Rest (Energy +30, Hunger +10)                       │
│   ⚙️ Settings                                            │
│ > 🚪 Exit                                                │
╰──────────────────────────────────────────────────────────╯
```

### 🎮 Play & Earn
Play classic arcade games to earn **XP** and increase Liku's **Happiness**. But watch out—playing costs **Energy**!

*   **🐍 Snake**: Navigate the grid, eat food, and grow. Features multiple difficulty levels.
*   **❌⭕ Tic-Tac-Toe**: Challenge Liku to a duel. The AI adapts to your difficulty setting!
*   **🦖 Dino Run**: A side-scrolling physics runner. Jump over cacti and dodge flying bats in a living world.

### ❤️ Buddy System
Liku isn't just a menu; he has needs!
*   **Hunger**: Feed Liku using XP you've earned from games.
*   **Energy**: Liku gets tired after playing. Let him **Rest** to recover.
*   **Happiness**: Winning games makes Liku happy. Losing might make him sad (but he's a good sport).
*   **Leveling**: Earn XP to level up your profile.

### 🌟 Community Games
*   Browse AI-generated games created by you or others
*   Play any community game directly from the menu
*   All games follow the Liku SDK contract for consistent quality
*   Leaderboards track high scores across all games

### 💻 LikuOS - Real-Time Stats
*   **Pro Tokens Economy**: Start with 10,000 tokens, track balance
*   **Live Stats Dashboard**: Energy, hunger, happiness update every 2 seconds
*   **XP & Leveling**: Progressive advancement system
*   **Universal Leaderboards**: Compare scores across all games

### 💾 Persistence & Settings
*   **SQLite Database**: All stats, high scores, games, and settings saved locally (`~/.gemini-liku/snake.db`)
*   **Game Registry**: Track all installed community games
*   **Relational Leaderboards**: Query high scores across games
*   **Themes**: Choose your vibe:
    *   `Default` (Cyan/White)
    *   `Matrix` (Green/Black)
    *   `Cyberpunk` (Yellow/Pink)
    *   `Retro` (Amber/Red)

## 🚀 Installation

### Prerequisites
- **Node.js** 20.x or higher
- **npm** 10.x or higher
- (Optional) Gemini API key for AI game generation

### Quick Start

1.  **Clone & Build**:
    ```bash
    git clone https://github.com/TayDa64/LikuBuddy.git
    cd LikuBuddy
    npm install
    npm run build
    ```

2.  **Set up Gemini API Key** (for game generation):

    <details>
    <summary>🪟 Windows (PowerShell)</summary>
    
    ```powershell
    # Temporary (current session)
    $env:GEMINI_API_KEY="your-api-key-here"
    
    # Permanent (user environment)
    [System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "your-key", "User")
    ```
    </details>

    <details>
    <summary>🍎 macOS / 🐧 Linux (Bash/Zsh)</summary>
    
    ```bash
    # Temporary (current session)
    export GEMINI_API_KEY="your-api-key-here"
    
    # Permanent (add to ~/.bashrc or ~/.zshrc)
    echo 'export GEMINI_API_KEY="your-key"' >> ~/.bashrc
    source ~/.bashrc
    ```
    </details>

    Get your free API key from: https://ai.google.dev/

3.  **Install into Gemini CLI**:
    ```bash
    gemini extensions install .
    ```

4.  **Launch**:
    You can launch LikuBuddy in two ways:
    
    **Option A: Via Gemini CLI Slash Command**
    ```bash
    /liku
    ```

    **Option B: Directly from Terminal**
    ```bash
    npm start
    # OR if installed globally
    liku
    ```

## 🎯 Quick Start

### Playing Built-in Games
1. Launch LikuBuddy: `/liku`
2. Select "🎮 Let's Play"
3. Choose Snake, Tic-Tac-Toe, or Dino Run
4. Play and earn XP!

### Creating Your First Game
1. Launch LikuBuddy: `/liku`
2. Select "🛠️ Build a Game (AI-Powered)"
3. Describe your game: *"A puzzle where I match colors"*
4. Choose Quick Mode for instant generation
5. Wait 10-30 seconds for AI to generate your game
6. Play your new game from "🌟 Community Games"!

### Viewing Stats
1. Launch LikuBuddy: `/liku`
2. Select "💻 LikuOS Stats"
3. Watch real-time updates of your progress

### Using Mini Dashboard Mode
1. Launch LikuBuddy: `/liku`
2. Press `m` to toggle mini dashboard (compact 2-line view)
3. Press `m` again to return to full menu
4. Mini mode shows: Pro Tokens, Level, Energy, Happiness at a glance

**Mini mode is perfect for:**
- Quick status checks without leaving your workflow
- Monitoring Liku's stats while working on other tasks
- Reducing screen clutter when you don't need the full menu

## 🤖 AI Agent Interaction

LikuBuddy supports AI agents (like Gemini, Claude, or GPT) controlling the game programmatically. We provide **cross-platform** tools that work on Windows, macOS, and Linux.

> ⚠️ **CRITICAL: Run Game in Separate Terminal**
> 
> When using AI agents to control LikuBuddy, you **MUST** run the game in a separate terminal window from your agent commands. The agent scripts use window activation and sleep commands that will freeze your environment if run in the same terminal as the game.
> 
> **Correct Setup:**
> 1. Open **Terminal 1**: Run `npm start` (game runs here)
> 2. Open **Terminal 2**: Run agent commands here (e.g., `npm run agent key enter`)
> 
> **Wrong Setup (will freeze):**
> - Running `npm start` and agent commands in the same terminal
> - Running agent scripts from within the game's terminal session

### Cross-Platform Agent CLI (Recommended)

The unified agent CLI works on all platforms:

```bash
# Send a key to the game
npm run agent key up
npm run agent key enter
npm run agent key f        # Feed shortcut

# Read game state as JSON
npm run agent read

# Get AI-suggested next action
npm run agent decide

# Show system info
npm run agent info

# Auto-play mode (experimental)
npm run agent auto 10
```

### Platform-Specific Scripts

<details>
<summary>🪟 Windows (PowerShell)</summary>

Use the provided PowerShell scripts:
*   `.\up.ps1` / `.\down.ps1` / `.\left.ps1` / `.\right.ps1` - Arrow keys
*   `.\enter.ps1` - Enter key
*   `.\feed.ps1` - Feed Liku (shortcut 'f')
*   `.\rest.ps1` - Rest Liku (shortcut 'r')

```powershell
# Example: Navigate menu and select
.\down.ps1
.\down.ps1
.\enter.ps1
```

*Note: These scripts auto-detect the game window. Pass `-Id 1234` to specify process ID.*
</details>

<details>
<summary>🍎 macOS / 🐧 Linux (Bash)</summary>

Use the bash script (macOS uses AppleScript, Linux requires xdotool):

```bash
# Make executable (first time only)
chmod +x scripts/agent-keys.sh

# Send keys
./scripts/agent-keys.sh up
./scripts/agent-keys.sh enter
./scripts/agent-keys.sh f
```

**Linux Setup**: Install xdotool first:
```bash
# Debian/Ubuntu
sudo apt install xdotool

# Fedora
sudo dnf install xdotool

# Arch
sudo pacman -S xdotool
```
</details>

### Reading Game State

1.  **Start the game** in a terminal:
    ```bash
    npm start
    ```

2.  **Read the state file** (`likubuddy-state.txt`):
    ```bash
    # Using agent CLI (returns JSON)
    npm run agent read
    
    # Or read file directly
    cat likubuddy-state.txt
    ```

3.  **State file format**:
    ```text
    CURRENT SCREEN: Main Menu
    STATS: Level: 11, XP: 106, Hunger: 90%, Energy: 15%, Happiness: 80%
    MESSAGE: Liku is too tired to play! Let him rest first.
    MENU ITEMS:
      [ ] 🎮 Let's Play
      [ ] 🔨 Let's Build a Game!
      [ ] 🌟 Community Games
      [ ] 💻 LikuOS Stats
      [ ] 🍖 Feed Liku (XP -10, Hunger -20)
      [ ] 💤 Rest (Energy +30, Hunger +10)
      [ ] ⚙️ Settings
      [x] 🚪 Exit
    ```

## 🛠️ Tech Stack

*   **Runtime**: Node.js
*   **UI Framework**: [Ink](https://github.com/vadimdemedes/ink) (React for CLI)
*   **Language**: TypeScript
*   **Database**: SQLite3 (via `sqlite3` native module)
*   **AI Engine**: Google Gemini 1.5 Pro (via `@google/generative-ai`)
*   **Architecture**: 
    *   Component-based UI with React patterns
    *   Singleton Database Service with relational schema
    *   Elicitation Agent for game generation
    *   Dynamic game loader with hot-swapping
    *   Real-time stats with polling hooks

## 🤝 Contributing

Contributions are welcome! Here's how to extend LikuBuddy:

*   **Add Built-in Games**: Create games in `src/ui/games/` following the Liku SDK contract
*   **Enhance AI Generation**: Improve the SDK context in `src/builder/ElicitationAgent.ts`
*   **New Database Tools**: Add AI query helpers in `src/core/dbTools.ts`
*   **UI Improvements**: Enhance components in `src/ui/`
*   **Game Validation**: Improve code checking in `src/core/GameLoader.ts`

See [GENERATIVE_GAME_PLATFORM.md](./GENERATIVE_GAME_PLATFORM.md) for detailed architecture documentation.

## 📚 Documentation

*   [README.md](./README.md) - This file (getting started)
*   [GENERATIVE_GAME_PLATFORM.md](./GENERATIVE_GAME_PLATFORM.md) - Complete architecture guide
*   [GEMINI.md](./GEMINI.md) - Extension context for Gemini CLI

## 🎮 Game SDK

Want to create games manually? Follow the Liku SDK contract:

```typescript
import React from 'react';
import { Box, Text, useInput } from 'ink';

interface GameProps {
  onExit: () => void;
  difficulty?: 'easy' | 'medium' | 'hard';
}

const MyGame = ({ onExit, difficulty }: GameProps) => {
  useInput((input, key) => {
    if (key.escape) onExit();
    // Your game logic
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan">
      <Text bold>My Awesome Game</Text>
    </Box>
  );
};

export default MyGame;
```

## 📝 License

MIT License - Feel free to use, modify, and distribute!

---
*Built with ❤️ using GitHub Copilot & Gemini AI*
*LikuBuddy v2.0 - The Generative Game Platform* 🎮✨
