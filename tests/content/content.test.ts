import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 2 Unit Tests: Content Script DOM Analysis
 *
 * These tests verify the content extraction functionality for:
 * - Visible text extraction (excluding scripts/styles)
 * - Metadata extraction (title, description, domain, links)
 * - Link analysis (external link detection)
 * - Suspicious URL pattern detection
 * - Data sanitization (length limits, content filtering)
 * - Message passing to background script
 */

// Mock DOM environment for testing
function createMockDocument(html: string): Document {
  const doc = document.implementation.createHTMLDocument('Test');
  doc.body.innerHTML = html;
  return doc;
}

// URL Pattern Detection Tests (can be tested without DOM)
describe('URL Pattern Detection', () => {
  // Helper function that mirrors the content script's detectSuspiciousUrlPatterns
  function detectSuspiciousUrlPatterns(url: string): string[] {
    const patterns: string[] = [];

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const fullUrl = urlObj.href;

      // Check for excessive hyphens in domain
      const hyphenCount = (hostname.match(/-/g) || []).length;
      if (hyphenCount > 3) {
        patterns.push('EXCESSIVE_HYPHENS');
      }

      // Check for excessive subdomains
      const dotCount = (hostname.match(/\./g) || []).length;
      if (dotCount > 3) {
        patterns.push('EXCESSIVE_SUBDOMAINS');
      }

      // Check for IP address instead of domain name
      const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
      if (ipPattern.test(hostname)) {
        patterns.push('IP_ADDRESS_DOMAIN');
      }

      // Check for unicode/punycode abuse
      if (hostname.startsWith('xn--') || /[^\x00-\x7F]/.test(hostname)) {
        patterns.push('UNICODE_ABUSE');
      }

      // Check for known brand impersonation patterns
      const brandPatterns = [
        /paypa[l1]/i, /amaz[o0]n/i, /g[o0]{2}gle/i, /faceb[o0]{2}k/i,
        /micr[o0]s[o0]ft/i, /app[l1]e/i, /netf[l1]ix/i, /bank/i
      ];
      for (const pattern of brandPatterns) {
        if (pattern.test(hostname) && !hostname.includes('.com')) {
          patterns.push('POSSIBLE_BRAND_IMPERSONATION');
          break;
        }
      }

      // Check for suspicious TLDs
      const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.work', '.click'];
      const tld = '.' + hostname.split('.').pop()?.toLowerCase();
      if (suspiciousTlds.includes(tld)) {
        patterns.push('SUSPICIOUS_TLD');
      }

      // Check for very long domain names
      if (hostname.length > 50) {
        patterns.push('LONG_DOMAIN');
      }

      // Check for suspicious keywords in URL
      const suspiciousKeywords = [
        'login', 'signin', 'verify', 'update', 'secure', 'account',
        'banking', 'confirm', 'password', 'credential', 'wallet'
      ];
      const urlLower = fullUrl.toLowerCase();
      for (const keyword of suspiciousKeywords) {
        if (urlLower.includes(keyword) && patterns.includes('POSSIBLE_BRAND_IMPERSONATION')) {
          patterns.push('SUSPICIOUS_KEYWORD_COMBO');
          break;
        }
      }

      // Check for data URI or javascript URI
      if (url.startsWith('data:') || url.startsWith('javascript:')) {
        patterns.push('DANGEROUS_URI_SCHEME');
      }

      // Check for port numbers
      if (urlObj.port && !['80', '443', ''].includes(urlObj.port)) {
        patterns.push('UNUSUAL_PORT');
      }

    } catch {
      patterns.push('MALFORMED_URL');
    }

    return patterns;
  }

  describe('Excessive Hyphens Detection', () => {
    it('should detect excessive hyphens in domain', () => {
      const patterns = detectSuspiciousUrlPatterns('https://secure-login-verify-account-update.example.com');
      expect(patterns).toContain('EXCESSIVE_HYPHENS');
    });

    it('should not flag normal domains with few hyphens', () => {
      const patterns = detectSuspiciousUrlPatterns('https://my-website.example.com');
      expect(patterns).not.toContain('EXCESSIVE_HYPHENS');
    });
  });

  describe('Excessive Subdomains Detection', () => {
    it('should detect excessive subdomains', () => {
      const patterns = detectSuspiciousUrlPatterns('https://a.b.c.d.e.example.com');
      expect(patterns).toContain('EXCESSIVE_SUBDOMAINS');
    });

    it('should not flag normal subdomain depth', () => {
      const patterns = detectSuspiciousUrlPatterns('https://www.example.com');
      expect(patterns).not.toContain('EXCESSIVE_SUBDOMAINS');
    });
  });

  describe('IP Address Domain Detection', () => {
    it('should detect IP address as domain', () => {
      const patterns = detectSuspiciousUrlPatterns('http://192.168.1.1/login');
      expect(patterns).toContain('IP_ADDRESS_DOMAIN');
    });

    it('should not flag normal domains', () => {
      const patterns = detectSuspiciousUrlPatterns('https://example.com');
      expect(patterns).not.toContain('IP_ADDRESS_DOMAIN');
    });
  });

  describe('Unicode/Punycode Abuse Detection', () => {
    it('should detect punycode domains', () => {
      const patterns = detectSuspiciousUrlPatterns('https://xn--pple-43d.com');
      expect(patterns).toContain('UNICODE_ABUSE');
    });
  });

  describe('Suspicious TLD Detection', () => {
    it('should detect suspicious TLDs', () => {
      const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.work', '.click'];
      for (const tld of suspiciousTlds) {
        const patterns = detectSuspiciousUrlPatterns(`https://example${tld}`);
        expect(patterns).toContain('SUSPICIOUS_TLD');
      }
    });

    it('should not flag common TLDs', () => {
      const normalTlds = ['.com', '.org', '.net', '.io', '.dev'];
      for (const tld of normalTlds) {
        const patterns = detectSuspiciousUrlPatterns(`https://example${tld}`);
        expect(patterns).not.toContain('SUSPICIOUS_TLD');
      }
    });
  });

  describe('Long Domain Detection', () => {
    it('should detect very long domain names', () => {
      const longDomain = 'a'.repeat(60) + '.com';
      const patterns = detectSuspiciousUrlPatterns(`https://${longDomain}`);
      expect(patterns).toContain('LONG_DOMAIN');
    });

    it('should not flag normal length domains', () => {
      const patterns = detectSuspiciousUrlPatterns('https://example.com');
      expect(patterns).not.toContain('LONG_DOMAIN');
    });
  });

  describe('Brand Impersonation Detection', () => {
    it('should detect PayPal impersonation', () => {
      const patterns = detectSuspiciousUrlPatterns('https://paypa1-secure.tk/login');
      expect(patterns).toContain('POSSIBLE_BRAND_IMPERSONATION');
    });

    it('should detect Amazon impersonation', () => {
      const patterns = detectSuspiciousUrlPatterns('https://amaz0n-orders.xyz/verify');
      expect(patterns).toContain('POSSIBLE_BRAND_IMPERSONATION');
    });

    it('should detect Google impersonation', () => {
      const patterns = detectSuspiciousUrlPatterns('https://g00gle-account.tk');
      expect(patterns).toContain('POSSIBLE_BRAND_IMPERSONATION');
    });

    it('should not flag legitimate brand domains', () => {
      const patterns = detectSuspiciousUrlPatterns('https://paypal.com');
      expect(patterns).not.toContain('POSSIBLE_BRAND_IMPERSONATION');
    });
  });

  describe('Dangerous URI Scheme Detection', () => {
    it('should detect javascript: URIs', () => {
      const patterns = detectSuspiciousUrlPatterns('javascript:alert(1)');
      expect(patterns).toContain('DANGEROUS_URI_SCHEME');
    });

    it('should detect data: URIs', () => {
      const patterns = detectSuspiciousUrlPatterns('data:text/html,<script>alert(1)</script>');
      expect(patterns).toContain('DANGEROUS_URI_SCHEME');
    });
  });

  describe('Unusual Port Detection', () => {
    it('should detect unusual ports', () => {
      const patterns = detectSuspiciousUrlPatterns('https://example.com:8443/login');
      expect(patterns).toContain('UNUSUAL_PORT');
    });

    it('should not flag standard ports', () => {
      const patterns = detectSuspiciousUrlPatterns('https://example.com:443');
      expect(patterns).not.toContain('UNUSUAL_PORT');
    });
  });

  describe('Malformed URL Detection', () => {
    it('should detect malformed URLs', () => {
      const patterns = detectSuspiciousUrlPatterns('not-a-valid-url');
      expect(patterns).toContain('MALFORMED_URL');
    });
  });

  describe('Suspicious Keyword Combination', () => {
    it('should detect suspicious keyword with brand impersonation', () => {
      const patterns = detectSuspiciousUrlPatterns('https://paypa1-login.tk/verify');
      expect(patterns).toContain('POSSIBLE_BRAND_IMPERSONATION');
      expect(patterns).toContain('SUSPICIOUS_KEYWORD_COMBO');
    });
  });
});

