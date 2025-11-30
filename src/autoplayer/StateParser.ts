/**
 * StateParser - Fast parsing of likubuddy-state.txt for auto-player
 * 
 * Optimized for speed: uses regex and string operations instead of full parsing
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface ParsedState {
  timestamp: number;
  pid: number | null;  // Process ID from state file
  pidValid: boolean;   // Whether the PID is still running
  screen: string;
  status: string;
  
  // Menu state
  menuItems?: Array<{ text: string; selected: boolean }>;
  selectedIndex?: number;
  
  // Dino Run specific
  dino?: {
    y: number;
    velocity: number;
    isJumping: boolean;
  };
  obstacle?: {
    distance: number;
    type: string;
    y: number;
    shouldJump: boolean;
  };
  dinoGameState?: 'START' | 'COUNTDOWN' | 'PLAYING' | 'GAME_OVER';
  countdown?: number;
  
  // Snake specific
  snake?: {
    headX: number;
    headY: number;
    direction: string;
    foodDeltaX: number;
    foodDeltaY: number;
    isDanger: boolean;
    isGameOver: boolean;
  };
  
  // Tic-Tac-Toe specific
  tictactoe?: {
    board: string[];  // 9 cells
    cursor: number;
    turn: 'X' | 'O';
    isGameOver: boolean;
    winner?: string;
  };
  
  // Raw content for debugging
  raw: string;
}

export class StateParser {
  private statePath: string;
  private lastModified: number = 0;
  private cachedState: ParsedState | null = null;
  
  // PID validation cache - avoid calling tasklist on every parse
  private lastValidatedPid: number | null = null;
  private lastPidValidationTime: number = 0;
  private pidValidationCacheMs: number = 5000;  // Re-validate every 5 seconds (matches docs)
  
  constructor(statePath?: string) {
    this.statePath = statePath || path.join(process.cwd(), 'likubuddy-state.txt');
  }
  
  /**
   * Check if state file has been modified since last read
   */
  hasChanged(): boolean {
    try {
      const stats = fs.statSync(this.statePath);
      return stats.mtimeMs > this.lastModified;
    } catch {
      return false;
    }
  }
  
  /**
   * Read and parse the state file
   * Returns cached state if file hasn't changed
   */
  parse(forceRefresh: boolean = false): ParsedState | null {
    if (!forceRefresh && this.cachedState && !this.hasChanged()) {
      return this.cachedState;
    }
    
    try {
      const stats = fs.statSync(this.statePath);
      const content = fs.readFileSync(this.statePath, 'utf8');
      
      this.lastModified = stats.mtimeMs;
      this.cachedState = this.parseContent(content);
      return this.cachedState;
    } catch {
      return null;
    }
  }
  
  /**
   * Parse the state file content
   */
  private parseContent(content: string): ParsedState {
    // Check for TERMINATED state (app has exited cleanly)
    if (content.includes('PROCESS ID: TERMINATED')) {
      return {
        timestamp: Date.now(),
        pid: null,
        pidValid: false,
        screen: 'Application Closed',
        status: 'TERMINATED',
        raw: content
      };
    }
    
    // Extract PID from state file
    const pidMatch = content.match(/PROCESS ID:\s*(\d+)/);
    const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
    
    // If PID couldn't be extracted, file might be mid-write - return partial state
    // Let the caller decide how to handle this
    if (!pid) {
      return {
        timestamp: Date.now(),
        pid: null,
        pidValid: false,  // Unknown - couldn't parse
        screen: '',
        status: '',
        raw: content
      };
    }
    
    // Validate PID is still running (with caching to avoid slow tasklist calls)
    let pidValid: boolean;
    const now = Date.now();
    
    if (pid === this.lastValidatedPid && 
        (now - this.lastPidValidationTime) < this.pidValidationCacheMs) {
      // Use cached validation result
      pidValid = true;  // Assume valid if recently validated
    } else {
      // Actually validate
      pidValid = this.isProcessRunning(pid);
      if (pidValid) {
        this.lastValidatedPid = pid;
        this.lastPidValidationTime = now;
      }
    }
    
    const state: ParsedState = {
      timestamp: Date.now(),
      pid,
      pidValid,
      screen: this.extractValue(content, /CURRENT SCREEN:\s*(.+)/),
      status: this.extractValue(content, /STATUS:\s*(.+)/),
      raw: content
    };
    
    // Detect game type and parse accordingly
    const screen = state.screen.toLowerCase();
    
    if (screen.includes('dinorun') || screen.includes('dino run')) {
      this.parseDinoState(content, state);
    } else if (screen.includes('snake')) {
      this.parseSnakeState(content, state);
    } else if (screen.includes('tic-tac-toe') || screen.includes('tictactoe')) {
      this.parseTicTacToeState(content, state);
    } else if (screen.includes('menu')) {
      this.parseMenuState(content, state);
    }
    
    return state;
  }
  
  /**
   * Parse Dino Run specific state
   */
  private parseDinoState(content: string, state: ParsedState): void {
    // Detect game state from STATUS line (most reliable)
    // Format: "STATUS: Score: X | State: START/PLAYING/COUNTDOWN/GAME_OVER"
    const stateMatch = content.match(/State:\s*(START|PLAYING|COUNTDOWN|GAME_OVER)/i);
    
    if (stateMatch) {
      const gameState = stateMatch[1].toUpperCase();
      if (gameState === 'START') {
        state.dinoGameState = 'START';
      } else if (gameState === 'COUNTDOWN') {
        state.dinoGameState = 'COUNTDOWN';
        const countMatch = content.match(/COUNTDOWN:\s*(\d+)/);
        state.countdown = countMatch ? parseInt(countMatch[1], 10) : 0;
      } else if (gameState === 'GAME_OVER') {
        state.dinoGameState = 'GAME_OVER';
      } else {
        state.dinoGameState = 'PLAYING';
      }
    } else {
      // Fallback to content-based detection
      if (content.includes('COUNTDOWN:')) {
        state.dinoGameState = 'COUNTDOWN';
        const countMatch = content.match(/COUNTDOWN:\s*(\d+)/);
        state.countdown = countMatch ? parseInt(countMatch[1], 10) : 0;
      } else if (content.includes('Final Score:') || content.includes('Game Over')) {
        state.dinoGameState = 'GAME_OVER';
      } else if (content.includes('Press ENTER to start')) {
        state.dinoGameState = 'START';
      } else {
        state.dinoGameState = 'PLAYING';
      }
    }
    
    // Parse Dino position
    const dinoYMatch = content.match(/Dino Y:\s*(-?\d+)/);
    const velocityMatch = content.match(/Velocity:\s*(-?[\d.]+)/);
    
    if (dinoYMatch) {
      const y = parseInt(dinoYMatch[1], 10);
      const velocity = velocityMatch ? parseFloat(velocityMatch[1]) : 0;
      
      state.dino = {
        y,
        velocity,
        isJumping: y > 0 || velocity > 0
      };
    }
    
    // Parse obstacle info
    const obstacleMatch = content.match(/Next Obstacle:\s*Dist=(\d+),\s*Type=(\w+),\s*Y=(\d+)/);
    const jumpNow = content.includes('[JUMP NOW!]');
    
    if (obstacleMatch) {
      state.obstacle = {
        distance: parseInt(obstacleMatch[1], 10),
        type: obstacleMatch[2],
        y: parseInt(obstacleMatch[3], 10),
        shouldJump: jumpNow
      };
    } else if (content.includes('Next Obstacle: None')) {
      state.obstacle = {
        distance: 999,
        type: 'NONE',
        y: 0,
        shouldJump: false
      };
    }
  }
  
  /**
   * Parse Snake specific state
   */
  private parseSnakeState(content: string, state: ParsedState): void {
    const dirMatch = content.match(/Direction:\s*(\w+)/);
    const dxMatch = content.match(/dx=(-?\d+)/);
    const dyMatch = content.match(/dy=(-?\d+)/);
    
    state.snake = {
      headX: 0,  // Would need more parsing
      headY: 0,
      direction: dirMatch ? dirMatch[1] : 'RIGHT',
      foodDeltaX: dxMatch ? parseInt(dxMatch[1], 10) : 0,
      foodDeltaY: dyMatch ? parseInt(dyMatch[1], 10) : 0,
      isDanger: content.includes('DANGER'),
      isGameOver: content.includes('GAME OVER')
    };
  }
  
  /**
   * Parse Tic-Tac-Toe specific state
   */
  private parseTicTacToeState(content: string, state: ParsedState): void {
    // Parse board from visual state
    const board: string[] = new Array(9).fill('');
    
    // Look for board pattern like "X | . | O"
    const boardLines = content.match(/([XO.])\s*\|\s*([XO.])\s*\|\s*([XO.])/g);
    if (boardLines && boardLines.length >= 3) {
      let idx = 0;
      for (const line of boardLines.slice(0, 3)) {
        const cells = line.match(/[XO.]/g);
        if (cells) {
          for (const cell of cells) {
            if (idx < 9) {
              board[idx] = cell === '.' ? '' : cell;
              idx++;
            }
          }
        }
      }
    }
    
    // Parse cursor position
    const cursorMatch = content.match(/Cursor Position:\s*(\d+)/);
    
    // Detect turn
    const isYourTurn = content.includes('Your Turn');

    state.tictactoe = {
      board,
      cursor: cursorMatch ? parseInt(cursorMatch[1], 10) : 4,
      turn: isYourTurn ? 'X' : 'O',
      isGameOver: content.includes('Game Over'),
      winner: content.includes('You Won') ? 'X' : 
              content.includes('Liku Won') ? 'O' :
              content.includes('Draw') ? 'DRAW' : undefined
    };
  }
  
  /**
   * Parse menu state
   */
  private parseMenuState(content: string, state: ParsedState): void {
    const menuItems: Array<{ text: string; selected: boolean }> = [];
    const menuMatch = content.matchAll(/\[([ x])\]\s*(.+)/g);
    
    let selectedIndex = -1;
    let idx = 0;
    
    for (const match of menuMatch) {
      const selected = match[1] === 'x';
      menuItems.push({
        text: match[2].trim(),
        selected
      });
      if (selected) selectedIndex = idx;
      idx++;
    }
    
    state.menuItems = menuItems;
    state.selectedIndex = selectedIndex;
  }
  
  /**
   * Extract a value using regex
   */
  private extractValue(content: string, pattern: RegExp): string {
    const match = content.match(pattern);
    return match ? match[1].trim() : '';
  }
  
  /**
   * Check if a process ID is still running
   */
  private isProcessRunning(pid: number): boolean {
    try {
      if (process.platform === 'win32') {
        // Windows: use tasklist
        const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { 
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
        return result.includes(pid.toString());
      } else {
        // Unix: use kill -0 (doesn't actually kill, just checks)
        execSync(`kill -0 ${pid}`, { stdio: ['pipe', 'pipe', 'pipe'] });
        return true;
      }
    } catch {
      return false;
    }
  }
}

// Singleton for convenience
export const stateParser = new StateParser();
