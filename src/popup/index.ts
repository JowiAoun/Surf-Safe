import browser from 'webextension-polyfill';
import { MessageType, AnalysisResult, RiskLevel, ThreatLabel, FeedbackType, UserFeedback } from '@/types';
import { sendToBackground, createMessage } from '@/utils/messaging';
import { saveUserFeedback, generateExportReport, getApiConfig } from '@/utils/storage';

// ============================================================================
// DOM Elements
// ============================================================================

const containerEl = document.querySelector('.container') as HTMLElement;
const loadingEl = document.getElementById('loading')!;
const errorEl = document.getElementById('error')!;
const errorMessageEl = document.getElementById('error-message')!;
const errorHintEl = document.getElementById('error-hint')!;
const resultsEl = document.getElementById('results')!;
const riskBadgeEl = document.getElementById('risk-badge')!;
const riskLevelEl = document.getElementById('risk-level')!;
const threatsListEl = document.getElementById('threats-list')!;
const explanationEl = document.getElementById('explanation')!;
const timestampEl = document.getElementById('timestamp')!;
const reanalyzeBtn = document.getElementById('reanalyze-btn')!;
const configureBtn = document.getElementById('configure-btn')!;
const optionsBtn = document.getElementById('options-btn')!;
const themeToggleBtn = document.getElementById('theme-toggle')!;
const themeIconEl = themeToggleBtn.querySelector('.theme-icon')!;
const detailsToggleBtn = document.getElementById('details-toggle')!;
const detailsContentEl = document.getElementById('details-content')!;
const gaugeFillEl = document.getElementById('gauge-fill')!;
const safetyScoreEl = document.getElementById('safety-score')!;
const domainDisplayEl = document.getElementById('current-domain')!;

// Feedback UI elements
const feedbackAccurateBtn = document.getElementById('feedback-accurate') as HTMLButtonElement;
const feedbackReportBtn = document.getElementById('feedback-report') as HTMLButtonElement;
const feedbackStatusEl = document.getElementById('feedback-status')!;
const feedbackModal = document.getElementById('feedback-modal')!;
const feedbackCancelBtn = document.getElementById('feedback-cancel')!;
const feedbackSubmitBtn = document.getElementById('feedback-submit')!;
const feedbackCommentEl = document.getElementById('feedback-comment') as HTMLTextAreaElement;
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const seeWarningsBtn = document.getElementById('see-warnings-btn') as HTMLButtonElement;

// Store current analysis for feedback
let currentAnalysis: AnalysisResult | null = null;
let currentUrl = '';
let currentDomain = '';

// ============================================================================
// Threat Icons Mapping
// ============================================================================

const THREAT_ICONS: Record<ThreatLabel, string> = {
  [ThreatLabel.URGENCY]: '⏰',
  [ThreatLabel.PRESSURE]: '😰',
  [ThreatLabel.TOO_GOOD]: '🎁',
  [ThreatLabel.POOR_GRAMMAR]: '📝',
  [ThreatLabel.SENSITIVE_DATA]: '🔐',
  [ThreatLabel.FAKE_TRUST]: '🏅',
  [ThreatLabel.SUSPICIOUS_LINK]: '🔗',
  [ThreatLabel.IMPERSONATION]: '🎭',
  [ThreatLabel.SUSPICIOUS_DOMAIN]: '🌐',
};

// ============================================================================
// Safety Score Calculation
// ============================================================================

/**
 * Risk level weights for score calculation
 */
const RISK_WEIGHTS: Record<RiskLevel, number> = {
  [RiskLevel.SAFE]: 100,
  [RiskLevel.LOW]: 75,
  [RiskLevel.MEDIUM]: 50,
  [RiskLevel.HIGH]: 25,
  [RiskLevel.CRITICAL]: 5,
};

/**
 * Calculate safety score (0-100) based on risk level, threats, and confidence
 * Higher score = safer website
 */
export function calculateSafetyScore(result: AnalysisResult): number {
  const baseScore = RISK_WEIGHTS[result.riskLevel] ?? 50;
  
  // Adjust based on number of threats (each threat reduces score)
  const threatPenalty = Math.min(result.threats.length * 5, 30);
  
  // Weight by confidence (low confidence = move towards neutral 50)
  const confidenceWeight = result.confidence;
  const adjustedScore = baseScore - threatPenalty;
  const weightedScore = adjustedScore * confidenceWeight + 50 * (1 - confidenceWeight);
  
  return Math.round(Math.max(0, Math.min(100, weightedScore)));
}

/**
 * Get gauge color class based on safety score
 */
export function getScoreColorClass(score: number): string {
  if (score >= 80) return 'safe';
  if (score >= 60) return 'low';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'high';
  return 'critical';
}

