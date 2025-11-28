import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { z } from 'zod';

// Zod schemas for type-safe validation
export const GameMetadataSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  energyCost: z.number().optional(),
  xpReward: z.number().optional(),
  difficultyLevels: z.boolean().optional(),
});

export const GameOutputSchema = z.object({
  code: z.string().describe('Full TSX game component'),
  metadata: GameMetadataSchema,
});

export type GameOutput = z.infer<typeof GameOutputSchema>;
export type GameMetadata = z.infer<typeof GameMetadataSchema>;

// SDK Contract that teaches Gemini how to write LikuBuddy games
const LIKU_SDK_CONTEXT = `
You are the LikuGame Engine Builder. Generate React+Ink terminal games for LikuBuddy.

=== ENVIRONMENT ===
- Runtime: Node.js 20+, TypeScript strict, React 18 + Ink 5
- Output: Terminal/TTY (monospace font, 16 ANSI colors, keyboard-only)
- Imports ALLOWED: react, ink ONLY. No filesystem, no internal paths.

=== REQUIRED STRUCTURE ===
\`\`\`typescript
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

interface GameProps {
  onExit: () => void;
  difficulty?: 'easy' | 'medium' | 'hard';
}

const GameName: React.FC<GameProps> = ({ onExit, difficulty = 'medium' }) => {
  useInput((input, key) => {
    if (key.escape) { onExit(); return; }  // MANDATORY
    // Game controls...
  });
  return (/* JSX */);
};

export default GameName;
\`\`\`

=== VISUAL RULES ===

1. CELL WIDTH: Always 3+ chars → \` \${value} \` (padded)
   ❌ |1|2|3|    ✅ │ 1 │ 2 │ 3 │

2. GRID BORDERS: Use connected box-drawing chars
   ┌───┬───┐  (top)     ├───┼───┤  (middle)     └───┴───┘  (bottom)
   Single: ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼
   Double: ═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬
   Mixed:  ╥ ╨ ╫ ╤ ╧ ╪ ╞ ╡

3. CURSOR: Use backgroundColor, not just color
   ❌ <Text color={sel ? 'yellow' : 'white'}>
   ✅ <Text backgroundColor={sel ? 'blue' : undefined} color="white">

4. COLORS (semantic):
   cyan=titles/preset  green=valid/player  red=error/enemy
   yellow=instructions  magenta=hints  blue-bg=cursor  gray=borders

=== UI LAYOUT ===
\`\`\`tsx
<Box flexDirection="column" alignItems="center" padding={1}>
  <Text bold color="cyan">🎮 TITLE 🎮</Text>
  <Text dimColor>Difficulty: {difficulty}</Text>
  <Box marginY={1} />
  {/* GAME BOARD */}
  <Box marginY={1} />
  <Text>Score: <Text color="yellow" bold>{score}</Text></Text>
  <Text color="yellow">↑↓←→ Move │ ESC Exit</Text>
  <Text><Text color="green">■</Text> Player <Text color="red">■</Text> Enemy</Text>
</Box>
\`\`\`

=== INPUT HANDLING ===
\`\`\`typescript
useInput((input, key) => {
  if (key.escape) { onExit(); return; }
  if (key.upArrow) { }  if (key.downArrow) { }
  if (key.leftArrow) { }  if (key.rightArrow) { }
  if (key.return) { }  if (input === ' ') { }
  if (/^[a-zA-Z]$/.test(input)) { }  // letters
  if (/^[0-9]$/.test(input)) { }     // numbers
  if (input === 'h') { /* hint */ }
  if (input === 'r') { /* restart */ }
});
\`\`\`

=== STATE MANAGEMENT ===
- Lazy init: useState(() => generate())
- Immutable: setBoard(prev => prev.map(...))
- Timer cleanup: useEffect(() => { const t = setInterval(...); return () => clearInterval(t); }, []);

=== DIFFICULTY SCALING ===
\`\`\`typescript
const config = { easy: {speed:300}, medium: {speed:150}, hard: {speed:75} }[difficulty];
\`\`\`

=== GAME MANIFEST (optional) ===
\`\`\`typescript
export const GameManifest = {
  id: 'game-id', name: 'Name', description: 'Desc',
  energyCost: 10, xpReward: 20
};
\`\`\`

=== OUTPUT FORMAT ===
Respond with ONLY TypeScript code in a single \`\`\`typescript code block.
No explanations. No multiple blocks. Complete, working code.
`;

