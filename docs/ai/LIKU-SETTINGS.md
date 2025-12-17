# LikuBuddy Settings - AI Instructions

> **Prerequisites:** Read [LIKU-CORE.md](../../LIKU-CORE.md) first for setup and navigation.

## ⚡ TL;DR - Enable AI Mode

```powershell
# From Main Menu:
.\send-keys.ps1 -Key "{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}"  # To Settings (index 7)
Get-Content .\likubuddy-state.txt  # Verify on Settings
.\send-keys.ps1 -Key "{ENTER}"     # Enter Settings

# Navigate to Difficulty, cycle to 'ai'
.\send-keys.ps1 -Key "{DOWN}"      # To Game Difficulty
.\send-keys.ps1 -Key "{RIGHT}{RIGHT}{RIGHT}"  # Cycle: easy → medium → hard → ai
.\send-keys.ps1 -Key "{ESC}"       # Exit Settings
```

---

## 🎮 Why AI Mode Matters

Real-time games (Snake, Dino Run) are **too fast** for AI agents at normal speed.

| Game | Normal Speed | AI Mode Speed |
|------|--------------|---------------|
| Snake | 80-150ms/tick | 350ms/tick |
| Dino Run | 60-100ms/tick | 150ms/tick |

**AI Mode also provides:**
- 3-second countdown before game starts
- Lower obstacle spawn rate (Dino Run)
- Time to read initial state and plan

---

## ⚙️ Settings Menu Layout

| Index | Setting | Options |
|-------|---------|---------|
| 0 | Theme | Various color themes |
| 1 | Game Difficulty | `easy` → `medium` → `hard` → `ai` |
| 2 | Sound | On/Off |
| 3 | ... | Other settings |

---

## 🕹️ Controls in Settings

| Key | Action |
|-----|--------|
| `{UP}` / `{DOWN}` | Navigate settings |
| `{LEFT}` / `{RIGHT}` | Change selected option |
| `{ENTER}` | Confirm (some settings) |
| `{ESC}` | Exit Settings menu |

---

## 📋 Complete AI Mode Setup

```powershell
# 1. Start from Main Menu
Get-Content .\likubuddy-state.txt  # Verify at Main Menu

# 2. Navigate to Settings (7 downs from top)
.\send-keys.ps1 -Key "{DOWN}"
.\send-keys.ps1 -Key "{DOWN}"
.\send-keys.ps1 -Key "{DOWN}"
.\send-keys.ps1 -Key "{DOWN}"
.\send-keys.ps1 -Key "{DOWN}"
.\send-keys.ps1 -Key "{DOWN}"
.\send-keys.ps1 -Key "{DOWN}"

# 3. Verify position
Get-Content .\likubuddy-state.txt  # Should show Settings highlighted

# 4. Enter Settings
.\send-keys.ps1 -Key "{ENTER}"
Start-Sleep -Milliseconds 300
Get-Content .\likubuddy-state.txt

# 5. Navigate to Game Difficulty (index 1)
.\send-keys.ps1 -Key "{DOWN}"

# 6. Cycle through difficulties to 'ai'
# easy → medium → hard → ai (3 RIGHT presses from easy)
.\send-keys.ps1 -Key "{RIGHT}"
.\send-keys.ps1 -Key "{RIGHT}"
.\send-keys.ps1 -Key "{RIGHT}"

# 7. Verify setting
Get-Content .\likubuddy-state.txt  # Should show "Game Difficulty [ai]"

# 8. Exit Settings
.\send-keys.ps1 -Key "{ESC}"
```

---

## ✅ Verification

After setup, check the state file contains:
```
Game Difficulty [ai]
```

Or poll:
```powershell
$state = Get-Content .\likubuddy-state.txt -Raw
if ($state -match "Game Difficulty \[ai\]") {
    Write-Host "AI Mode enabled!"
} else {
    Write-Host "Retry setup..."
}
```

---

## ⚡ Energy Management

**Energy is required to play games!**

| Stat | How to Check | How to Restore |
|------|--------------|----------------|
| Energy | STATUS line shows `Energy: XX%` | Use `💤 Rest` (+30 energy) |

### Quick Rest

From Main Menu:
```powershell
.\send-keys.ps1 -Key "r"  # Shortcut for Rest
```

Or navigate:
```powershell
.\send-keys.ps1 -Key "{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}"  # To Rest (index 6)
.\send-keys.ps1 -Key "{ENTER}"
```

---

## 🍖 Feeding Liku

Reduces hunger but costs XP.

From Main Menu:
```powershell
.\send-keys.ps1 -Key "f"  # Shortcut for Feed
```

| Effect | Amount |
|--------|--------|
| XP Cost | -10 |
| Hunger Reduction | -20 |

---

## 📊 Stat Thresholds

| Stat | Warning | Critical |
|------|---------|----------|
| Energy | < 30% | 0% (can't play) |
| Hunger | > 80% | 100% (affects happiness) |
| Happiness | < 30% | < 10% (affects XP gain) |

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't play games | Energy is 0% - use Rest |
| Settings not saving | Press ESC to exit properly |
| Difficulty not changing | Use {RIGHT} to cycle options |
| Wrong difficulty | Cycle with {LEFT}/{RIGHT} |
