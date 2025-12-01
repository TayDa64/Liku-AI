/**
 * Liku-AI TURN/STUN Server Support
 * 
 * Phase 5.3: Network Security - NAT Traversal
 * 
 * Provides ICE candidate handling and relay configuration
 * for peer-to-peer connections through NAT/firewall barriers.
 * 
 * This module integrates with the WebSocket server to:
 * 1. Provide ICE server configuration to clients
 * 2. Handle ICE candidate exchange
 * 3. Support TURN relay fallback when direct P2P fails
 * 
 * @module websocket/turn
 */

import { EventEmitter } from 'events';
import { createHmac, randomBytes } from 'crypto';

/**
 * ICE Server configuration
 */
export interface ICEServer {
  urls: string | string[];
  username?: string;
  credential?: string;
  credentialType?: 'password' | 'oauth';
}

/**
 * TURN server credentials
 */
export interface TURNCredentials {
  username: string;
  credential: string;
  ttl: number;
  uris: string[];
}

/**
 * ICE candidate from a peer
 */
export interface ICECandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string;
}

/**
 * Session Description Protocol offer/answer
 */
export interface SDPMessage {
  type: 'offer' | 'answer';
  sdp: string;
}

/**
 * Peer connection state
 */
export type PeerConnectionState = 
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

/**
 * ICE connection state
 */
export type ICEConnectionState = 
  | 'new'
  | 'checking'
  | 'connected'
  | 'completed'
  | 'failed'
  | 'disconnected'
  | 'closed';

/**
 * Signaling message types
 */
export enum SignalingMessageType {
  OFFER = 'offer',
  ANSWER = 'answer',
  ICE_CANDIDATE = 'ice-candidate',
  ICE_SERVERS = 'ice-servers',
  PEER_STATE = 'peer-state',
  RELAY_REQUIRED = 'relay-required',
}

/**
 * Signaling message structure
 */
export interface SignalingMessage {
  type: SignalingMessageType;
  from: string;
  to: string;
  data: SDPMessage | ICECandidate | ICEServer[] | { state: PeerConnectionState };
  timestamp: number;
}

/**
 * TURN server configuration
 */
export interface TURNConfig {
  /** Enable TURN support */
  enabled: boolean;
  /** STUN server URLs (free, used first) */
  stunServers?: string[];
  /** TURN server URLs (relay, used as fallback) */
  turnServers?: string[];
  /** TURN server username (static or shared secret) */
  username?: string;
  /** TURN server credential/password */
  credential?: string;
  /** Use time-limited credentials (RFC 5766) */
  useTimeLimitedCredentials?: boolean;
  /** Shared secret for time-limited credentials */
  sharedSecret?: string;
  /** Credential TTL in seconds (default: 1 hour) */
  credentialTTL?: number;
  /** Prefer relay (force all traffic through TURN) */
  forceRelay?: boolean;
  /** ICE transport policy */
  iceTransportPolicy?: 'all' | 'relay';
}

/**
 * Default TURN/STUN configuration with public STUN servers
 */
export const DEFAULT_NAT_CONFIG: TURNConfig = {
  enabled: false,
  stunServers: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
  ],
  turnServers: [],
  useTimeLimitedCredentials: false,
  credentialTTL: 3600, // 1 hour
  forceRelay: false,
  iceTransportPolicy: 'all',
};

/**
 * Active peer connection tracking
 */
interface PeerConnection {
  peerId: string;
  state: PeerConnectionState;
  iceState: ICEConnectionState;
  localCandidates: ICECandidate[];
  remoteCandidates: ICECandidate[];
  usingRelay: boolean;
  createdAt: number;
  connectedAt?: number;
}

/**
 * TURN/STUN Manager for WebRTC-style NAT traversal
 */
export class TURNManager extends EventEmitter {
  private config: TURNConfig;
  private peerConnections: Map<string, PeerConnection> = new Map();
  private pendingSignaling: Map<string, SignalingMessage[]> = new Map();

  constructor(config?: Partial<TURNConfig>) {
    super();
    this.config = { ...DEFAULT_NAT_CONFIG, ...config };
  }

