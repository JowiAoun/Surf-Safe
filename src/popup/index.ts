import browser from 'webextension-polyfill';
import { MessageType, AnalysisResult } from '@/types';
import { sendToBackground, createMessage } from '@/utils/messaging';

// DOM elements
const loadingEl = document.getElementById('loading')!;
const errorEl = document.getElementById('error')!;
const errorMessageEl = document.getElementById('error-message')!;
const resultsEl = document.getElementById('results')!;
const riskBadgeEl = document.getElementById('risk-badge')!;
const riskLevelEl = document.getElementById('risk-level')!;
const confidenceFillEl = document.getElementById('confidence-fill')!;
const confidenceTextEl = document.getElementById('confidence-text')!;
const threatsListEl = document.getElementById('threats-list')!;
const explanationEl = document.getElementById('explanation')!;
const timestampEl = document.getElementById('timestamp')!;
const reanalyzeBtn = document.getElementById('reanalyze-btn')!;
const configureBtn = document.getElementById('configure-btn')!;
const optionsBtn = document.getElementById('options-btn')!;

/**
 * Display analysis results
 */
function displayResults(result: AnalysisResult): void {
  // Hide loading and error
  loadingEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  resultsEl.classList.remove('hidden');

  // Display risk level
  riskLevelEl.textContent = result.riskLevel;
  riskBadgeEl.className = `risk-badge ${result.riskLevel.toLowerCase()}`;

  // Display confidence
  const confidencePercent = Math.round(result.confidence * 100);
  confidenceFillEl.style.width = `${confidencePercent}%`;
  confidenceTextEl.textContent = `${confidencePercent}%`;

  // Display threats
  if (result.threats && result.threats.length > 0) {
    threatsListEl.innerHTML = result.threats
      .map((threat) => `<span class="threat-tag">${threat.replace(/_/g, ' ')}</span>`)
      .join('');
  } else {
    threatsListEl.innerHTML = '<p class="no-threats">No threats detected</p>';
  }

  // Display explanation
  explanationEl.textContent = result.explanation;

  // Display timestamp
  const date = new Date(result.timestamp);
  timestampEl.textContent = `Analyzed: ${date.toLocaleString()}`;
}

/**
 * Display error message
 */
function displayError(message: string): void {
  loadingEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  errorEl.classList.remove('hidden');
  errorMessageEl.textContent = message;
}

/**
 * Load current analysis
 */
async function loadAnalysis(): Promise<void> {
  try {
    // Show loading
    loadingEl.classList.remove('hidden');
    resultsEl.classList.add('hidden');
    errorEl.classList.add('hidden');

    // Get current analysis from background
    const message = createMessage(MessageType.GET_CURRENT_ANALYSIS);
    const result = await sendToBackground<AnalysisResult | null>(message);

    if (result) {
      displayResults(result);
    } else {
      displayError('No analysis available yet. Please wait for the page to be analyzed.');
    }
  } catch (error) {
    console.error('Failed to load analysis:', error);
    displayError(error instanceof Error ? error.message : 'Failed to load analysis');
  }
}

/**
 * Re-analyze current page
 */
async function reanalyze(): Promise<void> {
  try {
    // Get current tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      throw new Error('No active tab found');
    }

    // Reload the tab to trigger new analysis
    await browser.tabs.reload(tab.id);

    // Close popup (will reopen when user clicks again)
    window.close();
  } catch (error) {
    console.error('Failed to re-analyze:', error);
    displayError('Failed to re-analyze page');
  }
}

/**
 * Open options page
 */
async function openOptions(): Promise<void> {
  await browser.runtime.openOptionsPage();
  window.close();
}

// Event listeners
reanalyzeBtn.addEventListener('click', reanalyze);
configureBtn.addEventListener('click', openOptions);
optionsBtn.addEventListener('click', openOptions);

// Load analysis when popup opens
loadAnalysis();
