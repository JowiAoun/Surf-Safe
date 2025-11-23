import { ApiConfig } from '@/types';
import { getApiConfig, saveApiConfig } from '@/utils/storage';

// DOM elements
const form = document.getElementById('config-form') as HTMLFormElement;
const apiEndpointInput = document.getElementById('api-endpoint') as HTMLInputElement;
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const modelInput = document.getElementById('model') as HTMLInputElement;
const testBtn = document.getElementById('test-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const statusMessageEl = document.getElementById('status-message')!;

/**
 * Show status message
 */
function showStatus(message: string, type: 'success' | 'error'): void {
  statusEl.className = `status ${type}`;
  statusMessageEl.textContent = message;
  statusEl.classList.remove('hidden');

  // Hide after 5 seconds
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 5000);
}

/**
 * Load saved configuration
 */
async function loadConfig(): Promise<void> {
  try {
    const config = await getApiConfig();
    if (config) {
      apiEndpointInput.value = config.apiEndpoint;
      apiKeyInput.value = config.apiKey;
      modelInput.value = config.model;
    } else {
      // Set default values
      apiEndpointInput.value = 'https://api.openai.com/v1/chat/completions';
      modelInput.value = 'gpt-4o-mini';
    }
  } catch (error) {
    console.error('Failed to load config:', error);
    showStatus('Failed to load configuration', 'error');
  }
}

/**
 * Save configuration
 */
async function saveConfig(event: Event): Promise<void> {
  event.preventDefault();

  try {
    const config: ApiConfig = {
      apiEndpoint: apiEndpointInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      model: modelInput.value.trim(),
    };

    // Validate
    if (!config.apiEndpoint || !config.apiKey || !config.model) {
      showStatus('Please fill in all fields', 'error');
      return;
    }

    // Validate URL
    try {
      new URL(config.apiEndpoint);
    } catch {
      showStatus('Invalid API endpoint URL', 'error');
      return;
    }

    await saveApiConfig(config);
    showStatus('Configuration saved successfully!', 'success');
  } catch (error) {
    console.error('Failed to save config:', error);
    showStatus('Failed to save configuration', 'error');
  }
}

/**
 * Test API connection
 */
async function testConnection(): Promise<void> {
  try {
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';

    const config: ApiConfig = {
      apiEndpoint: apiEndpointInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      model: modelInput.value.trim(),
    };

    // Validate
    if (!config.apiEndpoint || !config.apiKey || !config.model) {
      showStatus('Please fill in all fields first', 'error');
      return;
    }

    // Make a simple test request
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: 'Say "test successful" if you can read this.',
          },
        ],
        max_tokens: 10,
      }),
    });

    if (response.ok) {
      showStatus('Connection test successful!', 'success');
    } else {
      const errorText = await response.text();
      showStatus(`Connection test failed: ${response.status} ${response.statusText}`, 'error');
      console.error('Test response:', errorText);
    }
  } catch (error) {
    console.error('Connection test error:', error);
    showStatus(
      `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error'
    );
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
}

// Event listeners
form.addEventListener('submit', saveConfig);
testBtn.addEventListener('click', testConnection);

// Load config on page load
loadConfig();
