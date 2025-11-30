/**
 * Liku Learn - Safety Layer
 * 
 * Provides URL validation, content sanitization, and rate limiting
 * to protect both the AI and user during research operations.
 */

import {
  SafetyCheck,
  URLValidation,
  BLOCKED_DOMAINS,
  BLOCKED_DORK_OPERATORS,
  ALLOWED_DORK_OPERATORS,
  DorkQuery,
} from './types.js';

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validate a URL before fetching
 */
export function validateURL(url: string): URLValidation {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.toLowerCase();

    // Check protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        isAllowed: false,
        domain,
        reason: `Invalid protocol: ${parsed.protocol}. Only HTTP/HTTPS allowed.`,
      };
    }

    // Check against blocked domains
    for (const blocked of BLOCKED_DOMAINS) {
      if (domain.includes(blocked) || domain.startsWith(blocked)) {
        return {
          isAllowed: false,
          domain,
          reason: `Blocked domain: ${domain} (internal/private network)`,
        };
      }
    }

    // Check for IP addresses (block direct IP access)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipRegex.test(domain)) {
      return {
        isAllowed: false,
        domain,
        reason: `Direct IP access not allowed: ${domain}`,
      };
    }

    return { isAllowed: true, domain };
  } catch (error) {
    return {
      isAllowed: false,
      domain: 'unknown',
      reason: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================================================
// Content Sanitization
// ============================================================================

/**
 * Sanitize fetched web content to prevent prompt injection
 */
export function sanitizeContent(content: string, maxLength: number = 10000): string {
  let sanitized = content;

  // Remove potential prompt injection patterns
  const dangerousPatterns = [
    /ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
    /disregard\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
    /forget\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
    /you\s+are\s+now\s+/gi,
    /new\s+instructions?:/gi,
    /system\s*prompt:/gi,
    /\[SYSTEM\]/gi,
    /\[INST\]/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
  ];

  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // Remove excessive whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '\n\n[Content truncated for safety]';
  }

  return sanitized;
}

/**
 * Sanitize user input query
 */
export function sanitizeQuery(query: string): SafetyCheck {
  const trimmed = query.trim();

  // Check for empty query
  if (!trimmed) {
    return { isValid: false, reason: 'Query cannot be empty' };
  }

  // Check for excessive length
  if (trimmed.length > 500) {
    return {
      isValid: false,
      reason: 'Query too long (max 500 characters)',
    };
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /(?:rm|del|delete|drop|truncate)\s+(?:-rf?|\/|\*|table|database)/i,
    /<script[\s>]/i,
    /javascript:/i,
    /data:text\/html/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(trimmed)) {
      return {
        isValid: false,
        reason: 'Query contains potentially dangerous content',
      };
    }
  }

  // Sanitize special characters
  const sanitized = trimmed
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/\\/g, '');  // Remove backslashes

  return { isValid: true, sanitizedInput: sanitized };
}

// ============================================================================
// Google Dorking Safety
// ============================================================================

/**
 * Build a safe Google dork query
 */
export function buildSafeDorkQuery(dork: DorkQuery): SafetyCheck {
  let query = dork.baseQuery;

  // Check for blocked operators in base query
  for (const blocked of BLOCKED_DORK_OPERATORS) {
    if (query.toLowerCase().includes(blocked)) {
      return {
        isValid: false,
        reason: `Blocked operator: ${blocked} (can reveal sensitive information)`,
      };
    }
  }

  // Build the query with allowed operators
  const parts: string[] = [query];

  if (dork.site) {
    parts.push(`site:${sanitizeDorkValue(dork.site)}`);
  }

  if (dork.filetype) {
    const allowedTypes = ['pdf', 'doc', 'docx', 'txt', 'md', 'html', 'json', 'xml', 'csv'];
    if (allowedTypes.includes(dork.filetype.toLowerCase())) {
      parts.push(`filetype:${dork.filetype}`);
    }
  }

  if (dork.intitle) {
    parts.push(`intitle:"${sanitizeDorkValue(dork.intitle)}"`);
  }

  if (dork.inurl) {
    parts.push(`inurl:${sanitizeDorkValue(dork.inurl)}`);
  }

  if (dork.exclude) {
    for (const site of dork.exclude.slice(0, 5)) { // Max 5 exclusions
      parts.push(`-site:${sanitizeDorkValue(site)}`);
    }
  }

  if (dork.dateRange?.after) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dork.dateRange.after)) {
      parts.push(`after:${dork.dateRange.after}`);
    }
  }

  if (dork.dateRange?.before) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dork.dateRange.before)) {
      parts.push(`before:${dork.dateRange.before}`);
    }
  }

  const finalQuery = parts.join(' ');

  // Final length check
  if (finalQuery.length > 256) {
    return {
      isValid: false,
      reason: 'Dork query too long (max 256 characters)',
    };
  }

  return { isValid: true, sanitizedInput: finalQuery };
}

