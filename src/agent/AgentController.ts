/**
 * AgentController - Cross-platform key simulation and game state reading
 * 
 * Provides a unified API for AI agents to interact with LikuBuddy
 * without requiring platform-specific scripts.
 * 
 * Supports:
 * - Windows: PowerShell + WScript.Shell (built-in)
 * - macOS: osascript/AppleScript (built-in)
 * - Linux: xdotool (requires installation)
 */

import { execSync, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getPlatform, getKeySimTool, getStatePath, findLikuProcess, Platform } from './PlatformUtils.js';

// ============================================================
// Key Mapping
// ============================================================

export type GameKey = 
  | 'up' | 'down' | 'left' | 'right'
  | 'enter' | 'escape' | 'space'
  | 'f' | 'r' | 'q' | 'm'
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l'
  | 'n' | 'o' | 'p' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z';

// Windows SendKeys format
const WINDOWS_KEY_MAP: Record<GameKey, string> = {
  up: '{UP}',
  down: '{DOWN}',
  left: '{LEFT}',
  right: '{RIGHT}',
  enter: '{ENTER}',
  escape: '{ESC}',
  space: ' ',
  f: 'f', r: 'r', q: 'q', m: 'm',
  a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', g: 'g', h: 'h', i: 'i',
  j: 'j', k: 'k', l: 'l', n: 'n', o: 'o', p: 'p', s: 's', t: 't',
  u: 'u', v: 'v', w: 'w', x: 'x', y: 'y', z: 'z'
};

// macOS AppleScript key codes
const MACOS_KEY_MAP: Record<GameKey, { code?: number; char?: string }> = {
  up: { code: 126 },
  down: { code: 125 },
  left: { code: 123 },
  right: { code: 124 },
  enter: { code: 36 },
  escape: { code: 53 },
  space: { char: ' ' },
  f: { char: 'f' }, r: { char: 'r' }, q: { char: 'q' }, m: { char: 'm' },
  a: { char: 'a' }, b: { char: 'b' }, c: { char: 'c' }, d: { char: 'd' },
  e: { char: 'e' }, g: { char: 'g' }, h: { char: 'h' }, i: { char: 'i' },
  j: { char: 'j' }, k: { char: 'k' }, l: { char: 'l' }, n: { char: 'n' },
  o: { char: 'o' }, p: { char: 'p' }, s: { char: 's' }, t: { char: 't' },
  u: { char: 'u' }, v: { char: 'v' }, w: { char: 'w' }, x: { char: 'x' },
  y: { char: 'y' }, z: { char: 'z' }
};

// Linux xdotool key names
const LINUX_KEY_MAP: Record<GameKey, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  enter: 'Return',
  escape: 'Escape',
  space: 'space',
  f: 'f', r: 'r', q: 'q', m: 'm',
  a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', g: 'g', h: 'h', i: 'i',
  j: 'j', k: 'k', l: 'l', n: 'n', o: 'o', p: 'p', s: 's', t: 't',
  u: 'u', v: 'v', w: 'w', x: 'x', y: 'y', z: 'z'
};

// ============================================================
// Key Simulation
// ============================================================

/**
 * Send a key to the LikuBuddy game window
 * Cross-platform implementation
 */
export async function sendKey(key: GameKey, windowTitle: string = 'LikuBuddy Game Hub'): Promise<void> {
  const platform = getPlatform();
  const toolInfo = getKeySimTool();
  
  if (!toolInfo.available) {
    throw new Error(`Key simulation not available. ${toolInfo.installHint}`);
  }
  
  switch (platform) {
    case 'windows':
      return sendKeyWindows(key, windowTitle);
    case 'macos':
      return sendKeyMacOS(key, windowTitle);
    case 'linux':
      return sendKeyLinux(key, windowTitle);
  }
}

/**
 * Windows: Use PowerShell + WScript.Shell
 */
