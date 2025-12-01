/**
 * Liku-AI WebSocket Module
 * 
 * Export server, client, router, state management, events, queries, agents, and protocol
 * for real-time AI communication
 * 
 * @see https://github.com/websockets/ws - WebSocket library
 * @see docs/WEBSOCKET_PROTOCOL.md - Protocol specification
 */

// Server
export { LikuWebSocketServer, wsServer } from './server.js';
export type { GameState, AICommand, AIResponse, ServerConfig, ServerStats } from './server.js';

// Client
export { LikuAIClient, ConnectionState } from './client.js';
export type { LikuClientOptions } from './client.js';

// Command Router
export { CommandRouter, commandRouter } from './router.js';
export type { 
  RateLimitConfig, 
  GameAction, 
  ValidKey, 
  QueryType 
} from './router.js';

// State Management
export { 
  stateManager,
  createDinoState,
  createSnakeState,
  createTicTacToeState,
} from './state.js';
export type {
  UnifiedGameState,
  StructuredGameData,
  DinoGameState,
  SnakeGameState,
  TicTacToeGameState,
  MenuState,
} from './state.js';

// Query System (Phase 2.3)
export { QueryManager, queryManager } from './queries.js';
export type { QueryResult } from './queries.js';

// Event System (Phase 2.4)
export { 
  EventManager, 
  eventManager,
  // Convenience event emitters
  emitGameStart,
  emitGameEnd,
  emitGamePause,
  emitGameResume,
  emitScoreUpdate,
  emitLevelUp,
  emitCollision,
  emitPowerup,
  emitObstacleSpawn,
  emitFoodSpawn,
  emitFoodEaten,
  emitMoveMade,
  emitTurnChange,
  emitActionReceived,
  emitClientConnected,
  emitClientDisconnected,
} from './events.js';
export type { GameEvent, EventFilter } from './events.js';

// Agent System (Phase 3.1)
export { 
  AgentManager,
  agentManager,
  AgentRole,
} from './agents.js';
export type { 
  AgentInfo, 
  AgentSession, 
  AgentCredentials, 
  AgentMetrics,
  PermissionCheck,
} from './agents.js';

// Turn Management (Phase 3.2)
export { 
  TurnManager,
  turnManager,
  TurnMode,
  CommandPriority,
  DEFAULT_TURN_CONFIG,
} from './turns.js';
export type { 
  TurnConfig, 
  AgentTurnState, 
  QueuedCommand,
} from './turns.js';

// Coordination (Phase 3.3)
export {
  CoordinationManager,
  coordinationManager,
  CoordinationMessageType,
  PrimitiveType,
} from './coordination.js';
export type {
  AgentMessage,
  Lock,
  Barrier,
  SharedState,
  AgentTeam,
  CoordinationResult,
} from './coordination.js';

// Game Sessions (Phase 3.4 - AI-vs-AI)
export {
  GameSessionManager,
  gameSessionManager,
  DEFAULT_SESSION_CONFIG,
} from './sessions.js';
export type {
  GameType,
  TicTacToeSlot,
  ChessSlot,
  PlayerSlot,
  GameMode,
  PlayerType,
  SessionPlayer,
  TicTacToeCell,
  TicTacToeSessionState,
  GameSessionState,
  MoveResult,
  SessionConfig,
  GameSession,
} from './sessions.js';

// Protocol
export {
  PROTOCOL_VERSION,
  DEFAULT_PORT,
  ClientMessageType,
  ServerMessageType,
  GameEventType,
  ErrorCode,
  ERROR_MESSAGES,
  BROADCAST_INTERVALS,
  HEARTBEAT,
  MAX_PAYLOAD,
  SERVER_DEFAULTS,
  CLIENT_DEFAULTS,
  createError,
  validateMessage,
} from './protocol.js';
