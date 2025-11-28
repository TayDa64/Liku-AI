# 🎮 LikuBuddy Game Builder - AI Generation Guide

> **Purpose**: Universal instructions for AI models to generate high-quality terminal games.
> **Target**: Any AI (Gemini, GPT, Claude, future models) generating games for LikuBuddy.

---

## 1. Environment Specification

### Runtime
| Component | Version/Type |
|-----------|--------------|
| Runtime | Node.js 20+ |
| Language | TypeScript (strict mode) |
| UI Framework | React 18 + Ink 5 |
| Module System | ESM (`import`/`export`) |
| Output | Terminal/Console (TTY) |

### Terminal Constraints
- **Font**: Monospace only (all characters equal width)
- **Colors**: 16 ANSI colors (8 standard + 8 bright)
- **Input**: Keyboard only (no mouse)
- **Size**: Variable (typically 80-120 cols × 24-40 rows)
- **Refresh**: React reconciliation (no direct cursor control)

### Available Imports (ONLY THESE)
```typescript
// ✅ ALLOWED
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';

// ❌ FORBIDDEN - Will cause runtime errors
import { anything } from '../../core/...';
import { anything } from '../../services/...';
import fs from 'fs';  // No filesystem access
```

---

## 2. Required Component Structure

Every game MUST export a default component with this exact interface:

```typescript
interface GameProps {
  onExit: () => void;                          // REQUIRED: Return to menu
  difficulty?: 'easy' | 'medium' | 'hard';     // OPTIONAL: Game difficulty
}

const GameName: React.FC<GameProps> = ({ onExit, difficulty = 'medium' }) => {
  // Implementation
};

export default GameName;
```

### Mandatory Behaviors
1. **Escape Key → Exit**: Always call `onExit()` when user presses Escape
2. **Difficulty Scaling**: Adjust speed, complexity, or challenge based on `difficulty`
3. **Self-Contained**: All game logic within the component (no external state)

---

## 3. Game Categories & Patterns

### 3.1 Grid-Based Games (Sudoku, Chess, Minesweeper, 2048)
```typescript
// State: 2D array
const [grid, setGrid] = useState<Cell[][]>(() => initializeGrid());
const [cursor, setCursor] = useState({ row: 0, col: 0 });

// Rendering: Nested loops with box-drawing borders
{grid.map((row, r) => (
  <Box key={r}>
    {row.map((cell, c) => renderCell(cell, r, c))}
  </Box>
))}
```

### 3.2 Real-Time Action Games (Snake, Tetris, Breakout, Space Invaders)
```typescript
// State: Positions, velocities, game loop
const [player, setPlayer] = useState({ x: 10, y: 5 });
const [enemies, setEnemies] = useState<Entity[]>([]);
const [gameLoop, setGameLoop] = useState(true);

// Game loop with cleanup
useEffect(() => {
  if (!gameLoop) return;
  const timer = setInterval(() => tick(), speed);
  return () => clearInterval(timer);
}, [gameLoop, speed]);
```

### 3.3 Text/Word Games (Hangman, Wordle, Typing, Trivia)
```typescript
// State: Word, guesses, attempts
const [targetWord] = useState(() => selectWord(difficulty));
const [guesses, setGuesses] = useState<string[]>([]);
const [currentInput, setCurrentInput] = useState('');

// Character input handling
if (/^[a-zA-Z]$/.test(input)) {
  handleLetterInput(input.toLowerCase());
}
```

### 3.4 Card/Turn-Based Games (Blackjack, Memory Match, RPG)
```typescript
// State: Deck, hands, turn
const [deck, setDeck] = useState(() => shuffle(createDeck()));
const [playerHand, setPlayerHand] = useState<Card[]>([]);
const [turn, setTurn] = useState<'player' | 'dealer'>('player');
```

---

## 4. Visual Rendering System

### 4.1 Box-Drawing Characters (Essential Reference)

**Single Lines** (standard borders):
```
┌───┬───┐    ─ horizontal    │ vertical
│   │   │    ┌ top-left      ┐ top-right
├───┼───┤    └ bottom-left   ┘ bottom-right
│   │   │    ├ left-tee      ┤ right-tee
└───┴───┘    ┬ top-tee       ┴ bottom-tee    ┼ cross
```

**Double Lines** (emphasis/divisions):
```
╔═══╦═══╗    ═ horizontal    ║ vertical
║   ║   ║    ╔ top-left      ╗ top-right
╠═══╬═══╣    ╚ bottom-left   ╝ bottom-right
║   ║   ║    ╠ left-tee      ╣ right-tee
╚═══╩═══╝    ╦ top-tee       ╩ bottom-tee    ╬ cross
```

**Mixed** (sub-grid divisions):
```
╥ ╨ ╫    double-vertical meets single-horizontal
╤ ╧ ╪    double-horizontal meets single-vertical
╞ ╡      single-horizontal to double-vertical edge
```

