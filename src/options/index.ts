import browser from 'webextension-polyfill';
import { ApiConfig, SensitivityLevel, ExtensionSettings, MessageType } from '@/types';
import { getApiConfig, saveApiConfig, getExtensionSettings, saveExtensionSettings } from '@/utils/storage';

// ============================================================================
// DOM Elements
// ============================================================================

const containerEl = document.querySelector('.container') as HTMLElement;
const form = document.getElementById('config-form') as HTMLFormElement;
const apiEndpointInput = document.getElementById('api-endpoint') as HTMLInputElement;
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const modelInput = document.getElementById('model') as HTMLInputElement;
const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility') as HTMLButtonElement;
const apiKeyHintEl = document.getElementById('api-key-hint') as HTMLElement;
const testBtn = document.getElementById('test-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const statusMessageEl = document.getElementById('status-message')!;
const sensitivitySlider = document.getElementById('sensitivity-slider') as HTMLInputElement;
const sensitivityDescriptionEl = document.getElementById('sensitivity-description')!;
const sensitivityLabels = document.querySelectorAll('.sensitivity-label');
const whitelistInput = document.getElementById('whitelist-input') as HTMLInputElement;
const addWhitelistBtn = document.getElementById('add-whitelist-btn')!;
const whitelistTagsEl = document.getElementById('whitelist-tags')!;
const providersToggle = document.getElementById('providers-toggle')!;
const providersContent = document.getElementById('providers-content')!;
const highlightToggle = document.getElementById('highlight-toggle') as HTMLInputElement;
const themeRadios = document.querySelectorAll<HTMLInputElement>('input[name="theme"]');

// ============================================================================
// Constants
// ============================================================================

const SENSITIVITY_DESCRIPTIONS: Record<SensitivityLevel, string> = {
  [SensitivityLevel.LOW]: 'Minimal protection - flags high-confidence threats. Best for experienced users who want minimal interruptions',
  [SensitivityLevel.MEDIUM]: 'Balanced detection - catches most threats while minimizing false positives',
  [SensitivityLevel.HIGH]: 'Maximum protection - flags potential threats more aggressively. May have more false positives',
};

const SENSITIVITY_VALUES: SensitivityLevel[] = [
  SensitivityLevel.LOW,
  SensitivityLevel.MEDIUM,
  SensitivityLevel.HIGH,
  SensitivityLevel.HIGH,
];

let isWhitelistExpanded = false;

// ============================================================================
// API Key Validation
// ============================================================================

/**
 * Validate API key format
 * Returns validation message or null if valid
 */
export function validateApiKeyFormat(key: string): string | null {
  if (!key || key.trim().length === 0) {
    return 'API key is required';
  }
  
  if (key.length < 10) {
    return 'API key seems too short';
  }
  
  // Check for common OpenAI key format
  if (key.startsWith('sk-') && key.length > 20) {
    return null; // Valid OpenAI format
  }
  
  // Accept other formats (for custom providers)
  if (key.length >= 20) {
    return null;
  }
  
  return 'API key format may be invalid';
}

// ============================================================================
// Status Messages
// ============================================================================

function showStatus(message: string, type: 'success' | 'error'): void {
  statusEl.className = `status ${type}`;
  statusMessageEl.textContent = message;
  statusEl.classList.remove('hidden');

  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 5000);
}

// ============================================================================
// Theme Management
// ============================================================================

type ThemePreference = 'system' | 'light' | 'dark';
type AppliedTheme = 'light' | 'dark';

/**
 * Get the currently stored theme preference
 */
async function getThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await browser.storage.local.get('themePreference');
    if (stored.themePreference) {
      return stored.themePreference as ThemePreference;
    }
  } catch {
    // Ignore storage errors
  }
  return 'system'; // Default to system
}

/**
 * Resolve theme preference to actual applied theme
 */
function resolveTheme(preference: ThemePreference): AppliedTheme {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
}

/**
 * Apply the theme to the document
 */
function applyTheme(theme: AppliedTheme): void {
  document.body.setAttribute('data-theme', theme);
  // Also save to localStorage for instant loading (FOIT prevention)
  localStorage.setItem('theme', theme);
}

/**
 * Save and apply a theme preference
 */
async function setThemePreference(preference: ThemePreference): Promise<void> {
  const appliedTheme = resolveTheme(preference);
  applyTheme(appliedTheme);
  
  try {
    await browser.storage.local.set({ themePreference: preference });
  } catch {
    // Ignore storage errors
  }
}

/**
 * Initialize theme radio buttons
 */
async function initThemeUI(): Promise<void> {
  const preference = await getThemePreference();
  
  // Set the correct radio button
  themeRadios.forEach(radio => {
    radio.checked = radio.value === preference;
  });
  
  // Apply theme
  applyTheme(resolveTheme(preference));
  
  // Listen for changes
  themeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        setThemePreference(radio.value as ThemePreference);
      }
    });
  });
  
  // Listen for system theme changes (when 'system' is selected)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    const currentPref = await getThemePreference();
    if (currentPref === 'system') {
      applyTheme(resolveTheme('system'));
    }
  });
}

