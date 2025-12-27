import browser from 'webextension-polyfill';
import { MessageType, AnalysisResult, RiskLevel, ThreatLabel } from '@/types';
import { sendToBackground, createMessage } from '@/utils/messaging';

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
const confidenceFillEl = document.getElementById('confidence-fill')!;
const confidenceTextEl = document.getElementById('confidence-text')!;
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
  containerEl.setAttribute('data-theme', theme);
  themeIconEl.textContent = theme === 'dark' ? '☀️' : '🌙';
}

/**
 * Toggle theme and persist
 */
async function toggleTheme(): Promise<void> {
  const currentTheme = containerEl.getAttribute('data-theme') as Theme;
  const newTheme: Theme = currentTheme === 'dark' ? 'light' : 'dark';
  
  applyTheme(newTheme);
  
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
  gaugeFillEl.className = `gauge-fill ${getScoreColorClass(score)}`;
  
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

  // Display risk level
  riskLevelEl.textContent = result.riskLevel;
  riskBadgeEl.className = `risk-badge ${result.riskLevel.toLowerCase()}`;

  // Display confidence
  const confidencePercent = Math.round(result.confidence * 100);
  confidenceFillEl.style.width = `${confidencePercent}%`;
  confidenceTextEl.textContent = `${confidencePercent}% confidence`;

  // Display threats
  renderThreats(result.threats);

  // Display explanation
  explanationEl.textContent = result.explanation || 'No additional details available.';

  // Display timestamp
  const date = new Date(result.timestamp);
  timestampEl.textContent = `Analyzed: ${date.toLocaleString()}`;
  
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

/**
 * Toggle details section
 */
function toggleDetails(): void {
  const isExpanded = detailsToggleBtn.getAttribute('aria-expanded') === 'true';
  detailsToggleBtn.setAttribute('aria-expanded', (!isExpanded).toString());
  detailsContentEl.classList.toggle('collapsed');
}

// ============================================================================
// Event Listeners
// ============================================================================

reanalyzeBtn.addEventListener('click', reanalyze);
configureBtn.addEventListener('click', openOptions);
optionsBtn.addEventListener('click', openOptions);
themeToggleBtn.addEventListener('click', toggleTheme);
detailsToggleBtn.addEventListener('click', toggleDetails);

// ============================================================================
// Initialization
// ============================================================================

async function init(): Promise<void> {
  // Apply saved theme
  const theme = await getCurrentTheme();
  applyTheme(theme);
  
  // Display current domain
  await displayCurrentDomain();
  
  // Load analysis when popup opens
  await loadAnalysis();
}

init();
