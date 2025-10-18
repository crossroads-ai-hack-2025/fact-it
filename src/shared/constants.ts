/**
 * Shared constants for Fact-It extension
 */

// Extension metadata
export const EXTENSION_NAME = 'Fact-It';
export const EXTENSION_VERSION = '0.1.0';

// Platform selectors
export const SELECTORS = {
  twitter: {
    postContainer: 'article[data-testid="tweet"]',
    textContent: 'div[data-testid="tweetText"]',
    fallback: 'div[lang]',
  },
  linkedin: {
    postContainer: '.feed-shared-update-v2',
    textContent: '.feed-shared-update-v2__description',
    urn: '[data-urn]',
  },
  facebook: {
    postContainer: 'div[role="article"]',
    textContent: 'div[data-testid="post_message"]',
    fallback: 'div[dir="auto"]',
  },
  article: {
    container: 'article, main, [itemprop="articleBody"]',
    textContent: 'p',
  },
} as const;

// MutationObserver configuration
export const OBSERVER_CONFIG = {
  debounceMs: 300, // Delay before processing mutations
  minTextLength: 50, // Minimum text length to consider for checking
} as const;


// UI configuration
export const UI_CONFIG = {
  indicator: {
    size: 32, // pixels
    zIndex: 2147483647, // Maximum z-index
    position: {
      top: 8,
      right: 8,
    },
  },
  colors: {
    true: '#4CAF50',
    false: '#f44336',
    unknown: '#FFC107',
    no_claim: '#9E9E9E',
    loading: '#FFC107',
  },
  icons: {
    true: '✓',
    false: '✗',
    unknown: '?',
    no_claim: '○',
  },
} as const;

// Cache configuration
export const CACHE_CONFIG = {
  maxSize: 1000, // Maximum number of cached claims
  ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
} as const;

// Rate limiting
export const RATE_LIMIT = {
  requestsPerMinute: 500, // OpenAI tier 1 limit
} as const;
