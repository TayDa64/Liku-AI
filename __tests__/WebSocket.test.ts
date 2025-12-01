/**
 * WebSocket Module Tests
 * 
 * Comprehensive tests for the Liku-AI WebSocket system including:
 * - Server startup/shutdown
 * - Client connection/disconnection
 * - Command routing with rate limiting
 * - Structured state management
 * - Query system (Phase 2.3)
 * - Event streaming (Phase 2.4)
 * - Agent identity system (Phase 3.1)
 * - Turn management (Phase 3.2)
 * - Protocol validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  LikuWebSocketServer,
  CommandRouter,
  stateManager,
  createSnakeState,
  createDinoState,
  createTicTacToeState,
  PROTOCOL_VERSION,
  ErrorCode,
  validateMessage,
  createError,
  GameEventType,
  // Query system
  QueryManager,
  queryManager,
  // Event system
  EventManager,
  eventManager,
  emitGameStart,
  emitScoreUpdate,
  // Agent system
  AgentManager,
  AgentRole,
  // Turn system
  TurnManager,
  TurnMode,
  CommandPriority,
  // Coordination system
  CoordinationManager,
  CoordinationMessageType,
  // Session system
  GameSessionManager,
  gameSessionManager,
} from '../src/websocket/index.js';

describe('WebSocket Protocol', () => {
  describe('Protocol Version', () => {
    it('should have a valid protocol version', () => {
      expect(PROTOCOL_VERSION).toBe('1.0.0');
      expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('validateMessage', () => {
    it('should validate a valid key command', () => {
      const result = validateMessage({
        type: 'key',
        payload: { key: 'up' },
        requestId: 'test-1',
      });
      expect(result.valid).toBe(true);
    });

    it('should validate a valid action command', () => {
      const result = validateMessage({
        type: 'action',
        payload: { action: 'jump' },
      });
      expect(result.valid).toBe(true);
    });

    it('should validate a valid query command', () => {
      const result = validateMessage({
        type: 'query',
        payload: { query: 'gameState' },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject null message', () => {
      const result = validateMessage(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an object');
    });

    it('should reject message without type', () => {
      const result = validateMessage({ payload: {} });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('type field');
    });

    it('should reject key command without key', () => {
      const result = validateMessage({
        type: 'key',
        payload: {},
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('payload.key');
    });

    it('should reject invalid message type', () => {
      const result = validateMessage({
        type: 'invalid',
        payload: {},
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid message type');
    });
  });

  describe('createError', () => {
    it('should create error with code and message', () => {
      const error = createError(ErrorCode.RATE_LIMITED);
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.message).toBe('Too many requests - slow down');
    });

    it('should include details when provided', () => {
      const error = createError(ErrorCode.INVALID_KEY, 'Key xyz not recognized');
      expect(error.details).toBe('Key xyz not recognized');
    });
  });
});

describe('CommandRouter', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = new CommandRouter({
      maxCommandsPerSecond: 10,
      maxBurstCommands: 3,
      cooldownMs: 50,
      banDurationMs: 1000,
      maxBansBeforePermanent: 2,
    });
  });

  describe('Key Commands', () => {
    it('should route valid key commands', () => {
      const keyHandler = vi.fn();
      router.on('key', keyHandler);

      const response = router.route('client-1', {
        type: 'key',
        payload: { key: 'up' },
        requestId: 'req-1',
      });

      expect(response.type).toBe('ack');
      expect(keyHandler).toHaveBeenCalledWith('up', 'client-1');
    });

    it('should reject invalid keys', () => {
      const response = router.route('client-1', {
        type: 'key',
        payload: { key: 'invalid-key!@#' },
      });

      expect(response.type).toBe('error');
    });

    it('should sanitize keys to lowercase', () => {
      const keyHandler = vi.fn();
      router.on('key', keyHandler);

      router.route('client-1', {
        type: 'key',
        payload: { key: 'UP' },
      });

      expect(keyHandler).toHaveBeenCalledWith('up', 'client-1');
    });
  });

  describe('Action Commands', () => {
    it('should route valid action commands', () => {
      const actionHandler = vi.fn();
      const keyHandler = vi.fn();
      router.on('action', actionHandler);
      router.on('key', keyHandler);

      const response = router.route('client-1', {
        type: 'action',
        payload: { action: 'jump' },
      });

      expect(response.type).toBe('ack');
      expect(actionHandler).toHaveBeenCalledWith('jump', 'client-1');
      expect(keyHandler).toHaveBeenCalledWith('space', 'client-1');
    });

    it('should reject invalid actions', () => {
      const response = router.route('client-1', {
        type: 'action',
        payload: { action: 'fly_to_moon' },
      });

      expect(response.type).toBe('error');
    });
  });

  describe('Query Commands', () => {
    it('should handle serverinfo query', () => {
      const response = router.route('client-1', {
        type: 'query',
        payload: { query: 'serverinfo' },
      });

      expect(response.type).toBe('result');
      expect((response.data as { version: string }).version).toBe('2.0.0');
    });

    it('should handle possibleactions query', () => {
      const response = router.route('client-1', {
        type: 'query',
        payload: { query: 'possibleactions' },
      });

      expect(response.type).toBe('result');
      const data = response.data as { actions: string[]; keys: string[] };
      expect(data.actions).toContain('jump');
      expect(data.keys).toContain('space');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce max commands per second', async () => {
      // Send 11 commands in quick succession (limit is 10)
      for (let i = 0; i < 10; i++) {
        router.route('client-1', {
          type: 'key',
          payload: { key: 'up' },
        });
        await new Promise(r => setTimeout(r, 10)); // Avoid burst limit
      }

      // 11th should be rate limited
      const response = router.route('client-1', {
        type: 'key',
        payload: { key: 'up' },
      });

      expect(response.type).toBe('error');
    });

    it('should enforce burst limit', async () => {
      // Send commands too fast
      for (let i = 0; i < 5; i++) {
        router.route('client-1', {
          type: 'key',
          payload: { key: 'up' },
        });
      }

      // Should be banned for burst
      const response = router.route('client-1', {
        type: 'key',
        payload: { key: 'up' },
      });

      expect(response.type).toBe('error');
    });

    it('should track stats correctly', () => {
      for (let i = 0; i < 5; i++) {
        router.route(`client-${i}`, {
          type: 'key',
          payload: { key: 'up' },
        });
      }

      const stats = router.getStats();
      expect(stats.totalClients).toBe(5);
      expect(stats.recentCommands).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Static Methods', () => {
    it('should return valid actions list', () => {
      const actions = CommandRouter.getValidActions();
      expect(actions).toContain('jump');
      expect(actions).toContain('turn_left');
      expect(actions).toContain('start');
    });

    it('should return valid keys list', () => {
      const keys = CommandRouter.getValidKeys();
      expect(keys).toContain('up');
      expect(keys).toContain('space');
      expect(keys).toContain('enter');
    });

    it('should return action-key mapping', () => {
      const mapping = CommandRouter.getActionKeyMapping();
      expect(mapping.jump).toContain('space');
      expect(mapping.turn_left).toContain('left');
    });
  });
});

describe('StateManager', () => {
  beforeEach(() => {
    stateManager.reset();
  });

  describe('State Updates', () => {
    it('should update and return current state', () => {
      const state = stateManager.update({
        screen: 'Playing Snake',
        status: 'Score: 100',
      });

      expect(state.screen).toBe('Playing Snake');
      expect(state.status).toBe('Score: 100');
      expect(state.timestamp).toBeGreaterThan(0);
      expect(state.pid).toBe(process.pid);
    });

    it('should maintain state history', () => {
      stateManager.update({ screen: 'Screen 1', status: 'Status 1' });
      stateManager.update({ screen: 'Screen 2', status: 'Status 2' });
      stateManager.update({ screen: 'Screen 3', status: 'Status 3' });

      const history = stateManager.getHistory();
      expect(history.length).toBe(3);
      expect(history[0].screen).toBe('Screen 1');
      expect(history[2].screen).toBe('Screen 3');
    });

    it('should limit history to specified count', () => {
      for (let i = 0; i < 10; i++) {
        stateManager.update({ screen: `Screen ${i}`, status: 'Test' });
      }

      const limited = stateManager.getHistory(5);
      expect(limited.length).toBe(5);
      expect(limited[0].screen).toBe('Screen 5');
    });
  });

  describe('Subscriptions', () => {
    it('should notify subscribers on update', () => {
      const callback = vi.fn();
      stateManager.subscribe(callback);

      stateManager.update({ screen: 'Test', status: 'Active' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ screen: 'Test' })
      );
    });

    it('should allow unsubscribe', () => {
      const callback = vi.fn();
      const unsubscribe = stateManager.subscribe(callback);

      stateManager.update({ screen: 'Test1', status: 'A' });
      unsubscribe();
      stateManager.update({ screen: 'Test2', status: 'B' });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Statistics', () => {
    it('should track update count', () => {
      stateManager.reset(); // Ensure clean state
      stateManager.update({ screen: 'A', status: 'A' });
      stateManager.update({ screen: 'B', status: 'B' });

      const stats = stateManager.getStats();
      expect(stats.updateCount).toBe(2);
    });

    it('should track subscriber count', () => {
      stateManager.reset(); // Ensure clean state
      const unsub1 = stateManager.subscribe(() => {});
      const unsub2 = stateManager.subscribe(() => {});

      expect(stateManager.getStats().subscriberCount).toBe(2);

      unsub1();
      expect(stateManager.getStats().subscriberCount).toBe(1);
      
      unsub2(); // Cleanup
    });
  });
});

describe('Structured Game States', () => {
  describe('createSnakeState', () => {
    it('should create valid snake state', () => {
      const state = createSnakeState({
        isPlaying: true,
        isGameOver: false,
        score: 50,
        level: 2,
        xp: 30,
        fieldSize: 20,
        snake: [
          { x: 10, y: 10 },
          { x: 10, y: 11 },
          { x: 10, y: 12 },
        ],
        direction: 'UP',
        food: { x: 5, y: 5, type: 'APPLE' },
      });

      expect(state.type).toBe('snake');
      expect(state.isPlaying).toBe(true);
      expect(state.snake.head).toEqual({ x: 10, y: 10 });
      expect(state.snake.length).toBe(3);
      expect(state.food.deltaX).toBe(-5);
      expect(state.food.deltaY).toBe(-5);
    });

    it('should detect danger when hitting wall', () => {
      const state = createSnakeState({
        isPlaying: true,
        isGameOver: false,
        score: 0,
        level: 1,
        xp: 0,
        fieldSize: 20,
        snake: [{ x: 0, y: 5 }],
        direction: 'LEFT',
        food: { x: 10, y: 5, type: 'APPLE' },
      });

      expect(state.dangers.willHitWall).toBe(true);
      expect(state.pathfinding.blockedDirections).toContain('LEFT');
    });

    it('should suggest optimal direction toward food', () => {
      const state = createSnakeState({
        isPlaying: true,
        isGameOver: false,
        score: 0,
        level: 1,
        xp: 0,
        fieldSize: 20,
        snake: [{ x: 10, y: 10 }],
        direction: 'UP',
        food: { x: 15, y: 10, type: 'APPLE' },
      });

      expect(state.pathfinding.optimalDirection).toBe('RIGHT');
    });

    it('should include recommendations', () => {
      const state = createSnakeState({
        isPlaying: true,
        isGameOver: false,
        score: 0,
        level: 1,
        xp: 0,
        fieldSize: 20,
        snake: [{ x: 0, y: 5 }],
        direction: 'LEFT',
        food: { x: 10, y: 5, type: 'APPLE' },
      });

      expect(state.recommendations.length).toBeGreaterThan(0);
      expect(state.recommendations.some(r => r.includes('DANGER'))).toBe(true);
    });
  });

  describe('createDinoState', () => {
    it('should create valid dino state', () => {
      const state = createDinoState({
        isPlaying: true,
        isGameOver: false,
        score: 100,
        dinoY: 0,
        velocity: 0,
        obstacles: [{ x: 10, y: 0, type: 'CACTUS' }],
        dinoX: 52,
      });

      expect(state.type).toBe('dino');
      expect(state.isPlaying).toBe(true);
      expect(state.obstacles.length).toBe(1);
      expect(state.obstacles[0].distanceToDino).toBe(42);
    });

    it('should calculate urgency for nearby obstacles', () => {
      const state = createDinoState({
        isPlaying: true,
        isGameOver: false,
        score: 100,
        dinoY: 0,
        velocity: 0,
        obstacles: [{ x: 50, y: 0, type: 'CACTUS' }],
        dinoX: 52,
      });

      expect(state.nextObstacle).not.toBeNull();
      expect(state.nextObstacle!.urgency).toBe('critical');
      expect(state.nextObstacle!.shouldJump).toBe(true);
    });

    it('should detect flying obstacles', () => {
      const state = createDinoState({
        isPlaying: true,
        isGameOver: false,
        score: 100,
        dinoY: 0,
        velocity: 0,
        obstacles: [{ x: 45, y: 3, type: 'BAT' }],
        dinoX: 52,
      });

      expect(state.nextObstacle!.isFlying).toBe(true);
    });
  });

  describe('createTicTacToeState', () => {
    it('should create valid TicTacToe state', () => {
      const state = createTicTacToeState({
        board: [
          ['X', null, null],
          [null, 'O', null],
          [null, null, null],
        ],
        currentPlayer: 'X',
        isPlayerTurn: true,
        isPlaying: true,
        isGameOver: false,
      });

      expect(state.type).toBe('tictactoe');
      expect(state.validMoves.length).toBe(7);
      expect(state.minimax.bestMove).not.toBeNull();
    });

    it('should detect winning position', () => {
      const state = createTicTacToeState({
        board: [
          ['X', 'X', 'X'],
          [null, 'O', null],
          ['O', null, null],
        ],
        currentPlayer: 'O',
        isPlayerTurn: false,
        isPlaying: false,
        isGameOver: true,
        winner: 'X',
      });

      expect(state.winner).toBe('X');
      expect(state.minimax.winningLine).toEqual([
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ]);
    });

    it('should use minimax for optimal move suggestion', () => {
      // X can win with one move
      const state = createTicTacToeState({
        board: [
          ['X', 'X', null],
          ['O', 'O', null],
          [null, null, null],
        ],
        currentPlayer: 'X',
        isPlayerTurn: true,
        isPlaying: true,
        isGameOver: false,
      });

      // Best move for X is row 0, col 2 (winning move)
      expect(state.minimax.bestMove).toEqual({ row: 0, col: 2 });
    });
  });
});

describe('GameEventType', () => {
  it('should have all required event types', () => {
    expect(GameEventType.GAME_START).toBe('game:start');
    expect(GameEventType.GAME_END).toBe('game:end');
    expect(GameEventType.SCORE_UPDATE).toBe('score:update');
    expect(GameEventType.COLLISION).toBe('collision');
    expect(GameEventType.DANGER_WARNING).toBe('danger:warning');
  });
});

describe('QueryManager (Phase 2.3)', () => {
  let qm: QueryManager;

  beforeEach(() => {
    qm = new QueryManager();
    stateManager.reset();
  });

  describe('Built-in Queries', () => {
    it('should list registered queries', () => {
      const queries = qm.getRegisteredQueries();
      expect(queries).toContain('gameState');
      expect(queries).toContain('possibleActions');
      expect(queries).toContain('history');
      expect(queries).toContain('stats');
      expect(queries).toContain('serverInfo');
    });

    it('should execute gameState query', async () => {
      stateManager.update({ screen: 'Test', status: 'Active' });
      
      const result = await qm.execute('gameState');
      expect(result.success).toBe(true);
      expect(result.query).toBe('gameState');
      expect((result.data as { screen: string }).screen).toBe('Test');
    });

    it('should execute serverInfo query', async () => {
      const result = await qm.execute('serverInfo');
      expect(result.success).toBe(true);
      expect((result.data as { version: string }).version).toBe('2.0.0');
    });

    it('should execute history query with limit', async () => {
      for (let i = 0; i < 5; i++) {
        stateManager.update({ screen: `Screen ${i}`, status: 'Test' });
      }

      const result = await qm.execute('history', { limit: 3 });
      expect(result.success).toBe(true);
      expect((result.data as { states: unknown[]; count: number }).count).toBe(3);
    });

    it('should return error for unknown query', async () => {
      const result = await qm.execute('unknown_query');
      expect(result.success).toBe(false);
      expect((result.data as { error: string }).error).toContain('Unknown query');
    });
  });

  describe('Custom Query Registration', () => {
    it('should register custom query', async () => {
      qm.register('customQuery', () => ({
        success: true,
        data: { custom: 'value' },
        cached: false,
        timestamp: Date.now(),
        query: 'customQuery',
      }));

      const result = await qm.execute('customQuery');
      expect(result.success).toBe(true);
      expect((result.data as { custom: string }).custom).toBe('value');
    });

    it('should unregister query', () => {
      qm.register('tempQuery', () => ({
        success: true,
        data: null,
        cached: false,
        timestamp: Date.now(),
        query: 'tempQuery',
      }));

      expect(qm.getRegisteredQueries()).toContain('tempQuery');
      qm.unregister('tempQuery');
      expect(qm.getRegisteredQueries()).not.toContain('tempQuery');
    });
  });

  describe('Caching', () => {
    it('should cache query results', async () => {
      let callCount = 0;
      qm.register('countedQuery', () => {
        callCount++;
        return {
          success: true,
          data: { count: callCount },
          cached: false,
          timestamp: Date.now(),
          query: 'countedQuery',
        };
      });

      await qm.execute('countedQuery');
      const result2 = await qm.execute('countedQuery');
      
      expect(result2.cached).toBe(true);
      expect((result2.data as { count: number }).count).toBe(1); // Same cached value
    });

    it('should clear cache', async () => {
      let callCount = 0;
      qm.register('clearableQuery', () => {
        callCount++;
        return {
          success: true,
          data: { count: callCount },
          cached: false,
          timestamp: Date.now(),
          query: 'clearableQuery',
        };
      });

      await qm.execute('clearableQuery');
      qm.clearCache();
      const result2 = await qm.execute('clearableQuery');
      
      expect(result2.cached).toBe(false);
      expect((result2.data as { count: number }).count).toBe(2);
    });
  });
});

describe('EventManager (Phase 2.4)', () => {
  let em: EventManager;

  beforeEach(() => {
    em = new EventManager();
  });

  afterEach(() => {
    em.reset();
  });

  describe('Event Emission', () => {
    it('should emit game events', () => {
      const callback = vi.fn();
      em.on('event', callback);

      em.emitGameEvent(GameEventType.GAME_START, { game: 'snake' }, 'snake');

      expect(callback).toHaveBeenCalledTimes(1);
      const event = callback.mock.calls[0][0];
      expect(event.type).toBe('game:start');
      expect(event.source).toBe('snake');
    });

    it('should generate unique event IDs', () => {
      const event1 = em.emitGameEvent(GameEventType.GAME_START, {}, 'system');
      const event2 = em.emitGameEvent(GameEventType.GAME_START, {}, 'system');

      expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('should maintain event sequence', () => {
      const event1 = em.emitGameEvent(GameEventType.GAME_START, {}, 'system');
      const event2 = em.emitGameEvent(GameEventType.SCORE_UPDATE, {}, 'system');

      expect(event2.sequence).toBe(event1.sequence + 1);
    });
  });

  describe('Subscriptions with Filters', () => {
    it('should subscribe with type filter', () => {
      const callback = vi.fn();
      em.subscribe(callback, { types: ['game:start'] });

      em.emitGameEvent(GameEventType.GAME_START, {}, 'snake');
      em.emitGameEvent(GameEventType.GAME_END, {}, 'snake');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should subscribe with source filter', () => {
      const callback = vi.fn();
      em.subscribe(callback, { sources: ['dino'] });

      em.emitGameEvent(GameEventType.GAME_START, {}, 'snake');
      em.emitGameEvent(GameEventType.GAME_START, {}, 'dino');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe successfully', () => {
      const callback = vi.fn();
      const subId = em.subscribe(callback, {});

      em.emitGameEvent(GameEventType.GAME_START, {}, 'system');
      em.unsubscribe(subId);
      em.emitGameEvent(GameEventType.GAME_END, {}, 'system');

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event History', () => {
    it('should maintain event history', () => {
      em.emitGameEvent(GameEventType.GAME_START, {}, 'snake');
      em.emitGameEvent(GameEventType.SCORE_UPDATE, { score: 10 }, 'snake');
      em.emitGameEvent(GameEventType.GAME_END, {}, 'snake');

      const history = em.getHistory();
      expect(history.length).toBe(3);
    });

    it('should filter history by type', () => {
      em.emitGameEvent(GameEventType.GAME_START, {}, 'snake');
      em.emitGameEvent(GameEventType.SCORE_UPDATE, {}, 'snake');
      em.emitGameEvent(GameEventType.SCORE_UPDATE, {}, 'snake');

      const history = em.getHistory({ types: ['score:update'] });
      expect(history.length).toBe(2);
    });

    it('should get events since sequence', () => {
      const event1 = em.emitGameEvent(GameEventType.GAME_START, {}, 'system');
      em.emitGameEvent(GameEventType.SCORE_UPDATE, {}, 'system');
      em.emitGameEvent(GameEventType.GAME_END, {}, 'system');

      const events = em.getEventsSince(event1.sequence);
      expect(events.length).toBe(2);
    });

    it('should limit history size', () => {
      const history = em.getHistory(undefined, 2);
      // Should work even with no events
      expect(history.length).toBe(0);

      // Add some events
      for (let i = 0; i < 10; i++) {
        em.emitGameEvent(GameEventType.SCORE_UPDATE, { score: i }, 'snake');
      }

      const limited = em.getHistory(undefined, 5);
      expect(limited.length).toBe(5);
    });
  });

  describe('Convenience Emitters', () => {
    it('should emit game start event', () => {
      const callback = vi.fn();
      eventManager.reset(); // Use singleton
      eventManager.on('event', callback);

      const event = emitGameStart('snake', { difficulty: 'hard' });

      expect(event.type).toBe('game:start');
      expect(event.source).toBe('snake');
      expect((event.data as { difficulty: string }).difficulty).toBe('hard');
      
      eventManager.removeAllListeners();
    });

    it('should emit score update event', () => {
      eventManager.reset();
      
      const event = emitScoreUpdate('dino', {
        previousScore: 100,
        newScore: 150,
        delta: 50,
        cause: 'time',
      });

      expect(event.type).toBe('score:update');
      expect((event.data as { delta: number }).delta).toBe(50);
    });
  });
});

// ============================================================
// Agent System Tests (Phase 3.1)
// ============================================================

describe('AgentManager', () => {
  let am: AgentManager;

  beforeEach(() => {
    am = new AgentManager();
  });

  afterEach(() => {
    am.reset();
  });

  describe('Agent Registration', () => {
    it('should register a new agent', () => {
      const agent = am.registerAgent({ name: 'TestBot' });

      expect(agent.id).toMatch(/^agent_/);
      expect(agent.name).toBe('TestBot');
      expect(agent.role).toBe(AgentRole.PLAYER);
      expect(agent.type).toBe('unknown');
      expect(agent.totalSessions).toBe(1);
    });

    it('should register agent with custom type and metadata', () => {
      const agent = am.registerAgent({
        name: 'GeminiBot',
        type: 'gemini',
        version: '2.0.0',
        metadata: { model: 'gemini-1.5-pro' },
      });

      expect(agent.type).toBe('gemini');
      expect(agent.version).toBe('2.0.0');
      expect(agent.metadata.model).toBe('gemini-1.5-pro');
    });

    it('should return existing agent when token matches', () => {
      const token = 'secret-token-123';
      const agent1 = am.registerAgent({ name: 'Bot', token });
      const agent2 = am.registerAgent({ name: 'Bot-Updated', token });

      expect(agent1.id).toBe(agent2.id);
      expect(agent2.totalSessions).toBe(2); // Session count increased
    });

    it('should handle anonymous agent', () => {
      const agent = am.registerAgent({} as { name: string });

      expect(agent.name).toBe('Anonymous Agent');
    });

    it('should emit agentRegistered event', () => {
      const callback = vi.fn();
      am.on('agentRegistered', callback);

      am.registerAgent({ name: 'EventTest' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].name).toBe('EventTest');
    });
  });

  describe('Session Management', () => {
    it('should create session for registered agent', () => {
      const agent = am.registerAgent({ name: 'SessionBot' });
      const session = am.createSession(agent.id, 'client-123');

      expect(session).not.toBeNull();
      expect(session!.agent.id).toBe(agent.id);
      expect(session!.clientId).toBe('client-123');
      expect(session!.active).toBe(true);
    });

    it('should fail to create session for unknown agent', () => {
      const session = am.createSession('unknown-agent', 'client-123');

      expect(session).toBeNull();
    });

    it('should get session by client ID', () => {
      const agent = am.registerAgent({ name: 'Bot' });
      am.createSession(agent.id, 'client-abc');

      const session = am.getSessionByClientId('client-abc');

      expect(session).not.toBeNull();
      expect(session!.agent.name).toBe('Bot');
    });

    it('should end session and update metrics', () => {
      const agent = am.registerAgent({ name: 'Bot' });
      am.createSession(agent.id, 'client-123');

      // Wait a bit to have measurable duration
      const ended = am.endSession('client-123');

      expect(ended).not.toBeNull();
      expect(ended!.active).toBe(false);

      // Session should be removed
      const session = am.getSessionByClientId('client-123');
      expect(session).toBeNull();
    });

    it('should emit session events', () => {
      const startCallback = vi.fn();
      const endCallback = vi.fn();
      am.on('sessionStarted', startCallback);
      am.on('sessionEnded', endCallback);

      const agent = am.registerAgent({ name: 'Bot' });
      am.createSession(agent.id, 'client-1');
      am.endSession('client-1');

      expect(startCallback).toHaveBeenCalledTimes(1);
      expect(endCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Agent Roles & Permissions', () => {
    it('should set agent role', () => {
      const agent = am.registerAgent({ name: 'Bot' });
      expect(agent.role).toBe(AgentRole.PLAYER);

      const success = am.setAgentRole(agent.id, AgentRole.SPECTATOR);

      expect(success).toBe(true);
      expect(am.getAgent(agent.id)!.role).toBe(AgentRole.SPECTATOR);
    });

    it('should fail to set role for unknown agent', () => {
      const success = am.setAgentRole('unknown', AgentRole.ADMIN);
      expect(success).toBe(false);
    });

    it('should emit roleChanged event', () => {
      const callback = vi.fn();
      am.on('roleChanged', callback);

      const agent = am.registerAgent({ name: 'Bot' });
      am.setAgentRole(agent.id, AgentRole.TRAINER);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ id: agent.id }),
        AgentRole.PLAYER,
        AgentRole.TRAINER
      );
    });

    it('should check command permission for player', () => {
      const agent = am.registerAgent({ name: 'Player' });
      const result = am.checkPermission(agent.id, 'command');

      expect(result.allowed).toBe(true);
    });

    it('should deny command permission for spectator', () => {
      const agent = am.registerAgent({ name: 'Watcher' });
      am.setAgentRole(agent.id, AgentRole.SPECTATOR);

      const result = am.checkPermission(agent.id, 'command');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Spectators');
    });

    it('should allow query for all roles', () => {
      const agent = am.registerAgent({ name: 'Bot' });
      am.setAgentRole(agent.id, AgentRole.SPECTATOR);

      const result = am.checkPermission(agent.id, 'query');

      expect(result.allowed).toBe(true);
    });

    it('should deny admin actions for non-admin', () => {
      const agent = am.registerAgent({ name: 'Bot' });
      const result = am.checkPermission(agent.id, 'admin');

      expect(result.allowed).toBe(false);
    });

    it('should allow admin actions for admin role', () => {
      const agent = am.registerAgent({ name: 'AdminBot' });
      am.setAgentRole(agent.id, AgentRole.ADMIN);

      const result = am.checkPermission(agent.id, 'admin');

      expect(result.allowed).toBe(true);
    });
  });

  describe('Metrics Tracking', () => {
    it('should initialize metrics for new agent', () => {
      const agent = am.registerAgent({ name: 'MetricsBot' });
      const metrics = am.getMetrics(agent.id);

      expect(metrics).not.toBeNull();
      expect(metrics!.commandsSent).toBe(0);
      expect(metrics!.gamesPlayed).toBe(0);
    });

    it('should record commands with latency', () => {
      const agent = am.registerAgent({ name: 'Bot' });

      am.recordCommand(agent.id, 10);
      am.recordCommand(agent.id, 20);
      am.recordCommand(agent.id, 30);

      const metrics = am.getMetrics(agent.id);

      expect(metrics!.commandsSent).toBe(3);
      expect(metrics!.avgLatencyMs).toBe(20); // (10+20+30)/3
    });

    it('should record queries', () => {
      const agent = am.registerAgent({ name: 'Bot' });

      am.recordQuery(agent.id);
      am.recordQuery(agent.id);

      const metrics = am.getMetrics(agent.id);
      expect(metrics!.queriesMade).toBe(2);
    });

    it('should record game results', () => {
      const agent = am.registerAgent({ name: 'Bot' });

      am.recordGameResult(agent.id, true, 100);
      am.recordGameResult(agent.id, false, 50);
      am.recordGameResult(agent.id, true, 200);

      const metrics = am.getMetrics(agent.id);

      expect(metrics!.gamesPlayed).toBe(3);
      expect(metrics!.gamesWon).toBe(2);
      expect(metrics!.highScore).toBe(200);
    });

    it('should record errors', () => {
      const agent = am.registerAgent({ name: 'Bot' });

      am.recordError(agent.id);
      am.recordError(agent.id);

      const metrics = am.getMetrics(agent.id);
      expect(metrics!.errorCount).toBe(2);
    });

    it('should track states received', () => {
      const agent = am.registerAgent({ name: 'Bot' });

      am.recordStateReceived(agent.id);
      am.recordStateReceived(agent.id);
      am.recordStateReceived(agent.id);

      const metrics = am.getMetrics(agent.id);
      expect(metrics!.statesReceived).toBe(3);
    });
  });

  describe('Agent Lookup', () => {
    it('should get agent by ID', () => {
      const agent = am.registerAgent({ name: 'LookupBot' });
      const found = am.getAgent(agent.id);

      expect(found).not.toBeNull();
      expect(found!.name).toBe('LookupBot');
    });

    it('should return null for unknown agent', () => {
      const found = am.getAgent('nonexistent-id');
      expect(found).toBeNull();
    });

    it('should get all agents', () => {
      am.registerAgent({ name: 'Bot1' });
      am.registerAgent({ name: 'Bot2' });
      am.registerAgent({ name: 'Bot3' });

      const agents = am.getAllAgents();
      expect(agents.length).toBe(3);
    });

    it('should get agents by role', () => {
      am.registerAgent({ name: 'Player1' });
      const spectator = am.registerAgent({ name: 'Watcher' });
      am.setAgentRole(spectator.id, AgentRole.SPECTATOR);

      const players = am.getAgentsByRole(AgentRole.PLAYER);
      const spectators = am.getAgentsByRole(AgentRole.SPECTATOR);

      expect(players.length).toBe(1);
      expect(spectators.length).toBe(1);
    });

    it('should get active sessions', () => {
      const agent1 = am.registerAgent({ name: 'Bot1' });
      const agent2 = am.registerAgent({ name: 'Bot2' });

      am.createSession(agent1.id, 'client-1');
      am.createSession(agent2.id, 'client-2');

      const sessions = am.getActiveSessions();
      expect(sessions.length).toBe(2);
    });
  });

  describe('Statistics', () => {
    it('should calculate summary statistics', () => {
      const player = am.registerAgent({ name: 'Player' });
      const spectator = am.registerAgent({ name: 'Spectator' });
      am.setAgentRole(spectator.id, AgentRole.SPECTATOR);

      am.createSession(player.id, 'client-1');
      am.recordCommand(player.id, 10);
      am.recordCommand(player.id, 20);

      const stats = am.getStats();

      expect(stats.totalAgents).toBe(2);
      expect(stats.activeSessions).toBe(1);
      expect(stats.agentsByRole[AgentRole.PLAYER]).toBe(1);
      expect(stats.agentsByRole[AgentRole.SPECTATOR]).toBe(1);
      expect(stats.totalCommands).toBe(2);
      expect(stats.averageLatency).toBe(15);
    });
  });

  describe('Activity Tracking', () => {
    it('should update activity timestamp', () => {
      const agent = am.registerAgent({ name: 'Bot' });
      const session = am.createSession(agent.id, 'client-1');
      const initialActivity = session!.lastActivity;

      // Small delay
      const before = Date.now();
      am.updateActivity('client-1');
      const after = Date.now();

      const updated = am.getSessionByClientId('client-1');
      expect(updated!.lastActivity).toBeGreaterThanOrEqual(before);
      expect(updated!.lastActivity).toBeLessThanOrEqual(after);
    });
  });

  describe('Reset', () => {
    it('should clear all data on reset', () => {
      am.registerAgent({ name: 'Bot1' });
      am.registerAgent({ name: 'Bot2' });

      am.reset();

      expect(am.getAllAgents().length).toBe(0);
      expect(am.getActiveSessions().length).toBe(0);
    });
  });
});

// ============================================================
// Turn Management Tests (Phase 3.2)
// ============================================================

describe('TurnManager', () => {
  let tm: TurnManager;

  beforeEach(() => {
    tm = new TurnManager();
  });

  afterEach(() => {
    tm.reset();
  });

  describe('Agent Addition', () => {
    it('should add an agent as player', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);

      const state = tm.getAgentTurnState('agent-1');
      expect(state).not.toBeNull();
      expect(state!.isCurrentTurn).toBe(true); // First agent gets turn
    });

    it('should add spectator separately', () => {
      tm.addAgent('spectator-1', AgentRole.SPECTATOR);

      expect(tm.isSpectator('spectator-1')).toBe(true);
      expect(tm.getAgentTurnState('spectator-1')).toBeNull();
    });

    it('should emit agentAdded event', () => {
      const callback = vi.fn();
      tm.on('agentAdded', callback);

      tm.addAgent('agent-1', AgentRole.PLAYER);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple agents', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);
      tm.addAgent('agent-3', AgentRole.PLAYER);

      const status = tm.getCurrentTurnState();
      expect(status.turnOrder.length).toBe(3);
      expect(status.currentAgent).toBe('agent-1');
    });
  });

  describe('Agent Removal', () => {
    it('should remove agent from turn order', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);

      tm.removeAgent('agent-1');

      const status = tm.getCurrentTurnState();
      expect(status.turnOrder.length).toBe(1);
      expect(status.currentAgent).toBe('agent-2');
    });

    it('should remove spectator', () => {
      tm.addAgent('spectator-1', AgentRole.SPECTATOR);
      tm.removeAgent('spectator-1');

      expect(tm.isSpectator('spectator-1')).toBe(false);
    });

    it('should adjust turn when current agent removed', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);
      tm.addAgent('agent-3', AgentRole.PLAYER);

      // agent-1 has current turn
      tm.removeAgent('agent-1');

      const status = tm.getCurrentTurnState();
      expect(status.currentAgent).toBe('agent-2');
    });
  });

  describe('Free Mode', () => {
    beforeEach(() => {
      tm.setMode(TurnMode.FREE);
    });

    it('should allow any agent to send commands', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);

      expect(tm.canSendCommand('agent-1').allowed).toBe(true);
      expect(tm.canSendCommand('agent-2').allowed).toBe(true);
    });

    it('should deny spectators', () => {
      tm.addAgent('spectator-1', AgentRole.SPECTATOR);

      const result = tm.canSendCommand('spectator-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Spectator');
    });
  });

  describe('Round Robin Mode', () => {
    beforeEach(() => {
      tm = new TurnManager({ 
        mode: TurnMode.ROUND_ROBIN, 
        commandsPerTurn: 2,
        allowQueueing: false,
      });
    });

    afterEach(() => {
      tm.reset();
    });

    it('should only allow current agent to send', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);

      expect(tm.canSendCommand('agent-1').allowed).toBe(true);
      expect(tm.canSendCommand('agent-2').allowed).toBe(false);
    });

    it('should advance turn after commands exhausted', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);

      const callback = vi.fn();
      tm.on('commandExecuted', callback);

      // Agent 1 sends 2 commands
      tm.queueCommand('agent-1', 'key', { key: 'up' });
      tm.queueCommand('agent-1', 'key', { key: 'down' });

      // Should be agent-2's turn now
      const status = tm.getCurrentTurnState();
      expect(status.currentAgent).toBe('agent-2');
    });

    it('should track commands remaining', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);

      tm.queueCommand('agent-1', 'key', { key: 'up' });

      const state = tm.getAgentTurnState('agent-1');
      expect(state!.commandsRemaining).toBe(1);
    });
  });

  describe('Priority Mode', () => {
    beforeEach(() => {
      tm = new TurnManager({ mode: TurnMode.PRIORITY });
    });

    afterEach(() => {
      tm.reset();
    });

    it('should order agents by priority', () => {
      tm.addAgent('low-priority', AgentRole.PLAYER, CommandPriority.LOW);
      tm.addAgent('high-priority', AgentRole.PLAYER, CommandPriority.HIGH);
      tm.addAgent('normal-priority', AgentRole.PLAYER, CommandPriority.NORMAL);

      const status = tm.getCurrentTurnState();
      expect(status.turnOrder[0]).toBe('high-priority');
      expect(status.turnOrder[1]).toBe('normal-priority');
      expect(status.turnOrder[2]).toBe('low-priority');
    });

    it('should reorder on priority change', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER, CommandPriority.LOW);
      tm.addAgent('agent-2', AgentRole.PLAYER, CommandPriority.NORMAL);

      tm.setAgentPriority('agent-1', CommandPriority.HIGH);

      const status = tm.getCurrentTurnState();
      expect(status.turnOrder[0]).toBe('agent-1');
    });
  });

  describe('Command Queuing', () => {
    beforeEach(() => {
      tm = new TurnManager({ 
        mode: TurnMode.ROUND_ROBIN, 
        commandsPerTurn: 1,
        allowQueueing: true,
        maxQueueSize: 5,
      });
    });

    afterEach(() => {
      tm.reset();
    });

    it('should queue commands when not your turn', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);

      // Agent 2 tries to send when it's agent 1's turn
      const result = tm.queueCommand('agent-2', 'key', { key: 'up' });

      expect(result.queued).toBe(true);
      expect(result.executed).toBe(false);
    });

    it('should execute immediately when your turn', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);

      const result = tm.queueCommand('agent-1', 'key', { key: 'up' });

      expect(result.queued).toBe(false);
      expect(result.executed).toBe(true);
    });

    it('should reject when queue is full', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);

      // Fill agent-2's queue
      for (let i = 0; i < 5; i++) {
        tm.queueCommand('agent-2', 'key', { key: 'up' });
      }

      const result = tm.queueCommand('agent-2', 'key', { key: 'down' });
      expect(result.queued).toBe(false);
      expect(result.reason).toContain('Queue full');
    });

    it('should track queue status', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);

      tm.queueCommand('agent-2', 'key', { key: 'up' });
      tm.queueCommand('agent-2', 'key', { key: 'down' });

      const status = tm.getQueueStatus();
      expect(status.total).toBe(2);
      expect(status.byAgent.get('agent-2')).toBe(2);
    });
  });

  describe('Turn Events', () => {
    it('should emit turnChanged on next turn', () => {
      const callback = vi.fn();
      tm.on('turnChanged', callback);

      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);

      tm.nextTurn();

      expect(callback).toHaveBeenCalledWith('agent-2', expect.any(Object));
    });

    it('should track turns taken', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);

      tm.nextTurn(); // -> agent-2
      tm.nextTurn(); // -> agent-1

      const state = tm.getAgentTurnState('agent-1');
      expect(state!.turnsTaken).toBe(1);
    });
  });

  describe('Spectator Management', () => {
    it('should list all spectators', () => {
      tm.addAgent('spectator-1', AgentRole.SPECTATOR);
      tm.addAgent('spectator-2', AgentRole.SPECTATOR);
      tm.addAgent('player-1', AgentRole.PLAYER);

      const spectators = tm.getSpectators();
      expect(spectators.length).toBe(2);
      expect(spectators).toContain('spectator-1');
      expect(spectators).toContain('spectator-2');
    });
  });

  describe('Configuration', () => {
    it('should return current config', () => {
      const config = tm.getConfig();
      expect(config.mode).toBe(TurnMode.FREE);
      expect(config.commandsPerTurn).toBe(1);
    });

    it('should update config', () => {
      tm.updateConfig({ commandsPerTurn: 3 });

      const config = tm.getConfig();
      expect(config.commandsPerTurn).toBe(3);
    });

    it('should change mode', () => {
      const callback = vi.fn();
      tm.on('modeChanged', callback);

      tm.setMode(TurnMode.PRIORITY);

      expect(callback).toHaveBeenCalledWith(TurnMode.PRIORITY);
      expect(tm.getConfig().mode).toBe(TurnMode.PRIORITY);
    });
  });

  describe('Reset', () => {
    it('should clear all state on reset', () => {
      tm.addAgent('agent-1', AgentRole.PLAYER);
      tm.addAgent('agent-2', AgentRole.PLAYER);
      tm.addAgent('spectator-1', AgentRole.SPECTATOR);

      tm.reset();

      const status = tm.getCurrentTurnState();
      expect(status.turnOrder.length).toBe(0);
      expect(status.currentAgent).toBeNull();
      expect(tm.getSpectators().length).toBe(0);
    });
  });
});

// ============================================================
// Coordination Manager Tests (Phase 3.3)
// ============================================================

describe('CoordinationManager', () => {
  let cm: CoordinationManager;

  beforeEach(() => {
    cm = new CoordinationManager();
  });

  afterEach(() => {
    cm.reset();
  });

  describe('Direct Messaging', () => {
    it('should send direct message', () => {
      const callback = vi.fn();
      cm.on('directMessage', callback);

      const msg = cm.sendDirect('agent-1', 'agent-2', { text: 'hello' });

      expect(msg.type).toBe(CoordinationMessageType.DIRECT);
      expect(msg.from).toBe('agent-1');
      expect(msg.to).toBe('agent-2');
      expect(callback).toHaveBeenCalledWith(msg);
    });

    it('should include topic in message', () => {
      const msg = cm.sendDirect('agent-1', 'agent-2', { action: 'move' }, 'game:actions');

      expect(msg.topic).toBe('game:actions');
    });

    it('should retrieve messages for agent', () => {
      cm.sendDirect('agent-1', 'agent-2', { text: 'hello' });
      cm.sendDirect('agent-3', 'agent-2', { text: 'hi' });
      cm.sendDirect('agent-1', 'agent-3', { text: 'hey' }); // Not for agent-2

      const messages = cm.getMessagesFor('agent-2');
      expect(messages.length).toBe(2);
    });
  });

  describe('Broadcast Messaging', () => {
    it('should broadcast to all agents', () => {
      const callback = vi.fn();
      cm.on('broadcast', callback);

      const msg = cm.broadcast('agent-1', { announcement: 'game starting' });

      expect(msg.type).toBe(CoordinationMessageType.BROADCAST);
      expect(callback).toHaveBeenCalled();
    });

    it('should include broadcasts in messages for any agent', () => {
      cm.broadcast('agent-1', { text: 'broadcast' });

      const messages = cm.getMessagesFor('agent-99');
      expect(messages.length).toBe(1);
    });
  });

  describe('Team Messaging', () => {
    it('should send message to team members', () => {
      const team = cm.createTeam('Blue Team', 'agent-1');
      cm.joinTeam('agent-2', team.id);

      const callback = vi.fn();
      cm.on('teamMessage', callback);

      const msg = cm.sendToTeam('agent-1', team.id, { strategy: 'attack' });

      expect(msg).not.toBeNull();
      expect(msg!.type).toBe(CoordinationMessageType.TEAM);
      expect(callback).toHaveBeenCalled();
    });

    it('should return null for non-existent team', () => {
      const msg = cm.sendToTeam('agent-1', 'fake-team', {});
      expect(msg).toBeNull();
    });

    it('should include team messages for team members', () => {
      const team = cm.createTeam('Red Team', 'agent-1');
      cm.joinTeam('agent-2', team.id);

      cm.sendToTeam('agent-1', team.id, { data: 'secret' });

      const agent2Messages = cm.getMessagesFor('agent-2');
      expect(agent2Messages.length).toBe(1);

      const agent3Messages = cm.getMessagesFor('agent-3');
      expect(agent3Messages.length).toBe(0);
    });
  });

  describe('Topic Subscriptions', () => {
    it('should subscribe to topic', () => {
      cm.subscribeTopic('agent-1', 'game:events');

      const subscribers = cm.getTopicSubscribers('game:events');
      expect(subscribers).toContain('agent-1');
    });

    it('should unsubscribe from topic', () => {
      cm.subscribeTopic('agent-1', 'game:events');
      cm.unsubscribeTopic('agent-1', 'game:events');

      const subscribers = cm.getTopicSubscribers('game:events');
      expect(subscribers.length).toBe(0);
    });
  });

  describe('Teams', () => {
    it('should create team with leader', () => {
      const team = cm.createTeam('Alpha', 'agent-1');

      expect(team.name).toBe('Alpha');
      expect(team.leader).toBe('agent-1');
      expect(team.members.has('agent-1')).toBe(true);
    });

    it('should join team', () => {
      const team = cm.createTeam('Beta', 'agent-1');
      cm.joinTeam('agent-2', team.id);

      const updated = cm.getTeam(team.id);
      expect(updated!.members.has('agent-2')).toBe(true);
    });

    it('should leave team', () => {
      const team = cm.createTeam('Gamma', 'agent-1');
      cm.joinTeam('agent-2', team.id);
      cm.leaveTeam('agent-2', team.id);

      const updated = cm.getTeam(team.id);
      expect(updated!.members.has('agent-2')).toBe(false);
    });

    it('should get agent teams', () => {
      const team1 = cm.createTeam('Team1', 'agent-1');
      const team2 = cm.createTeam('Team2');
      cm.joinTeam('agent-1', team2.id);

      const teams = cm.getAgentTeams('agent-1');
      expect(teams.length).toBe(2);
    });
  });

  describe('Locks', () => {
    it('should acquire free lock', async () => {
      const result = await cm.acquireLock('agent-1', 'game:control');

      expect(result.success).toBe(true);
      expect(cm.isLockHeld('game:control').held).toBe(true);
      expect(cm.isLockHeld('game:control').holder).toBe('agent-1');
    });

    it('should release lock', async () => {
      await cm.acquireLock('agent-1', 'resource');
      const result = cm.releaseLock('agent-1', 'resource');

      expect(result.success).toBe(true);
      expect(cm.isLockHeld('resource').held).toBe(false);
    });

    it('should fail to release lock not held', async () => {
      await cm.acquireLock('agent-1', 'resource');
      const result = cm.releaseLock('agent-2', 'resource');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not lock holder');
    });

    it('should emit events on acquire/release', async () => {
      const acquireCallback = vi.fn();
      const releaseCallback = vi.fn();
      cm.on('lockAcquired', acquireCallback);
      cm.on('lockReleased', releaseCallback);

      await cm.acquireLock('agent-1', 'test-lock');
      cm.releaseLock('agent-1', 'test-lock');

      expect(acquireCallback).toHaveBeenCalledTimes(1);
      expect(releaseCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Barriers', () => {
    it('should create barrier', () => {
      const barrier = cm.createBarrier('sync-point', 3);

      expect(barrier.name).toBe('sync-point');
      expect(barrier.count).toBe(3);
      expect(barrier.released).toBe(false);
    });

    it('should release when count reached', async () => {
      cm.createBarrier('sync', 2);

      const callback = vi.fn();
      cm.on('barrierReleased', callback);

      // Two agents wait
      const promise1 = cm.waitAtBarrier('agent-1', 'sync');
      const result2 = await cm.waitAtBarrier('agent-2', 'sync');

      expect(result2.success).toBe(true);
      expect(callback).toHaveBeenCalled();
    });

    it('should return already released for late arrivals', async () => {
      cm.createBarrier('sync', 1);
      await cm.waitAtBarrier('agent-1', 'sync');

      // Small delay to let release process
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await cm.waitAtBarrier('agent-2', 'sync');
      // Either already released or barrier deleted
      expect(result.success).toBe(true);
    });
  });

  describe('Shared State', () => {
    it('should create shared state', () => {
      const state = cm.createSharedState('game:score', { team1: 0, team2: 0 });

      expect(state.name).toBe('game:score');
      expect(state.value).toEqual({ team1: 0, team2: 0 });
      expect(state.version).toBe(0);
    });

    it('should update shared state', () => {
      cm.createSharedState('counter', 0);
      const result = cm.updateSharedState('agent-1', 'counter', 1);

      expect(result.success).toBe(true);
      expect(cm.getSharedState('counter')!.value).toBe(1);
      expect(cm.getSharedState('counter')!.version).toBe(1);
    });

    it('should enforce optimistic concurrency', () => {
      cm.createSharedState('data', 'initial');
      cm.updateSharedState('agent-1', 'data', 'updated');

      // Try to update with old version
      const result = cm.updateSharedState('agent-2', 'data', 'conflict', 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Version conflict');
    });

    it('should notify subscribers on update', () => {
      cm.createSharedState('watched', 0);
      cm.subscribeToSharedState('agent-1', 'watched');

      const callback = vi.fn();
      cm.on('sharedStateChange', callback);

      cm.updateSharedState('agent-2', 'watched', 1);

      expect(callback).toHaveBeenCalledWith('agent-1', expect.any(Object), 0);
    });
  });

  describe('Agent Cleanup', () => {
    it('should remove agent from all structures', async () => {
      const team = cm.createTeam('Test', 'agent-1');
      await cm.acquireLock('agent-1', 'test-lock');
      cm.subscribeTopic('agent-1', 'events');

      cm.removeAgent('agent-1');

      expect(cm.getTeam(team.id)!.members.has('agent-1')).toBe(false);
      expect(cm.isLockHeld('test-lock').held).toBe(false);
      expect(cm.getTopicSubscribers('events')).not.toContain('agent-1');
    });
  });

  describe('Statistics', () => {
    it('should return coordination stats', () => {
      cm.createTeam('Team');
      cm.createBarrier('barrier', 2);
      cm.createSharedState('state', null);
      cm.sendDirect('a', 'b', {});

      const stats = cm.getStats();

      expect(stats.teamCount).toBe(1);
      expect(stats.barrierCount).toBe(1);
      expect(stats.sharedStateCount).toBe(1);
      expect(stats.messageCount).toBe(1);
    });
  });

  describe('Reset', () => {
    it('should clear all state on reset', () => {
      cm.createTeam('Team');
      cm.createBarrier('barrier', 2);
      cm.sendDirect('a', 'b', {});

      cm.reset();

      const stats = cm.getStats();
      expect(stats.teamCount).toBe(0);
      expect(stats.barrierCount).toBe(0);
      expect(stats.messageCount).toBe(0);
    });
  });
});

// ============================================
// Phase 3.4: Game Session Manager Tests
// ============================================
describe('GameSessionManager', () => {
  let sm: GameSessionManager;

  beforeEach(() => {
    sm = new GameSessionManager();
  });

  afterEach(() => {
    sm.reset();
  });

  describe('Session Creation', () => {
    it('should create a session with default config', () => {
      const session = sm.createSession();

      expect(session.id).toMatch(/^session_/);
      expect(session.config.gameType).toBe('tictactoe');
      expect(session.config.mode).toBe('ai_vs_ai');
      expect(session.status).toBe('waiting');
      expect(session.players.size).toBe(0);
    });

    it('should create a session with custom config', () => {
      const session = sm.createSession({
        gameType: 'chess',
        mode: 'human_vs_ai',
        turnTimeMs: 60000,
      });

      expect(session.config.gameType).toBe('chess');
      expect(session.config.mode).toBe('human_vs_ai');
      expect(session.config.turnTimeMs).toBe(60000);
    });

    it('should emit sessionCreated event', () => {
      const callback = vi.fn();
      sm.on('sessionCreated', callback);

      const session = sm.createSession();

      expect(callback).toHaveBeenCalledWith(session);
    });

    it('should initialize TicTacToe board correctly', () => {
      const session = sm.createSession({ gameType: 'tictactoe' });

      expect(session.state.board).toEqual([
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ]);
      expect(session.state.currentPlayer).toBe('X');
      expect(session.state.moveCount).toBe(0);
    });
  });

  describe('Player Joining', () => {
    it('should allow player to join with preferred slot', () => {
      const session = sm.createSession();
      const result = sm.joinSession(session.id, 'agent-1', 'Player1', 'ai', 'X');

      expect(result.success).toBe(true);
      expect(result.slot).toBe('X');
      expect(session.players.size).toBe(1);
    });

    it('should assign first available slot if preferred is taken', () => {
      const session = sm.createSession();
      sm.joinSession(session.id, 'agent-1', 'Player1', 'ai', 'X');
      const result = sm.joinSession(session.id, 'agent-2', 'Player2', 'ai', 'X');

      expect(result.success).toBe(true);
      expect(result.slot).toBe('O');
    });

    it('should reject join if no slots available', () => {
      const session = sm.createSession({ autoStart: false }); // Disable auto-start
      sm.joinSession(session.id, 'agent-1', 'Player1', 'ai');
      sm.joinSession(session.id, 'agent-2', 'Player2', 'ai');
      const result = sm.joinSession(session.id, 'agent-3', 'Player3', 'ai');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No available player slots');
    });

    it('should allow spectators to join', () => {
      const session = sm.createSession({ allowSpectators: true });
      const result = sm.joinSession(session.id, 'spec-1', 'Spectator', 'spectator');

      expect(result.success).toBe(true);
      expect(session.spectators.has('spec-1')).toBe(true);
    });

    it('should reject spectators if not allowed', () => {
      const session = sm.createSession({ allowSpectators: false });
      const result = sm.joinSession(session.id, 'spec-1', 'Spectator', 'spectator');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Spectators not allowed');
    });

    it('should emit playerJoined event', () => {
      const callback = vi.fn();
      sm.on('playerJoined', callback);

      const session = sm.createSession();
      sm.joinSession(session.id, 'agent-1', 'Player1', 'ai');

      expect(callback).toHaveBeenCalledWith(session.id, expect.objectContaining({
        agentId: 'agent-1',
        name: 'Player1',
      }));
    });

    it('should reject join if session already started', () => {
      const session = sm.createSession({ autoStart: false });
      sm.joinSession(session.id, 'agent-1', 'P1', 'ai');
      sm.joinSession(session.id, 'agent-2', 'P2', 'ai');
      sm.setPlayerReady(session.id, 'agent-1', true);
      sm.setPlayerReady(session.id, 'agent-2', true);
      sm.startSession(session.id);

      const result = sm.joinSession(session.id, 'agent-3', 'P3', 'ai');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session already started');
    });
  });

  describe('Game Start', () => {
    it('should auto-start when all players join with autoStart enabled', () => {
      const session = sm.createSession({ autoStart: true });
      sm.joinSession(session.id, 'agent-1', 'P1', 'ai');
      sm.joinSession(session.id, 'agent-2', 'P2', 'ai');

      expect(session.status).toBe('playing');
      expect(session.startedAt).toBeDefined();
    });

    it('should not auto-start if autoStart is disabled', () => {
      const session = sm.createSession({ autoStart: false });
      sm.joinSession(session.id, 'agent-1', 'P1', 'ai');
      sm.joinSession(session.id, 'agent-2', 'P2', 'ai');

      expect(session.status).toBe('waiting');
    });

    it('should start manually when all players ready', () => {
      const session = sm.createSession({ autoStart: false });
      sm.joinSession(session.id, 'agent-1', 'P1', 'ai');
      sm.joinSession(session.id, 'agent-2', 'P2', 'ai');
      sm.setPlayerReady(session.id, 'agent-1', true);
      sm.setPlayerReady(session.id, 'agent-2', true);

      const started = sm.startSession(session.id);

      expect(started).toBe(true);
      expect(session.status).toBe('playing');
    });

    it('should emit gameStarted event', () => {
      const callback = vi.fn();
      sm.on('gameStarted', callback);

      const session = sm.createSession({ autoStart: true });
      sm.joinSession(session.id, 'agent-1', 'P1', 'ai');
      sm.joinSession(session.id, 'agent-2', 'P2', 'ai');

      expect(callback).toHaveBeenCalledWith(session.id, expect.any(Object));
    });
  });

  describe('Move Submission', () => {
    let session: ReturnType<typeof sm.createSession>;
    let agent1 = 'agent-x';
    let agent2 = 'agent-o';

    beforeEach(() => {
      session = sm.createSession({ autoStart: true });
      sm.joinSession(session.id, agent1, 'Player X', 'ai', 'X');
      sm.joinSession(session.id, agent2, 'Player O', 'ai', 'O');
    });

    it('should accept valid move from current player', () => {
      const result = sm.submitMove(session.id, agent1, { row: 1, col: 1 });

      expect(result.success).toBe(true);
      expect(result.nextPlayer).toBe('O');
      expect(session.state.board[1][1]).toBe('X');
    });

    it('should reject move from wrong player', () => {
      const result = sm.submitMove(session.id, agent2, { row: 0, col: 0 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not your turn');
    });

    it('should reject move to occupied cell', () => {
      sm.submitMove(session.id, agent1, { row: 0, col: 0 }); // X plays
      sm.submitMove(session.id, agent2, { row: 1, col: 1 }); // O plays
      const result = sm.submitMove(session.id, agent1, { row: 0, col: 0 }); // X tries same cell

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cell already occupied');
    });

    it('should reject move with invalid position', () => {
      const result = sm.submitMove(session.id, agent1, { row: 5, col: 0 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid position');
    });

    it('should detect win and end game', () => {
      // X wins with top row
      sm.submitMove(session.id, agent1, { row: 0, col: 0 }); // X
      sm.submitMove(session.id, agent2, { row: 1, col: 0 }); // O
      sm.submitMove(session.id, agent1, { row: 0, col: 1 }); // X
      sm.submitMove(session.id, agent2, { row: 1, col: 1 }); // O
      const result = sm.submitMove(session.id, agent1, { row: 0, col: 2 }); // X wins

      expect(result.success).toBe(true);
      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('X');
      expect(session.status).toBe('finished');
    });

    it('should detect draw', () => {
      // Play to a draw
      sm.submitMove(session.id, agent1, { row: 0, col: 0 }); // X
      sm.submitMove(session.id, agent2, { row: 0, col: 1 }); // O
      sm.submitMove(session.id, agent1, { row: 0, col: 2 }); // X
      sm.submitMove(session.id, agent2, { row: 1, col: 1 }); // O
      sm.submitMove(session.id, agent1, { row: 1, col: 0 }); // X
      sm.submitMove(session.id, agent2, { row: 1, col: 2 }); // O
      sm.submitMove(session.id, agent1, { row: 2, col: 1 }); // X
      sm.submitMove(session.id, agent2, { row: 2, col: 0 }); // O
      const result = sm.submitMove(session.id, agent1, { row: 2, col: 2 }); // X - draw

      expect(result.success).toBe(true);
      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('draw');
    });

    it('should emit moveMade event', () => {
      const callback = vi.fn();
      sm.on('moveMade', callback);

      sm.submitMove(session.id, agent1, { row: 1, col: 1 });

      expect(callback).toHaveBeenCalledWith(session.id, expect.objectContaining({
        player: 'X',
        move: { row: 1, col: 1 },
      }));
    });

    it('should emit gameEnded event on win', () => {
      const callback = vi.fn();
      sm.on('gameEnded', callback);

      // X wins with diagonal
      sm.submitMove(session.id, agent1, { row: 0, col: 0 });
      sm.submitMove(session.id, agent2, { row: 0, col: 1 });
      sm.submitMove(session.id, agent1, { row: 1, col: 1 });
      sm.submitMove(session.id, agent2, { row: 0, col: 2 });
      sm.submitMove(session.id, agent1, { row: 2, col: 2 });

      expect(callback).toHaveBeenCalledWith(session.id, expect.objectContaining({
        winner: 'X',
      }));
    });
  });

  describe('Minimax Hints', () => {
    it('should provide best move hint for AI agents', () => {
      const session = sm.createSession({ autoStart: true });
      sm.joinSession(session.id, 'agent-1', 'P1', 'ai', 'X');
      sm.joinSession(session.id, 'agent-2', 'P2', 'ai', 'O');

      const stateForAgent = sm.getStateForAgent(session.id, 'agent-1');

      expect(stateForAgent).toBeDefined();
      expect(stateForAgent!.isYourTurn).toBe(true);
      expect(stateForAgent!.yourSlot).toBe('X');
      expect(stateForAgent!.minimax).toBeDefined();
      expect(stateForAgent!.minimax!.bestMove).toBeDefined();
    });

    it('should provide valid moves list', () => {
      const session = sm.createSession({ autoStart: true });
      sm.joinSession(session.id, 'agent-1', 'P1', 'ai', 'X');
      sm.joinSession(session.id, 'agent-2', 'P2', 'ai', 'O');

      const stateForAgent = sm.getStateForAgent(session.id, 'agent-1');

      expect(stateForAgent!.validMoves).toHaveLength(9);
      expect(stateForAgent!.validMoves).toContainEqual({ row: 1, col: 1 });
    });
  });

  describe('Player Leaving and Forfeit', () => {
    it('should handle player leaving during game', () => {
      const session = sm.createSession({ autoStart: true });
      sm.joinSession(session.id, 'agent-1', 'P1', 'ai', 'X');
      sm.joinSession(session.id, 'agent-2', 'P2', 'ai', 'O');

      sm.leaveSession(session.id, 'agent-1');

      expect(session.status).toBe('finished');
      expect(session.state.winner).toBe('O');
    });

    it('should emit playerForfeited event', () => {
      const callback = vi.fn();
      sm.on('playerForfeited', callback);

      const session = sm.createSession({ autoStart: true });
      sm.joinSession(session.id, 'agent-1', 'P1', 'ai', 'X');
      sm.joinSession(session.id, 'agent-2', 'P2', 'ai', 'O');
      sm.forfeit(session.id, 'agent-1');

      expect(callback).toHaveBeenCalledWith(session.id, 'agent-1', 'X');
    });
  });

  describe('Session Tracking', () => {
    it('should track sessions per agent', () => {
      sm.createSession({ gameType: 'tictactoe' });
      const session1 = sm.createSession({ gameType: 'tictactoe' });
      const session2 = sm.createSession({ gameType: 'tictactoe' });

      sm.joinSession(session1.id, 'agent-1', 'P1', 'ai');
      sm.joinSession(session2.id, 'agent-1', 'P2', 'ai');

      const agentSessions = sm.getAgentSessions('agent-1');
      expect(agentSessions).toHaveLength(2);
    });

    it('should return active sessions', () => {
      const session1 = sm.createSession({ autoStart: true });
      const session2 = sm.createSession();

      sm.joinSession(session1.id, 'a1', 'P1', 'ai');
      sm.joinSession(session1.id, 'a2', 'P2', 'ai');

      const active = sm.getActiveSessions();
      expect(active).toHaveLength(2);
    });

    it('should return stats', () => {
      sm.createSession({ autoStart: true });
      const playingSession = sm.createSession({ autoStart: true });
      sm.joinSession(playingSession.id, 'a1', 'P1', 'ai');
      sm.joinSession(playingSession.id, 'a2', 'P2', 'ai');

      const stats = sm.getStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.playingSessions).toBe(1);
      expect(stats.waitingSessions).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should clean up old finished sessions', () => {
      const session = sm.createSession({ autoStart: true });
      sm.joinSession(session.id, 'a1', 'P1', 'ai', 'X');
      sm.joinSession(session.id, 'a2', 'P2', 'ai', 'O');
      
      // Force finish
      sm.forfeit(session.id, 'a1');
      
      // Simulate old endedAt
      session.endedAt = Date.now() - 7200000; // 2 hours ago

      const cleaned = sm.cleanupOldSessions(3600000); // 1 hour max age
      expect(cleaned).toBe(1);
    });

    it('should reset all state', () => {
      sm.createSession();
      sm.createSession();

      sm.reset();

      expect(sm.getStats().totalSessions).toBe(0);
    });
  });
});