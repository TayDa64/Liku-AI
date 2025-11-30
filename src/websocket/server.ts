/**
 * Liku-AI WebSocket Server
 * 
 * Real-time bidirectional communication for AI agents
 * Replaces file-based state polling with event-driven push model
 * 
 * Target latency: <5ms (vs 50-100ms with file polling)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';

export interface GameState {
  timestamp: number;
  pid: number;
  screen: string;
  status: string;
  game?: {
    type: 'dino' | 'snake' | 'tictactoe' | 'menu';
    data: Record<string, unknown>;
  };
}

export interface AICommand {
  type: 'key' | 'action' | 'query';
  payload: {
    key?: string;
    action?: string;
    query?: string;
  };
  requestId?: string;
}

export interface AIResponse {
  type: 'state' | 'ack' | 'error' | 'result';
  requestId?: string;
  data: unknown;
  timestamp: number;
}

export class LikuWebSocketServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private currentState: GameState | null = null;
  private port: number;

  constructor(port: number = 3847) {
    super();
    this.port = port;
  }

  /**
   * Start the WebSocket server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port });
        
        this.wss.on('connection', (ws: WebSocket) => {
          this.clients.add(ws);
          console.log(`[WS] Client connected (total: ${this.clients.size})`);
          
          // Send current state immediately on connect
          if (this.currentState) {
            this.sendToClient(ws, {
              type: 'state',
              data: this.currentState,
              timestamp: Date.now()
            });
          }
          
          ws.on('message', (data) => {
            try {
              const command: AICommand = JSON.parse(data.toString());
              this.handleCommand(ws, command);
            } catch (e) {
              this.sendToClient(ws, {
                type: 'error',
                data: { message: 'Invalid JSON' },
                timestamp: Date.now()
              });
            }
          });
          
          ws.on('close', () => {
            this.clients.delete(ws);
            console.log(`[WS] Client disconnected (total: ${this.clients.size})`);
          });
          
          ws.on('error', (err) => {
            console.error('[WS] Client error:', err.message);
            this.clients.delete(ws);
          });
        });
        
        this.wss.on('listening', () => {
          console.log(`[WS] Liku-AI WebSocket server listening on port ${this.port}`);
          resolve();
        });
        
        this.wss.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        // Close all client connections
        for (const client of this.clients) {
          client.close(1000, 'Server shutting down');
        }
        this.clients.clear();
        
        this.wss.close(() => {
          console.log('[WS] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Broadcast game state to all connected clients
   * This is the primary real-time update mechanism
   */
  broadcastState(state: GameState): void {
    this.currentState = state;
    
    const message: AIResponse = {
      type: 'state',
      data: state,
      timestamp: Date.now()
    };
    
    this.broadcast(message);
  }

  /**
   * Handle incoming command from AI client
   */
  private handleCommand(ws: WebSocket, command: AICommand): void {
    // Emit event for game to handle
    this.emit('command', command);
    
    // Send acknowledgment
    this.sendToClient(ws, {
      type: 'ack',
      requestId: command.requestId,
      data: { received: true },
      timestamp: Date.now()
    });
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(ws: WebSocket, message: AIResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: AIResponse): void {
    const json = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }

  /**
   * Get number of connected clients
   */
  get clientCount(): number {
    return this.clients.size;
  }
}

// Singleton instance
export const wsServer = new LikuWebSocketServer();
