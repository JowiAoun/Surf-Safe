/**
 * Security: Input Sanitization Utilities
 *
 * Provides functions to sanitize user input and prevent XSS attacks.
 */

// ============================================================================
// HTML Sanitization
// ============================================================================

/**
 * Remove all HTML tags from input
 */
export function stripHtmlTags(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';

  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };

  return input.replace(/[&<>"'`=/]/g, (char) => htmlEscapes[char] || char);
}

/**
 * Full HTML sanitization - strips tags and escapes
 */
export function sanitizeHtml(input: string): string {
  return escapeHtml(stripHtmlTags(input));
}

// ============================================================================
// Domain Validation
// ============================================================================

/**
 * Validate and sanitize domain name
 */
export function sanitizeDomain(input: string): string {
  if (!input || typeof input !== 'string') return '';

  // Remove protocol, path, and whitespace
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//i, '');
  domain = domain.replace(/\/.*$/, '');
  domain = domain.replace(/[?#].*$/, '');

  // Remove any remaining non-domain characters
  // Allow: a-z, 0-9, dots, hyphens
  domain = domain.replace(/[^a-z0-9.-]/g, '');

  // Validate domain format
  const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
  if (!domainRegex.test(domain)) {
    // Check if it's localhost or IP
    if (domain === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) {
      return domain;
    }
    return '';
  }

  return domain;
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(input: string): string {
  if (!input || typeof input !== 'string') return '';

  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return '';
    }

    // Return sanitized URL
    return url.href;
  } catch {
    return '';
  }
}

export function isValidUrl(input: string): boolean {
  return sanitizeUrl(input) !== '';
}

/**
 * Check if the URL is a protected browser page where extensions cannot run
 */
export function isProtectedUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const protocol = new URL(url).protocol;
    return [
      'chrome:', 
      'edge:', 
      'about:', 
      'moz-extension:', 
      'chrome-extension:',
      'view-source:'
    ].includes(protocol);
  } catch {
    // If invalid URL, treat as not protected (other validation will fail)
    return false;
  }
}

// ============================================================================
// General Input Sanitization
// ============================================================================

/**
 * Sanitize general user text input
 */
export function sanitizeUserInput(input: string, maxLength = 1000): string {
  if (!input || typeof input !== 'string') return '';

  let sanitized = input.trim();

  // Remove null bytes and control characters (except newlines/tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Limit length
  sanitized = sanitized.slice(0, maxLength);

  // Escape HTML
  sanitized = escapeHtml(sanitized);

  return sanitized;
}

/**
 * Sanitize for use in innerHTML (strict - removes all HTML)
 */
export function sanitizeForInnerHtml(input: string): string {
  return sanitizeHtml(input);
}

// ============================================================================
// API Key Masking
// ============================================================================

/**
 * Mask API key for display (show only first/last 4 chars)
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || typeof apiKey !== 'string') return '';

  if (apiKey.length <= 8) {
    return '*'.repeat(apiKey.length);
  }

  const first4 = apiKey.slice(0, 4);
  const last4 = apiKey.slice(-4);
  const middle = '*'.repeat(Math.min(apiKey.length - 8, 16));

  return `${first4}${middle}${last4}`;
}

/**
 * Check if value looks like an API key (for logging prevention)
 */
export function looksLikeApiKey(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  // Check for common API key patterns
  const patterns = [
    /^sk-[a-zA-Z0-9]{20,}$/,        // OpenAI style
    /^[A-Za-z0-9]{32,}$/,           // Generic long alphanumeric
    /AIza[A-Za-z0-9_-]{35}$/,       // Google style
  ];

  return patterns.some((p) => p.test(value));
}

/**
 * Redact potential API keys from error messages
 */
export function redactApiKeys(message: string): string {
  if (!message || typeof message !== 'string') return '';

  // Common API key patterns to redact
  let redacted = message;

  // OpenAI style keys
  redacted = redacted.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-****REDACTED****');

  // Google style keys
  redacted = redacted.replace(/AIza[A-Za-z0-9_-]{35}/g, 'AIza****REDACTED****');

  // Generic long alphanumeric strings (potential keys)
  redacted = redacted.replace(/[A-Za-z0-9]{40,}/g, '****REDACTED****');

  return redacted;
}

// ============================================================================
// Rate Limiting Helpers
// ============================================================================

/**
 * Rate limiter configuration
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Simple in-memory rate limiter
 */
export class RateLimiter {
  private requests: number[] = [];
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig = { maxRequests: 10, windowMs: 60000 }) {
    this.config = config;
  }

  /**
   * Check if request is allowed
   */
  isAllowed(): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Remove old requests
    this.requests = this.requests.filter((t) => t > windowStart);

    // Check if under limit
    return this.requests.length < this.config.maxRequests;
  }

  /**
   * Record a request
   */
  recordRequest(): void {
    this.requests.push(Date.now());
  }

  /**
   * Try to make a request (check + record)
   */
  tryRequest(): boolean {
    if (this.isAllowed()) {
      this.recordRequest();
      return true;
    }
    return false;
  }

  /**
   * Get remaining requests in current window
   */
  getRemainingRequests(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    this.requests = this.requests.filter((t) => t > windowStart);
    return Math.max(0, this.config.maxRequests - this.requests.length);
  }

  /**
   * Get time until next request is allowed (ms)
   */
  getTimeUntilAllowed(): number {
    if (this.isAllowed()) return 0;

    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const oldestInWindow = this.requests.find((t) => t > windowStart);

    if (!oldestInWindow) return 0;

    return oldestInWindow + this.config.windowMs - now;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requests = [];
  }
}

// Default rate limiter instance (10 requests per minute)
export const apiRateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60000 });
