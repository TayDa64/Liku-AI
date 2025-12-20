import React, { useState, useEffect, useCallback } from 'react';
import { render, useStdin, useApp, useStdout } from 'ink';
import meow from 'meow';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import GameHub from './ui/LikuTUI.js';
import { wsServer } from './websocket/server.js';
import { setWebSocketEnabled, setFileLoggingEnabled } from './core/GameStateLogger.js';
import { clearAgentSignal } from './intro/IntroPlayer.js';

// State file path for AI visibility
const STATE_FILE = path.join(process.cwd(), 'likubuddy-state.txt');

// Staleness threshold for state file (60 seconds)
const STATE_FILE_STALE_MS = 60 * 1000;

// ============================================================
// WebSocket → React Bridge
// Allows WebSocket events to be forwarded to React components
// ============================================================
export const commandBridge = new EventEmitter();
commandBridge.setMaxListeners(20);

// ============================================================
// ANSI Escape Codes for Terminal Control
// Cross-platform compatible sequences
// ============================================================
const ANSI = {
  // Screen control
  CLEAR_SCREEN: '\x1b[2J',           // Clear entire screen
  CURSOR_HOME: '\x1b[H',             // Move cursor to top-left
  CURSOR_HIDE: '\x1b[?25l',          // Hide cursor
  CURSOR_SHOW: '\x1b[?25h',          // Show cursor
  
  // Alternate screen buffer (fullscreen mode - prevents scroll artifacts)
  ALT_BUFFER_ON: '\x1b[?1049h',      // Switch to alternate buffer
  ALT_BUFFER_OFF: '\x1b[?1049l',     // Return to main buffer
  
  // Scroll region (prevent scroll bleed)
  SCROLL_REGION_FULL: '\x1b[r',      // Reset scroll region to full screen
  
  // Terminal title
  SET_TITLE: (title: string) => `\x1b]0;${title}\x07`,
};

// ============================================================
// Stream Guard - Prevents console.log from corrupting TUI
// Inspired by Gemini CLI's stdout protection
// ============================================================
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

let logsBuffer: string[] = [];

const guardStreams = () => {
  console.log = (...args) => {
    logsBuffer.push(args.map(String).join(' '));
  };
  console.warn = (...args) => {
    logsBuffer.push(`[WARN] ${args.map(String).join(' ')}`);
  };
  console.error = (...args) => {
    logsBuffer.push(`[ERROR] ${args.map(String).join(' ')}`);
    originalConsoleError.apply(console, args);
  };
};

export const restoreStreams = () => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
};

export const getBufferedLogs = () => [...logsBuffer];

const cli = meow(`
	Usage
	  $ liku

	Description
	  LikuBuddy - Terminal Based ASCII Game Hub with AI WebSocket Support

	Options
		--ai           Enable AI interaction mode
		--no-websocket Disable WebSocket server (legacy file-only mode)
		--no-file      Disable state file logging
		--port <num>   WebSocket server port (default: 3847)

	Examples
	  $ liku
	  $ liku --ai
	  $ liku --no-websocket
	  $ liku --port 8080
`, {
	importMeta: import.meta,
	flags: {
		ai: {
			type: 'boolean',
		},
		noWebsocket: {
			type: 'boolean',
			default: false,
		},
		noFile: {
			type: 'boolean',
			default: false,
		},
		port: {
			type: 'number',
			default: 3847,
		},
	}
});

