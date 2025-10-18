/**
 * Universal Content Script for Fact-It
 * Works on configured platforms using stored selectors
 */

import {
  MessageType,
  PlatformSelectors,
  GetDomainSelectorsMessage,
  CheckClaimMessage,
  ClaimResultMessage,
} from '@/shared/types';
import { EXTENSION_NAME, OBSERVER_CONFIG } from '@/shared/constants';
import { FactCheckIndicator } from '@/content/ui/indicator';

console.info(`${EXTENSION_NAME}: Universal content script loaded`);

// State
let currentSelectors: PlatformSelectors | null = null;
let observer: MutationObserver | null = null;
const processedElements = new WeakSet<Element>();
const currentDomain = window.location.hostname.replace(/^www\./, '');
const indicators = new Map<string, FactCheckIndicator>();
let mutationQueue: MutationRecord[] = []; // Queue for batching mutations
let processingDebounceTimer: number | null = null;

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
 * Initialize selectors from storage
 */
async function initializeSelectors(): Promise<void> {
  try {
    console.info(`${EXTENSION_NAME}: Requesting selectors for ${currentDomain}...`);

    const message: GetDomainSelectorsMessage = {
      type: MessageType.GET_DOMAIN_SELECTORS,
      payload: {
        domain: currentDomain,
      },
    };

    chrome.runtime.sendMessage(message, (response: { selectors: PlatformSelectors | null }) => {
      if (chrome.runtime.lastError) {
        console.error(
          `${EXTENSION_NAME}: Failed to get selectors:`,
          chrome.runtime.lastError
        );
        return;
      }

      if (!response.selectors) {
        console.warn(
          `${EXTENSION_NAME}: No selectors configured for ${currentDomain}. ` +
          `Please add selectors in extension settings.`
        );
        return;
      }

      console.info(`${EXTENSION_NAME}: Selectors loaded for ${currentDomain}`);
      currentSelectors = response.selectors;
      startObserving(response.selectors);
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error initializing selectors:`, error);
  }
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
    attributes: true, // Watch for attribute changes (text might be loaded via attributes)
    attributeFilter: ['class', 'data-urn'], // Only watch relevant attributes
  });

  // Process existing posts
  processExistingPosts(selectors);

  console.info(`${EXTENSION_NAME}: Observer started successfully`);

  // Set up periodic post scanner as a safety net (every 2 seconds)
  // This catches posts that might have been missed during rapid scrolling
  setInterval(() => {
    scanForMissedPosts(selectors);
  }, 2000);
}

/**
 * Periodic scanner to catch posts that may have been missed
 * Acts as a safety net for posts added during rapid scrolling
 */
function scanForMissedPosts(selectors: PlatformSelectors): void {
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
        `${EXTENSION_NAME}: 🔧 Safety net: Found ${unprocessedPosts.length} unprocessed posts`
      );

      unprocessedPosts.forEach((post, index) => {
        processPost(post, selectors, index);
      });
    }
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error in periodic post scanner:`, error);
  }
}

/**
 * Process posts already on the page
 */
function processExistingPosts(selectors: PlatformSelectors): void {
  try {
    const posts = document.querySelectorAll(selectors.postContainer);
    console.info(`${EXTENSION_NAME}: 🔎 Found ${posts.length} existing posts on page load`);

    let processedCount = 0;
    let skippedCount = 0;

    posts.forEach((post, index) => {
      if (!processedElements.has(post)) {
        processPost(post, selectors, index);
        processedCount++;
      } else {
        skippedCount++;
      }
    });

    console.info(
      `${EXTENSION_NAME}: 📊 Initial processing complete - ` +
      `Processed: ${processedCount}, Already processed: ${skippedCount}`
    );
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error processing existing posts:`, error);
  }
}

/**
 * Handle mutations from the MutationObserver
 * Uses a batching queue to avoid dropping mutations during rapid scrolling
 */
function handleMutations(mutations: MutationRecord[]): void {
  if (!currentSelectors) return;

  // Add mutations to queue
  mutationQueue.push(...mutations);

  console.info(
    `${EXTENSION_NAME}: 📝 Mutation batch received (${mutations.length} mutations, ${mutationQueue.length} total queued)`
  );

  // Clear existing timer if any
  if (processingDebounceTimer) {
    clearTimeout(processingDebounceTimer);
  }

  // Set new timer to process the entire queue
  processingDebounceTimer = window.setTimeout(() => {
    const queueSize = mutationQueue.length;
    console.info(`${EXTENSION_NAME}: ⚡ Processing mutation queue (${queueSize} mutations)`);

    // Process all queued mutations
    processMutationBatch(mutationQueue, currentSelectors!);

    // Clear the queue
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
  const newPostsSet = new Set<Element>(); // Prevent duplicates
  let addedNodesCount = 0;
  let attributeChangesCount = 0;

  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        addedNodesCount++;
        if (node instanceof Element) {
          // Check if this node is a post
          if (node.matches(selectors.postContainer)) {
            if (!newPostsSet.has(node)) {
              newPostsSet.add(node);
              newPosts.push(node);
            }
          }

          // Also check children
          const childPosts = node.querySelectorAll(selectors.postContainer);
          childPosts.forEach((post) => {
            if (!newPostsSet.has(post)) {
              newPostsSet.add(post);
              newPosts.push(post);
            }
          });
        }
      });
    } else if (mutation.type === 'attributes') {
      attributeChangesCount++;
      // For attribute changes, check if the target is a post that needs reprocessing
      const target = mutation.target;
      if (target instanceof Element) {
        // Check if it's a post or contains posts
        if (target.matches(selectors.postContainer)) {
          // Only retry if not already processed
          if (!processedElements.has(target)) {
            if (!newPostsSet.has(target)) {
              newPostsSet.add(target);
              newPosts.push(target);
            }
          }
        }
      }
    }
  });

  console.info(
    `${EXTENSION_NAME}: 🔍 Mutation analysis - ` +
    `Added nodes: ${addedNodesCount}, Attribute changes: ${attributeChangesCount}, ` +
    `Posts found: ${newPosts.length}`
  );

  if (newPosts.length > 0) {
    console.info(`${EXTENSION_NAME}: 🎯 Processing ${newPosts.length} posts from mutations`);
    newPosts.forEach((post, index) => {
      processPost(post, selectors, index);
    });
  } else {
    console.info(`${EXTENSION_NAME}: ⚠️ No new posts found in mutation batch`);
  }
}

/**
 * Process a single post element
 */
function processPost(postElement: Element, selectors: PlatformSelectors, debugIndex?: number): void {
  const debugPrefix = debugIndex !== undefined ? `[Post ${debugIndex + 1}]` : '[Post]';

  // Skip if already processed (check FIRST to avoid duplicate processing)
  if (processedElements.has(postElement)) {
    console.info(`${EXTENSION_NAME}: ${debugPrefix} ⏭️ Already processed, skipping`);
    return;
  }

  // Extract text FIRST (before marking as processed)
  const textElement = postElement.querySelector(selectors.textContent);
  if (!textElement) {
    // Text not loaded yet - don't mark as processed, will retry on next mutation
    console.info(
      `${EXTENSION_NAME}: ${debugPrefix} ⏸️ No text element found (selector: "${selectors.textContent}"), will retry`
    );
    return;
  }

  const text = textElement.textContent?.trim();
  if (!text || text.length < OBSERVER_CONFIG.minTextLength) {
    // No meaningful text - don't mark as processed, will retry
    console.info(
      `${EXTENSION_NAME}: ${debugPrefix} ⏸️ Text too short (${text?.length || 0} chars < ${OBSERVER_CONFIG.minTextLength}), will retry`
    );
    return;
  }

  // Mark as processed (only after successful text extraction)
  processedElements.add(postElement);

  // Generate unique ID
  const elementId = generateElementId(postElement);

  // Log detection
  console.info(
    `${EXTENSION_NAME}: ${debugPrefix} ✅ Post detected and queued for fact-checking!`,
    '\n  ID:', elementId,
    '\n  Text preview:', text.substring(0, 100) + (text.length > 100 ? '...' : ''),
    '\n  Text length:', text.length,
    '\n  Element:', postElement.tagName
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
        providerResults: response.payload.providerResults,
        consensus: response.payload.consensus,
      });
    }
  });
}

