/**
 * Spectator System Tests
 * Tests for StateDiffer, SpectatorManager, and Chat
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import {
  StateDiffer,
  stateDiffer,
  diff,
  applyPatch,
  validatePatch,
  DEFAULT_DIFFER_CONFIG,
  DiffResult,
  PatchDocument,
} from '../src/websocket/differ.js';
import {
  SpectatorManager,
  getSpectatorManager,
  resetSpectatorManager,
  GAME_SPECTATOR_CONFIGS,
  DEFAULT_SPECTATOR_CONFIG,
  QualityTier,
} from '../src/websocket/spectator.js';
import {
  ChatManager,
  ChatRateLimiter,
  MessageHistory,
  getChatManager,
  resetChatManager,
  QUICK_REACTIONS,
  GAME_EMOTES,
  ChatMessage,
} from '../src/websocket/chat.js';

// Mock WebSocket for spectator tests
const createMockSocket = () => ({
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1,
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
} as unknown as WebSocket);

// Helper to create patch documents
const createPatch = (operations: PatchDocument['operations']): PatchDocument => ({
  operations,
  timestamp: Date.now(),
});

// ============================================================================
// StateDiffer Tests
// ============================================================================

describe('StateDiffer', () => {
  let differ: StateDiffer;

  beforeEach(() => {
    // Use Infinity to disable fallback for small test objects
    // In production, fallback happens when patch > 50% of full state
    // but for tiny test objects, patches are often larger than full state
    differ = new StateDiffer({ maxPatchRatio: Infinity });
  });

  describe('Basic Diffing', () => {
    it('should detect no changes for identical objects', () => {
      const obj = { a: 1, b: 2 };
      const copy = { a: 1, b: 2 };
      const result = differ.diff(obj, copy);
      
      expect(result.patch.operations).toHaveLength(0);
    });

    it('should detect added properties', () => {
      const source = { a: 1 };
      const target = { a: 1, b: 2 };
      const result = differ.diff(source, target);
      
      expect(result.patch.operations).toContainEqual({
        op: 'add',
        path: '/b',
        value: 2,
      });
    });

    it('should detect removed properties', () => {
      const source = { a: 1, b: 2 };
      const target = { a: 1 };
      const result = differ.diff(source, target);
      
      expect(result.patch.operations).toContainEqual({
        op: 'remove',
        path: '/b',
      });
    });

    it('should detect replaced values', () => {
      const source = { a: 1 };
      const target = { a: 2 };
      const result = differ.diff(source, target);
      
      expect(result.patch.operations).toContainEqual({
        op: 'replace',
        path: '/a',
        value: 2,
      });
    });

    it('should handle nested objects', () => {
      const source = { a: { b: { c: 1 } } };
      const target = { a: { b: { c: 2 } } };
      const result = differ.diff(source, target);
      
      expect(result.patch.operations).toContainEqual({
        op: 'replace',
        path: '/a/b/c',
        value: 2,
      });
    });

    it('should handle arrays', () => {
      const source = { arr: [1, 2, 3] };
      const target = { arr: [1, 2, 3, 4] };
      const result = differ.diff(source, target);
      
      // Should detect some change
      expect(result.patch.operations.length).toBeGreaterThan(0);
    });

    it('should handle null values', () => {
      const source = { a: null };
      const target = { a: 1 };
      const result = differ.diff(source, target);
      
      expect(result.patch.operations.length).toBeGreaterThan(0);
    });

    it('should handle undefined to defined', () => {
      const source = {} as Record<string, number>;
      const target = { a: 1 };
      const result = differ.diff(source, target);
      
      expect(result.patch.operations.length).toBeGreaterThan(0);
    });
  });

  describe('Path Escaping', () => {
    it('should escape slashes in property names', () => {
      const source = { 'a/b': 1 };
      const target = { 'a/b': 2 };
      const result = differ.diff(source, target);
      
      // Path should use JSON Pointer escaping
      expect(result.patch.operations.length).toBeGreaterThan(0);
      expect(result.patch.operations[0].path).toContain('~1');
    });

    it('should escape tildes in property names', () => {
      const source = { 'a~b': 1 };
      const target = { 'a~b': 2 };
      const result = differ.diff(source, target);
      
      expect(result.patch.operations.length).toBeGreaterThan(0);
      expect(result.patch.operations[0].path).toContain('~0');
    });
  });

  describe('Apply Patch', () => {
    it('should apply add operation', () => {
      const source = { a: 1 };
      const patch = createPatch([{ op: 'add', path: '/b', value: 2 }]);
      const result = differ.apply(source, patch);
      
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should apply remove operation', () => {
      const source = { a: 1, b: 2 };
      const patch = createPatch([{ op: 'remove', path: '/b' }]);
      const result = differ.apply(source, patch);
      
      expect(result).toEqual({ a: 1 });
    });

    it('should apply replace operation', () => {
      const source = { a: 1 };
      const patch = createPatch([{ op: 'replace', path: '/a', value: 2 }]);
      const result = differ.apply(source, patch);
      
      expect(result).toEqual({ a: 2 });
    });

    it('should apply multiple operations', () => {
      const source = { a: 1, b: 2 };
      const patch = createPatch([
        { op: 'replace', path: '/a', value: 10 },
        { op: 'add', path: '/c', value: 3 },
      ]);
      const result = differ.apply(source, patch);
      
      expect(result).toEqual({ a: 10, b: 2, c: 3 });
    });

    it('should apply nested path operations', () => {
      const source = { a: { b: { c: 1 } } };
      const patch = createPatch([{ op: 'replace', path: '/a/b/c', value: 2 }]);
      const result = differ.apply(source, patch);
      
      expect(result).toEqual({ a: { b: { c: 2 } } });
    });

    it('should not mutate source object', () => {
      const source = { a: 1 };
      const patch = createPatch([{ op: 'add', path: '/b', value: 2 }]);
      differ.apply(source, patch);
      
      expect(source).toEqual({ a: 1 });
    });
  });

  describe('Validation', () => {
    it('should validate correct patches', () => {
      const source = { a: 1 };
      const patch = createPatch([{ op: 'add', path: '/b', value: 2 }]);
      const result = differ.validate(source, patch);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid remove path', () => {
      const source = { a: 1 };
      const patch = createPatch([{ op: 'remove', path: '/nonexistent' }]);
      const result = differ.validate(source, patch);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Threshold Logic', () => {
    it('should indicate when fallback is needed', () => {
      // Create a large change to trigger fallback
      const source = { a: 1 };
      const target = { 
        a: 2, b: 3, c: 4, d: 5, e: 6, f: 7, g: 8, h: 9, i: 10,
        nested: { x: 1, y: 2, z: 3 }
      };
      const result = differ.diff(source, target);
      
      // Either fallback or has operations
      expect(result.ratio).toBeGreaterThan(0);
    });

    it('should provide size metrics', () => {
      const source = { a: 1 };
      const target = { a: 2, b: 3, c: 4 };
      const result = differ.diff(source, target);
      
      expect(result.patchSize).toBeGreaterThan(0);
      expect(result.fullStateSize).toBeGreaterThan(0);
    });
  });

  describe('Module Exports', () => {
    it('should export singleton differ', () => {
      expect(stateDiffer).toBeInstanceOf(StateDiffer);
    });

    it('should export convenience diff function', () => {
      const result = diff({ a: 1 }, { a: 2 });
      expect(result.patch).toBeDefined();
    });

    it('should export convenience applyPatch function', () => {
      const result = applyPatch({ a: 1 }, createPatch([
        { op: 'add', path: '/b', value: 2 },
      ]));
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should export convenience validatePatch function', () => {
      const result = validatePatch({ a: 1 }, createPatch([
        { op: 'add', path: '/b', value: 2 },
      ]));
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// SpectatorManager Tests
// ============================================================================

describe('SpectatorManager', () => {
  let manager: SpectatorManager;

  beforeEach(() => {
    resetSpectatorManager();
    manager = getSpectatorManager();
  });

  afterEach(() => {
    resetSpectatorManager();
  });

  describe('Session Management', () => {
    it('should initialize a spectator session', () => {
      const session = manager.initSession('game-1', 'snake');
      
      expect(session).toBeDefined();
      expect(session.sessionId).toBe('game-1');
      expect(session.gameType).toBe('snake');
    });

    it('should retrieve same session on re-init', () => {
      const session1 = manager.initSession('game-1', 'snake');
      const session2 = manager.initSession('game-1', 'snake');
      
      expect(session1).toBe(session2);
    });

    it('should close a session', () => {
      manager.initSession('game-1', 'snake');
      const closed = manager.closeSession('game-1');
      
      expect(closed).toBe(true);
    });
  });

  describe('Spectator Joining', () => {
    it('should add spectator to session', () => {
      manager.initSession('game-1', 'snake');
      const socket = createMockSocket();
      const result = manager.addSpectator('game-1', 'client-1', socket, 'User1');
      
      expect(result.success).toBe(true);
      expect(result.spectatorInfo).toBeDefined();
    });

    it('should reject spectator for non-existent session', () => {
      const socket = createMockSocket();
      const result = manager.addSpectator('nonexistent', 'client-1', socket);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject duplicate spectators', () => {
      manager.initSession('game-1', 'snake');
      const socket = createMockSocket();
      manager.addSpectator('game-1', 'client-1', socket, 'User1');
      const result = manager.addSpectator('game-1', 'client-1', socket, 'User1');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Already');
    });

    it('should enforce spectator limits', () => {
      manager.initSession('game-1', 'tictactoe');
      const config = GAME_SPECTATOR_CONFIGS['tictactoe'];
      
      // Add up to limit
      for (let i = 0; i < config.maxSpectators; i++) {
        const socket = createMockSocket();
        manager.addSpectator('game-1', `client-${i}`, socket, `User${i}`);
      }
      
      // Should reject next one
      const socket = createMockSocket();
      const result = manager.addSpectator('game-1', 'overflow', socket, 'Overflow');
      expect(result.success).toBe(false);
      expect(result.error).toContain('full');
    });
  });

  describe('Spectator Leaving', () => {
    it('should remove spectator', () => {
      manager.initSession('game-1', 'snake');
      const socket = createMockSocket();
      manager.addSpectator('game-1', 'client-1', socket, 'User1');
      
      const removed = manager.removeSpectator('client-1');
      expect(removed).toBe(true);
    });

    it('should return false for non-existent spectator', () => {
      const removed = manager.removeSpectator('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('Quality Tiers', () => {
    it('should set spectator quality', () => {
      manager.initSession('game-1', 'snake');
      const socket = createMockSocket();
      manager.addSpectator('game-1', 'client-1', socket, 'User1');
      
      manager.setSpectatorQuality('client-1', 'low');
      const info = manager.getSpectatorInfo('client-1');
      expect(info?.qualityTier).toBe('low');
    });

    it('should support all quality tiers', () => {
      manager.initSession('game-1', 'snake');
      const socket = createMockSocket();
      manager.addSpectator('game-1', 'client-1', socket, 'User1');
      
      const tiers: QualityTier[] = ['high', 'medium', 'low'];
      for (const tier of tiers) {
        manager.setSpectatorQuality('client-1', tier);
        const info = manager.getSpectatorInfo('client-1');
        expect(info?.qualityTier).toBe(tier);
      }
    });
  });

  describe('State Broadcasting', () => {
    it('should update state', () => {
      manager.initSession('game-1', 'snake');
      const socket = createMockSocket();
      manager.addSpectator('game-1', 'client-1', socket, 'User1');
      
      const state = { score: 100, snake: [[5, 5]] };
      manager.updateState('game-1', state);
      
      // State should be stored
      const session = manager.initSession('game-1', 'snake');
      expect(session.currentState).toEqual(state);
    });
  });

  describe('Statistics', () => {
    it('should track spectator count', () => {
      manager.initSession('game-1', 'snake');
      const socket1 = createMockSocket();
      const socket2 = createMockSocket();
      manager.addSpectator('game-1', 'client-1', socket1, 'User1');
      manager.addSpectator('game-1', 'client-2', socket2, 'User2');
      
      const count = manager.getSpectatorCount('game-1');
      expect(count).toBe(2);
    });

    it('should get global stats', () => {
      manager.initSession('game-1', 'snake');
      manager.initSession('game-2', 'dino');
      
      const stats = manager.getStats();
      expect(stats.totalSessions).toBe(2);
    });
  });

  describe('Game-Specific Configs', () => {
    it('should have config for snake', () => {
      const config = GAME_SPECTATOR_CONFIGS['snake'];
      expect(config).toBeDefined();
      expect(config.maxSpectators).toBeGreaterThan(0);
    });

    it('should have config for tictactoe', () => {
      const config = GAME_SPECTATOR_CONFIGS['tictactoe'];
      expect(config).toBeDefined();
      expect(config.maxSpectators).toBeGreaterThan(0);
    });

    it('should have config for dino', () => {
      const config = GAME_SPECTATOR_CONFIGS['dino'];
      expect(config).toBeDefined();
    });

    it('should use default for unknown games', () => {
      const session = manager.initSession('game-1', 'unknown');
      expect(session.config).toBeDefined();
      expect(session.config.maxSpectators).toBe(DEFAULT_SPECTATOR_CONFIG.maxSpectators);
    });
  });

  describe('Event Emission', () => {
    it('should emit spectator:join event', () => {
      manager.initSession('game-1', 'snake');
      const handler = vi.fn();
      manager.on('spectator:join', handler);
      
      const socket = createMockSocket();
      manager.addSpectator('game-1', 'client-1', socket, 'User1');
      
      expect(handler).toHaveBeenCalled();
    });

    it('should emit spectator:leave event', () => {
      manager.initSession('game-1', 'snake');
      const handler = vi.fn();
      manager.on('spectator:leave', handler);
      
      const socket = createMockSocket();
      manager.addSpectator('game-1', 'client-1', socket, 'User1');
      manager.removeSpectator('client-1');
      
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const manager1 = getSpectatorManager();
      const manager2 = getSpectatorManager();
      
      expect(manager1).toBe(manager2);
    });

    it('should reset instance', () => {
      const manager1 = getSpectatorManager();
      manager1.initSession('test', 'snake');
      
      resetSpectatorManager();
      const manager2 = getSpectatorManager();
      
      expect(manager2.getStats().totalSessions).toBe(0);
    });
  });
});

// ============================================================================
// ChatManager Tests
// ============================================================================

describe('ChatManager', () => {
  let chat: ChatManager;

  beforeEach(() => {
    resetChatManager();
    chat = getChatManager();
  });

  afterEach(() => {
    resetChatManager();
  });

  describe('Room Management', () => {
    it('should create a chat room', () => {
      const room = chat.createRoom('room-1', 'Test Room', 'game');
      
      expect(room).toBeDefined();
      expect(room.id).toBe('room-1');
      expect(room.name).toBe('Test Room');
      expect(room.type).toBe('game');
    });

    it('should reject duplicate room ids', () => {
      chat.createRoom('room-1', 'Test Room', 'game');
      
      expect(() => {
        chat.createRoom('room-1', 'Another Room', 'game');
      }).toThrow();
    });

    it('should get or create game room', () => {
      const room1 = chat.getOrCreateGameRoom('game-1', 'Snake');
      const room2 = chat.getOrCreateGameRoom('game-1', 'Snake');
      
      expect(room1.id).toBe(room2.id);
    });

    it('should delete room', () => {
      chat.createRoom('room-1', 'Test Room', 'game');
      const deleted = chat.deleteRoom('room-1');
      
      expect(deleted).toBe(true);
      expect(chat.getRoom('room-1')).toBeUndefined();
    });
  });

  describe('Participant Management', () => {
    it('should allow joining a room', () => {
      chat.createRoom('room-1', 'Test Room', 'game');
      const result = chat.join('room-1', 'user-1', 'TestUser');
      
      expect(result.success).toBe(true);
    });

    it('should reject joining non-existent room', () => {
      const result = chat.join('nonexistent', 'user-1', 'TestUser');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should allow multiple users', () => {
      chat.createRoom('room-1', 'Test Room', 'game');
      chat.join('room-1', 'user-1', 'User1');
      chat.join('room-1', 'user-2', 'User2');
      
      expect(chat.getParticipantCount('room-1')).toBe(2);
    });

    it('should track participant roles', () => {
      chat.createRoom('room-1', 'Test Room', 'game');
      chat.join('room-1', 'user-1', 'User1', 'moderator');
      
      const participants = chat.getParticipants('room-1');
      expect(participants[0].role).toBe('moderator');
    });

    it('should allow leaving a room', () => {
      chat.createRoom('room-1', 'Test Room', 'game');
      chat.join('room-1', 'user-1', 'TestUser');
      
      const left = chat.leave('room-1', 'user-1');
      expect(left).toBe(true);
      expect(chat.getParticipantCount('room-1')).toBe(0);
    });
  });

  describe('Messaging', () => {
    beforeEach(() => {
      chat.createRoom('room-1', 'Test Room', 'game');
      chat.join('room-1', 'user-1', 'TestUser');
    });

    it('should send a message', () => {
      const result = chat.sendMessage('room-1', 'user-1', 'Hello, world!');
      
      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message?.content).toBe('Hello, world!');
    });

    it('should reject empty messages', () => {
      const result = chat.sendMessage('room-1', 'user-1', '   ');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty');
    });

    it('should reject messages over 500 chars', () => {
      const longMessage = 'a'.repeat(501);
      const result = chat.sendMessage('room-1', 'user-1', longMessage);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should reject messages from non-participants', () => {
      const result = chat.sendMessage('room-1', 'stranger', 'Hello');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Not in room');
    });

    it('should store message in history', () => {
      chat.sendMessage('room-1', 'user-1', 'Test message');
      
      const history = chat.getHistory('room-1');
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Test message');
    });

    it('should support reply to', () => {
      const { message: original } = chat.sendMessage('room-1', 'user-1', 'Original');
      const result = chat.sendMessage('room-1', 'user-1', 'Reply', {
        replyTo: original?.id,
      });
      
      expect(result.message?.replyTo).toBe(original?.id);
    });

    it('should send system messages', () => {
      const message = chat.sendSystemMessage('room-1', 'Welcome!');
      
      expect(message).toBeDefined();
      expect(message?.type).toBe('system');
      expect(message?.senderId).toBe('system');
    });
  });

  describe('Reactions', () => {
    let messageId: string;

    beforeEach(() => {
      chat.createRoom('room-1', 'Test Room', 'game');
      chat.join('room-1', 'user-1', 'User1');
      chat.join('room-1', 'user-2', 'User2');
      const { message } = chat.sendMessage('room-1', 'user-1', 'React to this');
      messageId = message!.id;
    });

    it('should add reaction to message', () => {
      const result = chat.addReaction('room-1', messageId, 'user-2', '👍');
      
      expect(result.success).toBe(true);
    });

    it('should reject duplicate reactions', () => {
      chat.addReaction('room-1', messageId, 'user-2', '👍');
      const result = chat.addReaction('room-1', messageId, 'user-2', '👍');
      
      expect(result.success).toBe(false);
    });

    it('should allow multiple emoji from same user', () => {
      chat.addReaction('room-1', messageId, 'user-2', '👍');
      const result = chat.addReaction('room-1', messageId, 'user-2', '❤️');
      
      expect(result.success).toBe(true);
    });

    it('should remove reaction', () => {
      chat.addReaction('room-1', messageId, 'user-2', '👍');
      const result = chat.removeReaction('room-1', messageId, 'user-2', '👍');
      
      expect(result.success).toBe(true);
    });

    it('should get reaction counts', () => {
      chat.addReaction('room-1', messageId, 'user-1', '👍');
      chat.addReaction('room-1', messageId, 'user-2', '👍');
      
      const counts = chat.getMessageReactions(messageId);
      expect(counts.get('👍')).toBe(2);
    });
  });

  describe('Moderation', () => {
    beforeEach(() => {
      chat.createRoom('room-1', 'Test Room', 'game');
      chat.join('room-1', 'mod-1', 'Moderator', 'moderator');
      chat.join('room-1', 'user-1', 'User1', 'viewer');
    });

    it('should mute user', () => {
      const result = chat.muteUser('room-1', 'user-1', 'mod-1', 60000);
      
      expect(result.success).toBe(true);
    });

    it('should reject messages from muted users', () => {
      chat.muteUser('room-1', 'user-1', 'mod-1', 60000);
      const result = chat.sendMessage('room-1', 'user-1', 'Hello');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Muted');
    });

    it('should unmute user', () => {
      chat.muteUser('room-1', 'user-1', 'mod-1', 60000);
      chat.unmuteUser('room-1', 'user-1', 'mod-1');
      
      const result = chat.sendMessage('room-1', 'user-1', 'Hello');
      expect(result.success).toBe(true);
    });

    it('should kick user', () => {
      const result = chat.kickUser('room-1', 'user-1', 'mod-1');
      
      expect(result.success).toBe(true);
      expect(chat.getParticipantCount('room-1')).toBe(1);  // Only mod left
    });

    it('should prevent non-mods from moderating', () => {
      chat.join('room-1', 'user-2', 'User2', 'viewer');
      
      const result = chat.muteUser('room-1', 'user-1', 'user-2', 60000);
      expect(result.success).toBe(false);
      expect(result.error).toContain('moderator');
    });

    it('should delete message', () => {
      const { message } = chat.sendMessage('room-1', 'user-1', 'Bad message');
      const result = chat.deleteMessage('room-1', message!.id, 'mod-1');
      
      expect(result.success).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      chat.createRoom('room-1', 'Test Room', 'game');
      chat.join('room-1', 'user-1', 'TestUser');
    });

    it('should allow normal message rate', () => {
      const result = chat.sendMessage('room-1', 'user-1', 'Message 1');
      expect(result.success).toBe(true);
    });

    // Rate limiting is tested separately in ChatRateLimiter tests
  });

  describe('Event System', () => {
    it('should emit events on message', () => {
      chat.createRoom('room-1', 'Test Room', 'game');
      chat.join('room-1', 'user-1', 'TestUser');
      
      const handler = vi.fn();
      chat.subscribe('room-1', handler);
      chat.sendMessage('room-1', 'user-1', 'Hello');
      
      expect(handler).toHaveBeenCalled();
    });

    it('should unsubscribe from events', () => {
      chat.createRoom('room-1', 'Test Room', 'game');
      
      const handler = vi.fn();
      const unsubscribe = chat.subscribe('room-1', handler);
      
      chat.join('room-1', 'user-1', 'TestUser');
      const callsAfterJoin = handler.mock.calls.length;
      
      unsubscribe();
      
      chat.sendMessage('room-1', 'user-1', 'Hello');
      expect(handler.mock.calls.length).toBe(callsAfterJoin);
    });
  });

  describe('History & Stats', () => {
    beforeEach(() => {
      chat.createRoom('room-1', 'Test Room', 'game');
      chat.join('room-1', 'user-1', 'User1');
      chat.join('room-1', 'user-2', 'User2');
    });

    it('should get message history', () => {
      chat.sendMessage('room-1', 'user-1', 'Message 1');
      chat.sendMessage('room-1', 'user-2', 'Message 2');
      
      const history = chat.getHistory('room-1');
      expect(history).toHaveLength(2);
    });

    it('should limit history results', () => {
      for (let i = 0; i < 10; i++) {
        chat.sendMessage('room-1', 'user-1', `Message ${i}`);
      }
      
      const history = chat.getHistory('room-1', 5);
      // Returns last N messages
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should get room stats', () => {
      chat.sendMessage('room-1', 'user-1', 'Hello');
      chat.sendMessage('room-1', 'user-2', 'Hi there');
      
      const stats = chat.getRoomStats('room-1');
      
      expect(stats).toBeDefined();
      expect(stats?.totalMessages).toBe(2);
      expect(stats?.uniqueParticipants).toBe(2);
    });
  });

  describe('Quick Reactions', () => {
    it('should have default quick reactions', () => {
      expect(QUICK_REACTIONS).toContain('👍');
      expect(QUICK_REACTIONS).toContain('❤️');
    });

    it('should have game-specific emotes', () => {
      expect(GAME_EMOTES['snake']).toContain('🐍');
      expect(GAME_EMOTES['dino']).toContain('🦖');
    });

    it('should get combined reactions for game', () => {
      const reactions = chat.getQuickReactions('snake');
      
      expect(reactions).toContain('👍');  // Default
      expect(reactions).toContain('🐍');  // Snake-specific
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const chat1 = getChatManager();
      const chat2 = getChatManager();
      
      expect(chat1).toBe(chat2);
    });

    it('should reset instance', () => {
      getChatManager().createRoom('test', 'Test', 'game');
      
      resetChatManager();
      const newChat = getChatManager();
      
      expect(newChat.getRoom('test')).toBeUndefined();
    });
  });
});

// ============================================================================
// ChatRateLimiter Tests
// ============================================================================

describe('ChatRateLimiter', () => {
  let limiter: ChatRateLimiter;

  beforeEach(() => {
    limiter = new ChatRateLimiter({
      messagesPerSecond: 2,
      messagesPerMinute: 10,
      burstLimit: 3,
      cooldownMs: 500,
    });
  });

  it('should allow first message', () => {
    const result = limiter.canSend('user-1');
    expect(result.allowed).toBe(true);
  });

  it('should allow messages within rate', () => {
    limiter.recordMessage('user-1');
    
    const result = limiter.canSend('user-1');
    expect(result.allowed).toBe(true);
  });

  it('should reset user state', () => {
    limiter.recordMessage('user-1');
    limiter.recordMessage('user-1');
    limiter.recordMessage('user-1');
    
    limiter.reset('user-1');
    
    const result = limiter.canSend('user-1');
    expect(result.allowed).toBe(true);
  });

  it('should track separate users independently', () => {
    // Fill up user-1
    for (let i = 0; i < 10; i++) {
      limiter.recordMessage('user-1');
    }
    
    // user-2 should still be allowed
    const result = limiter.canSend('user-2');
    expect(result.allowed).toBe(true);
  });
});

// ============================================================================
// MessageHistory Tests
// ============================================================================

describe('MessageHistory', () => {
  let history: MessageHistory;

  beforeEach(() => {
    history = new MessageHistory(10);  // Keep only 10 messages
  });

  it('should add and retrieve messages', () => {
    const message: ChatMessage = {
      id: 'msg-1',
      type: 'text',
      senderId: 'user-1',
      senderName: 'User',
      content: 'Hello',
      timestamp: Date.now(),
      roomId: 'room-1',
    };
    
    history.addMessage(message);
    const messages = history.getMessages('room-1');
    
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello');
  });

  it('should enforce retention limit', () => {
    for (let i = 0; i < 15; i++) {
      history.addMessage({
        id: `msg-${i}`,
        type: 'text',
        senderId: 'user-1',
        senderName: 'User',
        content: `Message ${i}`,
        timestamp: Date.now() + i,
        roomId: 'room-1',
      });
    }
    
    const messages = history.getMessages('room-1');
    expect(messages.length).toBeLessThanOrEqual(10);
  });

  it('should delete messages', () => {
    history.addMessage({
      id: 'msg-1',
      type: 'text',
      senderId: 'user-1',
      senderName: 'User',
      content: 'Hello',
      timestamp: Date.now(),
      roomId: 'room-1',
    });
    
    const deleted = history.deleteMessage('msg-1');
    expect(deleted).toBe(true);
    expect(history.getMessages('room-1')).toHaveLength(0);
  });

  it('should manage reactions', () => {
    history.addMessage({
      id: 'msg-1',
      type: 'text',
      senderId: 'user-1',
      senderName: 'User',
      content: 'Hello',
      timestamp: Date.now(),
      roomId: 'room-1',
    });
    
    history.addReaction({
      messageId: 'msg-1',
      userId: 'user-2',
      emoji: '👍',
      timestamp: Date.now(),
    });
    
    const reactions = history.getReactions('msg-1');
    expect(reactions).toHaveLength(1);
  });

  it('should clear room', () => {
    history.addMessage({
      id: 'msg-1',
      type: 'text',
      senderId: 'user-1',
      senderName: 'User',
      content: 'Hello',
      timestamp: Date.now(),
      roomId: 'room-1',
    });
    
    history.clearRoom('room-1');
    expect(history.getMessages('room-1')).toHaveLength(0);
  });
});