// ============================================================================
// Sensitivity Management
// ============================================================================

function updateSensitivityUI(level: SensitivityLevel): void {
  const index = SENSITIVITY_VALUES.indexOf(level);
  sensitivitySlider.value = index.toString();
  sensitivityDescriptionEl.textContent = SENSITIVITY_DESCRIPTIONS[level];
  
  sensitivityLabels.forEach((label, i) => {
    label.classList.toggle('active', i === index);
  });
}

async function handleSensitivityChange(): Promise<void> {
  const index = parseInt(sensitivitySlider.value, 10);
  const level = SENSITIVITY_VALUES[index];
  
  updateSensitivityUI(level);
  
  const settings = await getExtensionSettings();
  settings.sensitivity = level;
  await saveExtensionSettings(settings);
}

// ============================================================================
// Highlight Toggle Management
// ============================================================================

async function handleHighlightToggle(): Promise<void> {
  const enabled = highlightToggle.checked;
  
  const settings = await getExtensionSettings();
  settings.highlightSuspiciousText = enabled;
  await saveExtensionSettings(settings);
  
  // Send message to active tab to update highlights
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await browser.tabs.sendMessage(tabs[0].id, {
        type: MessageType.UPDATE_HIGHLIGHTS,
        payload: { enabled }
      });
    }
  } catch (error) {
    // Tab might not have content script, ignore
    console.log('Could not send highlight toggle to tab:', error);
  }
}

// ============================================================================
// Whitelist Management
// ============================================================================

function renderWhitelistTags(domains: string[]): void {
  if (domains.length === 0) {
    whitelistTagsEl.innerHTML = '<p class="empty-whitelist">No websites whitelisted</p>';
    return;
  }
  
  // Sort domains alphabetically (case-insensitive)
  const sortedDomains = [...domains].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  
  // Limit content if not expanded
  const maxItems = 10;
  let displayDomains = sortedDomains;
  const showMore = !isWhitelistExpanded && sortedDomains.length > maxItems;
  
  if (showMore) {
    displayDomains = sortedDomains.slice(0, maxItems);
  }
  
  const tagsHtml = displayDomains
    .map((domain) => `
      <span class="whitelist-tag" data-domain="${domain}">
        ${domain}
        <button class="remove-btn" aria-label="Remove ${domain}">✕</button>
      </span>
    `)
    .join('');
    
  const buttonHtml = showMore
    ? `<button id="show-more-whitelist-btn" class="show-more-btn">+ ${sortedDomains.length - maxItems} More</button>`
    : (isWhitelistExpanded && sortedDomains.length > maxItems)
      ? `<button id="show-less-whitelist-btn" class="show-more-btn">Show Less</button>`
      : '';
      
  whitelistTagsEl.innerHTML = tagsHtml + buttonHtml;
}

async function loadWhitelist(): Promise<void> {
  // Load settings and render tags
  const settings = await getExtensionSettings();
  renderWhitelistTags(settings.whitelistedDomains);
}

const whitelistStatusEl = document.getElementById('whitelist-status')!;
const whitelistStatusMessageEl = whitelistStatusEl.querySelector('p')!;

function showWhitelistStatus(message: string, type: 'success' | 'error'): void {
  whitelistStatusEl.className = `status ${type}`;
  whitelistStatusMessageEl.textContent = message;
  whitelistStatusEl.classList.remove('hidden');

  setTimeout(() => {
    whitelistStatusEl.classList.add('hidden');
  }, 3000);
}

async function addDomainToWhitelist(): Promise<void> {
  const domain = whitelistInput.value.trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/^https?:\/\//, '')
    .split('/')[0];
  
  if (!domain) {
    return;
  }

  // Basic domain validation (must contain a dot and at least 2 chars, or be localhost)
  const isValid = (domain.includes('.') && domain.length > 3) || domain === 'localhost';
  if (!isValid) {
    showWhitelistStatus('Please enter a valid domain (e.g., example.com)', 'error');
    return;
  }
  
  const settings = await getExtensionSettings();
  
  if (settings.whitelistedDomains.includes(domain)) {
    showWhitelistStatus('Domain already in whitelist', 'error');
    return;
  }
  
  settings.whitelistedDomains.push(domain);
  await saveExtensionSettings(settings);
  
  whitelistInput.value = '';
  renderWhitelistTags(settings.whitelistedDomains);
}

async function removeDomainFromWhitelist(domain: string): Promise<void> {
  const settings = await getExtensionSettings();
  settings.whitelistedDomains = settings.whitelistedDomains.filter((d) => d !== domain);
  await saveExtensionSettings(settings);
  renderWhitelistTags(settings.whitelistedDomains);
}