### 4.2 Cell Width Standard

**ALWAYS use 3-character minimum cell width:**
```typescript
// ❌ BAD: Compressed, unreadable
<Text>|{value}|</Text>

// ✅ GOOD: Padded, readable
<Text>{` ${value} `}</Text>

// For numbers that may be multi-digit:
<Text>{` ${value.toString().padStart(2, ' ')} `}</Text>
```

### 4.3 Cursor/Selection Visibility

**Use background color, not just text color:**
```typescript
// ❌ BAD: Hard to see
<Text color={selected ? 'yellow' : 'white'}>{value}</Text>

// ✅ GOOD: Clearly visible
<Text 
  backgroundColor={selected ? 'blue' : undefined}
  color={selected ? 'white' : 'gray'}
>
  {` ${value} `}
</Text>
```

### 4.4 Color Palette & Semantic Meaning

| Color | Ink Value | Use For |
|-------|-----------|---------|
| Cyan | `color="cyan"` | Titles, preset/locked values, info |
| Green | `color="green"` | Success, valid input, player |
| Red | `color="red"` | Errors, danger, enemies, conflicts |
| Yellow | `color="yellow"` | Warnings, instructions, score |
| Magenta | `color="magenta"` | Hints, special items, power-ups |
| Blue BG | `backgroundColor="blue"` | Cursor, current selection |
| Gray | `color="gray"` | Borders, disabled, secondary text |
| White | `color="white"` | Default text, empty cells |

---

## 5. Input Handling

### 5.1 Standard Key Mappings

```typescript
useInput((input, key) => {
  // EXIT - Always handle first
  if (key.escape) { onExit(); return; }
  
  // NAVIGATION
  if (key.upArrow)    { /* move up */ }
  if (key.downArrow)  { /* move down */ }
  if (key.leftArrow)  { /* move left */ }
  if (key.rightArrow) { /* move right */ }
  
  // ACTIONS
  if (key.return)     { /* confirm/select */ }
  if (input === ' ')  { /* space: action/toggle */ }
  
  // GAME CONTROLS
  if (input === 'h' || input === 'H') { /* hint */ }
  if (input === 'r' || input === 'R') { /* restart */ }
  if (input === 'p' || input === 'P') { /* pause */ }
  
  // TEXT INPUT (for word games)
  if (/^[a-zA-Z]$/.test(input)) { /* letter */ }
  if (/^[0-9]$/.test(input))    { /* number */ }
  
  // DELETE (multiple representations)
  if (input === '\x7F' || input === '\x08' || key.delete) { /* backspace */ }
});
```

### 5.2 Display Controls to User

Always show available controls:
```tsx
<Text color="yellow">
  ↑↓←→ Move │ Enter Select │ H Hint │ R Restart │ ESC Exit
</Text>
```

---

## 6. Standard UI Layout

```
┌─────────────────────────────────────────────┐
│              🎮 GAME TITLE 🎮               │  ← Title with emoji
│           Difficulty: medium                │  ← Subtitle/info
├─────────────────────────────────────────────┤
│                                             │
│              [GAME BOARD]                   │  ← Main game area
│                                             │
├─────────────────────────────────────────────┤
│  Score: 100   Lives: 3   Time: 02:45       │  ← Stats bar
├─────────────────────────────────────────────┤
│  ↑↓←→ Move │ Space Shoot │ ESC Exit        │  ← Controls
├─────────────────────────────────────────────┤
│  ■ Player  ■ Enemy  ■ Power-up  ■ Cursor   │  ← Legend
└─────────────────────────────────────────────┘
```

### Implementation:
```tsx
<Box flexDirection="column" alignItems="center" padding={1}>
  {/* Title */}
  <Text bold color="cyan">🎮 GAME TITLE 🎮</Text>
  <Text dimColor>Difficulty: {difficulty}</Text>
  
  <Box marginY={1} />
  
  {/* Game Board */}
  <Box flexDirection="column">{renderBoard()}</Box>
  
  <Box marginY={1} />
  
  {/* Stats */}
  <Box gap={2}>
    <Text>Score: <Text color="yellow" bold>{score}</Text></Text>
    <Text>Lives: <Text color="red">{lives}</Text></Text>
  </Box>
  
  {/* Controls */}
  <Box marginTop={1}>
    <Text color="yellow">↑↓←→ Move │ Space Action │ ESC Exit</Text>
  </Box>
  
  {/* Legend */}
  <Box marginTop={1}>
    <Text>
      <Text color="green">■</Text> Player  
      <Text color="red"> ■</Text> Enemy  
      <Text backgroundColor="blue" color="white"> ■ </Text> Selected
    </Text>
  </Box>
</Box>
```

---

## 7. State Management Rules

### 7.1 Initialization (Lazy)
```typescript
// ✅ GOOD: Runs once
const [board, setBoard] = useState(() => generateBoard(difficulty));

// ❌ BAD: Runs every render
const [board, setBoard] = useState(generateBoard(difficulty));
```

