import { db } from '../services/DatabaseService.js';

/**
 * Database tools for Gemini CLI integration
 * Provides read-only access to LikuBuddy's game database
 */

export interface DbToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Query LikuBuddy stats - safe, read-only SQL access for AI
 */
export const queryLikuStats = async (query: string): Promise<DbToolResult> => {
  try {
    // Security check: only SELECT queries allowed
    const trimmedQuery = query.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT')) {
      return {
        success: false,
        error: 'Only SELECT queries are allowed for security. This is read-only access.'
      };
    }

    // Execute the safe query
    const results = await db.executeSafeQuery(query);

    return {
      success: true,
      data: results
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Get high scores for a specific game
 */
export const getGameHighScores = async (gameId: string, limit: number = 10): Promise<DbToolResult> => {
  try {
    const leaderboard = await db.getLeaderboard(gameId, limit);
    return {
      success: true,
      data: leaderboard
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Get current player stats
 */
export const getPlayerStats = async (): Promise<DbToolResult> => {
  try {
    const stats = await db.getStats();
    return {
      success: true,
      data: stats
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Get pro tokens balance
 */
export const getProTokensBalance = async (userId: string = 'me'): Promise<DbToolResult> => {
  try {
    const tokens = await db.getProTokens(userId);
    return {
      success: true,
      data: tokens
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * List all registered games
 */
export const listRegisteredGames = async (): Promise<DbToolResult> => {
  try {
    const games = await db.getRegisteredGames();
    return {
      success: true,
      data: games
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Get database schema information (for AI to understand structure)
 */
export const getDatabaseSchema = async (): Promise<DbToolResult> => {
  try {
    const schema = await db.executeSafeQuery(`
      SELECT name, sql 
      FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);
    
    return {
      success: true,
      data: schema
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// Tool definitions for Gemini CLI extension
export const dbToolDefinitions = [
  {
    name: 'query_liku_stats',
    description: 'Query the LikuBuddy game database for high scores, player stats, and token economics. Read-only access via SELECT queries.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL SELECT query to execute (read-only). Example: SELECT * FROM player_stats WHERE id = 1'
        }
      },
      required: ['query']
    },
    execute: queryLikuStats
  },
  {
    name: 'get_game_leaderboard',
    description: 'Get the top scores for a specific game in LikuBuddy',
    parameters: {
      type: 'object',
      properties: {
        gameId: {
          type: 'string',
          description: 'The unique identifier of the game'
        },
        limit: {
          type: 'number',
          description: 'Number of top scores to return (default: 10)'
        }
      },
      required: ['gameId']
    },
    execute: async (params: { gameId: string; limit?: number }) => 
      getGameHighScores(params.gameId, params.limit)
  },
  {
    name: 'get_liku_player_stats',
    description: 'Get current player statistics including level, XP, energy, hunger, and happiness',
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: getPlayerStats
  },
  {
    name: 'get_liku_tokens',
    description: 'Get the current Pro Tokens balance for the player',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID (default: "me")'
        }
      }
    },
    execute: async (params: { userId?: string }) => 
      getProTokensBalance(params.userId)
  },
  {
    name: 'list_liku_games',
    description: 'List all registered games in LikuBuddy, including community-generated games',
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: listRegisteredGames
  }
];