// ============================================================================
// Theme Management
// ============================================================================

type Theme = 'light' | 'dark';

/**
 * Get current theme from storage or system preference
 */
async function getCurrentTheme(): Promise<Theme> {
  try {
    const stored = await browser.storage.local.get('theme');
    if (stored.theme) {
      return stored.theme as Theme;
    }
  } catch {
    // Ignore storage errors
  }
  
  // Default to system preference
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Apply theme to the UI
 */
function applyTheme(theme: Theme): void {
  document.body.setAttribute('data-theme', theme);
  themeIconEl.textContent = theme === 'dark' ? '☀️' : '🌙';
}

/**
 * Toggle theme and persist
 */
async function toggleTheme(): Promise<void> {
  const currentTheme = document.body.getAttribute('data-theme') as Theme || 'light';
  const newTheme: Theme = currentTheme === 'dark' ? 'light' : 'dark';
  
  applyTheme(newTheme);
  
  // Save to local storage for immediate load (FOIT prevention)
  localStorage.setItem('theme', newTheme);
  
  try {
    await browser.storage.local.set({ theme: newTheme });
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// UI Updates
// ============================================================================

/**
 * Animate score counting from 0 to target
 */
function animateScore(targetScore: number, duration: number = 800): void {
  const startTime = performance.now();
  const startScore = 0;
  
  function update(currentTime: number): void {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease out curve
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentScore = Math.round(startScore + (targetScore - startScore) * easeProgress);
    
    safetyScoreEl.textContent = currentScore.toString();
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

/**
 * Update safety gauge visualization
 */
function updateGauge(score: number): void {
  // Circle circumference = 2 * PI * r = 2 * 3.14159 * 52 ≈ 327
  const circumference = 327;
  const offset = circumference - (score / 100) * circumference;
  
  gaugeFillEl.style.strokeDashoffset = offset.toString();
  // Use setAttribute for SVG elements (className is read-only on SVGElement)
  gaugeFillEl.setAttribute('class', `gauge-fill ${getScoreColorClass(score)}`);
  
  animateScore(score);
}

/**
 * Format threat label for display
 */
function formatThreatLabel(label: ThreatLabel): string {
  return label.replace(/_/g, ' ');
}

/**
 * Render threat tags with icons
 */
function renderThreats(threats: ThreatLabel[]): void {
  if (!threats || threats.length === 0) {
    threatsListEl.innerHTML = '<p class="no-threats">✅ No threats detected</p>';
    return;
  }
  
  threatsListEl.innerHTML = threats
    .map((threat) => {
      const icon = THREAT_ICONS[threat] || '⚠️';
      return `<span class="threat-tag"><span class="threat-icon">${icon}</span>${formatThreatLabel(threat)}</span>`;
    })
    .join('');
}

/**
 * Update header background image based on score
 */
function updateHeaderBackground(score: number): void {
  const headerEl = document.getElementById('header-bg');
  if (!headerEl) return;

  let imagePath: string;
  if (score >= 80) {
    imagePath = '/assets/surf_good.png';
  } else if (score >= 50) {
    imagePath = '/assets/surf_fine.png';
  } else {
    imagePath = '/assets/surf_bad.png';
  }
  
  headerEl.style.setProperty('--header-bg-image', `url('${imagePath}')`);
}

/**
 * Display analysis results
 */
function displayResults(result: AnalysisResult): void {
  // Hide loading and error
  loadingEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  resultsEl.classList.remove('hidden');

  // Calculate and display safety score
  const safetyScore = calculateSafetyScore(result);
  updateGauge(safetyScore);
  updateHeaderBackground(safetyScore);

  // Display risk level
  riskLevelEl.textContent = result.riskLevel;
  riskBadgeEl.className = `risk-badge ${result.riskLevel.toLowerCase()}`;

  // Display threats
  renderThreats(result.threats);

  // Display explanation
  explanationEl.textContent = result.explanation || 'No additional details available.';

  // Display timestamp
  const date = new Date(result.timestamp);
  timestampEl.textContent = `Analyzed: ${date.toLocaleString()}`;
  
  // Show "See Warnings" button when risk level is not SAFE
  // (suspicious passages may exist even without specific threat labels)
  if (seeWarningsBtn && result.riskLevel !== RiskLevel.SAFE) {
    seeWarningsBtn.classList.remove('hidden');
  }
  
  // Reset details toggle
  detailsToggleBtn.setAttribute('aria-expanded', 'false');
  detailsContentEl.classList.add('collapsed');
}

/**
 * Get error hint based on error message
 */
export function getErrorHint(message: string): string {
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('api configuration not found') || lowerMsg.includes('configure')) {
    return 'Set up your API key in Settings to enable analysis.';
  }
  if (lowerMsg.includes('authentication') || lowerMsg.includes('401') || lowerMsg.includes('403')) {
    return 'Your API key may be invalid. Check your Settings.';
  }
  if (lowerMsg.includes('rate limit') || lowerMsg.includes('429')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (lowerMsg.includes('network') || lowerMsg.includes('fetch')) {
    return 'Check your internet connection and try again.';
  }
  if (lowerMsg.includes('timeout')) {
    return 'The request took too long. Try again later.';
  }
  
  return 'An unexpected error occurred. Try re-analyzing.';
}

/**
 * Display error message
 */
function displayError(message: string): void {
  loadingEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  errorEl.classList.remove('hidden');
  errorMessageEl.textContent = message;
  errorHintEl.textContent = getErrorHint(message);
}

/**
 * Display current domain
 */
async function displayCurrentDomain(): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab.url) {
      const url = new URL(tab.url);
      domainDisplayEl.textContent = url.hostname;
    }
  } catch {
    domainDisplayEl.textContent = '';
  }
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Show loading state with custom message
 */
function showLoading(message: string = 'Analyzing website...'): void {
  loadingEl.classList.remove('hidden');
  resultsEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  const loadingText = loadingEl.querySelector('p');
  if (loadingText) {
    loadingText.textContent = message;
  }
}

/**
 * Polling interval for checking analysis status
 */
let pollingInterval: number | null = null;
let pollingStartTime: number | null = null;
let currentTabId: number | null = null;
const POLLING_TIMEOUT_MS = 15000; // Stop polling after 15 seconds

/**
 * Start polling for analysis completion
 */
function startPolling(): void {
  if (pollingInterval) return; // Already polling
  
  pollingStartTime = Date.now();
  
  pollingInterval = window.setInterval(async () => {
    if (!currentTabId) return;
    
    // Check for timeout
    if (pollingStartTime && Date.now() - pollingStartTime > POLLING_TIMEOUT_MS) {
      stopPolling();
      displayError('Analysis is taking longer than expected. Try re-analyzing the page.');
      return;
    }
    
    try {
      const message = createMessage(MessageType.GET_CURRENT_ANALYSIS, { tabId: currentTabId });
      const result = await sendToBackground<AnalysisResult | null>(message);
      
      if (result) {
        stopPolling();
        displayResults(result);
        currentAnalysis = result;
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 1000); // Poll every second
}

/**
 * Stop polling
 */
function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  pollingStartTime = null;
}

/**
 * Load current analysis
 */
async function loadAnalysis(): Promise<AnalysisResult | null> {
  try {
    // Show loading
    showLoading('Analyzing website...');

    // Get current tab ID and URL
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const tabId = tab?.id;
    
    if (!tabId) {
      displayError('Could not determine current tab.');
      return null;
    }
    
    currentTabId = tabId;

    // Get current analysis from background, passing tabId
    const message = createMessage(MessageType.GET_CURRENT_ANALYSIS, { tabId });
    const result = await sendToBackground<AnalysisResult | null>(message);

    if (result) {
      stopPolling();
      displayResults(result);
      return result;
    } else {
      // No result yet - if we can't trigger analysis, it might mean the extension
      // was loaded AFTER the page, so the content script isn't running.
      // In this case, we should reload the page.
      
      showLoading('Analysis requires page reload...');
      
      try {
        // Try to trigger analysis first
        await browser.tabs.sendMessage(tabId, { type: 'TRIGGER_ANALYSIS' });
        
        // If successful, just poll
        showLoading('Analyzing website...');
        startPolling();
      } catch {
        // Content script not responding - reload the page
        showLoading('Reloading page to enable analysis...');
        await browser.tabs.reload(tabId);
        window.close(); // Close popup as it will be disconnected anyway
      }
      
      return null;
    }
  } catch (error) {
    console.error('Failed to load analysis:', error);
    displayError(error instanceof Error ? error.message : 'Failed to load analysis');
    return null;
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

/**
 * Toggle details section
 */
function toggleDetails(): void {
  const isExpanded = detailsToggleBtn.getAttribute('aria-expanded') === 'true';
  detailsToggleBtn.setAttribute('aria-expanded', (!isExpanded).toString());
  detailsContentEl.classList.toggle('collapsed');
}

/**
 * Trigger showing warnings on page
 */
async function seeWarnings(): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;
    
    // Send message to content script to show navigation widget
    await browser.tabs.sendMessage(tab.id, { type: MessageType.SHOW_WARNINGS });
    
    // Close popup so user can see the page
    window.close();
  } catch (error) {
    console.error('Failed to show warnings:', error);
  }
}

// ============================================================================
// Feedback Functions
// ============================================================================

/**
 * Open feedback modal
 */
function openFeedbackModal(): void {
  feedbackModal.classList.remove('hidden');
}

/**
 * Close feedback modal
 */
function closeFeedbackModal(): void {
  feedbackModal.classList.add('hidden');
  feedbackCommentEl.value = '';
}

/**
 * Submit accurate feedback
 */
async function submitAccurateFeedback(): Promise<void> {
  if (!currentAnalysis) return;
  
  const feedback: UserFeedback = {
    id: crypto.randomUUID(),
    url: currentUrl,
    domain: currentDomain,
    feedbackType: FeedbackType.ACCURATE,
    originalRiskLevel: currentAnalysis.riskLevel,
    timestamp: Date.now(),
  };
  
  await saveUserFeedback(feedback);
  feedbackStatusEl.textContent = '✓ Thanks for your feedback!';
  feedbackAccurateBtn.disabled = true;
  feedbackReportBtn.disabled = true;
}

/**
 * Submit issue report
 */
async function submitFeedbackReport(): Promise<void> {
  if (!currentAnalysis) return;
  
  const feedbackTypeEl = document.querySelector('input[name="feedback-type"]:checked') as HTMLInputElement;
  const feedbackType = feedbackTypeEl?.value === 'FALSE_NEGATIVE' 
    ? FeedbackType.FALSE_NEGATIVE 
    : FeedbackType.FALSE_POSITIVE;
  
  const feedback: UserFeedback = {
    id: crypto.randomUUID(),
    url: currentUrl,
    domain: currentDomain,
    feedbackType,
    originalRiskLevel: currentAnalysis.riskLevel,
    userComment: feedbackCommentEl.value || undefined,
    timestamp: Date.now(),
  };
  
  await saveUserFeedback(feedback);
  closeFeedbackModal();
  feedbackStatusEl.textContent = '✓ Report submitted. Thank you!';
  feedbackAccurateBtn.disabled = true;
  feedbackReportBtn.disabled = true;
}

/**
 * Export report to clipboard
 */
async function exportReport(): Promise<void> {
  if (!currentAnalysis) return;
  
  const report = generateExportReport(
    currentUrl,
    currentDomain,
    currentAnalysis.riskLevel,
    currentAnalysis.threats,
    currentAnalysis.explanation,
    currentAnalysis.timestamp
  );
  
  try {
    await navigator.clipboard.writeText(report);
    exportBtn.textContent = '✓ Copied!';
    setTimeout(() => {
      exportBtn.textContent = '📋 Export Report';
    }, 2000);
  } catch {
    // Fallback: show alert
    alert('Report:\n\n' + report);
  }
}

// ============================================================================
// Event Listeners
// ============================================================================

reanalyzeBtn.addEventListener('click', reanalyze);
configureBtn.addEventListener('click', openOptions);
optionsBtn.addEventListener('click', openOptions);
themeToggleBtn.addEventListener('click', toggleTheme);
detailsToggleBtn.addEventListener('click', toggleDetails);

// Feedback event listeners
feedbackAccurateBtn.addEventListener('click', submitAccurateFeedback);
feedbackReportBtn.addEventListener('click', openFeedbackModal);
feedbackCancelBtn.addEventListener('click', closeFeedbackModal);
feedbackSubmitBtn.addEventListener('click', submitFeedbackReport);
exportBtn.addEventListener('click', exportReport);
seeWarningsBtn?.addEventListener('click', seeWarnings);

// Close modal on overlay click
feedbackModal.querySelector('.modal-overlay')?.addEventListener('click', closeFeedbackModal);

// ============================================================================
// Initialization
// ============================================================================

async function init(): Promise<void> {
  // Apply saved theme
  const theme = await getCurrentTheme();
  applyTheme(theme);
  
  // Display current domain and store for feedback
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.url) {
    currentUrl = tab.url;
    try {
      currentDomain = new URL(tab.url).hostname;
    } catch {
      currentDomain = 'unknown';
    }
  }
  
  await displayCurrentDomain();
  
  // Check if API is configured
  const apiConfig = await getApiConfig();
  if (!apiConfig || !apiConfig.apiKey) {
    // Show setup screen
    loadingEl.classList.add('hidden');
    resultsEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    const setupEl = document.getElementById('setup');
    if (setupEl) {
      setupEl.classList.remove('hidden');
    }
    
    // Add listener for setup button
    const setupBtn = document.getElementById('setup-btn');
    if (setupBtn) {
      setupBtn.addEventListener('click', openOptions);
    }
    return;
  }
  
  // Load analysis when popup opens
  const analysis = await loadAnalysis();
  if (analysis && !('error' in analysis)) {
    currentAnalysis = analysis;
  }
}

init();
