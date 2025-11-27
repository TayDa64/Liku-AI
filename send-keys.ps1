param (
    [Parameter(Mandatory=$false)]
    [string]$Key,

    [Parameter(Mandatory=$false)]
    [int]$Id
)

$wshell = New-Object -ComObject WScript.Shell

if ($Id) {
    # Try to activate by PID
    # Note: AppActivate with PID is robust but sometimes needs the exact ID
    $success = $wshell.AppActivate($Id)
    
    if (-not $success) {
        # Fallback: Try to find window title from PID
        $proc = Get-Process -Id $Id -ErrorAction SilentlyContinue
        if ($proc -and $proc.MainWindowTitle) {
            $success = $wshell.AppActivate($proc.MainWindowTitle)
        }
    }
    
    if (-not $success) {
        Write-Error "Could not activate window for PID $Id. Ensure the game is running and has a window."
        exit 1
    }
} else {
    # Fallback: Try to find a likely window by title
    # This is less reliable than PID
    $success = $wshell.AppActivate("Liku")
    if (-not $success) {
        $success = $wshell.AppActivate("node")
    }
    
    if (-not $success) {
        Write-Error "Could not find 'Liku' or 'node' window. Please provide -Id."
        exit 1
    }
}

# Small delay to ensure focus settles
Start-Sleep -Milliseconds 100

# Send the keys
# WScript.Shell.SendKeys syntax:
# {ENTER}, {UP}, {DOWN}, {LEFT}, {RIGHT}, {ESC}, etc.
try {
    $wshell.SendKeys($Key)
} catch {
    Write-Error "Failed to send keys: $_"
    exit 1
}
