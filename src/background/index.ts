import browser from 'webextension-polyfill';
import { Message, MessageType, PageAnalysisRequest, AnalysisResult, RiskLevel, SENSITIVITY_THRESHOLDS, ThreatLabel } from '@/types';
import { getApiConfig, getCachedAnalysis, saveCachedAnalysis, clearExpiredCache, isWhitelistedDomain, getExtensionSettings, clearCacheForDomain, clearAllCache } from '@/utils/storage';
import { createApiClient } from '@/utils/api';
import { addMessageListener } from '@/utils/messaging';
import { CACHE_TTL_24H, cacheStats, generateCacheKey } from '@/utils/cache';
import { runHeuristicAnalysis, getHeuristicRiskLevel, HeuristicType } from '@/utils/heuristics';
import { checkSSLSecurity, calculateSSLScore } from '@/utils/ssl';

console.log('SurfSafe background service worker loaded');

// Store current analysis results per tab
const tabAnalysisResults = new Map<number, AnalysisResult>();

// Track pending analyses to prevent duplicates
const pendingAnalyses = new Set<string>();

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

    case MessageType.CLEAR_CACHE:
      return handleClearCache(message.payload?.domain);

    case MessageType.GET_CACHE_STATS:
      return cacheStats.getStats();

    default:
      console.warn('Unknown message type:', message.type);
      return null;
  }
});

/**
 * Handle cache clear request
 */
async function handleClearCache(domain?: string): Promise<{ cleared: number }> {
  if (domain) {
    const cleared = await clearCacheForDomain(domain);
    console.log(`Cleared ${cleared} cache entries for domain:`, domain);
    return { cleared };
  } else {
    await clearAllCache();
    console.log('Cleared all cache entries');
    return { cleared: -1 };
  }
}

/**
 * Map heuristic types to threat labels
 */
function heuristicTypeToThreatLabel(type: HeuristicType): ThreatLabel | null {
  const mapping: Partial<Record<HeuristicType, ThreatLabel>> = {
    [HeuristicType.URGENCY]: ThreatLabel.URGENCY,
    [HeuristicType.PRESSURE]: ThreatLabel.PRESSURE,
    [HeuristicType.TOO_GOOD]: ThreatLabel.TOO_GOOD,
    [HeuristicType.POOR_GRAMMAR]: ThreatLabel.POOR_GRAMMAR,
  };
  return mapping[type] || null;
}

/**
 * Handle page analysis request
 */
