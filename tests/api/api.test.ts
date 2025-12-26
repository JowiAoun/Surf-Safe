import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LLMApiClient,
  createApiClient,
  sleep,
  calculateBackoffDelay,
  parseRetryAfter,
  createApiErrorFromResponse,
} from '@/utils/api';
import {
  ApiConfig,
  PageAnalysisRequest,
  RiskLevel,
  ThreatLabel,
  RetryConfig,
  ApiError,
  ApiErrorType,
  DEFAULT_RETRY_CONFIG,
} from '@/types';

/**
 * Phase 3 Unit Tests: Background Service Worker & API Integration
 *
 * These tests verify:
 * - LLM API client functionality
 * - Retry logic with exponential backoff
 * - Rate limit handling (429 responses)
 * - Timeout handling
 * - Response parsing
 * - API key retrieval and usage
 */

// Mock API configuration
const mockApiConfig: ApiConfig = {
  apiEndpoint: 'https://api.example.com/v1/chat/completions',
  apiKey: 'test-api-key-12345',
  model: 'gpt-4',
};

// Mock page analysis request
const mockPageRequest: PageAnalysisRequest = {
  url: 'https://example.com',
  domain: 'example.com',
  title: 'Test Page',
  metaDescription: 'A test page',
  headings: ['Welcome', 'About Us'],
  links: [{ href: 'https://example.com/about', text: 'About' }],
  forms: [],
  bodyText: 'This is a test page with some content.',
};

// Mock successful API response
const mockSuccessResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          riskLevel: 'SAFE',
          threats: [],
          explanation: 'This appears to be a legitimate website.',
          confidence: 0.95,
        }),
      },
    },
  ],
};

// Mock fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Utility Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sleep', () => {
    it('should resolve after specified milliseconds', async () => {
      const sleepPromise = sleep(1000);
      vi.advanceTimersByTime(1000);
      await expect(sleepPromise).resolves.toBeUndefined();
    });
  });

  describe('calculateBackoffDelay', () => {
    const config: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    };

    it('should use retry-after value when provided', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const delay = calculateBackoffDelay(0, config, 5000);
      // 5000 + (0.5 * 1000) = 5500
      expect(delay).toBe(5500);
    });

    it('should calculate exponential backoff for first attempt', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const delay = calculateBackoffDelay(0, config);
      // 1000 * 2^0 + 0 = 1000
      expect(delay).toBe(1000);
    });

    it('should calculate exponential backoff for second attempt', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const delay = calculateBackoffDelay(1, config);
      // 1000 * 2^1 + 0 = 2000
      expect(delay).toBe(2000);
    });

    it('should calculate exponential backoff for third attempt', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const delay = calculateBackoffDelay(2, config);
      // 1000 * 2^2 + 0 = 4000
      expect(delay).toBe(4000);
    });

    it('should not exceed max delay', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const delay = calculateBackoffDelay(10, config);
      expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
    });

    it('should add jitter to delay', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const delay = calculateBackoffDelay(0, config);
      // 1000 * 2^0 + (0.5 * 1000) = 1500
      expect(delay).toBe(1500);
    });
  });

  describe('parseRetryAfter', () => {
    it('should return undefined for null input', () => {
      expect(parseRetryAfter(null)).toBeUndefined();
    });

    it('should parse seconds as number', () => {
      expect(parseRetryAfter('60')).toBe(60000);
    });

    it('should parse HTTP date format', () => {
      const futureDate = new Date(Date.now() + 30000);
      const result = parseRetryAfter(futureDate.toUTCString());
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(30000);
    });

    it('should return undefined for past dates', () => {
      const pastDate = new Date(Date.now() - 30000);
      expect(parseRetryAfter(pastDate.toUTCString())).toBeUndefined();
    });

    it('should return undefined for invalid input', () => {
      expect(parseRetryAfter('invalid')).toBeUndefined();
    });
  });
});

