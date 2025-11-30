/**
 * Liku-AI WebSocket Module
 * 
 * Export server and client for real-time AI communication
 */

export { LikuWebSocketServer, wsServer } from './server.js';
export { LikuAIClient } from './client.js';
export type { GameState, AICommand, AIResponse } from './server.js';
export type { LikuClientOptions } from './client.js';
