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
    // LinkedIn frequently tweaks feed markup. We combine resilient selectors that
    // target both legacy and new activity containers so the observer keeps finding posts.
    postContainer: [
      // Explicit activity/ugc containers used across feed variants
      'article[data-urn^="urn:li:activity"]',
      'article[data-urn^="urn:li:ugcPost"]',
      'article[data-urn^="urn:li:share"]',
      'article[data-entity-urn^="urn:li:activity"]',
      'article[data-entity-urn^="urn:li:ugcPost"]',
      'div[data-urn^="urn:li:activity"]',
      'div[data-urn^="urn:li:ugcPost"]',
      'div[data-urn^="urn:li:share"]',
      'div[data-urn^="urn:li:fsd_profilePost"]',
      'div[data-entity-urn^="urn:li:activity"]',
      'div[data-entity-urn^="urn:li:ugcPost"]',
      'div[data-entity-urn^="urn:li:share"]',
      'div[data-id^="urn:li:activity"]',
      'div[data-id^="urn:li:ugcPost"]',
      'div[data-id^="urn:li:share"]',
      'div[data-id^="urn:li:fsd_profilePost"]',
      'section[data-urn^="urn:li:activity"]',
      'section[data-urn^="urn:li:ugcPost"]',
      'section[data-urn^="urn:li:share"]',
      // Feed layout wrappers observed during experiments
      'div[data-view-name^="feed/feed-update"]',
      'div[data-view-name^="feed/updates"]',
      'div[data-test-id="activity-update"]',
      'div[data-test-id="main-feed-activity"]',
      'div.feed-shared-update-v2',
      'div.feed-shared-update-v3',
      'div.feed-shared-update-v4',
      'div.update-components-card',
      'div.feed-update',
      'li.feed-update',
      'li.feed-item',
      // Generic article fallback (LinkedIn now wraps cards in role="article")
      'div[role="article"]',
      'article[role="article"]',
    ].join(', '),
    textContent: [
      // Core text blocks for classic and new layouts
      'div.update-components-text span[dir]',
      'div.update-components-text-core__text span[dir]',
      'div.feed-shared-inline-show-more-text span[dir]',
      'div.feed-shared-inline-show-more-text [dir]',
      'div.feed-shared-update-v2__description span[dir]',
      'div.feed-shared-update-v2__description',
      'div.feed-shared-update-v3__description span[dir]',
      'div.feed-shared-update-v3__description',
      'div.feed-shared-update-v4__description span[dir]',
      'div.feed-shared-update-v4__description',
      'div[data-view-name^="feed/feed-update"] span.break-words',
      'div[data-test-id="main-feed-activity"] span[dir]',
      'div[data-test-id="activity-update"] span[dir]',
      'div[data-entity-urn^="urn:li:activity"] span[dir]',
      'div[data-id^="urn:li"] span[dir]',
      'span[data-test-feed-shared-update-text]',
      'article[role="article"] span[dir]',
      'div[role="article"] span[dir]',
      'span.break-words',
      // Fallbacks for edge layouts (e.g., newsletters, long-form posts)
      'div[role="article"] p[dir]',
      'article[role="article"] p[dir]',
      'div[role="article"] p',
      'article[role="article"] p',
      'span[dir]',
    ].join(', '),
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
