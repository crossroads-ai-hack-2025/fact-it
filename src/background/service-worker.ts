/**
 * Background service worker for Fact-It extension
 * Handles API calls, message passing, and background tasks
 */

import {
  Message,
  MessageType,
  CheckClaimMessage,
  ClaimResultMessage,
  DiscoverSelectorsMessage,
  SelectorsDiscoveredMessage,
  ValidationResultMessage,
  STORAGE_KEYS,
  Verdict,
} from '@/shared/types';
import { EXTENSION_NAME } from '@/shared/constants';
import { generateSelectorsWithRetry } from '@/background/selectors/selector-generator';
import {
  getCachedSelectors,
  setCachedSelectors,
  updateValidationTimestamp,
  removeCachedSelectors,
} from '@/background/selectors/selector-cache';
import { getStaticSelectorsForDomain } from '@/background/selectors/static-selectors';
import { orchestrator } from '@/background/ai/orchestrator';

console.info(`${EXTENSION_NAME}: Service worker loaded`);

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener(
  (
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    console.info(`${EXTENSION_NAME}: Received message:`, message.type, sender.tab?.id);

    // Handle different message types
    switch (message.type) {
      case MessageType.PING:
        handlePing(sendResponse);
        return true; // Keep channel open for async response

      case MessageType.CHECK_CLAIM:
        handleCheckClaim(message as CheckClaimMessage, sendResponse);
        return true; // Keep channel open for async response

      case MessageType.GET_SETTINGS:
        handleGetSettings(sendResponse);
        return true; // Keep channel open for async response

      case MessageType.UPDATE_SETTINGS:
        handleUpdateSettings(message, sendResponse);
        return true; // Keep channel open for async response

      case MessageType.DISCOVER_SELECTORS:
        handleDiscoverSelectors(message as DiscoverSelectorsMessage, sendResponse);
        return true; // Keep channel open for async response

      case MessageType.VALIDATION_RESULT:
        handleValidationResult(message as ValidationResultMessage, sendResponse);
        return true; // Keep channel open for async response

      default:
        console.warn(`${EXTENSION_NAME}: Unknown message type:`, (message as Message).type);
        sendResponse({ error: 'Unknown message type' });
        return false;
    }
  }
);

/**
 * Handle ping messages (health check)
 */
function handlePing(sendResponse: (response: unknown) => void): void {
  sendResponse({ status: 'ok', timestamp: Date.now() });
}

/**
 * Handle claim checking requests
 * Multi-provider verification pipeline:
 * - Runs parallel claim detection across all enabled providers
 * - Verifies claims in parallel using provider-specific web search
 * - Aggregates results from multiple sources
 */
