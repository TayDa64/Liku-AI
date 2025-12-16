/**
 * Query Handler System for Liku-AI WebSocket API
 * 
 * Implements Phase 2.3 query handlers for AI agents to request:
 * - gameState: Current game state
 * - possibleActions: Valid actions in current state
 * - history: Recent state history for training
 * - stats: Player statistics from database
 * - leaderboard: High scores
 * 
 * Features:
 * - Query result caching for performance
 * - Query subscriptions (continuous updates)
 * - Extensible handler registry
 * 
 * @see https://github.com/websockets/ws - WebSocket library
 * @see docs/WEBSOCKET_PROTOCOL.md - Protocol specification
 */

import { stateManager, type UnifiedGameState } from './state.js';
import { db } from '../services/DatabaseService.js';

/**
 * Query result with metadata
 */
export interface QueryResult {
  success: boolean;
  data: unknown;
  cached: boolean;
  timestamp: number;
  query: string;
}

/**
 * Query handler function type
 */
type QueryHandler = (params?: Record<string, unknown>) => Promise<QueryResult> | QueryResult;

/**
 * Cache entry with expiration
 */
interface CacheEntry {
  result: QueryResult;
  expiresAt: number;
}

/**
 * Query subscription callback
 */
type SubscriptionCallback = (result: QueryResult) => void;

/**
 * QueryManager - Handles all query requests from AI clients
 * 
 * Provides a unified interface for querying game state, player stats,
 * and other game data with optional caching and subscriptions.
 */
export class QueryManager {
  private handlers: Map<string, QueryHandler> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private subscriptions: Map<string, Set<SubscriptionCallback>> = new Map();
  private cacheEnabled = true;
  private defaultCacheTTL = 1000; // 1 second default cache

  constructor() {
    this.registerBuiltinHandlers();
  }

  /**
   * Register built-in query handlers
   * NOTE: Query names are lowercase to match router's lowercase conversion
   */
  private registerBuiltinHandlers(): void {
    // Current game state (lowercase to match router)
    this.register('gamestate', () => {
      const state = stateManager.get();
      return {
        success: state !== null,
        data: state,
        cached: false,
        timestamp: Date.now(),
        query: 'gamestate',
      };
    });

    // Also register camelCase version for direct API calls
    this.register('gameState', () => {
      const state = stateManager.get();
      return {
        success: state !== null,
        data: state,
        cached: false,
        timestamp: Date.now(),
        query: 'gameState',
      };
    });

    // Possible actions in current state
    this.register('possibleactions', () => {
      const state = stateManager.get();
      if (!state?.game) {
        return {
          success: true,
          data: { actions: [], context: 'no_game' },
          cached: false,
          timestamp: Date.now(),
          query: 'possibleactions',
        };
      }

      const actions = this.getActionsForGame(state.game.type, state);
      return {
        success: true,
        data: { actions, context: state.game.type },
        cached: false,
        timestamp: Date.now(),
        query: 'possibleactions',
      };
    });

    // Also register camelCase version
    this.register('possibleActions', () => {
      const state = stateManager.get();
      if (!state?.game) {
        return {
          success: true,
          data: { actions: [], context: 'no_game' },
          cached: false,
          timestamp: Date.now(),
          query: 'possibleActions',
        };
      }

      const actions = this.getActionsForGame(state.game.type, state);
      return {
        success: true,
        data: { actions, context: state.game.type },
        cached: false,
        timestamp: Date.now(),
        query: 'possibleActions',
      };
    });

    // State history for training/replay
    this.register('history', (params) => {
      const limit = (params?.limit as number) || 50;
      const history = stateManager.getHistory(limit);
      return {
        success: true,
        data: { 
          states: history,
          count: history.length,
          maxAvailable: stateManager.getStats().historySize,
        },
        cached: false,
        timestamp: Date.now(),
        query: 'history',
      };
    });

    // Player statistics from database
    this.register('stats', async () => {
      try {
        const stats = await db.getStats();
        return {
          success: true,
          data: stats,
          cached: false,
          timestamp: Date.now(),
          query: 'stats',
        };
      } catch (err) {
        return {
          success: false,
          data: { error: 'Failed to fetch stats' },
          cached: false,
          timestamp: Date.now(),
          query: 'stats',
        };
      }
    });

    // Leaderboard
    this.register('leaderboard', async (params) => {
      try {
        const game = (params?.game as string) || 'snake';
        const limit = (params?.limit as number) || 10;
        const leaderboard = await db.getLeaderboard(game, limit);
        return {
          success: true,
          data: { game, entries: leaderboard },
          cached: false,
          timestamp: Date.now(),
          query: 'leaderboard',
        };
      } catch (err) {
        return {
          success: false,
          data: { error: 'Failed to fetch leaderboard' },
          cached: false,
          timestamp: Date.now(),
          query: 'leaderboard',
        };
      }
    });

    // Server info
    this.register('serverInfo', () => {
      return {
        success: true,
        data: {
          version: '2.0.0',
          protocol: '1.0.0',
          uptime: process.uptime(),
          capabilities: ['state', 'actions', 'queries', 'events', 'subscriptions'],
        },
        cached: true,
        timestamp: Date.now(),
        query: 'serverInfo',
      };
    });

    // State manager stats
    this.register('stateStats', () => {
      const stats = stateManager.getStats();
      return {
        success: true,
        data: stats,
        cached: false,
        timestamp: Date.now(),
        query: 'stateStats',
      };
    });
  }

