/**
 * KeySender - Cross-platform key simulation for auto-player
 * 
 * Uses the fastest available method for each platform:
 * - Windows: PowerShell + WScript.Shell (COM)
 * - macOS: osascript/AppleScript
 * - Linux: xdotool
 */

import { exec, execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';

export type GameKey = 
  | 'up' | 'down' | 'left' | 'right'
  | 'enter' | 'escape' | 'space'
  | 'q' | 'f' | 'r' | 'm';

type Platform = 'windows' | 'macos' | 'linux';

// Key mappings for each platform
const WINDOWS_KEYS: Record<GameKey, string> = {
  up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
  enter: '{ENTER}', escape: '{ESC}', space: ' ',
  q: 'q', f: 'f', r: 'r', m: 'm'
};

const LINUX_KEYS: Record<GameKey, string> = {
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  enter: 'Return', escape: 'Escape', space: 'space',
  q: 'q', f: 'f', r: 'r', m: 'm'
};

/**
 * Escape a string for safe use in shell commands
 * Prevents command injection attacks
 */
function escapeShellArg(arg: string): string {
  // For Windows PowerShell, escape double quotes and backticks
  return arg.replace(/[`"$]/g, '`$&');
}

/**
 * Escape a string for safe use in AppleScript
 */
function escapeAppleScript(arg: string): string {
  return arg.replace(/[\\'"]/g, '\\$&');
}

export class KeySender {
  private platform: Platform;
  private windowTitle: string;
  private targetPid: number | null = null;
  private lastSendTime: number = 0;
  private minInterval: number;  // Minimum ms between key sends
  private scriptPath: string;  // Path to send-keys.ps1
  
  constructor(options: {
    windowTitle?: string;
    minInterval?: number;
    targetPid?: number;
  } = {}) {
    this.platform = this.detectPlatform();
    this.windowTitle = options.windowTitle || 'LikuBuddy Game Hub';
    this.targetPid = options.targetPid || null;
    this.minInterval = options.minInterval || 30;  // 30ms default
    this.scriptPath = path.join(process.cwd(), 'send-keys.ps1');
  }
  
  /**
   * Update the target PID for window activation
   */
  setTargetPid(pid: number): void {
    this.targetPid = pid;
  }
  
  private detectPlatform(): Platform {
    const p = os.platform();
    if (p === 'win32') return 'windows';
    if (p === 'darwin') return 'macos';
    return 'linux';
  }
  
  /**
   * Send a key to the game window
   * Returns a promise that resolves when the key is sent
   */
  async send(key: GameKey): Promise<boolean> {
    // Rate limiting
    const now = Date.now();
    const elapsed = now - this.lastSendTime;
    if (elapsed < this.minInterval) {
      await this.sleep(this.minInterval - elapsed);
    }
    
    this.lastSendTime = Date.now();
    
    switch (this.platform) {
      case 'windows':
        return this.sendWindows(key);  // Sync but wrapped in async interface
      case 'macos':
        return this.sendMacOS(key);
      case 'linux':
        return this.sendLinux(key);
    }
  }
  
  /**
   * Send key on Windows using send-keys.ps1 script
   * Uses synchronous execution for speed (avoids async overhead)
   * Pass targetPid for precise window targeting via title "LikuBuddy Game Hub [PID]"
   */
  private sendWindows(key: GameKey): boolean {
    const keyCode = WINDOWS_KEYS[key];
    if (!keyCode) return false;
    
    try {
      // Escape the key code to prevent command injection
      const escapedKey = escapeShellArg(keyCode);
      
      // Build command with PID for precise title-based targeting
      let command = `powershell -ExecutionPolicy Bypass -File "${this.scriptPath}" -Key "${escapedKey}"`;
      if (this.targetPid !== null && this.targetPid > 0) {
        command += ` -Id ${this.targetPid}`;
      }
      
      // Use execSync for minimal latency (no promise/callback overhead)
      execSync(command, { 
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 500,  // 500ms timeout
        windowsHide: true
      });
      return true;
    } catch (error) {
      // Log error but don't crash - game window may have closed
      return false;
    }
  }
  
  /**
   * Send key on macOS using osascript
   */
  private async sendMacOS(key: GameKey): Promise<boolean> {
    // For macOS, we need to use key codes or keystroke
    const keyCode = this.getMacOSKeyCode(key);
    
    let script: string;
    if (keyCode.code !== undefined) {
      script = `tell application "System Events" to key code ${keyCode.code}`;
    } else {
      // Escape the character for AppleScript to prevent injection
      const escapedChar = escapeAppleScript(keyCode.char || '');
      script = `tell application "System Events" to keystroke "${escapedChar}"`;
    }
    
    return new Promise((resolve) => {
      exec(`osascript -e '${script}'`, (error) => {
        resolve(!error);
      });
    });
  }
  
  private getMacOSKeyCode(key: GameKey): { code?: number; char?: string } {
    const codes: Record<GameKey, { code?: number; char?: string }> = {
      up: { code: 126 }, down: { code: 125 }, 
      left: { code: 123 }, right: { code: 124 },
      enter: { code: 36 }, escape: { code: 53 }, 
      space: { char: ' ' },
      q: { char: 'q' }, f: { char: 'f' }, 
      r: { char: 'r' }, m: { char: 'm' }
    };
    return codes[key] || { char: key };
  }
  
  /**
   * Send key on Linux using xdotool
   */
  private async sendLinux(key: GameKey): Promise<boolean> {
    const keyCode = LINUX_KEYS[key];
    if (!keyCode) return false;
    
    // Escape window title for shell to prevent injection
    // Use single quotes and escape any existing single quotes
    const escapedTitle = this.windowTitle.replace(/'/g, "'\\''");
    
    // Activate window and send key
    const command = 
      `xdotool search --name '${escapedTitle}' windowactivate --sync 2>/dev/null; ` +
      `xdotool key ${keyCode}`;
    
    return new Promise((resolve) => {
      exec(command, (error) => {
        resolve(!error);
      });
    });
  }
  
  /**
   * Send multiple keys in sequence with minimal delay
   */
  async sendSequence(keys: GameKey[], delayBetween: number = 50): Promise<void> {
    for (const key of keys) {
      await this.send(key);
      if (delayBetween > 0) {
        await this.sleep(delayBetween);
      }
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton for convenience
export const keySender = new KeySender();
