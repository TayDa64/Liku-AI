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
 * 
 * Supported Agent Aliases (case-insensitive):
 *   Claude/Anthropic: opus-4.5, claude-opus-4.5, claude-4.5, claude, anthropic, opus, sonnet-4
 *   Gemini/Google:    gemini-3, gemini-2.5-flash, gemini-flash, gemini, google, bard
 *   ChatGPT/OpenAI:   chatgpt-5.1, gpt-5.1, gpt-5, chatgpt, openai, gpt-4o, gpt4o
 *   Grok/xAI:         grok-4.1, grok-4, grok, xai, x-ai
 * 
 * Signal File Format (v2 - with timestamp):
 *   Line 1: agent ID (e.g., "gemini")
 *   Line 2: timestamp in ms (e.g., "1704067200000")
 *   Signal files older than 30 seconds are considered stale.
 */

import { spawn, exec, execSync } from 'child_process';
import { platform } from 'os';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Signal file staleness threshold (30 seconds)
const SIGNAL_FILE_TTL_MS = 30 * 1000;

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

// =============================================================================
// Agent Alias System - Maps various agent identifiers to canonical IDs
// =============================================================================

/**
 * Comprehensive alias mapping for flexible agent detection.
 * All keys should be lowercase for case-insensitive matching.
 */
const AGENT_ALIASES: Record<string, string> = {
  // Claude / Anthropic - maps to opus-4.5
  'opus-4.5': 'opus-4.5',
  'opus-4': 'opus-4.5',
  'opus4.5': 'opus-4.5',
  'opus45': 'opus-4.5',
  'opus': 'opus-4.5',
  'claude-opus-4.5': 'opus-4.5',
  'claude-opus-4': 'opus-4.5',
  'claude-opus': 'opus-4.5',
  'claude-4.5': 'opus-4.5',
  'claude-4': 'opus-4.5',
  'claude4.5': 'opus-4.5',
  'claude4': 'opus-4.5',
  'claude': 'opus-4.5',
  'anthropic': 'opus-4.5',
  'sonnet-4': 'opus-4.5',
  'sonnet4': 'opus-4.5',
  'sonnet': 'opus-4.5',
  'haiku': 'opus-4.5',
  
  // Gemini / Google - maps to gemini-3
  'gemini-3': 'gemini-3',
  'gemini3': 'gemini-3',
  'gemini-2.5-flash': 'gemini-3',
  'gemini-2.5': 'gemini-3',
  'gemini2.5': 'gemini-3',
  'gemini-2.0-flash': 'gemini-3',
  'gemini-2.0': 'gemini-3',
  'gemini2.0': 'gemini-3',
  'gemini-flash': 'gemini-3',
  'gemini-pro': 'gemini-3',
  'gemini': 'gemini-3',
  'google': 'gemini-3',
  'google-ai': 'gemini-3',
  'bard': 'gemini-3',
  
  // ChatGPT / OpenAI - maps to chatgpt-5.1
  'chatgpt-5.1': 'chatgpt-5.1',
  'chatgpt-5': 'chatgpt-5.1',
  'chatgpt5.1': 'chatgpt-5.1',
  'chatgpt5': 'chatgpt-5.1',
  'chatgpt': 'chatgpt-5.1',
  'gpt-5.1': 'chatgpt-5.1',
  'gpt-5': 'chatgpt-5.1',
  'gpt5.1': 'chatgpt-5.1',
  'gpt5': 'chatgpt-5.1',
  'gpt-4o': 'chatgpt-5.1',
  'gpt4o': 'chatgpt-5.1',
  'gpt-4': 'chatgpt-5.1',
  'gpt4': 'chatgpt-5.1',
  'gpt': 'chatgpt-5.1',
  'openai': 'chatgpt-5.1',
  'open-ai': 'chatgpt-5.1',
  'o1': 'chatgpt-5.1',
  'o1-preview': 'chatgpt-5.1',
  'o1-mini': 'chatgpt-5.1',
  
  // Grok / xAI - maps to grok-4.1
  'grok-4.1': 'grok-4.1',
  'grok-4': 'grok-4.1',
  'grok4.1': 'grok-4.1',
  'grok4': 'grok-4.1',
  'grok-3': 'grok-4.1',
  'grok3': 'grok-4.1',
  'grok': 'grok-4.1',
  'xai': 'grok-4.1',
  'x-ai': 'grok-4.1',
  'x.ai': 'grok-4.1',
  'elon': 'grok-4.1',  // Easter egg
};

/**
 * Pattern-based matchers for fuzzy agent detection.
 * Order matters - more specific patterns should come first.
 */
const AGENT_PATTERNS: Array<{ pattern: RegExp; agentId: string }> = [
  // Claude/Anthropic patterns
  { pattern: /\bopus\b/i, agentId: 'opus-4.5' },
  { pattern: /\bclaude\b/i, agentId: 'opus-4.5' },
  { pattern: /\banthrop/i, agentId: 'opus-4.5' },
  { pattern: /\bsonnet\b/i, agentId: 'opus-4.5' },
  
  // Gemini/Google patterns
  { pattern: /\bgemini\b/i, agentId: 'gemini-3' },
  { pattern: /\bgoogle[_-]?ai\b/i, agentId: 'gemini-3' },
  { pattern: /\bbard\b/i, agentId: 'gemini-3' },
  
  // ChatGPT/OpenAI patterns
  { pattern: /\bchatgpt\b/i, agentId: 'chatgpt-5.1' },
  { pattern: /\bgpt[_-]?\d/i, agentId: 'chatgpt-5.1' },
  { pattern: /\bopenai\b/i, agentId: 'chatgpt-5.1' },
  { pattern: /\bo1[_-]?(preview|mini)?\b/i, agentId: 'chatgpt-5.1' },
  
  // Grok/xAI patterns
  { pattern: /\bgrok\b/i, agentId: 'grok-4.1' },
  { pattern: /\bx\.?ai\b/i, agentId: 'grok-4.1' },
];