  /**
   * Get available actions for a specific game type
   */
  private getActionsForGame(gameType: string, state: UnifiedGameState): Array<{
    action: string;
    available: boolean;
    description: string;
    key?: string;
  }> {
    switch (gameType) {
      case 'dino': {
        const dinoGame = state.game as { type: 'dino'; isPlaying: boolean; isGameOver: boolean };
        const inGame = dinoGame.isPlaying && !dinoGame.isGameOver;
        return [
          { action: 'jump', available: inGame, description: 'Jump over obstacles', key: 'Space' },
          { action: 'duck', available: inGame, description: 'Duck under flying obstacles', key: 'ArrowDown' },
          { action: 'stand', available: inGame, description: 'Stand up from ducking', key: 'ArrowUp' },
          { action: 'start', available: !dinoGame.isPlaying, description: 'Start the game', key: 'Enter' },
          { action: 'restart', available: dinoGame.isGameOver, description: 'Restart after game over', key: 'Enter' },
        ];
      }

      case 'snake': {
        const snakeGame = state.game as { type: 'snake'; isPlaying: boolean; isGameOver: boolean; snake?: { direction: string } };
        const inGame = snakeGame.isPlaying && !snakeGame.isGameOver;
        const dir = snakeGame.snake?.direction || 'RIGHT';
        
        return [
          { action: 'turn_up', available: inGame && dir !== 'DOWN', description: 'Turn up', key: 'ArrowUp' },
          { action: 'turn_down', available: inGame && dir !== 'UP', description: 'Turn down', key: 'ArrowDown' },
          { action: 'turn_left', available: inGame && dir !== 'RIGHT', description: 'Turn left', key: 'ArrowLeft' },
          { action: 'turn_right', available: inGame && dir !== 'LEFT', description: 'Turn right', key: 'ArrowRight' },
          { action: 'start', available: !snakeGame.isPlaying, description: 'Start the game', key: 'Enter' },
          { action: 'restart', available: snakeGame.isGameOver, description: 'Restart after game over', key: 'Enter' },
        ];
      }

      case 'tictactoe': {
        const tttGame = state.game as { 
          type: 'tictactoe'; 
          isPlaying: boolean; 
          isGameOver: boolean;
          isPlayerTurn: boolean;
          validMoves?: Array<{ row: number; col: number }>;
        };
        const canMove = tttGame.isPlaying && !tttGame.isGameOver && tttGame.isPlayerTurn;
        
        const actions: Array<{ action: string; available: boolean; description: string; key?: string }> = [
          { action: 'navigate_up', available: canMove, description: 'Move cursor up', key: 'ArrowUp' },
          { action: 'navigate_down', available: canMove, description: 'Move cursor down', key: 'ArrowDown' },
          { action: 'navigate_left', available: canMove, description: 'Move cursor left', key: 'ArrowLeft' },
          { action: 'navigate_right', available: canMove, description: 'Move cursor right', key: 'ArrowRight' },
          { action: 'place_mark', available: canMove, description: 'Place X at cursor', key: 'Enter' },
          { action: 'restart', available: tttGame.isGameOver, description: 'Play again', key: 'Enter' },
        ];

        // Add specific cell placement actions
        if (tttGame.validMoves) {
          for (const move of tttGame.validMoves) {
            actions.push({
              action: `place_${move.row}_${move.col}`,
              available: canMove,
              description: `Place X at row ${move.row + 1}, col ${move.col + 1}`,
            });
          }
        }

        return actions;
      }

      case 'menu':
        return [
          { action: 'navigate_up', available: true, description: 'Move selection up', key: 'ArrowUp' },
          { action: 'navigate_down', available: true, description: 'Move selection down', key: 'ArrowDown' },
          { action: 'select', available: true, description: 'Select current item', key: 'Enter' },
          { action: 'back', available: true, description: 'Go back', key: 'Escape' },
        ];

      default:
        return [];
    }
  }

