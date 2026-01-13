import browser from 'webextension-polyfill';
import { ApiConfig, StorageKey, CachedAnalysis, ExtensionSettings, SensitivityLevel, UserFeedback, UserCorrection, FeedbackType } from '@/types';
import { CACHE_TTL_24H, cacheStats, getDomainFromCacheKey } from '@/utils/cache';

/**
 * Default extension settings
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  sensitivity: SensitivityLevel.MEDIUM,
  whitelistedDomains: [],
  theme: 'system',
  highlightSuspiciousText: true,
};

/**
 * Get API configuration from storage
 */
export async function getApiConfig(): Promise<ApiConfig | null> {
  const result = await browser.storage.sync.get(StorageKey.API_CONFIG);
  return (result[StorageKey.API_CONFIG] as ApiConfig) || null;
}

/**
 * Save API configuration to storage
 */
export async function saveApiConfig(config: ApiConfig): Promise<void> {
  await browser.storage.sync.set({ [StorageKey.API_CONFIG]: config });
}

/**
 * Get extension settings from storage
 */
export async function getExtensionSettings(): Promise<ExtensionSettings> {
  const result = await browser.storage.sync.get(StorageKey.EXTENSION_SETTINGS);
  const stored = result[StorageKey.EXTENSION_SETTINGS] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * Save extension settings to storage
 */
export async function saveExtensionSettings(settings: ExtensionSettings): Promise<void> {
  await browser.storage.sync.set({ [StorageKey.EXTENSION_SETTINGS]: settings });
}

/**
 * Check if a domain is whitelisted
 */
export async function isWhitelistedDomain(domain: string): Promise<boolean> {
  const settings = await getExtensionSettings();
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  return settings.whitelistedDomains.some((d) => {
    const normalizedWhitelisted = d.toLowerCase().replace(/^www\./, '');
    return normalizedDomain === normalizedWhitelisted || normalizedDomain.endsWith('.' + normalizedWhitelisted);
  });
}

/**
 * Add a domain to the whitelist
 */
export async function addWhitelistedDomain(domain: string): Promise<void> {
  const settings = await getExtensionSettings();
  
  // Sanitize and normalize domain
  let normalizedDomain = domain.toLowerCase().trim();
  normalizedDomain = normalizedDomain.replace(/^https?:\/\//i, '');
  normalizedDomain = normalizedDomain.replace(/^www\./i, '');
  normalizedDomain = normalizedDomain.split('/')[0];
  normalizedDomain = normalizedDomain.split('?')[0];
  
  // Only allow valid domain characters
  normalizedDomain = normalizedDomain.replace(/[^a-z0-9.-]/g, '');
  
  if (normalizedDomain && !settings.whitelistedDomains.includes(normalizedDomain)) {
    settings.whitelistedDomains.push(normalizedDomain);
    await saveExtensionSettings(settings);
  }
}

/**
 * Remove a domain from the whitelist
 */
export async function removeWhitelistedDomain(domain: string): Promise<void> {
  const settings = await getExtensionSettings();
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  settings.whitelistedDomains = settings.whitelistedDomains.filter(
    (d) => d.toLowerCase().replace(/^www\./, '') !== normalizedDomain
  );
  await saveExtensionSettings(settings);
}

/**
 * Get the entire cache map
 */
async function getCacheMap(): Promise<Record<string, CachedAnalysis>> {
  const result = await browser.storage.local.get(StorageKey.ANALYSIS_CACHE);
  return (result[StorageKey.ANALYSIS_CACHE] as Record<string, CachedAnalysis>) || {};
}

/**
 * Save the entire cache map
 */
async function saveCacheMap(cache: Record<string, CachedAnalysis>): Promise<void> {
  await browser.storage.local.set({ [StorageKey.ANALYSIS_CACHE]: cache });
  cacheStats.updateSize(Object.keys(cache).length);
}

/**
 * Get cached analysis for a URL (exact match)
 */
export async function getCachedAnalysis(url: string): Promise<CachedAnalysis | null> {
  const cache = await getCacheMap();

  const cached = cache[url];
  if (cached && cached.expiresAt > Date.now()) {
    cacheStats.recordHit();
    return cached;
  }

  cacheStats.recordMiss();
  return null;
}

/**
 * Get cached analysis by cache key (domain + content hash)
 */
export async function getCachedAnalysisByKey(cacheKey: string): Promise<CachedAnalysis | null> {
  const cache = await getCacheMap();

  const cached = cache[cacheKey];
  if (cached && cached.expiresAt > Date.now()) {
    cacheStats.recordHit();
    return cached;
  }

  cacheStats.recordMiss();
  return null;
}

/**
 * Get cached analysis for a domain (returns any valid cached result)
 */
export async function getCachedAnalysisByDomain(domain: string): Promise<CachedAnalysis | null> {
  const cache = await getCacheMap();
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');

  for (const [key, cached] of Object.entries(cache)) {
    const keyDomain = getDomainFromCacheKey(key);
    if (keyDomain === normalizedDomain && cached.expiresAt > Date.now()) {
      cacheStats.recordHit();
      return cached;
    }
  }

  cacheStats.recordMiss();
  return null;
}

/**
 * Save analysis result to cache with 24-hour TTL
 */
export async function saveCachedAnalysis(cached: CachedAnalysis): Promise<void> {
  const cache = await getCacheMap();
  cache[cached.url] = cached;
  await saveCacheMap(cache);
}

/**
 * Save analysis with domain+content hash key for smarter caching
 */
export async function saveCachedAnalysisWithKey(
  cacheKey: string,
  url: string,
  result: CachedAnalysis['result']
): Promise<void> {
  const cache = await getCacheMap();
  cache[cacheKey] = {
    url,
    result,
    expiresAt: Date.now() + CACHE_TTL_24H,
  };
  await saveCacheMap(cache);
}

/**
 * Clear cache for a specific domain
 */
export async function clearCacheForDomain(domain: string): Promise<number> {
  const cache = await getCacheMap();
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  let cleared = 0;

  const newCache: Record<string, CachedAnalysis> = {};
  for (const [key, cached] of Object.entries(cache)) {
    const keyDomain = getDomainFromCacheKey(key);
    if (keyDomain !== normalizedDomain) {
      newCache[key] = cached;
    } else {
      cleared++;
    }
  }

  await saveCacheMap(newCache);
  return cleared;
}

/**
 * Clear all cache
 */
export async function clearAllCache(): Promise<void> {
  await browser.storage.local.remove(StorageKey.ANALYSIS_CACHE);
  cacheStats.updateSize(0);
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredCache(): Promise<number> {
  const cache = await getCacheMap();
  const now = Date.now();
  const validCache: Record<string, CachedAnalysis> = {};
  let cleared = 0;

  for (const [key, cached] of Object.entries(cache)) {
    if (cached.expiresAt > now) {
      validCache[key] = cached;
    } else {
      cleared++;
    }
  }

  await saveCacheMap(validCache);
  return cleared;
}

/**
 * Get cache size
 */
export async function getCacheSize(): Promise<number> {
  const cache = await getCacheMap();
  return Object.keys(cache).length;
}

// ============================================================================
// User Feedback & Corrections
// ============================================================================

/**
 * Get all user feedback
 */
export async function getUserFeedback(): Promise<UserFeedback[]> {
  const result = await browser.storage.local.get(StorageKey.USER_FEEDBACK);
  return (result[StorageKey.USER_FEEDBACK] as UserFeedback[]) || [];
}

/**
 * Save user feedback
 */
export async function saveUserFeedback(feedback: UserFeedback): Promise<void> {
  const existing = await getUserFeedback();
  existing.push(feedback);
  
  // Keep only last 100 feedback entries
  const trimmed = existing.slice(-100);
  await browser.storage.local.set({ [StorageKey.USER_FEEDBACK]: trimmed });

  // Update corrections based on feedback
  await updateUserCorrection(feedback);
}

/**
 * Get user corrections map
 */
export async function getUserCorrections(): Promise<Record<string, UserCorrection>> {
  const result = await browser.storage.local.get(StorageKey.USER_CORRECTIONS);
  return (result[StorageKey.USER_CORRECTIONS] as Record<string, UserCorrection>) || {};
}

/**
 * Update user correction based on feedback
 */
async function updateUserCorrection(feedback: UserFeedback): Promise<void> {
  const corrections = await getUserCorrections();
  const domain = feedback.domain.toLowerCase().replace(/^www\./, '');

  const existing = corrections[domain] || {
    domain,
    adjustment: 0,
    feedbackCount: 0,
    lastUpdated: 0,
  };

  // Adjust based on feedback type
  let delta = 0;
  switch (feedback.feedbackType) {
    case FeedbackType.FALSE_POSITIVE:
      delta = -0.2; // Site is safer than detected
      break;
    case FeedbackType.FALSE_NEGATIVE:
      delta = 0.2; // Site is riskier than detected
      break;
    case FeedbackType.ACCURATE:
      delta = 0; // No adjustment needed
      break;
  }

  // Apply with diminishing returns (average with existing)
  const newAdjustment = (existing.adjustment * existing.feedbackCount + delta) / (existing.feedbackCount + 1);

  corrections[domain] = {
    domain,
    adjustment: Math.max(-1, Math.min(1, newAdjustment)),
    feedbackCount: existing.feedbackCount + 1,
    lastUpdated: Date.now(),
  };

  await browser.storage.local.set({ [StorageKey.USER_CORRECTIONS]: corrections });
}

/**
 * Get correction adjustment for a domain
 */
export async function getDomainCorrection(domain: string): Promise<number> {
  const corrections = await getUserCorrections();
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  return corrections[normalizedDomain]?.adjustment || 0;
}

/**
 * Generate export report for current analysis
 */
export function generateExportReport(
  url: string,
  domain: string,
  riskLevel: string,
  threats: string[],
  explanation: string,
  timestamp: number
): string {
  const date = new Date(timestamp).toISOString();
  
  return `SurfSafe Threat Report
========================
Generated: ${date}

URL: ${url}
Domain: ${domain}

Risk Level: ${riskLevel}
${threats.length > 0 ? `\nDetected Threats:\n${threats.map(t => `  • ${t}`).join('\n')}` : '\nNo threats detected.'}

Analysis:
${explanation}

========================
Report generated by SurfSafe Browser Extension
`;
}

/**
 * Generate JSON export
 */
export function generateJsonExport(
  url: string,
  domain: string,
  riskLevel: string,
  threats: string[],
  explanation: string,
  timestamp: number
): string {
  return JSON.stringify({
    reportVersion: '1.0',
    generatedAt: new Date(timestamp).toISOString(),
    url,
    domain,
    riskLevel,
    threats,
    explanation,
    generatedBy: 'SurfSafe Browser Extension',
  }, null, 2);
}

