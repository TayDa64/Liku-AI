/**
 * Liku-AI WebSocket Client
 * 
 * Simplified client for AI agents to connect to Liku-AI
 * Provides type-safe interface for sending commands and receiving state
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { GameState, AICommand, AIResponse } from './server.js';

export interface LikuClientOptions {
  url?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  onState?: (state: GameState) => void;
  onError?: (error: Error) => void;
}

export class LikuAIClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private shouldReconnect: boolean;
  private reconnectInterval: number;
  private reconnecting: boolean = false;
  private requestCounter: number = 0;
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();

  constructor(options: LikuClientOptions = {}) {
    super();
    this.url = options.url || 'ws://localhost:3847';
    this.shouldReconnect = options.reconnect ?? true;
    this.reconnectInterval = options.reconnectInterval || 1000;
    
    if (options.onState) this.on('state', options.onState);
    if (options.onError) this.on('error', options.onError);
  }

  /**
   * Connect to Liku-AI WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.on('open', () => {
          console.log('[LikuClient] Connected to Liku-AI');
          this.reconnecting = false;
          resolve();
        });
        
        this.ws.on('message', (data) => {
          try {
            const response: AIResponse = JSON.parse(data.toString());
            this.handleResponse(response);
          } catch (e) {
            console.error('[LikuClient] Invalid response:', e);
          }
        });
        
        this.ws.on('close', () => {
          console.log('[LikuClient] Disconnected');
          this.emit('disconnected');
          if (this.shouldReconnect && !this.reconnecting) {
            this.scheduleReconnect();
          }
        });
        
        this.ws.on('error', (err) => {
          this.emit('error', err);
          if (!this.reconnecting) {
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send a key press to the game
   */
  async sendKey(key: string): Promise<void> {
    return this.sendCommand({
      type: 'key',
      payload: { key }
    });
  }

  /**
   * Send an action command
   */
  async sendAction(action: string): Promise<void> {
    return this.sendCommand({
      type: 'action',
      payload: { action }
    });
  }

  /**
   * Query game state or data
   */
  async query(queryStr: string): Promise<unknown> {
    const reqId = this.generateRequestId();
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(reqId, { resolve, reject });
      
      this.sendCommand({
        type: 'query',
        payload: { query: queryStr },
        requestId: reqId
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error('Query timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Send raw command to server
   */
  private sendCommand(command: AICommand): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }
      
      if (!command.requestId) {
        command.requestId = this.generateRequestId();
      }
      
      this.ws.send(JSON.stringify(command), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Handle response from server
   */
  private handleResponse(response: AIResponse): void {
    switch (response.type) {
      case 'state':
        this.emit('state', response.data as GameState);
        break;
        
      case 'ack':
        // Command acknowledged
        break;
        
      case 'result':
        if (response.requestId && this.pendingRequests.has(response.requestId)) {
          const { resolve } = this.pendingRequests.get(response.requestId)!;
          this.pendingRequests.delete(response.requestId);
          resolve(response.data);
        }
        break;
        
      case 'error':
        if (response.requestId && this.pendingRequests.has(response.requestId)) {
          const { reject } = this.pendingRequests.get(response.requestId)!;
          this.pendingRequests.delete(response.requestId);
          reject(new Error(String(response.data)));
        } else {
          this.emit('error', new Error(String(response.data)));
        }
        break;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    this.reconnecting = true;
    console.log(`[LikuClient] Reconnecting in ${this.reconnectInterval}ms...`);
    
    setTimeout(() => {
      this.connect().catch(() => {
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });
    }, this.reconnectInterval);
  }

  private generateRequestId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Export types
export type { GameState, AICommand, AIResponse };
