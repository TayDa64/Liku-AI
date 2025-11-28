$wshell = New-Object -ComObject WScript.Shell
$gameWindowName = 'LikuBuddy Game Window'

function Get-State {
    if (Test-Path .\likubuddy-state.txt) {
        return Get-Content .\likubuddy-state.txt -Raw
    }
    return ""
}

Write-Host "Waiting for game to start..."
while (-not (Test-Path .\likubuddy-state.txt)) { Start-Sleep -Milliseconds 500 }

Write-Host "Game started. Activating window..."
$wshell.AppActivate($gameWindowName)
Start-Sleep -Milliseconds 1000

# 1. Navigate to Settings
Write-Host "Navigating to Settings..."
# Assume we start at top (Let's Play)
$wshell.SendKeys("{DOWN}" * 6)
$wshell.SendKeys("{ENTER}")

# Wait for Settings Menu
Write-Host "Waiting for Settings Menu..."
while ((Get-State) -notmatch "Settings Menu") { Start-Sleep -Milliseconds 200 }

# 2. Set Difficulty to AI
Write-Host "Setting Difficulty to AI..."
$wshell.SendKeys("{DOWN}") # Select Difficulty
Start-Sleep -Milliseconds 200

# Loop until AI is selected
for ($i = 0; $i -lt 5; $i++) {
    $state = Get-State
    # Check for [AI] or [ai] in the visual state
    if ($state -match "\[AI\]" -or $state -match "\[ai\]") {
        Write-Host "AI Mode Enabled!"
        break
    }
    $wshell.SendKeys("{RIGHT}")
    Start-Sleep -Milliseconds 500
}

$wshell.SendKeys("{ESC}") # Back to Main Menu
Write-Host "Returning to Main Menu..."
while ((Get-State) -notmatch "Main Menu") { Start-Sleep -Milliseconds 200 }

# 3. Navigate to Snake
Write-Host "Navigating to Snake..."
# We are at Settings (index 6). Need to go to Let's Play (index 0).
$wshell.SendKeys("{UP}" * 6)
$wshell.SendKeys("{ENTER}") # Enter Games Menu

Write-Host "Waiting for Games Menu..."
while ((Get-State) -notmatch "Games Menu") { Start-Sleep -Milliseconds 200 }

$wshell.SendKeys("{ENTER}") # Enter Snake (first item)

Write-Host "Snake Started! Launching AI..."
