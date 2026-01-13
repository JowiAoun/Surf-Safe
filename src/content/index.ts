import browser from 'webextension-polyfill';
import { MessageType, PageAnalysisRequest, AnalysisResult } from '@/types';
import { sendToBackground, createMessage } from '@/utils/messaging';
import { debounce, DEBOUNCE_DELAY_MS } from '@/utils/cache';
import { applyHighlights, clearHighlights, setupHighlightListener } from './highlighter';

console.log('SurfSafe content script loaded on:', window.location.href);

// Constants for content extraction limits
const MAX_BODY_TEXT_LENGTH = 10000;
const MAX_LINKS = 100;
const MAX_HEADINGS = 50;
const MAX_FORMS = 20;

// Track last analyzed URL to prevent duplicate analysis
let lastAnalyzedUrl: string | null = null;
let isAnalyzing = false;

/**
 * Check if an element is visible in the DOM
 */
function isElementVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);

  // Check various visibility properties
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;

  // Check if element has zero dimensions
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  // Check for hidden attribute
  if (element.hasAttribute('hidden')) return false;

  // Check aria-hidden
  if (element.getAttribute('aria-hidden') === 'true') return false;

  return true;
}

/**
 * Extract visible text from an element, excluding scripts and styles
 */
function extractVisibleText(element: Element): string {
  const excludeTags = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS',
    'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED', 'APPLET'
  ]);

  let text = '';

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          // Skip excluded tags
          if (excludeTags.has(el.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip hidden elements
          if (!isElementVisible(el)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeText = node.textContent?.trim();
      if (nodeText) {
        text += nodeText + ' ';
      }
    }
  }

  return text.trim();
}

/**
 * Get the current domain
 */
function getCurrentDomain(): string {
  return window.location.hostname;
}

/**
 * Check if a link is external (different domain)
 */
function isExternalLink(href: string, currentDomain: string): boolean {
  try {
    const url = new URL(href, window.location.origin);
    return url.hostname !== currentDomain && url.protocol.startsWith('http');
  } catch {
    return false;
  }
}

/**
 * Detect suspicious URL patterns
 */
function detectSuspiciousUrlPatterns(url: string): string[] {
  const patterns: string[] = [];

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const fullUrl = urlObj.href;

    // Check for excessive hyphens in domain (common in phishing)
    const hyphenCount = (hostname.match(/-/g) || []).length;
    if (hyphenCount > 3) {
      patterns.push('EXCESSIVE_HYPHENS');
    }

    // Check for excessive subdomains (more than 3 dots)
    const dotCount = (hostname.match(/\./g) || []).length;
    if (dotCount > 3) {
      patterns.push('EXCESSIVE_SUBDOMAINS');
    }

    // Check for IP address instead of domain name
    const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (ipPattern.test(hostname)) {
      patterns.push('IP_ADDRESS_DOMAIN');
    }

    // Check for unicode/punycode abuse (homograph attack)
    if (hostname.startsWith('xn--') || /[^\x00-\x7F]/.test(hostname)) {
      patterns.push('UNICODE_ABUSE');
    }

    // Check for known brand impersonation patterns
    const brandPatterns = [
      /paypa[l1]/i, /amaz[o0]n/i, /g[o0]{2}gle/i, /faceb[o0]{2}k/i,
      /micr[o0]s[o0]ft/i, /app[l1]e/i, /netf[l1]ix/i, /bank/i
    ];
    for (const pattern of brandPatterns) {
      if (pattern.test(hostname) && !hostname.includes('.com')) {
        patterns.push('POSSIBLE_BRAND_IMPERSONATION');
        break;
      }
    }

    // Check for suspicious TLDs
    const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.work', '.click'];
    const tld = '.' + hostname.split('.').pop()?.toLowerCase();
    if (suspiciousTlds.includes(tld)) {
      patterns.push('SUSPICIOUS_TLD');
    }

    // Check for very long domain names (often used in phishing)
    if (hostname.length > 50) {
      patterns.push('LONG_DOMAIN');
    }

    // Check for suspicious keywords in URL
    const suspiciousKeywords = [
      'login', 'signin', 'verify', 'update', 'secure', 'account',
      'banking', 'confirm', 'password', 'credential', 'wallet'
    ];
    const urlLower = fullUrl.toLowerCase();
    for (const keyword of suspiciousKeywords) {
      if (urlLower.includes(keyword) && patterns.includes('POSSIBLE_BRAND_IMPERSONATION')) {
        patterns.push('SUSPICIOUS_KEYWORD_COMBO');
        break;
      }
    }

    // Check for data URI or javascript URI
    if (url.startsWith('data:') || url.startsWith('javascript:')) {
      patterns.push('DANGEROUS_URI_SCHEME');
    }

    // Check for port numbers (unusual for legitimate sites)
    if (urlObj.port && !['80', '443', ''].includes(urlObj.port)) {
      patterns.push('UNUSUAL_PORT');
    }

  } catch {
    patterns.push('MALFORMED_URL');
  }

  return patterns;
}

/**
 * Sanitize and limit text content
 */
function sanitizeText(text: string, maxLength: number): string {
  // Remove excessive whitespace
  let sanitized = text.replace(/\s+/g, ' ').trim();

  // Remove null bytes and other control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }

  return sanitized;
}

/**
 * Extract page data for analysis
 */
