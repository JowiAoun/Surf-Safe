/**
 * SSL Certificate Validation Utilities for SurfSafe
 * Provides basic SSL/TLS security checks
 */

// ============================================================================
// Types
// ============================================================================

export interface SSLInfo {
  isSecure: boolean;
  protocol: string;
  hasValidCertificate: boolean;
  issues: SSLIssue[];
}

export interface SSLIssue {
  type: SSLIssueType;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export enum SSLIssueType {
  NOT_HTTPS = 'NOT_HTTPS',
  MIXED_CONTENT = 'MIXED_CONTENT',
  INSECURE_FORM = 'INSECURE_FORM',
  SUSPICIOUS_PORT = 'SUSPICIOUS_PORT',
}

// ============================================================================
// SSL Check Functions
// ============================================================================

/**
 * Check if current page uses HTTPS
 */
export function isHttps(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check for mixed content (HTTPS page with HTTP resources)
 * Note: This is a basic check - browser handles most cases
 */
export function hasMixedContent(pageUrl: string, resourceUrls: string[]): boolean {
  if (!isHttps(pageUrl)) {
    return false; // Only relevant for HTTPS pages
  }

  return resourceUrls.some((url) => {
    try {
      const urlObj = new URL(url, pageUrl);
      return urlObj.protocol === 'http:';
    } catch {
      return false;
    }
  });
}

/**
 * Check if form submits to insecure endpoint
 */
export function hasInsecureFormAction(formAction: string, pageUrl: string): boolean {
  if (!formAction) {
    return false;
  }

  try {
    const actionUrl = new URL(formAction, pageUrl);
    const pageUrlObj = new URL(pageUrl);

    // Insecure if HTTPS page submits to HTTP
    if (pageUrlObj.protocol === 'https:' && actionUrl.protocol === 'http:') {
      return true;
    }

    // Insecure if submitting to HTTP in general
    if (actionUrl.protocol === 'http:' && actionUrl.hostname !== 'localhost') {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if URL uses a suspicious port
 */
export function hasSuspiciousPort(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const port = urlObj.port;

    // Standard ports are fine
    if (!port || port === '80' || port === '443') {
      return false;
    }

    // Common development ports - somewhat suspicious on production sites
    const devPorts = ['3000', '3001', '4000', '5000', '8000', '8080', '8888'];
    return devPorts.includes(port);
  } catch {
    return false;
  }
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Run SSL security analysis
 */
export function checkSSLSecurity(
  pageUrl: string,
  formActions: string[] = []
): SSLInfo {
  const issues: SSLIssue[] = [];
  const secure = isHttps(pageUrl);

  if (!secure) {
    issues.push({
      type: SSLIssueType.NOT_HTTPS,
      severity: 'high',
      message: 'Page is not using HTTPS encryption',
    });
  }

  // Check form actions
  for (const action of formActions) {
    if (hasInsecureFormAction(action, pageUrl)) {
      issues.push({
        type: SSLIssueType.INSECURE_FORM,
        severity: 'high',
        message: `Form submits to insecure endpoint: ${action}`,
      });
    }
  }

  // Check for suspicious port
  if (hasSuspiciousPort(pageUrl)) {
    issues.push({
      type: SSLIssueType.SUSPICIOUS_PORT,
      severity: 'medium',
      message: 'Page uses a non-standard port',
    });
  }

  return {
    isSecure: secure,
    protocol: secure ? 'https' : 'http',
    hasValidCertificate: secure && issues.length === 0,
    issues,
  };
}

/**
 * Calculate SSL security score (0-100, higher = more secure)
 */
export function calculateSSLScore(sslInfo: SSLInfo): number {
  let score = 100;

  if (!sslInfo.isSecure) {
    score -= 40;
  }

  for (const issue of sslInfo.issues) {
    switch (issue.severity) {
      case 'high':
        score -= 25;
        break;
      case 'medium':
        score -= 15;
        break;
      case 'low':
        score -= 5;
        break;
    }
  }

  return Math.max(0, score);
}
