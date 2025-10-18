/**
 * Fact-Check Cache Manager
 * Stores aggregated fact-check results keyed by content hash to avoid redundant API calls
 */

import { STORAGE_KEYS } from '@/shared/types';
import { EXTENSION_NAME } from '@/shared/constants';
import type { AggregatedResult } from '@/background/ai/providers/types';

export interface FactCheckCacheEntry {
  hash: string;
  result: AggregatedResult;
  cachedAt: number; // timestamp when cached
  lastAccessedAt: number; // timestamp of last cache hit
  textSnippet: string; // first 100 chars for debugging/UI
}

interface FactCheckCache {
  [hash: string]: FactCheckCacheEntry;
}

// Cache TTL: 7 days (user preference)
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Maximum cache size before LRU eviction (aim for ~5MB to stay under 10MB limit)
const MAX_CACHE_ENTRIES = 1000;

/**
 * Normalize text for consistent hashing
 * - Trim whitespace
 * - Collapse multiple spaces
 * - Lowercase for case-insensitive matching
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Generate SHA-256 hash of text
 * @param text - Text to hash
 * @returns Hex string hash
 */
async function hashText(text: string): Promise<string> {
  const normalized = normalizeText(text);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Get cached fact-check result by text
 * @param text - Text to look up
 * @returns Cached result or null if not found/expired
 */
export async function getCachedResult(text: string): Promise<AggregatedResult | null> {
  try {
    const hash = await hashText(text);
    const result = await chrome.storage.local.get(STORAGE_KEYS.CACHE);
    const cache: FactCheckCache = result[STORAGE_KEYS.CACHE] || {};

    const entry = cache[hash];

    if (!entry) {
      console.info(`${EXTENSION_NAME}: Cache miss - hash: ${hash.substring(0, 8)}...`);
      return null;
    }

    // Check if entry is expired
    const age = Date.now() - entry.cachedAt;
    if (age > CACHE_TTL_MS) {
      const ageDays = Math.floor(age / 86400000);
      console.info(
        `${EXTENSION_NAME}: Cache expired - hash: ${hash.substring(0, 8)}... (age: ${ageDays} days)`
      );
      await removeCachedResult(hash);
      return null;
    }

    // Update last accessed timestamp for LRU
    entry.lastAccessedAt = Date.now();
    cache[hash] = entry;
    await chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: cache });

    const ageMinutes = Math.floor(age / 60000);
    console.info(
      `${EXTENSION_NAME}: Cache hit! - hash: ${hash.substring(0, 8)}... (age: ${ageMinutes}m, verdict: ${entry.result.verdict})`
    );

    return entry.result;
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error reading fact-check cache:`, error);
    return null;
  }
}

/**
 * Store fact-check result in cache
 * @param text - Original text
 * @param result - Aggregated fact-check result
 */
export async function setCachedResult(text: string, result: AggregatedResult): Promise<void> {
  try {
    const hash = await hashText(text);
    const result_data = await chrome.storage.local.get(STORAGE_KEYS.CACHE);
    let cache: FactCheckCache = result_data[STORAGE_KEYS.CACHE] || {};

    // Evict old entries if cache is full
    cache = await evictIfNeeded(cache);

    const entry: FactCheckCacheEntry = {
      hash,
      result,
      cachedAt: Date.now(),
      lastAccessedAt: Date.now(),
      textSnippet: text.substring(0, 100),
    };

    cache[hash] = entry;

    await chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: cache });

    console.info(
      `${EXTENSION_NAME}: Cached result - hash: ${hash.substring(0, 8)}... (verdict: ${result.verdict}, confidence: ${result.confidence}%)`
    );
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error caching fact-check result:`, error);
    // Don't throw - caching failure shouldn't break fact-checking
  }
}

/**
 * LRU eviction - remove oldest entries when cache is full
 * @param cache - Current cache
 * @returns Cleaned cache
 */
async function evictIfNeeded(cache: FactCheckCache): Promise<FactCheckCache> {
  const entries = Object.values(cache);

  if (entries.length < MAX_CACHE_ENTRIES) {
    return cache;
  }

  console.info(
    `${EXTENSION_NAME}: Cache full (${entries.length} entries), evicting least recently used...`
  );

  // Sort by lastAccessedAt, keep most recent 80% (leave room for growth)
  const keepCount = Math.floor(MAX_CACHE_ENTRIES * 0.8);
  const sorted = entries.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  const toKeep = sorted.slice(0, keepCount);

  const newCache: FactCheckCache = {};
  for (const entry of toKeep) {
    newCache[entry.hash] = entry;
  }

  console.info(
    `${EXTENSION_NAME}: Evicted ${entries.length - keepCount} entries, kept ${keepCount}`
  );

  return newCache;
}

/**
 * Remove cached result by hash
 * @param hash - Hash to remove
 */
async function removeCachedResult(hash: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CACHE);
    const cache: FactCheckCache = result[STORAGE_KEYS.CACHE] || {};

    delete cache[hash];

    await chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: cache });

    console.info(`${EXTENSION_NAME}: Removed cached result - hash: ${hash.substring(0, 8)}...`);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error removing cached result:`, error);
  }
}

/**
 * Clear all cached fact-check results
 */
export async function clearFactCheckCache(): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: {} });
    console.info(`${EXTENSION_NAME}: Cleared fact-check cache`);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error clearing fact-check cache:`, error);
    throw error;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  oldestEntry: number;
  newestEntry: number;
  averageAge: number;
  storageEstimateMB: number;
}> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CACHE);
    const cache: FactCheckCache = result[STORAGE_KEYS.CACHE] || {};

    const entries = Object.values(cache);

    if (entries.length === 0) {
      return {
        totalEntries: 0,
        oldestEntry: 0,
        newestEntry: 0,
        averageAge: 0,
        storageEstimateMB: 0,
      };
    }

    const timestamps = entries.map((e) => e.cachedAt);
    const oldestEntry = Math.min(...timestamps);
    const newestEntry = Math.max(...timestamps);

    const now = Date.now();
    const ages = entries.map((e) => now - e.cachedAt);
    const averageAge = ages.reduce((a, b) => a + b, 0) / ages.length;

    // Rough storage estimate (JSON size)
    const jsonStr = JSON.stringify(cache);
    const storageEstimateMB = new TextEncoder().encode(jsonStr).length / (1024 * 1024);

    return {
      totalEntries: entries.length,
      oldestEntry,
      newestEntry,
      averageAge,
      storageEstimateMB: Math.round(storageEstimateMB * 100) / 100,
    };
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error getting cache stats:`, error);
    return {
      totalEntries: 0,
      oldestEntry: 0,
      newestEntry: 0,
      averageAge: 0,
      storageEstimateMB: 0,
    };
  }
}