async function sendKeyWindows(key: GameKey, windowTitle: string): Promise<void> {
  const sendKeysValue = WINDOWS_KEY_MAP[key];
  if (!sendKeysValue) {
    throw new Error(`Unknown key: ${key}`);
  }
  
  // PowerShell script to activate window and send key
  const script = `
    $wshell = New-Object -ComObject WScript.Shell
    $success = $wshell.AppActivate('${windowTitle}')
    if (-not $success) {
      $success = $wshell.AppActivate('Liku')
    }
    if (-not $success) {
      $success = $wshell.AppActivate('node')
    }
    if (-not $success) {
      Write-Error "Could not find game window"
      exit 1
    }
    Start-Sleep -Milliseconds 50
    $wshell.SendKeys('${sendKeysValue}')
  `;
  
  // Convert multiline script to single line with semicolons
  // PowerShell requires semicolons to separate statements on one line
  const singleLineScript = script
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('; ');
  
  return new Promise((resolve, reject) => {
    exec(`powershell -Command "${singleLineScript.replace(/"/g, '\\"')}"`, (error) => {
      if (error) {
        reject(new Error(`Failed to send key: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * macOS: Use osascript/AppleScript
 */
async function sendKeyMacOS(key: GameKey, windowTitle: string): Promise<void> {
  const keyDef = MACOS_KEY_MAP[key];
  if (!keyDef) {
    throw new Error(`Unknown key: ${key}`);
  }
  
  let keystrokeCommand: string;
  if (keyDef.code !== undefined) {
    keystrokeCommand = `key code ${keyDef.code}`;
  } else {
    keystrokeCommand = `keystroke "${keyDef.char}"`;
  }
  
  // AppleScript to activate Terminal and send key
  const script = `
    tell application "System Events"
      set frontApp to name of first application process whose frontmost is true
      
      -- Try to find and activate Terminal or iTerm with LikuBuddy
      if application "Terminal" is running then
        tell application "Terminal" to activate
        delay 0.1
        ${keystrokeCommand}
        return
      end if
      
      if application "iTerm" is running then
        tell application "iTerm" to activate
        delay 0.1
        ${keystrokeCommand}
        return
      end if
      
      -- Fallback: send to frontmost app
      ${keystrokeCommand}
    end tell
  `;
  
  return new Promise((resolve, reject) => {
    exec(`osascript -e '${script.replace(/'/g, "\\'")}'`, (error) => {
      if (error) {
        reject(new Error(`Failed to send key: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Linux: Use xdotool
 */
async function sendKeyLinux(key: GameKey, windowTitle: string): Promise<void> {
  const xdotoolKey = LINUX_KEY_MAP[key];
  if (!xdotoolKey) {
    throw new Error(`Unknown key: ${key}`);
  }
  
  return new Promise((resolve, reject) => {
    // First try to find and focus the window, then send key
    exec(
      `xdotool search --name "${windowTitle}" windowactivate --sync 2>/dev/null || ` +
      `xdotool search --name "Liku" windowactivate --sync 2>/dev/null || ` +
      `xdotool search --name "node" windowactivate --sync 2>/dev/null; ` +
      `xdotool key ${xdotoolKey}`,
      (error) => {
        if (error) {
          reject(new Error(`Failed to send key: ${error.message}`));
        } else {
          resolve();
        }
      }
    );
  });
}

// ============================================================
// Game State Reading
// ============================================================

export interface GameState {
  screen: string;
  status: string | null;
  stats: {
    level: number;
    xp: number;
    hunger: number;
    energy: number;
    happiness: number;
  } | null;
  message: string | null;
  menuItems: Array<{ selected: boolean; text: string }>;
  snakeState: {
    direction: string | null;
    foodDeltaX: number | null;
    foodDeltaY: number | null;
    isDanger: boolean;
    isGameOver: boolean;
  } | null;
  raw: string;
}

/**
 * Read the current game state from likubuddy-state.txt
 */
export function readGameState(statePath?: string): GameState | null {
  const filePath = statePath || getStatePath();
  
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) {
      return null;
    }
    
    return parseGameState(content);
  } catch {
    return null;
  }
}

/**
 * Parse the game state text into a structured object
 */
function parseGameState(content: string): GameState {
  const lines = content.split('\n');
  
  // Helper to extract value from pattern
  const extract = (pattern: RegExp): string | null => {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) return match[1]?.trim() || null;
    }
    return null;
  };
  
  // Parse stats from STATS line
  let stats: GameState['stats'] = null;
  const statsLine = lines.find(l => l.startsWith('STATS:'));
  if (statsLine) {
    const levelMatch = statsLine.match(/Level:\s*(\d+)/);
    const xpMatch = statsLine.match(/XP:\s*(\d+)/);
    const hungerMatch = statsLine.match(/Hunger:\s*(\d+)/);
    const energyMatch = statsLine.match(/Energy:\s*(\d+)/);
    const happinessMatch = statsLine.match(/Happiness:\s*(\d+)/);
    
    stats = {
      level: levelMatch ? parseInt(levelMatch[1], 10) : 0,
      xp: xpMatch ? parseInt(xpMatch[1], 10) : 0,
      hunger: hungerMatch ? parseInt(hungerMatch[1], 10) : 0,
      energy: energyMatch ? parseInt(energyMatch[1], 10) : 0,
      happiness: happinessMatch ? parseInt(happinessMatch[1], 10) : 0
    };
  }
  
  // Parse menu items
  const menuItems: GameState['menuItems'] = [];
  let inMenuSection = false;
  for (const line of lines) {
    if (line.includes('MENU ITEMS:')) {
      inMenuSection = true;
      continue;
    }
    if (inMenuSection) {
      const menuMatch = line.match(/\[([ x])\]\s*(.*)/);
      if (menuMatch) {
        menuItems.push({
          selected: menuMatch[1] === 'x',
          text: menuMatch[2].trim()
        });
      }
    }
  }
  
  // Parse snake-specific state
  let snakeState: GameState['snakeState'] = null;
  if (content.includes('Direction:') || content.includes('Food Delta:')) {
    const dxMatch = content.match(/Food Delta:.*dx=(-?\d+)/);
    const dyMatch = content.match(/dy=(-?\d+)/);
    
    snakeState = {
      direction: extract(/Direction:\s*(\w+)/),
      foodDeltaX: dxMatch ? parseInt(dxMatch[1], 10) : null,
      foodDeltaY: dyMatch ? parseInt(dyMatch[1], 10) : null,
      isDanger: content.includes('DANGER'),
      isGameOver: content.includes('GAME OVER')
    };
  }
  
  return {
    screen: extract(/CURRENT SCREEN:\s*(.*)/) || 'Unknown',
    status: extract(/STATUS:\s*(.*)/),
    stats,
    message: extract(/MESSAGE:\s*(.*)/),
    menuItems,
    snakeState,
    raw: content
  };
}

// ============================================================
// AI Decision Helpers
// ============================================================

/**
 * Suggest the next action based on game state
 * Simple heuristics for AI agents
 */
export function suggestAction(state: GameState): GameKey | null {
  const screen = state.screen.toLowerCase();
  
  // Main menu logic
  if (screen.includes('main menu')) {
    // Check if Liku needs care
    if (state.stats) {
      if (state.stats.energy < 20) {
        // Find and navigate to Rest option
        const restIndex = state.menuItems.findIndex(m => m.text.includes('Rest'));
        const selectedIndex = state.menuItems.findIndex(m => m.selected);
        
        if (restIndex >= 0 && selectedIndex >= 0) {
          if (restIndex > selectedIndex) return 'down';
          if (restIndex < selectedIndex) return 'up';
          return 'enter';
        }
      }
      
      if (state.stats.hunger > 80) {
        // Find and navigate to Feed option
        const feedIndex = state.menuItems.findIndex(m => m.text.includes('Feed'));
        const selectedIndex = state.menuItems.findIndex(m => m.selected);
        
        if (feedIndex >= 0 && selectedIndex >= 0) {
          if (feedIndex > selectedIndex) return 'down';
          if (feedIndex < selectedIndex) return 'up';
          return 'enter';
        }
      }
    }
    
    // Default: navigate to play
    return 'enter';
  }
  
  // Snake game logic
  if (screen.includes('snake') && state.snakeState) {
    if (state.snakeState.isGameOver) {
      return 'q'; // Quit to menu
    }
    
    if (state.snakeState.isDanger) {
      // Turn perpendicular to current direction
      const dir = state.snakeState.direction?.toUpperCase();
      if (dir === 'UP' || dir === 'DOWN') return 'left';
      return 'up';
    }
    
    // Move toward food
    const dx = state.snakeState.foodDeltaX;
    const dy = state.snakeState.foodDeltaY;
    const dir = state.snakeState.direction?.toUpperCase();
    
    if (dx !== null && dy !== null) {
      if (dx < 0 && dir !== 'RIGHT') return 'left';
      if (dx > 0 && dir !== 'LEFT') return 'right';
      if (dy < 0 && dir !== 'DOWN') return 'up';
      if (dy > 0 && dir !== 'UP') return 'down';
    }
  }
  
  return null;
}

// ============================================================
// Agent Commands
// ============================================================

export interface AgentCommand {
  action: 'key' | 'read' | 'decide' | 'info';
  key?: GameKey;
  windowTitle?: string;
}

/**
 * Execute an agent command
 */
export async function executeCommand(cmd: AgentCommand): Promise<string> {
  switch (cmd.action) {
    case 'key':
      if (!cmd.key) throw new Error('Key is required for "key" action');
      await sendKey(cmd.key, cmd.windowTitle);
      return `✅ Sent key: ${cmd.key}`;
      
    case 'read':
      const state = readGameState();
      if (!state) return '❌ No game state available';
      return JSON.stringify(state, null, 2);
      
    case 'decide':
      const gameState = readGameState();
      if (!gameState) return '❌ No game state available for decision';
      const suggested = suggestAction(gameState);
      return suggested ? `Suggested action: ${suggested}` : 'No action suggested';
      
    case 'info':
      const { printSystemInfo } = await import('./PlatformUtils.js');
      return printSystemInfo();
      
    default:
      throw new Error(`Unknown action: ${cmd.action}`);
  }
}