### 7.2 Immutable Updates
```typescript
// ✅ GOOD: Create new reference
setBoard(prev => prev.map((row, r) => 
  row.map((cell, c) => r === targetRow && c === targetCol 
    ? { ...cell, value: newValue } 
    : cell
  )
));

// ❌ BAD: Mutates existing state
board[row][col].value = newValue;
setBoard(board);  // React won't re-render!
```

### 7.3 Timer Cleanup
```typescript
useEffect(() => {
  const timer = setInterval(tick, speed);
  return () => clearInterval(timer);  // CLEANUP!
}, [speed]);
```

---

## 8. Difficulty Scaling

```typescript
const getConfig = (difficulty: string) => {
  const configs = {
    easy:   { speed: 300, lives: 5, enemies: 3,  hints: 10 },
    medium: { speed: 150, lives: 3, enemies: 6,  hints: 5  },
    hard:   { speed: 75,  lives: 1, enemies: 10, hints: 2  },
  };
  return configs[difficulty] || configs.medium;
};

// Usage
const config = useMemo(() => getConfig(difficulty), [difficulty]);
```

---

## 9. ASCII Art Sprites

### Common Game Elements
```
Player:    ▲ △ ◆ ● ☺ @
Enemies:   ▼ ◀ ▶ ★ ☠ X
Items:     ♦ ♥ ♠ ♣ ◉ ○
Walls:     █ ▓ ░ ■ □ #
Projectile: · • ─ │ / \
Snake:     ○ ● ◎ ═ ║
Tetris:    ▓ ░ □ ■
```

### Larger ASCII Art (Title Screens)
```
 _____                      
|  __ \                     
| |  \/ __ _ _ __ ___   ___ 
| | __ / _` | '_ ` _ \ / _ \
| |_\ \ (_| | | | | | |  __/
 \____/\__,_|_| |_| |_|\___|
```

---

## 10. Complete Minimal Template

```typescript
import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';

interface GameProps {
  onExit: () => void;
  difficulty?: 'easy' | 'medium' | 'hard';
}

const GameName: React.FC<GameProps> = ({ onExit, difficulty = 'medium' }) => {
  // Config
  const config = useMemo(() => ({
    easy: { speed: 200 }, medium: { speed: 100 }, hard: { speed: 50 }
  }[difficulty] || { speed: 100 }), [difficulty]);

  // State
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState('');

  // Input
  useInput((input, key) => {
    if (key.escape) { onExit(); return; }
    if (gameOver && (input === 'r' || input === 'R')) {
      // Restart logic
      return;
    }
    // Game-specific controls
  });

  // Game loop (if real-time)
  useEffect(() => {
    if (gameOver) return;
    const timer = setInterval(() => {
      // Game tick
    }, config.speed);
    return () => clearInterval(timer);
  }, [gameOver, config.speed]);

  return (
    <Box flexDirection="column" alignItems="center" padding={1}>
      <Text bold color="cyan">🎮 GAME NAME 🎮</Text>
      <Text dimColor>Difficulty: {difficulty}</Text>
      
      <Box marginY={1} />
      
      {/* GAME BOARD HERE */}
      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        <Text>Game content goes here</Text>
      </Box>
      
      <Box marginY={1} />
      
      <Text>Score: <Text color="yellow" bold>{score}</Text></Text>
      {message && <Text color="magenta">{message}</Text>}
      
      {gameOver && (
        <Box flexDirection="column" alignItems="center" marginY={1}>
          <Text color="red" bold>GAME OVER</Text>
          <Text color="yellow">Press R to restart</Text>
        </Box>
      )}
      
      <Box marginTop={1}>
        <Text color="yellow">↑↓←→ Move │ ESC Exit</Text>
      </Box>
    </Box>
  );
};

export default GameName;
```

---

## 11. Pre-Generation Checklist

Before outputting code, verify:

- [ ] Only imports from `react` and `ink`
- [ ] Has `GameProps` interface with `onExit` and `difficulty`
- [ ] Escape key calls `onExit()`
- [ ] Uses `useState(() => ...)` for expensive initialization
- [ ] All timers cleaned up in `useEffect` return
- [ ] Grid cells use 3+ character width
- [ ] Cursor uses `backgroundColor` (not just `color`)
- [ ] Includes controls legend
- [ ] Includes color legend (if using colors)
- [ ] `difficulty` prop affects gameplay
- [ ] Proper TypeScript types throughout
- [ ] Keys on all mapped elements

---

## 12. Output Format

**Respond with ONLY TypeScript code in a single markdown code block.**

```typescript
// Your complete game code here
```

**Do NOT include:**
- Explanations before/after the code
- Multiple code blocks
- Comments like "Here's the game:" or "This implements..."

---

*Last Updated: 2025-11-28 | LikuBuddy v1.1.0*