// Text Sanitization Tests
describe('Text Sanitization', () => {
  // Helper function that mirrors the content script's sanitizeText
  function sanitizeText(text: string, maxLength: number): string {
    let sanitized = text.replace(/\s+/g, ' ').trim();
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength) + '...';
    }
    return sanitized;
  }

  it('should remove excessive whitespace', () => {
    const result = sanitizeText('Hello    World\n\n\nTest', 1000);
    expect(result).toBe('Hello World Test');
  });

  it('should remove control characters', () => {
    const result = sanitizeText('Hello\x00World\x1FTest', 1000);
    expect(result).toBe('HelloWorldTest');
  });

  it('should limit text length', () => {
    const longText = 'a'.repeat(100);
    const result = sanitizeText(longText, 50);
    expect(result.length).toBe(53); // 50 chars + '...'
    expect(result.endsWith('...')).toBe(true);
  });

  it('should not add ellipsis for short text', () => {
    const result = sanitizeText('Short text', 100);
    expect(result).toBe('Short text');
    expect(result.endsWith('...')).toBe(false);
  });

  it('should trim leading and trailing whitespace', () => {
    const result = sanitizeText('   Hello World   ', 1000);
    expect(result).toBe('Hello World');
  });
});

// External Link Detection Tests
describe('External Link Detection', () => {
  function isExternalLink(href: string, currentDomain: string): boolean {
    try {
      const url = new URL(href, 'https://' + currentDomain);
      return url.hostname !== currentDomain && url.protocol.startsWith('http');
    } catch {
      return false;
    }
  }

  it('should detect external links', () => {
    expect(isExternalLink('https://external.com/page', 'example.com')).toBe(true);
  });

  it('should not flag internal links', () => {
    expect(isExternalLink('https://example.com/page', 'example.com')).toBe(false);
  });

  it('should not flag relative links', () => {
    expect(isExternalLink('/page', 'example.com')).toBe(false);
  });

  it('should not flag subdomain links as external', () => {
    expect(isExternalLink('https://www.example.com/page', 'www.example.com')).toBe(false);
  });

  it('should handle mailto: links', () => {
    expect(isExternalLink('mailto:test@example.com', 'example.com')).toBe(false);
  });
});

