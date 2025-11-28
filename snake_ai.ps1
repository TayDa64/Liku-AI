$wshell = New-Object -ComObject WScript.Shell
$gameWindowName = 'LikuBuddy Game Window'

function Get-GameState {
    if (-not (Test-Path .\likubuddy-state.txt)) { return $null }
    
    try {
        $state = Get-Content .\likubuddy-state.txt -Raw
        if ([string]::IsNullOrWhiteSpace($state)) { return $null }

        $screenMatch = $state | Select-String -Pattern "CURRENT SCREEN: (.*)"
        if (-not $screenMatch) { return $null }
        
        $screen = $screenMatch.Matches[0].Groups[1].Value.Trim()
        
        # Helper to safely extract regex groups
        function Get-Group($pattern) {
            $m = $state | Select-String -Pattern $pattern
            if ($m -and $m.Matches.Count -gt 0) {
                return $m.Matches[0].Groups[1].Value.Trim()
            }
            return $null
        }

        $dx = Get-Group "Food Delta: dx=(-?\d+)"
        $dy = Get-Group "Food Delta: dy=(-?\d+)"
        
        # If we can't parse numbers, default to 0 (e.g. during menu or transition)
        $dxInt = if ($dx) { [int]$dx } else { 0 }
        $dyInt = if ($dy) { [int]$dy } else { 0 }

        $gameState = [PSCustomObject]@{
            Screen = $screen
            Status = Get-Group "STATUS: (.*)"
            Direction = Get-Group "Direction: (.*)"
            FoodDeltaDx = $dxInt
            FoodDeltaDy = $dyInt
            IsDanger = $state -match "DANGER"
            IsGameOver = $state -match "GAME OVER"
        }
        return $gameState
    } catch {
        return $null
    }
}

function Send-Key ($key) {
    $wshell.AppActivate($gameWindowName)
    $wshell.SendKeys($key)
}

Write-Host "Starting Snake AI Loop..."

# Main Snake AI Loop
while ($true) {
    $gameState = Get-GameState

    if ($null -eq $gameState) {
        Start-Sleep -Milliseconds 100
        continue
    }

    if ($gameState.IsGameOver) {
        Write-Host "Game Over detected. Exiting Snake AI."
        break
    }

    if ($gameState.IsDanger) {
        Write-Host "DANGER detected! Turning perpendicular."
        if ($gameState.Direction -eq "UP" -or $gameState.Direction -eq "DOWN") {
            Send-Key "{LEFT}" # Turn left if moving vertically
        } else {
            Send-Key "{UP}" # Turn up if moving horizontally
        }
    } else {
        # Move towards food
        $currentDirection = $gameState.Direction
        $dx = $gameState.FoodDeltaDx
        $dy = $gameState.FoodDeltaDy

        if ($dx -lt 0 -and $currentDirection -ne "RIGHT") {
            Send-Key "{LEFT}"
        } elseif ($dx -gt 0 -and $currentDirection -ne "LEFT") {
            Send-Key "{RIGHT}"
        } elseif ($dy -lt 0 -and $currentDirection -ne "DOWN") {
            Send-Key "{UP}"
        } elseif ($dy -gt 0 -and $currentDirection -ne "UP") {
            Send-Key "{DOWN}"
        }
    }

    Start-Sleep -Milliseconds 100 # Poll rate
}

# After game over, quit to menu
Send-Key "q"
Start-Sleep -Milliseconds 500 # Give time for menu transition
Send-Key "{ESC}"
