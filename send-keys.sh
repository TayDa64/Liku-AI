#!/bin/bash
#
# send-keys.sh - Cross-Platform Key Sender for LikuBuddy (Linux/macOS)
#
# This script provides the same interface as send-keys.ps1 but works on
# Linux and macOS by using the WebSocket API via send-command.js.
#
# Usage:
#   ./send-keys.sh -Key "{DOWN}"
#   ./send-keys.sh -Key "{ENTER}"
#   ./send-keys.sh -Key "e4"
#   ./send-keys.sh "{UP}"          # Shorthand
#
# Key Codes (PowerShell-compatible):
#   {UP}, {DOWN}, {LEFT}, {RIGHT}  - Arrow keys
#   {ENTER}                        - Enter
#   {ESC}                          - Escape
#   {TAB}                          - Tab
#   " " (space)                    - Space
#   Any text                       - Sent as-is (for chess moves)
#
# Environment Variables:
#   LIKU_PORT     - WebSocket port (default: 3847)
#   LIKU_TIMEOUT  - Connection timeout in ms (default: 2000)
#
# Exit Codes:
#   0 - Success
#   1 - Connection failed
#   2 - Invalid arguments
#   3 - Command rejected
#

set -e

# ============================================================
# Configuration
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEND_COMMAND="${SCRIPT_DIR}/send-command.js"
PORT="${LIKU_PORT:-3847}"
TIMEOUT="${LIKU_TIMEOUT:-2000}"

# ============================================================
# Argument Parsing (PowerShell-compatible)
# ============================================================

KEY=""
ID=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -Key|-key|--key|-k)
            KEY="$2"
            shift 2
            ;;
        -Id|-id|--id)
            # PID parameter (ignored on Linux - no window targeting needed for WebSocket)
            ID="$2"
            shift 2
            ;;
        -*)
            echo "Error: Unknown option: $1" >&2
            exit 2
            ;;
        *)
            # Bare argument is treated as key
            if [[ -z "$KEY" ]]; then
                KEY="$1"
            fi
            shift
            ;;
    esac
done

if [[ -z "$KEY" ]]; then
    echo "Error: Key parameter is required." >&2
    echo "Usage: $0 -Key \"{DOWN}\"" >&2
    exit 2
fi

# ============================================================
# Key Translation (PowerShell format to WebSocket format)
# ============================================================

translate_key() {
    local key="$1"
    
    # Convert to lowercase (compatible with Bash 3.2 on macOS)
    local lower_key=$(echo "$key" | tr '[:upper:]' '[:lower:]')
    
    # Handle PowerShell-style key codes
    case "$lower_key" in
        "{up}")      echo "up" ;;
        "{down}")    echo "down" ;;
        "{left}")    echo "left" ;;
        "{right}")   echo "right" ;;
        "{enter}")   echo "enter" ;;
        "{esc}")     echo "escape" ;;
        "{escape}")  echo "escape" ;;
        "{tab}")     echo "tab" ;;
        " ")         echo "space" ;;
        *)           echo "$key" ;;  # Pass through as-is (text input)
    esac
}

# ============================================================
# Check Dependencies
# ============================================================

if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed." >&2
    echo "Install with: sudo apt install nodejs (Debian/Ubuntu)" >&2
    echo "           or: brew install node (macOS)" >&2
    exit 1
fi

if [[ ! -f "$SEND_COMMAND" ]]; then
    echo "Error: send-command.js not found at: $SEND_COMMAND" >&2
    exit 1
fi

# ============================================================
# Send Command
# ============================================================

TRANSLATED_KEY=$(translate_key "$KEY")

# Handle multiple keys in sequence (e.g., "{DOWN}{DOWN}")
# PowerShell sends all at once, but we split them for reliability
if [[ "$KEY" =~ ^\{.*\}\{.*\}$ ]]; then
    # Multiple keys detected - split and send separately
    # Extract all {KEY} patterns
    while [[ "$KEY" =~ \{([^}]+)\} ]]; do
        SINGLE_KEY="{${BASH_REMATCH[1]}}"
        TRANSLATED=$(translate_key "$SINGLE_KEY")
        
        node "$SEND_COMMAND" --key "$TRANSLATED" --port "$PORT" --timeout "$TIMEOUT" --silent
        
        # Remove the processed key from the string
        KEY="${KEY/${SINGLE_KEY}/}"
        
        # Small delay between keys for reliability
        sleep 0.05
    done
else
    # Single key or text
    exec node "$SEND_COMMAND" --key "$TRANSLATED_KEY" --port "$PORT" --timeout "$TIMEOUT"
fi
