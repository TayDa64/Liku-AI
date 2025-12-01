/**
 * Liku-AI WebSocket Security Module
 * 
 * Phase 5.3: Network Security
 * 
 * Provides:
 * - TLS/WSS configuration and certificate handling
 * - JWT authentication for agent connections
 * - Connection encryption settings
 * - Security validation utilities
 * 
 * @module websocket/security
 */

import { createHmac, randomBytes, createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * TLS/SSL configuration options
 */
export interface TLSConfig {
  /** Enable TLS (wss://) */
  enabled: boolean;
  /** Path to SSL certificate file (PEM format) */
  certPath?: string;
  /** Path to SSL private key file (PEM format) */
  keyPath?: string;
  /** Path to CA certificate chain (PEM format) */
  caPath?: string;
  /** SSL certificate as string (alternative to file path) */
  cert?: string;
  /** SSL private key as string (alternative to file path) */
  key?: string;
  /** CA certificate chain as string */
  ca?: string;
  /** Minimum TLS version (default: TLSv1.2) */
  minVersion?: 'TLSv1.2' | 'TLSv1.3';
  /** Cipher suites (colon-separated, OpenSSL format) */
  ciphers?: string;
  /** Require client certificates (mutual TLS) */
  requestCert?: boolean;
  /** Reject unauthorized certificates */
  rejectUnauthorized?: boolean;
  /** Passphrase for encrypted private key */
  passphrase?: string;
}

/**
 * Default TLS configuration with secure defaults
 */
export const DEFAULT_TLS_CONFIG: TLSConfig = {
  enabled: false,
  minVersion: 'TLSv1.2',
  ciphers: [
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
  ].join(':'),
  requestCert: false,
  rejectUnauthorized: true,
};

/**
 * Recommended TLS 1.3 cipher suites
 */
export const TLS13_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
].join(':');

/**
 * JWT configuration options
 */
export interface JWTConfig {
  /** Enable JWT authentication */
  enabled: boolean;
  /** Secret key for HMAC signing (HS256) */
  secret?: string;
  /** Token expiration in seconds (default: 1 hour) */
  expiresIn?: number;
  /** Token issuer (iss claim) */
  issuer?: string;
  /** Allowed audience (aud claim) */
  audience?: string;
  /** Algorithm for signing (default: HS256) */
  algorithm?: 'HS256' | 'HS384' | 'HS512';
  /** Allow token refresh */
  allowRefresh?: boolean;
  /** Refresh token expiration in seconds (default: 7 days) */
  refreshExpiresIn?: number;
}

/**
 * Default JWT configuration
 */
export const DEFAULT_JWT_CONFIG: JWTConfig = {
  enabled: false,
  expiresIn: 3600, // 1 hour
  issuer: 'liku-ai',
  algorithm: 'HS256',
  allowRefresh: true,
  refreshExpiresIn: 604800, // 7 days
};

/**
 * JWT token payload structure
 */
export interface JWTPayload {
  /** Subject (agent ID) */
  sub: string;
  /** Agent name */
  name: string;
  /** Agent role */
  role: 'player' | 'spectator' | 'admin';
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
  /** Issuer */
  iss: string;
  /** Audience */
  aud?: string;
  /** JWT ID (unique identifier) */
  jti: string;
  /** Custom claims */
  [key: string]: unknown;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
  expired?: boolean;
}

/**
 * Security manager for WebSocket connections
 */
export class SecurityManager {
  private tlsConfig: TLSConfig;
  private jwtConfig: JWTConfig;
  private revokedTokens: Set<string> = new Set();
  private secretKey: Buffer;

  constructor(tlsConfig?: Partial<TLSConfig>, jwtConfig?: Partial<JWTConfig>) {
    this.tlsConfig = { ...DEFAULT_TLS_CONFIG, ...tlsConfig };
    this.jwtConfig = { ...DEFAULT_JWT_CONFIG, ...jwtConfig };
    
    // Initialize or generate secret key
    if (this.jwtConfig.secret) {
      this.secretKey = Buffer.from(this.jwtConfig.secret, 'utf-8');
    } else {
      // Generate a random secret if not provided (not recommended for production)
      this.secretKey = randomBytes(32);
      console.warn('[Security] No JWT secret provided - using random key (tokens will be invalid after restart)');
    }
  }

  // ==================== TLS Methods ====================

