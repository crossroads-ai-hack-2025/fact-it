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

// DOM elements - cache management
const cacheEntriesSpan = document.getElementById('cache-entries') as HTMLSpanElement;
const cacheStorageSpan = document.getElementById('cache-storage') as HTMLSpanElement;
const cacheAgeSpan = document.getElementById('cache-age') as HTMLSpanElement;
const clearCacheButton = document.getElementById('clear-cache-btn') as HTMLButtonElement;
const cacheFeedback = document.getElementById('cache-feedback') as HTMLDivElement;

// DOM elements - selector management
const selectorDomainsSpan = document.getElementById('selector-domains') as HTMLSpanElement;
const selectorStorageSpan = document.getElementById('selector-storage') as HTMLSpanElement;
const selectorListDiv = document.getElementById('selector-list') as HTMLDivElement;
const addDomainButton = document.getElementById('add-domain-btn') as HTMLButtonElement;
const selectorFeedback = document.getElementById('selector-feedback') as HTMLDivElement;

// Initialize popup
init();

async function init(): Promise<void> {
  // Check service worker status
  await checkServiceWorkerStatus();

  // Load existing settings
  await loadSettings();

  // Load cache stats
  await loadCacheStats();

  // Load selector stats
  await loadSelectorStats();

  // Load and render selectors
  await loadAndRenderSelectors();

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

  // Clear cache button
  clearCacheButton.addEventListener('click', clearCache);

  // Add domain button
  addDomainButton.addEventListener('click', showAddDomainDialog);

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

/**
 * Load cache statistics
 */
async function loadCacheStats(): Promise<void> {
  try {
    chrome.runtime.sendMessage({ type: MessageType.GET_CACHE_STATS }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`${EXTENSION_NAME}: Failed to load cache stats:`, chrome.runtime.lastError);
        return;
      }

      const stats = response.stats as {
        totalEntries: number;
        oldestEntry: number;
        newestEntry: number;
        averageAge: number;
        storageEstimateMB: number;
      };

      // Update UI
      cacheEntriesSpan.textContent = String(stats.totalEntries);
      cacheStorageSpan.textContent = `${stats.storageEstimateMB.toFixed(2)} MB`;

      // Format average age
      if (stats.totalEntries > 0) {
        const avgAgeDays = Math.floor(stats.averageAge / 86400000);
        const avgAgeHours = Math.floor((stats.averageAge % 86400000) / 3600000);
        if (avgAgeDays > 0) {
          cacheAgeSpan.textContent = `${avgAgeDays}d ${avgAgeHours}h`;
        } else {
          cacheAgeSpan.textContent = `${avgAgeHours}h`;
        }
      } else {
        cacheAgeSpan.textContent = 'N/A';
      }

      console.info(`${EXTENSION_NAME}: Cache stats loaded:`, stats);
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error loading cache stats:`, error);
  }
}

/**
 * Clear cache
 */
async function clearCache(): Promise<void> {
  try {
    const confirmClear = confirm('Are you sure you want to clear the fact-check cache? This will remove all cached results.');

    if (!confirmClear) {
      return;
    }

    clearCacheButton.textContent = 'Clearing...';
    clearCacheButton.disabled = true;

    chrome.runtime.sendMessage({ type: MessageType.CLEAR_CACHE }, (response) => {
      clearCacheButton.textContent = 'Clear Cache';
      clearCacheButton.disabled = false;

      if (chrome.runtime.lastError) {
        console.error(`${EXTENSION_NAME}: Failed to clear cache:`, chrome.runtime.lastError);
        showCacheFeedback('Failed to clear cache', 'error');
        return;
      }

      if (response.success) {
        console.info(`${EXTENSION_NAME}: Cache cleared successfully`);
        showCacheFeedback('Cache cleared successfully!', 'success');

        // Reload cache stats
        loadCacheStats();
      } else {
        showCacheFeedback('Failed to clear cache', 'error');
      }
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error clearing cache:`, error);
    showCacheFeedback('Error clearing cache', 'error');
    clearCacheButton.textContent = 'Clear Cache';
    clearCacheButton.disabled = false;
  }
}

/**
 * Show cache feedback message
 */
function showCacheFeedback(message: string, type: 'success' | 'error'): void {
  cacheFeedback.textContent = message;
  cacheFeedback.className = `feedback-message ${type}`;
  cacheFeedback.style.display = 'block';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    cacheFeedback.style.display = 'none';
  }, 5000);
}

/**
 * Load selector storage statistics
 */
