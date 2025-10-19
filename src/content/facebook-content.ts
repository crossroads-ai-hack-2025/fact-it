/**
 * Facebook-Specific Content Script
 *
 * Facebook uses dynamic class names that change frequently, making static selectors unreliable.
 * This script:
 * 1. Waits for user to scroll before activating (reduces load on initial page load)
 * 2. Learns/discovers selectors dynamically by analyzing DOM patterns
 * 3. Validates discovered selectors before using them
 * 4. Integrates with the existing auto-check/manual check system
 */

import {
  MessageType,
  PlatformSelectors,
  CheckClaimMessage,
  ClaimResultMessage,
  GetSettingsMessage,
  ExtensionSettings,
  STORAGE_KEYS,
  UpdateDomainSelectorMessage,
} from '@/shared/types';
import { EXTENSION_NAME, OBSERVER_CONFIG } from '@/shared/constants';
import { FactCheckIndicator } from '@/content/ui/indicator';
import { CheckButton } from '@/content/ui/check-button';

console.info(`${EXTENSION_NAME}: Facebook content script loaded`);

// Configuration for Facebook-specific behavior
const FACEBOOK_CONFIG = {
  // Scroll-based activation settings
  minScrollEvents: 2, // Minimum scroll events before activation (reduced from 3)
  scrollTimeWindow: 60000, // Time window to collect scroll events (60 seconds - much more lenient)
  scrollThreshold: 100, // Minimum pixels scrolled per event to count (reduced from 200)

  // Selector discovery settings
  minPostsForLearning: 3, // Minimum posts to find for validation
  maxDiscoveryAttempts: 5, // Maximum attempts to discover selectors
  discoveryRetryDelay: 2000, // Delay between discovery attempts (ms)

  // Confidence thresholds
  minSelectorConfidence: 0.7, // Minimum confidence score to use discovered selector
};

// State
let scrollEventCount = 0;
let scrollStartTime: number | null = null;
let isActivated = false;
let discoveredSelectors: PlatformSelectors | null = null;
let observer: MutationObserver | null = null;
const processedElements = new WeakSet<Element>();
const indicators = new Map<string, FactCheckIndicator | CheckButton>();
let autoCheckEnabled = true;
let mutationQueue: MutationRecord[] = [];
let processingDebounceTimer: number | null = null;

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Initialize the Facebook content script
 */
async function init(): Promise<void> {
  console.info(`${EXTENSION_NAME}: [Facebook] Initializing...`);

  // Test connection to service worker
  chrome.runtime.sendMessage({ type: MessageType.PING }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(
        `${EXTENSION_NAME}: [Facebook] Failed to connect to service worker:`,
        chrome.runtime.lastError
      );
      return;
    }
    console.info(`${EXTENSION_NAME}: [Facebook] Connected to service worker:`, response);
  });

  // Load settings
  await loadSettings();

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEYS.SETTINGS]) {
      const newSettings = changes[STORAGE_KEYS.SETTINGS].newValue as ExtensionSettings;
      handleSettingsChange(newSettings);
    }
  });

  // Set up scroll detection
  setupScrollDetection();

  console.info(
    `${EXTENSION_NAME}: [Facebook] Waiting for user to scroll... ` +
    `(need ${FACEBOOK_CONFIG.minScrollEvents} scroll events within ${FACEBOOK_CONFIG.scrollTimeWindow / 1000}s - very lenient!)`
  );
}

/**
 * Load settings from storage
 */
