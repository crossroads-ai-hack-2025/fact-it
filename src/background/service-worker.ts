/**
 * Background service worker for Fact-It extension
 * Handles API calls, message passing, and background tasks
 */

import {
  Message,
  MessageType,
  CheckClaimMessage,
  ClaimResultMessage,
  GetDomainSelectorsMessage,
  UpdateDomainSelectorMessage,
  AddDomainSelectorMessage,
  RemoveDomainSelectorMessage,
  STORAGE_KEYS,
  Verdict,
} from '@/shared/types';
import { EXTENSION_NAME } from '@/shared/constants';
import {
  initializeSelectorStorage,
  getAllSelectors,
  getSelectorsForDomain,
  updateDomainSelectors,
  addDomainSelector,
  removeDomainSelector as removeDomainSelectorStorage,
  getSelectorStorageStats,
} from '@/background/selectors/selector-storage';
import { orchestrator } from '@/background/ai/orchestrator';
import { getCacheStats, clearFactCheckCache } from '@/background/cache/fact-check-cache';

console.info(`${EXTENSION_NAME}: Service worker loaded`);

// Initialize selector storage on extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.info(`${EXTENSION_NAME}: Extension ${details.reason}`);

  if (details.reason === 'install' || details.reason === 'update') {
    try {
      await initializeSelectorStorage();
      console.info(`${EXTENSION_NAME}: Selector storage initialized`);
    } catch (error) {
      console.error(`${EXTENSION_NAME}: Failed to initialize selector storage:`, error);
    }
  }
});

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

      case MessageType.GET_DOMAIN_SELECTORS:
        handleGetDomainSelectors(message as GetDomainSelectorsMessage, sendResponse);
        return true; // Keep channel open for async response

      case MessageType.GET_ALL_SELECTORS:
        handleGetAllSelectors(sendResponse);
        return true; // Keep channel open for async response

      case MessageType.UPDATE_DOMAIN_SELECTOR:
        handleUpdateDomainSelector(message as UpdateDomainSelectorMessage, sendResponse);
        return true; // Keep channel open for async response

      case MessageType.ADD_DOMAIN_SELECTOR:
        handleAddDomainSelector(message as AddDomainSelectorMessage, sendResponse);
        return true; // Keep channel open for async response

      case MessageType.REMOVE_DOMAIN_SELECTOR:
        handleRemoveDomainSelector(message as RemoveDomainSelectorMessage, sendResponse);
        return true; // Keep channel open for async response

      case MessageType.GET_SELECTOR_STATS:
        handleGetSelectorStats(sendResponse);
        return true; // Keep channel open for async response

      case MessageType.GET_CACHE_STATS:
        handleGetCacheStats(sendResponse);
        return true; // Keep channel open for async response

      case MessageType.CLEAR_CACHE:
        handleClearCache(sendResponse);
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
 * Handle get domain selectors request
 */
async function handleGetDomainSelectors(
  message: GetDomainSelectorsMessage,
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    const { domain } = message.payload;
    const selectors = await getSelectorsForDomain(domain);
    sendResponse({ selectors });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error getting domain selectors:`, error);
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Handle get all selectors request
 */
async function handleGetAllSelectors(sendResponse: (response: unknown) => void): Promise<void> {
  try {
    const selectors = await getAllSelectors();
    sendResponse({ selectors });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error getting all selectors:`, error);
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Handle update domain selector request
 */
async function handleUpdateDomainSelector(
  message: UpdateDomainSelectorMessage,
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    const { domain, selectors } = message.payload;
    await updateDomainSelectors(domain, selectors);
    sendResponse({ success: true });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error updating domain selector:`, error);
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Handle add domain selector request
 */
async function handleAddDomainSelector(
  message: AddDomainSelectorMessage,
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    const { domain, selectors } = message.payload;
    await addDomainSelector(domain, selectors);
    sendResponse({ success: true });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error adding domain selector:`, error);
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Handle remove domain selector request
 */
async function handleRemoveDomainSelector(
  message: RemoveDomainSelectorMessage,
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    const { domain } = message.payload;
    await removeDomainSelectorStorage(domain);
    sendResponse({ success: true });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error removing domain selector:`, error);
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Handle get selector stats request
 */
async function handleGetSelectorStats(sendResponse: (response: unknown) => void): Promise<void> {
  try {
    const stats = await getSelectorStorageStats();
    sendResponse({ stats });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error getting selector stats:`, error);
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Handle cache stats request
 */
async function handleGetCacheStats(sendResponse: (response: unknown) => void): Promise<void> {
  try {
    const stats = await getCacheStats();
    sendResponse({ stats });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error getting cache stats:`, error);
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Handle clear cache request
 */
async function handleClearCache(sendResponse: (response: unknown) => void): Promise<void> {
  try {
    await clearFactCheckCache();
    sendResponse({ success: true });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error clearing cache:`, error);
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
