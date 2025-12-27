import browser from 'webextension-polyfill';
import { ApiConfig, StorageKey, CachedAnalysis, ExtensionSettings, SensitivityLevel } from '@/types';

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