// ============================================================
// Pre-flight Safety Check for AI Agents
// Detects if running in VS Code's integrated terminal and warns
// AI agents to use proper launch method (Start-Process)
// ============================================================
const checkAISafetyPreFlight = (): boolean => {
  // Skip check if --ai flag is set (agent knows what it's doing)
  if (cli.flags.ai) return true;
  
  // Skip check if explicitly disabled
  if (process.env.LIKU_SKIP_SAFETY_CHECK === '1') return true;
  
  // Check for VS Code integrated terminal indicators
  const isVSCodeTerminal = !!(
    process.env.VSCODE_INJECTION ||
    process.env.TERM_PROGRAM === 'vscode' ||
    process.env.VSCODE_GIT_IPC_HANDLE ||
    process.env.VSCODE_PID
  );
  
  // Check for GitHub Copilot / AI tool indicators
  const isLikelyAISession = !!(
    process.env.GITHUB_COPILOT_AGENT ||
    process.env.CURSOR_SESSION ||
    process.env.AIDER_SESSION ||
    // Parent process check for AI tools running terminal commands
    process.ppid && process.env.VSCODE_PID
  );
  
  // If in VS Code terminal AND looks like AI session, warn and exit
  if (isVSCodeTerminal) {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    ⚠️  LIKU-AI SAFETY CHECK  ⚠️                        ║
╠══════════════════════════════════════════════════════════════════════╣
║  This is a TUI application that will HANG your IDE if run inline!   ║
║                                                                      ║
║  AI AGENTS: You MUST read the instructions first:                   ║
║                                                                      ║
║    📖 LIKU-CORE.md          - Required setup & launch instructions  ║
║    📖 docs/ai/LIKU-CHESS.md - Chess-specific instructions           ║
║                                                                      ║
║  CORRECT LAUNCH METHOD (Windows PowerShell):                        ║
║                                                                      ║
║    Start-Process pwsh -ArgumentList "-NoExit", "-Command",          ║
║      "cd ${process.cwd().replace(/\\/g, '/')}; node dist/index.js"                         ║
║                                                                      ║
║  To bypass this check (humans only):                                ║
║    - Set LIKU_SKIP_SAFETY_CHECK=1 environment variable              ║
║    - Or run with: node dist/index.js --ai                           ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
`);
    return false;
  }
  
  return true;
};

// Run safety check - exit if unsafe
if (!checkAISafetyPreFlight()) {
  process.exit(0);
}

// ============================================================
// Fullscreen Mode Initialization
// Uses alternate screen buffer to prevent scroll artifacts
// This is the pattern used by vim, htop, and other TUI apps
// ============================================================
const initFullscreen = () => {
  // Switch to alternate buffer (prevents scroll history pollution)
  process.stdout.write(ANSI.ALT_BUFFER_ON);
  // Hide cursor (prevents the blinking cursor artifact)
  process.stdout.write(ANSI.CURSOR_HIDE);
  // Clear and position cursor
  process.stdout.write(ANSI.CLEAR_SCREEN + ANSI.CURSOR_HOME);
  // Reset scroll region
  process.stdout.write(ANSI.SCROLL_REGION_FULL);
  // Set title with PID for unique window targeting (important for AutoPlayer)
  process.stdout.write(ANSI.SET_TITLE(`LikuBuddy Game Hub [${process.pid}]`));
};

const exitFullscreen = () => {
  // Show cursor and return to main buffer
  process.stdout.write(ANSI.CURSOR_SHOW);
  process.stdout.write(ANSI.ALT_BUFFER_OFF);
};

// Clear the state file when the app exits to prevent stale PID issues
const clearStateFile = () => {
  try {
    const content = `PROCESS ID: TERMINATED\nCURRENT SCREEN: Application Closed\nSTATUS: The LikuBuddy application has exited.\n\nVISUAL STATE:\nNo active session. Start LikuBuddy with 'npm start' to begin.\n\nCONTROLS: N/A\n`;
    fs.writeFileSync(STATE_FILE, content, 'utf-8');
  } catch {
    // Ignore errors - file may not exist or be locked
  }
};

// Check and clean stale state file on startup
// This handles the case where the previous terminal was forcefully closed
const cleanStaleStateFile = () => {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf-8');
      
      // Check if already terminated
      if (content.includes('PROCESS ID: TERMINATED')) {
        // Already clean
        return;
      }
      
      // Try to extract timestamp from state file
      const timestampMatch = content.match(/TIMESTAMP:\s*(\d+)/);
      if (timestampMatch) {
        const timestamp = parseInt(timestampMatch[1], 10);
        const age = Date.now() - timestamp;
        
        if (age > STATE_FILE_STALE_MS) {
          // State file is stale - previous process didn't clean up
          console.log(`[Startup] Cleaning stale state file (age: ${Math.round(age / 1000)}s)`);
          clearStateFile();
        }
      } else {
        // No timestamp = legacy file, clear it
        clearStateFile();
      }
    }
  } catch {
    // Ignore errors
  }
};

// Run stale cleanup on startup
cleanStaleStateFile();

// ============================================================
// WebSocket Server Management
// ============================================================
const websocketEnabled = !cli.flags.noWebsocket;
const fileLoggingEnabled = !cli.flags.noFile;
const wsPort = cli.flags.port;

// Configure state logging based on flags
setWebSocketEnabled(websocketEnabled);
setFileLoggingEnabled(fileLoggingEnabled);

// Start WebSocket server if enabled
const startWebSocketServer = async (): Promise<void> => {
  if (!websocketEnabled) {
    originalConsoleLog('[Liku] WebSocket server disabled (--no-websocket flag)');
    return;
  }

  try {
    // Create new server with custom port if specified
    if (wsPort !== 3847) {
      const { LikuWebSocketServer } = await import('./websocket/server.js');
      const customServer = new LikuWebSocketServer({ port: wsPort });
      await customServer.start();
      
      // Replace singleton (hacky but works for now)
      (globalThis as Record<string, unknown>).__likuWsServer = customServer;
    } else {
      await wsServer.start();
    }
    
    // Setup command handlers
    wsServer.on('key', (key: string, clientId: string) => {
      // Forward key events to React via the command bridge
      logsBuffer.push(`[WS] Key from ${clientId}: ${key}`);
      commandBridge.emit('key', key);
    });

    wsServer.on('action', (action: string, clientId: string) => {
      logsBuffer.push(`[WS] Action from ${clientId}: ${action}`);
      commandBridge.emit('action', action);
    });

    wsServer.on('query', (query: string, clientId: string, callback: (result: unknown) => void) => {
      // Handle queries
      if (query === 'stats') {
        callback(wsServer.getStats());
      } else if (query === 'history') {
        const { getStateHistory } = require('./core/GameStateLogger.js');
        callback(getStateHistory(50));
      } else {
        callback({ error: 'Unknown query', query });
      }
    });

  } catch (err) {
    originalConsoleError('[Liku] Failed to start WebSocket server:', err);
  }
};

const stopWebSocketServer = async (): Promise<void> => {
  if (websocketEnabled && wsServer.isRunning) {
    try {
      await wsServer.stop();
    } catch (err) {
      // Ignore stop errors during shutdown
    }
  }
};

// Initialize fullscreen mode BEFORE React renders
initFullscreen();

// Handle exit cleanup - clear state file, stop WebSocket, clear agent signal, and restore terminal
const cleanup = async () => {
  await stopWebSocketServer();
  clearStateFile();
  clearAgentSignal();
  exitFullscreen();
};

// Synchronous cleanup wrapper for process handlers
const cleanupSync = () => {
  stopWebSocketServer().catch(() => {});
  clearStateFile();
  clearAgentSignal();
  exitFullscreen();
};

process.on('exit', cleanupSync);
process.on('SIGINT', () => { cleanupSync(); process.exit(0); });
process.on('SIGTERM', () => { cleanupSync(); process.exit(0); });
process.on('uncaughtException', (err) => { 
  cleanupSync(); 
  console.error('Uncaught exception:', err);
  process.exit(1); 
});

interface AppProps {
	ai?: boolean;
	wsEnabled?: boolean;
}

const App: React.FC<AppProps> = ({ ai = false, wsEnabled = true }) => {
	const { exit } = useApp();
	const { stdin, setRawMode } = useStdin();
	const [actionQueue, setActionQueue] = useState<string[]>([]);
	const [wsReady, setWsReady] = useState(false);

	// Handle WebSocket key events via the command bridge
	const handleWsKey = useCallback((key: string) => {
		// Map WebSocket key names to action commands
		const keyToAction: Record<string, string> = {
			'up': 'up',
			'down': 'down',
			'left': 'left',
			'right': 'right',
			'enter': 'enter',
			'escape': 'escape',
			'space': 'space',
			'tab': 'tab',
		};
		const action = keyToAction[key.toLowerCase()] || key;
		setActionQueue(prev => [...prev, action]);
	}, []);

	const handleWsAction = useCallback((action: string) => {
		setActionQueue(prev => [...prev, action]);
	}, []);

	useEffect(() => {
		// Guard streams (prevents console.log from corrupting TUI)
		guardStreams();

		// Start WebSocket server and set up command bridge listeners
		if (wsEnabled) {
			startWebSocketServer().then(() => {
				setWsReady(true);
			});

			// Subscribe to command bridge events
			commandBridge.on('key', handleWsKey);
			commandBridge.on('action', handleWsAction);
		}

		if (ai) {
			setRawMode(false);
			const handleData = (data: Buffer) => {
				const command = data.toString().trim();
				if (command === 'exit_app') {
					restoreStreams();
					exitFullscreen();
					exit();
				}
				setActionQueue(prev => [...prev, ...command.split('\n')]);
			};
			stdin.on('data', handleData);
			return () => {
				stdin.off('data', handleData);
				commandBridge.off('key', handleWsKey);
				commandBridge.off('action', handleWsAction);
				restoreStreams();
			};
		}

		return () => {
			commandBridge.off('key', handleWsKey);
			commandBridge.off('action', handleWsAction);
			restoreStreams();
		};
	}, [ai, exit, stdin, setRawMode, wsEnabled, handleWsKey, handleWsAction]);

	return <GameHub ai={ai} actionQueue={actionQueue} setActionQueue={setActionQueue} />;
};

// ============================================================
// Render with options to prevent artifacts
// - patchConsole: false - We handle console patching ourselves
// Note: Cursor is hidden via ANSI codes in initFullscreen()
// ============================================================
const inkInstance = render(<App ai={cli.flags.ai} wsEnabled={websocketEnabled} />, {
	patchConsole: false,  // We handle console patching ourselves
});

// ============================================================
// Persistent Cursor Suppression
// Ink may show the cursor after each render cycle, causing
// a vertical line artifact on the right side of the screen.
// We use a periodic interval to keep the cursor hidden.
// ============================================================
const cursorSuppressor = setInterval(() => {
	process.stdout.write(ANSI.CURSOR_HIDE);
}, 100);  // Re-hide cursor every 100ms

// Clean up on exit
inkInstance.waitUntilExit().then(() => {
	clearInterval(cursorSuppressor);
	exitFullscreen();
});