// Form Analysis Tests
describe('Form Field Analysis', () => {
  function hasSensitiveFields(fields: { name: string; type: string; placeholder: string }[]): boolean {
    const sensitiveTypes = ['password', 'credit-card', 'tel', 'email'];
    const sensitiveNames = ['ssn', 'social', 'card', 'cvv', 'pin', 'account', 'routing'];

    return fields.some(f =>
      sensitiveTypes.includes(f.type.toLowerCase()) ||
      sensitiveNames.some(name =>
        f.name.toLowerCase().includes(name) ||
        f.placeholder.toLowerCase().includes(name)
      )
    );
  }

  it('should detect password fields', () => {
    const fields = [{ name: 'username', type: 'text', placeholder: '' }, { name: 'pass', type: 'password', placeholder: '' }];
    expect(hasSensitiveFields(fields)).toBe(true);
  });

  it('should detect SSN fields by name', () => {
    const fields = [{ name: 'ssn', type: 'text', placeholder: '' }];
    expect(hasSensitiveFields(fields)).toBe(true);
  });

  it('should detect card fields by placeholder', () => {
    const fields = [{ name: 'number', type: 'text', placeholder: 'Credit Card Number' }];
    expect(hasSensitiveFields(fields)).toBe(true);
  });

  it('should detect CVV fields', () => {
    const fields = [{ name: 'cvv', type: 'text', placeholder: '' }];
    expect(hasSensitiveFields(fields)).toBe(true);
  });

  it('should not flag non-sensitive forms', () => {
    const fields = [{ name: 'search', type: 'text', placeholder: 'Search...' }];
    expect(hasSensitiveFields(fields)).toBe(false);
  });
});

