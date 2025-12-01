/**
 * Event Streaming System for Liku-AI WebSocket API
 * 
 * Implements Phase 2.4 event streaming for real-time game events:
 * - game:start, game:end, game:pause
 * - score:update, level:up
 * - collision, powerup, obstacle:spawn
 * 
 * Features:
 * - Event type filtering (clients subscribe to specific events)
 * - Event timestamps for replay synchronization
 * - Event history for debugging/training
 * 
 * @see https://github.com/websockets/ws - WebSocket library
 * @see docs/WEBSOCKET_PROTOCOL.md - Protocol specification
 */

import { EventEmitter } from 'events';
import { GameEventType } from './protocol.js';

/**
 * Game event with full metadata
 */
export interface GameEvent {
  /** Event type identifier */
  type: GameEventType | string;
  /** Event data payload */
  data: Record<string, unknown>;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Unique event ID for deduplication */
  eventId: string;
  /** Game type this event originated from */
  source: 'dino' | 'snake' | 'tictactoe' | 'menu' | 'system';
  /** Sequential event number for ordering */
  sequence: number;
}

/**
 * Event subscription filter
 */
export interface EventFilter {
  /** Event types to include (empty = all) */
  types?: string[];
  /** Game sources to include (empty = all) */
  sources?: string[];
  /** Only events after this timestamp */
  after?: number;
}

/**
 * Event subscriber callback
 */
type EventCallback = (event: GameEvent) => void;

/**
 * EventManager - Handles game event emission and subscriptions
 * 
 * Provides a centralized event bus for all game events with:
 * - Type-safe event emission
 * - Filtered subscriptions
 * - Event history for replay
 */
export class EventManager extends EventEmitter {
  private eventHistory: GameEvent[] = [];
  private maxHistorySize = 500;
  private eventCounter = 0;
  private subscribers: Map<string, { callback: EventCallback; filter: EventFilter }> = new Map();

  /**
   * Emit a game event
   */
  emitGameEvent(
    type: GameEventType | string,
    data: Record<string, unknown>,
    source: GameEvent['source'] = 'system'
  ): GameEvent {
    const event: GameEvent = {
      type,
      data,
      timestamp: Date.now(),
      eventId: `evt_${++this.eventCounter}_${Date.now()}`,
      source,
      sequence: this.eventCounter,
    };

    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Emit to EventEmitter listeners
    this.emit('event', event);
    this.emit(type, event);

    // Notify filtered subscribers
    for (const [, sub] of this.subscribers) {
      if (this.matchesFilter(event, sub.filter)) {
        try {
          sub.callback(event);
        } catch (err) {
          console.error('[EventManager] Subscriber error:', err);
        }
      }
    }

    return event;
  }

  /**
   * Subscribe to events with optional filter
   * Returns subscription ID for unsubscribing
   */
  subscribe(callback: EventCallback, filter: EventFilter = {}): string {
    const subId = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.subscribers.set(subId, { callback, filter });
    return subId;
  }

  /**
   * Unsubscribe using subscription ID
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscribers.delete(subscriptionId);
  }

  /**
   * Check if an event matches a filter
   */
  private matchesFilter(event: GameEvent, filter: EventFilter): boolean {
    // Type filter
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(event.type)) {
        return false;
      }
    }

    // Source filter
    if (filter.sources && filter.sources.length > 0) {
      if (!filter.sources.includes(event.source)) {
        return false;
      }
    }

    // Timestamp filter
    if (filter.after && event.timestamp <= filter.after) {
      return false;
    }

    return true;
  }

  /**
   * Get event history with optional filter
   */
  getHistory(filter?: EventFilter, limit?: number): GameEvent[] {
    let events = this.eventHistory;

    if (filter) {
      events = events.filter(e => this.matchesFilter(e, filter));
    }

    if (limit) {
      events = events.slice(-limit);
    }

    return [...events];
  }

  /**
   * Get events since a specific sequence number
   * Useful for replay/sync
   */
  getEventsSince(sequence: number): GameEvent[] {
    return this.eventHistory.filter(e => e.sequence > sequence);
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get current event counter (for sync)
   */
  getSequence(): number {
    return this.eventCounter;
  }

  /**
   * Reset the event manager
   */
  reset(): void {
    this.eventHistory = [];
    this.eventCounter = 0;
    this.subscribers.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
export const eventManager = new EventManager();

// ===== Convenience Event Emitters =====

/**
 * Emit game start event
 */
export function emitGameStart(
  game: 'dino' | 'snake' | 'tictactoe',
  data: { difficulty?: string; mode?: string } = {}
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.GAME_START, {
    game,
    ...data,
  }, game);
}

/**
 * Emit game end event
 */
export function emitGameEnd(
  game: 'dino' | 'snake' | 'tictactoe',
  data: { score: number; won: boolean; reason?: string }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.GAME_END, {
    game,
    ...data,
  }, game);
}

