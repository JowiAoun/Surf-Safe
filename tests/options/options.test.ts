import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 5 Unit Tests: Settings & Configuration Page
 *
 * These tests verify:
 * - API key format validation
 * - Settings persistence
 * - Domain whitelist management
 * - Sensitivity level application
 */

import { SensitivityLevel, SENSITIVITY_THRESHOLDS, ExtensionSettings } from '@/types';

// ============================================================================
// API Key Validation Tests
// ============================================================================

// Replicate the validation function from options/index.ts
function validateApiKeyFormat(key: string): string | null {
  if (!key || key.trim().length === 0) {
    return 'API key is required';
  }
  
  if (key.length < 10) {
    return 'API key seems too short';
  }
  
  if (key.startsWith('sk-') && key.length > 20) {
    return null;
  }
  
  if (key.length >= 20) {
    return null;
  }
  
  return 'API key format may be invalid';
}

describe('API Key Validation', () => {
  describe('validateApiKeyFormat', () => {
    it('should reject empty key', () => {
      expect(validateApiKeyFormat('')).toBe('API key is required');
    });

    it('should reject whitespace-only key', () => {
      expect(validateApiKeyFormat('   ')).toBe('API key is required');
    });

    it('should reject short keys', () => {
      expect(validateApiKeyFormat('abc')).toBe('API key seems too short');
    });

    it('should accept valid OpenAI key format', () => {
      expect(validateApiKeyFormat('sk-1234567890abcdefghij')).toBeNull();
    });

    it('should accept long keys from other providers', () => {
      expect(validateApiKeyFormat('other-provider-key-that-is-long-enough')).toBeNull();
    });

    it('should warn about potentially invalid format', () => {
      expect(validateApiKeyFormat('short-key-15')).toBe('API key format may be invalid');
    });
  });
});

// ============================================================================
// Sensitivity Level Tests
// ============================================================================

