import { GoogleGenerativeAI } from '@google/generative-ai';

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
- Ensure all imports are from 'react' and 'ink'
- Use proper TypeScript types
- Keep games simple and focused on gameplay
`;

export interface ElicitationSession {
  sessionId: string;
  history: Array<{ role: 'user' | 'model'; content: string }>;
  gameIdea: string;
}

export class ElicitationAgent {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey?: string) {
    // Try to get API key from environment or parameter
    const key = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    
    if (!key) {
      throw new Error('Gemini API key is required. Set GEMINI_API_KEY or GOOGLE_AI_API_KEY environment variable.');
    }

    this.genAI = new GoogleGenerativeAI(key);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  }

  /**
   * Start an elicitation session to gather game requirements
   */
  async startElicitationSession(userIdea: string): Promise<{ questions: string; sessionId: string }> {
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
   * Process user answers and generate the game code
   */
  async generateGameFromAnswers(
    gameIdea: string,
    answers: string
  ): Promise<{ code: string; gameId: string; name: string; description: string }> {
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

Make reasonable assumptions about mechanics, difficulty, and scoring.
Generate complete TypeScript code with proper types, input handling, and ASCII rendering.
Include GameManifest export.

Respond with ONLY the TypeScript code wrapped in a code block.`;

    const result = await chat.sendMessage(prompt);
    let responseText = result.response.text();

    // Extract code from markdown code blocks
    const codeBlockMatch = responseText.match(/```(?:typescript|tsx?)?\n([\s\S]*?)```/);
    const code = codeBlockMatch ? codeBlockMatch[1] : responseText;

    const gameId = this.extractGameId(code, gameIdea);
    const name = this.extractGameName(code, gameIdea);
    const description = gameIdea.substring(0, 200);

    return { code, gameId, name, description };
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
