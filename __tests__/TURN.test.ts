/**
 * TURN/STUN Module Tests
 * 
 * Phase 5.3: Network Security - NAT Traversal
 * Tests for ICE server configuration, signaling, and peer management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TURNManager,
  getTURNManager,
  resetTURNManager,
  DEFAULT_NAT_CONFIG,
  SignalingMessageType,
  isRelayCandidate,
  isHostCandidate,
  isSrflxCandidate,
  getCandidatePriority,
  ICECandidate,
} from '../src/websocket/turn.js';

describe('TURNManager', () => {
  beforeEach(() => {
    resetTURNManager();
  });

  describe('Construction', () => {
    it('should create with default config', () => {
      const manager = new TURNManager();
      expect(manager.isEnabled()).toBe(false);
    });

    it('should create with custom config', () => {
      const manager = new TURNManager({
        enabled: true,
        stunServers: ['stun:custom.server:3478'],
      });
      expect(manager.isEnabled()).toBe(true);
    });

    it('should create singleton via getTURNManager', () => {
      const manager1 = getTURNManager();
      const manager2 = getTURNManager();
      expect(manager1).toBe(manager2);
    });

    it('should reset singleton on resetTURNManager', () => {
      const manager1 = getTURNManager({ enabled: true });
      resetTURNManager();
      const manager2 = getTURNManager();
      expect(manager1).not.toBe(manager2);
    });
  });

  describe('ICE Server Configuration', () => {
    it('should return STUN servers without credentials', () => {
      const manager = new TURNManager({
        enabled: true,
        stunServers: ['stun:stun.example.com:3478'],
      });

      const servers = manager.getICEServers();
      expect(servers.length).toBe(1);
      expect(servers[0].urls).toContain('stun:stun.example.com:3478');
      expect(servers[0].username).toBeUndefined();
      expect(servers[0].credential).toBeUndefined();
    });

    it('should return TURN servers with static credentials', () => {
      const manager = new TURNManager({
        enabled: true,
        stunServers: [], // No STUN servers for this test
        turnServers: ['turn:turn.example.com:3478'],
        username: 'testuser',
        credential: 'testpass',
      });

      const servers = manager.getICEServers();
      expect(servers.length).toBe(1);
      expect(servers[0].urls).toContain('turn:turn.example.com:3478');
      expect(servers[0].username).toBe('testuser');
      expect(servers[0].credential).toBe('testpass');
      expect(servers[0].credentialType).toBe('password');
    });

    it('should include both STUN and TURN servers', () => {
      const manager = new TURNManager({
        enabled: true,
        stunServers: ['stun:stun.example.com:3478'],
        turnServers: ['turn:turn.example.com:3478'],
        username: 'user',
        credential: 'pass',
      });

      const servers = manager.getICEServers();
      expect(servers.length).toBe(2);
    });

    it('should generate time-limited credentials', () => {
      const manager = new TURNManager({
        enabled: true,
        stunServers: [], // No STUN servers for this test
        turnServers: ['turn:turn.example.com:3478'],
        useTimeLimitedCredentials: true,
        sharedSecret: 'my-shared-secret',
        credentialTTL: 3600,
      });

      const servers = manager.getICEServers('client-123');
      expect(servers.length).toBe(1);
      expect(servers[0].username).toContain('client-123');
      expect(servers[0].credential).toBeTruthy();
    });

    it('should generate different credentials for different clients', () => {
      const manager = new TURNManager({
        enabled: true,
        stunServers: [], // No STUN servers for this test
        turnServers: ['turn:turn.example.com:3478'],
        useTimeLimitedCredentials: true,
        sharedSecret: 'my-shared-secret',
      });

      const servers1 = manager.getICEServers('client-1');
      const servers2 = manager.getICEServers('client-2');

      expect(servers1[0].username).not.toBe(servers2[0].username);
      expect(servers1[0].credential).not.toBe(servers2[0].credential);
    });
  });

  describe('Time-Limited Credentials', () => {
    it('should include timestamp in username', () => {
      const manager = new TURNManager({
        enabled: true,
        turnServers: ['turn:turn.example.com:3478'],
        useTimeLimitedCredentials: true,
        sharedSecret: 'secret',
        credentialTTL: 3600,
      });

      const credentials = manager.generateTimeLimitedCredentials('client-1');
      const parts = credentials.username.split(':');
      expect(parts.length).toBe(2);
      
      const timestamp = parseInt(parts[0], 10);
      const now = Math.floor(Date.now() / 1000);
      expect(timestamp).toBeGreaterThan(now);
      expect(timestamp).toBeLessThanOrEqual(now + 3600);
    });

    it('should generate HMAC-SHA1 credential', () => {
      const manager = new TURNManager({
        enabled: true,
        turnServers: ['turn:example.com'],
        useTimeLimitedCredentials: true,
        sharedSecret: 'test-secret',
      });

      const credentials = manager.generateTimeLimitedCredentials('test');
      expect(credentials.credential).toBeTruthy();
      // Base64 encoded HMAC-SHA1 is typically 28 characters
      expect(credentials.credential.length).toBeGreaterThan(20);
    });

    it('should include TTL in response', () => {
      const manager = new TURNManager({
        enabled: true,
        turnServers: ['turn:example.com'],
        useTimeLimitedCredentials: true,
        sharedSecret: 'secret',
        credentialTTL: 7200,
      });

      const credentials = manager.generateTimeLimitedCredentials('client');
      expect(credentials.ttl).toBe(7200);
    });
  });

  describe('Peer Connection Management', () => {
    it('should create peer connection', () => {
      const manager = new TURNManager({ enabled: true });
      const conn = manager.createPeerConnection('peer-1');

      expect(conn.peerId).toBe('peer-1');
      expect(conn.state).toBe('new');
      expect(conn.iceState).toBe('new');
      expect(conn.usingRelay).toBe(false);
    });

    it('should emit peerCreated event', () => {
      const manager = new TURNManager({ enabled: true });
      const spy = vi.fn();
      manager.on('peerCreated', spy);

      manager.createPeerConnection('peer-1');
      expect(spy).toHaveBeenCalledWith('peer-1');
    });

    it('should get peer connection', () => {
      const manager = new TURNManager({ enabled: true });
      manager.createPeerConnection('peer-1');

      const conn = manager.getPeerConnection('peer-1');
      expect(conn).toBeTruthy();
      expect(conn?.peerId).toBe('peer-1');
    });

    it('should return undefined for non-existent peer', () => {
      const manager = new TURNManager({ enabled: true });
      const conn = manager.getPeerConnection('non-existent');
      expect(conn).toBeUndefined();
    });

    it('should update peer state', () => {
      const manager = new TURNManager({ enabled: true });
      const spy = vi.fn();
      manager.on('peerStateChange', spy);

      manager.createPeerConnection('peer-1');
      manager.updatePeerState('peer-1', 'connecting');

      const conn = manager.getPeerConnection('peer-1');
      expect(conn?.state).toBe('connecting');
      expect(spy).toHaveBeenCalledWith('peer-1', 'connecting');
    });

    it('should set connectedAt when state becomes connected', () => {
      const manager = new TURNManager({ enabled: true });
      manager.createPeerConnection('peer-1');

      const before = Date.now();
      manager.updatePeerState('peer-1', 'connected');
      const after = Date.now();

      const conn = manager.getPeerConnection('peer-1');
      expect(conn?.connectedAt).toBeGreaterThanOrEqual(before);
      expect(conn?.connectedAt).toBeLessThanOrEqual(after);
    });

    it('should update ICE state', () => {
      const manager = new TURNManager({ enabled: true });
      const spy = vi.fn();
      manager.on('iceStateChange', spy);

      manager.createPeerConnection('peer-1');
      manager.updateICEState('peer-1', 'checking');

      const conn = manager.getPeerConnection('peer-1');
      expect(conn?.iceState).toBe('checking');
      expect(spy).toHaveBeenCalledWith('peer-1', 'checking');
    });

    it('should emit usingRelay when forceRelay is set', () => {
      const manager = new TURNManager({ enabled: true, forceRelay: true });
      const spy = vi.fn();
      manager.on('usingRelay', spy);

      manager.createPeerConnection('peer-1');
      manager.updateICEState('peer-1', 'connected');

      expect(spy).toHaveBeenCalledWith('peer-1');
    });

    it('should close peer connection', () => {
      const manager = new TURNManager({ enabled: true });
      const spy = vi.fn();
      manager.on('peerClosed', spy);

      manager.createPeerConnection('peer-1');
      manager.closePeerConnection('peer-1');

      expect(manager.getPeerConnection('peer-1')).toBeUndefined();
      expect(spy).toHaveBeenCalledWith('peer-1');
    });
  });

  describe('ICE Candidate Management', () => {
    it('should add local candidate', () => {
      const manager = new TURNManager({ enabled: true });
      const spy = vi.fn();
      manager.on('localCandidate', spy);

      manager.createPeerConnection('peer-1');
      const candidate: ICECandidate = {
        candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 54321 typ host',
        sdpMid: 'audio',
        sdpMLineIndex: 0,
      };

      manager.addLocalCandidate('peer-1', candidate);

      const conn = manager.getPeerConnection('peer-1');
      expect(conn?.localCandidates.length).toBe(1);
      expect(spy).toHaveBeenCalledWith('peer-1', candidate);
    });

    it('should add remote candidate', () => {
      const manager = new TURNManager({ enabled: true });
      const spy = vi.fn();
      manager.on('remoteCandidate', spy);

      manager.createPeerConnection('peer-1');
      const candidate: ICECandidate = {
        candidate: 'candidate:1 1 udp 2130706431 10.0.0.1 54321 typ host',
        sdpMid: 'audio',
        sdpMLineIndex: 0,
      };

      manager.addRemoteCandidate('peer-1', candidate);

      const conn = manager.getPeerConnection('peer-1');
      expect(conn?.remoteCandidates.length).toBe(1);
      expect(spy).toHaveBeenCalledWith('peer-1', candidate);
    });

    it('should detect relay candidate', () => {
      const manager = new TURNManager({ enabled: true });
      manager.createPeerConnection('peer-1');

      const relayCandidate: ICECandidate = {
        candidate: 'candidate:1 1 udp 5000 1.2.3.4 54321 typ relay raddr 10.0.0.1 rport 12345',
        sdpMid: 'audio',
        sdpMLineIndex: 0,
      };

      manager.addLocalCandidate('peer-1', relayCandidate);

      const conn = manager.getPeerConnection('peer-1');
      expect(conn?.usingRelay).toBe(true);
    });
  });

  describe('Signaling Messages', () => {
    it('should queue signaling message', () => {
      const manager = new TURNManager({ enabled: true });
      const spy = vi.fn();
      manager.on('signalingQueued', spy);

      const message = manager.createOffer('from-1', 'to-1', 'sdp-offer');
      manager.queueSignalingMessage(message);

      expect(spy).toHaveBeenCalledWith(message);
    });

    it('should get and clear pending messages', () => {
      const manager = new TURNManager({ enabled: true });

      const msg1 = manager.createOffer('from-1', 'to-1', 'offer');
      const msg2 = manager.createICECandidateMessage('from-1', 'to-1', {
        candidate: 'test',
        sdpMid: null,
        sdpMLineIndex: null,
      });

      manager.queueSignalingMessage(msg1);
      manager.queueSignalingMessage(msg2);

      const messages = manager.getPendingMessages('from-1', 'to-1');
      expect(messages.length).toBe(2);

      // Should be cleared
      const emptyMessages = manager.getPendingMessages('from-1', 'to-1');
      expect(emptyMessages.length).toBe(0);
    });

    it('should create offer message', () => {
      const manager = new TURNManager({ enabled: true });
      const offer = manager.createOffer('agent-1', 'agent-2', 'v=0\r\n...');

      expect(offer.type).toBe(SignalingMessageType.OFFER);
      expect(offer.from).toBe('agent-1');
      expect(offer.to).toBe('agent-2');
      expect((offer.data as { type: string; sdp: string }).type).toBe('offer');
      expect((offer.data as { type: string; sdp: string }).sdp).toBe('v=0\r\n...');
    });

    it('should create answer message', () => {
      const manager = new TURNManager({ enabled: true });
      const answer = manager.createAnswer('agent-2', 'agent-1', 'v=0\r\nanswer');

      expect(answer.type).toBe(SignalingMessageType.ANSWER);
      expect((answer.data as { type: string }).type).toBe('answer');
    });

    it('should create ICE candidate message', () => {
      const manager = new TURNManager({ enabled: true });
      const candidate: ICECandidate = {
        candidate: 'candidate:123',
        sdpMid: 'audio',
        sdpMLineIndex: 0,
      };

      const msg = manager.createICECandidateMessage('agent-1', 'agent-2', candidate);

      expect(msg.type).toBe(SignalingMessageType.ICE_CANDIDATE);
      expect(msg.data).toEqual(candidate);
    });

    it('should create ICE servers message', () => {
      const manager = new TURNManager({
        enabled: true,
        stunServers: ['stun:stun.example.com'],
      });

      const msg = manager.createICEServersMessage('agent-1');

      expect(msg.type).toBe(SignalingMessageType.ICE_SERVERS);
      expect(msg.from).toBe('server');
      expect(msg.to).toBe('agent-1');
    });
  });

  describe('Statistics', () => {
    it('should return connection statistics', () => {
      const manager = new TURNManager({ enabled: true });

      manager.createPeerConnection('peer-1');
      manager.updatePeerState('peer-1', 'connected');

      manager.createPeerConnection('peer-2');
      manager.updatePeerState('peer-2', 'failed');

      manager.createPeerConnection('peer-3');
      manager.updatePeerState('peer-3', 'connected');
      
      // Mark peer-3 as using relay
      manager.addLocalCandidate('peer-3', {
        candidate: 'candidate:1 typ relay',
        sdpMid: null,
        sdpMLineIndex: null,
      });

      const stats = manager.getStats();

      expect(stats.totalConnections).toBe(3);
      expect(stats.activeConnections).toBe(2);
      expect(stats.failedConnections).toBe(1);
      expect(stats.relayConnections).toBe(1);
      expect(stats.directConnections).toBe(1);
    });

    it('should return active peers', () => {
      const manager = new TURNManager({ enabled: true });

      manager.createPeerConnection('peer-1');
      manager.updatePeerState('peer-1', 'connected');

      manager.createPeerConnection('peer-2');
      manager.updatePeerState('peer-2', 'failed');

      manager.createPeerConnection('peer-3');

      const active = manager.getActivePeers();
      expect(active.length).toBe(2);
      expect(active).toContain('peer-1');
      expect(active).toContain('peer-3');
      expect(active).not.toContain('peer-2');
    });
  });

  describe('Configuration Summary', () => {
    it('should return safe config summary', () => {
      const manager = new TURNManager({
        enabled: true,
        stunServers: ['stun:a', 'stun:b'],
        turnServers: ['turn:c'],
        sharedSecret: 'should-not-appear',
        credential: 'should-not-appear',
        useTimeLimitedCredentials: true,
        credentialTTL: 7200,
        forceRelay: true,
        iceTransportPolicy: 'relay',
      });

      const summary = manager.getConfigSummary();

      expect(summary.enabled).toBe(true);
      expect(summary.stunServers).toBe(2);
      expect(summary.turnServers).toBe(1);
      expect(summary.useTimeLimitedCredentials).toBe(true);
      expect(summary.credentialTTL).toBe(7200);
      expect(summary.forceRelay).toBe(true);
      expect(summary.iceTransportPolicy).toBe('relay');
      
      // Should not contain sensitive data
      expect(JSON.stringify(summary)).not.toContain('should-not-appear');
    });
  });

  describe('Reset', () => {
    it('should clear all state on reset', () => {
      const manager = new TURNManager({ enabled: true });
      const spy = vi.fn();
      manager.on('reset', spy);

      manager.createPeerConnection('peer-1');
      manager.createPeerConnection('peer-2');
      manager.queueSignalingMessage(manager.createOffer('a', 'b', 'sdp'));

      manager.reset();

      expect(manager.getPeerConnection('peer-1')).toBeUndefined();
      expect(manager.getPeerConnection('peer-2')).toBeUndefined();
      expect(manager.getPendingMessages('a', 'b').length).toBe(0);
      expect(spy).toHaveBeenCalled();
    });
  });
});

describe('ICE Candidate Helpers', () => {
  it('should detect relay candidate', () => {
    const candidate: ICECandidate = {
      candidate: 'candidate:1 1 udp 5000 1.2.3.4 54321 typ relay',
      sdpMid: 'audio',
      sdpMLineIndex: 0,
    };
    expect(isRelayCandidate(candidate)).toBe(true);
    expect(isHostCandidate(candidate)).toBe(false);
    expect(isSrflxCandidate(candidate)).toBe(false);
  });

  it('should detect host candidate', () => {
    const candidate: ICECandidate = {
      candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 54321 typ host',
      sdpMid: 'audio',
      sdpMLineIndex: 0,
    };
    expect(isHostCandidate(candidate)).toBe(true);
    expect(isRelayCandidate(candidate)).toBe(false);
    expect(isSrflxCandidate(candidate)).toBe(false);
  });

  it('should detect server reflexive candidate', () => {
    const candidate: ICECandidate = {
      candidate: 'candidate:1 1 udp 1694498815 1.2.3.4 54321 typ srflx raddr 192.168.1.1 rport 54321',
      sdpMid: 'audio',
      sdpMLineIndex: 0,
    };
    expect(isSrflxCandidate(candidate)).toBe(true);
    expect(isHostCandidate(candidate)).toBe(false);
    expect(isRelayCandidate(candidate)).toBe(false);
  });

  it('should get candidate priority', () => {
    const candidate: ICECandidate = {
      candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 54321 typ host generation 0 network-id 1',
      sdpMid: null,
      sdpMLineIndex: null,
    };
    expect(getCandidatePriority(candidate)).toBe(2130706431);
  });

  it('should return 0 for missing priority', () => {
    const candidate: ICECandidate = {
      candidate: 'candidate:1 1 udp',
      sdpMid: null,
      sdpMLineIndex: null,
    };
    expect(getCandidatePriority(candidate)).toBe(0);
  });
});

describe('Default Config', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_NAT_CONFIG.enabled).toBe(false);
    expect(DEFAULT_NAT_CONFIG.stunServers?.length).toBeGreaterThan(0);
    expect(DEFAULT_NAT_CONFIG.stunServers).toContain('stun:stun.l.google.com:19302');
    expect(DEFAULT_NAT_CONFIG.turnServers?.length).toBe(0);
    expect(DEFAULT_NAT_CONFIG.credentialTTL).toBe(3600);
    expect(DEFAULT_NAT_CONFIG.forceRelay).toBe(false);
    expect(DEFAULT_NAT_CONFIG.iceTransportPolicy).toBe('all');
  });
});
