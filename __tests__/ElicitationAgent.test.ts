import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ElicitationAgent, GameOutputSchema } from '../src/builder/ElicitationAgent.js';

describe('ElicitationAgent', () => {
  let agent: ElicitationAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any env vars for clean tests
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
  });

  describe('constructor', () => {
    it('should create agent without API key', () => {
      agent = new ElicitationAgent();
      expect(agent.isConfigured()).toBe(false);
    });

    it('should create agent with API key', () => {
      agent = new ElicitationAgent('test-api-key');
      expect(agent.isConfigured()).toBe(true);
    });

    it('should use GEMINI_API_KEY from environment', () => {
      process.env.GEMINI_API_KEY = 'env-test-key';
      
      agent = new ElicitationAgent();
      expect(agent.isConfigured()).toBe(true);
      
      delete process.env.GEMINI_API_KEY;
    });

    it('should return model name when configured', () => {
      agent = new ElicitationAgent('test-api-key');
      expect(agent.getModelName()).toBe('gemini-2.5-flash');
    });
  });

  describe('quickGenerate', () => {
    it('should throw informative error for hangman request (built-in game)', async () => {
      agent = new ElicitationAgent();
      
      await expect(agent.quickGenerate('hangman game')).rejects.toThrow(
        'Hangman is already available as a built-in game'
      );
    });

    it('should throw error for non-hangman without API key', async () => {
      agent = new ElicitationAgent();
      
      await expect(agent.quickGenerate('space shooter')).rejects.toThrow(
        'Gemini API key is not configured'
      );
    });

    // Skip tests that require real API calls
    it.skip('should generate game code with API key (requires real API)', async () => {
      // This test requires a real API key
      agent = new ElicitationAgent('test-api-key');
      
      const result = await agent.quickGenerate('simple puzzle game');
      
      expect(result.code).toContain('useInput');
      expect(result.gameId).toBeDefined();
      expect(result.name).toBeDefined();
    });
  });

  describe('validateGameCode', () => {
    beforeEach(() => {
      agent = new ElicitationAgent();
    });

    it('should validate valid game code', () => {
      const validCode = `
        import { Box, Text, useInput } from 'ink';
        
        const Game = ({ onExit }) => {
          useInput((input, key) => {
            if (key.escape) onExit();
          });
          return <Box><Text>Game</Text></Box>;
        };
        
        export default Game;
      `;
      
      const result = agent.validateGameCode(validCode);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing Ink import', () => {
      const invalidCode = `
        const Game = ({ onExit }) => {
          useInput((input, key) => {
            if (key.escape) onExit();
          });
          return <Box><Text>Game</Text></Box>;
        };
        
        export default Game;
      `;
      
      const result = agent.validateGameCode(invalidCode);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing Ink library import');
    });

    it('should detect missing useInput hook', () => {
      const invalidCode = `
        import { Box, Text } from 'ink';
        
        const Game = ({ onExit }) => {
          return <Box><Text>Game</Text></Box>;
        };
        
        export default Game;
      `;
      
      const result = agent.validateGameCode(invalidCode);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing useInput hook for keyboard handling');
    });

    it('should detect missing escape key handler', () => {
      const invalidCode = `
        import { Box, Text, useInput } from 'ink';
        
        const Game = ({ onExit }) => {
          useInput((input, key) => {
            if (key.return) console.log('enter');
          });
          return <Box><Text>Game</Text></Box>;
        };
        
        export default Game;
      `;
      
      const result = agent.validateGameCode(invalidCode);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing escape key handler for exit');
    });

    it('should detect missing default export', () => {
      const invalidCode = `
        import { Box, Text, useInput } from 'ink';
        
        const Game = ({ onExit }) => {
          useInput((input, key) => {
            if (key.escape) onExit();
          });
          return <Box><Text>Game</Text></Box>;
        };
      `;
      
      const result = agent.validateGameCode(invalidCode);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing default export');
    });
  });

  describe('GameOutputSchema', () => {
    it('should validate correct game output', () => {
      const validOutput = {
        code: 'const Game = () => {};',
        metadata: {
          id: 'test-game',
          name: 'Test Game',
          difficultyLevels: true
        }
      };
      
      const result = GameOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid game output', () => {
      const invalidOutput = {
        code: 123, // Should be string
        metadata: {}
      };
      
      const result = GameOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });
  });
});