async function loadSettings(): Promise<void> {
  try {
    const message: GetSettingsMessage = {
      type: MessageType.GET_SETTINGS,
    };

    chrome.runtime.sendMessage(message, (response: { settings: ExtensionSettings }) => {
      if (chrome.runtime.lastError) {
        console.error(
          `${EXTENSION_NAME}: [Facebook] Failed to load settings:`,
          chrome.runtime.lastError
        );
        return;
      }

      if (response.settings) {
        autoCheckEnabled = response.settings.autoCheckEnabled ?? true;
        console.info(
          `${EXTENSION_NAME}: [Facebook] Settings loaded - Auto-check: ${autoCheckEnabled ? 'ON' : 'OFF'}`
        );
      }
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: [Facebook] Error loading settings:`, error);
  }
}

/**
 * Handle settings changes
 */
function handleSettingsChange(newSettings: ExtensionSettings): void {
  const wasAutoCheckEnabled = autoCheckEnabled;
  autoCheckEnabled = newSettings.autoCheckEnabled ?? true;

  console.info(
    `${EXTENSION_NAME}: [Facebook] Settings updated - Auto-check: ${autoCheckEnabled ? 'ON' : 'OFF'}`
  );

  if (!wasAutoCheckEnabled && autoCheckEnabled) {
    console.info(
      `${EXTENSION_NAME}: [Facebook] Auto-check enabled - new posts will be checked automatically`
    );
  }

  if (wasAutoCheckEnabled && !autoCheckEnabled) {
    console.info(
      `${EXTENSION_NAME}: [Facebook] Auto-check disabled - new posts will require manual checking`
    );
  }
}

/**
 * Setup scroll detection to trigger activation
 */
function setupScrollDetection(): void {
  let lastScrollY = window.scrollY;

  const handleScroll = () => {
    // Skip if already activated
    if (isActivated) return;

    // Initialize scroll tracking on first scroll
    if (scrollStartTime === null) {
      scrollStartTime = Date.now();
      console.info(`${EXTENSION_NAME}: [Facebook] User started scrolling, tracking...`);
    }

    // Calculate scroll distance
    const currentScrollY = window.scrollY;
    const scrollDistance = Math.abs(currentScrollY - lastScrollY);
    lastScrollY = currentScrollY;

    // Only count significant scrolls
    if (scrollDistance < FACEBOOK_CONFIG.scrollThreshold) {
      return;
    }

    // Increment scroll count
    scrollEventCount++;
    console.info(
      `${EXTENSION_NAME}: [Facebook] Scroll event ${scrollEventCount}/${FACEBOOK_CONFIG.minScrollEvents} ` +
      `(distance: ${scrollDistance}px)`
    );

    // Check if we're within the time window
    const elapsedTime = Date.now() - scrollStartTime;
    if (elapsedTime > FACEBOOK_CONFIG.scrollTimeWindow) {
      // Reset if too much time has passed
      console.info(
        `${EXTENSION_NAME}: [Facebook] Scroll time window exceeded, resetting counter`
      );
      scrollEventCount = 1;
      scrollStartTime = Date.now();
      return;
    }

    // Check if we've reached the threshold
    if (scrollEventCount >= FACEBOOK_CONFIG.minScrollEvents) {
      console.info(
        `${EXTENSION_NAME}: [Facebook] ✅ Activation threshold reached! Starting selector discovery...`
      );
      window.removeEventListener('scroll', handleScroll);
      activateExtension();
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
}

/**
 * Activate the extension after scroll threshold is met
 */
async function activateExtension(): Promise<void> {
  isActivated = true;
  console.info(`${EXTENSION_NAME}: [Facebook] 🚀 Extension activated!`);

  // Attempt to discover selectors
  const selectors = await discoverSelectors();

  if (!selectors) {
    console.error(
      `${EXTENSION_NAME}: [Facebook] ❌ Failed to discover selectors. Extension will not function on this page.`
    );
    return;
  }

  discoveredSelectors = selectors;
  console.info(
    `${EXTENSION_NAME}: [Facebook] ✅ Selectors discovered and validated:`,
    selectors
  );

  // Save discovered selectors to storage for future use
  await saveDiscoveredSelectors(selectors);

  // Start observing with discovered selectors
  startObserving(selectors);
}

/**
 * Discover Facebook post selectors dynamically
 */
async function discoverSelectors(): Promise<PlatformSelectors | null> {
  console.info(`${EXTENSION_NAME}: [Facebook] 🔍 Starting selector discovery...`);

  for (let attempt = 1; attempt <= FACEBOOK_CONFIG.maxDiscoveryAttempts; attempt++) {
    console.info(
      `${EXTENSION_NAME}: [Facebook] Discovery attempt ${attempt}/${FACEBOOK_CONFIG.maxDiscoveryAttempts}...`
    );

    // Strategy 1: Look for feed story containers with specific attributes
    const candidateSelectors = [
      // Common Facebook post container patterns
      { postContainer: 'div[data-pagelet^="FeedUnit"]', textContent: 'div[dir="auto"]' },
      { postContainer: 'div[role="article"]', textContent: 'div[dir="auto"]' },
      { postContainer: 'div.x1yztbdb', textContent: 'div[dir="auto"] span' },
      { postContainer: 'div[data-ad-preview="message"]', textContent: 'span[dir="auto"]' },

      // Try finding repeating container patterns
      ...findRepeatingContainerPatterns(),
    ];

    // Test each candidate
    for (const candidate of candidateSelectors) {
      const confidence = await validateSelector(candidate);

      if (confidence >= FACEBOOK_CONFIG.minSelectorConfidence) {
        console.info(
          `${EXTENSION_NAME}: [Facebook] ✅ Found valid selector with ${(confidence * 100).toFixed(0)}% confidence:`,
          candidate
        );
        return candidate;
      }
    }

    // Wait before retrying
    if (attempt < FACEBOOK_CONFIG.maxDiscoveryAttempts) {
      console.info(
        `${EXTENSION_NAME}: [Facebook] No valid selectors found, retrying in ${FACEBOOK_CONFIG.discoveryRetryDelay / 1000}s...`
      );
      await new Promise(resolve => setTimeout(resolve, FACEBOOK_CONFIG.discoveryRetryDelay));
    }
  }

  console.error(`${EXTENSION_NAME}: [Facebook] ❌ Failed to discover valid selectors after all attempts`);
  return null;
}

/**
 * Find repeating container patterns in the DOM
 * Posts typically share the same structure and appear multiple times
 */
function findRepeatingContainerPatterns(): PlatformSelectors[] {
  const patterns: PlatformSelectors[] = [];

  // Look for elements that appear multiple times with similar structure
  const allDivs = Array.from(document.querySelectorAll('div[role], div[data-pagelet], div[class]'));

  // Count elements by their tag + role/data attributes
  const patternCounts = new Map<string, { elements: Element[]; selector: string }>();

  for (const div of allDivs) {
    const role = div.getAttribute('role');
    const pagelet = div.getAttribute('data-pagelet');

    // Create a selector pattern
    let selector = 'div';
    if (role) selector += `[role="${role}"]`;
    if (pagelet) {
      // For data-pagelet, use startsWith for dynamic parts
      if (pagelet.startsWith('FeedUnit')) {
        selector += '[data-pagelet^="FeedUnit"]';
      }
    }

    if (!patternCounts.has(selector)) {
      patternCounts.set(selector, { elements: [], selector });
    }
    patternCounts.get(selector)!.elements.push(div);
  }

  // Find patterns that repeat at least 3 times (likely posts)
  for (const [selector, data] of patternCounts) {
    if (data.elements.length >= 3) {
      // Look for text content selectors within these containers
      const textSelectors = ['div[dir="auto"]', 'span[dir="auto"]', 'div[class*="text"]'];

      for (const textSelector of textSelectors) {
        const hasText = data.elements.some(el => {
          const textEl = el.querySelector(textSelector);
          return textEl && textEl.textContent && textEl.textContent.trim().length > 50;
        });

        if (hasText) {
          patterns.push({
            postContainer: selector,
            textContent: textSelector,
          });
        }
      }
    }
  }

  console.info(
    `${EXTENSION_NAME}: [Facebook] Found ${patterns.length} potential repeating patterns`
  );

  return patterns;
}

/**
 * Validate a selector by testing it against the current page
 * Returns a confidence score (0-1)
 */
async function validateSelector(selector: PlatformSelectors): Promise<number> {
  try {
    // Find all posts using the container selector
    const posts = document.querySelectorAll(selector.postContainer);

    if (posts.length < FACEBOOK_CONFIG.minPostsForLearning) {
      return 0; // Not enough posts found
    }

    let validPosts = 0;
    let totalTextLength = 0;

    // Test each post
    for (const post of Array.from(posts).slice(0, 10)) { // Test max 10 posts
      const textElement = post.querySelector(selector.textContent);

      if (textElement) {
        const text = textElement.textContent?.trim();
        if (text && text.length >= OBSERVER_CONFIG.minTextLength) {
          validPosts++;
          totalTextLength += text.length;
        }
      }
    }

    // Calculate confidence based on:
    // - Percentage of posts with valid text
    // - Average text length (posts should have substantial text)
    const validPostRatio = validPosts / Math.min(posts.length, 10);
    const avgTextLength = validPosts > 0 ? totalTextLength / validPosts : 0;
    const textLengthScore = Math.min(avgTextLength / 500, 1); // 500 chars = perfect score

    const confidence = (validPostRatio * 0.7) + (textLengthScore * 0.3);

    console.info(
      `${EXTENSION_NAME}: [Facebook] Validation: ` +
      `${validPosts}/${posts.length} valid posts, ` +
      `avg text: ${avgTextLength.toFixed(0)} chars, ` +
      `confidence: ${(confidence * 100).toFixed(0)}%`
    );

    return confidence;
  } catch (error) {
    console.error(`${EXTENSION_NAME}: [Facebook] Error validating selector:`, error);
    return 0;
  }
}

/**
 * Save discovered selectors to storage for future use
 */
async function saveDiscoveredSelectors(selectors: PlatformSelectors): Promise<void> {
  try {
    const message: UpdateDomainSelectorMessage = {
      type: MessageType.UPDATE_DOMAIN_SELECTOR,
      payload: {
        domain: 'facebook.com',
        selectors: selectors,
      },
    };

    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        console.error(
          `${EXTENSION_NAME}: [Facebook] Failed to save selectors:`,
          chrome.runtime.lastError
        );
        return;
      }
      console.info(`${EXTENSION_NAME}: [Facebook] ✅ Selectors saved to storage`);
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: [Facebook] Error saving selectors:`, error);
  }
}

/**
 * Start observing the page for new posts
 */
function startObserving(selectors: PlatformSelectors): void {
  const feedContainer = document.querySelector('div[role="feed"], div[role="main"], body');

  if (!feedContainer) {
    console.warn(`${EXTENSION_NAME}: [Facebook] Could not find container to observe`);
    return;
  }

  console.info(`${EXTENSION_NAME}: [Facebook] Starting observer on ${feedContainer.tagName}`);

  // Create MutationObserver
  observer = new MutationObserver(handleMutations);

  observer.observe(feedContainer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-pagelet'],
  });

  // Process existing posts
  processExistingPosts(selectors);

  console.info(`${EXTENSION_NAME}: [Facebook] Observer started successfully`);

  // Set up periodic scanner as safety net
  setInterval(() => {
    scanForMissedPosts(selectors);
  }, 2000);
}

