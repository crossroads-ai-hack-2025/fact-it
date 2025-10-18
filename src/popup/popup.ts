/**
 * Popup script for Fact-It extension settings
 * Supports multi-provider configuration
 */

import { MessageType, ExtensionSettings, ProviderSettings } from '@/shared/types';
import { EXTENSION_NAME } from '@/shared/constants';
import { providerRegistry, ProviderId } from '@/background/ai/providers/registry';

console.info(`${EXTENSION_NAME}: Popup loaded`);

// DOM elements - status
const statusIndicator = document.getElementById('status-indicator') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;

// DOM elements - providers
const providers: Record<ProviderId, {
  enabledCheckbox: HTMLInputElement;
  apiKeyInput: HTMLInputElement;
  testButton: HTMLButtonElement;
  statusSpan: HTMLSpanElement;
  configDiv: HTMLDivElement;
}> = {
  openai: {
    enabledCheckbox: document.getElementById('openai-enabled') as HTMLInputElement,
    apiKeyInput: document.getElementById('openai-api-key') as HTMLInputElement,
    testButton: document.getElementById('test-openai') as HTMLButtonElement,
    statusSpan: document.getElementById('openai-status') as HTMLSpanElement,
    configDiv: document.getElementById('openai-config') as HTMLDivElement,
  },
  anthropic: {
    enabledCheckbox: document.getElementById('anthropic-enabled') as HTMLInputElement,
    apiKeyInput: document.getElementById('anthropic-api-key') as HTMLInputElement,
    testButton: document.getElementById('test-anthropic') as HTMLButtonElement,
    statusSpan: document.getElementById('anthropic-status') as HTMLSpanElement,
    configDiv: document.getElementById('anthropic-config') as HTMLDivElement,
  },
  perplexity: {
    enabledCheckbox: document.getElementById('perplexity-enabled') as HTMLInputElement,
    apiKeyInput: document.getElementById('perplexity-api-key') as HTMLInputElement,
    testButton: document.getElementById('test-perplexity') as HTMLButtonElement,
    statusSpan: document.getElementById('perplexity-status') as HTMLSpanElement,
    configDiv: document.getElementById('perplexity-config') as HTMLDivElement,
  },
};

// DOM elements - general settings
const autoCheckInput = document.getElementById('auto-check') as HTMLInputElement;
const confidenceThresholdInput = document.getElementById('confidence-threshold') as HTMLInputElement;
const thresholdValueSpan = document.getElementById('threshold-value') as HTMLSpanElement;
const saveButton = document.getElementById('save-settings') as HTMLButtonElement;
const saveFeedback = document.getElementById('save-feedback') as HTMLDivElement;

// Initialize popup
init();

async function init(): Promise<void> {
  // Check service worker status
  await checkServiceWorkerStatus();

  // Load existing settings
  await loadSettings();

  // Setup event listeners
  setupEventListeners();
}

/**
 * Check if service worker is responsive
 */
async function checkServiceWorkerStatus(): Promise<void> {
  try {
    chrome.runtime.sendMessage({ type: MessageType.PING }, (response) => {
      if (chrome.runtime.lastError) {
        updateStatus('error', 'Service worker not responding');
        console.error(`${EXTENSION_NAME}:`, chrome.runtime.lastError);
        return;
      }

      if (response?.status === 'ok') {
        updateStatus('success', 'Extension is running');
      } else {
        updateStatus('warning', 'Unexpected response from service worker');
      }
    });
  } catch (error) {
    updateStatus('error', 'Failed to connect to service worker');
    console.error(`${EXTENSION_NAME}: Status check failed:`, error);
  }
}

/**
 * Load settings from storage
 */
