/**
 * Universal Content Script for Fact-It
 * Works on ANY platform by discovering selectors dynamically
 */

import {
  MessageType,
  PlatformSelectors,
  DiscoverSelectorsMessage,
  SelectorsDiscoveredMessage,
  CheckClaimMessage,
  ClaimResultMessage,
} from '@/shared/types';
import { EXTENSION_NAME, OBSERVER_CONFIG } from '@/shared/constants';
import { sampleDOM, getCurrentDomain } from '@/content/utils/dom-sampler';
import { validateSelectors } from '@/content/utils/selector-validator';
import { FactCheckIndicator } from '@/content/ui/indicator';

console.info(`${EXTENSION_NAME}: Universal content script loaded`);

// State
let currentSelectors: PlatformSelectors | null = null;
let observer: MutationObserver | null = null;
const processedElements = new WeakSet<Element>();
const currentDomain = getCurrentDomain();
const indicators = new Map<string, FactCheckIndicator>();
let hasTriedStatic = false; // Track if we've already tried static selectors

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Initialize the content script
 */
async function init(): Promise<void> {
  console.info(`${EXTENSION_NAME}: Initializing on domain: ${currentDomain}`);

  // Test connection to service worker
  chrome.runtime.sendMessage({ type: MessageType.PING }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(
        `${EXTENSION_NAME}: Failed to connect to service worker:`,
        chrome.runtime.lastError
      );
      return;
    }
    console.info(`${EXTENSION_NAME}: Connected to service worker:`, response);
  });

  // Wait for page to be more fully loaded
  setTimeout(async () => {
    await initializeSelectors();
  }, 2000);
}

/**
 * Initialize selectors - either from cache or discovery
 */
async function initializeSelectors(): Promise<void> {
  try {
    // Request selectors from background worker
    // Background will check cache or trigger discovery
    const htmlSample = sampleDOM();

    if (!htmlSample) {
      console.warn(`${EXTENSION_NAME}: Could not sample DOM, page may not be supported`);
      return;
    }

    console.info(`${EXTENSION_NAME}: Requesting selector discovery for ${currentDomain}...`);

    const message: DiscoverSelectorsMessage = {
      type: MessageType.DISCOVER_SELECTORS,
      payload: {
        domain: currentDomain,
        htmlSample,
      },
    };

    chrome.runtime.sendMessage(message, (response: SelectorsDiscoveredMessage) => {
      if (chrome.runtime.lastError) {
        console.error(
          `${EXTENSION_NAME}: Selector discovery failed:`,
          chrome.runtime.lastError
        );
        return;
      }

      handleSelectorsDiscovered(response);
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error initializing selectors:`, error);
  }
}

/**
 * Handle selectors received from background worker
 */
function handleSelectorsDiscovered(response: SelectorsDiscoveredMessage): void {
  const { selectors, confidence, cached, source } = response.payload;

  console.info(
    `${EXTENSION_NAME}: Selectors ${cached ? 'loaded from cache' : 'discovered'} - confidence: ${confidence}% (source: ${source})`
  );

  // Validate selectors on the current page
  const validation = validateSelectors(selectors);

  if (!validation.valid) {
    console.error(
      `${EXTENSION_NAME}: Selector validation failed:`,
      validation.errors
    );

    // Inform background that validation failed
    chrome.runtime.sendMessage({
      type: MessageType.VALIDATION_RESULT,
      payload: {
        domain: currentDomain,
        valid: false,
        postsFound: validation.postsFound,
        textExtractionRate: validation.textExtractionRate,
      },
    });

    // Retry with static selectors if we haven't tried them yet
    if (source !== 'static' && !hasTriedStatic) {
      console.info(
        `${EXTENSION_NAME}: Retrying with static fallback selectors...`
      );
      hasTriedStatic = true;

      // Request static selectors
      const message: DiscoverSelectorsMessage = {
        type: MessageType.DISCOVER_SELECTORS,
        payload: {
          domain: currentDomain,
          htmlSample: '', // Not needed for static lookup
          forceStatic: true,
        },
      };

      chrome.runtime.sendMessage(message, (response: SelectorsDiscoveredMessage) => {
        if (chrome.runtime.lastError) {
          console.error(
            `${EXTENSION_NAME}: Static selector request failed:`,
            chrome.runtime.lastError
          );
          return;
        }

        handleSelectorsDiscovered(response);
      });

      return;
    }

    // All attempts failed (including static fallback)
    console.error(
      `${EXTENSION_NAME}: All selector discovery methods failed for ${currentDomain}. Extension will not work on this page.`
    );
    return;
  }

  console.info(
    `${EXTENSION_NAME}: Selectors validated successfully! Found ${validation.postsFound} posts`
  );

  // Inform background that validation succeeded
  chrome.runtime.sendMessage({
    type: MessageType.VALIDATION_RESULT,
    payload: {
      domain: currentDomain,
      valid: true,
      postsFound: validation.postsFound,
      textExtractionRate: validation.textExtractionRate,
    },
  });

  // Store selectors and start observing
  currentSelectors = selectors;
  startObserving(selectors);
}

/**
 * Start observing the page for new posts
 */
function startObserving(selectors: PlatformSelectors): void {
  // Find a container to observe
  // Try main, body, or the parent of existing posts
  const feedContainers = [
    document.querySelector('main'),
    document.querySelector('[role="main"]'),
    document.body,
  ].filter(Boolean);

  const feedContainer = feedContainers[0];

  if (!feedContainer) {
    console.warn(`${EXTENSION_NAME}: Could not find container to observe`);
    return;
  }

  console.info(`${EXTENSION_NAME}: Starting observer on ${feedContainer.tagName}`);

  // Create MutationObserver
  observer = new MutationObserver(handleMutations);

  observer.observe(feedContainer, {
    childList: true,
    subtree: true,
    attributes: false,
  });

  // Process existing posts
  processExistingPosts(selectors);

  console.info(`${EXTENSION_NAME}: Observer started successfully`);
}

/**
 * Process posts already on the page
 */
function processExistingPosts(selectors: PlatformSelectors): void {
  try {
    const posts = document.querySelectorAll(selectors.postContainer);
    console.info(`${EXTENSION_NAME}: Processing ${posts.length} existing posts`);

    posts.forEach((post) => {
      if (!processedElements.has(post)) {
        processPost(post, selectors);
      }
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error processing existing posts:`, error);
  }
}

/**
 * Handle mutations from the MutationObserver
 */
let debounceTimer: number | null = null;

function handleMutations(mutations: MutationRecord[]): void {
  if (!currentSelectors) return;

  // Debounce mutations
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    processMutationBatch(mutations, currentSelectors!);
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

  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node instanceof Element) {
        // Check if this node is a post
        if (node.matches(selectors.postContainer)) {
          newPosts.push(node);
        }

        // Also check children
        const childPosts = node.querySelectorAll(selectors.postContainer);
        childPosts.forEach((post) => newPosts.push(post));
      }
    });
  });

  if (newPosts.length > 0) {
    console.info(`${EXTENSION_NAME}: Detected ${newPosts.length} new posts`);
    newPosts.forEach((post) => processPost(post, selectors));
  }
}

