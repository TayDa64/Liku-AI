# LikuBuddy Dino Run - AI Instructions

> **Prerequisites:** Read [LIKU-CORE.md](../../LIKU-CORE.md) first for setup and navigation.
> 
> ⚡ **Game Type:** REAL-TIME - Fast polling + immediate reactions!

## ⚡ TL;DR - Optimal Dino Play

```powershell
# 1. Enable AI Mode first (Settings → Difficulty → ai)
# This gives 150ms per tick and slower obstacle spawns

# 2. Poll rapidly, jump when JUMP NOW appears
while ($true) {
    $state = Get-Content .\likubuddy-state.txt -Raw
    if ($state -match "GAME_OVER") { break }
    if ($state -match "JUMP NOW.*Y=0") {
        .\send-keys.ps1 -Key " "  # Space to jump
    }
    Start-Sleep -Milliseconds 50
}
```

**Golden Rule:** Watch for `[JUMP NOW!]` + `Y=0` → Jump immediately

---

## 🎮 Game Basics

| Element | Symbol | Description |
|---------|--------|-------------|
| Dino | `D` | You (at X=52) |
| Ground obstacle | `X` at Y=0 | Jump over these |
| Flying obstacle | `X` at Y=3 | DON'T jump - stay low |
| Ground | `_` | Running surface |

**Screen:** 60 characters wide, Dino at right side (X=52)

---

## 🕹️ Controls

| Key | Action |
|-----|--------|
| `{SPACE}` or ` ` | Jump |
| `{UP}` | Jump (alternative) |
| `{ESC}` | Exit game |

**Jump Duration:** ~1 second arc

---

## 📊 State File Info

### STATUS Line
```
Score: 15 | Speed: Fast | Next Obstacle: Dist=5, Y=0 | [JUMP NOW!]
```

### Key Fields

| Field | Meaning |
|-------|---------|
| `Dist` | Distance to next obstacle (characters) |
| `Y` | Obstacle height: `0` = ground, `3` = flying |
| `[JUMP NOW!]` | Trigger to jump immediately |

---

## 🎯 Jump Timing

### When to Jump

| Condition | Action |
|-----------|--------|
| `[JUMP NOW!]` AND `Y=0` | **JUMP NOW** |
| `Dist` = 3-6 AND `Y=0` | Safe to jump |
| `Y=3` (flying) | **DON'T JUMP** - stay low |

### When NOT to Jump

- `Y=3` - Flying obstacles pass over you
- Already in air - Can't double jump
- `Dist > 10` - Too early, will land before obstacle

---

## 🤖 AI Mode (REQUIRED)

Enable AI Mode for playable speeds:

**Settings Path:** Main Menu → Settings (index 7) → Game Difficulty → `ai`

| Setting | Normal | AI Mode |
|---------|--------|---------|
| Tick Speed | 60-100ms | 150ms |
| Spawn Rate | 0.1 | 0.04 (less frequent) |
| Countdown | None | 3 seconds |

---

## 🧠 Strategy

### Simple Reactive Loop

```powershell
$wshell = New-Object -ComObject WScript.Shell

# Wait for game to start
do {
    Start-Sleep -Milliseconds 100
    $state = Get-Content .\likubuddy-state.txt -Raw
} while ($state -match "COUNTDOWN")

# Main game loop
while ($true) {
    $state = Get-Content .\likubuddy-state.txt -Raw
    
    if ($state -match "GAME_OVER") { break }
    
    # Jump on ground obstacles only
    if ($state -match "JUMP NOW" -and $state -match "Y=0") {
        $wshell.AppActivate('LikuBuddy Game Window')
        $wshell.SendKeys(" ")  # Space to jump
    }
    
    Start-Sleep -Milliseconds 50  # Fast poll
}
```

### Distance-Based Jump (Alternative)

```powershell
# If JUMP NOW not reliable, use distance
if ($state -match "Dist=(\d+).*Y=0") {
    $dist = [int]$matches[1]
    if ($dist -ge 3 -and $dist -le 6) {
        $wshell.SendKeys(" ")
    }
}
```

---

## 📝 Memorized Rules

1. **Dino is at X=52** (right side of 60-wide screen)
2. **Obstacles spawn at X=0** and move RIGHT toward you
3. **Ground obstacles (Y=0):** JUMP when Dist is 3-6
4. **Flying obstacles (Y=3):** DON'T jump, stay low
5. **Jump takes ~1 second** to complete arc
6. **Speed increases** over time - react faster!

---

## 📋 Complete Game Flow

```powershell
# 1. (Recommended) Enable AI Mode first - see LIKU-SETTINGS.md

# 2. Navigate to Dino Run (from Games Menu, index 2)
.\send-keys.ps1 -Key "{DOWN}{DOWN}"
Get-Content .\likubuddy-state.txt  # Verify on Dino Run
.\send-keys.ps1 -Key "{ENTER}"

# 3. Wait for countdown (if AI Mode)
Start-Sleep -Seconds 3

# 4. Start polling and reacting
# Use the reactive loop above
```

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Dying too fast | Enable AI Mode for slower speed |
| Jumping too late | Increase poll rate (decrease sleep) |
| Jumping into flying obstacle | Check `Y=0` before jumping |
| Missing JUMP NOW | Use distance-based backup |

---

## 🏅 Scoring

| Milestone | XP Reward |
|-----------|-----------|
| Score 10+ | +5 XP |
| Score 25+ | +10 XP |
| Score 50+ | +20 XP |
| Score 100+ | +50 XP |