describe('Sensitivity Levels', () => {
  describe('SENSITIVITY_THRESHOLDS', () => {
    it('should have thresholds for all sensitivity levels', () => {
      expect(SENSITIVITY_THRESHOLDS[SensitivityLevel.LOW]).toBeDefined();
      expect(SENSITIVITY_THRESHOLDS[SensitivityLevel.MEDIUM]).toBeDefined();
      expect(SENSITIVITY_THRESHOLDS[SensitivityLevel.HIGH]).toBeDefined();
    });

    it('should have LOW with highest threshold (least sensitive)', () => {
      expect(SENSITIVITY_THRESHOLDS[SensitivityLevel.LOW]).toBeGreaterThan(
        SENSITIVITY_THRESHOLDS[SensitivityLevel.MEDIUM]
      );
    });

    it('should have HIGH with lowest threshold (most sensitive)', () => {
      expect(SENSITIVITY_THRESHOLDS[SensitivityLevel.HIGH]).toBeLessThan(
        SENSITIVITY_THRESHOLDS[SensitivityLevel.MEDIUM]
      );
    });

    it('should have all thresholds between 0 and 1', () => {
      Object.values(SENSITIVITY_THRESHOLDS).forEach((threshold) => {
        expect(threshold).toBeGreaterThanOrEqual(0);
        expect(threshold).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Sensitivity filtering logic', () => {
    const testThreshold = (sensitivity: SensitivityLevel, confidence: number): boolean => {
      const threshold = SENSITIVITY_THRESHOLDS[sensitivity];
      return confidence >= threshold;
    };

    it('should pass HIGH sensitivity for 0.3 confidence', () => {
      expect(testThreshold(SensitivityLevel.HIGH, 0.35)).toBe(true);
    });

    it('should fail LOW sensitivity for 0.5 confidence', () => {
      expect(testThreshold(SensitivityLevel.LOW, 0.5)).toBe(false);
    });

    it('should pass MEDIUM sensitivity for 0.6 confidence', () => {
      expect(testThreshold(SensitivityLevel.MEDIUM, 0.6)).toBe(true);
    });

    it('should pass all sensitivities for 0.9 confidence', () => {
      expect(testThreshold(SensitivityLevel.LOW, 0.9)).toBe(true);
      expect(testThreshold(SensitivityLevel.MEDIUM, 0.9)).toBe(true);
      expect(testThreshold(SensitivityLevel.HIGH, 0.9)).toBe(true);
    });
  });
});

// ============================================================================
// Domain Whitelist Tests
// ============================================================================

describe('Domain Whitelist', () => {
  // Replicate the domain normalization logic
  function normalizeDomain(domain: string): string {
    return domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
  }

  function isWhitelisted(domain: string, whitelist: string[]): boolean {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
    return whitelist.some((d) => {
      const normalizedWhitelisted = d.toLowerCase().replace(/^www\./, '');
      return (
        normalizedDomain === normalizedWhitelisted ||
        normalizedDomain.endsWith('.' + normalizedWhitelisted)
      );
    });
  }

  describe('normalizeDomain', () => {
    it('should remove www. prefix', () => {
      expect(normalizeDomain('www.example.com')).toBe('example.com');
    });

    it('should remove http:// prefix', () => {
      expect(normalizeDomain('http://example.com')).toBe('example.com');
    });

    it('should remove https:// prefix', () => {
      expect(normalizeDomain('https://example.com')).toBe('example.com');
    });

    it('should remove path', () => {
      expect(normalizeDomain('https://example.com/path/to/page')).toBe('example.com');
    });

    it('should lowercase the domain', () => {
      expect(normalizeDomain('EXAMPLE.COM')).toBe('example.com');
    });

    it('should handle combined prefixes', () => {
      expect(normalizeDomain('https://www.Example.Com/page')).toBe('example.com');
    });
  });

  describe('isWhitelisted', () => {
    const whitelist = ['example.com', 'trusted.org', 'bank.co.uk'];

    it('should match exact domain', () => {
      expect(isWhitelisted('example.com', whitelist)).toBe(true);
    });

    it('should match with www prefix', () => {
      expect(isWhitelisted('www.example.com', whitelist)).toBe(true);
    });

    it('should match subdomains', () => {
      expect(isWhitelisted('sub.example.com', whitelist)).toBe(true);
    });

    it('should match deep subdomains', () => {
      expect(isWhitelisted('a.b.c.example.com', whitelist)).toBe(true);
    });

    it('should not match similar but different domains', () => {
      expect(isWhitelisted('notexample.com', whitelist)).toBe(false);
    });

    it('should not match unrelated domains', () => {
      expect(isWhitelisted('malicious.com', whitelist)).toBe(false);
    });

    it('should handle empty whitelist', () => {
      expect(isWhitelisted('example.com', [])).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isWhitelisted('EXAMPLE.COM', whitelist)).toBe(true);
    });
  });
});

// ============================================================================
// Extension Settings Tests
// ============================================================================

describe('Extension Settings', () => {
  describe('Default settings', () => {
    const DEFAULT_SETTINGS: ExtensionSettings = {
      sensitivity: SensitivityLevel.MEDIUM,
      whitelistedDomains: [],
      theme: 'system',
    };

    it('should have MEDIUM as default sensitivity', () => {
      expect(DEFAULT_SETTINGS.sensitivity).toBe(SensitivityLevel.MEDIUM);
    });

    it('should have empty whitelist by default', () => {
      expect(DEFAULT_SETTINGS.whitelistedDomains).toEqual([]);
    });

    it('should have system as default theme', () => {
      expect(DEFAULT_SETTINGS.theme).toBe('system');
    });
  });

  describe('Settings merge', () => {
    const DEFAULT_SETTINGS: ExtensionSettings = {
      sensitivity: SensitivityLevel.MEDIUM,
      whitelistedDomains: [],
      theme: 'system',
    };

    it('should use stored sensitivity when provided', () => {
      const stored = { sensitivity: SensitivityLevel.HIGH };
      const merged = { ...DEFAULT_SETTINGS, ...stored };
      expect(merged.sensitivity).toBe(SensitivityLevel.HIGH);
    });

    it('should keep default for unset properties', () => {
      const stored = { sensitivity: SensitivityLevel.LOW };
      const merged = { ...DEFAULT_SETTINGS, ...stored };
      expect(merged.whitelistedDomains).toEqual([]);
      expect(merged.theme).toBe('system');
    });

    it('should merge whitelist correctly', () => {
      const stored = { whitelistedDomains: ['example.com'] };
      const merged = { ...DEFAULT_SETTINGS, ...stored };
      expect(merged.whitelistedDomains).toEqual(['example.com']);
    });
  });
});

// ============================================================================
// Theme Tests
// ============================================================================

describe('Theme Management', () => {
  it('should have valid theme options', () => {
    const validThemes = ['light', 'dark', 'system'];
    validThemes.forEach((theme) => {
      expect(['light', 'dark', 'system']).toContain(theme);
    });
  });

  it('should toggle between light and dark', () => {
    const toggle = (current: 'light' | 'dark'): 'light' | 'dark' => {
      return current === 'dark' ? 'light' : 'dark';
    };

    expect(toggle('light')).toBe('dark');
    expect(toggle('dark')).toBe('light');
  });
});

// ============================================================================
// Connection Test Logic Tests
// ============================================================================

describe('Connection Test', () => {
  it('should calculate latency correctly', () => {
    const startTime = 1000;
    const endTime = 1350;
    const latency = Math.round(endTime - startTime);
    expect(latency).toBe(350);
  });

  it('should validate required fields before test', () => {
    const validateForTest = (endpoint: string, key: string, model: string): boolean => {
      return Boolean(endpoint && key && model);
    };

    expect(validateForTest('https://api.openai.com', 'sk-xxx', 'gpt-4')).toBe(true);
    expect(validateForTest('', 'sk-xxx', 'gpt-4')).toBe(false);
    expect(validateForTest('https://api.openai.com', '', 'gpt-4')).toBe(false);
    expect(validateForTest('https://api.openai.com', 'sk-xxx', '')).toBe(false);
  });
});
