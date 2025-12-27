import browser from 'webextension-polyfill';
import { Message, MessageType, PageAnalysisRequest, AnalysisResult, RiskLevel, SENSITIVITY_THRESHOLDS } from '@/types';
import { getApiConfig, getCachedAnalysis, saveCachedAnalysis, clearExpiredCache, isWhitelistedDomain, getExtensionSettings } from '@/utils/storage';
import { createApiClient } from '@/utils/api';
import { addMessageListener } from '@/utils/messaging';

console.log('SurfSafe background service worker loaded');

// Store current analysis results per tab
const tabAnalysisResults = new Map<number, AnalysisResult>();

/**
 * Handle messages from content scripts and popup
 */
addMessageListener(async (message: Message, sender) => {
  console.log('Background received message:', message.type);

  switch (message.type) {
    case MessageType.ANALYZE_PAGE:
      return handleAnalyzePage(message.payload as PageAnalysisRequest, sender.tab?.id);

    case MessageType.GET_CURRENT_ANALYSIS:
      return handleGetCurrentAnalysis(sender.tab?.id);

    default:
      console.warn('Unknown message type:', message.type);
      return null;
  }
});

/**
 * Handle page analysis request
 */
async function handleAnalyzePage(
  request: PageAnalysisRequest,
  tabId?: number
): Promise<AnalysisResult | { error: string } | { whitelisted: true }> {
  try {
    // Check if domain is whitelisted
    const domain = request.domain || new URL(request.url).hostname;
    if (await isWhitelistedDomain(domain)) {
      console.log('Domain is whitelisted, skipping analysis:', domain);
      const whitelistedResult: AnalysisResult = {
        riskLevel: RiskLevel.SAFE,
        threats: [],
        explanation: 'This domain is in your whitelist and was not analyzed.',
        confidence: 1.0,
        timestamp: Date.now(),
      };
      if (tabId) {
        tabAnalysisResults.set(tabId, whitelistedResult);
      }
      return whitelistedResult;
    }

    // Check cache first
    const cached = await getCachedAnalysis(request.url);
    if (cached) {
      console.log('Returning cached analysis for:', request.url);
      if (tabId) {
        tabAnalysisResults.set(tabId, cached.result);
      }
      return cached.result;
    }

    // Get API configuration
    const config = await getApiConfig();
    if (!config) {
      throw new Error('API configuration not found. Please configure in extension options.');
    }

    // Validate configuration
    if (!config.apiEndpoint || !config.apiKey || !config.model) {
      throw new Error('Incomplete API configuration. Please check extension options.');
    }

    console.log('Analyzing page:', request.url);

    // Create API client and analyze
    const apiClient = createApiClient(config);
    let result = await apiClient.analyzePage(request);

    // Apply sensitivity filtering
    const settings = await getExtensionSettings();
    const threshold = SENSITIVITY_THRESHOLDS[settings.sensitivity];
    
    // Filter out low-confidence threats based on sensitivity
    if (result.confidence < threshold && result.riskLevel !== RiskLevel.CRITICAL) {
      // For low-confidence results on non-critical sites, adjust risk level
      result = {
        ...result,
        threats: result.threats.filter(() => result.confidence >= threshold),
        riskLevel: result.confidence < threshold / 2 ? RiskLevel.SAFE : result.riskLevel,
      };
    }

    console.log('Analysis complete:', result);

    // Cache the result (expires in 1 hour)
    await saveCachedAnalysis({
      url: request.url,
      result,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });

    // Store in tab results
    if (tabId) {
      tabAnalysisResults.set(tabId, result);
    }

    return result;
  } catch (error) {
    console.error('Analysis error:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Handle request for current analysis
 */
async function handleGetCurrentAnalysis(tabId?: number): Promise<AnalysisResult | null> {
  if (!tabId) {
    return null;
  }

  return tabAnalysisResults.get(tabId) || null;
}

/**
 * Clean up when tab is closed
 */
browser.tabs.onRemoved.addListener((tabId) => {
  tabAnalysisResults.delete(tabId);
});

/**
 * Clear expired cache periodically (every hour)
 */
setInterval(() => {
  clearExpiredCache().catch((error) => {
    console.error('Failed to clear expired cache:', error);
  });
}, 60 * 60 * 1000);

/**
 * Extension installed or updated
 */
browser.runtime.onInstalled.addListener(async (details) => {
  console.log('SurfSafe installed/updated:', details.reason);

  if (details.reason === 'install') {
    // Open options page on first install
    await browser.runtime.openOptionsPage();
  }
});
