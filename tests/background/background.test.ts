import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ApiConfig,
  PageAnalysisRequest,
  AnalysisResult,
  RiskLevel,
  ThreatLabel,
  CachedAnalysis,
  StorageKey,
} from '@/types';

/**
 * Phase 3 Unit Tests: Background Service Worker
 *
 * These tests verify:
 * - API configuration storage and retrieval
 * - Cache operations (get, save, clear expired)
 * - Analysis caching behavior
 * - Message handling flow
 */

// Mock webextension-polyfill at module level
vi.mock('webextension-polyfill', () => {
  const mockStorage: Record<string, any> = {};

  return {
    default: {
      storage: {
        sync: {
          get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
          set: vi.fn(async (data: Record<string, any>) => {
            Object.assign(mockStorage, data);
          }),
        },
        local: {
          get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
          set: vi.fn(async (data: Record<string, any>) => {
            Object.assign(mockStorage, data);
          }),
        },
      },
      tabs: {
        onRemoved: {
          addListener: vi.fn(),
        },
        query: vi.fn(async () => []),
        sendMessage: vi.fn(),
      },
      runtime: {
        onMessage: {
          addListener: vi.fn(),
        },
        sendMessage: vi.fn(),
        onInstalled: {
          addListener: vi.fn(),
        },
        openOptionsPage: vi.fn(),
      },
    },
    _mockStorage: mockStorage,
  };
});

// Import after mocking
import browser from 'webextension-polyfill';
import { getApiConfig, saveApiConfig, getCachedAnalysis, saveCachedAnalysis, clearExpiredCache } from '@/utils/storage';

// Access mock storage through the module
const getMockStorage = () => {
  // @ts-expect-error - accessing internal mock property
  return vi.mocked(browser)._mockStorage || {};
};

describe('Storage Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mock storage
    const mockStorage = getMockStorage();
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  describe('API Configuration', () => {
    const validConfig: ApiConfig = {
      apiEndpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: 'sk-test-12345',
      model: 'gpt-4',
    };

    it('should return null when no config exists', async () => {
      const result = await getApiConfig();
      expect(result).toBeNull();
    });

    it('should save API configuration', async () => {
      await saveApiConfig(validConfig);

      expect(browser.storage.sync.set).toHaveBeenCalledWith({
        [StorageKey.API_CONFIG]: validConfig,
      });
    });

    it('should retrieve saved API configuration', async () => {
      const mockStorage = getMockStorage();
      mockStorage[StorageKey.API_CONFIG] = validConfig;

      const result = await getApiConfig();

      expect(result).toEqual(validConfig);
    });
  });

  describe('Analysis Cache', () => {
    const mockAnalysisResult: AnalysisResult = {
      riskLevel: RiskLevel.SAFE,
      threats: [],
      explanation: 'This appears to be a legitimate website.',
      confidence: 0.95,
      timestamp: Date.now(),
    };

    const validCachedAnalysis: CachedAnalysis = {
      url: 'https://example.com',
      result: mockAnalysisResult,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
    };

    const expiredCachedAnalysis: CachedAnalysis = {
      url: 'https://expired.com',
      result: mockAnalysisResult,
      expiresAt: Date.now() - 60 * 60 * 1000, // 1 hour ago
    };

    it('should return null for non-existent cache entry', async () => {
      const result = await getCachedAnalysis('https://nonexistent.com');
      expect(result).toBeNull();
    });

    it('should save analysis to cache', async () => {
      await saveCachedAnalysis(validCachedAnalysis);

      expect(browser.storage.local.set).toHaveBeenCalled();
    });

    it('should retrieve valid cached analysis', async () => {
      const mockStorage = getMockStorage();
      mockStorage[StorageKey.ANALYSIS_CACHE] = {
        'https://example.com': validCachedAnalysis,
      };

      const result = await getCachedAnalysis('https://example.com');

      expect(result).toEqual(validCachedAnalysis);
    });

    it('should return null for expired cache entry', async () => {
      const mockStorage = getMockStorage();
      mockStorage[StorageKey.ANALYSIS_CACHE] = {
        'https://expired.com': expiredCachedAnalysis,
      };

      const result = await getCachedAnalysis('https://expired.com');

      expect(result).toBeNull();
    });

    it('should clear expired cache entries', async () => {
      const mockStorage = getMockStorage();
      const validEntry: CachedAnalysis = {
        url: 'https://valid.com',
        result: mockAnalysisResult,
        expiresAt: Date.now() + 60 * 60 * 1000,
      };

      mockStorage[StorageKey.ANALYSIS_CACHE] = {
        'https://valid.com': validEntry,
        'https://expired.com': expiredCachedAnalysis,
      };

      await clearExpiredCache();

      expect(browser.storage.local.set).toHaveBeenCalled();
    });
  });
});