  /**
   * Get TLS options for HTTPS/WSS server
   */
  getTLSOptions(): { cert: string; key: string; ca?: string } | null {
    if (!this.tlsConfig.enabled) {
      return null;
    }

    let cert: string;
    let key: string;
    let ca: string | undefined;

    // Load certificate
    if (this.tlsConfig.cert) {
      cert = this.tlsConfig.cert;
    } else if (this.tlsConfig.certPath) {
      const certPath = resolve(this.tlsConfig.certPath);
      if (!existsSync(certPath)) {
        throw new Error(`TLS certificate not found: ${certPath}`);
      }
      cert = readFileSync(certPath, 'utf-8');
    } else {
      throw new Error('TLS enabled but no certificate provided');
    }

    // Load private key
    if (this.tlsConfig.key) {
      key = this.tlsConfig.key;
    } else if (this.tlsConfig.keyPath) {
      const keyPath = resolve(this.tlsConfig.keyPath);
      if (!existsSync(keyPath)) {
        throw new Error(`TLS private key not found: ${keyPath}`);
      }
      key = readFileSync(keyPath, 'utf-8');
    } else {
      throw new Error('TLS enabled but no private key provided');
    }

    // Load CA chain (optional)
    if (this.tlsConfig.ca) {
      ca = this.tlsConfig.ca;
    } else if (this.tlsConfig.caPath) {
      const caPath = resolve(this.tlsConfig.caPath);
      if (existsSync(caPath)) {
        ca = readFileSync(caPath, 'utf-8');
      }
    }

    return { cert, key, ca };
  }

  /**
   * Get full TLS server options including version and ciphers
   */
  getSecureServerOptions(): Record<string, unknown> | null {
    const tlsOptions = this.getTLSOptions();
    if (!tlsOptions) {
      return null;
    }

    return {
      ...tlsOptions,
      minVersion: this.tlsConfig.minVersion,
      ciphers: this.tlsConfig.ciphers,
      requestCert: this.tlsConfig.requestCert,
      rejectUnauthorized: this.tlsConfig.rejectUnauthorized,
      passphrase: this.tlsConfig.passphrase,
    };
  }

  /**
   * Check if TLS is enabled
   */
  isTLSEnabled(): boolean {
    return this.tlsConfig.enabled;
  }

  // ==================== JWT Methods ====================

  /**
   * Generate a JWT token for an agent
   */
  generateToken(agentId: string, name: string, role: 'player' | 'spectator' | 'admin', customClaims?: Record<string, unknown>): string {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.jwtConfig.expiresIn || 3600;

    const payload: JWTPayload = {
      sub: agentId,
      name,
      role,
      iat: now,
      exp: now + expiresIn,
      iss: this.jwtConfig.issuer || 'liku-ai',
      jti: randomBytes(16).toString('hex'),
      ...customClaims,
    };

    if (this.jwtConfig.audience) {
      payload.aud = this.jwtConfig.audience;
    }

    return this.signJWT(payload);
  }

  /**
   * Generate a refresh token
   */
  generateRefreshToken(agentId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.jwtConfig.refreshExpiresIn || 604800;

    const payload: Partial<JWTPayload> = {
      sub: agentId,
      iat: now,
      exp: now + expiresIn,
      iss: this.jwtConfig.issuer || 'liku-ai',
      jti: randomBytes(16).toString('hex'),
    };

    return this.signJWT(payload as JWTPayload);
  }