// ============================================================================
// API Configuration
// ============================================================================

async function loadConfig(): Promise<void> {
  try {
    const config = await getApiConfig();
    if (config) {
      apiEndpointInput.value = config.apiEndpoint;
      apiKeyInput.value = config.apiKey;
      modelInput.value = config.model;
    } else {
      apiEndpointInput.value = 'https://api.openai.com/v1/chat/completions';
      modelInput.value = 'gpt-4o-mini';
    }
    
    // Validate and show hint
    updateApiKeyHint();
  } catch (error) {
    console.error('Failed to load config:', error);
    showStatus('Failed to load configuration', 'error');
  }
}

function updateApiKeyHint(): void {
  const validation = validateApiKeyFormat(apiKeyInput.value);
  if (validation && apiKeyInput.value.length > 0) {
    apiKeyHintEl.textContent = `⚠️ ${validation}`;
    apiKeyHintEl.style.color = 'var(--text-error)';
  } else if (apiKeyInput.value.length > 0) {
    apiKeyHintEl.textContent = '✓ API key format looks valid';
    apiKeyHintEl.style.color = 'var(--text-success)';
  } else {
    apiKeyHintEl.textContent = 'Your API key will be stored securely in browser storage';
    apiKeyHintEl.style.color = '';
  }
}

async function saveConfig(event: Event): Promise<void> {
  event.preventDefault();

  try {
    const config: ApiConfig = {
      apiEndpoint: apiEndpointInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      model: modelInput.value.trim(),
    };

    if (!config.apiEndpoint || !config.apiKey || !config.model) {
      showStatus('Please fill in all fields', 'error');
      return;
    }

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

async function testConnection(): Promise<void> {
  try {
    testBtn.disabled = true;
    testBtn.textContent = '⏳ Testing...';

    const config: ApiConfig = {
      apiEndpoint: apiEndpointInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      model: modelInput.value.trim(),
    };

    if (!config.apiEndpoint || !config.apiKey || !config.model) {
      showStatus('Please fill in all fields first', 'error');
      return;
    }

    const startTime = performance.now();
    
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
    
    const latency = Math.round(performance.now() - startTime);

    if (response.ok) {
      showStatus(`✓ Connection successful! (${latency}ms)`, 'success');
    } else {
      const errorText = await response.text();
      showStatus(`Connection failed: ${response.status} ${response.statusText}`, 'error');
      console.error('Test response:', errorText);
    }
  } catch (error) {
    console.error('Connection test error:', error);
    showStatus(
      `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error'
    );
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '🔌 Test Connection';
  }
}

function toggleKeyVisibility(): void {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleKeyVisibilityBtn.textContent = isPassword ? '🙈' : '👁️';
}

function toggleProviders(): void {
  const isExpanded = providersToggle.getAttribute('aria-expanded') === 'true';
  providersToggle.setAttribute('aria-expanded', (!isExpanded).toString());
  providersContent.classList.toggle('collapsed');
}

// ============================================================================
// Event Listeners
// ============================================================================

form.addEventListener('submit', saveConfig);
testBtn.addEventListener('click', testConnection);
toggleKeyVisibilityBtn.addEventListener('click', toggleKeyVisibility);
apiKeyInput.addEventListener('input', updateApiKeyHint);
sensitivitySlider.addEventListener('input', handleSensitivityChange);
highlightToggle.addEventListener('change', handleHighlightToggle);
addWhitelistBtn.addEventListener('click', addDomainToWhitelist);
whitelistInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addDomainToWhitelist();
  }
});
providersToggle.addEventListener('click', toggleProviders);

// Whitelist interactions via event delegation
whitelistTagsEl.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  
  if (target.classList.contains('remove-btn')) {
    const tag = target.closest('.whitelist-tag') as HTMLElement;
    const domain = tag?.dataset.domain;
    if (domain) {
      removeDomainFromWhitelist(domain);
    }
  } else if (target.id === 'show-more-whitelist-btn') {
    isWhitelistExpanded = true;
    loadWhitelist();
  } else if (target.id === 'show-less-whitelist-btn') {
    isWhitelistExpanded = false;
    loadWhitelist();
  }
});

// Sensitivity label clicks
sensitivityLabels.forEach((label, index) => {
  label.addEventListener('click', () => {
    sensitivitySlider.value = index.toString();
    handleSensitivityChange();
  });
});

// ============================================================================
// Initialization
// ============================================================================

async function init(): Promise<void> {
  // Initialize theme UI with radio buttons
  await initThemeUI();
  
  // Load settings
  const settings = await getExtensionSettings();
  updateSensitivityUI(settings.sensitivity);
  renderWhitelistTags(settings.whitelistedDomains);
  highlightToggle.checked = settings.highlightSuspiciousText;
  
  // Load API config
  await loadConfig();
}

init();
