# LikuBuddy - GitHub Copilot Coding Agent Instructions

## Project Overview

**LikuBuddy** is an AI-powered generative game platform and terminal companion built as a TUI (Terminal User Interface) extension for the Gemini CLI. It enables users to create games through natural language descriptions, play built-in arcade games, manage a virtual companion (Liku), and track progress through a SQLite database.

### Key Characteristics
- **Type**: Node.js Terminal Application / Gemini CLI Extension
- **Primary Language**: TypeScript (strict mode enabled)
- **UI Framework**: React + Ink (React for CLI)
- **Database**: SQLite3 (native module)
- **AI Integration**: Google Gemini 1.5 Pro API
- **Target Runtime**: Node.js v20.x
- **Size**: Small-to-medium (13 TypeScript source files)
- **Build Time**: ~2 seconds (TypeScript compilation)

## Build & Development Workflow

### Prerequisites
- Node.js v20.x or higher
- npm 10.x or higher
- (Optional) Gemini API key for AI game generation features

### Installation & Build Steps

**ALWAYS follow this exact sequence for a fresh setup:**

```bash
# 1. Install dependencies (runs postinstall script automatically)
npm install

# 2. Build TypeScript to JavaScript
npm run build
```

**Important Notes:**
- `npm install` automatically runs a postinstall script that installs the `/liku` command to `~/.gemini/commands/liku.toml`
- This postinstall script resolves the extension path and writes configuration for Gemini CLI integration
- The build output goes to `dist/` directory (gitignored)
- Build is fast (~2 seconds) and produces no warnings in normal operation

### Running the Application

**Two ways to launch:**

1. **As Standalone Application:**
   ```bash
   npm start
   # Runs: node dist/index.js
   ```

2. **Via Gemini CLI (if installed):**
   ```bash
   gemini extensions install .
   /liku
   ```

### Development Mode

```bash
npm run dev
# Runs: tsc --watch (watches for TypeScript changes and recompiles)
```

**Note:** You must restart `npm start` manually after code changes to see them in the running application.

### Clean Rebuild

If you encounter build issues or need a clean slate:

```bash
rm -rf node_modules dist
npm install
npm run build
```

### Common Build Issues & Resolutions

1. **Missing `dist/` directory**: Always run `npm run build` before `npm start`
2. **TypeScript errors**: The project uses strict mode; type errors will fail the build
3. **sqlite3 native module issues**: Very rare - npm install handles native compilation automatically
4. **Stale build cache**: Delete `dist/` and rebuild if seeing unexpected runtime behavior

## Project Architecture

### Directory Structure

```
LikuBuddy/
├── .github/                    # GitHub metadata (this file)
├── src/                        # TypeScript source code
│   ├── index.tsx              # Entry point (CLI setup, renders LikuTUI)
│   ├── builder/               # AI game generation
│   │   └── ElicitationAgent.ts    # Gemini AI integration for code generation
│   ├── core/                  # Core systems
│   │   ├── GameLoader.ts          # Dynamic game loading & installation
│   │   └── dbTools.ts             # Database tools for AI agents (read-only)
│   ├── services/              # Backend services
│   │   └── DatabaseService.ts     # SQLite interface (singleton)
│   ├── ui/                    # React/Ink UI components
│   │   ├── LikuTUI.tsx            # Main menu & navigation
│   │   ├── LikuOS.tsx             # Real-time stats dashboard
│   │   ├── BuilderUI.tsx          # Game creation interface
│   │   ├── CommunityGamesMenu.tsx # Generated games browser
│   │   ├── SettingsMenu.tsx       # Theme & preferences
│   │   └── games/                 # Built-in games
│   │       ├── Snake.tsx
│   │       ├── TicTacToe.tsx
│   │       └── DinoRun.tsx
├── dist/                      # Build output (gitignored, mirrors src/)
├── scripts/                   # Build & install scripts
│   ├── install-command.js         # Postinstall: sets up /liku command
│   └── uninstall-command.js       # Preuninstall: cleanup
├── commands/                  # Gemini CLI integration
│   └── liku.toml                  # Command definition for Gemini CLI
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript configuration (strict mode)
└── ~/.gemini-liku/            # Runtime data (created on first run)
    └── snake.db                   # SQLite database
```