async function handleCheckClaim(
  message: CheckClaimMessage,
  sendResponse: (response: ClaimResultMessage) => void
): Promise<void> {
  try {
    const { text, elementId, platform } = message.payload;

    console.info(
      `${EXTENSION_NAME}: Processing claim check (${platform}):`,
      text.substring(0, 100) + '...'
    );

    // Use orchestrator to check claim across all enabled providers
    const result = await orchestrator.checkClaim(text);

    console.info(
      `${EXTENSION_NAME}: Fact-check complete - Verdict: ${result.verdict} (${result.confidence}% confidence, consensus: ${result.consensus.agreeing}/${result.consensus.total})`
    );

    // Map aggregated result to ClaimResultMessage
    sendResponse({
      type: MessageType.CLAIM_RESULT,
      payload: {
        elementId,
        verdict: result.verdict as Verdict,
        confidence: result.confidence,
        explanation: result.explanation,
        sources: result.sources,
        providerResults: result.providerResults.map((pr) => ({
          providerId: pr.providerId,
          providerName: pr.providerName,
          verdict: pr.verdict,
          confidence: pr.confidence,
          explanation: pr.explanation,
        })),
        consensus: result.consensus,
      },
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error in fact-checking pipeline:`, error);

    // Send error response
    sendResponse({
      type: MessageType.CLAIM_RESULT,
      payload: {
        elementId: message.payload.elementId,
        verdict: 'unknown',
        confidence: 0,
        explanation: `Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your provider API keys in settings.`,
        sources: [],
      },
    });
  }
}

/**
 * Get settings from storage
 */
async function handleGetSettings(sendResponse: (response: unknown) => void): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = result[STORAGE_KEYS.SETTINGS] || {
      providers: {
        openai: { enabled: false, apiKey: null },
        anthropic: { enabled: false, apiKey: null },
        perplexity: { enabled: false, apiKey: null },
      },
      autoCheckEnabled: true,
      confidenceThreshold: 70,
    };

    sendResponse({ settings });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error getting settings:`, error);
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Update settings in storage
 */
async function handleUpdateSettings(message: Message, sendResponse: (response: unknown) => void): Promise<void> {
  try {
    const { payload } = message as { payload: Record<string, unknown> };

    // Get current settings
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const currentSettings = result[STORAGE_KEYS.SETTINGS] || {};

    // Merge with new settings
    const updatedSettings = {
      ...currentSettings,
      ...payload,
    };

    // Save to storage
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updatedSettings });

    console.info(`${EXTENSION_NAME}: Settings updated`);
    sendResponse({ success: true, settings: updatedSettings });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error updating settings:`, error);
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Handle selector discovery requests
 * Implements 3-tier fallback: Cache → Dynamic Discovery → Static Fallback
 */
async function handleDiscoverSelectors(
  message: DiscoverSelectorsMessage,
  sendResponse: (response: SelectorsDiscoveredMessage) => void
): Promise<void> {
  const { domain, htmlSample, forceStatic } = message.payload;

  console.info(`${EXTENSION_NAME}: Selector discovery request for domain: ${domain} (forceStatic: ${forceStatic})`);

  try {
    // TIER 3: Static fallback (if forced)
    if (forceStatic) {
      console.info(`${EXTENSION_NAME}: Force static requested, checking static registry...`);
      const staticSelectors = getStaticSelectorsForDomain(domain);

      if (staticSelectors) {
        sendResponse({
          type: MessageType.SELECTORS_DISCOVERED,
          payload: {
            domain,
            selectors: staticSelectors,
            confidence: 85, // Static selectors are reliable but may become outdated
            cached: false,
            source: 'static',
            reasoning: 'Using predefined static selectors for known platform',
          },
        });
        return;
      } else {
        console.warn(`${EXTENSION_NAME}: No static selectors available for ${domain}`);
        // Fall through to return empty selectors
      }
    }

    // TIER 1: Check cache first
    if (!forceStatic) {
      const cachedEntry = await getCachedSelectors(domain);

      if (cachedEntry) {
        console.info(`${EXTENSION_NAME}: Returning cached selectors for ${domain}`);

        sendResponse({
          type: MessageType.SELECTORS_DISCOVERED,
          payload: {
            domain,
            selectors: cachedEntry.selectors,
            confidence: cachedEntry.confidence,
            cached: true,
            source: 'cache',
          },
        });
        return;
      }
    }

    // TIER 2: Dynamic discovery (if HTML sample provided)
    if (!forceStatic && htmlSample) {
      console.info(`${EXTENSION_NAME}: No cache, discovering selectors for ${domain}...`);

      try {
        const result = await generateSelectorsWithRetry(domain, htmlSample);

        // Cache immediately with temporary validation metrics
        // Will be updated when validation result comes back
        await setCachedSelectors(
          domain,
          result.selectors,
          result.confidence,
          {
            postsFound: 0,
            textExtractionRate: 0,
          }
        );

        sendResponse({
          type: MessageType.SELECTORS_DISCOVERED,
          payload: {
            domain,
            selectors: result.selectors,
            confidence: result.confidence,
            cached: false,
            source: 'dynamic',
            reasoning: result.reasoning,
          },
        });
        return;
      } catch (dynamicError) {
        console.error(`${EXTENSION_NAME}: Dynamic discovery failed:`, dynamicError);
        // Fall through to Tier 3 static fallback
      }
    }

    // TIER 3: Static fallback (last resort)
    console.info(`${EXTENSION_NAME}: Attempting static fallback for ${domain}...`);
    const staticSelectors = getStaticSelectorsForDomain(domain);

    if (staticSelectors) {
      console.info(`${EXTENSION_NAME}: Using static fallback selectors for ${domain}`);

      sendResponse({
        type: MessageType.SELECTORS_DISCOVERED,
        payload: {
          domain,
          selectors: staticSelectors,
          confidence: 85,
          cached: false,
          source: 'static',
          reasoning: 'Dynamic discovery failed, using predefined static selectors',
        },
      });
      return;
    }

    // All tiers failed - return empty selectors
    console.error(`${EXTENSION_NAME}: All selector discovery methods failed for ${domain}`);
    sendResponse({
      type: MessageType.SELECTORS_DISCOVERED,
      payload: {
        domain,
        selectors: {
          postContainer: '',
          textContent: '',
        },
        confidence: 0,
        cached: false,
        source: 'static',
      },
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Selector discovery error:`, error);
    sendResponse({
      type: MessageType.SELECTORS_DISCOVERED,
      payload: {
        domain,
        selectors: {
          postContainer: '',
          textContent: '',
        },
        confidence: 0,
        cached: false,
        source: 'static',
      },
    });
  }
}

/**
 * Handle validation results from content script
 */
async function handleValidationResult(
  message: ValidationResultMessage,
  sendResponse: (response: unknown) => void
): Promise<void> {
  const { domain, valid, postsFound, textExtractionRate } = message.payload;

  console.info(
    `${EXTENSION_NAME}: Validation result for ${domain}: ${valid ? 'VALID' : 'INVALID'} (${postsFound} posts, ${Math.round(textExtractionRate * 100)}% text rate)`
  );

  if (valid) {
    // Update validation metrics in cache
    try {
      await updateValidationTimestamp(domain, { postsFound, textExtractionRate });
      console.info(`${EXTENSION_NAME}: Updated validation metrics for ${domain}`);
    } catch (error) {
      console.error(`${EXTENSION_NAME}: Error updating validation metrics:`, error);
    }
  } else {
    // Validation failed - remove from cache
    console.warn(`${EXTENSION_NAME}: Validation failed for ${domain}, removing from cache`);
    try {
      await removeCachedSelectors(domain);
    } catch (error) {
      console.error(`${EXTENSION_NAME}: Error removing failed selectors from cache:`, error);
    }
  }

  sendResponse({ success: true });
}