/**
 * Emit game pause event
 */
export function emitGamePause(game: 'dino' | 'snake' | 'tictactoe'): GameEvent {
  return eventManager.emitGameEvent(GameEventType.GAME_PAUSE, { game }, game);
}

/**
 * Emit game resume event
 */
export function emitGameResume(game: 'dino' | 'snake' | 'tictactoe'): GameEvent {
  return eventManager.emitGameEvent(GameEventType.GAME_RESUME, { game }, game);
}

/**
 * Emit score update event
 */
export function emitScoreUpdate(
  game: 'dino' | 'snake' | 'tictactoe',
  data: { previousScore: number; newScore: number; delta: number; cause?: string }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.SCORE_UPDATE, {
    game,
    ...data,
  }, game);
}

/**
 * Emit level up event
 */
export function emitLevelUp(
  game: 'snake',
  data: { previousLevel: number; newLevel: number; xpEarned?: number }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.LEVEL_UP, {
    game,
    ...data,
  }, game);
}

/**
 * Emit collision event
 */
export function emitCollision(
  game: 'dino' | 'snake',
  data: { collisionType: string; position?: { x: number; y: number }; fatal: boolean }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.COLLISION, {
    game,
    ...data,
  }, game);
}

/**
 * Emit powerup event
 */
export function emitPowerup(
  game: 'snake',
  data: { powerupType: string; effect: string; duration?: number }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.POWER_UP, {
    game,
    ...data,
  }, game);
}

/**
 * Emit obstacle spawn event
 */
export function emitObstacleSpawn(
  game: 'dino',
  data: { obstacleType: string; position: { x: number; y: number }; isFlying: boolean }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.OBSTACLE_SPAWN, {
    game,
    ...data,
  }, game);
}

/**
 * Emit food spawn event (Snake)
 */
export function emitFoodSpawn(
  data: { foodType: string; position: { x: number; y: number } }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.FOOD_SPAWN, data, 'snake');
}

/**
 * Emit food eaten event (Snake)
 */
export function emitFoodEaten(
  data: { foodType: string; position: { x: number; y: number }; pointsAwarded: number }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.FOOD_EATEN, data, 'snake');
}

/**
 * Emit move made event (TicTacToe)
 */
export function emitMoveMade(
  data: { player: 'X' | 'O'; position: { row: number; col: number }; moveNumber: number }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.MOVE_MADE, data, 'tictactoe');
}

/**
 * Emit turn change event (TicTacToe)
 */
export function emitTurnChange(
  data: { previousPlayer: 'X' | 'O'; currentPlayer: 'X' | 'O' }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.TURN_CHANGE, data, 'tictactoe');
}

/**
 * Emit action received event (for debugging/training)
 */
export function emitActionReceived(
  data: { action: string; clientId: string; game: string }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.ACTION_RECEIVED, data, 'system');
}

/**
 * Emit client connected event
 */
export function emitClientConnected(
  data: { clientId: string; totalClients: number }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.CLIENT_CONNECTED, data, 'system');
}

/**
 * Emit client disconnected event
 */
export function emitClientDisconnected(
  data: { clientId: string; totalClients: number; duration: number }
): GameEvent {
  return eventManager.emitGameEvent(GameEventType.CLIENT_DISCONNECTED, data, 'system');
}
