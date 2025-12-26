/**
 * Threat labels for scam detection
 */
export enum ThreatLabel {
  URGENCY = 'URGENCY',
  PRESSURE = 'PRESSURE',
  TOO_GOOD = 'TOO_GOOD_TO_BE_TRUE',
  POOR_GRAMMAR = 'POOR_GRAMMAR',
  SENSITIVE_DATA = 'SENSITIVE_DATA_REQ',
  FAKE_TRUST = 'FAKE_TRUST_SIGNALS',
  SUSPICIOUS_LINK = 'SUSPICIOUS_LINK',
  IMPERSONATION = 'IMPERSONATION',
  SUSPICIOUS_DOMAIN = 'SUSPICIOUS_DOMAIN',
}

/**
 * Risk level for website assessment
 */
export enum RiskLevel {
  SAFE = 'SAFE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Link information extracted from page
 */
export interface ExtractedLink {
  href: string;
  text: string;
  isExternal?: boolean;
}

/**
 * Suspicious link information
 */
export interface SuspiciousLink {
  href: string;
  text: string;
  patterns: string[];
}

/**
 * Form information extracted from page
 */
export interface ExtractedForm {
  action: string;
  method?: string;
  fields: string[];
  hasSensitiveFields?: boolean;
}

/**
 * Page analysis request sent from content script
 */
export interface PageAnalysisRequest {
  url: string;
  domain?: string;
  title: string;
  metaDescription?: string;
  metaKeywords?: string;
  headings: string[];
  links: ExtractedLink[];
  suspiciousLinks?: SuspiciousLink[];
  externalLinkCount?: number;
  forms: ExtractedForm[];
  bodyText: string;
  urlPatterns?: string[];
  extractedAt?: number;
}

/**
 * Analysis result from LLM
 */
export interface AnalysisResult {
  riskLevel: RiskLevel;
  threats: ThreatLabel[];
  explanation: string;
  confidence: number;
  timestamp: number;
}

/**
 * Message types for communication between scripts
 */
export enum MessageType {
  ANALYZE_PAGE = 'ANALYZE_PAGE',
  ANALYSIS_COMPLETE = 'ANALYSIS_COMPLETE',
  GET_CURRENT_ANALYSIS = 'GET_CURRENT_ANALYSIS',
  ERROR = 'ERROR',
}

/**
 * Message structure for script communication
 */
export interface Message {
  type: MessageType;
  payload?: any;
}

/**
 * API configuration stored in chrome.storage
 */
export interface ApiConfig {
  apiEndpoint: string;
  apiKey: string;
  model: string;
}

/**
 * Storage keys for chrome.storage
 */
export enum StorageKey {
  API_CONFIG = 'apiConfig',
  ANALYSIS_CACHE = 'analysisCache',
  ANALYSIS_HISTORY = 'analysisHistory',
}

/**
 * Cached analysis result
 */
export interface CachedAnalysis {
  url: string;
  result: AnalysisResult;
  expiresAt: number;
}

/**
 * API retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * API error types for better error handling
 */
export enum ApiErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Extended API error with type and retry information
 */
export class ApiError extends Error {
  type: ApiErrorType;
  statusCode?: number;
  retryable: boolean;
  retryAfterMs?: number;

  constructor(
    message: string,
    type: ApiErrorType,
    options?: {
      statusCode?: number;
      retryable?: boolean;
      retryAfterMs?: number;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

/**
 * API request options
 */
export interface ApiRequestOptions {
  timeout?: number;
  retryConfig?: RetryConfig;
  signal?: AbortSignal;
}

/**
 * Threat detail with confidence score
 */
export interface ThreatDetail {
  label: ThreatLabel;
  confidence: number;
  evidence?: string;
}

/**
 * Enhanced analysis result with detailed threat information
 */
export interface EnhancedAnalysisResult extends AnalysisResult {
  threatDetails?: ThreatDetail[];
  analysisVersion?: string;
}