  /**
   * Check if TURN support is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get ICE server configuration for a client
   * Generates time-limited credentials if configured
   */
  getICEServers(clientId?: string): ICEServer[] {
    const servers: ICEServer[] = [];

    // Add STUN servers (no credentials needed)
    if (this.config.stunServers && this.config.stunServers.length > 0) {
      servers.push({
        urls: this.config.stunServers,
      });
    }

    // Add TURN servers with credentials
    if (this.config.turnServers && this.config.turnServers.length > 0) {
      if (this.config.useTimeLimitedCredentials && this.config.sharedSecret) {
        // Generate time-limited credentials (RFC 5766)
        const credentials = this.generateTimeLimitedCredentials(clientId);
        servers.push({
          urls: credentials.uris,
          username: credentials.username,
          credential: credentials.credential,
          credentialType: 'password',
        });
      } else if (this.config.username && this.config.credential) {
        // Use static credentials
        servers.push({
          urls: this.config.turnServers,
          username: this.config.username,
          credential: this.config.credential,
          credentialType: 'password',
        });
      } else {
        // TURN servers without credentials (unlikely to work)
        servers.push({
          urls: this.config.turnServers,
        });
      }
    }

    return servers;
  }

  /**
   * Generate time-limited TURN credentials using shared secret (RFC 5766)
   * Format: username = timestamp:clientId, credential = HMAC-SHA1(sharedSecret, username)
   */
  generateTimeLimitedCredentials(clientId?: string): TURNCredentials {
    const ttl = this.config.credentialTTL || 3600;
    const timestamp = Math.floor(Date.now() / 1000) + ttl;
    const username = `${timestamp}:${clientId || randomBytes(8).toString('hex')}`;
    
    const hmac = createHmac('sha1', this.config.sharedSecret || '');
    hmac.update(username);
    const credential = hmac.digest('base64');

    return {
      username,
      credential,
      ttl,
      uris: this.config.turnServers || [],
    };
  }

  /**
   * Create a new peer connection entry
   */
  createPeerConnection(peerId: string): PeerConnection {
    const connection: PeerConnection = {
      peerId,
      state: 'new',
      iceState: 'new',
      localCandidates: [],
      remoteCandidates: [],
      usingRelay: false,
      createdAt: Date.now(),
    };

    this.peerConnections.set(peerId, connection);
    this.emit('peerCreated', peerId);
    return connection;
  }

  /**
   * Get peer connection state
   */
  getPeerConnection(peerId: string): PeerConnection | undefined {
    return this.peerConnections.get(peerId);
  }

  /**
   * Update peer connection state
   */
  updatePeerState(peerId: string, state: PeerConnectionState): void {
    const connection = this.peerConnections.get(peerId);
    if (connection) {
      connection.state = state;
      if (state === 'connected' && !connection.connectedAt) {
        connection.connectedAt = Date.now();
      }
      this.emit('peerStateChange', peerId, state);
    }
  }

  /**
   * Update ICE connection state
   */
  updateICEState(peerId: string, state: ICEConnectionState): void {
    const connection = this.peerConnections.get(peerId);
    if (connection) {
      connection.iceState = state;
      this.emit('iceStateChange', peerId, state);

      // Detect if relay is being used (failed direct connection)
      if (state === 'connected' || state === 'completed') {
        // In a real implementation, you would check the selected candidate pair
        // For now, we'll emit a suggestion if using relay
        if (this.config.forceRelay || connection.usingRelay) {
          this.emit('usingRelay', peerId);
        }
      }
    }
  }

  /**
   * Add local ICE candidate
   */
  addLocalCandidate(peerId: string, candidate: ICECandidate): void {
    const connection = this.peerConnections.get(peerId);
    if (connection) {
      connection.localCandidates.push(candidate);
      
      // Check if it's a relay candidate
      if (candidate.candidate.includes('typ relay')) {
        connection.usingRelay = true;
      }
      
      this.emit('localCandidate', peerId, candidate);
    }
  }

  /**
   * Add remote ICE candidate
   */
  addRemoteCandidate(peerId: string, candidate: ICECandidate): void {
    const connection = this.peerConnections.get(peerId);
    if (connection) {
      connection.remoteCandidates.push(candidate);
      this.emit('remoteCandidate', peerId, candidate);
    }
  }

  /**
   * Queue a signaling message for delivery
   */
  queueSignalingMessage(message: SignalingMessage): void {
    const key = `${message.from}:${message.to}`;
    const queue = this.pendingSignaling.get(key) || [];
    queue.push(message);
    this.pendingSignaling.set(key, queue);
    this.emit('signalingQueued', message);
  }

  /**
   * Get and clear pending signaling messages for a peer
   */
  getPendingMessages(from: string, to: string): SignalingMessage[] {
    const key = `${from}:${to}`;
    const messages = this.pendingSignaling.get(key) || [];
    this.pendingSignaling.delete(key);
    return messages;
  }

