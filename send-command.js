#!/usr/bin/env node
/**
 * send-command.js - Cross-Platform Command Sender for LikuBuddy
 * 
 * Sends keys/actions to LikuBuddy via WebSocket. Works on Windows, Linux, and macOS.
 * This is the recommended way for AI agents to interact with the game in headless
 * environments (like GitHub Codespaces) where GUI-based keystroke injection isn't available.
 * 
 * Usage:
 *   node send-command.js --key enter
 *   node send-command.js --key up
 *   node send-command.js --key "e4"           # Chess move (text)
 *   node send-command.js --action jump
 *   node send-command.js --action chess_move --move e4
 *   node send-command.js --query gameState
 * 
 * Options:
 *   --key <key>       Send a key press (up, down, left, right, enter, escape, space, tab, or text)
 *   --action <name>   Send a game action (jump, duck, chess_move, etc.)
 *   --move <san>      Chess move in SAN notation (used with --action chess_move)
 *   --query <type>    Query game state (gameState, possibleActions, stats)
 *   --port <num>      WebSocket port (default: 3847)
 *   --timeout <ms>    Connection timeout in ms (default: 2000)
 *   --silent          Suppress output (exit code only)
 *   --help            Show this help
 * 
 * Exit Codes:
 *   0 - Success
 *   1 - Connection failed (game not running?)
 *   2 - Invalid arguments
 *   3 - Command rejected by server
 * 
 * @example AI Agent Usage (Linux/Codespace):
 *   # Navigate menu
 *   node send-command.js --key down
 *   node send-command.js --key enter
 *   
 *   # Play chess
 *   node send-command.js --key tab          # Switch to text mode
 *   node send-command.js --key "e4"         # Type move
 *   node send-command.js --key enter        # Submit
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

// ============================================================
// Argument Parsing
// ============================================================

const args = process.argv.slice(2);
const options = {
  key: null,
  text: null,
  action: null,
  move: null,
  session: null,
  query: null,
  port: 3847,
  timeout: 2000,
  silent: false,
  help: false
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const next = args[i + 1];
  
  switch (arg) {
    case '--key':
    case '-k':
      options.key = next;
      i++;
      break;
    case '--text':
      options.text = next;
      i++;
      break;
    case '--action':
    case '-a':
      options.action = next;
      i++;
      break;
    case '--move':
    case '-m':
      options.move = next;
      i++;
      break;
    case '--session':
      options.session = next;
      i++;
      break;
    case '--query':
    case '-q':
      options.query = next;
      i++;
      break;
    case '--port':
    case '-p':
      options.port = parseInt(next, 10);
      i++;
      break;
    case '--timeout':
    case '-t':
      options.timeout = parseInt(next, 10);
      i++;
      break;
    case '--silent':
    case '-s':
      options.silent = true;
      break;
    case '--help':
    case '-h':
      options.help = true;
      break;
    default:
      // Allow bare key as first argument for convenience
      if (i === 0 && !arg.startsWith('-')) {
        options.key = arg;
      }
  }
}

// ============================================================
// Help Text
// ============================================================

if (options.help) {
  console.log(`
send-command.js - Cross-Platform LikuBuddy Command Sender

USAGE:
  node send-command.js --key <key>
  node send-command.js --text <string>
  node send-command.js --action <action> [--move <san>] [--session <id>]
  node send-command.js --query <type>

KEY OPTIONS:
  up, down, left, right   Arrow keys
  enter                   Enter/Return
  escape, esc             Escape
  space                   Space bar
  tab                     Tab key

TEXT OPTIONS:
  --text "e4"             Send full text string (e.g. chess move)

ACTION OPTIONS:
  jump, duck              Dino Run
  turn_up, turn_down      Snake
  turn_left, turn_right   Snake
  chess_move              Chess (requires --move)
  chess_resign            Chess
  start, restart          All games

QUERY OPTIONS:
  gameState               Current game state
  possibleActions         Valid actions
  stats                   Player statistics
  session                 Active session info

EXAMPLES:
  # Navigate menu
  node send-command.js --key down
  node send-command.js --key enter

  # Play chess (text mode)
  node send-command.js --text "e4"

  # Play chess (action mode)
  node send-command.js --action chess_move --move e4

  # Query state
  node send-command.js --query gameState

OPTIONS:
  --port <num>      WebSocket port (default: 3847)
  --timeout <ms>    Connection timeout (default: 2000)
  --silent          Suppress output
  --help            Show this help
`);
  process.exit(0);
}

// ============================================================
// Validation
// ============================================================

if (!options.key && !options.action && !options.query && !options.text) {
  if (!options.silent) {
    console.error('Error: Must specify --key, --text, --action, or --query');
    console.error('Use --help for usage information');
  }
  process.exit(2);
}

// ============================================================
// Key Mapping
// ============================================================

// Maps user-friendly key names to the server's expected format
// Server expects lowercase single words: up, down, left, right, enter, escape, space
const KEY_MAP = {
  // Standard names
  'up': 'up',
  'down': 'down', 
  'left': 'left',
  'right': 'right',
  'enter': 'enter',
  'return': 'enter',
  'escape': 'escape',
  'esc': 'escape',
  'space': 'space',
  'tab': 'tab',
  // PowerShell format compatibility (curly braces stripped, lowercase)
  '{up}': 'up',
  '{down}': 'down',
  '{left}': 'left',
  '{right}': 'right',
  '{enter}': 'enter',
  '{esc}': 'escape',
  '{escape}': 'escape',
  '{tab}': 'tab',
  // Arrow key names
  'arrowup': 'up',
  'arrowdown': 'down',
  'arrowleft': 'left',
  'arrowright': 'right',
};

function normalizeKey(key) {
  if (!key) return null;
  const lower = key.toLowerCase();
  return KEY_MAP[lower] || key; // Return as-is for text input (chess moves)
}

// ============================================================
// WebSocket Communication
// ============================================================

function sendCommand() {
  return new Promise((resolve, reject) => {
    const wsUrl = `ws://localhost:${options.port}`;
    
    let ws;
    let timeoutId;
    let resolved = false;
    
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
    
    const succeed = (result) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };
    
    const fail = (error) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(error);
    };
    
    // Connection timeout
    timeoutId = setTimeout(() => {
      fail(new Error('Connection timeout - is LikuBuddy running with WebSocket enabled?'));
    }, options.timeout);
    
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      fail(new Error(`Failed to create WebSocket: ${err.message}`));
      return;
    }
    
    ws.on('error', (err) => {
      fail(new Error(`WebSocket error: ${err.message}`));
    });
    
    ws.on('open', () => {
      clearTimeout(timeoutId);
      
      const requestId = `cmd-${Date.now()}`;
      let message;
      
      if (options.key) {
        // Key command
        const normalizedKey = normalizeKey(options.key);
        message = {
          type: 'key',
          payload: { key: normalizedKey },
          requestId
        };
      } else if (options.text) {
        // Text command
        message = {
          type: 'text',
          payload: { text: options.text },
          requestId
        };
      } else if (options.action) {
        // Action command
        const payload = { action: options.action };
        if (options.move) {
          payload.move = options.move;
        }
        if (options.session) {
          payload.sessionId = options.session;
        }
        message = {
          type: 'action',
          payload,
          requestId
        };
      } else if (options.query) {
        // Query command
        message = {
          type: 'query',
          payload: { query: options.query },
          requestId
        };
      }
      
      ws.send(JSON.stringify(message));
      
      // Set response timeout
      timeoutId = setTimeout(() => {
        fail(new Error('Response timeout'));
      }, options.timeout);
    });
    
    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        
        // Handle welcome message (ignore, wait for actual response)
        if (response.type === 'welcome') {
          return;
        }
        
        // Handle response
        if (response.type === 'ack' || response.type === 'response') {
          succeed(response);
        } else if (response.type === 'error') {
          fail(new Error(response.message || 'Server error'));
        }
      } catch (err) {
        fail(new Error(`Invalid response: ${err.message}`));
      }
    });
    
    ws.on('close', () => {
      if (!resolved) {
        fail(new Error('Connection closed unexpectedly'));
      }
    });
  });
}

// ============================================================
// Main
// ============================================================

async function main() {
  try {
    const result = await sendCommand();
    
    if (!options.silent) {
      if (options.query) {
        // For queries, output the full result
        console.log(JSON.stringify(result.data || result, null, 2));
      } else {
        // For commands, just confirm
        console.log('OK');
      }
    }
    
    process.exit(0);
  } catch (err) {
    if (!options.silent) {
      console.error(`Error: ${err.message}`);
    }
    
    // Determine exit code
    if (err.message.includes('Connection') || err.message.includes('timeout')) {
      process.exit(1); // Connection failed
    } else if (err.message.includes('Invalid') || err.message.includes('argument')) {
      process.exit(2); // Invalid arguments
    } else {
      process.exit(3); // Command rejected
    }
  }
}

main();
