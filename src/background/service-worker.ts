/**
 * Background service worker for Fact-It extension
 * Handles API calls, message passing, and background tasks
 */

import {
  Message,
  MessageType,
  CheckClaimMessage,
  ClaimResultMessage,
  STORAGE_KEYS,
} from '@/shared/types';
import { EXTENSION_NAME } from '@/shared/constants';

console.info(`${EXTENSION_NAME}: Service worker loaded`);

// Service worker install event
self.addEventListener('install', (event) => {
  console.info(`${EXTENSION_NAME}: Service worker installed`);
  // Skip waiting to activate immediately
  (event as ExtendableEvent).waitUntil((self as unknown as ServiceWorkerGlobalScope).skipWaiting());
});

// Service worker activate event
self.addEventListener('activate', (event) => {
  console.info(`${EXTENSION_NAME}: Service worker activated`);
  // Claim all clients immediately
  (event as ExtendableEvent).waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).clients.claim()
  );
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
 * TODO: Implement actual AI verification in later phases
 */
async function handleCheckClaim(
  message: CheckClaimMessage,
  sendResponse: (response: ClaimResultMessage) => void
): Promise<void> {
  try {
    const { text, elementId, platform } = message.payload;

    console.info(
      `${EXTENSION_NAME}: Checking claim (${platform}):`,
      text.substring(0, 100) + '...'
    );

    // Simulate API delay for now (replace with actual API calls later)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock response for development
    const result: ClaimResultMessage = {
      type: MessageType.CLAIM_RESULT,
      payload: {
        elementId,
        verdict: 'no_claim',
        confidence: 0,
        explanation:
          'This is a placeholder response. API integration coming in Phase 2.',
        sources: [],
      },
    };

    sendResponse(result);
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error checking claim:`, error);
    sendResponse({
      type: MessageType.CLAIM_RESULT,
      payload: {
        elementId: message.payload.elementId,
        verdict: 'no_claim',
        confidence: 0,
        explanation: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      openaiApiKey: null,
      braveSearchApiKey: null,
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
