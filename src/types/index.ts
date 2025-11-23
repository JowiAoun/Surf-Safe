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
 * Page analysis request sent from content script
 */
export interface PageAnalysisRequest {
  url: string;
  title: string;
  metaDescription?: string;
  headings: string[];
  links: { href: string; text: string }[];
  forms: { action: string; fields: string[] }[];
  bodyText: string;
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
