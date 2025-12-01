/**
 * Liku-AI WebSocket Server
 * 
 * Real-time bidirectional communication for AI agents
 * Replaces file-based state polling with event-driven push model
 * 
 * Features:
 * - Sub-5ms state broadcast latency
 * - Heartbeat for connection health monitoring
 * - Rate limiting via CommandRouter
 * - Structured game state with AI recommendations
 * - Event subscriptions
 * - Agent authentication and identity management
 * - Per-agent metrics and rate limiting
 * - Turn-based multi-agent coordination
 * 
 * Target latency: <5ms (vs 50-100ms with file polling)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { createServer as createHttpServer, IncomingMessage, ServerResponse, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { CommandRouter } from './router.js';
import { AgentManager, AgentInfo, AgentCredentials, AgentRole } from './agents.js';
import { TurnManager, TurnMode, CommandPriority } from './turns.js';
import { GameSessionManager, gameSessionManager } from './sessions.js';
import { SecurityManager, TLSConfig, JWTConfig, DEFAULT_TLS_CONFIG, DEFAULT_JWT_CONFIG } from './security.js';
import { 
  PROTOCOL_VERSION, 
  DEFAULT_PORT, 
  HEARTBEAT, 
  MAX_PAYLOAD,
  SERVER_DEFAULTS,
  ServerMessageType,
  GameEventType,
  ErrorCode,
  createError,
  validateMessage,
} from './protocol.js';
import type { UnifiedGameState } from './state.js';

export interface GameState {
  timestamp: number;
  pid: number;
  screen: string;
  status: string;
  version?: string;
  game?: {
    type: 'dino' | 'snake' | 'tictactoe' | 'menu';
    data: Record<string, unknown>;
  };
}

export interface AICommand {
  type: 'key' | 'action' | 'query' | 'ping' | 'subscribe' | 'unsubscribe';
  payload: {
    key?: string;
    action?: string;
    query?: string;
    events?: string[];
    // Session action fields (AI-vs-AI games)
    sessionId?: string;
    gameType?: string;
    mode?: string;
    turnTimeMs?: number;
    allowSpectators?: boolean;
    name?: string;
    playerType?: string;
    slot?: string;
    aiProvider?: string;
    ready?: boolean;
    row?: number;
    col?: number;
    [key: string]: unknown; // Allow additional fields
  };
  requestId?: string;
}

export interface AIResponse {
  type: 'state' | 'ack' | 'error' | 'result' | 'pong' | 'event' | 'welcome';
  requestId?: string;
  data: unknown;
  timestamp: number;
}

/**
 * Extended WebSocket with client metadata
 */
interface LikuWebSocket extends WebSocket {
  likuId: string;
  isAlive: boolean;
  connectedAt: number;
  lastActivity: number;
  subscriptions: Set<string>;
  agentId?: string; // Optional agent ID for authenticated clients
  metadata: {
    userAgent?: string;
    ip?: string;
  };
}

/**
 * Server configuration options
 */
export interface ServerConfig {
  port: number;
  maxClients: number;
  stateInterval: number;
  enableCompression: boolean;
  enableHeartbeat: boolean;
  enableRateLimiting: boolean;
  requireAuth: boolean; // Require agent authentication
  turnMode: TurnMode; // Turn-taking mode for multi-agent games
  // Phase 5.3: Security configuration
  tls?: Partial<TLSConfig>; // TLS/WSS configuration
  jwt?: Partial<JWTConfig>; // JWT authentication configuration
  healthPort?: number; // Health endpoint port (default: port + 1)
}

/**
 * Server statistics
 */
export interface ServerStats {
  uptime: number;
  totalConnections: number;
  currentClients: number;
  messagesReceived: number;
  messagesSent: number;
  statesBroadcast: number;
  bytesReceived: number;
  bytesSent: number;
}

