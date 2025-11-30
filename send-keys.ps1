param (
    [Parameter(Mandatory=$false)]
    [string]$Key,

    [Parameter(Mandatory=$false)]
    [ValidateScript({$_ -gt 0})]
    [int]$Id
)

# Validate Key parameter is not empty
if (-not $Key) {
    Write-Error "Key parameter is required."
    exit 1
}

$wshell = New-Object -ComObject WScript.Shell
$success = $false
$maxRetries = 3

# The game runs as a node child process inside a terminal
# Window title format: "LikuBuddy Game Hub [PID]" for unique targeting

for ($retry = 0; $retry -lt $maxRetries; $retry++) {
    if ($Id -and $Id -gt 0) {
        # Try PID-specific title first (most precise)
        $pidTitle = "LikuBuddy Game Hub [$Id]"
        $success = $wshell.AppActivate($pidTitle)
    }

    if (-not $success) {
        # Fallback to generic title (may hit wrong window if multiple exist)
        $success = $wshell.AppActivate("LikuBuddy Game Hub")
    }

    if (-not $success) {
        # Last resort - partial match
        $success = $wshell.AppActivate("LikuBuddy")
    }

    if ($success) {
        break
    }
    
    Start-Sleep -Milliseconds 20
}

if (-not $success) {
    Write-Error "Could not activate game window after $maxRetries attempts."
    exit 1
}

# Longer delay to ensure focus fully settles before sending keys
# This prevents keys from going to wrong window during focus transition
Start-Sleep -Milliseconds 80

# Send the keys
try {
    $wshell.SendKeys($Key)
} catch {
    Write-Error "Failed to send keys: $_"
    exit 1
}