### Key Architectural Components

1. **DatabaseService** (`src/services/DatabaseService.ts`)
   - Singleton pattern for SQLite access
   - Tables: `player_stats`, `user_settings`, `pro_tokens`, `game_registry`, `leaderboards`
   - Database location: `~/.gemini-liku/snake.db` (auto-created)
   - All database operations are synchronous wrapper methods around sqlite3

2. **GameLoader** (`src/core/GameLoader.ts`)
   - Dynamically loads games at runtime using ES module imports
   - Installs AI-generated games to `dist/ui/games/community/` (note: generated games go to dist, not src)
   - Validates game code structure before installation
   - Registers games in SQLite `game_registry` table

3. **ElicitationAgent** (`src/builder/ElicitationAgent.ts`)
   - Interfaces with Gemini AI API for game generation
   - Requires `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` environment variable
   - Generates TypeScript code following the Liku SDK contract
   - Two modes: Quick (instant) and Detailed (interactive Q&A)

4. **UI Components** (`src/ui/`)
   - Built with React + Ink framework (declarative CLI UI)
   - Uses hooks: `useState`, `useEffect`, `useInput` (for keyboard handling)
   - All games receive `onExit` callback and optional `difficulty` prop
   - Main navigation handled by `LikuTUI.tsx` with screen state machine

### TypeScript Configuration

Located in `tsconfig.json`:
- **Target**: ES2022
- **Module**: Node16 (ES modules with .js extensions in imports)
- **JSX**: react-jsx (for Ink components)
- **Strict Mode**: Enabled (type safety enforced)
- **Output**: dist/ (mirrors src/ structure)

**Important:** Import statements in TypeScript must use `.js` extension for compatibility with Node16 module resolution (e.g., `import { db } from './services/DatabaseService.js'`)

## Testing & Validation

### Current Test Infrastructure

**This project has NO automated test suite.** There are no test files, no Jest configuration, and no test scripts defined.

### Manual Validation Steps

When making code changes, validate manually by:

1. **Build validation:**
   ```bash
   npm run build
   # Should complete in ~2 seconds with no errors
   ```

2. **Runtime validation:**
   ```bash
   npm start
   # Application should launch and display main menu
   # Test navigation with arrow keys and Enter
   # Press Escape to exit
   ```

3. **Feature-specific validation:**
   - **Game changes**: Select "🎮 Let's Play" → Choose game → Verify it runs
   - **UI changes**: Navigate menus and verify appearance/behavior
   - **Database changes**: Check `~/.gemini-liku/snake.db` or run queries via LikuOS stats
   - **Build script changes**: Test clean install/build workflow

### Linting

**No linter is configured.** There is no ESLint, Prettier, or other code style tool in this project.

## Common Development Patterns

### Adding a New Built-in Game

1. Create `src/ui/games/YourGame.tsx`
2. Follow the Liku SDK contract:
   ```typescript
   interface GameProps {
     onExit: () => void;
     difficulty?: 'easy' | 'medium' | 'hard';
   }
   
   const YourGame = ({ onExit, difficulty = 'medium' }: GameProps) => {
     useInput((input, key) => {
       if (key.escape) onExit();
       // Game input logic
     });
     
     return (
       <Box flexDirection="column" borderStyle="round" borderColor="cyan">
         {/* Game UI */}
       </Box>
     );
   };
   
   export default YourGame;
   ```
3. Import and add to game selection menu in `src/ui/LikuTUI.tsx`
4. Build and test: `npm run build && npm start`

### Modifying Database Schema

1. Edit table definitions in `src/services/DatabaseService.ts`
2. Update the `init()` method to add new tables or columns
3. **Important:** The database is NOT migrated automatically - users must delete `~/.gemini-liku/snake.db` to get new schema
4. Consider backward compatibility for existing users

### Working with AI Game Generation

The AI generation system requires a Gemini API key:

```bash
export GEMINI_API_KEY="your-key-here"
# OR
export GOOGLE_AI_API_KEY="your-key-here"
```

