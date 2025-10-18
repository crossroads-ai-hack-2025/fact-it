/**
 * Content script for Twitter/X
 * Monitors the page for new tweets and sends them for fact-checking
 */

import { MessageType, CheckClaimMessage, ClaimResultMessage } from '@/shared/types';
import { EXTENSION_NAME, SELECTORS, OBSERVER_CONFIG } from '@/shared/constants';

console.info(`${EXTENSION_NAME}: Twitter content script loaded`);

// Keep track of processed tweets to avoid duplicates
const processedTweets = new WeakSet<Element>();

// Initialize the observer when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Initialize the content script
 */
function init(): void {
  console.info(`${EXTENSION_NAME}: Initializing Twitter observer...`);

  // Test connection to service worker
  chrome.runtime.sendMessage({ type: MessageType.PING }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(`${EXTENSION_NAME}: Failed to connect to service worker:`, chrome.runtime.lastError);
      return;
    }
    console.info(`${EXTENSION_NAME}: Connected to service worker:`, response);
  });

  // Wait a bit for Twitter to load its feed
  setTimeout(() => {
    startObserving();
  }, 2000);
}

/**
 * Start observing the Twitter feed for new tweets
 */
function startObserving(): void {
  // Find the main timeline container
  // Twitter's feed structure: the main element or primary column
  const feedContainer = document.querySelector('main[role="main"]');

  if (!feedContainer) {
    console.warn(`${EXTENSION_NAME}: Could not find Twitter feed container, retrying...`);
    setTimeout(startObserving, 2000);
    return;
  }

  console.info(`${EXTENSION_NAME}: Found feed container, starting observer`);

  // Create a MutationObserver to detect new tweets
  const observer = new MutationObserver(handleMutations);

  // Observe the feed for new tweets
  observer.observe(feedContainer, {
    childList: true,
    subtree: true,
    attributes: false, // Don't observe attribute changes (performance)
  });

  // Also process existing tweets on the page
  processExistingTweets(feedContainer);

  console.info(`${EXTENSION_NAME}: Observer started successfully`);
}

/**
 * Process existing tweets already on the page
 */
function processExistingTweets(container: Element): void {
  console.info(`${EXTENSION_NAME}: Looking for tweets with selector: ${SELECTORS.twitter.postContainer}`);

  const tweets = container.querySelectorAll(SELECTORS.twitter.postContainer);
  console.info(`${EXTENSION_NAME}: Processing ${tweets.length} existing tweets`);

  // Debug: try alternative selectors if no tweets found
  if (tweets.length === 0) {
    console.warn(`${EXTENSION_NAME}: No tweets found with primary selector, trying alternatives...`);
    const altSelectors = [
      'article[role="article"]',
      'article',
      'div[data-testid="tweet"]',
      '[data-testid="cellInnerDiv"]',
    ];

    altSelectors.forEach(sel => {
      const found = container.querySelectorAll(sel);
      console.info(`${EXTENSION_NAME}:   "${sel}" found ${found.length} elements`);
    });
  }

  tweets.forEach((tweet) => {
    if (!processedTweets.has(tweet)) {
      processTweet(tweet);
    }
  });
}

/**
 * Handle mutations from the MutationObserver
 */
let debounceTimer: number | null = null;

function handleMutations(mutations: MutationRecord[]): void {
  // Debounce mutations to avoid processing too frequently
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    processMutationBatch(mutations);
  }, OBSERVER_CONFIG.debounceMs);
}

/**
 * Process a batch of mutations
 */
function processMutationBatch(mutations: MutationRecord[]): void {
  const newTweets: Element[] = [];

  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node instanceof Element) {
        // Check if this node is a tweet container
        if (node.matches(SELECTORS.twitter.postContainer)) {
          newTweets.push(node);
        }

        // Also check children (in case a parent container was added)
        const childTweets = node.querySelectorAll(SELECTORS.twitter.postContainer);
        childTweets.forEach((tweet) => newTweets.push(tweet));
      }
    });
  });

  if (newTweets.length > 0) {
    console.info(`${EXTENSION_NAME}: Detected ${newTweets.length} new tweets`);
    newTweets.forEach((tweet) => processTweet(tweet));
  }
}

/**
 * Process a single tweet element
 */
function processTweet(tweetElement: Element): void {
  // Skip if already processed
  if (processedTweets.has(tweetElement)) {
    return;
  }

  // Mark as processed
  processedTweets.add(tweetElement);

  // Extract tweet text
  const textElement = tweetElement.querySelector(SELECTORS.twitter.textContent);
  if (!textElement) {
    return;
  }

  const text = textElement.textContent?.trim();
  if (!text || text.length < OBSERVER_CONFIG.minTextLength) {
    return;
  }

  // Generate a unique ID for this tweet (for tracking)
  const elementId = generateElementId(tweetElement);

  // Log detection (this is the "Hello World" part!)
  console.info(
    `${EXTENSION_NAME}: 🎯 Detected new tweet!`,
    '\nID:', elementId,
    '\nText:', text.substring(0, 100) + (text.length > 100 ? '...' : ''),
    '\nLength:', text.length
  );

  // Send to background worker for checking (placeholder for now)
  sendToBackground(text, elementId);

  // Add a visual indicator that we detected the tweet
  addDebugIndicator(tweetElement, elementId);
}

/**
 * Generate a unique ID for an element
 */
function generateElementId(element: Element): string {
  // Use data-testid or generate from position
  const testId = element.getAttribute('aria-labelledby');
  if (testId) {
    return testId;
  }

  // Fallback: generate from timestamp and random
  return `tweet-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Send tweet text to background worker for fact-checking
 */
function sendToBackground(text: string, elementId: string): void {
  const message: CheckClaimMessage = {
    type: MessageType.CHECK_CLAIM,
    payload: {
      text,
      elementId,
      platform: 'twitter',
    },
  };

  chrome.runtime.sendMessage(message, (response: ClaimResultMessage) => {
    if (chrome.runtime.lastError) {
      console.error(`${EXTENSION_NAME}: Message failed:`, chrome.runtime.lastError);
      return;
    }

    console.info(`${EXTENSION_NAME}: Received response for ${elementId}:`, response.payload.verdict);
  });
}

/**
 * Add a visual debug indicator to show we detected the tweet
 * This helps during development to see that the observer is working
 */
function addDebugIndicator(tweetElement: Element, elementId: string): void {
  // Only add in development (you can toggle this)
  const debugMode = true; // Set to false to disable

  if (!debugMode) {
    return;
  }

  const indicator = document.createElement('div');
  indicator.id = `fact-it-debug-${elementId}`;
  indicator.textContent = '👁️';
  indicator.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 16px;
    background: #4CAF50;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    cursor: pointer;
    opacity: 0.7;
  `;

  indicator.title = 'Fact-It detected this tweet';

  // Make tweet container relatively positioned if it isn't
  if (window.getComputedStyle(tweetElement).position === 'static') {
    (tweetElement as HTMLElement).style.position = 'relative';
  }

  tweetElement.appendChild(indicator);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    indicator.remove();
  }, 3000);
}
