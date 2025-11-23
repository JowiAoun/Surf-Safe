import { MessageType, PageAnalysisRequest, AnalysisResult } from '@/types';
import { sendToBackground, createMessage } from '@/utils/messaging';

console.log('SurfSafe content script loaded on:', window.location.href);

/**
 * Extract page data for analysis
 */
function extractPageData(): PageAnalysisRequest {
  // Get all headings
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .map((h) => h.textContent?.trim())
    .filter((text): text is string => !!text);

  // Get all links
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map((a) => ({
      href: (a as HTMLAnchorElement).href,
      text: a.textContent?.trim() || '',
    }))
    .filter((link) => link.href && link.text);

  // Get all forms
  const forms = Array.from(document.querySelectorAll('form')).map((form) => ({
    action: form.action || '',
    fields: Array.from(form.querySelectorAll('input, textarea, select'))
      .map((field) => (field as HTMLInputElement).name || (field as HTMLInputElement).type || '')
      .filter((name) => !!name),
  }));

  // Get meta description
  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute('content') || undefined;

  // Get body text (limit to 5000 characters to avoid huge payloads)
  const bodyText = document.body.innerText.substring(0, 5000);

  return {
    url: window.location.href,
    title: document.title,
    metaDescription,
    headings,
    links,
    forms,
    bodyText,
  };
}

/**
 * Analyze the current page
 */
async function analyzePage(): Promise<void> {
  try {
    console.log('Extracting page data...');
    const pageData = extractPageData();

    console.log('Sending analysis request to background...');
    const message = createMessage(MessageType.ANALYZE_PAGE, pageData);
    const result = await sendToBackground<AnalysisResult | { error: string }>(message);

    if ('error' in result) {
      console.error('Analysis failed:', result.error);
    } else {
      console.log('Analysis result:', result);
      // Store result for popup to retrieve
      sessionStorage.setItem('surfsafe-analysis', JSON.stringify(result));
    }
  } catch (error) {
    console.error('Failed to analyze page:', error);
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
}

// Start the content script
init();
