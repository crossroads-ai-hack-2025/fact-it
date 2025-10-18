/**
 * Selector Cache Manager - Stores and retrieves discovered selectors
 * Uses chrome.storage.local for persistence across sessions
 */

import { PlatformSelectors, STORAGE_KEYS } from '@/shared/types';
import { EXTENSION_NAME } from '@/shared/constants';

export interface SelectorCacheEntry {
  domain: string;
  selectors: PlatformSelectors;
  confidence: number;
  discoveredAt: number; // timestamp
  lastValidatedAt: number; // timestamp
  validationMetrics: {
    postsFound: number;
    textExtractionRate: number; // 0-1
  };
}

interface SelectorCache {
  [domain: string]: SelectorCacheEntry;
}

// Cache TTL: 30 days
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Revalidation interval: 7 days
const REVALIDATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Get cached selectors for a domain
 */
export async function getCachedSelectors(domain: string): Promise<SelectorCacheEntry | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SELECTORS);
    const cache: SelectorCache = result[STORAGE_KEYS.SELECTORS] || {};

    const entry = cache[domain];

    if (!entry) {
      console.info(`${EXTENSION_NAME}: No cached selectors for ${domain}`);
      return null;
    }

    // Check if entry is expired
    const age = Date.now() - entry.discoveredAt;
    if (age > CACHE_TTL_MS) {
      console.info(`${EXTENSION_NAME}: Cached selectors expired for ${domain} (age: ${Math.floor(age / 86400000)} days)`);
      await removeCachedSelectors(domain);
      return null;
    }

    console.info(
      `${EXTENSION_NAME}: Found cached selectors for ${domain} (confidence: ${entry.confidence}%, age: ${Math.floor(age / 86400000)} days)`
    );

    return entry;
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error reading selector cache:`, error);
    return null;
  }
}

/**
 * Store selectors in cache
 */
export async function setCachedSelectors(
  domain: string,
  selectors: PlatformSelectors,
  confidence: number,
  validationMetrics: {
    postsFound: number;
    textExtractionRate: number;
  }
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SELECTORS);
    const cache: SelectorCache = result[STORAGE_KEYS.SELECTORS] || {};

    const entry: SelectorCacheEntry = {
      domain,
      selectors,
      confidence,
      discoveredAt: Date.now(),
      lastValidatedAt: Date.now(),
      validationMetrics,
    };

    cache[domain] = entry;

    await chrome.storage.local.set({ [STORAGE_KEYS.SELECTORS]: cache });

    console.info(
      `${EXTENSION_NAME}: Cached selectors for ${domain} (confidence: ${confidence}%)`
    );
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error caching selectors:`, error);
    throw error;
  }
}

/**
 * Update validation timestamp for a cached entry
 */
export async function updateValidationTimestamp(
  domain: string,
  validationMetrics: {
    postsFound: number;
    textExtractionRate: number;
  }
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SELECTORS);
    const cache: SelectorCache = result[STORAGE_KEYS.SELECTORS] || {};

    const entry = cache[domain];
    if (!entry) {
      console.warn(`${EXTENSION_NAME}: Cannot update validation - no cached entry for ${domain}`);
      return;
    }

    entry.lastValidatedAt = Date.now();
    entry.validationMetrics = validationMetrics;

    await chrome.storage.local.set({ [STORAGE_KEYS.SELECTORS]: cache });

    console.info(`${EXTENSION_NAME}: Updated validation timestamp for ${domain}`);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error updating validation timestamp:`, error);
  }
}

/**
 * Check if cached selectors need revalidation
 */
export function needsRevalidation(entry: SelectorCacheEntry): boolean {
  const timeSinceValidation = Date.now() - entry.lastValidatedAt;
  return timeSinceValidation > REVALIDATION_INTERVAL_MS;
}

/**
 * Remove cached selectors for a domain
 */
export async function removeCachedSelectors(domain: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SELECTORS);
    const cache: SelectorCache = result[STORAGE_KEYS.SELECTORS] || {};

    delete cache[domain];

    await chrome.storage.local.set({ [STORAGE_KEYS.SELECTORS]: cache });

    console.info(`${EXTENSION_NAME}: Removed cached selectors for ${domain}`);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error removing cached selectors:`, error);
  }
}

/**
 * Get all cached domains
 */
export async function getAllCachedDomains(): Promise<string[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SELECTORS);
    const cache: SelectorCache = result[STORAGE_KEYS.SELECTORS] || {};

    return Object.keys(cache);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error reading cached domains:`, error);
    return [];
  }
}

/**
 * Clear all cached selectors
 */
export async function clearSelectorCache(): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.SELECTORS]: {} });
    console.info(`${EXTENSION_NAME}: Cleared selector cache`);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error clearing selector cache:`, error);
    throw error;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalDomains: number;
  averageConfidence: number;
  oldestEntry: number;
  newestEntry: number;
}> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SELECTORS);
    const cache: SelectorCache = result[STORAGE_KEYS.SELECTORS] || {};

    const entries = Object.values(cache);

    if (entries.length === 0) {
      return {
        totalDomains: 0,
        averageConfidence: 0,
        oldestEntry: 0,
        newestEntry: 0,
      };
    }

    const confidences = entries.map((e) => e.confidence);
    const averageConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    const timestamps = entries.map((e) => e.discoveredAt);
    const oldestEntry = Math.min(...timestamps);
    const newestEntry = Math.max(...timestamps);

    return {
      totalDomains: entries.length,
      averageConfidence: Math.round(averageConfidence),
      oldestEntry,
      newestEntry,
    };
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error getting cache stats:`, error);
    return {
      totalDomains: 0,
      averageConfidence: 0,
      oldestEntry: 0,
      newestEntry: 0,
    };
  }
}