async function loadSettings(): Promise<void> {
  try {
    chrome.runtime.sendMessage({ type: MessageType.GET_SETTINGS }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`${EXTENSION_NAME}: Failed to load settings:`, chrome.runtime.lastError);
        showFeedback('Failed to load settings', 'error');
        return;
      }

      const settings = response.settings as ExtensionSettings;

      // Populate provider settings
      for (const providerId of Object.keys(providers) as ProviderId[]) {
        const providerSettings = settings.providers[providerId];
        const providerElements = providers[providerId];

        providerElements.enabledCheckbox.checked = providerSettings.enabled ?? false;
        providerElements.apiKeyInput.value = providerSettings.apiKey || '';

        // Show/hide config section based on enabled state
        updateProviderConfigVisibility(providerId);

        // Update status
        updateProviderStatus(providerId, providerSettings);
      }

      // Populate general settings
      autoCheckInput.checked = settings.autoCheckEnabled ?? true;
      confidenceThresholdInput.value = String(settings.confidenceThreshold ?? 70);
      thresholdValueSpan.textContent = String(settings.confidenceThreshold ?? 70);

      console.info(`${EXTENSION_NAME}: Settings loaded`);
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error loading settings:`, error);
    showFeedback('Error loading settings', 'error');
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  // Save button
  saveButton.addEventListener('click', saveSettings);

  // Confidence threshold slider
  confidenceThresholdInput.addEventListener('input', () => {
    thresholdValueSpan.textContent = confidenceThresholdInput.value;
  });

  // Provider-specific event listeners
  for (const providerId of Object.keys(providers) as ProviderId[]) {
    const providerElements = providers[providerId];

    // Toggle config visibility when checkbox changes
    providerElements.enabledCheckbox.addEventListener('change', () => {
      updateProviderConfigVisibility(providerId);
    });

    // Test API key button
    providerElements.testButton.addEventListener('click', () => {
      testProviderApiKey(providerId);
    });
  }
}

/**
 * Update provider config visibility based on enabled state
 */
function updateProviderConfigVisibility(providerId: ProviderId): void {
  const providerElements = providers[providerId];
  const isEnabled = providerElements.enabledCheckbox.checked;

  providerElements.configDiv.style.display = isEnabled ? 'block' : 'none';
}

/**
 * Update provider status indicator
 */
function updateProviderStatus(providerId: ProviderId, settings: ProviderSettings): void {
  const statusSpan = providers[providerId].statusSpan;

  if (!settings.enabled) {
    statusSpan.textContent = '';
    statusSpan.className = 'config-status';
    return;
  }

  if (settings.apiKey) {
    statusSpan.textContent = 'Configured';
    statusSpan.className = 'config-status configured';
  } else {
    statusSpan.textContent = 'Not configured';
    statusSpan.className = 'config-status';
  }
}

/**
 * Test provider API key
 */
async function testProviderApiKey(providerId: ProviderId): Promise<void> {
  const providerElements = providers[providerId];
  const apiKey = providerElements.apiKeyInput.value.trim();

  if (!apiKey) {
    showFeedback(`Please enter ${providerRegistry[providerId].displayName} API key first`, 'error');
    return;
  }

  const testButton = providerElements.testButton;
  const originalText = testButton.textContent;
  testButton.textContent = 'Testing...';
  testButton.disabled = true;

  try {
    const provider = providerRegistry[providerId];
    const result = await provider.testApiKey(apiKey);

    if (result.valid) {
      showFeedback(`${provider.displayName} API key is valid!`, 'success');
      providerElements.statusSpan.textContent = 'Valid';
      providerElements.statusSpan.className = 'config-status configured';
    } else {
      showFeedback(`${provider.displayName} API key is invalid: ${result.error}`, 'error');
      providerElements.statusSpan.textContent = 'Invalid';
      providerElements.statusSpan.className = 'config-status';
    }
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error testing ${providerId} API key:`, error);
    showFeedback(`Failed to test API key: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
  } finally {
    testButton.textContent = originalText;
    testButton.disabled = false;
  }
}

/**
 * Save settings to storage
 */
async function saveSettings(): Promise<void> {
  try {
    // Validate: at least one provider must be enabled and configured
    const enabledProviders = (Object.keys(providers) as ProviderId[]).filter((providerId) => {
      const providerElements = providers[providerId];
      return providerElements.enabledCheckbox.checked && providerElements.apiKeyInput.value.trim();
    });

    if (enabledProviders.length === 0) {
      showFeedback('Please enable and configure at least one AI provider', 'error');
      return;
    }

    // Collect provider settings
    const providerSettings: Record<ProviderId, ProviderSettings> = {} as Record<ProviderId, ProviderSettings>;

    for (const providerId of Object.keys(providers) as ProviderId[]) {
      const providerElements = providers[providerId];
      providerSettings[providerId] = {
        enabled: providerElements.enabledCheckbox.checked,
        apiKey: providerElements.apiKeyInput.value.trim() || null,
      };
    }

    // Collect all settings
    const settings = {
      providers: providerSettings,
      autoCheckEnabled: autoCheckInput.checked,
      confidenceThreshold: parseInt(confidenceThresholdInput.value, 10),
    };

    // Save to storage
    saveButton.textContent = 'Saving...';
    saveButton.disabled = true;

    chrome.runtime.sendMessage(
      {
        type: MessageType.UPDATE_SETTINGS,
        payload: settings,
      },
      (response) => {
        saveButton.textContent = 'Save Settings';
        saveButton.disabled = false;

        if (chrome.runtime.lastError) {
          console.error(`${EXTENSION_NAME}: Failed to save settings:`, chrome.runtime.lastError);
          showFeedback('Failed to save settings', 'error');
          return;
        }

        if (response.success) {
          console.info(`${EXTENSION_NAME}: Settings saved successfully`);
          showFeedback(
            `Settings saved! ${enabledProviders.length} provider(s) enabled: ${enabledProviders.map(id => providerRegistry[id].displayName).join(', ')}`,
            'success'
          );
        } else {
          showFeedback('Failed to save settings', 'error');
        }
      }
    );
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error saving settings:`, error);
    showFeedback('Error saving settings', 'error');
    saveButton.textContent = 'Save Settings';
    saveButton.disabled = false;
  }
}

/**
 * Update status indicator
 */
function updateStatus(type: 'success' | 'warning' | 'error', message: string): void {
  statusIndicator.className = `status-indicator ${type}`;
  statusText.textContent = message;
}

/**
 * Show feedback message
 */
function showFeedback(message: string, type: 'success' | 'error'): void {
  saveFeedback.textContent = message;
  saveFeedback.className = `feedback-message ${type}`;
  saveFeedback.style.display = 'block';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    saveFeedback.style.display = 'none';
  }, 5000);
}
