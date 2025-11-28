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
You are the LikuGame Engine Builder. Your goal is to write React Ink components for the LikuBuddy game platform.

GAME STRUCTURE REQUIREMENTS:
1. Games must be TypeScript React components using Ink library
2. Games must export a default component with these props:
   - onExit: () => void (callback to return to menu)
   - difficulty?: 'easy' | 'medium' | 'hard'
3. Games should use Ink components: Box, Text, useInput, useApp
4. Games can access the database through the global db service
5. Use ASCII art for graphics (no external graphics libraries)
6. Games MUST implement state logging for AI visibility using the provided helper.

GAME MANIFEST (optional export):
export const GameManifest = {
  id: 'unique-game-id',
  name: 'Game Name',
  description: 'Brief description',
  energyCost: 10, // Energy required to play
  xpReward: 20    // XP earned on completion
};

EXAMPLE GAME STRUCTURE:
\`\`\`typescript
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { logGameState } from '../../core/GameStateLogger.js'; // REQUIRED IMPORT

interface GameProps {
  onExit: () => void;
  difficulty?: 'easy' | 'medium' | 'hard';
}

const MyGame = ({ onExit, difficulty = 'medium' }: GameProps) => {
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  useInput((input, key) => {
    if (key.escape) {
      onExit();
    }
    // Handle game input
  });

  useEffect(() => {
    // Game loop logic
  }, []);

  // REQUIRED: AI State Logging
  useEffect(() => {
    const status = \`Score: \${score} | Game Over: \${gameOver}\`;
    // Create a visual representation of the game state (ASCII grid, etc.)
    const visualState = "ASCII Representation of Game Board Here"; 
    logGameState("My Game Name", status, visualState);
  }, [score, gameOver]);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan">
      <Text bold>My Game</Text>
      <Text>Score: {score}</Text>
      {gameOver && <Text color="red">Game Over!</Text>}
    </Box>
  );
};

export default MyGame;
\`\`\`

IMPORTANT:
- Output ONLY valid TypeScript code in a single code block
- Do not include explanations outside the code block
- Ensure all imports are from 'react', 'ink', and local services
- Use proper TypeScript types
- Keep games simple and focused on gameplay
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
2. Missing logGameState import and usage
3. TypeScript type errors
4. Ink component best practices
5. Game playability issues

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
    // For built-in games, bypass AI and return hardcoded implementations
    if (gameIdea.toLowerCase().includes('hangman')) {
      const gameId = 'hangman';
      const name = 'Hangman';
      const description = 'Guess the word before you run out of attempts!';
      const code = this.getHangmanCode();
      return { gameId, name, description, code };
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
          parts: [{ text: 'I understand. I will generate LikuBuddy games following the SDK contract.' }]
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
- logGameState usage for AI state logging
- TypeScript strict mode compatibility
- Proper Box/Text component usage

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

  private getHangmanCode(): string {
    return `
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { db } from '../../services/DatabaseService.js';
import { logGameState } from '../../core/GameStateLogger.js';

interface HangmanProps {
    onExit: () => void;
}