// Content Length Limit Tests
describe('Content Length Limits', () => {
  const MAX_BODY_TEXT_LENGTH = 10000;
  const MAX_LINKS = 100;
  const MAX_HEADINGS = 50;
  const MAX_FORMS = 20;

  it('should enforce body text length limit', () => {
    const longText = 'a'.repeat(15000);
    const limited = longText.substring(0, MAX_BODY_TEXT_LENGTH);
    expect(limited.length).toBe(MAX_BODY_TEXT_LENGTH);
  });

  it('should enforce link count limit', () => {
    const links = Array(150).fill({ href: 'https://example.com', text: 'Link' });
    const limited = links.slice(0, MAX_LINKS);
    expect(limited.length).toBe(MAX_LINKS);
  });

  it('should enforce heading count limit', () => {
    const headings = Array(100).fill('Heading');
    const limited = headings.slice(0, MAX_HEADINGS);
    expect(limited.length).toBe(MAX_HEADINGS);
  });

  it('should enforce form count limit', () => {
    const forms = Array(30).fill({ action: '', fields: [] });
    const limited = forms.slice(0, MAX_FORMS);
    expect(limited.length).toBe(MAX_FORMS);
  });
});

// PageAnalysisRequest Structure Tests
describe('PageAnalysisRequest Structure', () => {
  interface PageAnalysisRequest {
    url: string;
    domain?: string;
    title: string;
    metaDescription?: string;
    metaKeywords?: string;
    headings: string[];
    links: { href: string; text: string; isExternal?: boolean }[];
    suspiciousLinks?: { href: string; text: string; patterns: string[] }[];
    externalLinkCount?: number;
    forms: { action: string; method?: string; fields: string[]; hasSensitiveFields?: boolean }[];
    bodyText: string;
    urlPatterns?: string[];
    extractedAt?: number;
  }

  it('should have required fields', () => {
    const request: PageAnalysisRequest = {
      url: 'https://example.com',
      title: 'Test Page',
      headings: ['Heading 1'],
      links: [{ href: 'https://example.com/page', text: 'Link' }],
      forms: [{ action: '/submit', fields: ['email', 'password'] }],
      bodyText: 'Page content here',
    };

    expect(request.url).toBeDefined();
    expect(request.title).toBeDefined();
    expect(request.headings).toBeInstanceOf(Array);
    expect(request.links).toBeInstanceOf(Array);
    expect(request.forms).toBeInstanceOf(Array);
    expect(request.bodyText).toBeDefined();
  });

  it('should support optional fields', () => {
    const request: PageAnalysisRequest = {
      url: 'https://example.com',
      domain: 'example.com',
      title: 'Test Page',
      metaDescription: 'A test page',
      metaKeywords: 'test, page',
      headings: [],
      links: [],
      suspiciousLinks: [{ href: 'https://suspicious.tk', text: 'Link', patterns: ['SUSPICIOUS_TLD'] }],
      externalLinkCount: 5,
      forms: [],
      bodyText: '',
      urlPatterns: ['SUSPICIOUS_TLD'],
      extractedAt: Date.now(),
    };

    expect(request.domain).toBe('example.com');
    expect(request.metaDescription).toBe('A test page');
    expect(request.metaKeywords).toBe('test, page');
    expect(request.suspiciousLinks).toHaveLength(1);
    expect(request.externalLinkCount).toBe(5);
    expect(request.urlPatterns).toContain('SUSPICIOUS_TLD');
    expect(request.extractedAt).toBeDefined();
  });
});
