/**
 * AI Intro Video System
 * 
 * Plays an intro video (MP4/GIF) in the native media player when an AI agent
 * launches a game. The player auto-closes after playback, leaving the
 * main game window unaffected.
 * 
 * Supported formats:
 *   - MP4 (720p with audio) - Recommended
 *   - GIF (animated)
 * 
 * Usage:
 *   - Set LIKU_AI_PLAYER=claude-opus-4.5 before launching
 *   - Or pass --agent=claude-opus-4.5 flag
 *   - Intro plays in native player while game loads
 */

import { spawn, exec, execSync } from 'child_process';
import { platform } from 'os';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AIAgent {
  id: string;
  name: string;
  tagline: string;
  introVideo: string;      // .mp4 or .gif file path
  introDuration: number;   // seconds (for auto-close timing)
  theme: {
    primary: string;
    accent: string;
  };
}

export const AGENTS: Record<string, AIAgent> = {
  'opus-4.5': {
    id: 'opus-4.5',
    name: 'Claude Opus 4.5',
    tagline: "Anthropic's Reasoning Engine Enters the Arena",
    introVideo: 'src/intro/media/Opus45.mp4',
    introDuration: 10,  // 7s video + 3s buffer for player startup
    theme: { primary: 'cyan', accent: 'blue' }
  },
  'gemini-3': {
    id: 'gemini-3',
    name: 'Gemini 3',
    tagline: "Google's Multimodal Mind Awakens",
    introVideo: 'src/intro/media/gemini3.mp4',
    introDuration: 10,  // 7s video + 3s buffer for player startup
    theme: { primary: 'yellow', accent: 'magenta' }
  },
  'chatgpt-5.1': {
    id: 'chatgpt-5.1',
    name: 'ChatGPT 5.1',
    tagline: "OpenAI's Neural Champion Steps Forward",
    introVideo: 'src/intro/media/chatgpt51.mp4',
    introDuration: 11,  // 7s video + 3s buffer for player startup
    theme: { primary: 'green', accent: 'white' }
  },
  'grok-4.1': {
    id: 'grok-4.1',
    name: 'Grok 4.1',
    tagline: "xAI's Cosmic Challenger",
    introVideo: 'src/intro/media/grok41.mp4',
    introDuration: 10,  // 7s video + 3s buffer for player startup
    theme: { primary: 'red', accent: 'white' }
  }
};

/**
 * Detect which AI agent is playing
 */
export function detectAgent(): AIAgent | null {
  // Check environment variable first
  const envAgent = process.env.LIKU_AI_PLAYER;
  if (envAgent && AGENTS[envAgent]) {
    return AGENTS[envAgent];
  }

  // Check command line args
  const agentArg = process.argv.find(arg => arg.startsWith('--agent='));
  if (agentArg) {
    const agentId = agentArg.split('=')[1];
    if (AGENTS[agentId]) {
      return AGENTS[agentId];
    }
  }

  // Check signal file
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const signalFile = path.join(homeDir, '.liku-ai', 'current-agent.txt');
  if (existsSync(signalFile)) {
    try {
      const fs = require('fs');
      const agentId = fs.readFileSync(signalFile, 'utf-8').trim();
      if (AGENTS[agentId]) {
        return AGENTS[agentId];
      }
    } catch {
      // Ignore read errors
    }
  }

  return null;
}

/**
 * Get the absolute path to an intro video
 */
function getIntroVideoPath(agent: AIAgent): string | null {
  const projectRoot = path.resolve(__dirname, '..', '..');
  
  // Try MP4 first, then GIF
  const mp4Path = path.join(projectRoot, agent.introVideo);
  if (existsSync(mp4Path)) {
    return mp4Path;
  }
  
  // Try GIF version
  const gifPath = mp4Path.replace('.mp4', '.gif');
  if (existsSync(gifPath)) {
    return gifPath;
  }
  
  return null;
}

