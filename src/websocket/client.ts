/**
 * Liku-AI WebSocket Client
 * 
 * Simplified client for AI agents to connect to Liku-AI
 * Provides type-safe interface for sending commands and receiving state
 * 
 * Features:
 * - Auto-reconnection with exponential backoff
 * - Heartbeat/ping-pong for connection health
 * - Event subscriptions
 * - Request/response with timeouts
 * 
 * @see https://github.com/websockets/ws - WebSocket library reference
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket - MDN WebSocket API
 * @see docs/WEBSOCKET_PROTOCOL.md - Protocol specification
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { CLIENT_DEFAULTS, HEARTBEAT, PROTOCOL_VERSION } from './protocol.js';
import type { GameState, AICommand, AIResponse } from './server.js';

export interface LikuClientOptions {
  /** WebSocket server URL (default: ws://localhost:3847) */
  url?: string;
  /** Enable auto-reconnection (default: true) */
  reconnect?: boolean;
  /** Initial reconnection interval in ms (default: 1000) */
  reconnectInterval?: number;
  /** Maximum reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Reconnection backoff multiplier (default: 1.5) */
  reconnectBackoff?: number;
  /** Request timeout in ms (default: 5000) */
  requestTimeout?: number;
  /** Enable heartbeat/ping (default: true) */
  enableHeartbeat?: boolean;
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
  /** State update callback */
  onState?: (state: GameState) => void;
  /** Error callback */
  onError?: (error: Error) => void;
  /** Event callback */
  onEvent?: (event: { type: string; data: unknown }) => void;
}