async function loadSelectorStats(): Promise<void> {
  try {
    chrome.runtime.sendMessage({ type: MessageType.GET_SELECTOR_STATS }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`${EXTENSION_NAME}: Failed to load selector stats:`, chrome.runtime.lastError);
        return;
      }

      const stats = response.stats as {
        totalDomains: number;
        storageEstimateMB: number;
      };

      // Update UI
      selectorDomainsSpan.textContent = String(stats.totalDomains);
      selectorStorageSpan.textContent = `${stats.storageEstimateMB.toFixed(2)} MB`;

      console.info(`${EXTENSION_NAME}: Selector stats loaded:`, stats);
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error loading selector stats:`, error);
  }
}

/**
 * Load and render all selectors
 */
async function loadAndRenderSelectors(): Promise<void> {
  try {
    chrome.runtime.sendMessage({ type: MessageType.GET_ALL_SELECTORS }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`${EXTENSION_NAME}: Failed to load selectors:`, chrome.runtime.lastError);
        return;
      }

      const selectors = response.selectors as Record<string, {
        postContainer: string;
        textContent: string;
        author?: string;
        timestamp?: string;
      }>;

      renderSelectorList(selectors);
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error loading selectors:`, error);
  }
}

/**
 * Render selector list in UI
 */
function renderSelectorList(selectors: Record<string, unknown>): void {
  selectorListDiv.innerHTML = '';

  const domains = Object.keys(selectors).sort();

  if (domains.length === 0) {
    selectorListDiv.innerHTML = '<p class="help-text">No domains configured yet.</p>';
    return;
  }

  domains.forEach((domain) => {
    const domainDiv = document.createElement('div');
    domainDiv.className = 'selector-item';

    const domainHeader = document.createElement('div');
    domainHeader.className = 'selector-item-header';

    const domainName = document.createElement('strong');
    domainName.textContent = domain;

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'selector-item-buttons';

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.className = 'btn-small';
    editButton.onclick = () => showEditDomainDialog(domain);

    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove';
    removeButton.className = 'btn-small btn-danger';
    removeButton.onclick = () => removeDomain(domain);

    buttonGroup.appendChild(editButton);
    buttonGroup.appendChild(removeButton);

    domainHeader.appendChild(domainName);
    domainHeader.appendChild(buttonGroup);

    domainDiv.appendChild(domainHeader);
    selectorListDiv.appendChild(domainDiv);
  });
}

/**
 * Show add domain dialog
 */
function showAddDomainDialog(): void {
  const domain = prompt('Enter domain name (e.g., example.com):');
  if (!domain) return;

  const postContainer = prompt('Enter CSS selector for post container:');
  if (!postContainer) return;

  const textContent = prompt('Enter CSS selector for text content:');
  if (!textContent) return;

  const selectors = {
    postContainer,
    textContent,
  };

  chrome.runtime.sendMessage(
    {
      type: MessageType.ADD_DOMAIN_SELECTOR,
      payload: { domain, selectors },
    },
    (response) => {
      if (chrome.runtime.lastError || response.error) {
        showSelectorFeedback(`Failed to add domain: ${response.error || chrome.runtime.lastError?.message}`, 'error');
        return;
      }

      showSelectorFeedback(`Domain ${domain} added successfully!`, 'success');
      loadAndRenderSelectors();
      loadSelectorStats();
    }
  );
}

/**
 * Show edit domain dialog
 */
function showEditDomainDialog(domain: string): void {
  const postContainer = prompt(`Edit post container selector for ${domain}:`);
  if (!postContainer) return;

  const textContent = prompt(`Edit text content selector for ${domain}:`);
  if (!textContent) return;

  const selectors = {
    postContainer,
    textContent,
  };

  chrome.runtime.sendMessage(
    {
      type: MessageType.UPDATE_DOMAIN_SELECTOR,
      payload: { domain, selectors },
    },
    (response) => {
      if (chrome.runtime.lastError || response.error) {
        showSelectorFeedback(`Failed to update domain: ${response.error || chrome.runtime.lastError?.message}`, 'error');
        return;
      }

      showSelectorFeedback(`Domain ${domain} updated successfully!`, 'success');
      loadAndRenderSelectors();
    }
  );
}

/**
 * Remove domain
 */
function removeDomain(domain: string): void {
  if (!confirm(`Are you sure you want to remove ${domain}?`)) {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: MessageType.REMOVE_DOMAIN_SELECTOR,
      payload: { domain },
    },
    (response) => {
      if (chrome.runtime.lastError || response.error) {
        showSelectorFeedback(`Failed to remove domain: ${response.error || chrome.runtime.lastError?.message}`, 'error');
        return;
      }

      showSelectorFeedback(`Domain ${domain} removed successfully!`, 'success');
      loadAndRenderSelectors();
      loadSelectorStats();
    }
  );
}

/**
 * Show selector feedback message
 */
function showSelectorFeedback(message: string, type: 'success' | 'error'): void {
  selectorFeedback.textContent = message;
  selectorFeedback.className = `feedback-message ${type}`;
  selectorFeedback.style.display = 'block';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    selectorFeedback.style.display = 'none';
  }, 5000);
}
