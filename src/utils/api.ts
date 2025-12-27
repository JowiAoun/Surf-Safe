import {
  ApiConfig,
  PageAnalysisRequest,
  AnalysisResult,
  RiskLevel,
  ThreatLabel,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  ApiError,
  ApiErrorType,
  ApiRequestOptions,
} from '@/types';

/**
 * Default timeout for API requests (30 seconds)
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay for exponential backoff
 */
function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
  retryAfterMs?: number
): number {
  // If server specified a retry-after, use that (with some jitter)
  if (retryAfterMs) {
    const jitter = Math.random() * 1000;
    return Math.min(retryAfterMs + jitter, config.maxDelayMs);
  }

  // Exponential backoff with jitter
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const jitter = Math.random() * config.initialDelayMs;
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Parse retry-after header value
 */
function parseRetryAfter(retryAfter: string | null): number | undefined {
  if (!retryAfter) return undefined;

  // Try parsing as seconds
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return delayMs > 0 ? delayMs : undefined;
  }

  return undefined;
}

/**
 * Create an API error from a fetch response
 */
async function createApiErrorFromResponse(response: Response): Promise<ApiError> {
  const statusCode = response.status;
  let message = `API request failed: ${statusCode} ${response.statusText}`;

  // Try to get error message from response body
  try {
    const body = await response.json();
    if (body.error?.message) {
      message = body.error.message;
    } else if (body.message) {
      message = body.message;
    }
  } catch {
    // Ignore JSON parsing errors
  }

  // Determine error type and retryability
  if (statusCode === 429) {
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    return new ApiError(message, ApiErrorType.RATE_LIMITED, {
      statusCode,
      retryable: true,
      retryAfterMs,
    });
  }

  if (statusCode === 401 || statusCode === 403) {
    return new ApiError(message, ApiErrorType.AUTHENTICATION_ERROR, {
      statusCode,
      retryable: false,
    });
  }

  if (statusCode >= 500) {
    return new ApiError(message, ApiErrorType.SERVER_ERROR, {
      statusCode,
      retryable: true,
    });
  }

  return new ApiError(message, ApiErrorType.UNKNOWN, {
    statusCode,
    retryable: false,
  });
}

/**
 * LLM API client for scam detection with retry logic
 */
export class LLMApiClient {
  private config: ApiConfig;
  private retryConfig: RetryConfig;

  constructor(config: ApiConfig, retryConfig?: RetryConfig) {
    this.config = config;
    this.retryConfig = retryConfig || DEFAULT_RETRY_CONFIG;
  }

