/**
 * Liku-AI WebSocket Protocol Constants
 * 
 * Defines the protocol version, message types, and constants
 * for AI agent communication.
 * 
 * @module websocket/protocol
 */

/**
 * Protocol version - increment on breaking changes
 */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Default WebSocket port
 */
export const DEFAULT_PORT = 3847;

/**
 * Message types for client -> server communication
 */
export enum ClientMessageType {
  /** Send a keyboard key */
  KEY = 'key',
  /** Send a high-level action */
  ACTION = 'action',
  /** Query game state or data */
  QUERY = 'query',
  /** Ping for connection health */
  PING = 'ping',
  /** Subscribe to specific events */
  SUBSCRIBE = 'subscribe',
  /** Unsubscribe from events */
  UNSUBSCRIBE = 'unsubscribe',
}

/**
 * Message types for server -> client communication
 */
export enum ServerMessageType {
  /** Game state update */
  STATE = 'state',
  /** Command acknowledgment */
  ACK = 'ack',
  /** Query result */
  RESULT = 'result',
  /** Error response */
  ERROR = 'error',
  /** Pong response */
  PONG = 'pong',
  /** Game event notification */
  EVENT = 'event',
  /** Welcome message on connect */
  WELCOME = 'welcome',
}

/**
 * Game event types
 */
export enum GameEventType {
  // Lifecycle events
  GAME_START = 'game:start',
  GAME_END = 'game:end',
  GAME_PAUSE = 'game:pause',
  GAME_RESUME = 'game:resume',
  
  // Score events
  SCORE_UPDATE = 'score:update',
  LEVEL_UP = 'level:up',
  HIGH_SCORE = 'highscore:new',
  
  // Game-specific events
  COLLISION = 'collision',
  POWER_UP = 'powerup',
  OBSTACLE_SPAWN = 'obstacle:spawn',
  FOOD_SPAWN = 'food:spawn',
  FOOD_EATEN = 'food:eaten',
  
  // TicTacToe events
  MOVE_MADE = 'move:made',
  TURN_CHANGE = 'turn:change',
  
  // Player events
  PLAYER_DIED = 'player:died',
  PLAYER_RESPAWN = 'player:respawn',
  
  // AI events
  AI_RECOMMENDATION = 'ai:recommendation',
  DANGER_WARNING = 'danger:warning',
  ACTION_RECEIVED = 'action:received',
  
  // Connection events
  CLIENT_CONNECTED = 'client:connected',
  CLIENT_DISCONNECTED = 'client:disconnected',
}

/**
 * Error codes for standardized error handling
 */
export enum ErrorCode {
  // Connection errors (1xxx)
  CONNECTION_FAILED = 1001,
  CONNECTION_CLOSED = 1002,
  AUTHENTICATION_REQUIRED = 1003,
  AUTHENTICATION_FAILED = 1004,
  
  // Rate limiting (2xxx)
  RATE_LIMITED = 2001,
  BANNED = 2002,
  BURST_LIMIT = 2003,
  
  // Validation errors (3xxx)
  INVALID_JSON = 3001,
  INVALID_MESSAGE_TYPE = 3002,
  INVALID_KEY = 3003,
  INVALID_ACTION = 3004,
  INVALID_QUERY = 3005,
  MISSING_FIELD = 3006,
  
  // Game errors (4xxx)
  GAME_NOT_RUNNING = 4001,
  ACTION_NOT_AVAILABLE = 4002,
  INVALID_GAME_STATE = 4003,
  
  // Server errors (5xxx)
  INTERNAL_ERROR = 5001,
  QUERY_TIMEOUT = 5002,
  SERVICE_UNAVAILABLE = 5003,
}