export interface ElicitationSession {
  sessionId: string;
  history: Array<{ role: 'user' | 'model'; content: string }>;
  gameIdea: string;
}

// Supported Gemini models with fallback chain
const GEMINI_MODELS = [
  'gemini-2.0-flash',           // Latest 2025 model
  'gemini-1.5-pro',             // Fallback
  'gemini-1.5-flash',           // Fast fallback
] as const;

export class ElicitationAgent {
  private genAI?: GoogleGenerativeAI;
  private model?: GenerativeModel;
  private modelName: string = '';

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (key) {
      this.genAI = new GoogleGenerativeAI(key);
      // Use env override or default to latest model
      const preferredModel = process.env.GEMINI_MODEL || GEMINI_MODELS[0];
      this.modelName = preferredModel;
      this.model = this.genAI.getGenerativeModel({ 
        model: preferredModel,
        generationConfig: {
          temperature: 0.2, // Low for code determinism
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      });
    }
  }

  /**
   * Get the current model name being used
   */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Check if the agent is properly configured
   */
  isConfigured(): boolean {
    return !!this.model;
  }

  /**
   * Start an elicitation session to gather game requirements
   */
  async startElicitationSession(userIdea: string): Promise<{ questions: string; sessionId: string }> {
    if (!this.model) {
      throw new Error('Gemini API key is not configured.');
    }

    const sessionId = `session_${Date.now()}`;
    
    const chat = this.model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: LIKU_SDK_CONTEXT }]
        },
        {
          role: 'model',
          parts: [{ text: 'I understand. I will help design and generate LikuBuddy games following the SDK contract.' }]
        }
      ]
    });

    const prompt = `The user wants to create this game: "${userIdea}". 
    
Ask 3-5 clarifying questions about:
1. Core game mechanics (how does the player interact?)
2. Win/lose conditions (what defines success?)
3. Difficulty progression (how does it get harder?)
4. Scoring system (how are points earned?)
5. Visual style (what should it look like in ASCII?)

Keep questions concise and specific. Number them.`;

    const result = await chat.sendMessage(prompt);
    const questions = result.response.text();

    return { questions, sessionId };
  }

  /**
   * Process user answers and generate the game code with self-critique
   */
  async generateGameFromAnswers(
    gameIdea: string,
    answers: string
  ): Promise<{ code: string; gameId: string; name: string; description: string }> {
    if (!this.model) {
      throw new Error('Gemini API key is not configured.');
    }

    const chat = this.model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: LIKU_SDK_CONTEXT }]
        },
        {
          role: 'model',
          parts: [{ text: 'I understand. I will help design and generate LikuBuddy games following the SDK contract.' }]
        }
      ]
    });

    const prompt = `Generate a complete, working LikuBuddy game based on:
    
GAME IDEA: ${gameIdea}
USER REQUIREMENTS: ${answers}

Think step-by-step before coding:
1. First, identify the core game loop
2. Plan the state variables needed
3. Design the input handling
4. Plan the ASCII visual representation

Generate the complete TypeScript code including:
- All necessary imports
- Proper TypeScript interfaces and types
- Game logic and state management
- Input handling with useInput
- ASCII rendering with Ink components
- GameManifest export with appropriate energyCost and xpReward

Respond with ONLY the TypeScript code wrapped in a code block. No explanations.`;

    const result = await chat.sendMessage(prompt);
    let responseText = result.response.text();

    // Self-critique: Best practice for improved code quality
    const critiquePrompt = `Review the generated code for:
1. Missing useInput escape handler for onExit
2. TypeScript type errors
3. Ink component best practices
4. Game playability issues
5. REMOVE any imports from internal paths like '../../core/' or '../../services/' - games must be self-contained

If issues found, output corrected code. Otherwise, output the same code.
Respond with ONLY the TypeScript code wrapped in a code block.

Original code:
${responseText}`;

    const critiqueResult = await chat.sendMessage(critiquePrompt);
    responseText = critiqueResult.response.text();

    // Extract code from markdown code blocks
    const codeBlockMatch = responseText.match(/```(?:typescript|tsx?)?\n([\s\S]*?)```/);
    const code = codeBlockMatch ? codeBlockMatch[1] : responseText;

    // Extract game metadata from the code
    const gameId = this.extractGameId(code, gameIdea);
    const name = this.extractGameName(code, gameIdea);
    const description = gameIdea.substring(0, 200);

    return { code, gameId, name, description };
  }

  /**
   * Quick generate - combines elicitation and generation in one step
   */
  async quickGenerate(
    gameIdea: string
  ): Promise<{ code: string; gameId: string; name: string; description: string }> {
    // For built-in games, inform user they're already available
    if (gameIdea.toLowerCase().includes('hangman')) {
      throw new Error('Hangman is already available as a built-in game! Go to "Let\'s Play" to play it.');
    }

    // If not a built-in game and AI is not configured, throw error
    if (!this.model) {
      throw new Error('Gemini API key is not configured. Cannot generate this game.');
    }
    
    const chat = this.model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: LIKU_SDK_CONTEXT }]
        },
        {
          role: 'model',
          parts: [{ text: 'I understand. I will generate LikuBuddy games following the SDK contract. I will only import from react and ink, no internal paths.' }]
        }
      ]
    });

    const prompt = `Generate a complete, working LikuBuddy game for: "${gameIdea}"

Think step-by-step before coding:
1. Identify the core mechanics and game loop
2. Plan necessary state variables
3. Design input handling (arrows, keys, escape)
4. Plan ASCII visual output

Make reasonable assumptions about mechanics, difficulty, and scoring.
Generate complete TypeScript code with proper types, input handling, and ASCII rendering.
Include GameManifest export.

Respond with ONLY the TypeScript code wrapped in a code block.`;

    const result = await chat.sendMessage(prompt);
    let responseText = result.response.text();

    // Self-critique pass for code quality
    const critiquePrompt = `Critique this code for Ink 5.x/SDK compliance and playability. 
Check for:
- Proper useInput with escape → onExit
- TypeScript strict mode compatibility
- Proper Box/Text component usage
- REMOVE any imports from '../../core/' or '../../services/' paths - games must be self-contained
- Only allow imports from 'react' and 'ink'

If issues found, output corrected code. Otherwise, output the same code.
Respond with ONLY the TypeScript code wrapped in a code block.

${responseText}`;

    const critiqueResult = await chat.sendMessage(critiquePrompt);
    responseText = critiqueResult.response.text();

    // Extract code from markdown code blocks
    const codeBlockMatch = responseText.match(/```(?:typescript|tsx?)?\n([\s\S]*?)```/);
    const code = codeBlockMatch ? codeBlockMatch[1] : responseText;

    const gameId = this.extractGameId(code, gameIdea);
    const name = this.extractGameName(code, gameIdea);
    const description = gameIdea.substring(0, 200);

    return { code, gameId, name, description };
  }

  /**
   * Validate generated game code structure
   */
  validateGameCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for required imports
    if (!code.includes("from 'ink'") && !code.includes('from "ink"')) {
      errors.push('Missing Ink library import');
    }

    // Check for useInput handler
    if (!code.includes('useInput')) {
      errors.push('Missing useInput hook for keyboard handling');
    }

    // Check for onExit prop usage
    if (!code.includes('onExit')) {
      errors.push('Missing onExit prop or handler');
    }

    // Check for escape key handling
    if (!code.includes('key.escape') && !code.includes("key.escape")) {
      errors.push('Missing escape key handler for exit');
    }

    // Check for default export
    if (!code.includes('export default')) {
      errors.push('Missing default export');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private extractGameId(code: string, fallback: string): string {
    // Try to extract from GameManifest
    const idMatch = code.match(/id:\s*['"]([^'"]+)['"]/);
    if (idMatch) return idMatch[1];

    // Generate from game name
    return fallback
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }

  private extractGameName(code: string, fallback: string): string {
    // Try to extract from GameManifest
    const nameMatch = code.match(/name:\s*['"]([^'"]+)['"]/);
    if (nameMatch) return nameMatch[1];

    // Try to extract from component name
    const componentMatch = code.match(/(?:const|function)\s+(\w+)/);
    if (componentMatch) return componentMatch[1];

    // Use first few words of fallback
    return fallback.split(' ').slice(0, 4).join(' ');
  }
}
