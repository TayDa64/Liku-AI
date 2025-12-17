# LikuBuddy Snake - AI Instructions

> **Prerequisites:** Read [LIKU-CORE.md](../../LIKU-CORE.md) first for setup and navigation.
> 
> ⚡ **Game Type:** REAL-TIME - Use memory-based reactive play, not constant polling!

## ⚡ TL;DR - Optimal Snake Play

```powershell
# 1. Enable AI Mode first (Settings → Difficulty → ai)
# This gives 350ms per tick instead of 80-150ms!

# 2. Start game, read initial state
Get-Content .\likubuddy-state.txt

# 3. React to DANGER warnings and food delta
# Poll every ~100ms, act immediately on DANGER
```

**Golden Rule:** Memorize the rules, react to DANGER, chase food delta

---

## 🎮 Game Basics

| Element | Symbol | Description |
|---------|--------|-------------|
| Head | `H` | Your snake's head |
| Body | `o` | Your snake's body segments |
| Food | `F` | Eat to grow and score |
| Wall | Border | Instant death |

**Grid:** 20x20 (coordinates 0-19)

---

## 🕹️ Controls

| Key | Action |
|-----|--------|
| `{UP}` | Move up |
| `{DOWN}` | Move down |
| `{LEFT}` | Move left |
| `{RIGHT}` | Move right |
| `{ESC}` | Exit game |

**⚠️ CRITICAL RULE:** You CANNOT reverse direction!
- Moving UP → Cannot press DOWN (instant death)
- Moving LEFT → Cannot press RIGHT (instant death)

---

## 📊 State File Info

### STATUS Line
```
Score: 5 | Direction: UP | Food Delta: dx=3, dy=-2 | [DANGER!]
```

### Key Fields

| Field | Meaning |
|-------|---------|
| `Direction` | Current movement direction |
| `dx` | Food horizontal offset (`>0` = RIGHT, `<0` = LEFT) |
| `dy` | Food vertical offset (`>0` = DOWN, `<0` = UP) |
| `[DANGER!]` | TURN IMMEDIATELY - obstacle ahead! |

---

## 🧠 Strategy: Memory-Based Play

Real-time games update every 80-150ms (or 350ms in AI mode). **Don't poll constantly!**

### Phase 1: Read Once
```powershell
Get-Content .\likubuddy-state.txt
# Note: Head position, Direction, Food Delta, any DANGER
```

### Phase 2: React From Memory
```
WHILE playing:
  - If DANGER warning → Turn perpendicular immediately
  - If safe → Move toward food (use dx/dy signs)
  - Re-read state every 5-10 moves OR after eating
```

### Perpendicular Turn Logic
```
If Direction is UP or DOWN:
  → Turn LEFT or RIGHT

If Direction is LEFT or RIGHT:
  → Turn UP or DOWN
```

---

## 🤖 AI Mode (RECOMMENDED)

Enable AI Mode for slower, AI-friendly gameplay:

**Settings Path:** Main Menu → Settings (index 7) → Game Difficulty → `ai`

| Setting | Normal | AI Mode |
|---------|--------|---------|
| Tick Speed | 80-150ms | 350ms |
| Countdown | None | 3 seconds |
| Strategy | Memory-based | Poll-friendly |

### AI Mode Game Loop

```powershell
$wshell = New-Object -ComObject WScript.Shell

while ($true) {
    $state = Get-Content .\likubuddy-state.txt -Raw
    
    if ($state -match "GAME OVER") { break }
    
    if ($state -match "DANGER") {
        $wshell.AppActivate('LikuBuddy Game Window')
        # Turn perpendicular
        if ($state -match "Direction: (UP|DOWN)") {
            $wshell.SendKeys("{LEFT}")
        } else {
            $wshell.SendKeys("{UP}")
        }
    }
    
    Start-Sleep -Milliseconds 100  # Poll rate
}
```

---

## 📋 Food Chasing Logic

| Food Delta | Action |
|------------|--------|
| `dx > 0` | Food is RIGHT → Press `{RIGHT}` |
| `dx < 0` | Food is LEFT → Press `{LEFT}` |
| `dy > 0` | Food is DOWN → Press `{DOWN}` |
| `dy < 0` | Food is UP → Press `{UP}` |

**Priority:** DANGER avoidance > Food chasing

---

## 🚨 Danger Avoidance

When `[DANGER!]` appears in state:

1. **IMMEDIATELY** turn perpendicular to current direction
2. Don't think, just turn - you have milliseconds
3. After turning, reassess food direction

---

## 📝 Memorized Rules

1. **Grid is 20x20** (0-19 on both axes)
2. **Walls kill** - never let head go < 0 or >= 20
3. **Tail kills** - never move into your own body
4. **No reversing** - can only turn 90°
5. **Food respawns** - new position after eating
6. **You grow** - body gets longer after eating

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Died instantly | Probably reversed direction |
| Too fast | Enable AI Mode in Settings |
| Missing food | Re-read state for new dx/dy |
| DANGER not clearing | Keep turning until clear |

---

## 📋 Complete Game Flow

```powershell
# 1. (Optional) Enable AI Mode first - see LIKU-SETTINGS.md

# 2. Navigate to Snake (from Games Menu, index 0)
.\send-keys.ps1 -Key "{ENTER}"     # Snake is first item
Start-Sleep -Seconds 3             # Wait for countdown

# 3. Read initial state
Get-Content .\likubuddy-state.txt

# 4. Start moving toward food
# Example: if dx > 0, food is right
.\send-keys.ps1 -Key "{RIGHT}"

# 5. Monitor for DANGER, react immediately
```