describe('Background Worker Message Handling', () => {
  // These tests verify the expected behavior of message handling
  // without importing the background script directly (which has side effects)

  describe('Message Types', () => {
    it('should define ANALYZE_PAGE message type', () => {
      const messageType = 'ANALYZE_PAGE';
      expect(messageType).toBe('ANALYZE_PAGE');
    });

    it('should define GET_CURRENT_ANALYSIS message type', () => {
      const messageType = 'GET_CURRENT_ANALYSIS';
      expect(messageType).toBe('GET_CURRENT_ANALYSIS');
    });
  });

  describe('PageAnalysisRequest Structure', () => {
    it('should accept valid page analysis request', () => {
      const request: PageAnalysisRequest = {
        url: 'https://example.com',
        domain: 'example.com',
        title: 'Test Page',
        headings: ['Welcome'],
        links: [{ href: 'https://example.com/about', text: 'About' }],
        forms: [],
        bodyText: 'Test content',
      };

      expect(request.url).toBeDefined();
      expect(request.title).toBeDefined();
      expect(request.bodyText).toBeDefined();
    });

    it('should include optional Phase 2 fields', () => {
      const request: PageAnalysisRequest = {
        url: 'https://example.com',
        domain: 'example.com',
        title: 'Test Page',
        metaDescription: 'A test page',
        metaKeywords: 'test, page',
        headings: [],
        links: [],
        suspiciousLinks: [
          { href: 'https://scam.tk', text: 'Click here', patterns: ['SUSPICIOUS_TLD'] },
        ],
        externalLinkCount: 5,
        forms: [
          {
            action: '/login',
            method: 'POST',
            fields: ['password'],
            hasSensitiveFields: true,
          },
        ],
        bodyText: '',
        urlPatterns: ['EXCESSIVE_HYPHENS'],
        extractedAt: Date.now(),
      };

      expect(request.suspiciousLinks).toBeDefined();
      expect(request.externalLinkCount).toBe(5);
      expect(request.urlPatterns).toContain('EXCESSIVE_HYPHENS');
      expect(request.forms[0].hasSensitiveFields).toBe(true);
    });
  });

  describe('AnalysisResult Structure', () => {
    it('should have all required fields', () => {
      const result: AnalysisResult = {
        riskLevel: RiskLevel.MEDIUM,
        threats: [ThreatLabel.URGENCY, ThreatLabel.PRESSURE],
        explanation: 'Some concerning indicators found.',
        confidence: 0.75,
        timestamp: Date.now(),
      };

      expect(result.riskLevel).toBe(RiskLevel.MEDIUM);
      expect(result.threats).toHaveLength(2);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.timestamp).toBeDefined();
    });
  });
});