/**
 * Process existing posts on the page
 */
function processExistingPosts(selectors: PlatformSelectors): void {
  try {
    const posts = document.querySelectorAll(selectors.postContainer);
    console.info(`${EXTENSION_NAME}: [Facebook] 🔎 Found ${posts.length} existing posts`);

    let processedCount = 0;

    posts.forEach((post, index) => {
      if (!processedElements.has(post)) {
        processPost(post, selectors, index);
        processedCount++;
      }
    });

    console.info(`${EXTENSION_NAME}: [Facebook] 📊 Processed ${processedCount} posts`);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: [Facebook] Error processing existing posts:`, error);
  }
}

/**
 * Periodic scanner to catch missed posts
 */
function scanForMissedPosts(selectors: PlatformSelectors): void {
  if (!isActivated || !discoveredSelectors) return;

  try {
    const allPosts = document.querySelectorAll(selectors.postContainer);
    const unprocessedPosts: Element[] = [];

    allPosts.forEach((post) => {
      if (!processedElements.has(post)) {
        unprocessedPosts.push(post);
      }
    });

    if (unprocessedPosts.length > 0) {
      console.info(
        `${EXTENSION_NAME}: [Facebook] 🔧 Safety net: Found ${unprocessedPosts.length} unprocessed posts`
      );
      unprocessedPosts.forEach((post, index) => {
        processPost(post, selectors, index);
      });
    }
  } catch (error) {
    console.error(`${EXTENSION_NAME}: [Facebook] Error in periodic scanner:`, error);
  }
}

/**
 * Handle mutations from the MutationObserver
 */
function handleMutations(mutations: MutationRecord[]): void {
  if (!discoveredSelectors) return;

  // Add mutations to queue
  mutationQueue.push(...mutations);

  // Clear existing timer
  if (processingDebounceTimer) {
    clearTimeout(processingDebounceTimer);
  }

  // Set new timer to process the entire queue
  processingDebounceTimer = window.setTimeout(() => {
    processMutationBatch(mutationQueue, discoveredSelectors!);
    mutationQueue = [];
    processingDebounceTimer = null;
  }, OBSERVER_CONFIG.debounceMs);
}

/**
 * Process a batch of mutations
 */
function processMutationBatch(
  mutations: MutationRecord[],
  selectors: PlatformSelectors
): void {
  const newPosts: Element[] = [];
  const newPostsSet = new Set<Element>();

  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          if (node.matches(selectors.postContainer)) {
            if (!newPostsSet.has(node)) {
              newPostsSet.add(node);
              newPosts.push(node);
            }
          }

          const childPosts = node.querySelectorAll(selectors.postContainer);
          childPosts.forEach((post) => {
            if (!newPostsSet.has(post)) {
              newPostsSet.add(post);
              newPosts.push(post);
            }
          });
        }
      });
    }
  });

  if (newPosts.length > 0) {
    console.info(`${EXTENSION_NAME}: [Facebook] 🎯 Processing ${newPosts.length} new posts`);
    newPosts.forEach((post, index) => {
      processPost(post, selectors, index);
    });
  }
}

/**
 * Process a single post element
 */
function processPost(
  postElement: Element,
  selectors: PlatformSelectors,
  debugIndex?: number
): void {
  const debugPrefix = debugIndex !== undefined ? `[Post ${debugIndex + 1}]` : '[Post]';

  // Skip if already processed
  if (processedElements.has(postElement)) {
    return;
  }

  // Extract text
  const textElement = postElement.querySelector(selectors.textContent);
  if (!textElement) {
    return;
  }

  const text = textElement.textContent?.trim();
  if (!text || text.length < OBSERVER_CONFIG.minTextLength) {
    return;
  }

  // Mark as processed
  processedElements.add(postElement);

  // Generate unique ID
  const elementId = generateElementId(postElement);

  console.info(
    `${EXTENSION_NAME}: [Facebook] ${debugPrefix} ✅ Post detected!`,
    '\n  ID:', elementId,
    '\n  Text preview:', text.substring(0, 100) + (text.length > 100 ? '...' : ''),
    '\n  Auto-check:', autoCheckEnabled ? 'ON' : 'OFF'
  );

  if (autoCheckEnabled) {
    // Auto-check mode: Create indicator and start checking
    const indicator = new FactCheckIndicator(postElement, elementId);
    indicators.set(elementId, indicator);
    sendToBackground(text, elementId);
  } else {
    // Manual mode: Create check button
    const button = new CheckButton(postElement, elementId);
    button.onCheck(() => {
      sendToBackground(text, elementId);
    });
    indicators.set(elementId, button);
  }
}

/**
 * Generate a unique ID for an element
 */
function generateElementId(element: Element): string {
  const candidates = [
    element.getAttribute('data-pagelet'),
    element.getAttribute('id'),
    element.getAttribute('aria-labelledby'),
  ];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  return `facebook-post-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Send post text to background worker for fact-checking
 */
function sendToBackground(text: string, elementId: string): void {
  const message: CheckClaimMessage = {
    type: MessageType.CHECK_CLAIM,
    payload: {
      text,
      elementId,
      platform: 'facebook',
    },
  };

  chrome.runtime.sendMessage(message, (response: ClaimResultMessage) => {
    if (chrome.runtime.lastError) {
      console.error(`${EXTENSION_NAME}: [Facebook] Message failed:`, chrome.runtime.lastError);
      return;
    }

    console.info(
      `${EXTENSION_NAME}: [Facebook] Received response for ${elementId}:`,
      `${response.payload.verdict} (${response.payload.confidence}% confidence)`
    );

    // Get the current indicator
    const currentIndicator = indicators.get(elementId);
    if (!currentIndicator) {
      console.warn(`${EXTENSION_NAME}: [Facebook] No indicator found for ${elementId}`);
      return;
    }

    // If it's a CheckButton, replace with FactCheckIndicator
    if (currentIndicator instanceof CheckButton) {
      const parentElement = currentIndicator.parentElement;
      currentIndicator.remove();

      const indicator = new FactCheckIndicator(parentElement, elementId);
      indicators.set(elementId, indicator);

      indicator.showResult({
        verdict: response.payload.verdict,
        confidence: response.payload.confidence,
        explanation: response.payload.explanation,
        sources: response.payload.sources,
        providerResults: response.payload.providerResults,
        consensus: response.payload.consensus,
      });
    } else {
      // Already a FactCheckIndicator
      currentIndicator.showResult({
        verdict: response.payload.verdict,
        confidence: response.payload.confidence,
        explanation: response.payload.explanation,
        sources: response.payload.sources,
        providerResults: response.payload.providerResults,
        consensus: response.payload.consensus,
      });
    }
  });
}