async function handleAnalyzePage(
  request: PageAnalysisRequest,
  tabId?: number
): Promise<AnalysisResult | { error: string } | { whitelisted: true }> {
  const domain = request.domain || new URL(request.url).hostname;
  
  // Prevent duplicate pending requests
  const requestKey = `${domain}:${tabId}`;
  if (pendingAnalyses.has(requestKey)) {
    console.log('Analysis already pending for:', requestKey);
    return { error: 'Analysis already in progress' };
  }

  try {
    // Check if domain is whitelisted
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
      console.log('Cache HIT for:', request.url);
      if (tabId) {
        tabAnalysisResults.set(tabId, cached.result);
      }
      return cached.result;
    }

    // Mark as pending
    pendingAnalyses.add(requestKey);

    // =========================================================================
    // PHASE 7: Heuristic Pre-Analysis
    // =========================================================================
    
    console.log('Running heuristic analysis...');
    const heuristicResult = runHeuristicAnalysis(request.bodyText || '');
    console.log('Heuristic score:', heuristicResult.score, 'Findings:', heuristicResult.findings.length);

    // Run SSL check
    const formActions = request.forms.map(f => f.action).filter(Boolean);
    const sslInfo = checkSSLSecurity(request.url, formActions);
    const sslScore = calculateSSLScore(sslInfo);
    console.log('SSL score:', sslScore, 'Issues:', sslInfo.issues.length);

    // If heuristics are very conclusive (obvious scam), skip LLM
    if (heuristicResult.shouldSkipLLM) {
      console.log('Heuristics conclusive - skipping LLM analysis');
      
      const threats = heuristicResult.findings
        .map(f => heuristicTypeToThreatLabel(f.type))
        .filter((t): t is ThreatLabel => t !== null);
      
      const uniqueThreats = [...new Set(threats)];
      
      const heuristicOnlyResult: AnalysisResult = {
        riskLevel: getHeuristicRiskLevel(heuristicResult.score) as RiskLevel,
        threats: uniqueThreats,
        explanation: `Multiple scam indicators detected: ${heuristicResult.findings.map(f => f.evidence).join(', ')}`,
        confidence: Math.min(0.95, heuristicResult.score / 100),
        timestamp: Date.now(),
      };

      // Cache and store
      await saveCachedAnalysis({
        url: request.url,
        result: heuristicOnlyResult,
        expiresAt: Date.now() + CACHE_TTL_24H,
      });

      if (tabId) {
        tabAnalysisResults.set(tabId, heuristicOnlyResult);
      }

      return heuristicOnlyResult;
    }

    // =========================================================================
    // LLM Analysis (if heuristics not conclusive)
    // =========================================================================

    // Get API configuration
    const config = await getApiConfig();
    if (!config) {
      throw new Error('API configuration not found. Please configure in extension options.');
    }

    if (!config.apiEndpoint || !config.apiKey || !config.model) {
      throw new Error('Incomplete API configuration. Please check extension options.');
    }

    console.log('Cache MISS - Analyzing page with LLM:', request.url);

    const apiClient = createApiClient(config);
    let result = await apiClient.analyzePage(request);

    // =========================================================================
    // Combine Heuristic + LLM Results
    // =========================================================================
    
    // Add heuristic-detected threats that LLM might have missed
    const heuristicThreats = heuristicResult.findings
      .map(f => heuristicTypeToThreatLabel(f.type))
      .filter((t): t is ThreatLabel => t !== null);
    
    const combinedThreats = [...new Set([...result.threats, ...heuristicThreats])];

    // Boost risk level if heuristics found issues
    let adjustedRiskLevel = result.riskLevel;
    if (heuristicResult.score >= 30 && result.riskLevel === RiskLevel.SAFE) {
      adjustedRiskLevel = RiskLevel.LOW;
    } else if (heuristicResult.score >= 50 && result.riskLevel === RiskLevel.LOW) {
      adjustedRiskLevel = RiskLevel.MEDIUM;
    }

    // Apply SSL penalty
    if (sslScore < 60 && adjustedRiskLevel === RiskLevel.SAFE) {
      adjustedRiskLevel = RiskLevel.LOW;
    }

    result = {
      ...result,
      threats: combinedThreats,
      riskLevel: adjustedRiskLevel,
    };

    // Apply sensitivity filtering
    const settings = await getExtensionSettings();
    const threshold = SENSITIVITY_THRESHOLDS[settings.sensitivity];
    
    if (result.confidence < threshold && result.riskLevel !== RiskLevel.CRITICAL) {
      result = {
        ...result,
        threats: result.threats.filter(() => result.confidence >= threshold),
        riskLevel: result.confidence < threshold / 2 ? RiskLevel.SAFE : result.riskLevel,
      };
    }

    console.log('Analysis complete:', result);

    // Cache the result
    await saveCachedAnalysis({
      url: request.url,
      result,
      expiresAt: Date.now() + CACHE_TTL_24H,
    });

    if (tabId) {
      tabAnalysisResults.set(tabId, result);
    }

    return result;
  } catch (error) {
    console.error('Analysis error:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  } finally {
    pendingAnalyses.delete(requestKey);
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
 * Clear expired cache periodically
 */
setInterval(async () => {
  try {
    const cleared = await clearExpiredCache();
    if (cleared > 0) {
      console.log(`Cleared ${cleared} expired cache entries`);
    }
  } catch (error) {
    console.error('Failed to clear expired cache:', error);
  }
}, 60 * 60 * 1000);

/**
 * Extension installed or updated
 */
browser.runtime.onInstalled.addListener(async (details) => {
  console.log('SurfSafe installed/updated:', details.reason);

  if (details.reason === 'install') {
    await browser.runtime.openOptionsPage();
  }
});
