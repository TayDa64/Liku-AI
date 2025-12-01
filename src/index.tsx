import React, { useState, useEffect } from 'react';
import { render, useStdin, useApp, useStdout } from 'ink';
import meow from 'meow';
import fs from 'node:fs';
import path from 'node:path';
import GameHub from './ui/LikuTUI.js';
import { wsServer } from './websocket/server.js';
import { setWebSocketEnabled, setFileLoggingEnabled } from './core/GameStateLogger.js';

// State file path for AI visibility
const STATE_FILE = path.join(process.cwd(), 'likubuddy-state.txt');

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
      // Keys will be handled by the game components via synthetic events
      // For now, log them - actual handling is done in LikuTUI
      logsBuffer.push(`[WS] Key from ${clientId}: ${key}`);
    });

    wsServer.on('action', (action: string, clientId: string) => {
      logsBuffer.push(`[WS] Action from ${clientId}: ${action}`);
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

// Handle exit cleanup - clear state file, stop WebSocket, and restore terminal
const cleanup = async () => {
  await stopWebSocketServer();
  clearStateFile();
  exitFullscreen();
};

// Synchronous cleanup wrapper for process handlers
const cleanupSync = () => {
  stopWebSocketServer().catch(() => {});
  clearStateFile();
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

	useEffect(() => {
		// Guard streams (prevents console.log from corrupting TUI)
		guardStreams();

		// Start WebSocket server
		if (wsEnabled) {
			startWebSocketServer().then(() => {
				setWsReady(true);
			});
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
				restoreStreams();
			};
		}

		return () => {
			restoreStreams();
		};
	}, [ai, exit, stdin, setRawMode, wsEnabled]);

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