  /**
   * Register a custom query handler
   */
  register(queryName: string, handler: QueryHandler): void {
    this.handlers.set(queryName, handler);
  }

  /**
   * Unregister a query handler
   */
  unregister(queryName: string): boolean {
    return this.handlers.delete(queryName);
  }

  /**
   * Execute a query
   */
  async execute(queryName: string, params?: Record<string, unknown>): Promise<QueryResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(queryName, params);
    if (this.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return { ...cached.result, cached: true };
      }
    }

    // Find handler
    const handler = this.handlers.get(queryName);
    if (!handler) {
      return {
        success: false,
        data: { error: `Unknown query: ${queryName}` },
        cached: false,
        timestamp: Date.now(),
        query: queryName,
      };
    }

    // Execute handler
    try {
      const result = await handler(params);
      
      // Cache result if enabled
      if (this.cacheEnabled && result.success) {
        this.cache.set(cacheKey, {
          result,
          expiresAt: Date.now() + this.defaultCacheTTL,
        });
      }

      // Notify subscribers
      this.notifySubscribers(queryName, result);

      return result;
    } catch (err) {
      return {
        success: false,
        data: { error: err instanceof Error ? err.message : 'Query execution failed' },
        cached: false,
        timestamp: Date.now(),
        query: queryName,
      };
    }
  }

  /**
   * Subscribe to query updates
   * Returns unsubscribe function
   */
  subscribe(queryName: string, callback: SubscriptionCallback): () => void {
    if (!this.subscriptions.has(queryName)) {
      this.subscriptions.set(queryName, new Set());
    }
    this.subscriptions.get(queryName)!.add(callback);

    return () => {
      const subs = this.subscriptions.get(queryName);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscriptions.delete(queryName);
        }
      }
    };
  }

  /**
   * Notify subscribers of a query result
   */
  private notifySubscribers(queryName: string, result: QueryResult): void {
    const subs = this.subscriptions.get(queryName);
    if (subs) {
      for (const callback of subs) {
        try {
          callback(result);
        } catch (err) {
          console.error(`[QueryManager] Subscriber error for ${queryName}:`, err);
        }
      }
    }
  }

  /**
   * Generate cache key from query and params
   */
  private getCacheKey(queryName: string, params?: Record<string, unknown>): string {
    if (!params || Object.keys(params).length === 0) {
      return queryName;
    }
    return `${queryName}:${JSON.stringify(params)}`;
  }

  /**
   * Clear all cached results
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Set cache enabled/disabled
   */
  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
    if (!enabled) {
      this.cache.clear();
    }
  }

  /**
   * Set default cache TTL in milliseconds
   */
  setCacheTTL(ttlMs: number): void {
    this.defaultCacheTTL = ttlMs;
  }

  /**
   * Get list of registered query names
   */
  getRegisteredQueries(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Reset manager state
   */
  reset(): void {
    this.cache.clear();
    this.subscriptions.clear();
  }
}

// Singleton instance
export const queryManager = new QueryManager();