  /**
   * Create an SDP offer message
   */
  createOffer(from: string, to: string, sdp: string): SignalingMessage {
    return {
      type: SignalingMessageType.OFFER,
      from,
      to,
      data: { type: 'offer', sdp },
      timestamp: Date.now(),
    };
  }

  /**
   * Create an SDP answer message
   */
  createAnswer(from: string, to: string, sdp: string): SignalingMessage {
    return {
      type: SignalingMessageType.ANSWER,
      from,
      to,
      data: { type: 'answer', sdp },
      timestamp: Date.now(),
    };
  }

  /**
   * Create an ICE candidate message
   */
  createICECandidateMessage(from: string, to: string, candidate: ICECandidate): SignalingMessage {
    return {
      type: SignalingMessageType.ICE_CANDIDATE,
      from,
      to,
      data: candidate,
      timestamp: Date.now(),
    };
  }

  /**
   * Create an ICE servers configuration message
   */
  createICEServersMessage(to: string): SignalingMessage {
    return {
      type: SignalingMessageType.ICE_SERVERS,
      from: 'server',
      to,
      data: this.getICEServers(to) as unknown as SDPMessage,
      timestamp: Date.now(),
    };
  }

  /**
   * Close a peer connection
   */
  closePeerConnection(peerId: string): void {
    const connection = this.peerConnections.get(peerId);
    if (connection) {
      connection.state = 'closed';
      connection.iceState = 'closed';
      this.emit('peerClosed', peerId);
    }
    this.peerConnections.delete(peerId);
  }

  /**
   * Get all active peer connections
   */
  getActivePeers(): string[] {
    const active: string[] = [];
    for (const [peerId, conn] of this.peerConnections) {
      if (conn.state !== 'closed' && conn.state !== 'failed') {
        active.push(peerId);
      }
    }
    return active;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    relayConnections: number;
    directConnections: number;
    failedConnections: number;
  } {
    let active = 0;
    let relay = 0;
    let direct = 0;
    let failed = 0;

    for (const conn of this.peerConnections.values()) {
      if (conn.state === 'connected') {
        active++;
        if (conn.usingRelay) {
          relay++;
        } else {
          direct++;
        }
      } else if (conn.state === 'failed') {
        failed++;
      }
    }

    return {
      totalConnections: this.peerConnections.size,
      activeConnections: active,
      relayConnections: relay,
      directConnections: direct,
      failedConnections: failed,
    };
  }

  /**
   * Get configuration summary (safe for logging)
   */
  getConfigSummary(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      stunServers: this.config.stunServers?.length || 0,
      turnServers: this.config.turnServers?.length || 0,
      useTimeLimitedCredentials: this.config.useTimeLimitedCredentials,
      credentialTTL: this.config.credentialTTL,
      forceRelay: this.config.forceRelay,
      iceTransportPolicy: this.config.iceTransportPolicy,
    };
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.peerConnections.clear();
    this.pendingSignaling.clear();
    this.emit('reset');
  }
}

/**
 * Singleton TURN manager instance
 */
let turnManagerInstance: TURNManager | null = null;

/**
 * Get or create the TURN manager singleton
 */
export function getTURNManager(config?: Partial<TURNConfig>): TURNManager {
  if (!turnManagerInstance) {
    turnManagerInstance = new TURNManager(config);
  }
  return turnManagerInstance;
}

/**
 * Reset the TURN manager (for testing)
 */
export function resetTURNManager(): void {
  if (turnManagerInstance) {
    turnManagerInstance.reset();
  }
  turnManagerInstance = null;
}

/**
 * Helper: Check if a candidate is a relay candidate
 */
export function isRelayCandidate(candidate: ICECandidate): boolean {
  return candidate.candidate.includes('typ relay');
}

/**
 * Helper: Check if a candidate is a host candidate
 */
export function isHostCandidate(candidate: ICECandidate): boolean {
  return candidate.candidate.includes('typ host');
}

/**
 * Helper: Check if a candidate is a server reflexive candidate
 */
export function isSrflxCandidate(candidate: ICECandidate): boolean {
  return candidate.candidate.includes('typ srflx');
}

/**
 * Helper: Parse candidate priority from SDP
 * Format: candidate:<foundation> <component> <protocol> <priority> <ip> <port> typ <type>
 */
export function getCandidatePriority(candidate: ICECandidate): number {
  // Priority is the 4th space-separated field (after candidate:foundation component protocol)
  const match = candidate.candidate.match(/candidate:\S+\s+\d+\s+\S+\s+(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
