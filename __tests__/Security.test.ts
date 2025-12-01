/**
 * Security Module Tests
 * 
 * Phase 5.3: Network Security
 * Tests for TLS configuration, JWT authentication, and security utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SecurityManager,
  getSecurityManager,
  resetSecurityManager,
  DEFAULT_TLS_CONFIG,
  DEFAULT_JWT_CONFIG,
  TLS13_CIPHERS,
  TLSConfig,
  JWTConfig,
  JWTPayload,
} from '../src/websocket/security.js';

describe('SecurityManager', () => {
  beforeEach(() => {
    resetSecurityManager();
  });

  describe('Construction', () => {
    it('should create with default config', () => {
      const manager = new SecurityManager();
      expect(manager.isTLSEnabled()).toBe(false);
      expect(manager.isJWTEnabled()).toBe(false);
    });

    it('should create with TLS config', () => {
      const manager = new SecurityManager({ enabled: true, cert: 'test-cert', key: 'test-key' });
      expect(manager.isTLSEnabled()).toBe(true);
    });

    it('should create with JWT config', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test-secret' });
      expect(manager.isJWTEnabled()).toBe(true);
    });

    it('should create singleton via getSecurityManager', () => {
      const manager1 = getSecurityManager();
      const manager2 = getSecurityManager();
      expect(manager1).toBe(manager2);
    });

    it('should reset singleton on resetSecurityManager', () => {
      const manager1 = getSecurityManager({ enabled: true, cert: 'a', key: 'b' });
      resetSecurityManager();
      const manager2 = getSecurityManager();
      expect(manager1).not.toBe(manager2);
    });
  });

  describe('TLS Configuration', () => {
    it('should return null TLS options when disabled', () => {
      const manager = new SecurityManager({ enabled: false });
      expect(manager.getTLSOptions()).toBeNull();
      expect(manager.getSecureServerOptions()).toBeNull();
    });

    it('should load TLS options from strings', () => {
      const manager = new SecurityManager({
        enabled: true,
        cert: '-----BEGIN CERTIFICATE-----\ntest-cert\n-----END CERTIFICATE-----',
        key: '-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----',
      });

      const options = manager.getTLSOptions();
      expect(options).not.toBeNull();
      expect(options!.cert).toContain('test-cert');
      expect(options!.key).toContain('test-key');
    });

    it('should include CA chain when provided', () => {
      const manager = new SecurityManager({
        enabled: true,
        cert: 'test-cert',
        key: 'test-key',
        ca: 'test-ca-chain',
      });

      const options = manager.getTLSOptions();
      expect(options!.ca).toBe('test-ca-chain');
    });

    it('should throw when TLS enabled without cert', () => {
      const manager = new SecurityManager({
        enabled: true,
        key: 'test-key',
      });

      expect(() => manager.getTLSOptions()).toThrow('no certificate provided');
    });

    it('should throw when TLS enabled without key', () => {
      const manager = new SecurityManager({
        enabled: true,
        cert: 'test-cert',
      });

      expect(() => manager.getTLSOptions()).toThrow('no private key provided');
    });

    it('should include secure server options', () => {
      const manager = new SecurityManager({
        enabled: true,
        cert: 'test-cert',
        key: 'test-key',
        minVersion: 'TLSv1.3',
        ciphers: TLS13_CIPHERS,
        requestCert: true,
        rejectUnauthorized: false,
        passphrase: 'test-pass',
      });

      const options = manager.getSecureServerOptions();
      expect(options).not.toBeNull();
      expect(options!.minVersion).toBe('TLSv1.3');
      expect(options!.ciphers).toBe(TLS13_CIPHERS);
      expect(options!.requestCert).toBe(true);
      expect(options!.rejectUnauthorized).toBe(false);
      expect(options!.passphrase).toBe('test-pass');
    });
  });

  describe('JWT Token Generation', () => {
    it('should generate valid token', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test-secret' });
      const token = manager.generateToken('agent-123', 'TestAgent', 'player');

      expect(token).toBeTruthy();
      expect(token.split('.').length).toBe(3);
    });

    it('should include correct claims in token', () => {
      const manager = new SecurityManager(undefined, {
        enabled: true,
        secret: 'test-secret',
        issuer: 'test-issuer',
        audience: 'test-audience',
        expiresIn: 3600,
      });

      const token = manager.generateToken('agent-123', 'TestAgent', 'spectator');
      const validation = manager.validateToken(token);

      expect(validation.valid).toBe(true);
      expect(validation.payload?.sub).toBe('agent-123');
      expect(validation.payload?.name).toBe('TestAgent');
      expect(validation.payload?.role).toBe('spectator');
      expect(validation.payload?.iss).toBe('test-issuer');
      expect(validation.payload?.aud).toBe('test-audience');
      expect(validation.payload?.jti).toBeTruthy();
    });

    it('should generate unique JTI for each token', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test-secret' });
      
      const token1 = manager.generateToken('agent-1', 'Agent1', 'player');
      const token2 = manager.generateToken('agent-2', 'Agent2', 'player');

      const jti1 = manager.validateToken(token1).payload?.jti;
      const jti2 = manager.validateToken(token2).payload?.jti;

      expect(jti1).not.toBe(jti2);
    });

    it('should include custom claims', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test-secret' });
      const token = manager.generateToken('agent-123', 'TestAgent', 'player', {
        customField: 'customValue',
        gameId: 'game-456',
      });

      const validation = manager.validateToken(token);
      expect(validation.payload?.customField).toBe('customValue');
      expect(validation.payload?.gameId).toBe('game-456');
    });

    it('should generate refresh tokens', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test-secret' });
      const refreshToken = manager.generateRefreshToken('agent-123');

      expect(refreshToken).toBeTruthy();
      expect(refreshToken.split('.').length).toBe(3);

      const validation = manager.validateToken(refreshToken);
      expect(validation.valid).toBe(true);
      expect(validation.payload?.sub).toBe('agent-123');
    });
  });

  describe('JWT Token Validation', () => {
    it('should validate valid token', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test-secret' });
      const token = manager.generateToken('agent-123', 'TestAgent', 'player');

      const result = manager.validateToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload).toBeTruthy();
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid format', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test-secret' });

      const result = manager.validateToken('not.a.valid.token.format');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token format');
    });

    it('should reject token with invalid signature', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test-secret' });
      const token = manager.generateToken('agent-123', 'TestAgent', 'player');

      // Tamper with signature
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.invalid_signature`;

      const result = manager.validateToken(tamperedToken);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });

    it('should reject expired token', () => {
      const manager = new SecurityManager(undefined, {
        enabled: true,
        secret: 'test-secret',
        expiresIn: -1, // Already expired
      });

      const token = manager.generateToken('agent-123', 'TestAgent', 'player');
      const result = manager.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
      expect(result.expired).toBe(true);
    });

    it('should reject token with wrong issuer', () => {
      const manager1 = new SecurityManager(undefined, {
        enabled: true,
        secret: 'shared-secret',
        issuer: 'issuer-1',
      });

      const manager2 = new SecurityManager(undefined, {
        enabled: true,
        secret: 'shared-secret',
        issuer: 'issuer-2',
      });

      const token = manager1.generateToken('agent-123', 'TestAgent', 'player');
      const result = manager2.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid issuer');
    });

    it('should reject token with wrong audience', () => {
      const manager1 = new SecurityManager(undefined, {
        enabled: true,
        secret: 'shared-secret',
        audience: 'aud-1',
      });

      const manager2 = new SecurityManager(undefined, {
        enabled: true,
        secret: 'shared-secret',
        audience: 'aud-2',
      });

      const token = manager1.generateToken('agent-123', 'TestAgent', 'player');
      const result = manager2.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid audience');
    });
  });

  describe('Token Revocation', () => {
    it('should revoke token by JTI', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test-secret' });
      const token = manager.generateToken('agent-123', 'TestAgent', 'player');

      // Get JTI from token
      const validation = manager.validateToken(token);
      expect(validation.valid).toBe(true);
      const jti = validation.payload!.jti;

      // Revoke the token
      manager.revokeToken(jti);

      // Try to validate again
      const result = manager.validateToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });
  });

  describe('Token Refresh', () => {
    it('should refresh token successfully', () => {
      const manager = new SecurityManager(undefined, {
        enabled: true,
        secret: 'test-secret',
        allowRefresh: true,
      });

      const refreshToken = manager.generateRefreshToken('agent-123');
      const result = manager.refreshToken(refreshToken);

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBeTruthy();
      expect(result!.refreshToken).toBeTruthy();
      expect(result!.accessToken).not.toBe(result!.refreshToken);
    });

    it('should revoke old refresh token after refresh', () => {
      const manager = new SecurityManager(undefined, {
        enabled: true,
        secret: 'test-secret',
        allowRefresh: true,
      });

      const refreshToken = manager.generateRefreshToken('agent-123');
      manager.refreshToken(refreshToken);

      // Old refresh token should be revoked
      const result = manager.validateToken(refreshToken);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });

    it('should reject refresh when disabled', () => {
      const manager = new SecurityManager(undefined, {
        enabled: true,
        secret: 'test-secret',
        allowRefresh: false,
      });

      const refreshToken = manager.generateRefreshToken('agent-123');
      const result = manager.refreshToken(refreshToken);

      expect(result).toBeNull();
    });

    it('should reject refresh with invalid token', () => {
      const manager = new SecurityManager(undefined, {
        enabled: true,
        secret: 'test-secret',
        allowRefresh: true,
      });

      const result = manager.refreshToken('invalid.token.here');
      expect(result).toBeNull();
    });
  });

  describe('Header Token Extraction', () => {
    it('should extract Bearer token from Authorization header', () => {
      const manager = new SecurityManager();
      const token = manager.extractTokenFromHeader('Bearer abc123xyz');
      expect(token).toBe('abc123xyz');
    });

    it('should extract direct token', () => {
      const manager = new SecurityManager();
      const token = manager.extractTokenFromHeader('abc123xyz');
      expect(token).toBe('abc123xyz');
    });

    it('should return null for undefined header', () => {
      const manager = new SecurityManager();
      const token = manager.extractTokenFromHeader(undefined);
      expect(token).toBeNull();
    });
  });

  describe('Upgrade Request Validation', () => {
    it('should allow upgrade when JWT disabled', () => {
      const manager = new SecurityManager(undefined, { enabled: false });
      const result = manager.validateUpgradeRequest({});
      expect(result.valid).toBe(true);
    });

    it('should reject upgrade without token when JWT enabled', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test' });
      const result = manager.validateUpgradeRequest({});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No authentication token');
    });

    it('should accept valid Authorization header', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test-secret' });
      const token = manager.generateToken('agent-123', 'TestAgent', 'player');

      const result = manager.validateUpgradeRequest({
        authorization: `Bearer ${token}`,
      });

      expect(result.valid).toBe(true);
    });

    it('should accept valid Sec-WebSocket-Protocol header', () => {
      const manager = new SecurityManager(undefined, { enabled: true, secret: 'test-secret' });
      const token = manager.generateToken('agent-123', 'TestAgent', 'player');

      const result = manager.validateUpgradeRequest({
        'sec-websocket-protocol': token,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('Utility Methods', () => {
    it('should generate unique connection IDs', () => {
      const id1 = SecurityManager.generateConnectionId();
      const id2 = SecurityManager.generateConnectionId();

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
      expect(id1.length).toBe(32); // 16 bytes hex
    });

    it('should hash values consistently', () => {
      const hash1 = SecurityManager.hashValue('test-value');
      const hash2 = SecurityManager.hashValue('test-value');
      const hash3 = SecurityManager.hashValue('different-value');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1.length).toBe(16); // Truncated hex
    });

    it('should return config summary', () => {
      const manager = new SecurityManager(
        { enabled: true, cert: 'c', key: 'k', minVersion: 'TLSv1.3', requestCert: true },
        { enabled: true, secret: 's', algorithm: 'HS512', issuer: 'test', expiresIn: 7200 }
      );

      const summary = manager.getConfigSummary();

      expect(summary.tls).toEqual({
        enabled: true,
        minVersion: 'TLSv1.3',
        requestCert: true,
      });

      expect(summary.jwt).toEqual({
        enabled: true,
        algorithm: 'HS512',
        issuer: 'test',
        expiresIn: 7200,
        allowRefresh: true,
      });
    });
  });

  describe('Algorithm Support', () => {
    it('should support HS256', () => {
      const manager = new SecurityManager(undefined, {
        enabled: true,
        secret: 'test-secret',
        algorithm: 'HS256',
      });

      const token = manager.generateToken('agent', 'Agent', 'player');
      expect(manager.validateToken(token).valid).toBe(true);
    });

    it('should support HS384', () => {
      const manager = new SecurityManager(undefined, {
        enabled: true,
        secret: 'test-secret',
        algorithm: 'HS384',
      });

      const token = manager.generateToken('agent', 'Agent', 'player');
      expect(manager.validateToken(token).valid).toBe(true);
    });

    it('should support HS512', () => {
      const manager = new SecurityManager(undefined, {
        enabled: true,
        secret: 'test-secret',
        algorithm: 'HS512',
      });

      const token = manager.generateToken('agent', 'Agent', 'player');
      expect(manager.validateToken(token).valid).toBe(true);
    });
  });
});

describe('Default Configs', () => {
  it('should have secure TLS defaults', () => {
    expect(DEFAULT_TLS_CONFIG.enabled).toBe(false);
    expect(DEFAULT_TLS_CONFIG.minVersion).toBe('TLSv1.2');
    expect(DEFAULT_TLS_CONFIG.rejectUnauthorized).toBe(true);
    expect(DEFAULT_TLS_CONFIG.requestCert).toBe(false);
    expect(DEFAULT_TLS_CONFIG.ciphers).toContain('ECDHE');
  });

  it('should have secure JWT defaults', () => {
    expect(DEFAULT_JWT_CONFIG.enabled).toBe(false);
    expect(DEFAULT_JWT_CONFIG.algorithm).toBe('HS256');
    expect(DEFAULT_JWT_CONFIG.expiresIn).toBe(3600); // 1 hour
    expect(DEFAULT_JWT_CONFIG.issuer).toBe('liku-ai');
    expect(DEFAULT_JWT_CONFIG.allowRefresh).toBe(true);
    expect(DEFAULT_JWT_CONFIG.refreshExpiresIn).toBe(604800); // 7 days
  });

  it('should have TLS 1.3 cipher suite', () => {
    expect(TLS13_CIPHERS).toContain('TLS_AES_128_GCM_SHA256');
    expect(TLS13_CIPHERS).toContain('TLS_AES_256_GCM_SHA384');
    expect(TLS13_CIPHERS).toContain('TLS_CHACHA20_POLY1305_SHA256');
  });
});