function extractPageData(): PageAnalysisRequest {
  const currentDomain = getCurrentDomain();

  // Get all visible headings
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .filter(isElementVisible)
    .map((h) => h.textContent?.trim())
    .filter((text): text is string => !!text && text.length > 0)
    .slice(0, MAX_HEADINGS);

  // Get all links with external detection
  const allLinks = Array.from(document.querySelectorAll('a[href]'))
    .filter(isElementVisible)
    .map((a) => {
      const anchor = a as HTMLAnchorElement;
      const href = anchor.href;
      return {
        href,
        text: sanitizeText(a.textContent || '', 200),
        isExternal: isExternalLink(href, currentDomain),
        suspiciousPatterns: detectSuspiciousUrlPatterns(href),
      };
    })
    .filter((link) => link.href && link.href.startsWith('http'))
    .slice(0, MAX_LINKS);

  // Get all forms with field analysis
  const forms = Array.from(document.querySelectorAll('form'))
    .slice(0, MAX_FORMS)
    .map((form) => {
      const fields = Array.from(form.querySelectorAll('input, textarea, select'))
        .map((field) => {
          const input = field as HTMLInputElement;
          return {
            name: input.name || '',
            type: input.type || 'text',
            placeholder: input.placeholder || '',
          };
        })
        .filter((f) => f.name || f.type);

      // Detect sensitive fields
      const sensitiveTypes = ['password', 'credit-card', 'tel', 'email'];
      const sensitiveNames = ['ssn', 'social', 'card', 'cvv', 'pin', 'account', 'routing'];

      const hasSensitiveFields = fields.some(f =>
        sensitiveTypes.includes(f.type.toLowerCase()) ||
        sensitiveNames.some(name =>
          f.name.toLowerCase().includes(name) ||
          f.placeholder.toLowerCase().includes(name)
        )
      );

      return {
        action: form.action || '',
        method: form.method || 'get',
        fields: fields.map(f => f.name || f.type).filter(Boolean),
        hasSensitiveFields,
      };
    });

  // Get meta tags
  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute('content') || undefined;

  const metaKeywords =
    document.querySelector('meta[name="keywords"]')?.getAttribute('content') || undefined;

  // Extract visible body text only
  const bodyText = sanitizeText(extractVisibleText(document.body), MAX_BODY_TEXT_LENGTH);

  // Analyze current page URL
  const urlPatterns = detectSuspiciousUrlPatterns(window.location.href);

  // Count external links
  const externalLinkCount = allLinks.filter(l => l.isExternal).length;

  // Collect all suspicious patterns from links
  const suspiciousLinks = allLinks
    .filter(l => l.suspiciousPatterns.length > 0)
    .map(l => ({
      href: l.href,
      text: l.text,
      patterns: l.suspiciousPatterns,
    }));

  return {
    url: window.location.href,
    domain: currentDomain,
    title: document.title,
    metaDescription,
    metaKeywords,
    headings,
    links: allLinks.map(l => ({ href: l.href, text: l.text, isExternal: l.isExternal })),
    suspiciousLinks,
    externalLinkCount,
    forms,
    bodyText,
    urlPatterns,
    extractedAt: Date.now(),
  };
}

/**
 * Analyze the current page (core function)
 */
async function performAnalysis(): Promise<void> {
  const currentUrl = window.location.href;

  // Skip if already analyzing or same URL
  if (isAnalyzing) {
    console.log('Analysis already in progress, skipping');
    return;
  }

  if (lastAnalyzedUrl === currentUrl) {
    console.log('URL already analyzed, skipping:', currentUrl);
    return;
  }

  try {
    isAnalyzing = true;
    console.log('Extracting page data...');
    const pageData = extractPageData();

    console.log('Sending analysis request to background...');
    const message = createMessage(MessageType.ANALYZE_PAGE, pageData);
    const result = await sendToBackground<AnalysisResult | { error: string }>(message);

    if ('error' in result) {
      console.error('Analysis failed:', result.error);
    } else {
      console.log('Analysis result:', result);
      lastAnalyzedUrl = currentUrl;
      // Store result for popup to retrieve
      sessionStorage.setItem('surfsafe-analysis', JSON.stringify(result));
      
      // Apply text highlights if passages are present
      if (result.suspiciousPassages && result.suspiciousPassages.length > 0) {
        applyHighlights(result.suspiciousPassages);
      }
    }
  } catch (error) {
    console.error('Failed to analyze page:', error);
  } finally {
    isAnalyzing = false;
  }
}

// Debounced version of analysis to prevent rapid-fire requests
const debouncedAnalysis = debounce(performAnalysis, DEBOUNCE_DELAY_MS);

/**
 * Trigger analysis (debounced)
 */
function analyzePage(): void {
  debouncedAnalysis();
}

/**
 * Handle URL changes (for SPA support)
 */
function handleUrlChange(): void {
  const currentUrl = window.location.href;
  if (currentUrl !== lastAnalyzedUrl) {
    console.log('URL changed, scheduling analysis:', currentUrl);
    analyzePage();
  }
}

/**
 * Initialize automatic analysis
 */
function init(): void {
  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Add a small delay to ensure dynamic content is loaded
      setTimeout(analyzePage, 2000);
    });
  } else {
    // Page already loaded
    setTimeout(analyzePage, 2000);
  }

  // Listen for SPA navigation (history API)
  window.addEventListener('popstate', handleUrlChange);

  // Observe URL changes via History API
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    setTimeout(handleUrlChange, 500);
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    setTimeout(handleUrlChange, 500);
  };
  
  // Listen for trigger from popup (when popup opens but no analysis exists)
  browser.runtime.onMessage.addListener((message: any) => {
    if (message?.type === 'TRIGGER_ANALYSIS') {
      console.log('Received TRIGGER_ANALYSIS from popup');
      // Force analysis even if URL matches
      lastAnalyzedUrl = null;
      isAnalyzing = false;
      performAnalysis();
      return Promise.resolve({ triggered: true });
    }
    return undefined;
  });
  
  // Setup highlight toggle listener
  setupHighlightListener();
}

// Start the content script
init();