/**
 * Process a single post element
 */
function processPost(postElement: Element, selectors: PlatformSelectors): void {
  // Skip if already processed
  if (processedElements.has(postElement)) {
    return;
  }

  // Mark as processed
  processedElements.add(postElement);

  // Extract text
  const textElement = postElement.querySelector(selectors.textContent);
  if (!textElement) {
    return;
  }

  const text = textElement.textContent?.trim();
  if (!text || text.length < OBSERVER_CONFIG.minTextLength) {
    return;
  }

  // Generate unique ID
  const elementId = generateElementId(postElement);

  // Log detection
  console.info(
    `${EXTENSION_NAME}: 🎯 Detected new post!`,
    '\nID:', elementId,
    '\nText:', text.substring(0, 100) + (text.length > 100 ? '...' : ''),
    '\nLength:', text.length
  );

  // Create and show indicator
  const indicator = new FactCheckIndicator(postElement, elementId);
  indicators.set(elementId, indicator);

  // Send to background for checking
  sendToBackground(text, elementId);
}

/**
 * Generate a unique ID for an element
 */
function generateElementId(element: Element): string {
  // Try to use existing IDs/attributes
  const candidates = [
    element.getAttribute('aria-labelledby'),
    element.getAttribute('id'),
    element.getAttribute('data-testid'),
  ];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  // Fallback: generate from timestamp and random
  return `post-${Date.now()}-${Math.random().toString(36).substring(7)}`;
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
      platform: 'twitter', // TODO: Dynamic platform detection based on domain
    },
  };

  chrome.runtime.sendMessage(message, (response: ClaimResultMessage) => {
    if (chrome.runtime.lastError) {
      console.error(`${EXTENSION_NAME}: Message failed:`, chrome.runtime.lastError);
      return;
    }

    console.info(
      `${EXTENSION_NAME}: Received response for ${elementId}:`,
      `${response.payload.verdict} (${response.payload.confidence}% confidence)`
    );

    // Update indicator with result
    const indicator = indicators.get(elementId);
    if (indicator) {
      indicator.showResult({
        verdict: response.payload.verdict,
        confidence: response.payload.confidence,
        explanation: response.payload.explanation,
        sources: response.payload.sources,
      });
    }
  });
}