  /**
   * Analyze a page for scam indicators with retry logic
   */
  async analyzePage(
    request: PageAnalysisRequest,
    options?: ApiRequestOptions
  ): Promise<AnalysisResult> {
    const prompt = this.buildPrompt(request);
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
    const retryConfig = options?.retryConfig ?? this.retryConfig;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Merge with external signal if provided
        if (options?.signal) {
          options.signal.addEventListener('abort', () => controller.abort());
        }

        try {
          const response = await fetch(this.config.apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
              model: this.config.model,
              messages: [
                {
                  role: 'system',
                  content: this.getSystemPrompt(),
                },
                {
                  role: 'user',
                  content: prompt,
                },
              ],
              temperature: 0.3,
              max_tokens: 500,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Check content type - API should return JSON
          const contentType = response.headers.get('content-type') || '';
          const isJsonResponse = contentType.includes('application/json');

          if (!response.ok) {
            // If we got HTML instead of JSON, it's likely an incorrect endpoint
            if (!isJsonResponse) {
              const text = await response.text();
              if (text.includes('<!DOCTYPE') || text.includes('<html')) {
                throw new ApiError(
                  `API endpoint returned HTML instead of JSON. ` +
                  `This usually means the endpoint URL is incorrect. `,
                  ApiErrorType.INVALID_RESPONSE,
                  { statusCode: response.status, retryable: false }
                );
              }
            }

            const apiError = await createApiErrorFromResponse(response);

            // Don't retry non-retryable errors
            if (!apiError.retryable) {
              throw apiError;
            }

            // Store error for potential re-throw
            lastError = apiError;

            // Calculate delay and wait before retrying
            if (attempt < retryConfig.maxRetries) {
              const delay = calculateBackoffDelay(attempt, retryConfig, apiError.retryAfterMs);
              console.log(
                `API request failed (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), ` +
                  `retrying in ${Math.round(delay)}ms: ${apiError.message}`
              );
              await sleep(delay);
              continue;
            }

            throw apiError;
          }

          // Verify response is JSON before parsing
          if (!isJsonResponse) {
            const text = await response.text();
            if (text.includes('<!DOCTYPE') || text.includes('<html')) {
              throw new ApiError(
                `API returned HTML instead of JSON. Check your API endpoint URL. ` +
                `Expected: https://openrouter.ai/api/v1/chat/completions (for OpenRouter)`,
                ApiErrorType.INVALID_RESPONSE,
                { retryable: false }
              );
            }
            throw new ApiError(
              `API returned unexpected content type: ${contentType}`,
              ApiErrorType.INVALID_RESPONSE,
              { retryable: false }
            );
          }

          const data = await response.json();
          
          // Log the full response for debugging
          console.log('API Response:', JSON.stringify(data, null, 2));
          
          // Check for API-level errors in the response
          if (data.error) {
            const errorMsg = data.error.message || data.error.code || JSON.stringify(data.error);
            throw new ApiError(
              `API error: ${errorMsg}`,
              ApiErrorType.INVALID_RESPONSE,
              { retryable: false }
            );
          }
          
          const content = data.choices?.[0]?.message?.content;

          if (!content) {
            // Log what we got to help debug
            console.error('Unexpected API response structure:', data);
            throw new ApiError(
              `No content in API response. ` +
              `This usually means: wrong model name, or API key lacks permissions. ` +
              `Response had: ${Object.keys(data).join(', ') || 'empty object'}`,
              ApiErrorType.INVALID_RESPONSE
            );
          }

          return this.parseResponse(content);
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        // Handle abort/timeout errors
        if (error instanceof Error && error.name === 'AbortError') {
          const timeoutError = new ApiError(
            `API request timed out after ${timeout}ms`,
            ApiErrorType.TIMEOUT,
            { retryable: true }
          );

          // Retry on timeout
          if (attempt < retryConfig.maxRetries) {
            const delay = calculateBackoffDelay(attempt, retryConfig);
            console.log(
              `API request timed out (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), ` +
                `retrying in ${Math.round(delay)}ms`
            );
            lastError = timeoutError;
            await sleep(delay);
            continue;
          }

          throw timeoutError;
        }

        // Handle network errors (no response received)
        if (error instanceof TypeError && error.message.includes('fetch')) {
          const networkError = new ApiError(
            `Network error: ${error.message}`,
            ApiErrorType.NETWORK_ERROR,
            { retryable: true }
          );

          // Retry on network error
          if (attempt < retryConfig.maxRetries) {
            const delay = calculateBackoffDelay(attempt, retryConfig);
            console.log(
              `Network error (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), ` +
                `retrying in ${Math.round(delay)}ms`
            );
            lastError = networkError;
            await sleep(delay);
            continue;
          }

          throw networkError;
        }

        // Re-throw ApiErrors and other errors
        if (error instanceof ApiError) {
          throw error;
        }

        console.error('LLM API error:', error);
        throw error;
      }
    }

    // This should not be reached, but just in case
    throw lastError || new ApiError('Unknown error occurred', ApiErrorType.UNKNOWN);
  }

