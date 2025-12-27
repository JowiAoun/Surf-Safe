import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Phase 9 Unit Tests: Security Hardening
 *
 * Tests for input sanitization, XSS prevention, rate limiting, and API key security.
 */

import {
  stripHtmlTags,
  escapeHtml,
  sanitizeHtml,
  sanitizeDomain,
  sanitizeUrl,
  isValidUrl,
  sanitizeUserInput,
  maskApiKey,
  looksLikeApiKey,
  redactApiKeys,
  RateLimiter,
} from '@/utils/sanitize';

// ============================================================================
// HTML Sanitization Tests
// ============================================================================

describe('HTML Sanitization', () => {
  describe('stripHtmlTags', () => {
    it('should remove all HTML tags', () => {
      expect(stripHtmlTags('<script>alert("xss")</script>')).toBe('alert("xss")');
      expect(stripHtmlTags('<p>Hello</p>')).toBe('Hello');
      expect(stripHtmlTags('<a href="evil.com">Click</a>')).toBe('Click');
    });

    it('should handle empty input', () => {
      expect(stripHtmlTags('')).toBe('');
      expect(stripHtmlTags(null as unknown as string)).toBe('');
    });

    it('should handle nested tags', () => {
      expect(stripHtmlTags('<div><span>Text</span></div>')).toBe('Text');
    });
  });

  describe('escapeHtml', () => {
    it('should escape special characters', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('"quotes"')).toBe('&quot;quotes&quot;');
      expect(escapeHtml("'apostrophe'")).toBe('&#x27;apostrophe&#x27;');
    });

    it('should escape ampersand', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('should handle normal text', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('sanitizeHtml', () => {
    it('should strip tags and escape', () => {
      const input = '<script>alert("xss")</script>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });
  });
});

// ============================================================================
// Domain Validation Tests
// ============================================================================

describe('Domain Validation', () => {
  describe('sanitizeDomain', () => {
    it('should normalize valid domains', () => {
      expect(sanitizeDomain('Example.Com')).toBe('example.com');
      expect(sanitizeDomain('https://example.com')).toBe('example.com');
      expect(sanitizeDomain('HTTP://EXAMPLE.COM')).toBe('example.com');
    });

    it('should remove paths and queries', () => {
      expect(sanitizeDomain('example.com/path')).toBe('example.com');
      expect(sanitizeDomain('example.com?query=1')).toBe('example.com');
    });

    it('should strip invalid characters', () => {
      // XSS characters are stripped, leaving the valid domain parts
      expect(sanitizeDomain('example<script>.com')).toBe('examplescript.com');
      expect(sanitizeDomain('evil"domain.com')).toBe('evildomain.com');
    });

    it('should allow localhost and IPs', () => {
      expect(sanitizeDomain('localhost')).toBe('localhost');
      expect(sanitizeDomain('192.168.1.1')).toBe('192.168.1.1');
    });

    it('should handle empty input', () => {
      expect(sanitizeDomain('')).toBe('');
      expect(sanitizeDomain(null as unknown as string)).toBe('');
    });
  });
});

// ============================================================================
// URL Validation Tests
// ============================================================================

describe('URL Validation', () => {
  describe('sanitizeUrl', () => {
    it('should accept valid http/https URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
      expect(sanitizeUrl('http://example.com/path')).toBe('http://example.com/path');
    });

    it('should reject non-http protocols', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
      expect(sanitizeUrl('file:///etc/passwd')).toBe('');
    });

    it('should handle invalid URLs', () => {
      expect(sanitizeUrl('not a url')).toBe('');
      expect(sanitizeUrl('')).toBe('');
    });
  });

  describe('isValidUrl', () => {
    it('should return true for valid URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
    });
  });
});

// ============================================================================
// User Input Sanitization Tests
// ============================================================================

describe('User Input Sanitization', () => {
  describe('sanitizeUserInput', () => {
    it('should remove control characters', () => {
      expect(sanitizeUserInput('Hello\x00World')).toBe('HelloWorld');
    });

    it('should respect max length', () => {
      const longInput = 'a'.repeat(2000);
      expect(sanitizeUserInput(longInput, 100).length).toBe(100);
    });

    it('should escape HTML', () => {
      expect(sanitizeUserInput('<script>alert(1)</script>'))
        .not.toContain('<script>');
    });

    it('should trim whitespace', () => {
      expect(sanitizeUserInput('  text  ')).toBe('text');
    });
  });
});

// ============================================================================
// API Key Security Tests
// ============================================================================

describe('API Key Security', () => {
  describe('maskApiKey', () => {
    it('should mask middle of key', () => {
      const key = 'sk-abcdefghijklmnopqrstuvwxyz123456';
      const masked = maskApiKey(key);
      expect(masked.startsWith('sk-a')).toBe(true);
      expect(masked.endsWith('3456')).toBe(true);
      expect(masked).toContain('*');
    });

    it('should fully mask short keys', () => {
      expect(maskApiKey('short')).toBe('*****');
    });

    it('should handle empty input', () => {
      expect(maskApiKey('')).toBe('');
    });
  });

  describe('looksLikeApiKey', () => {
    it('should detect OpenAI-style keys', () => {
      expect(looksLikeApiKey('sk-abcdefghijklmnopqrstuvwxyz')).toBe(true);
    });

    it('should not flag normal text', () => {
      expect(looksLikeApiKey('hello world')).toBe(false);
    });
  });

  describe('redactApiKeys', () => {
    it('should redact OpenAI keys in messages', () => {
      const message = 'Error with key sk-abcdefghijklmnopqrstuvwxyz123456789';
      const redacted = redactApiKeys(message);
      expect(redacted).not.toContain('abcdef');
      expect(redacted).toContain('REDACTED');
    });

    it('should redact Google-style keys', () => {
      const message = 'API key: AIzaSyB0XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const redacted = redactApiKeys(message);
      expect(redacted).toContain('REDACTED');
    });

    it('should preserve non-key text', () => {
      const message = 'Hello world';
      expect(redactApiKeys(message)).toBe('Hello world');
    });
  });
});

// ============================================================================
// Rate Limiter Tests
// ============================================================================

describe('Rate Limiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });
  });

  it('should allow requests under limit', () => {
    expect(limiter.tryRequest()).toBe(true);
    expect(limiter.tryRequest()).toBe(true);
    expect(limiter.tryRequest()).toBe(true);
  });

  it('should block requests over limit', () => {
    limiter.tryRequest();
    limiter.tryRequest();
    limiter.tryRequest();
    expect(limiter.tryRequest()).toBe(false);
  });

  it('should track remaining requests', () => {
    expect(limiter.getRemainingRequests()).toBe(3);
    limiter.tryRequest();
    expect(limiter.getRemainingRequests()).toBe(2);
  });

  it('should reset properly', () => {
    limiter.tryRequest();
    limiter.tryRequest();
    limiter.reset();
    expect(limiter.getRemainingRequests()).toBe(3);
  });

  it('should calculate time until allowed', () => {
    limiter.tryRequest();
    limiter.tryRequest();
    limiter.tryRequest();
    expect(limiter.getTimeUntilAllowed()).toBeGreaterThan(0);
  });
});

// ============================================================================
// XSS Prevention Integration Tests
// ============================================================================

describe('XSS Prevention', () => {
  it('should prevent script injection in text', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const safe = sanitizeHtml(malicious);
    expect(safe).not.toContain('<img');
    expect(safe).not.toContain('onerror');
  });

  it('should prevent event handler injection', () => {
    const malicious = '<div onclick="evil()">Click</div>';
    const safe = sanitizeHtml(malicious);
    expect(safe).not.toContain('onclick');
  });

  it('should prevent SVG-based XSS', () => {
    const malicious = '<svg onload=alert(1)>';
    const safe = sanitizeHtml(malicious);
    expect(safe).not.toContain('<svg');
  });

  it('should handle encoded attacks', () => {
    const malicious = '&lt;script&gt;alert(1)&lt;/script&gt;';
    const safe = escapeHtml(malicious);
    expect(safe).not.toContain('<script>');
  });
});