/**
 * Launch intro video in native media player with auto-close
 * Returns the process info for state file notification
 */
export function playIntroVideo(agent: AIAgent): { pid: number | null; duration: number } {
  const videoPath = getIntroVideoPath(agent);
  
  if (!videoPath) {
    console.log(`[Intro] No video file found for ${agent.name}`);
    return { pid: null, duration: 0 };
  }

  console.log(`[Intro] Playing: ${videoPath}`);
  
  const plat = platform();
  const duration = agent.introDuration;
  let pid: number | null = null;

  try {
    if (plat === 'win32') {
      // Windows: Use Start-Process (proven to work) and spawn separate closer
      // Step 1: Open video immediately with Start-Process
      exec(`powershell -Command "Start-Process '${videoPath.replace(/'/g, "''")}'"`);
      
      // Step 2: Spawn detached cmd to close after duration (more reliable than hidden PowerShell)
      spawn('cmd', ['/c', `timeout /t ${duration} /nobreak >nul & powershell -Command "Get-Process | Where-Object { $_.MainWindowTitle -eq 'Media Player' } | Stop-Process -Force"`], {
        detached: true,
        stdio: 'ignore',
        shell: true,
        windowsHide: true
      }).unref();
      
      pid = process.pid;
      
    } else if (plat === 'darwin') {
      // macOS: Use 'open' command and close after duration
      const script = `
        open "${videoPath}" &
        PID=$!
        sleep ${duration}
        osascript -e 'tell application "Preview" to quit' 2>/dev/null
        osascript -e 'tell application "QuickTime Player" to quit' 2>/dev/null
      `;
      
      const child = spawn('bash', ['-c', script], {
        detached: true,
        stdio: 'ignore'
      });
      
      child.unref();
      pid = child.pid || null;
      
    } else {
      // Linux: Use xdg-open with timeout
      const child = spawn('bash', ['-c', `
        xdg-open "${videoPath}" &
        sleep ${duration}
        # Try to close common video players
        pkill -f "${path.basename(videoPath)}" 2>/dev/null
      `], {
        detached: true,
        stdio: 'ignore'
      });
      
      child.unref();
      pid = child.pid || null;
    }
    
    console.log(`[Intro] Video launched (will auto-close in ${duration}s)`);
    
  } catch (err) {
    console.log(`[Intro] Could not launch video: ${err}`);
  }

  return { pid, duration };
}

/**
 * Update state file with intro status
 */
export function notifyIntroPlaying(agent: AIAgent, pid: number | null, duration: number): void {
  const statePath = path.join(process.cwd(), 'likubuddy-state.txt');
  
  try {
    let content = existsSync(statePath) ? readFileSync(statePath, 'utf-8') : '';
    
    // Add intro notification
    const introNote = `INTRO: Playing ${agent.name} intro video for ${duration}s${pid ? ` (PID: ${pid})` : ''}\n`;
    
    // Insert after PROCESS ID line if it exists
    if (content.includes('PROCESS ID:')) {
      content = content.replace(/(PROCESS ID:[^\n]*\n)/, `$1${introNote}`);
    } else {
      content = introNote + content;
    }
    
    writeFileSync(statePath, content);
  } catch {
    // Non-critical, ignore errors
  }
}

/**
 * Main entry point: Check for AI agent and play intro if applicable
 * Returns true if intro was played (caller may want to add slight delay)
 */
export async function maybePlayIntro(): Promise<boolean> {
  const agent = detectAgent();
  
  if (!agent) {
    return false; // No AI agent detected, skip intro
  }

  console.log(`[Intro] AI Agent detected: ${agent.name}`);
  console.log(`[Intro] "${agent.tagline}"`);
  
  const { pid, duration } = playIntroVideo(agent);
  
  if (pid || duration > 0) {
    notifyIntroPlaying(agent, pid, duration);
    return true;
  }
  
  return false;
}
