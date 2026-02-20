import browser from 'webextension-polyfill';
import { Message, MessageType, PageAnalysisRequest, AnalysisResult, RiskLevel, SENSITIVITY_THRESHOLDS, ThreatLabel, AnalysisProgress, SuspiciousPassage, ChunkedAnalysisState } from '@/types';
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

// Track chunked analysis state per tab
const tabChunkedState = new Map<number, ChunkedAnalysisState>();

// Chunking constants
const CHUNK_SIZE = 2000; // Characters per chunk
const CHUNK_THRESHOLD = 3000; // Use chunking for content longer than this

/**
 * Split content into chunks at sentence boundaries
 */
function splitContentIntoChunks(content: string, maxChunkSize: number = CHUNK_SIZE): string[] {
  if (!content || content.length <= maxChunkSize) {
    return content ? [content] : [];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkSize) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point (sentence ending) within the chunk size
    let breakPoint = maxChunkSize;
    
    // Look for sentence endings (. ! ?) followed by space or end
    const sentenceEnders = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
    let bestBreak = -1;
    
    for (const ender of sentenceEnders) {
      const idx = remaining.lastIndexOf(ender, maxChunkSize);
      if (idx > bestBreak && idx > maxChunkSize * 0.5) {
        bestBreak = idx + ender.length;
      }
    }
    
    if (bestBreak > 0) {
      breakPoint = bestBreak;
    } else {
      // Fall back to word boundary
      const spaceIdx = remaining.lastIndexOf(' ', maxChunkSize);
      if (spaceIdx > maxChunkSize * 0.5) {
        breakPoint = spaceIdx + 1;
      }
    }

    chunks.push(remaining.substring(0, breakPoint).trim());
    remaining = remaining.substring(breakPoint).trim();
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Aggregate chunk results into final analysis result
 */
function aggregateChunkResults(
  state: ChunkedAnalysisState,
  heuristicThreats: ThreatLabel[] = []
): AnalysisResult {
  // Combine all threats (deduplicated)
  const allThreats = [...new Set([...state.accumulatedThreats, ...heuristicThreats])];
  
  // Calculate risk level based on findings
  let riskLevel: RiskLevel;
  const passageCount = state.accumulatedPassages.length;
  const threatCount = allThreats.length;
  
  if (passageCount === 0 && threatCount === 0) {
    riskLevel = RiskLevel.SAFE;
  } else if (passageCount <= 1 && threatCount <= 1) {
    riskLevel = RiskLevel.LOW;
  } else if (passageCount <= 3 || threatCount <= 2) {
    riskLevel = RiskLevel.MEDIUM;
  } else if (passageCount <= 5 || threatCount <= 4) {
    riskLevel = RiskLevel.HIGH;
  } else {
    riskLevel = RiskLevel.CRITICAL;
  }
  
  // Calculate confidence based on consistency
  const chunksWithIssues = state.accumulatedPassages.length > 0 ? 
    Math.min(state.completedChunks, state.accumulatedPassages.length) : 0;
  const confidence = passageCount > 0 
    ? Math.min(0.95, 0.6 + (chunksWithIssues / state.totalChunks) * 0.3)
    : 0.85;
  
  // Build explanation
  let explanation: string;
  if (passageCount === 0) {
    explanation = 'No suspicious content detected across all page sections.';
  } else {
    const threatNames = allThreats.map(t => t.replace(/_/g, ' ').toLowerCase()).join(', ');
    explanation = `Found ${passageCount} suspicious passage(s) indicating: ${threatNames}.`;
  }
  
  return {
    riskLevel,
    threats: allThreats,
    explanation,
    confidence,
    timestamp: Date.now(),
    suspiciousPassages: state.accumulatedPassages,
  };
}

/**
 * Handle messages from content scripts and popup
 */
addMessageListener(async (message: Message, sender) => {
  console.log('Background received message:', message.type);

  switch (message.type) {
    case MessageType.ANALYZE_PAGE:
      return handleAnalyzePage(message.payload as PageAnalysisRequest, sender.tab?.id);

    case MessageType.GET_CURRENT_ANALYSIS:
      // Popup sends tabId in payload since sender.tab is undefined for popups
      return handleGetCurrentAnalysis(message.payload?.tabId ?? sender.tab?.id);

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
    const contentLength = request.bodyText?.length || 0;
    
    let result: AnalysisResult;
    
    // Extract heuristic threats early so they can be used in chunked analysis
    const heuristicThreats = heuristicResult.findings
      .map(f => heuristicTypeToThreatLabel(f.type))
      .filter((t): t is ThreatLabel => t !== null);
    
    // =========================================================================
    // Decide: Chunked vs Single Analysis
    // =========================================================================
    
    if (contentLength > CHUNK_THRESHOLD) {
      // Chunked analysis for large content
      console.log(`Content is ${contentLength} chars - using chunked analysis`);
      
      const chunks = splitContentIntoChunks(request.bodyText || '');
      console.log(`Split into ${chunks.length} chunks`);
      
      // Initialize chunked state
      const state: ChunkedAnalysisState = {
        url: request.url,
        totalChunks: chunks.length,
        completedChunks: 0,
        accumulatedPassages: [],
        accumulatedThreats: [],
        startTime: Date.now(),
      };
      
      if (tabId) {
        tabChunkedState.set(tabId, state);
      }
      
      const context = {
        url: request.url,
        domain: domain,
        title: request.title,
      };
      
      // Send initial progress
      if (tabId) {
        const initialProgress: AnalysisProgress = {
          currentChunk: 0,
          totalChunks: chunks.length,
          status: 'analyzing',
        };
        try {
          await browser.tabs.sendMessage(tabId, {
            type: MessageType.ANALYSIS_PROGRESS,
            payload: initialProgress,
          });
        } catch {
          // Tab might not be ready, continue anyway
        }
      }
      
      // Process chunks sequentially
      for (let i = 0; i < chunks.length; i++) {
        try {
          console.log(`Analyzing chunk ${i + 1}/${chunks.length}`);
          const chunkResult = await apiClient.analyzeChunk(chunks[i], i, context);
          
          // Accumulate results
          state.accumulatedPassages.push(...chunkResult.suspiciousPassages);
          for (const threat of chunkResult.threats) {
            if (!state.accumulatedThreats.includes(threat)) {
              state.accumulatedThreats.push(threat);
            }
          }
          state.completedChunks++;
          
          // Send progress update with partial results
          if (tabId) {
            const progress: AnalysisProgress = {
              currentChunk: i + 1,
              totalChunks: chunks.length,
              status: 'analyzing',
              partialResult: {
                suspiciousPassages: state.accumulatedPassages,
                threats: state.accumulatedThreats,
              },
            };
            try {
              await browser.tabs.sendMessage(tabId, {
                type: MessageType.ANALYSIS_PROGRESS,
                payload: progress,
              });
            } catch {
              // Continue even if can't send update
            }
          }
        } catch (chunkError) {
          console.warn(`Chunk ${i} failed:`, chunkError);
          // Continue with other chunks
        }
      }
      
      // Aggregate final result
      result = aggregateChunkResults(state, heuristicThreats);
      
      // Clean up state
      if (tabId) {
        tabChunkedState.delete(tabId);
      }
      
    } else {
      // Standard single-request analysis for smaller content
      console.log(`Content is ${contentLength} chars - using single analysis`);
      result = await apiClient.analyzePage(request);
    }

    // =========================================================================
    // Combine Heuristic + LLM Results
    // =========================================================================
    
    // Add heuristic-detected threats that LLM might have missed
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