describe('createApiErrorFromResponse', () => {
  it('should create RATE_LIMITED error for 429 status', async () => {
    const response = new Response(JSON.stringify({ error: { message: 'Rate limited' } }), {
      status: 429,
      headers: { 'retry-after': '60' },
    });

    const error = await createApiErrorFromResponse(response);

    expect(error.type).toBe(ApiErrorType.RATE_LIMITED);
    expect(error.statusCode).toBe(429);
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(60000);
  });

  it('should create AUTHENTICATION_ERROR for 401 status', async () => {
    const response = new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status: 401,
    });

    const error = await createApiErrorFromResponse(response);

    expect(error.type).toBe(ApiErrorType.AUTHENTICATION_ERROR);
    expect(error.statusCode).toBe(401);
    expect(error.retryable).toBe(false);
  });

  it('should create AUTHENTICATION_ERROR for 403 status', async () => {
    const response = new Response(JSON.stringify({ message: 'Forbidden' }), {
      status: 403,
    });

    const error = await createApiErrorFromResponse(response);

    expect(error.type).toBe(ApiErrorType.AUTHENTICATION_ERROR);
    expect(error.statusCode).toBe(403);
    expect(error.retryable).toBe(false);
  });

  it('should create SERVER_ERROR for 500 status', async () => {
    const response = new Response(JSON.stringify({ message: 'Internal error' }), {
      status: 500,
    });

    const error = await createApiErrorFromResponse(response);

    expect(error.type).toBe(ApiErrorType.SERVER_ERROR);
    expect(error.statusCode).toBe(500);
    expect(error.retryable).toBe(true);
  });

  it('should create SERVER_ERROR for 503 status', async () => {
    const response = new Response(JSON.stringify({}), {
      status: 503,
      statusText: 'Service Unavailable',
    });

    const error = await createApiErrorFromResponse(response);

    expect(error.type).toBe(ApiErrorType.SERVER_ERROR);
    expect(error.statusCode).toBe(503);
    expect(error.retryable).toBe(true);
  });

  it('should create UNKNOWN error for other status codes', async () => {
    const response = new Response(JSON.stringify({ message: 'Bad request' }), {
      status: 400,
    });

    const error = await createApiErrorFromResponse(response);

    expect(error.type).toBe(ApiErrorType.UNKNOWN);
    expect(error.statusCode).toBe(400);
    expect(error.retryable).toBe(false);
  });
});