  /**
   * Validate a JWT token
   */
  validateToken(token: string): TokenValidationResult {
    try {
      // Split token parts
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      const [headerB64, payloadB64, signatureB64] = parts;

      // Verify signature
      const data = `${headerB64}.${payloadB64}`;
      const expectedSignature = this.sign(data);
      
      if (signatureB64 !== expectedSignature) {
        return { valid: false, error: 'Invalid signature' };
      }

      // Decode payload
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as JWTPayload;

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return { valid: false, error: 'Token expired', expired: true };
      }

      // Check issuer
      if (this.jwtConfig.issuer && payload.iss !== this.jwtConfig.issuer) {
        return { valid: false, error: 'Invalid issuer' };
      }

      // Check audience
      if (this.jwtConfig.audience && payload.aud !== this.jwtConfig.audience) {
        return { valid: false, error: 'Invalid audience' };
      }

      // Check if token is revoked
      if (payload.jti && this.revokedTokens.has(payload.jti)) {
        return { valid: false, error: 'Token has been revoked' };
      }

      return { valid: true, payload };
    } catch (err) {
      return { valid: false, error: `Token validation failed: ${(err as Error).message}` };
    }
  }

  /**
   * Refresh an access token using a refresh token
   */
  refreshToken(refreshToken: string): { accessToken: string; refreshToken: string } | null {
    if (!this.jwtConfig.allowRefresh) {
      return null;
    }

    const validation = this.validateToken(refreshToken);
    if (!validation.valid || !validation.payload) {
      return null;
    }

    // Revoke old refresh token
    if (validation.payload.jti) {
      this.revokedTokens.add(validation.payload.jti);
    }

    // Generate new tokens (need to look up agent details or accept minimal info)
    const agentId = validation.payload.sub;
    const name = validation.payload.name || 'agent';
    const role = validation.payload.role || 'player';

    return {
      accessToken: this.generateToken(agentId, name, role),
      refreshToken: this.generateRefreshToken(agentId),
    };
  }

  /**
   * Revoke a token by its JTI
   */
  revokeToken(jti: string): void {
    this.revokedTokens.add(jti);
  }

  /**
   * Check if JWT authentication is enabled
   */
  isJWTEnabled(): boolean {
    return this.jwtConfig.enabled;
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(header: string | undefined): string | null {
    if (!header) {
      return null;
    }

    // Support "Bearer <token>" format
    if (header.startsWith('Bearer ')) {
      return header.slice(7);
    }

    // Support direct token
    return header;
  }

  // ==================== Private Methods ====================

  /**
   * Sign a JWT payload
   */
  private signJWT(payload: JWTPayload): string {
    const header = {
      alg: this.jwtConfig.algorithm || 'HS256',
      typ: 'JWT',
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const data = `${headerB64}.${payloadB64}`;
    const signature = this.sign(data);

    return `${data}.${signature}`;
  }

  /**
   * Create HMAC signature
   */
  private sign(data: string): string {
    const algorithm = this.getHmacAlgorithm();
    const hmac = createHmac(algorithm, this.secretKey);
    hmac.update(data);
    return hmac.digest('base64url');
  }

  /**
   * Get HMAC algorithm from JWT algorithm
   */
  private getHmacAlgorithm(): string {
    switch (this.jwtConfig.algorithm) {
      case 'HS384':
        return 'sha384';
      case 'HS512':
        return 'sha512';
      case 'HS256':
      default:
        return 'sha256';
    }
  }

  // ==================== Utility Methods ====================

  /**
   * Generate a secure random connection ID
   */
  static generateConnectionId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Hash a value (e.g., for logging without exposing secrets)
   */
  static hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  /**
   * Validate a WebSocket upgrade request
   */
  validateUpgradeRequest(headers: Record<string, string | undefined>): TokenValidationResult {
    if (!this.jwtConfig.enabled) {
      return { valid: true };
    }

    // Check for token in various locations
    const token = 
      this.extractTokenFromHeader(headers['authorization']) ||
      this.extractTokenFromHeader(headers['sec-websocket-protocol']);

    if (!token) {
      return { valid: false, error: 'No authentication token provided' };
    }

    return this.validateToken(token);
  }

  /**
   * Get security configuration summary (safe for logging)
   */
  getConfigSummary(): Record<string, unknown> {
    return {
      tls: {
        enabled: this.tlsConfig.enabled,
        minVersion: this.tlsConfig.minVersion,
        requestCert: this.tlsConfig.requestCert,
      },
      jwt: {
        enabled: this.jwtConfig.enabled,
        algorithm: this.jwtConfig.algorithm,
        issuer: this.jwtConfig.issuer,
        expiresIn: this.jwtConfig.expiresIn,
        allowRefresh: this.jwtConfig.allowRefresh,
      },
    };
  }
}

/**
 * Singleton security manager instance
 */
let securityManagerInstance: SecurityManager | null = null;

/**
 * Get or create the security manager singleton
 */
export function getSecurityManager(
  tlsConfig?: Partial<TLSConfig>,
  jwtConfig?: Partial<JWTConfig>
): SecurityManager {
  if (!securityManagerInstance) {
    securityManagerInstance = new SecurityManager(tlsConfig, jwtConfig);
  }
  return securityManagerInstance;
}

/**
 * Reset the security manager (for testing)
 */
export function resetSecurityManager(): void {
  securityManagerInstance = null;
}
