# LikuBuddy Tic-Tac-Toe - AI Instructions

> **Prerequisites:** Read [LIKU-CORE.md](../../LIKU-CORE.md) first for setup and navigation.
> 
> 🐢 **Game Type:** TURN-BASED - Read state after every move!

## ⚡ TL;DR - Optimal TTT Play

```powershell
# 1. Read state to see board and cursor
Get-Content .\likubuddy-state.txt

# 2. Navigate to target cell
.\send-keys.ps1 -Key "{RIGHT}{DOWN}"  # Example: to center

# 3. Verify position, then place
Get-Content .\likubuddy-state.txt
.\send-keys.ps1 -Key "{ENTER}"

# 4. Read state for opponent's move, repeat
```

**Golden Rule:** Take center → Win/Block → Fork

---

## 🎮 Game Basics

| Symbol | Meaning |
|--------|---------|
| `X` | Your mark |
| `O` | Liku's mark (opponent) |
| `.` | Empty cell |
| `[.]` | Cursor position (empty) |
| `[X]` or `[O]` | Cursor on occupied cell |

**You are always X, Liku is always O.**

---

## 📐 Board Layout

```
Position Index:        Actual Board:
 0 | 1 | 2              . | . | .
-----------             -----------
 3 | 4 | 5              . | . | .
-----------             -----------
 6 | 7 | 8              . | . | .
```

**Center = Position 4** (strongest opening)

---

## 🕹️ Controls

| Key | Movement |
|-----|----------|
| `{UP}` | Move up 1 row (-3 in index) |
| `{DOWN}` | Move down 1 row (+3 in index) |
| `{LEFT}` | Move left 1 column (-1 in index) |
| `{RIGHT}` | Move right 1 column (+1 in index) |
| `{ENTER}` | Place your X at cursor |
| `{ESC}` | Exit game |

---

## 🧭 Navigation Reference

| From → To | Keys |
|-----------|------|
| 0 → 4 (center) | `{RIGHT}{DOWN}` |
| 0 → 8 (opposite corner) | `{DOWN}{DOWN}{RIGHT}{RIGHT}` |
| 4 → 0 | `{UP}{LEFT}` |
| Any → Specific | Calculate: Δrow = `{UP/DOWN}`, Δcol = `{LEFT/RIGHT}` |

---

## 🏆 Winning Lines

8 ways to win - get 3 in a row:

| Line | Positions |
|------|-----------|
| Top row | 0, 1, 2 |
| Middle row | 3, 4, 5 |
| Bottom row | 6, 7, 8 |
| Left column | 0, 3, 6 |
| Center column | 1, 4, 7 |
| Right column | 2, 5, 8 |
| Diagonal ↘ | 0, 4, 8 |
| Diagonal ↗ | 2, 4, 6 |

---

## 🧠 Optimal Strategy

### Priority Order (check in sequence):

1. **WIN** - If you have 2-in-a-row with empty third → Take it!
2. **BLOCK** - If Liku has 2-in-a-row with empty third → Block it!
3. **CENTER** - If position 4 is empty → Take center
4. **FORK** - Create position with 2 ways to win
5. **CORNER** - Positions 0, 2, 6, 8 are strong
6. **EDGE** - Positions 1, 3, 5, 7 as last resort

### Opening Move
- **Always take center (4)** if available
- If center taken, take a corner (0, 2, 6, or 8)

---

## 📊 Reading State

### Visual State
```
VISUAL STATE:
 [.] | O | .
-----------
  .  | X | .
-----------
  .  | . | .

Cursor position: 0 | Your turn (X)
```

### JSON State (if available)
```json
{
  "type": "tictactoe",
  "board": [".", "O", ".", ".", "X", ".", ".", ".", "."],
  "currentPlayer": "X",
  "cursorPosition": 0,
  "winner": null,
  "isDraw": false
}
```

---

## 📋 Complete Game Flow

```powershell
# 1. Game starts, cursor at position 0

# 2. Take center (position 4)
.\send-keys.ps1 -Key "{DOWN}{RIGHT}"
Get-Content .\likubuddy-state.txt  # Verify at center
.\send-keys.ps1 -Key "{ENTER}"

# 3. Read Liku's response
Get-Content .\likubuddy-state.txt

# 4. Plan next move based on strategy
# ... continue until win/draw
```

---

## 🎯 Example: Perfect Game

```
Turn 1: Take center (4)
  . | . | .        Move: {DOWN}{RIGHT}{ENTER}
  . | X | .
  . | . | .

Turn 2: Liku plays corner (0)
  O | . | .
  . | X | .
  . | . | .

Turn 3: Take opposite corner (8) - creates fork threat
  O | . | .        Move: {DOWN}{RIGHT}{ENTER}
  . | X | .
  . | . | X

Turn 4: Liku must block...
... Continue with win/block/fork logic
```

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Placed in wrong cell | Read state first to verify cursor |
| Can't move cursor | May be on edge - try opposite direction |
| Liku won | Review blocking priority |
| Draw | Normal outcome with optimal play |

---

## 🏅 Outcomes

| Result | XP Reward |
|--------|-----------|
| Win | +20 XP |
| Draw | +5 XP |
| Loss | +2 XP |