export class LikuWebSocketServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | HttpsServer | null = null;
  private healthHttpServer: HttpServer | null = null;
  private clients: Map<string, LikuWebSocket> = new Map();
  private currentState: UnifiedGameState | null = null;
  private router: CommandRouter;
  private agentManager: AgentManager;
  private turnManager: TurnManager;
  private sessionManager: GameSessionManager;
  private securityManager: SecurityManager;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private config: ServerConfig;
  private startTime: number = 0;
  
  // Statistics
  private stats = {
    totalConnections: 0,
    messagesReceived: 0,
    messagesSent: 0,
    statesBroadcast: 0,
    bytesReceived: 0,
    bytesSent: 0,
  };

  constructor(config?: Partial<ServerConfig>) {
    super();
    this.config = {
      port: config?.port ?? DEFAULT_PORT,
      maxClients: config?.maxClients ?? SERVER_DEFAULTS.maxClients,
      stateInterval: config?.stateInterval ?? SERVER_DEFAULTS.stateInterval,
      enableCompression: config?.enableCompression ?? SERVER_DEFAULTS.enableCompression,
      enableHeartbeat: config?.enableHeartbeat ?? SERVER_DEFAULTS.enableHeartbeat,
      enableRateLimiting: config?.enableRateLimiting ?? true,
      requireAuth: config?.requireAuth ?? false,
      turnMode: config?.turnMode ?? TurnMode.FREE,
      tls: config?.tls,
      jwt: config?.jwt,
      healthPort: config?.healthPort,
    };
    
    this.router = new CommandRouter(undefined, gameSessionManager);
    this.agentManager = new AgentManager();
    this.turnManager = new TurnManager({ mode: this.config.turnMode });
    this.sessionManager = gameSessionManager;
    this.securityManager = new SecurityManager(this.config.tls, this.config.jwt);
    this.setupRouterListeners();
    this.setupTurnListeners();
    this.setupSessionListeners();
  }

  /**
   * Setup listeners for the command router
   */
  private setupRouterListeners(): void {
    this.router.on('key', (key: string, clientId: string) => {
      this.emit('key', key, clientId);
    });

    this.router.on('action', (action: string, clientId: string) => {
      this.emit('action', action, clientId);
    });

    this.router.on('query', (query: string, clientId: string, callback: (result: unknown) => void) => {
      this.emit('query', query, clientId, callback);
    });

    this.router.on('rateLimit', (clientId: string, reason: string) => {
      console.warn(`[WS] Rate limit: ${clientId} - ${reason}`);
    });

    this.router.on('ban', (clientId: string, duration: number) => {
      console.warn(`[WS] Client banned: ${clientId} for ${duration}ms`);
    });
  }

  /**
   * Setup listeners for turn management
   */
  private setupTurnListeners(): void {
    this.turnManager.on('turnChanged', (agentId: string, state: unknown) => {
      // Notify all clients of turn change
      this.broadcastEvent(GameEventType.TURN_CHANGE, { agentId, state });
      this.emit('turnChanged', agentId, state);
    });

    this.turnManager.on('commandExecuted', (command: unknown) => {
      this.emit('turnCommand', command);
    });

    this.turnManager.on('commandQueued', (command: unknown, position: number) => {
      this.emit('commandQueued', command, position);
    });

    this.turnManager.on('agentSkipped', (agentId: string, reason: string) => {
      console.log(`[WS] Agent skipped: ${agentId} - ${reason}`);
      this.emit('agentSkipped', agentId, reason);
    });
  }

  /**
   * Setup listeners for game session management (AI-vs-AI games)
   */
  private setupSessionListeners(): void {
    // Session created
    this.sessionManager.on('sessionCreated', (session: unknown) => {
      this.broadcastEvent('session:created', session);
      this.emit('sessionCreated', session);
    });

    // Player joined a session
    this.sessionManager.on('playerJoined', (sessionId: string, player: unknown) => {
      this.broadcastEvent('session:playerJoined', { sessionId, player });
      this.emit('playerJoined', sessionId, player);
    });

    // Game started
    this.sessionManager.on('gameStarted', (sessionId: string, state: unknown) => {
      this.broadcastEvent('session:gameStarted', { sessionId, state });
      this.emit('sessionGameStarted', sessionId, state);
    });

    // Turn changed within session
    this.sessionManager.on('turnChanged', (sessionId: string, slot: string, agentId: string) => {
      // Send turn notification to specific agent
      this.sendToAgent(agentId, {
        type: 'event',
        data: {
          event: 'session:yourTurn',
          sessionId,
          slot,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });
      // Also broadcast to all spectators
      this.broadcastEvent('session:turnChanged', { sessionId, slot, agentId });
      this.emit('sessionTurnChanged', sessionId, slot, agentId);
    });

    // Move made
    this.sessionManager.on('moveMade', (sessionId: string, data: unknown) => {
      this.broadcastEvent('session:moveMade', { sessionId, ...data as object });
      this.emit('sessionMoveMade', sessionId, data);
    });

    // Game ended
    this.sessionManager.on('gameEnded', (sessionId: string, result: unknown) => {
      this.broadcastEvent('session:gameEnded', { sessionId, ...result as object });
      this.emit('sessionGameEnded', sessionId, result);
    });

    // Player left
    this.sessionManager.on('playerLeft', (sessionId: string, agentId: string, slot: string) => {
      this.broadcastEvent('session:playerLeft', { sessionId, agentId, slot });
      this.emit('playerLeft', sessionId, agentId, slot);
    });

    // Spectator joined
    this.sessionManager.on('spectatorJoined', (sessionId: string, agentId: string) => {
      this.broadcastEvent('session:spectatorJoined', { sessionId, agentId });
      this.emit('spectatorJoined', sessionId, agentId);
    });
  }

  /**
   * Start the WebSocket server
   * Supports both ws:// (plain) and wss:// (TLS) connections
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Check if TLS is enabled
        const isTLS = this.securityManager.isTLSEnabled();
        const isJWT = this.securityManager.isJWTEnabled();
        
        if (isTLS) {
          // Create HTTPS server with TLS options
          const tlsOptions = this.securityManager.getSecureServerOptions();
          if (!tlsOptions) {
            throw new Error('TLS enabled but no valid options provided');
          }
          
          this.httpServer = createHttpsServer(tlsOptions as Parameters<typeof createHttpsServer>[0]);
          this.httpServer.listen(this.config.port);
          
          // Attach WebSocket server to HTTPS server
          this.wss = new WebSocketServer({ 
            server: this.httpServer,
            maxPayload: MAX_PAYLOAD.INCOMING,
            perMessageDeflate: this.config.enableCompression,
          });
          
          console.log(`[WS] TLS enabled - using wss:// (${this.config.tls?.minVersion || 'TLSv1.2'}+)`);
        } else {
          // Plain WebSocket server
          this.wss = new WebSocketServer({ 
            port: this.config.port,
            maxPayload: MAX_PAYLOAD.INCOMING,
            perMessageDeflate: this.config.enableCompression,
          });
        }
        
        if (isJWT) {
          console.log(`[WS] JWT authentication enabled (algorithm: ${this.config.jwt?.algorithm || 'HS256'})`);
        }
        
        this.wss.on('connection', (ws: WebSocket, req) => {
          // Check max clients
          if (this.clients.size >= this.config.maxClients) {
            ws.close(1013, 'Server at capacity');
            return;
          }

          // Extract authentication from URL query params or headers
          const url = new URL(req.url || '/', `http://localhost:${this.config.port}`);
          
          // JWT Authentication validation
          if (isJWT) {
            const headers: Record<string, string | undefined> = {
              authorization: req.headers['authorization'] as string | undefined,
              'sec-websocket-protocol': req.headers['sec-websocket-protocol'] as string | undefined,
            };
            
            // Also check for token in query params
            const queryToken = url.searchParams.get('token');
            if (queryToken && !headers.authorization) {
              headers.authorization = `Bearer ${queryToken}`;
            }
            
            const tokenValidation = this.securityManager.validateUpgradeRequest(headers);
            if (!tokenValidation.valid) {
              console.warn(`[WS] JWT validation failed: ${tokenValidation.error}`);
              ws.close(4001, tokenValidation.error || 'Authentication failed');
              return;
            }
            
            // Log successful JWT auth (hash the sub for privacy)
            if (tokenValidation.payload) {
              console.log(`[WS] JWT authenticated: agent=${tokenValidation.payload.sub.slice(0, 8)}...`);
            }
          }
          
          const agentToken = url.searchParams.get('token') || req.headers['x-liku-agent-token'] as string | undefined;
          const agentName = url.searchParams.get('name') || req.headers['x-liku-agent-name'] as string || 'anonymous';
          const agentType = url.searchParams.get('type') || req.headers['x-liku-agent-type'] as string || 'ai';

          // Register agent and create session
          const credentials: AgentCredentials = {
            name: agentName,
            token: agentToken,
            type: agentType,
            metadata: {
              ip: req.socket.remoteAddress,
              userAgent: req.headers['user-agent'],
            },
          };

          // Extend WebSocket with Liku properties
          const likuWs = ws as LikuWebSocket;
          likuWs.likuId = randomUUID();
          likuWs.isAlive = true;
          likuWs.connectedAt = Date.now();
          likuWs.lastActivity = Date.now();
          likuWs.subscriptions = new Set(['state']); // Subscribe to state by default
          likuWs.metadata = {
            ip: req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
          };

          // Register agent and create session
          const agent = this.agentManager.registerAgent(credentials);
          const session = this.agentManager.createSession(agent.id, likuWs.likuId);
          likuWs.agentId = agent.id;

          // Add agent to turn manager
          this.turnManager.addAgent(agent.id, agent.role);

          this.clients.set(likuWs.likuId, likuWs);
          this.stats.totalConnections++;
          
          const secureLabel = isTLS ? ' [TLS]' : '';
          console.log(`[WS] Client connected${secureLabel}: ${likuWs.likuId} (agent: ${agent.name}) (total: ${this.clients.size})`);
          
          // Get turn state for welcome message
          const turnState = this.turnManager.getAgentTurnState(agent.id);
          
          // Send welcome message
          this.sendToClient(likuWs, {
            type: 'welcome',
            data: {
              clientId: likuWs.likuId,
              protocol: PROTOCOL_VERSION,
              serverTime: Date.now(),
              capabilities: ['state', 'key', 'action', 'query', 'events'],
              agent: {
                id: agent.id,
                name: agent.name,
                type: agent.type,
                role: agent.role,
              },
              turn: turnState ? {
                isYourTurn: turnState.isCurrentTurn,
                orderPosition: turnState.orderPosition,
                mode: this.config.turnMode,
              } : undefined,
              sessionId: session?.sessionId,
              security: {
                tls: isTLS,
                jwt: isJWT,
              },
            },
            timestamp: Date.now(),
          });

          // Send current state immediately
          if (this.currentState) {
            this.sendToClient(likuWs, {
              type: 'state',
              data: this.currentState,
              timestamp: Date.now(),
            });
          }
          
          ws.on('message', (data) => {
            this.handleMessage(likuWs, data);
          });
          
          ws.on('close', () => {
            // Remove from turn manager
            if (likuWs.agentId) {
              this.turnManager.removeAgent(likuWs.agentId);
              this.agentManager.endSession(likuWs.likuId);
            }
            this.clients.delete(likuWs.likuId);
            this.router.removeClient(likuWs.likuId);
            console.log(`[WS] Client disconnected: ${likuWs.likuId} (total: ${this.clients.size})`);
            this.emit('clientDisconnected', likuWs.likuId);
          });
          
          ws.on('error', (err) => {
            console.error(`[WS] Client error (${likuWs.likuId}):`, err.message);
            // Remove from turn manager
            if (likuWs.agentId) {
              this.turnManager.removeAgent(likuWs.agentId);
              this.agentManager.endSession(likuWs.likuId);
            }
            this.clients.delete(likuWs.likuId);
            this.router.removeClient(likuWs.likuId);
          });

          ws.on('pong', () => {
            likuWs.isAlive = true;
          });

          this.emit('clientConnected', likuWs.likuId, likuWs.metadata);
        });
        
        this.wss.on('listening', () => {
          this.startTime = Date.now();
          const protocol = isTLS ? 'wss' : 'ws';
          console.log(`[WS] Liku-AI WebSocket server v${PROTOCOL_VERSION} listening on ${protocol}://localhost:${this.config.port}`);
          
          // Log security configuration summary
          console.log(`[WS] Security: ${JSON.stringify(this.securityManager.getConfigSummary())}`);
          
          // Start heartbeat if enabled
          if (this.config.enableHeartbeat) {
            this.startHeartbeat();
          }
          
          // Start health endpoint for K8s probes
          this.startHealthEndpoint();
          
          resolve();
        });
        
        this.wss.on('error', reject);
        
        // Also listen for HTTP server errors if using TLS
        if (this.httpServer) {
          this.httpServer.on('error', reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(ws: LikuWebSocket, data: Buffer | ArrayBuffer | Buffer[]): void {
    const messageStartTime = Date.now();
    ws.lastActivity = messageStartTime;
    
    const rawData = data.toString();
    this.stats.messagesReceived++;
    this.stats.bytesReceived += rawData.length;

    try {
      const message = JSON.parse(rawData);
      
      // Validate message structure
      const validation = validateMessage(message);
      if (!validation.valid) {
        this.sendToClient(ws, {
          type: 'error',
          data: createError(ErrorCode.INVALID_JSON, validation.error),
          timestamp: Date.now(),
        });
        return;
      }

      const command: AICommand = message;

      // Track agent metrics if authenticated
      if (ws.agentId) {
        if (command.type === 'query') {
          this.agentManager.recordQuery(ws.agentId);
        } else {
          const latency = Date.now() - messageStartTime;
          this.agentManager.recordCommand(ws.agentId, latency);
        }
        this.agentManager.updateActivity(ws.likuId);
      }

      // Handle ping specially (bypass rate limiting)
      if (command.type === 'ping') {
        this.sendToClient(ws, {
          type: 'pong',
          requestId: command.requestId,
          data: { serverTime: Date.now() },
          timestamp: Date.now(),
        });
        return;
      }

      // Handle agent registration
      if (command.type === 'action' && command.payload.action === 'register') {
        this.handleAgentRegistration(ws, command);
        return;
      }

      // Handle subscriptions
      if (command.type === 'subscribe') {
        const events = command.payload.events || [];
        for (const event of events) {
          ws.subscriptions.add(event);
        }
        this.sendToClient(ws, {
          type: 'ack',
          requestId: command.requestId,
          data: { subscribed: Array.from(ws.subscriptions) },
          timestamp: Date.now(),
        });
        return;
      }

      if (command.type === 'unsubscribe') {
        const events = command.payload.events || [];
        for (const event of events) {
          ws.subscriptions.delete(event);
        }
        this.sendToClient(ws, {
          type: 'ack',
          requestId: command.requestId,
          data: { subscribed: Array.from(ws.subscriptions) },
          timestamp: Date.now(),
        });
        return;
      }

      // Route through CommandRouter (with rate limiting)
      if (this.config.enableRateLimiting) {
        const response = this.router.route(ws.likuId, command);
        this.sendToClient(ws, response);
      } else {
        // Direct handling without rate limiting
        this.emit('command', command, ws.likuId);
        this.sendToClient(ws, {
          type: 'ack',
          requestId: command.requestId,
          data: { received: true },
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      this.sendToClient(ws, {
        type: 'error',
        data: createError(ErrorCode.INVALID_JSON),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [id, ws] of this.clients) {
        if (!ws.isAlive) {
          console.log(`[WS] Terminating unresponsive client: ${id}`);
          ws.terminate();
          this.clients.delete(id);
          this.router.removeClient(id);
          continue;
        }
        
        ws.isAlive = false;
        ws.ping();
      }
    }, HEARTBEAT.INTERVAL);
  }

  /**
   * Start HTTP health endpoint for Kubernetes probes
   * Listens on port+1 (e.g., 3848 if WS is on 3847)
   */
  private startHealthEndpoint(): void {
    const healthPort = this.config.healthPort ?? this.config.port + 1;
    
    this.healthHttpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url || '/';
      
      // Health check endpoints
      if (url === '/health' || url === '/healthz') {
        const health = this.getHealthStatus();
        res.writeHead(health.status === 'healthy' ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
        return;
      }
      
      // Liveness probe - just checks if server is running
      if (url === '/live' || url === '/livez') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'alive', timestamp: Date.now() }));
        return;
      }
      
      // Readiness probe - checks if server can accept connections
      if (url === '/ready' || url === '/readyz') {
        const isReady = this.wss !== null && this.clients.size < this.config.maxClients;
        res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: isReady ? 'ready' : 'not_ready',
          clients: this.clients.size,
          maxClients: this.config.maxClients,
          timestamp: Date.now(),
        }));
        return;
      }
      
      // Metrics endpoint (Prometheus-style)
      if (url === '/metrics') {
        const metrics = this.getPrometheusMetrics();
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(metrics);
        return;
      }
      
      // Security config endpoint (safe summary)
      if (url === '/security') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.securityManager.getConfigSummary()));
        return;
      }
      
      // Not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
    
    this.healthHttpServer.listen(healthPort, () => {
      console.log(`[WS] Health endpoint listening on port ${healthPort}`);
    });
  }

  /**
   * Get health status for K8s probes
   */
  private getHealthStatus(): { status: string; uptime: number; clients: number; details: Record<string, unknown> } {
    const uptime = Date.now() - this.startTime;
    return {
      status: this.wss ? 'healthy' : 'unhealthy',
      uptime,
      clients: this.clients.size,
      details: {
        version: PROTOCOL_VERSION,
        maxClients: this.config.maxClients,
        heartbeatEnabled: this.config.enableHeartbeat,
        messagesReceived: this.stats.messagesReceived,
        messagesSent: this.stats.messagesSent,
        totalConnections: this.stats.totalConnections,
        security: this.securityManager.getConfigSummary(),
      },
    };
  }

  /**
   * Get Prometheus-format metrics
   */
  private getPrometheusMetrics(): string {
    const lines: string[] = [
      '# HELP liku_websocket_clients_current Current number of connected clients',
      '# TYPE liku_websocket_clients_current gauge',
      `liku_websocket_clients_current ${this.clients.size}`,
      '',
      '# HELP liku_websocket_clients_max Maximum allowed clients',
      '# TYPE liku_websocket_clients_max gauge',
      `liku_websocket_clients_max ${this.config.maxClients}`,
      '',
      '# HELP liku_websocket_connections_total Total connections since start',
      '# TYPE liku_websocket_connections_total counter',
      `liku_websocket_connections_total ${this.stats.totalConnections}`,
      '',
      '# HELP liku_websocket_messages_received_total Total messages received',
      '# TYPE liku_websocket_messages_received_total counter',
      `liku_websocket_messages_received_total ${this.stats.messagesReceived}`,
      '',
      '# HELP liku_websocket_messages_sent_total Total messages sent',
      '# TYPE liku_websocket_messages_sent_total counter',
      `liku_websocket_messages_sent_total ${this.stats.messagesSent}`,
      '',
      '# HELP liku_websocket_bytes_received_total Total bytes received',
      '# TYPE liku_websocket_bytes_received_total counter',
      `liku_websocket_bytes_received_total ${this.stats.bytesReceived}`,
      '',
      '# HELP liku_websocket_bytes_sent_total Total bytes sent',
      '# TYPE liku_websocket_bytes_sent_total counter',
      `liku_websocket_bytes_sent_total ${this.stats.bytesSent}`,
      '',
      '# HELP liku_websocket_uptime_seconds Server uptime in seconds',
      '# TYPE liku_websocket_uptime_seconds gauge',
      `liku_websocket_uptime_seconds ${Math.floor((Date.now() - this.startTime) / 1000)}`,
    ];
    return lines.join('\n');
  }

  /**
   * Stop the WebSocket server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Stop health endpoint
      if (this.healthHttpServer) {
        this.healthHttpServer.close();
        this.healthHttpServer = null;
      }

      // Stop HTTPS server if using TLS
      if (this.httpServer) {
        this.httpServer.close();
        this.httpServer = null;
      }

      if (this.wss) {
        // Notify clients of shutdown
        const shutdownMessage: AIResponse = {
          type: 'event',
          data: { event: 'server:shutdown', message: 'Server shutting down' },
          timestamp: Date.now(),
        };
        
        for (const [, client] of this.clients) {
          this.sendToClient(client, shutdownMessage);
          client.close(1000, 'Server shutting down');
        }
        this.clients.clear();
        
        // Reset session manager
        this.sessionManager.reset();
        
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
   * Get the security manager for token operations
   * Use this to generate JWT tokens for agents
   */
  getSecurityManager(): SecurityManager {
    return this.securityManager;
  }

  /**
   * Generate a JWT token for an agent (convenience method)
   */
  generateAgentToken(agentId: string, name: string, role: 'player' | 'spectator' | 'admin'): string {
    return this.securityManager.generateToken(agentId, name, role);
  }

  /**
   * Broadcast game state to all connected clients
   */
  broadcastState(state: UnifiedGameState): void {
    this.currentState = state;
    this.stats.statesBroadcast++;
    
    const message: AIResponse = {
      type: 'state',
      data: state,
      timestamp: Date.now(),
    };
    
    // Only send to clients subscribed to state updates
    this.broadcastToSubscribed('state', message);
  }

  /**
   * Broadcast a game event to subscribed clients
   */
  broadcastEvent(eventType: GameEventType | string, data: unknown): void {
    const message: AIResponse = {
      type: 'event',
      data: { event: eventType, ...data as object },
      timestamp: Date.now(),
    };
    
    this.broadcastToSubscribed(eventType, message);
  }

  /**
   * Broadcast to clients subscribed to an event type
   */
  private broadcastToSubscribed(eventType: string, message: AIResponse): void {
    const json = JSON.stringify(message);
    this.stats.bytesSent += json.length * this.clients.size;
    
    for (const [, client] of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        // Check subscription (always allow 'state')
        if (eventType === 'state' || client.subscriptions.has(eventType) || client.subscriptions.has('*')) {
          client.send(json);
          this.stats.messagesSent++;
        }
      }
    }
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(ws: LikuWebSocket, message: AIResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
      const json = JSON.stringify(message);
      ws.send(json);
      this.stats.messagesSent++;
      this.stats.bytesSent += json.length;
    }
  }

  /**
   * Send message to a specific client by ID
   */
  sendToClientById(clientId: string, message: AIResponse): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      this.sendToClient(client, message);
      return true;
    }
    return false;
  }

  /**
   * Get server statistics
   */
  getStats(): ServerStats {
    return {
      uptime: Date.now() - this.startTime,
      totalConnections: this.stats.totalConnections,
      currentClients: this.clients.size,
      messagesReceived: this.stats.messagesReceived,
      messagesSent: this.stats.messagesSent,
      statesBroadcast: this.stats.statesBroadcast,
      bytesReceived: this.stats.bytesReceived,
      bytesSent: this.stats.bytesSent,
    };
  }

  /**
   * Get connected client info
   */
  getClientInfo(clientId: string): {
    id: string;
    connectedAt: number;
    lastActivity: number;
    subscriptions: string[];
    metadata: { userAgent?: string; ip?: string };
  } | null {
    const client = this.clients.get(clientId);
    if (!client) return null;
    
    return {
      id: client.likuId,
      connectedAt: client.connectedAt,
      lastActivity: client.lastActivity,
      subscriptions: Array.from(client.subscriptions),
      metadata: client.metadata,
    };
  }

  /**
   * Get all connected client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Handle agent registration via WebSocket
   */
  private handleAgentRegistration(ws: LikuWebSocket, command: AICommand): void {
    const payload = command.payload as { name?: string; type?: string; metadata?: Record<string, unknown> };
    
    if (!payload.name) {
      this.sendToClient(ws, {
        type: 'error',
        requestId: command.requestId,
        data: createError(ErrorCode.MISSING_FIELD, 'Agent name required for registration'),
        timestamp: Date.now(),
      });
      return;
    }

    const credentials: AgentCredentials = {
      name: payload.name,
      type: payload.type || 'ai',
      metadata: payload.metadata,
    };

    const agent = this.agentManager.registerAgent(credentials);
    const session = this.agentManager.createSession(agent.id, ws.likuId);
    ws.agentId = agent.id;
    
    this.sendToClient(ws, {
      type: 'ack',
      requestId: command.requestId,
      data: {
        registered: true,
        agent: {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          role: agent.role,
        },
        sessionId: session?.sessionId,
      },
      timestamp: Date.now(),
    });

    this.emit('agentRegistered', agent, ws.likuId);
  }

  /**
   * Get the agent manager instance
   */
  getAgentManager(): AgentManager {
    return this.agentManager;
  }

  /**
   * Get the turn manager instance
   */
  getTurnManager(): TurnManager {
    return this.turnManager;
  }

  /**
   * Get the session manager instance
   */
  getSessionManager(): GameSessionManager {
    return this.sessionManager;
  }

  /**
   * Get agent info for a client
   */
  getAgentForClient(clientId: string): AgentInfo | null {
    const client = this.clients.get(clientId);
    if (!client || !client.agentId) return null;
    return this.agentManager.getAgent(client.agentId);
  }

  /**
   * Get all connected agents
   */
  getConnectedAgents(): AgentInfo[] {
    const agents: AgentInfo[] = [];
    for (const [, client] of this.clients) {
      if (client.agentId) {
        const agent = this.agentManager.getAgent(client.agentId);
        if (agent) agents.push(agent);
      }
    }
    return agents;
  }

  /**
   * Send message to an agent by agent ID (checks both agentId and likuId)
   */
  sendToAgent(agentId: string, message: AIResponse): boolean {
    for (const [, client] of this.clients) {
      if (client.agentId === agentId || client.likuId === agentId) {
        this.sendToClient(client, message);
        return true;
      }
    }
    return false;
  }

  /**
   * Get number of connected clients
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Get the port the server is running on
   */
  get port(): number {
    return this.config.port;
  }

  /**
   * Check if server is running
   */
  get isRunning(): boolean {
    return this.wss !== null;
  }
}

// Singleton instance with default config
export const wsServer = new LikuWebSocketServer();
