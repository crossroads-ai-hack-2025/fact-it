/**
 * Selector Storage - Persistent domain-selector mappings
 * Uses chrome.storage.local for user-managed selector configurations
 * No expiration, no TTL - simple CRUD operations
 */

import { PlatformSelectors, STORAGE_KEYS } from '@/shared/types';
import { SELECTORS, EXTENSION_NAME } from '@/shared/constants';

/**
 * Domain-to-selector mapping stored in chrome.storage
 */
export interface DomainSelectorMap {
  [domain: string]: PlatformSelectors;
}

/**
 * Default selector mappings for known platforms
 */
const DEFAULT_SELECTORS: DomainSelectorMap = {
  // Twitter / X
  'twitter.com': SELECTORS.twitter,
  'x.com': SELECTORS.twitter,

  // LinkedIn
  'linkedin.com': SELECTORS.linkedin,
  'www.linkedin.com': SELECTORS.linkedin,

  // Facebook
  'facebook.com': SELECTORS.facebook,
  'www.facebook.com': SELECTORS.facebook,
};

/**
 * Initialize selector storage with default mappings
 * Called on extension install/update
 */
export async function initializeSelectorStorage(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SELECTORS);

    // If selectors already exist, don't overwrite
    if (result[STORAGE_KEYS.SELECTORS]) {
      console.info(`${EXTENSION_NAME}: Selector storage already initialized`);
      return;
    }

    // Initialize with defaults
    await chrome.storage.local.set({ [STORAGE_KEYS.SELECTORS]: DEFAULT_SELECTORS });
    console.info(`${EXTENSION_NAME}: Initialized selector storage with ${Object.keys(DEFAULT_SELECTORS).length} default domains`);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Failed to initialize selector storage:`, error);
    throw error;
  }
}

/**
 * Get all domain-selector mappings
 */
export async function getAllSelectors(): Promise<DomainSelectorMap> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SELECTORS);
    return result[STORAGE_KEYS.SELECTORS] || {};
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Failed to get selectors:`, error);
    return {};
  }
}

/**
 * Get selectors for a specific domain
 * Tries exact match first, then normalized variations
 */
export async function getSelectorsForDomain(domain: string): Promise<PlatformSelectors | null> {
  try {
    const allSelectors = await getAllSelectors();

    // Direct lookup
    if (allSelectors[domain]) {
      console.info(`${EXTENSION_NAME}: Found selectors for domain: ${domain}`);
      return allSelectors[domain];
    }

    // Try normalized domain (remove www prefix)
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
    if (allSelectors[normalizedDomain]) {
      console.info(`${EXTENSION_NAME}: Found selectors for normalized domain: ${normalizedDomain}`);
      return allSelectors[normalizedDomain];
    }

    // Try with www prefix
    const withWww = `www.${normalizedDomain}`;
    if (allSelectors[withWww]) {
      console.info(`${EXTENSION_NAME}: Found selectors for domain with www: ${withWww}`);
      return allSelectors[withWww];
    }

    // Try base domain (remove subdomains)
    const baseDomain = extractBaseDomain(normalizedDomain);
    if (baseDomain !== normalizedDomain && allSelectors[baseDomain]) {
      console.info(`${EXTENSION_NAME}: Found selectors for base domain: ${baseDomain}`);
      return allSelectors[baseDomain];
    }

    console.info(`${EXTENSION_NAME}: No selectors found for domain: ${domain}`);
    return null;
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Failed to get selectors for domain:`, error);
    return null;
  }
}

/**
 * Update selectors for an existing domain
 */
export async function updateDomainSelectors(domain: string, selectors: PlatformSelectors): Promise<void> {
  try {
    const allSelectors = await getAllSelectors();

    if (!allSelectors[domain]) {
      throw new Error(`Domain ${domain} does not exist`);
    }

    allSelectors[domain] = selectors;
    await chrome.storage.local.set({ [STORAGE_KEYS.SELECTORS]: allSelectors });

    console.info(`${EXTENSION_NAME}: Updated selectors for domain: ${domain}`);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Failed to update selectors:`, error);
    throw error;
  }
}

/**
 * Add a new domain with selectors
 */
export async function addDomainSelector(domain: string, selectors: PlatformSelectors): Promise<void> {
  try {
    const allSelectors = await getAllSelectors();

    if (allSelectors[domain]) {
      throw new Error(`Domain ${domain} already exists`);
    }

    allSelectors[domain] = selectors;
    await chrome.storage.local.set({ [STORAGE_KEYS.SELECTORS]: allSelectors });

    console.info(`${EXTENSION_NAME}: Added new domain: ${domain}`);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Failed to add domain:`, error);
    throw error;
  }
}

/**
 * Remove a domain and its selectors
 */
export async function removeDomainSelector(domain: string): Promise<void> {
  try {
    const allSelectors = await getAllSelectors();

    if (!allSelectors[domain]) {
      throw new Error(`Domain ${domain} does not exist`);
    }

    delete allSelectors[domain];
    await chrome.storage.local.set({ [STORAGE_KEYS.SELECTORS]: allSelectors });

    console.info(`${EXTENSION_NAME}: Removed domain: ${domain}`);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Failed to remove domain:`, error);
    throw error;
  }
}

/**
 * Get storage statistics
 */
export async function getSelectorStorageStats(): Promise<{
  totalDomains: number;
  storageEstimateMB: number;
}> {
  try {
    const allSelectors = await getAllSelectors();
    const totalDomains = Object.keys(allSelectors).length;

    // Estimate storage size
    const jsonStr = JSON.stringify(allSelectors);
    const storageEstimateMB = new TextEncoder().encode(jsonStr).length / (1024 * 1024);

    return {
      totalDomains,
      storageEstimateMB: Math.round(storageEstimateMB * 100) / 100,
    };
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Failed to get storage stats:`, error);
    return {
      totalDomains: 0,
      storageEstimateMB: 0,
    };
  }
}

/**
 * Reset selector storage to defaults
 */
export async function resetToDefaults(): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.SELECTORS]: DEFAULT_SELECTORS });
    console.info(`${EXTENSION_NAME}: Reset selector storage to defaults`);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Failed to reset selector storage:`, error);
    throw error;
  }
}

/**
 * Extract base domain from a full domain
 * Examples:
 *   mobile.twitter.com → twitter.com
 *   www.linkedin.com → linkedin.com
 *   subdomain.example.com → example.com
 */
function extractBaseDomain(domain: string): string {
  const parts = domain.split('.');

  // Need at least 2 parts (domain.tld)
  if (parts.length < 2) {
    return domain;
  }

  // Special handling for known TLDs with two parts (co.uk, com.au, etc.)
  const twoPartTlds = ['co.uk', 'com.au', 'co.jp', 'co.in', 'com.br'];
  const lastTwoParts = parts.slice(-2).join('.');

  if (twoPartTlds.includes(lastTwoParts)) {
    // Return domain.co.uk format (3 parts)
    return parts.slice(-3).join('.');
  }

  // Standard TLD - return domain.tld (last 2 parts)
  return parts.slice(-2).join('.');
}