Generated games are:
- Created as TypeScript code strings by `ElicitationAgent`
- Written to `dist/ui/games/community/` (NOT src/) by `GameLoader`
- Dynamically imported at runtime
- Registered in SQLite `game_registry` table

### Debugging Tips

1. **Database inspection:**
   ```bash
   sqlite3 ~/.gemini-liku/snake.db
   .tables
   SELECT * FROM player_stats;
   ```

2. **TypeScript errors:**
   - Check import paths use `.js` extension
   - Verify strict type compliance
   - Use `any` sparingly (project prefers explicit types)

3. **Runtime errors:**
   - Check Node.js version (v20.x required)
   - Verify dist/ is up to date with src/
   - Look for missing environment variables (API keys)

## Environment Variables

- `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY`: Required only for AI game generation features
- No other environment variables are used

## Dependencies

### Key Production Dependencies
- `react@^18.2.0` + `ink@^5.0.0`: UI framework
- `sqlite3@^5.1.7`: Native database module
- `@google/generative-ai@^0.24.1`: Gemini AI integration
- `meow@^13.0.0`: CLI argument parsing
- `ink-text-input@^6.0.0`: Text input component
- `zod@^3.22.0`: Schema validation

### Development Dependencies
- `typescript@^5.3.0`: Compiler
- `@types/*`: Type definitions for Node, React, SQLite

**Note:** All dependencies are standard and install cleanly via npm. No special setup or patches required.

## Repository Files Reference

### Root Directory Files
```
.gitignore                 # Excludes: node_modules, dist, *.db, .env
package.json               # Project metadata & scripts
package-lock.json          # Dependency lock file
tsconfig.json              # TypeScript compiler configuration
gemini-extension.json      # Extension manifest for Gemini CLI
LikuBuddy.code-workspace   # VS Code workspace file (optional)
```

### Documentation Files
```
README.md                           # Getting started guide
GENERATIVE_GAME_PLATFORM.md        # Architecture deep-dive
IMPLEMENTATION_SUMMARY.md           # v2.0 implementation details
GEMINI.md                           # Extension context for Gemini CLI
PERSISTENCE_AND_COMMANDS_UPDATE.md # Supervisor persistence notes
SUPERVISOR_PORT_COMPLETE.md        # Supervisor system port documentation
```

## Critical Instructions

### Always Trust These Build Steps

The following workflow is **validated and guaranteed to work**:

```bash
# Clean setup from scratch
rm -rf node_modules dist
npm install          # ~4 seconds, runs postinstall automatically
npm run build        # ~2 seconds, no errors expected
npm start            # Launches immediately
```

**Do NOT:**
- Skip the build step before running
- Manually run postinstall scripts (npm install does this)
- Edit files in `dist/` (they are generated)
- Add test frameworks unless explicitly requested (project has none)

### Search Only When Needed

Use search/exploration tools only if:
- These instructions are incomplete for your specific task
- You encounter unexpected errors not covered here
- You need to understand implementation details of a specific feature

For standard tasks (adding games, modifying UI, updating database), follow the patterns documented above without additional searching.

## Common Pitfalls

1. **Running without building**: Always `npm run build` after code changes
2. **Editing wrong directory**: Edit `src/`, not `dist/`
3. **Missing API key**: AI features require `GEMINI_API_KEY` env var
4. **Type errors**: Project uses strict TypeScript; all types must be correct
5. **Import extensions**: Use `.js` in imports, not `.ts` (Node16 modules requirement)
6. **Database location**: Runtime DB is `~/.gemini-liku/snake.db`, NOT in project directory

## GitHub Workflows / CI/CD

**This repository has NO GitHub Actions or CI/CD pipelines configured.** There are no automated checks on pull requests.

Validation is entirely manual via local build and testing.

---

**Last Updated**: 2024-11-24  
**Package Version**: 1.0.0 (Architecture: v2.0 Generative Game Platform)  
**Recommended Node Version**: 20.x (not enforced in package.json)

By following these instructions, you should be able to build, run, and modify LikuBuddy efficiently without unnecessary exploration or trial-and-error.
