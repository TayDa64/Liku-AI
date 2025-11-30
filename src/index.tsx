import React, { useState, useEffect } from 'react';
import { render, useStdin, useApp, useStdout } from 'ink';
import meow from 'meow';
import fs from 'node:fs';
import path from 'node:path';
import GameHub from './ui/LikuTUI.js';

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
	  LikuBuddy - Terminal Based ASCII Game Hub

	Options
		--ai  Enable AI interaction mode

	Examples
	  $ liku
	  $ liku --ai
`, {
	importMeta: import.meta,
	flags: {
		ai: {
			type: 'boolean',
		}
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

// Initialize fullscreen mode BEFORE React renders
initFullscreen();

// Handle exit cleanup - clear state file and restore terminal
const cleanup = () => {
  clearStateFile();
  exitFullscreen();
};

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('uncaughtException', (err) => { 
  cleanup(); 
  console.error('Uncaught exception:', err);
  process.exit(1); 
});

interface AppProps {
	ai?: boolean;
}

const App: React.FC<AppProps> = ({ ai = false }) => {
	const { exit } = useApp();
	const { stdin, setRawMode } = useStdin();
	const [actionQueue, setActionQueue] = useState<string[]>([]);

	useEffect(() => {
		// Guard streams (prevents console.log from corrupting TUI)
		guardStreams();

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
	}, [ai, exit, stdin, setRawMode]);

	return <GameHub ai={ai} actionQueue={actionQueue} setActionQueue={setActionQueue} />;
};

// ============================================================
// Render with options to prevent artifacts
// - patchConsole: false - We handle console patching ourselves
// Note: Cursor is hidden via ANSI codes in initFullscreen()
// ============================================================
const inkInstance = render(<App ai={cli.flags.ai} />, {
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