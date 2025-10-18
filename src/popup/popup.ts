/**
 * Popup script for Fact-It extension settings
 */

import { MessageType, ExtensionSettings } from '@/shared/types';
import { EXTENSION_NAME } from '@/shared/constants';

console.info(`${EXTENSION_NAME}: Popup loaded`);

// DOM elements
const statusIndicator = document.getElementById('status-indicator') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const openaiApiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
const autoCheckInput = document.getElementById('auto-check') as HTMLInputElement;
const confidenceThresholdInput = document.getElementById('confidence-threshold') as HTMLInputElement;
const thresholdValueSpan = document.getElementById('threshold-value') as HTMLSpanElement;
const saveButton = document.getElementById('save-settings') as HTMLButtonElement;
const openaiStatusSpan = document.getElementById('openai-status') as HTMLSpanElement;

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
        showNotification('Failed to load settings', 'error');
        return;
      }

      const settings = response.settings as ExtensionSettings;

      // Populate form with existing settings
      if (settings.openaiApiKey) {
        openaiApiKeyInput.value = settings.openaiApiKey;
      }

      autoCheckInput.checked = settings.autoCheckEnabled ?? true;
      confidenceThresholdInput.value = String(settings.confidenceThreshold ?? 70);
      thresholdValueSpan.textContent = String(settings.confidenceThreshold ?? 70);

      console.info(`${EXTENSION_NAME}: Settings loaded`);

      // Update configuration status indicators
      updateConfigurationStatus(settings);
    });
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error loading settings:`, error);
    showNotification('Error loading settings', 'error');
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

  // Enter key to save
  openaiApiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveSettings();
    }
  });
}

/**
 * Save settings to storage
 */
async function saveSettings(): Promise<void> {
  // Disable button during save
  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';

  try {
    const settings = {
      openaiApiKey: openaiApiKeyInput.value.trim() || null,
      autoCheckEnabled: autoCheckInput.checked,
      confidenceThreshold: parseInt(confidenceThresholdInput.value, 10),
    };

    chrome.runtime.sendMessage(
      {
        type: MessageType.UPDATE_SETTINGS,
        payload: settings,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(`${EXTENSION_NAME}: Failed to save settings:`, chrome.runtime.lastError);
          showNotification('Failed to save settings', 'error');
          return;
        }

        if (response.success) {
          console.info(`${EXTENSION_NAME}: Settings saved successfully`);
          showNotification('Settings saved successfully!', 'success');
        } else {
          showNotification('Error saving settings', 'error');
        }
      }
    );
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Error saving settings:`, error);
    showNotification('Error saving settings', 'error');
  } finally {
    // Re-enable button
    saveButton.disabled = false;
    saveButton.textContent = 'Save Settings';
  }
}

/**
 * Update status indicator
 */
function updateStatus(type: 'success' | 'warning' | 'error', message: string): void {
  const colors = {
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336',
  };

  if (statusIndicator) {
    statusIndicator.style.borderLeftColor = colors[type];
  }

  const dot = statusIndicator?.querySelector('.status-dot') as HTMLSpanElement;
  if (dot) {
    dot.style.background = colors[type];
  }

  if (statusText) {
    statusText.textContent = message;
  }
}

/**
 * Show a notification message
 */
function showNotification(message: string, type: 'success' | 'error' = 'success'): void {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Update configuration status indicators based on current settings
 */
function updateConfigurationStatus(settings: ExtensionSettings): void {
  const hasOpenAI = Boolean(settings.openaiApiKey && settings.openaiApiKey.trim());

  // Update OpenAI status badge
  if (hasOpenAI) {
    openaiStatusSpan.textContent = '✓ Configured';
    openaiStatusSpan.className = 'config-status configured';
  } else {
    openaiStatusSpan.textContent = '⚠ Not configured';
    openaiStatusSpan.className = 'config-status not-configured';
  }

  // Update main status indicator
  if (hasOpenAI) {
    updateStatus('success', 'Extension ready - OpenAI API key configured');
  } else {
    updateStatus('warning', 'Configuration needed - add OpenAI API key to start');
  }
}