describe('LLMApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('createApiClient', () => {
    it('should create a client with default retry config', () => {
      const client = createApiClient(mockApiConfig);
      expect(client).toBeInstanceOf(LLMApiClient);
    });

    it('should create a client with custom retry config', () => {
      const customConfig: RetryConfig = {
        maxRetries: 5,
        initialDelayMs: 500,
        maxDelayMs: 60000,
        backoffMultiplier: 3,
      };
      const client = createApiClient(mockApiConfig, customConfig);
      expect(client).toBeInstanceOf(LLMApiClient);
    });
  });

  describe('analyzePage', () => {
    it('should return analysis result on successful API call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const client = createApiClient(mockApiConfig);
      const result = await client.analyzePage(mockPageRequest);

      expect(result.riskLevel).toBe(RiskLevel.SAFE);
      expect(result.threats).toEqual([]);
      expect(result.explanation).toBe('This appears to be a legitimate website.');
      expect(result.confidence).toBe(0.95);
      expect(result.timestamp).toBeDefined();
    });

    it('should parse response with threats correctly', async () => {
      const threatResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                riskLevel: 'HIGH',
                threats: ['URGENCY', 'PRESSURE', 'SUSPICIOUS_LINK'],
                explanation: 'Multiple scam indicators detected.',
                confidence: 0.85,
              }),
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => threatResponse,
      });

      const client = createApiClient(mockApiConfig);
      const result = await client.analyzePage(mockPageRequest);

      expect(result.riskLevel).toBe(RiskLevel.HIGH);
      expect(result.threats).toContain(ThreatLabel.URGENCY);
      expect(result.threats).toContain(ThreatLabel.PRESSURE);
      expect(result.threats).toContain(ThreatLabel.SUSPICIOUS_LINK);
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const markdownResponse = {
        choices: [
          {
            message: {
              content: '```json\n{"riskLevel": "LOW", "threats": [], "explanation": "Minor concerns", "confidence": 0.7}\n```',
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => markdownResponse,
      });

      const client = createApiClient(mockApiConfig);
      const result = await client.analyzePage(mockPageRequest);

      expect(result.riskLevel).toBe(RiskLevel.LOW);
      expect(result.confidence).toBe(0.7);
    });

    it('should throw ApiError for invalid response format', async () => {
      const invalidResponse = {
        choices: [
          {
            message: {
              content: 'This is not valid JSON',
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => invalidResponse,
      });

      const client = createApiClient(mockApiConfig);

      await expect(client.analyzePage(mockPageRequest)).rejects.toThrow(ApiError);
    });

    it('should throw ApiError for missing content', async () => {
      const emptyResponse = {
        choices: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyResponse,
      });

      const client = createApiClient(mockApiConfig);

      await expect(client.analyzePage(mockPageRequest)).rejects.toThrow(ApiError);
    });

    it('should throw non-retryable error for authentication failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        json: async () => ({ error: { message: 'Invalid API key' } }),
      });

      const client = createApiClient(mockApiConfig);

      await expect(client.analyzePage(mockPageRequest)).rejects.toMatchObject({
        type: ApiErrorType.AUTHENTICATION_ERROR,
        retryable: false,
      });
    });

    it('should filter out invalid threat labels', async () => {
      const responseWithInvalidThreats = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                riskLevel: 'MEDIUM',
                threats: ['URGENCY', 'INVALID_THREAT', 'PRESSURE', 'UNKNOWN_LABEL'],
                explanation: 'Some threats detected.',
                confidence: 0.75,
              }),
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => responseWithInvalidThreats,
      });

      const client = createApiClient(mockApiConfig);
      const result = await client.analyzePage(mockPageRequest);

      expect(result.threats).toEqual([ThreatLabel.URGENCY, ThreatLabel.PRESSURE]);
      expect(result.threats).not.toContain('INVALID_THREAT');
      expect(result.threats).not.toContain('UNKNOWN_LABEL');
    });

    it('should clamp confidence to valid range', async () => {
      const responseWithInvalidConfidence = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                riskLevel: 'SAFE',
                threats: [],
                explanation: 'Test',
                confidence: 1.5, // Invalid: above 1.0
              }),
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => responseWithInvalidConfidence,
      });

      const client = createApiClient(mockApiConfig);
      const result = await client.analyzePage(mockPageRequest);

      expect(result.confidence).toBe(1.0);
    });

    it('should default confidence to 0.5 when not a number', async () => {
      const responseWithMissingConfidence = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                riskLevel: 'SAFE',
                threats: [],
                explanation: 'Test',
                confidence: 'high', // Invalid: not a number
              }),
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => responseWithMissingConfidence,
      });

      const client = createApiClient(mockApiConfig);
      const result = await client.analyzePage(mockPageRequest);

      expect(result.confidence).toBe(0.5);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on 500 server error', async () => {
      const quickRetryConfig: RetryConfig = {
        maxRetries: 2,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers(),
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse,
        });

      const client = createApiClient(mockApiConfig, quickRetryConfig);
      const result = await client.analyzePage(mockPageRequest);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.riskLevel).toBe(RiskLevel.SAFE);
    });

    it('should retry on rate limit (429) with backoff', async () => {
      const quickRetryConfig: RetryConfig = {
        maxRetries: 2,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'retry-after': '1' }),
          json: async () => ({ error: { message: 'Rate limited' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSuccessResponse,
        });

      const client = createApiClient(mockApiConfig, quickRetryConfig);
      const result = await client.analyzePage(mockPageRequest);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.riskLevel).toBe(RiskLevel.SAFE);
    });

    it('should exhaust retries and throw error', async () => {
      const quickRetryConfig: RetryConfig = {
        maxRetries: 2,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: async () => ({}),
      });

      const client = createApiClient(mockApiConfig, quickRetryConfig);

      await expect(client.analyzePage(mockPageRequest)).rejects.toMatchObject({
        type: ApiErrorType.SERVER_ERROR,
      });

      // Initial attempt + 2 retries = 3 total
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on authentication error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        json: async () => ({ error: { message: 'Invalid API key' } }),
      });

      const client = createApiClient(mockApiConfig);

      await expect(client.analyzePage(mockPageRequest)).rejects.toMatchObject({
        type: ApiErrorType.AUTHENTICATION_ERROR,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timeout Handling', () => {
    it('should throw TIMEOUT error when request times out', async () => {
      const quickRetryConfig: RetryConfig = {
        maxRetries: 0, // No retries to test timeout directly
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      };

      // Simulate an AbortError as the fetch implementation would throw
      mockFetch.mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const client = createApiClient(mockApiConfig, quickRetryConfig);

      await expect(client.analyzePage(mockPageRequest, { timeout: 50 })).rejects.toMatchObject({
        type: ApiErrorType.TIMEOUT,
        retryable: true,
      });
    });

    it('should include timeout duration in error message', async () => {
      const quickRetryConfig: RetryConfig = {
        maxRetries: 0,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      };

      // Simulate an AbortError
      mockFetch.mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const client = createApiClient(mockApiConfig, quickRetryConfig);

      try {
        await client.analyzePage(mockPageRequest, { timeout: 5000 });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as ApiError).message).toContain('5000ms');
      }
    });
  });

  describe('testConnection', () => {
    it('should return success for valid connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OK' } }],
        }),
      });

      const client = createApiClient(mockApiConfig);
      const result = await client.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Connection successful');
      expect(result.latencyMs).toBeDefined();
    });

    it('should return failure for invalid API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        json: async () => ({ error: { message: 'Invalid API key' } }),
      });

      const client = createApiClient(mockApiConfig);
      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid API key');
      expect(result.latencyMs).toBeDefined();
    });
  });

  describe('Prompt Building', () => {
    it('should include suspicious links in prompt', async () => {
      const requestWithSuspiciousLinks: PageAnalysisRequest = {
        ...mockPageRequest,
        suspiciousLinks: [
          { href: 'https://paypa1.tk', text: 'Login', patterns: ['SUSPICIOUS_TLD', 'POSSIBLE_BRAND_IMPERSONATION'] },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const client = createApiClient(mockApiConfig);
      await client.analyzePage(requestWithSuspiciousLinks);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userContent = body.messages[1].content;

      expect(userContent).toContain('Suspicious Links Found');
      expect(userContent).toContain('paypa1.tk');
      expect(userContent).toContain('SUSPICIOUS_TLD');
    });

    it('should include URL patterns in prompt', async () => {
      const requestWithUrlPatterns: PageAnalysisRequest = {
        ...mockPageRequest,
        urlPatterns: ['EXCESSIVE_HYPHENS', 'LONG_DOMAIN'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const client = createApiClient(mockApiConfig);
      await client.analyzePage(requestWithUrlPatterns);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userContent = body.messages[1].content;

      expect(userContent).toContain('URL Warning Patterns');
      expect(userContent).toContain('EXCESSIVE_HYPHENS');
      expect(userContent).toContain('LONG_DOMAIN');
    });

    it('should include external link count in prompt', async () => {
      const requestWithExternalLinks: PageAnalysisRequest = {
        ...mockPageRequest,
        externalLinkCount: 15,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const client = createApiClient(mockApiConfig);
      await client.analyzePage(requestWithExternalLinks);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userContent = body.messages[1].content;

      expect(userContent).toContain('External Links Count: 15');
    });

    it('should mark sensitive forms in prompt', async () => {
      const requestWithSensitiveForms: PageAnalysisRequest = {
        ...mockPageRequest,
        forms: [
          {
            action: '/login',
            method: 'POST',
            fields: ['username', 'password'],
            hasSensitiveFields: true,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const client = createApiClient(mockApiConfig);
      await client.analyzePage(requestWithSensitiveForms);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userContent = body.messages[1].content;

      expect(userContent).toContain('[SENSITIVE]');
    });
  });
});

describe('ApiError', () => {
  it('should create error with all properties', () => {
    const error = new ApiError('Test error', ApiErrorType.RATE_LIMITED, {
      statusCode: 429,
      retryable: true,
      retryAfterMs: 5000,
    });

    expect(error.message).toBe('Test error');
    expect(error.type).toBe(ApiErrorType.RATE_LIMITED);
    expect(error.statusCode).toBe(429);
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(5000);
    expect(error.name).toBe('ApiError');
  });

  it('should default retryable to false', () => {
    const error = new ApiError('Test error', ApiErrorType.UNKNOWN);

    expect(error.retryable).toBe(false);
  });
});