/**
 * Error code to human-readable message mapping
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.CONNECTION_FAILED]: 'Failed to establish connection',
  [ErrorCode.CONNECTION_CLOSED]: 'Connection was closed',
  [ErrorCode.AUTHENTICATION_REQUIRED]: 'Authentication is required',
  [ErrorCode.AUTHENTICATION_FAILED]: 'Authentication failed',
  [ErrorCode.RATE_LIMITED]: 'Too many requests - slow down',
  [ErrorCode.BANNED]: 'Client has been banned due to abuse',
  [ErrorCode.BURST_LIMIT]: 'Commands sent too quickly',
  [ErrorCode.INVALID_JSON]: 'Invalid JSON in message',
  [ErrorCode.INVALID_MESSAGE_TYPE]: 'Unknown message type',
  [ErrorCode.INVALID_KEY]: 'Invalid keyboard key',
  [ErrorCode.INVALID_ACTION]: 'Invalid game action',
  [ErrorCode.INVALID_QUERY]: 'Invalid query type',
  [ErrorCode.MISSING_FIELD]: 'Required field is missing',
  [ErrorCode.GAME_NOT_RUNNING]: 'No game is currently running',
  [ErrorCode.ACTION_NOT_AVAILABLE]: 'Action not available in current state',
  [ErrorCode.INVALID_GAME_STATE]: 'Game is in an invalid state',
  [ErrorCode.INTERNAL_ERROR]: 'Internal server error',
  [ErrorCode.QUERY_TIMEOUT]: 'Query timed out',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
};

/**
 * State broadcast intervals (ms)
 */
export const BROADCAST_INTERVALS = {
  /** Fast updates during active gameplay */
  ACTIVE: 50,
  /** Slower updates when in menus */
  MENU: 200,
  /** Minimal updates when paused */
  PAUSED: 1000,
};

/**
 * Connection health check intervals (ms)
 */
export const HEARTBEAT = {
  /** Time between ping messages */
  INTERVAL: 30000,
  /** Time to wait for pong before considering dead */
  TIMEOUT: 10000,
};

/**
 * Maximum payload sizes (bytes)
 */
export const MAX_PAYLOAD = {
  /** Maximum incoming message size */
  INCOMING: 4096,
  /** Maximum state broadcast size */
  STATE: 65536,
  /** Maximum query result size */
  QUERY_RESULT: 262144,
};

/**
 * Default configuration for the WebSocket server
 */
export const SERVER_DEFAULTS = {
  port: DEFAULT_PORT,
  maxClients: 100,
  stateInterval: BROADCAST_INTERVALS.ACTIVE,
  enableCompression: false,
  enableHeartbeat: true,
};

/**
 * Client configuration defaults
 */
export const CLIENT_DEFAULTS = {
  reconnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: 10,
  reconnectBackoff: 1.5,
  requestTimeout: 5000,
};

/**
 * Create a standardized error response
 */
export function createError(code: ErrorCode, details?: string): {
  code: ErrorCode;
  message: string;
  details?: string;
} {
  return {
    code,
    message: ERROR_MESSAGES[code],
    details,
  };
}

/**
 * Validate an incoming message structure
 */
export function validateMessage(data: unknown): { valid: boolean; error?: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Message must be an object' };
  }

  const msg = data as Record<string, unknown>;

  if (!msg.type || typeof msg.type !== 'string') {
    return { valid: false, error: 'Message must have a type field' };
  }

  const validTypes = Object.values(ClientMessageType);
  if (!validTypes.includes(msg.type as ClientMessageType)) {
    return { valid: false, error: `Invalid message type: ${msg.type}` };
  }

  // Type-specific validation
  switch (msg.type) {
    case ClientMessageType.KEY:
      if (!msg.payload || typeof (msg.payload as Record<string, unknown>).key !== 'string') {
        return { valid: false, error: 'Key command requires payload.key' };
      }
      break;
    case ClientMessageType.ACTION:
      if (!msg.payload || typeof (msg.payload as Record<string, unknown>).action !== 'string') {
        return { valid: false, error: 'Action command requires payload.action' };
      }
      break;
    case ClientMessageType.QUERY:
      if (!msg.payload || typeof (msg.payload as Record<string, unknown>).query !== 'string') {
        return { valid: false, error: 'Query command requires payload.query' };
      }
      break;
  }

  return { valid: true };
}