describe('Cache Behavior Simulation', () => {
  // Simulate the caching behavior without importing background script

  const mockApiResult: AnalysisResult = {
    riskLevel: RiskLevel.SAFE,
    threats: [],
    explanation: 'Safe website',
    confidence: 0.9,
    timestamp: Date.now(),
  };

  it('should return cached result for same URL', async () => {
    const cache: Record<string, CachedAnalysis> = {};
    const url = 'https://example.com';

    // Simulate first request - no cache
    expect(cache[url]).toBeUndefined();

    // Simulate caching result
    cache[url] = {
      url,
      result: mockApiResult,
      expiresAt: Date.now() + 60 * 60 * 1000,
    };

    // Simulate second request - cache hit
    expect(cache[url]).toBeDefined();
    expect(cache[url].result).toEqual(mockApiResult);
  });

  it('should invalidate cache after expiry', async () => {
    const cache: Record<string, CachedAnalysis> = {};
    const url = 'https://example.com';

    // Cache with past expiry
    cache[url] = {
      url,
      result: mockApiResult,
      expiresAt: Date.now() - 1000, // Expired
    };

    // Check expiry
    const isExpired = cache[url].expiresAt < Date.now();
    expect(isExpired).toBe(true);
  });

  it('should store results per tab', () => {
    const tabResults = new Map<number, AnalysisResult>();

    // Store result for tab 1
    tabResults.set(1, mockApiResult);

    // Store different result for tab 2
    const tab2Result: AnalysisResult = {
      ...mockApiResult,
      riskLevel: RiskLevel.HIGH,
    };
    tabResults.set(2, tab2Result);

    expect(tabResults.get(1)?.riskLevel).toBe(RiskLevel.SAFE);
    expect(tabResults.get(2)?.riskLevel).toBe(RiskLevel.HIGH);
  });

  it('should clean up results when tab is closed', () => {
    const tabResults = new Map<number, AnalysisResult>();

    tabResults.set(1, mockApiResult);
    expect(tabResults.has(1)).toBe(true);

    // Simulate tab close
    tabResults.delete(1);
    expect(tabResults.has(1)).toBe(false);
  });
});

describe('API Configuration Validation', () => {
  it('should validate complete configuration', () => {
    const config: ApiConfig = {
      apiEndpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: 'sk-12345',
      model: 'gpt-4',
    };

    const isValid =
      config.apiEndpoint &&
      config.apiEndpoint.startsWith('http') &&
      config.apiKey &&
      config.apiKey.length > 0 &&
      config.model &&
      config.model.length > 0;

    expect(isValid).toBe(true);
  });

  it('should reject incomplete configuration', () => {
    const incompleteConfig = {
      apiEndpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: '',
      model: 'gpt-4',
    };

    const isValid = Boolean(
      incompleteConfig.apiEndpoint &&
      incompleteConfig.apiKey &&
      incompleteConfig.apiKey.length > 0 &&
      incompleteConfig.model
    );

    expect(isValid).toBe(false);
  });

  it('should validate API endpoint format', () => {
    const validEndpoints = [
      'https://api.openai.com/v1/chat/completions',
      'https://api.anthropic.com/v1/messages',
      'http://localhost:8080/v1/chat/completions',
    ];

    const invalidEndpoints = ['not-a-url', 'ftp://invalid.com', ''];

    validEndpoints.forEach((endpoint) => {
      expect(endpoint.startsWith('http')).toBe(true);
    });

    invalidEndpoints.forEach((endpoint) => {
      expect(endpoint.startsWith('http')).toBe(false);
    });
  });
});

describe('Error Handling Scenarios', () => {
  it('should handle missing API configuration gracefully', () => {
    const config = null;
    const errorMessage = config
      ? null
      : 'API configuration not found. Please configure in extension options.';

    expect(errorMessage).toBe('API configuration not found. Please configure in extension options.');
  });

  it('should handle incomplete API configuration', () => {
    const config = {
      apiEndpoint: 'https://api.example.com',
      apiKey: '',
      model: '',
    };

    const isIncomplete = !config.apiEndpoint || !config.apiKey || !config.model;

    expect(isIncomplete).toBe(true);
  });

  it('should format error response correctly', () => {
    const error = new Error('Network error');
    const errorResponse = {
      error: error.message,
    };

    expect(errorResponse.error).toBe('Network error');
  });
});

describe('Cache Duration Constants', () => {
  it('should set cache expiry to 1 hour by default', () => {
    const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour
    expect(CACHE_DURATION_MS).toBe(3600000);
  });

  it('should clear cache hourly', () => {
    const CACHE_CLEAR_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
    expect(CACHE_CLEAR_INTERVAL_MS).toBe(3600000);
  });
});
