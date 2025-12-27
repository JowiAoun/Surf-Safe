import browser from 'webextension-polyfill';
import { ApiConfig, StorageKey, CachedAnalysis, ExtensionSettings, SensitivityLevel } from '@/types';
import { CACHE_TTL_24H, cacheStats, generateCacheKey, getDomainFromCacheKey } from '@/utils/cache';

/**
 * Default extension settings
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  sensitivity: SensitivityLevel.MEDIUM,
  whitelistedDomains: [],
  theme: 'system',
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
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
  
  if (!settings.whitelistedDomains.includes(normalizedDomain)) {
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