  /**
   * Build the analysis prompt with enhanced data from Phase 2
   */
  private buildPrompt(request: PageAnalysisRequest): string {
    // Format suspicious links if present
    const suspiciousLinksInfo =
      request.suspiciousLinks && request.suspiciousLinks.length > 0
        ? `\nSuspicious Links Found: ${request.suspiciousLinks.map((l) => `${l.href} (Patterns: ${l.patterns.join(', ')})`).join('; ')}`
        : '';

    // Format URL patterns if present
    const urlPatternsInfo =
      request.urlPatterns && request.urlPatterns.length > 0
        ? `\nURL Warning Patterns: ${request.urlPatterns.join(', ')}`
        : '';

    // Format forms with sensitivity info
    const formsInfo =
      request.forms.length > 0
        ? request.forms
            .map(
              (f) =>
                `Action: ${f.action || 'N/A'}, Method: ${f.method || 'N/A'}, Fields: ${f.fields.join(', ')}${f.hasSensitiveFields ? ' [SENSITIVE]' : ''}`
            )
            .join(' | ')
        : 'None';

    // External link count info
    const externalLinksInfo =
      request.externalLinkCount !== undefined
        ? `\nExternal Links Count: ${request.externalLinkCount}`
        : '';

    return `Analyze this website for scam indicators:

URL: ${request.url}
Domain: ${request.domain || 'N/A'}
Title: ${request.title}
Meta Description: ${request.metaDescription || 'N/A'}
Meta Keywords: ${request.metaKeywords || 'N/A'}${urlPatternsInfo}${externalLinksInfo}

Headings: ${request.headings.slice(0, 10).join(', ') || 'None'}

Links (sample): ${request.links.slice(0, 5).map((l) => `${l.text || 'N/A'} (${l.href})${l.isExternal ? ' [EXT]' : ''}`).join(', ') || 'None'}${suspiciousLinksInfo}

Forms: ${formsInfo}

Body text (first 1000 chars): ${request.bodyText.substring(0, 1000) || 'No visible text'}

Analyze for these threat indicators:
- URGENCY: Time-pressure tactics ("Act now!", "Limited time offer")
- PRESSURE: Coercive language ("You must", "Account will be closed")
- TOO_GOOD_TO_BE_TRUE: Unrealistic promises (huge discounts, free money)
- POOR_GRAMMAR: Language quality issues (typos, awkward phrasing)
- SENSITIVE_DATA_REQ: Unusual data requests (SSN, full card details on landing page)
- FAKE_TRUST_SIGNALS: False authority badges (fake security seals, false endorsements)
- SUSPICIOUS_LINK: Malformed/misleading URLs (typosquatting, lookalike domains)
- IMPERSONATION: Brand/entity mimicry (fake logos, brand name variations)
- SUSPICIOUS_DOMAIN: Suspicious domain characteristics (new domain, unusual TLD)

Consider the pre-analyzed URL patterns and link analysis when making your assessment.

Respond in JSON format:
{
  "riskLevel": "SAFE|LOW|MEDIUM|HIGH|CRITICAL",
  "threats": ["THREAT1", "THREAT2"],
  "explanation": "Brief explanation of findings",
  "confidence": 0.0-1.0
}`;
  }

  /**
   * System prompt for the LLM
   */
  private getSystemPrompt(): string {
    return `You are a cybersecurity expert specializing in scam and phishing detection. Analyze websites for scam indicators and provide accurate risk assessments.

Guidelines:
- Be thorough but concise
- Consider both content and technical indicators
- Weight pre-analyzed URL patterns appropriately
- Flag pages requesting sensitive data on landing pages
- Consider external link counts (many external links to unknown domains is suspicious)
- Forms with sensitive fields (password, SSN, credit card) warrant closer inspection
- Always respond in valid JSON format
- Confidence should reflect certainty of assessment (0.0-1.0)

Risk Level Guidelines:
- SAFE: No concerning indicators, legitimate website
- LOW: Minor concerns but likely legitimate (e.g., aggressive marketing)
- MEDIUM: Some red flags present, user should exercise caution
- HIGH: Multiple scam indicators, likely fraudulent
- CRITICAL: Clear scam/phishing attempt, immediate danger`;
  }

  /**
   * Parse LLM response into AnalysisResult with robust error handling
   */
  private parseResponse(content: string): AnalysisResult {
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch =
        content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;

      // Clean the string before parsing
      const cleanedJson = jsonString.trim();

      const parsed = JSON.parse(cleanedJson);

      // Validate required fields
      if (!parsed.riskLevel || !Object.values(RiskLevel).includes(parsed.riskLevel)) {
        throw new Error('Invalid or missing riskLevel');
      }

      if (!Array.isArray(parsed.threats)) {
        throw new Error('Invalid or missing threats array');
      }

      // Validate threat labels
      const validThreats = parsed.threats.filter((t: string) =>
        Object.values(ThreatLabel).includes(t as ThreatLabel)
      );

      // Validate confidence
      const confidence =
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5;

      return {
        riskLevel: parsed.riskLevel as RiskLevel,
        threats: validThreats as ThreatLabel[],
        explanation: parsed.explanation || 'No explanation provided',
        confidence,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', content, error);
      throw new ApiError(
        `Invalid LLM response format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ApiErrorType.INVALID_RESPONSE
      );
    }
  }

  /**
   * Test the API connection with a simple request
   */
  async testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'user',
              content: 'Reply with exactly: "OK"',
            },
          ],
          max_tokens: 10,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const error = await createApiErrorFromResponse(response);
        return {
          success: false,
          message: error.message,
          latencyMs,
        };
      }

      return {
        success: true,
        message: 'Connection successful',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          message: 'Connection timed out (10s)',
          latencyMs,
        };
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        latencyMs,
      };
    }
  }
}

/**
 * Create an LLM API client instance
 */
export function createApiClient(config: ApiConfig, retryConfig?: RetryConfig): LLMApiClient {
  return new LLMApiClient(config, retryConfig);
}

/**
 * Export utilities for testing
 */
export { sleep, calculateBackoffDelay, parseRetryAfter, createApiErrorFromResponse };