/**
 * Resolve an agent identifier to a canonical agent ID.
 * Supports exact matches, aliases, and fuzzy pattern matching.
 * 
 * @param input - The raw agent identifier (case-insensitive)
 * @returns The canonical agent ID or null if no match
 */
export function resolveAgentId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  
  // Normalize: trim, lowercase, remove extra whitespace
  const normalized = input.trim().toLowerCase().replace(/\s+/g, '-');
  
  // 1. Direct lookup in canonical AGENTS
  if (AGENTS[normalized]) {
    return normalized;
  }
  
  // 2. Alias lookup
  if (AGENT_ALIASES[normalized]) {
    return AGENT_ALIASES[normalized];
  }
  
  // 3. Pattern matching for fuzzy detection
  for (const { pattern, agentId } of AGENT_PATTERNS) {
    if (pattern.test(input)) {
      return agentId;
    }
  }
  
  return null;
}

/**
 * Get all supported agent aliases for documentation
 */
export function getSupportedAliases(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  
  for (const [alias, canonicalId] of Object.entries(AGENT_ALIASES)) {
    if (!result[canonicalId]) {
      result[canonicalId] = [];
    }
    result[canonicalId].push(alias);
  }
  
  return result;
}

/**
 * Set the current agent signal file.
 * AI clients should call this before launching the game to identify themselves.
 * The signal file includes a timestamp and expires after SIGNAL_FILE_TTL_MS.
 * 
 * @param agentId - Agent identifier (supports aliases)
 * @returns true if signal file was written successfully
 */
export function setAgentSignal(agentId: string): boolean {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const likuDir = path.join(homeDir, '.liku-ai');
  const signalFile = path.join(likuDir, 'current-agent.txt');
  
  try {
    // Ensure .liku-ai directory exists
    if (!existsSync(likuDir)) {
      mkdirSync(likuDir, { recursive: true });
    }
    
    // Write agent ID and timestamp
    const content = `${agentId}\n${Date.now()}`;
    writeFileSync(signalFile, content, 'utf-8');
    console.log(`[Intro] Agent signal set: ${agentId}`);
    return true;
  } catch (err) {
    console.log(`[Intro] Failed to set agent signal: ${err}`);
    return false;
  }
}

/**
 * Clear the agent signal file.
 * Called on app exit to prevent stale agent detection.
 */
export function clearAgentSignal(): void {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const signalFile = path.join(homeDir, '.liku-ai', 'current-agent.txt');
  
  try {
    if (existsSync(signalFile)) {
      unlinkSync(signalFile);
      console.log(`[Intro] Agent signal cleared`);
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Detect which AI agent is playing.
 * Checks in priority order:
 *   1. LIKU_AI_PLAYER environment variable
 *   2. --agent=<id> command line argument
 *   3. Signal file at ~/.liku-ai/current-agent.txt
 * 
 * All inputs are resolved through the alias system for flexible matching.
 */
export function detectAgent(): AIAgent | null {
  // Helper to resolve and return agent
  const tryResolve = (input: string | undefined): AIAgent | null => {
    if (!input) return null;
    const canonicalId = resolveAgentId(input);
    if (canonicalId && AGENTS[canonicalId]) {
      return AGENTS[canonicalId];
    }
    return null;
  };

  // 1. Check environment variable first (highest priority)
  const envAgent = process.env.LIKU_AI_PLAYER;
  const fromEnv = tryResolve(envAgent);
  if (fromEnv) {
    console.log(`[Intro] Agent detected from env LIKU_AI_PLAYER="${envAgent}" → ${fromEnv.id}`);
    return fromEnv;
  }

  // 2. Check command line args
  const agentArg = process.argv.find(arg => arg.startsWith('--agent='));
  if (agentArg) {
    const agentInput = agentArg.split('=')[1];
    const fromArg = tryResolve(agentInput);
    if (fromArg) {
      console.log(`[Intro] Agent detected from --agent="${agentInput}" → ${fromArg.id}`);
      return fromArg;
    }
  }

  // 3. Check signal file (for cross-terminal scenarios)
  // Signal file format v2: Line 1 = agent ID, Line 2 = timestamp (ms)
  // Signal files older than SIGNAL_FILE_TTL_MS are considered stale
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const signalFile = path.join(homeDir, '.liku-ai', 'current-agent.txt');
  if (existsSync(signalFile)) {
    try {
      const fileContent = readFileSync(signalFile, 'utf-8').trim();
      const lines = fileContent.split('\n');
      const agentId = lines[0]?.trim();
      const timestamp = parseInt(lines[1]?.trim() || '0', 10);
      
      // Check if signal file is stale (older than TTL or no timestamp)
      const now = Date.now();
      const age = now - timestamp;
      
      if (!timestamp || age > SIGNAL_FILE_TTL_MS) {
        // Stale signal file - delete it and ignore
        console.log(`[Intro] Signal file is stale (age: ${Math.round(age / 1000)}s), ignoring`);
        try {
          unlinkSync(signalFile);
        } catch {
          // Ignore delete errors
        }
      } else {
        // Fresh signal file - use it
        const fromFile = tryResolve(agentId);
        if (fromFile) {
          console.log(`[Intro] Agent detected from signal file "${agentId}" → ${fromFile.id}`);
          return fromFile;
        } else {
          console.log(`[Intro] Unknown agent in signal file: "${agentId}"`);
        }
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
