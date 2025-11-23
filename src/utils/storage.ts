import browser from 'webextension-polyfill';
import { ApiConfig, StorageKey, CachedAnalysis } from '@/types';

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
 * Get cached analysis for a URL
 */
export async function getCachedAnalysis(url: string): Promise<CachedAnalysis | null> {
  const result = await browser.storage.local.get(StorageKey.ANALYSIS_CACHE);
  const cache: Record<string, CachedAnalysis> = (result[StorageKey.ANALYSIS_CACHE] as Record<string, CachedAnalysis>) || {};

  const cached = cache[url];
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  return null;
}

/**
 * Save analysis result to cache
 */
export async function saveCachedAnalysis(cached: CachedAnalysis): Promise<void> {
  const result = await browser.storage.local.get(StorageKey.ANALYSIS_CACHE);
  const cache: Record<string, CachedAnalysis> = (result[StorageKey.ANALYSIS_CACHE] as Record<string, CachedAnalysis>) || {};

  cache[cached.url] = cached;
  await browser.storage.local.set({ [StorageKey.ANALYSIS_CACHE]: cache });
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredCache(): Promise<void> {
  const result = await browser.storage.local.get(StorageKey.ANALYSIS_CACHE);
  const cache: Record<string, CachedAnalysis> = (result[StorageKey.ANALYSIS_CACHE] as Record<string, CachedAnalysis>) || {};

  const now = Date.now();
  const validCache: Record<string, CachedAnalysis> = {};

  for (const [url, cached] of Object.entries(cache)) {
    if (cached.expiresAt > now) {
      validCache[url] = cached;
    }
  }

  await browser.storage.local.set({ [StorageKey.ANALYSIS_CACHE]: validCache });
}