/**
 * Sanitize a value used in dork operators
 */
function sanitizeDorkValue(value: string): string {
  return value
    .replace(/['"<>]/g, '')   // Remove quotes and brackets
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim()
    .substring(0, 50);        // Limit length
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimits: Map<string, RateLimitEntry> = new Map();

/**
 * Check if an operation should be rate limited
 */
export function checkRateLimit(
  operation: string,
  maxRequests: number = 10,
  windowMs: number = 60000
): SafetyCheck {
  const now = Date.now();
  const entry = rateLimits.get(operation);

  if (!entry || now > entry.resetTime) {
    // Reset or initialize
    rateLimits.set(operation, { count: 1, resetTime: now + windowMs });
    return { isValid: true };
  }

  if (entry.count >= maxRequests) {
    const waitTime = Math.ceil((entry.resetTime - now) / 1000);
    return {
      isValid: false,
      reason: `Rate limited. Try again in ${waitTime} seconds.`,
    };
  }

  entry.count++;
  return { isValid: true };
}

/**
 * Reset rate limit for an operation (for testing)
 */
export function resetRateLimit(operation: string): void {
  rateLimits.delete(operation);
}

// ============================================================================
// PII Detection
// ============================================================================

/**
 * Check if content contains potential PII
 */
export function detectPII(content: string): { hasPII: boolean; types: string[] } {
  const detectedTypes: string[] = [];

  // Email pattern
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(content)) {
    detectedTypes.push('email');
  }

  // Phone number patterns (various formats)
  if (/(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(content)) {
    detectedTypes.push('phone');
  }

  // SSN pattern
  if (/\d{3}-\d{2}-\d{4}/.test(content)) {
    detectedTypes.push('ssn');
  }

  // Credit card pattern (basic)
  if (/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/.test(content)) {
    detectedTypes.push('credit_card');
  }

  return {
    hasPII: detectedTypes.length > 0,
    types: detectedTypes,
  };
}

/**
 * Redact PII from content
 */
export function redactPII(content: string): string {
  let redacted = content;

  // Redact emails
  redacted = redacted.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[EMAIL REDACTED]'
  );

  // Redact phone numbers
  redacted = redacted.replace(
    /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    '[PHONE REDACTED]'
  );

  // Redact SSN
  redacted = redacted.replace(/\d{3}-\d{2}-\d{4}/g, '[SSN REDACTED]');

  // Redact credit cards
  redacted = redacted.replace(
    /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
    '[CARD REDACTED]'
  );

  return redacted;
}

// ============================================================================
// Depth Limiting (for deep dive research)
// ============================================================================

let currentDepth = 0;
const MAX_DEPTH = 3;

/**
 * Check if we can go deeper in research
 */
export function canGoDeeper(): boolean {
  return currentDepth < MAX_DEPTH;
}

/**
 * Increment depth counter
 */
export function incrementDepth(): void {
  currentDepth++;
}

/**
 * Reset depth counter
 */
export function resetDepth(): void {
  currentDepth = 0;
}

/**
 * Get current depth
 */
export function getCurrentDepth(): number {
  return currentDepth;
}
