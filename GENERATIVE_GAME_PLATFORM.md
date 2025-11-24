# LikuBuddy Generative Game Platform

## Overview

LikuBuddy has been transformed from a simple game runner into an **AI-Elicited, Database-Backed Generative Game Platform**. Users can now describe games they want to play, and the extension will:

1. **Elicit** requirements through clarifying questions
2. **Generate** the game code using Gemini AI and the Liku SDK
3. **Migrate** the SQLite schema to support new game stats
4. **Hot-load** games dynamically into the CLI

## Architecture

### 1. Data Layer (SQLite)

The database now serves as the "Game State Engine" with expanded schema:

#### Core Tables

**`pro_tokens`** - Economy System
```sql
CREATE TABLE pro_tokens (
    user_id TEXT PRIMARY KEY,
    balance INTEGER DEFAULT 10000,
    last_reset DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**`game_registry`** - Dynamic Game Catalog
```sql
CREATE TABLE game_registry (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**`leaderboards`** - Universal High Scores
```sql
CREATE TABLE leaderboards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT,
    user_id TEXT,
    score INTEGER,
    meta_data TEXT,  -- JSON for game-specific stats
    FOREIGN KEY(game_id) REFERENCES game_registry(id)
);
```

### 2. Elicitation Engine

**File:** `src/builder/ElicitationAgent.ts`

The Elicitation Agent uses Gemini AI with a specialized system prompt that includes the Liku SDK contract. It can:

- **Start Elicitation Session**: Ask clarifying questions about game mechanics
- **Generate from Answers**: Create complete game code based on user responses
- **Quick Generate**: Skip questions and make reasonable assumptions

#### Liku SDK Contract

Games must follow this structure:

```typescript
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface GameProps {
  onExit: () => void;
  difficulty?: 'easy' | 'medium' | 'hard';
}

const MyGame = ({ onExit, difficulty = 'medium' }: GameProps) => {
  // Game implementation
  
  useInput((input, key) => {
    if (key.escape) {
      onExit();
    }
    // Handle game input
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan">
      {/* Game UI */}
    </Box>
  );
};

export default MyGame;

// Optional manifest for metadata
export const GameManifest = {
  id: 'unique-game-id',
  name: 'Game Name',
  description: 'Brief description',
  energyCost: 10,
  xpReward: 20
};
```

### 3. Game Loader

**File:** `src/core/GameLoader.ts`

The GameLoader handles:

- **Installation**: Saves generated code to `src/games/community/`
- **Registration**: Adds games to SQLite registry
- **Dynamic Loading**: Imports game modules at runtime
- **Validation**: Checks code structure before installation

### 4. LikuOS UI

**File:** `src/ui/LikuOS.tsx`

LikuOS provides real-time stats visualization with two modes:

- **CLI Mode**: Compact one-liner with live token balance and stats
- **FULL Mode**: Detailed dashboard with all metrics

Uses polling (2-second interval) to display real-time updates from the database.

### 5. Database Tools (Gemini CLI Integration)

**File:** `src/core/dbTools.ts`

Provides read-only SQL access for AI agents:

```typescript
// Query stats naturally
queryLikuStats("SELECT * FROM player_stats WHERE id = 1");

// Get game leaderboards
getGameHighScores("snake", 10);

// Check token balance
getProTokensBalance("me");
```

**Security**: Only SELECT queries are allowed, preventing data modification.

## User Workflows

### Creating a New Game

1. Launch LikuBuddy: `/liku` or `npm start`
2. Select "🛠️ Build a Game (AI-Powered)"
3. Describe your game idea
4. Choose Quick Mode (instant) or Detailed Mode (with questions)
5. Review generated code and installation
6. Play your new game from "🌟 Community Games"

### Playing Community Games

1. Launch LikuBuddy
2. Select "🌟 Community Games"
3. Browse generated games
4. Select and play any game
5. Scores are automatically tracked in leaderboards

### Viewing Live Stats

1. Launch LikuBuddy
2. Select "💻 LikuOS Stats"
3. View real-time Pro Tokens balance and player metrics
4. Stats update automatically every 2 seconds

## API Keys Setup

To use the game generation features, you need a Gemini API key:

```bash
# Set environment variable
export GEMINI_API_KEY="your-api-key-here"
# or
export GOOGLE_AI_API_KEY="your-api-key-here"

# Then launch LikuBuddy
/liku
```

Get your API key from: https://ai.google.dev/

## Game Generation Examples

### Example 1: Simple Puzzle
**User Input**: "A sliding tile puzzle game"
**Generated**: Complete 4x4 sliding puzzle with arrow key controls

### Example 2: Action Game
**User Input**: "Space shooter where I dodge asteroids and shoot them"
**Generated**: Side-scrolling shooter with collision detection and scoring

### Example 3: Word Game
**User Input**: "Guess the word in 6 tries like Wordle"
**Generated**: Word guessing game with colored feedback

## Database Schema Access

AI agents can query the database using natural language:

**User**: "Who has the highest score in Snake?"
**Agent**: Executes `SELECT user_id, score FROM leaderboards WHERE game_id = 'snake' ORDER BY score DESC LIMIT 1`

**User**: "How many community games are there?"
**Agent**: Executes `SELECT COUNT(*) FROM game_registry`

## File Structure

```
LikuBuddy/
├── src/
│   ├── builder/
│   │   └── ElicitationAgent.ts      # AI game generation
│   ├── core/
│   │   ├── GameLoader.ts            # Dynamic game loading
│   │   └── dbTools.ts               # Database tools for AI
│   ├── games/
│   │   ├── Snake.tsx                # Built-in games
│   │   ├── TicTacToe.tsx
│   │   ├── DinoRun.tsx
│   │   └── community/               # Generated games directory
│   ├── services/
│   │   └── DatabaseService.ts       # SQLite interface
│   └── ui/
│       ├── LikuTUI.tsx              # Main interface
│       ├── LikuOS.tsx               # Real-time stats
│       ├── BuilderUI.tsx            # Game creation UI
│       └── CommunityGamesMenu.tsx   # Generated games browser
└── ~/.gemini-liku/
    └── snake.db                      # SQLite database
```

## Advanced Features

### Pro Tokens Economy

- Start with 10,000 tokens
- Track token usage across sessions
- Future: Spending tokens on game generation or premium features

### Universal Leaderboards

- All games share a common leaderboard structure
- Supports game-specific metadata in JSON format
- Query across games: "Show me all my high scores"

### Real-Time Stats Polling

- Live updates without page refresh
- Energy, hunger, happiness tracked automatically
- XP and level progression system

### Code Validation

Generated code is validated before installation:
- Checks for required imports (React, Ink)
- Verifies component structure
- Ensures proper exports

## Troubleshooting

### "API Key Required" Error
Set `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` environment variable.

### Generated Game Won't Load
Check `src/games/community/` for syntax errors in generated code.
Run `npm run build` to see TypeScript errors.

### Database Reset
Delete `~/.gemini-liku/snake.db` to reset all data and start fresh.

### Game Generation Timeout
Increase wait time or try Quick Mode for faster generation.

## Future Enhancements

- **Token-based generation**: Spend Pro Tokens to generate games
- **Game sharing**: Export/import game code between users
- **Template library**: Pre-built game templates for faster creation
- **Multiplayer support**: Network-enabled community games
- **Asset generation**: AI-generated ASCII art and music
- **Version control**: Track iterations of generated games

## Contributing

To add features to the generative platform:

1. Extend `ElicitationAgent.ts` for better game understanding
2. Add new tools in `dbTools.ts` for AI queries
3. Enhance `GameLoader.ts` with better validation
4. Create game templates in the SDK context

---

**LikuBuddy v2.0** - From Game Runner to Game Platform 🎮✨