/**
 * Connection state enum
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
}

export class LikuAIClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private shouldReconnect: boolean;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectBackoff: number;
  private requestTimeout: number;
  private enableHeartbeat: boolean;
  private heartbeatIntervalMs: number;
  
  private reconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private requestCounter: number = 0;
  private pendingRequests: Map<string, { 
    resolve: (value: unknown) => void; 
    reject: (reason: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pongReceived: boolean = true;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  
  private clientId: string | null = null;
  private serverProtocol: string | null = null;
  private subscriptions: Set<string> = new Set(['state']); // Default subscription

  constructor(options: LikuClientOptions = {}) {
    super();
    this.url = options.url || 'ws://localhost:3847';
    this.shouldReconnect = options.reconnect ?? CLIENT_DEFAULTS.reconnect;
    this.reconnectInterval = options.reconnectInterval || CLIENT_DEFAULTS.reconnectInterval;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? CLIENT_DEFAULTS.maxReconnectAttempts;
    this.reconnectBackoff = options.reconnectBackoff ?? CLIENT_DEFAULTS.reconnectBackoff;
    this.requestTimeout = options.requestTimeout || CLIENT_DEFAULTS.requestTimeout;
    this.enableHeartbeat = options.enableHeartbeat ?? true;
    this.heartbeatIntervalMs = options.heartbeatInterval ?? HEARTBEAT.INTERVAL;
    
    if (options.onState) this.on('state', options.onState);
    if (options.onError) this.on('error', options.onError);
    if (options.onEvent) this.on('event', options.onEvent);
  }

  /**
   * Connect to Liku-AI WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connectionState === ConnectionState.CONNECTED) {
        resolve();
        return;
      }

      this.connectionState = ConnectionState.CONNECTING;

      try {
        this.ws = new WebSocket(this.url, {
          handshakeTimeout: 10000,
          headers: {
            'X-Client-Protocol': PROTOCOL_VERSION,
          },
        });
        
        this.ws.on('open', () => {
          console.log('[LikuClient] Connected to Liku-AI');
          this.connectionState = ConnectionState.CONNECTED;
          this.reconnecting = false;
          this.reconnectAttempts = 0;
          this.pongReceived = true;
          
          // Start heartbeat
          if (this.enableHeartbeat) {
            this.startHeartbeat();
          }
          
          this.emit('connected');
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
        
        this.ws.on('close', (code, reason) => {
          console.log(`[LikuClient] Disconnected (code: ${code}, reason: ${reason?.toString() || 'unknown'})`);
          this.cleanup();
          this.connectionState = ConnectionState.DISCONNECTED;
          this.emit('disconnected', { code, reason: reason?.toString() });
          
          if (this.shouldReconnect && !this.reconnecting) {
            this.scheduleReconnect();
          }
        });
        
        this.ws.on('error', (err) => {
          this.emit('error', err);
          if (this.connectionState === ConnectionState.CONNECTING) {
            reject(err);
          }
        });

        // Handle pong responses for heartbeat
        this.ws.on('pong', () => {
          this.pongReceived = true;
        });

        // Handle ping from server (per ws docs: autoPong is true by default)
        // ws library automatically responds with pong, but we can track it
        this.ws.on('ping', () => {
          // Server is checking our connection health
        });

      } catch (err) {
        this.connectionState = ConnectionState.DISCONNECTED;
        reject(err);
      }
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connectionState = ConnectionState.DISCONNECTED;
  }

  /**
   * Start heartbeat monitoring
   * Per ws docs: client sends ping, expects pong
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      if (!this.pongReceived) {
        // No pong received since last ping - connection may be dead
        console.warn('[LikuClient] No pong received, terminating connection');
        this.ws.terminate();
        return;
      }

      this.pongReceived = false;
      this.ws.ping();
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Cleanup resources on disconnect
   */
  private cleanup(): void {
    this.stopHeartbeat();
    
    // Reject all pending requests
    for (const [reqId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
      this.pendingRequests.delete(reqId);
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
  async query(queryStr: string, params?: Record<string, unknown>): Promise<unknown> {
    const reqId = this.generateRequestId();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error('Query timeout'));
        }
      }, this.requestTimeout);

      this.pendingRequests.set(reqId, { resolve, reject, timeout });
      
      this.sendCommand({
        type: 'query',
        payload: { query: queryStr, ...params },
        requestId: reqId
      }).catch(err => {
        clearTimeout(timeout);
        this.pendingRequests.delete(reqId);
        reject(err);
      });
    });
  }

  /**
   * Subscribe to specific event types
   */
  async subscribe(events: string[]): Promise<string[]> {
    const reqId = this.generateRequestId();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error('Subscribe timeout'));
        }
      }, this.requestTimeout);

      this.pendingRequests.set(reqId, { 
        resolve: (data) => resolve((data as { subscribed: string[] }).subscribed), 
        reject, 
        timeout 
      });
      
      // Track locally
      for (const event of events) {
        this.subscriptions.add(event);
      }

      this.sendRaw({
        type: 'subscribe',
        payload: { events },
        requestId: reqId
      }).catch(err => {
        clearTimeout(timeout);
        this.pendingRequests.delete(reqId);
        reject(err);
      });
    });
  }

  /**
   * Unsubscribe from specific event types
   */
  async unsubscribe(events: string[]): Promise<string[]> {
    const reqId = this.generateRequestId();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error('Unsubscribe timeout'));
        }
      }, this.requestTimeout);

      this.pendingRequests.set(reqId, { 
        resolve: (data) => resolve((data as { subscribed: string[] }).subscribed), 
        reject, 
        timeout 
      });
      
      // Track locally
      for (const event of events) {
        this.subscriptions.delete(event);
      }

      this.sendRaw({
        type: 'unsubscribe',
        payload: { events },
        requestId: reqId
      }).catch(err => {
        clearTimeout(timeout);
        this.pendingRequests.delete(reqId);
        reject(err);
      });
    });
  }

  /**
   * Send application-level ping (not WebSocket ping)
   */
  async ping(): Promise<{ serverTime: number; latencyMs: number }> {
    const sentAt = Date.now();
    const reqId = this.generateRequestId();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error('Ping timeout'));
        }
      }, this.requestTimeout);

      this.pendingRequests.set(reqId, { 
        resolve: (data) => {
          const serverTime = (data as { serverTime: number }).serverTime;
          resolve({ serverTime, latencyMs: Date.now() - sentAt });
        }, 
        reject, 
        timeout 
      });

      this.sendRaw({
        type: 'ping',
        payload: {},
        requestId: reqId
      }).catch(err => {
        clearTimeout(timeout);
        this.pendingRequests.delete(reqId);
        reject(err);
      });
    });
  }

  /**
   * Send raw command to server
   */
  private sendCommand(command: AICommand): Promise<void> {
    if (!command.requestId) {
      command.requestId = this.generateRequestId();
    }
    return this.sendRaw(command);
  }

  /**
   * Send raw message
   */
  private sendRaw(message: object): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }
      
      this.ws.send(JSON.stringify(message), (err) => {
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
      case 'welcome':
        // Store connection info from welcome message
        const welcomeData = response.data as { clientId: string; protocol: string };
        this.clientId = welcomeData.clientId;
        this.serverProtocol = welcomeData.protocol;
        this.emit('welcome', welcomeData);
        break;
        
      case 'state':
        this.emit('state', response.data as GameState);
        break;
        
      case 'event':
        this.emit('event', response.data);
        break;
        
      case 'ack':
        if (response.requestId && this.pendingRequests.has(response.requestId)) {
          const { resolve, timeout } = this.pendingRequests.get(response.requestId)!;
          clearTimeout(timeout);
          this.pendingRequests.delete(response.requestId);
          resolve(response.data);
        }
        break;
        
      case 'result':
        if (response.requestId && this.pendingRequests.has(response.requestId)) {
          const { resolve, timeout } = this.pendingRequests.get(response.requestId)!;
          clearTimeout(timeout);
          this.pendingRequests.delete(response.requestId);
          resolve(response.data);
        }
        break;

      case 'pong':
        if (response.requestId && this.pendingRequests.has(response.requestId)) {
          const { resolve, timeout } = this.pendingRequests.get(response.requestId)!;
          clearTimeout(timeout);
          this.pendingRequests.delete(response.requestId);
          resolve(response.data);
        }
        break;
        
      case 'error':
        const errorData = response.data as { code: number; message: string };
        if (response.requestId && this.pendingRequests.has(response.requestId)) {
          const { reject, timeout } = this.pendingRequests.get(response.requestId)!;
          clearTimeout(timeout);
          this.pendingRequests.delete(response.requestId);
          reject(new Error(`${errorData.code}: ${errorData.message}`));
        } else {
          this.emit('error', new Error(`${errorData.code}: ${errorData.message}`));
        }
        break;
    }
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[LikuClient] Max reconnection attempts reached');
      this.emit('maxReconnectAttempts');
      return;
    }

    this.reconnecting = true;
    this.connectionState = ConnectionState.RECONNECTING;
    
    // Calculate backoff delay
    const delay = Math.min(
      this.reconnectInterval * Math.pow(this.reconnectBackoff, this.reconnectAttempts),
      30000 // Max 30 seconds
    );
    
    this.reconnectAttempts++;
    console.log(`[LikuClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(() => {
      this.connect().catch(() => {
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });
    }, delay);
  }

  private generateRequestId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`;
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection state
   */
  get state(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get assigned client ID
   */
  get id(): string | null {
    return this.clientId;
  }

  /**
   * Get current subscriptions
   */
  get currentSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }
}

// Export types
export type { GameState, AICommand, AIResponse };
