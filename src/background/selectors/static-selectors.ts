/**
 * Static Selector Registry - Predefined selectors for known platforms
 * Used as fallback when dynamic discovery fails or is unavailable
 */

import { PlatformSelectors } from '@/shared/types';
import { SELECTORS } from '@/shared/constants';
import { EXTENSION_NAME } from '@/shared/constants';

/**
 * Domain-to-selector mapping
 * Maps normalized domain names to their static selectors
 */
const STATIC_SELECTOR_REGISTRY: Record<string, PlatformSelectors> = {
  // Twitter / X
  'twitter.com': SELECTORS.twitter,
  'x.com': SELECTORS.twitter,
  'mobile.twitter.com': SELECTORS.twitter,
  'mobile.x.com': SELECTORS.twitter,

  // LinkedIn
  'linkedin.com': SELECTORS.linkedin,
  'www.linkedin.com': SELECTORS.linkedin,
  'mobile.linkedin.com': SELECTORS.linkedin,

  // Facebook
  'facebook.com': SELECTORS.facebook,
  'www.facebook.com': SELECTORS.facebook,
  'm.facebook.com': SELECTORS.facebook,
  'mobile.facebook.com': SELECTORS.facebook,
};

/**
 * Get static selectors for a domain
 * @param domain - Domain name (e.g., "twitter.com", "linkedin.com")
 * @returns Static selectors if available, null otherwise
 */
export function getStaticSelectorsForDomain(domain: string): PlatformSelectors | null {
  // Normalize domain (remove www prefix if present)
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');

  // Direct lookup
  if (STATIC_SELECTOR_REGISTRY[normalizedDomain]) {
    console.info(
      `${EXTENSION_NAME}: Found static selectors for domain: ${domain} (normalized: ${normalizedDomain})`
    );
    return STATIC_SELECTOR_REGISTRY[normalizedDomain];
  }

  // Try with www prefix
  const withWww = `www.${normalizedDomain}`;
  if (STATIC_SELECTOR_REGISTRY[withWww]) {
    console.info(
      `${EXTENSION_NAME}: Found static selectors for domain: ${domain} (with www: ${withWww})`
    );
    return STATIC_SELECTOR_REGISTRY[withWww];
  }

  // Try base domain (remove subdomains)
  const baseDomain = extractBaseDomain(normalizedDomain);
  if (baseDomain !== normalizedDomain && STATIC_SELECTOR_REGISTRY[baseDomain]) {
    console.info(
      `${EXTENSION_NAME}: Found static selectors for domain: ${domain} (base domain: ${baseDomain})`
    );
    return STATIC_SELECTOR_REGISTRY[baseDomain];
  }

  console.info(`${EXTENSION_NAME}: No static selectors found for domain: ${domain}`);
  return null;
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

/**
 * Check if a domain has static selectors available
 */
export function hasStaticSelectors(domain: string): boolean {
  return getStaticSelectorsForDomain(domain) !== null;
}

/**
 * Get all domains with static selectors
 */
export function getAllStaticDomains(): string[] {
  return Object.keys(STATIC_SELECTOR_REGISTRY);
}