const HANGMAN_PICS = [
\`
  +---+
  |   |
      |
      |
      |
      |
=========\`,
\`
  +---+
  |   |
  O   |
      |
      |
      |
=========\`,
\`
  +---+
  |   |
  O   |
  |   |
      |
      |
=========\`,
\`
  +---+
  |   |
  O   |
 /|   |
      |
      |
=========\`,
\`
  +---+
  |   |
  O   |
 /|\  |
      |
      |
=========\`,
\`
  +---+
  |   |
  O   |
 /|\  |
 /    |
      |
=========\`,
\`
  +---+
  |   |
  O   |
 /|\  |
 / \  |
      |
=========\`
];

const Hangman: React.FC<HangmanProps> = ({ onExit }) => {
    const [word, setWord] = useState('');
    const [guessedLetters, setGuessedLetters] = useState<string[]>([]);
    const [wrongGuesses, setWrongGuesses] = useState(0);
    const [gameState, setGameState] = useState<'playing' | 'won' | 'lost'>('playing');

    const startNewGame = async () => {
        const newWord = await db.getRandomHangmanWord();
        setWord(newWord.toUpperCase());
        setGuessedLetters([]);
        setWrongGuesses(0);
        setGameState('playing');
    };

    useEffect(() => {
        startNewGame();
    }, []);

    const handleGuess = (letter: string) => {
        if (gameState !== 'playing' || guessedLetters.includes(letter)) {
            return;
        }

        setGuessedLetters(prev => [...prev, letter]);

        if (!word.includes(letter)) {
            setWrongGuesses(prev => prev + 1);
        }
    };

    useInput((input, key) => {
        if (gameState !== 'playing') {
            if (key.return) {
                startNewGame();
            } else if (key.escape) {
                onExit();
            }
            return;
        }

        if (input && /^[a-zA-Z]$/.test(input)) {
            handleGuess(input.toUpperCase());
        } else if (key.escape) {
            onExit();
        }
    });

    useEffect(() => {
        if (!word) return;

        const wordGuessed = word.split('').every(letter => guessedLetters.includes(letter));
        if (wordGuessed) {
            setGameState('won');
            db.getStats().then(stats => {
                db.updateStats({ hangman_wins: stats.hangman_wins + 1, xp: stats.xp + 25 });
            });
        } else if (wrongGuesses >= HANGMAN_PICS.length - 1) {
            setGameState('lost');
            db.getStats().then(stats => {
                db.updateStats({ hangman_losses: stats.hangman_losses + 1 });
            });
        }
    }, [guessedLetters, wrongGuesses, word]);

    // AI State Logging
    useEffect(() => {
        const displayedWord = word
            .split('')
            .map(letter => (guessedLetters.includes(letter) ? letter : '_'))
            .join(' ');
            
        const status = \`State: \${gameState} | Wrong Guesses: \${wrongGuesses}/6\`;
        const visualState = \`Word: \${displayedWord}\\nGuessed: \${guessedLetters.join(',')}\\n\${HANGMAN_PICS[wrongGuesses]}\`;
        
        logGameState("Playing Hangman", status, visualState);
    }, [word, guessedLetters, wrongGuesses, gameState]);

    const displayedWord = word
        .split('')
        .map(letter => (guessedLetters.includes(letter) ? letter : '_'))
        .join(' ');

    return (
        <Box flexDirection="column" alignItems="center">
            <Box marginBottom={1}>
                <Text bold color="yellow">H A N G M A N</Text>
            </Box>

            <Box>
                <Text>{HANGMAN_PICS[wrongGuesses]}</Text>
            </Box>

            <Box marginTop={1}>
                <Text bold fontSize={2} color="cyan">{displayedWord}</Text>
            </Box>

            <Box marginTop={1}>
                <Text>Guessed: {guessedLetters.join(', ')}</Text>
            </Box>

            {gameState === 'playing' && (
                <Box marginTop={1}>
                    <Text dimColor>Type a letter to guess. Press Esc to quit.</Text>
                </Box>
            )}

            {gameState === 'won' && (
                <Box marginTop={1} flexDirection="column" alignItems="center">
                    <Text color="green" bold>You won! (+25 XP)</Text>
                    <Text dimColor>Press Enter to play again, or Esc to exit.</Text>
                </Box>
            )}

            {gameState === 'lost' && (
                <Box marginTop={1} flexDirection="column" alignItems="center">
                    <Text color="red" bold>You lost!</Text>
                    <Text>The word was: <Text bold>{word}</Text></Text>
                    <Text dimColor>Press Enter to play again, or Esc to exit.</Text>
                </Box>
            )}
        </Box>
    );
};

export default Hangman;
    `;
  }
  }
