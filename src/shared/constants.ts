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
    postContainer:
      'div[role="article"], article[role="article"], div[data-urn^="urn:li:activity"], div[data-id^="urn:li:activity"]',
    textContent:
      'div.update-components-text span[dir], div.feed-shared-update-v2__description, div[role="article"] span.break-words',
    author: 'a.update-components-actor__meta-link',
    timestamp: 'span.update-components-actor__sub-description',
  },
  facebook: {
    postContainer: 'div.x1yztbdb.x1n2onr6.xh8yej3.x1ja2u2z',
    textContent: 'div.xdj266r span[dir="auto"]',
    fallback: 'span.x193iq5w.xeuugli',
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
