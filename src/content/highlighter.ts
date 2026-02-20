import browser from 'webextension-polyfill';
import { SuspiciousPassage, ThreatLabel, RiskLevel, MessageType } from '@/types';
import { getExtensionSettings } from '@/utils/storage';

/**
 * SurfSafe Text Highlighter
 * Highlights suspicious text on webpages with hover tooltips
 */

// CSS class prefix to avoid conflicts
const PREFIX = 'surfsafe';

// Maximum highlights per page for performance
const MAX_HIGHLIGHTS = 50;

// Store tooltip element for reuse
let tooltipEl: HTMLElement | null = null;

// Navigation widget element
let navWidgetEl: HTMLElement | null = null;

// Track current highlight index for navigation
let currentHighlightIndex = -1;

// Track if styles have been injected
let stylesInjected = false;

/**
 * Inject highlighter CSS into the page
 */
function injectStyles(): void {
  if (stylesInjected) return;

  const style = document.createElement('style');
  style.id = `${PREFIX}-highlighter-styles`;
  style.textContent = `
    .${PREFIX}-highlight {
      background-color: var(--${PREFIX}-highlight-color, rgba(255, 235, 59, 0.4));
      border-radius: 2px;
      cursor: help;
      display: inline;
      margin: 0;
      padding: 1px 2px;
      transition: background-color 0.2s ease;
    }

    .${PREFIX}-highlight:hover {
      filter: brightness(0.9);
    }

    .${PREFIX}-highlight--low {
      --${PREFIX}-highlight-color: rgba(255, 235, 59, 0.4);
    }

    .${PREFIX}-highlight--medium {
      --${PREFIX}-highlight-color: rgba(255, 152, 0, 0.4);
    }

    .${PREFIX}-highlight--high {
      --${PREFIX}-highlight-color: rgba(244, 67, 54, 0.4);
    }

    .${PREFIX}-tooltip {
      position: fixed;
      z-index: 2147483647;
      background: #1a1a2e;
      color: #fff;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 300px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.15s ease, transform 0.15s ease;
      line-height: 1.4;
    }

    .${PREFIX}-tooltip.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .${PREFIX}-tooltip-label {
      display: inline-block;
      background: rgba(255, 255, 255, 0.15);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-right: 4px;
      margin-bottom: 4px;
    }

    .${PREFIX}-tooltip-reason {
      margin-top: 6px;
      color: rgba(255, 255, 255, 0.85);
      font-size: 12px;
    }

    .${PREFIX}-tooltip-confidence {
      margin-top: 4px;
      color: rgba(255, 255, 255, 0.6);
      font-size: 11px;
    }

    .${PREFIX}-highlight--active {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
      animation: ${PREFIX}-pulse 1.5s ease-in-out infinite;
    }

    @keyframes ${PREFIX}-pulse {
      0%, 100% { outline-color: #3b82f6; }
      50% { outline-color: #60a5fa; }
    }

    .${PREFIX}-nav-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #1a1a2e;
      border-radius: 12px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #fff;
      font-size: 13px;
    }

    .${PREFIX}-nav-widget button {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: #fff;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: background 0.15s ease;
    }

    .${PREFIX}-nav-widget button:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .${PREFIX}-nav-widget button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .${PREFIX}-nav-counter {
      min-width: 50px;
      text-align: center;
      font-weight: 500;
    }

    .${PREFIX}-nav-close {
      margin-left: 4px;
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

/**
 * Create or get the tooltip element
 */
function getTooltip(): HTMLElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = `${PREFIX}-tooltip`;
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

/**
 * Get severity level from threat labels
 */
function getSeverity(labels: ThreatLabel[]): 'low' | 'medium' | 'high' {
  const highSeverity = [
    ThreatLabel.SENSITIVE_DATA,
    ThreatLabel.IMPERSONATION,
    ThreatLabel.SUSPICIOUS_DOMAIN,
  ];
  const mediumSeverity = [
    ThreatLabel.URGENCY,
    ThreatLabel.PRESSURE,
    ThreatLabel.TOO_GOOD,
    ThreatLabel.FAKE_TRUST,
  ];

  if (labels.some(l => highSeverity.includes(l))) return 'high';
  if (labels.some(l => mediumSeverity.includes(l))) return 'medium';
  return 'low';
}

/**
 * Show tooltip near a highlight element
 */
function showTooltip(el: HTMLElement, passage: SuspiciousPassage): void {
  const tooltip = getTooltip();
  
  // Build tooltip content
  const labelsHtml = passage.labels
    .map(label => `<span class="${PREFIX}-tooltip-label">${label.replace(/_/g, ' ')}</span>`)
    .join('');
  
  tooltip.innerHTML = `
    <div>${labelsHtml}</div>
    <div class="${PREFIX}-tooltip-reason">${passage.reason}</div>
    <div class="${PREFIX}-tooltip-confidence">Confidence: ${Math.round(passage.confidence * 100)}%</div>
  `;

  // Position tooltip
  const rect = el.getBoundingClientRect();
  const tooltipHeight = tooltip.offsetHeight || 80;
  
  // Position above or below depending on space
  let top = rect.top - tooltipHeight - 8;
  if (top < 10) {
    top = rect.bottom + 8;
  }
  
  let left = rect.left;
  if (left + 300 > window.innerWidth) {
    left = window.innerWidth - 310;
  }
  if (left < 10) {
    left = 10;
  }

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.classList.add('visible');
  tooltip.setAttribute('aria-hidden', 'false');
  
  // Add listeners to close tooltip on scroll or click away
  setupTooltipDismissListeners();
}

// Track if dismiss listeners are active
let dismissListenersActive = false;

/**
 * Setup listeners to dismiss tooltip on scroll or click away
 */
function setupTooltipDismissListeners(): void {
  if (dismissListenersActive) return;
  dismissListenersActive = true;
  
  const dismissTooltip = (e: Event) => {
    // Don't dismiss if clicking on a highlight or the tooltip itself
    const target = e.target as HTMLElement;
    if (target?.closest?.(`.${PREFIX}-highlight`) || target?.closest?.(`.${PREFIX}-tooltip`)) {
      return;
    }
    hideTooltip();
    clearActiveHighlight();
  };
  
  const onScroll = () => {
    hideTooltip();
    // Don't clear active highlight on scroll - just hide tooltip
  };
  
  // Use once: false so we can manually remove
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  document.addEventListener('click', dismissTooltip, { capture: true });
  
  // Store cleanup function
  (window as any).__surfsafeCleanupDismiss = () => {
    window.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('click', dismissTooltip, true);
    dismissListenersActive = false;
  };
}

/**
 * Hide the tooltip
 */
function hideTooltip(): void {
  if (tooltipEl) {
    tooltipEl.classList.remove('visible');
    tooltipEl.setAttribute('aria-hidden', 'true');
  }
  
  // Clean up dismiss listeners
  if ((window as any).__surfsafeCleanupDismiss) {
    (window as any).__surfsafeCleanupDismiss();
  }
}

// ============================================================================
// Navigation Widget
// ============================================================================

/**
 * Get all highlight elements on the page
 */
function getAllHighlights(): HTMLElement[] {
  return Array.from(document.querySelectorAll(`.${PREFIX}-highlight`)) as HTMLElement[];
}

/**
 * Create the navigation widget
 */
function createNavWidget(): HTMLElement {
  if (navWidgetEl) return navWidgetEl;

  navWidgetEl = document.createElement('div');
  navWidgetEl.className = `${PREFIX}-nav-widget`;
  navWidgetEl.setAttribute('role', 'navigation');
  navWidgetEl.setAttribute('aria-label', 'Navigate suspicious text highlights');

  navWidgetEl.innerHTML = `
    <button class="${PREFIX}-nav-prev" aria-label="Previous highlight" title="Previous (↑)">↑</button>
    <span class="${PREFIX}-nav-counter">0 of 0</span>
    <button class="${PREFIX}-nav-next" aria-label="Next highlight" title="Next (↓)">↓</button>
    <button class="${PREFIX}-nav-close" aria-label="Close navigation" title="Close">✕</button>
  `;

  // Event listeners
  navWidgetEl.querySelector(`.${PREFIX}-nav-prev`)!.addEventListener('click', navigatePrev);
  navWidgetEl.querySelector(`.${PREFIX}-nav-next`)!.addEventListener('click', navigateNext);
  navWidgetEl.querySelector(`.${PREFIX}-nav-close`)!.addEventListener('click', hideNavWidget);

  // Keyboard navigation
  navWidgetEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigatePrev();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateNext();
    } else if (e.key === 'Escape') {
      hideNavWidget();
    }
  });

  document.body.appendChild(navWidgetEl);
  return navWidgetEl;
}

/**
 * Update the navigation widget counter
 */
function updateNavCounter(): void {
  if (!navWidgetEl) return;

  const highlights = getAllHighlights();
  const counter = navWidgetEl.querySelector(`.${PREFIX}-nav-counter`);
  if (counter) {
    if (highlights.length === 0) {
      counter.textContent = '0 of 0';
    } else {
      counter.textContent = `${currentHighlightIndex + 1} of ${highlights.length}`;
    }
  }

  // Update button states
  const prevBtn = navWidgetEl.querySelector(`.${PREFIX}-nav-prev`) as HTMLButtonElement;
  const nextBtn = navWidgetEl.querySelector(`.${PREFIX}-nav-next`) as HTMLButtonElement;
  if (prevBtn && nextBtn) {
    prevBtn.disabled = highlights.length === 0;
    nextBtn.disabled = highlights.length === 0;
  }
}

/**
 * Show the navigation widget
 */
function showNavWidget(): void {
  const highlights = getAllHighlights();
  if (highlights.length === 0) return;

  createNavWidget();
  currentHighlightIndex = 0;
  updateNavCounter();
  navigateToHighlight(0);
}

/**
 * Hide the navigation widget
 */
function hideNavWidget(): void {
  if (navWidgetEl) {
    navWidgetEl.remove();
    navWidgetEl = null;
  }
  clearActiveHighlight();
  currentHighlightIndex = -1;
}

/**
 * Clear active highlight styling
 */
function clearActiveHighlight(): void {
  const active = document.querySelector(`.${PREFIX}-highlight--active`);
  if (active) {
    active.classList.remove(`${PREFIX}-highlight--active`);
  }
  hideTooltip();
}

/**
 * Wait for scroll to complete before executing callback
 */
function waitForScrollEnd(callback: () => void): void {
  let scrollTimeout: number | null = null;
  let settled = false;
  
  const onScrollEnd = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('scrollend', onScrollEnd, true);
    // Small additional delay to ensure rendering is complete
    setTimeout(callback, 50);
  };
  
  const onScroll = () => {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    // If no scroll events for 150ms, consider scroll complete
    scrollTimeout = window.setTimeout(onScrollEnd, 150);
  };
  
  // Use scrollend event if available (modern browsers)
  window.addEventListener('scrollend', onScrollEnd, { once: true, capture: true });
  
  // Fallback: detect when scrolling stops
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  
  // Safety timeout in case scroll events never fire (element already visible)
  setTimeout(() => {
    if (!settled) {
      onScrollEnd();
    }
  }, 800);
}

/**
 * Navigate to a specific highlight by index
 */
function navigateToHighlight(index: number): void {
  const highlights = getAllHighlights();
  if (highlights.length === 0) return;

  // Wrap around
  if (index < 0) index = highlights.length - 1;
  if (index >= highlights.length) index = 0;

  currentHighlightIndex = index;
  updateNavCounter();

  // Clear previous active and tooltip
  clearActiveHighlight();

  // Set new active
  const highlight = highlights[index];
  highlight.classList.add(`${PREFIX}-highlight--active`);

  // Scroll into view
  highlight.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest'
  });

  // Show tooltip after scroll truly completes
  waitForScrollEnd(() => {
    // Only show if this highlight is still active (user didn't navigate away)
    if (highlight.classList.contains(`${PREFIX}-highlight--active`)) {
      const passageData = highlight.dataset.surfsafePassage;
      if (passageData) {
        try {
          const passage = JSON.parse(passageData) as SuspiciousPassage;
          showTooltip(highlight, passage);
        } catch (e) {
          console.error('Failed to parse passage data:', e);
        }
      }
    }
  });
}

/**
 * Navigate to next highlight
 */
function navigateNext(): void {
  navigateToHighlight(currentHighlightIndex + 1);
}

/**
 * Navigate to previous highlight
 */
function navigatePrev(): void {
  navigateToHighlight(currentHighlightIndex - 1);
}

/**
 * Normalize text for comparison (collapse whitespace, lowercase)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .trim();
}

/**
 * Get all text nodes in order from an element (for cross-node matching)
 */
function getTextNodes(root: Element): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        const tagName = parent.tagName.toUpperCase();
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.classList.contains(`${PREFIX}-highlight`)) {
          return NodeFilter.FILTER_REJECT;
        }
        
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }
  return textNodes;
}

/**
 * Build concatenated text from nodes with position mapping
 */
interface TextPosition {
  node: Text;
  start: number;  // Position in concatenated string
  end: number;
  nodeOffset: number;  // Start offset within the node
}

function buildTextMap(textNodes: Text[]): { text: string; positions: TextPosition[] } {
  let fullText = '';
  const positions: TextPosition[] = [];
  
  for (const node of textNodes) {
    const nodeText = node.textContent || '';
    if (nodeText.trim()) {
      positions.push({
        node,
        start: fullText.length,
        end: fullText.length + nodeText.length,
        nodeOffset: 0
      });
      fullText += nodeText;
    }
  }
  
  return { text: fullText, positions };
}

/**
 * Find the best matching substring using various strategies
 */
function findBestMatch(haystack: string, needle: string): { start: number; end: number } | null {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedNeedle = normalizeText(needle);
  
  // Debug: Log first 200 chars of page text and needle
  console.log(`SurfSafe DEBUG: Looking for "${normalizedNeedle.substring(0, 80)}..."`);
  console.log(`SurfSafe DEBUG: Page text sample: "${normalizedHaystack.substring(0, 300)}..."`);
  
  // Strategy 1: Exact normalized match
  const exactIndex = normalizedHaystack.indexOf(normalizedNeedle);
  if (exactIndex !== -1) {
    console.log('SurfSafe DEBUG: Found exact normalized match');
    return findOriginalPosition(haystack, normalizedHaystack, exactIndex, normalizedNeedle.length);
  }
  
  // Strategy 2: Match first portion (first 25 chars)
  if (normalizedNeedle.length > 25) {
    const firstPart = normalizedNeedle.substring(0, 25);
    const firstIndex = normalizedHaystack.indexOf(firstPart);
    if (firstIndex !== -1) {
      console.log(`SurfSafe DEBUG: Found first 25 chars: "${firstPart}"`);
      const mapped = findOriginalPosition(haystack, normalizedHaystack, firstIndex, Math.min(normalizedNeedle.length, 100));
      if (mapped) return mapped;
    }
  }
  
  // Strategy 3: Word-based partial match - try 2+ significant word sequences
  const needleWords = normalizedNeedle.split(/\s+/).filter(w => w.length > 2);
  
  // Try to find 4 consecutive words
  if (needleWords.length >= 4) {
    for (let i = 0; i <= needleWords.length - 4; i++) {
      const sequence = needleWords.slice(i, i + 4).join(' ');
      const seqIndex = normalizedHaystack.indexOf(sequence);
      if (seqIndex !== -1) {
        console.log(`SurfSafe DEBUG: Found 4-word sequence: "${sequence}"`);
        return findOriginalPosition(haystack, normalizedHaystack, seqIndex, sequence.length);
      }
    }
  }
  
  // Try to find 3 consecutive words
  if (needleWords.length >= 3) {
    for (let i = 0; i <= needleWords.length - 3; i++) {
      const sequence = needleWords.slice(i, i + 3).join(' ');
      const seqIndex = normalizedHaystack.indexOf(sequence);
      if (seqIndex !== -1) {
        console.log(`SurfSafe DEBUG: Found 3-word sequence: "${sequence}"`);
        return findOriginalPosition(haystack, normalizedHaystack, seqIndex, sequence.length);
      }
    }
  }
  
  // Try 2 consecutive words (more aggressive)
  if (needleWords.length >= 2) {
    for (let i = 0; i <= needleWords.length - 2; i++) {
      const sequence = needleWords.slice(i, i + 2).join(' ');
      // Only match if sequence is at least 10 chars to avoid false positives
      if (sequence.length >= 10) {
        const seqIndex = normalizedHaystack.indexOf(sequence);
        if (seqIndex !== -1) {
          console.log(`SurfSafe DEBUG: Found 2-word sequence: "${sequence}"`);
          return findOriginalPosition(haystack, normalizedHaystack, seqIndex, sequence.length);
        }
      }
    }
  }
  
  // Strategy 4: Find any distinctive single word (5+ chars) as last resort
  const distinctiveWords = needleWords.filter(w => w.length >= 5 && !isCommonWord(w));
  for (const word of distinctiveWords) {
    const wordIndex = normalizedHaystack.indexOf(word);
    if (wordIndex !== -1) {
      // Extend the match to include surrounding context
      const extendedStart = Math.max(0, wordIndex - 10);
      const extendedLength = word.length + 20;
      console.log(`SurfSafe DEBUG: Found distinctive word: "${word}"`);
      return findOriginalPosition(haystack, normalizedHaystack, wordIndex, word.length);
    }
  }
  
  console.log('SurfSafe DEBUG: No match found with any strategy');
  return null;
}

/**
 * Check if a word is too common to be used for matching
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'about', 'after', 'again', 'being', 'before', 'below', 'between',
    'could', 'does', 'doing', 'during', 'each', 'have', 'having',
    'here', 'itself', 'just', 'more', 'most', 'other', 'over',
    'same', 'should', 'some', 'such', 'than', 'that', 'their',
    'them', 'then', 'there', 'these', 'they', 'this', 'those',
    'through', 'under', 'very', 'what', 'when', 'where', 'which',
    'while', 'will', 'with', 'would', 'your', 'from', 'into'
  ]);
  return commonWords.has(word.toLowerCase());
}

/**
 * Map from normalized string position back to original string position
 */
function findOriginalPosition(
  original: string, 
  normalized: string, 
  normalizedStart: number, 
  normalizedLength: number
): { start: number; end: number } | null {
  // Simple approximation: walk both strings in parallel
  let origIndex = 0;
  let normIndex = 0;
  let matchStart = -1;
  
  while (origIndex < original.length && normIndex < normalizedStart) {
    const origChar = original[origIndex].toLowerCase();
    const normChar = normalized[normIndex];
    
    if (origChar === normChar || (origChar.match(/\s/) && normChar === ' ')) {
      normIndex++;
    } else if (original[origIndex].match(/\s/)) {
      // Skip extra whitespace in original
    }
    origIndex++;
  }
  
  matchStart = origIndex;
  
  // Find end position
  let matchLength = 0;
  while (origIndex < original.length && normIndex < normalizedStart + normalizedLength) {
    const origChar = original[origIndex].toLowerCase();
    const normChar = normalized[normIndex];
    
    if (origChar === normChar || (origChar.match(/\s/) && normChar === ' ')) {
      normIndex++;
    }
    origIndex++;
    matchLength++;
  }
  
  if (matchStart >= 0 && matchLength > 0) {
    return { start: matchStart, end: matchStart + matchLength };
  }
  
  return null;
}

/**
 * Find and wrap matching text in the DOM with improved matching
 */
function findAndHighlightText(passage: SuspiciousPassage): number {
  const searchText = passage.text.trim();
  if (!searchText || searchText.length < 3) return 0;
  
  const severity = getSeverity(passage.labels);
  
  // Get all text nodes and build concatenated text
  const textNodes = getTextNodes(document.body);
  const { text: fullText, positions } = buildTextMap(textNodes);
  
  // Find the best match in the full text
  const match = findBestMatch(fullText, searchText);
  
  if (!match) {
    console.log(`SurfSafe: No match found for: "${searchText.substring(0, 50)}..."`);
    return 0;
  }
  
  // Find which text node(s) contain the match
  const matchStart = match.start;
  const matchEnd = match.end;
  
  // Find the node containing the start of the match
  for (const pos of positions) {
    if (matchStart >= pos.start && matchStart < pos.end) {
      const node = pos.node;
      const nodeText = node.textContent || '';
      const localStart = matchStart - pos.start;
      const localEnd = Math.min(matchEnd - pos.start, nodeText.length);
      
      if (localStart >= nodeText.length) continue;
      
      const parent = node.parentNode;
      if (!parent) continue;
      
      // Extract the portions
      const before = nodeText.substring(0, localStart);
      const matchedText = nodeText.substring(localStart, localEnd);
      const after = nodeText.substring(localEnd);
      
      // Create highlight mark
      const mark = document.createElement('mark');
      mark.className = `${PREFIX}-highlight ${PREFIX}-highlight--${severity}`;
      mark.textContent = matchedText;
      mark.dataset.surfsafePassage = JSON.stringify(passage);
      
      // Add event listeners
      mark.addEventListener('mouseenter', () => showTooltip(mark, passage));
      mark.addEventListener('mouseleave', hideTooltip);
      mark.addEventListener('focus', () => showTooltip(mark, passage));
      mark.addEventListener('blur', hideTooltip);
      mark.setAttribute('tabindex', '0');
      
      // Replace text node with split content
      const fragment = document.createDocumentFragment();
      if (before) fragment.appendChild(document.createTextNode(before));
      fragment.appendChild(mark);
      if (after) fragment.appendChild(document.createTextNode(after));
      
      parent.replaceChild(fragment, node);
      
      console.log(`SurfSafe: Highlighted "${matchedText.substring(0, 40)}..."`);
      return 1;
    }
  }
  
  return 0;
}

/**
 * Apply highlights for all suspicious passages
 */
export async function applyHighlights(passages: SuspiciousPassage[]): Promise<number> {
  // Check if highlighting is enabled
  const settings = await getExtensionSettings();
  if (!settings.highlightSuspiciousText) {
    return 0;
  }

  // Inject styles if needed
  injectStyles();
  
  // Clear any existing highlights first
  clearHighlights();
  
  let totalHighlights = 0;
  
  // Sort by confidence (highest first)
  const sortedPassages = [...passages].sort((a, b) => b.confidence - a.confidence);
  
  for (const passage of sortedPassages) {
    if (totalHighlights >= MAX_HIGHLIGHTS) break;
    totalHighlights += findAndHighlightText(passage);
  }
  
  console.log(`SurfSafe: Applied ${totalHighlights} highlights`);
  
  // Note: Navigation widget is now triggered only via popup "See Warnings" button
  
  return totalHighlights;
}

/**
 * Remove all SurfSafe highlights from the page
 */
export function clearHighlights(): void {
  const highlights = document.querySelectorAll(`.${PREFIX}-highlight`);
  
  highlights.forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    
    // Replace mark with its text content
    const text = document.createTextNode(mark.textContent || '');
    parent.replaceChild(text, mark);
    
    // Normalize to merge adjacent text nodes
    parent.normalize();
  });
  
  // Hide tooltip and nav widget
  hideTooltip();
  hideNavWidget();
  
  console.log(`SurfSafe: Cleared ${highlights.length} highlights`);
}

/**
 * Check if highlighting is enabled
 */
export async function isHighlightingEnabled(): Promise<boolean> {
  const settings = await getExtensionSettings();
  return settings.highlightSuspiciousText;
}

/**
 * Listen for toggle messages from background/popup
 */
export function setupHighlightListener(): void {
  browser.runtime.onMessage.addListener((message: any) => {
    if (message?.type === MessageType.UPDATE_HIGHLIGHTS) {
      if (message.payload?.enabled === false) {
        clearHighlights();
      } else if (message.payload?.passages) {
        applyHighlights(message.payload.passages);
      }
      return Promise.resolve({ success: true });
    }
    
    if (message?.type === MessageType.SHOW_WARNINGS) {
      const highlights = getAllHighlights();
      if (highlights.length > 0) {
        showNavWidget();
        return Promise.resolve({ success: true, count: highlights.length });
      }
      return Promise.resolve({ success: false, count: 0 });
    }
    
    return undefined;
  });
}

/**
 * Manually trigger showing the navigation widget (exported for popup)
 */
export { showNavWidget };
