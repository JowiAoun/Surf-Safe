import { describe, it, expect } from 'vitest';

/**
 * Phase 7 Unit Tests: Enhanced Detection Features
 *
 * These tests verify:
 * - Heuristic pattern detection
 * - SSL validation
 * - Combined scoring
 */

import {
  detectUrgencyPhrases,
  detectPressureTactics,
  detectTooGoodToBeTrue,
  detectSuspiciousPricing,
  detectPoorGrammar,
  detectLotteryScam,
  detectTechSupportScam,
  detectExcessiveCaps,
  runHeuristicAnalysis,
  calculateHeuristicScore,
  getHeuristicRiskLevel,
  HeuristicType,
} from '@/utils/heuristics';

import {
  isHttps,
  hasMixedContent,
  hasInsecureFormAction,
  hasSuspiciousPort,
  checkSSLSecurity,
  calculateSSLScore,
} from '@/utils/ssl';

// ============================================================================
// Urgency Detection Tests
// ============================================================================

describe('Urgency Detection', () => {
  it('should detect "act now" pattern', () => {
    const findings = detectUrgencyPhrases('Act now to claim your prize!');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe(HeuristicType.URGENCY);
  });

  it('should detect "limited time" pattern', () => {
    const findings = detectUrgencyPhrases('This limited time offer expires soon!');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('should detect "final notice" pattern', () => {
    const findings = detectUrgencyPhrases('This is your FINAL NOTICE');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe('high');
  });

  it('should not flag normal text', () => {
    const findings = detectUrgencyPhrases('Welcome to our website. Browse our products.');
    expect(findings.length).toBe(0);
  });
});

// ============================================================================
// Pressure Tactics Tests
// ============================================================================

describe('Pressure Tactics Detection', () => {
  it('should detect "only X left" pattern', () => {
    const findings = detectPressureTactics('Only 3 left in stock!');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe(HeuristicType.PRESSURE);
  });

  it('should detect "you have been selected" pattern', () => {
    const findings = detectPressureTactics('You have been selected for this exclusive offer');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('should detect "once in a lifetime" pattern', () => {
    const findings = detectPressureTactics('This is a once in a lifetime opportunity');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe('high');
  });
});

// ============================================================================
// Too Good To Be True Tests
// ============================================================================

describe('Too Good To Be True Detection', () => {
  it('should detect "free money" pattern', () => {
    const findings = detectTooGoodToBeTrue('Get free money now!');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe(HeuristicType.TOO_GOOD);
  });

  it('should detect "you won" pattern', () => {
    const findings = detectTooGoodToBeTrue('Congratulations! You\'ve won $10,000!');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('should detect "make $X/day" pattern', () => {
    const findings = detectTooGoodToBeTrue('Make $500 a day from home!');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('should detect "easy money" pattern', () => {
    const findings = detectTooGoodToBeTrue('Easy money without any effort');
    expect(findings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Suspicious Pricing Tests
// ============================================================================

describe('Suspicious Pricing Detection', () => {
  it('should detect "$0" pricing', () => {
    const findings = detectSuspiciousPricing('Get it for $0 today!');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe(HeuristicType.SUSPICIOUS_PRICING);
  });

  it('should detect 90%+ off discounts', () => {
    const findings = detectSuspiciousPricing('Save up to 95% on everything!');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('should detect "100% free" claims', () => {
    const findings = detectSuspiciousPricing('This product is 100% free');
    expect(findings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Poor Grammar Tests
// ============================================================================

describe('Poor Grammar Detection', () => {
  it('should detect "kindly do" pattern', () => {
    const findings = detectPoorGrammar('Kindly do submit your information');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe(HeuristicType.POOR_GRAMMAR);
  });

  it('should detect "dear customer" pattern', () => {
    const findings = detectPoorGrammar('Dear customer, your account needs verification');
    expect(findings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Lottery Scam Tests
// ============================================================================

describe('Lottery Scam Detection', () => {
  it('should detect lottery winner claims', () => {
    const findings = detectLotteryScam('You are the lottery winner!');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe(HeuristicType.LOTTERY_SCAM);
  });

  it('should detect inheritance scams', () => {
    const findings = detectLotteryScam('You have an unclaimed inheritance of $5 million');
    expect(findings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Tech Support Scam Tests
// ============================================================================

describe('Tech Support Scam Detection', () => {
  it('should detect "computer infected" pattern', () => {
    const findings = detectTechSupportScam('Your computer is infected with a virus!');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe(HeuristicType.TECH_SUPPORT_SCAM);
  });

  it('should detect "account suspended" pattern', () => {
    const findings = detectTechSupportScam('Your account will be suspended immediately');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('should detect fake Microsoft support', () => {
    const findings = detectTechSupportScam('Call Microsoft support now');
    expect(findings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Excessive Caps Tests
// ============================================================================

describe('Excessive Caps Detection', () => {
  it('should detect excessive capitals', () => {
    const text = 'WIN BIG MONEY TODAY FREE CASH PRIZE NOW HURRY ACT NOW LIMITED OFFER CLICK HERE BUY NOW';
    const findings = detectExcessiveCaps(text);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe(HeuristicType.EXCESSIVE_CAPS);
  });

  it('should not flag normal text', () => {
    const text = 'This is a normal sentence with some words.';
    const findings = detectExcessiveCaps(text);
    expect(findings.length).toBe(0);
  });
});

// ============================================================================
// Heuristic Scoring Tests
// ============================================================================

describe('Heuristic Score Calculation', () => {
  it('should return 0 for no findings', () => {
    const score = calculateHeuristicScore([]);
    expect(score).toBe(0);
  });

  it('should add 5 for low severity finding', () => {
    const score = calculateHeuristicScore([
      { type: HeuristicType.POOR_GRAMMAR, pattern: 'test', severity: 'low', evidence: 'test' },
    ]);
    expect(score).toBe(5);
  });

  it('should add 15 for medium severity finding', () => {
    const score = calculateHeuristicScore([
      { type: HeuristicType.URGENCY, pattern: 'test', severity: 'medium', evidence: 'test' },
    ]);
    expect(score).toBe(15);
  });

  it('should add 25 for high severity finding', () => {
    const score = calculateHeuristicScore([
      { type: HeuristicType.TOO_GOOD, pattern: 'test', severity: 'high', evidence: 'test' },
    ]);
    expect(score).toBe(25);
  });

  it('should cap score at 100', () => {
    const findings = Array(10).fill(null).map(() => ({
      type: HeuristicType.TOO_GOOD,
      pattern: 'test',
      severity: 'high' as const,
      evidence: 'test',
    }));
    const score = calculateHeuristicScore(findings);
    expect(score).toBe(100);
  });

  it('should add bonus for multiple types', () => {
    const findings = [
      { type: HeuristicType.URGENCY, pattern: 'test', severity: 'high' as const, evidence: 'test' },
      { type: HeuristicType.PRESSURE, pattern: 'test', severity: 'high' as const, evidence: 'test' },
      { type: HeuristicType.TOO_GOOD, pattern: 'test', severity: 'high' as const, evidence: 'test' },
    ];
    const score = calculateHeuristicScore(findings);
    expect(score).toBe(25 + 25 + 25 + 20); // 3 high + multi-type bonus
  });
});

// ============================================================================
// Risk Level Tests
// ============================================================================

describe('Heuristic Risk Level', () => {
  it('should return SAFE for low scores', () => {
    expect(getHeuristicRiskLevel(0)).toBe('SAFE');
    expect(getHeuristicRiskLevel(10)).toBe('SAFE');
  });

  it('should return LOW for scores 15-29', () => {
    expect(getHeuristicRiskLevel(15)).toBe('LOW');
    expect(getHeuristicRiskLevel(25)).toBe('LOW');
  });

  it('should return MEDIUM for scores 30-49', () => {
    expect(getHeuristicRiskLevel(30)).toBe('MEDIUM');
    expect(getHeuristicRiskLevel(45)).toBe('MEDIUM');
  });

  it('should return HIGH for scores 50-69', () => {
    expect(getHeuristicRiskLevel(50)).toBe('HIGH');
    expect(getHeuristicRiskLevel(65)).toBe('HIGH');
  });

  it('should return CRITICAL for scores 70+', () => {
    expect(getHeuristicRiskLevel(70)).toBe('CRITICAL');
    expect(getHeuristicRiskLevel(100)).toBe('CRITICAL');
  });
});

// ============================================================================
// Full Heuristic Analysis Tests
// ============================================================================

describe('Full Heuristic Analysis', () => {
  it('should detect multiple issues in scam text', () => {
    const scamText = `
      CONGRATULATIONS! You've won $1,000,000!
      ACT NOW - this is your FINAL NOTICE!
      Only 2 hours left to claim your FREE CASH prize!
      Kindly provide your bank details to receive payment.
    `;
    const result = runHeuristicAnalysis(scamText);
    expect(result.score).toBeGreaterThan(50);
    expect(result.findings.length).toBeGreaterThan(3);
    expect(result.shouldSkipLLM).toBe(true);
  });

  it('should return low score for normal text', () => {
    const normalText = `
      Welcome to our online store. Browse our collection of products.
      Free shipping on orders over $50. Sale ends Sunday.
      Contact us at support@example.com for assistance.
    `;
    const result = runHeuristicAnalysis(normalText);
    expect(result.score).toBeLessThan(30);
    expect(result.shouldSkipLLM).toBe(false);
  });
});

// ============================================================================
// SSL Validation Tests
// ============================================================================

describe('SSL Validation', () => {
  describe('isHttps', () => {
    it('should return true for HTTPS URLs', () => {
      expect(isHttps('https://example.com')).toBe(true);
    });

    it('should return false for HTTP URLs', () => {
      expect(isHttps('http://example.com')).toBe(false);
    });

    it('should handle invalid URLs', () => {
      expect(isHttps('not-a-url')).toBe(false);
    });
  });

  describe('hasMixedContent', () => {
    it('should detect HTTP resources on HTTPS page', () => {
      const result = hasMixedContent('https://example.com', [
        'http://cdn.example.com/image.jpg',
      ]);
      expect(result).toBe(true);
    });

    it('should return false for all HTTPS resources', () => {
      const result = hasMixedContent('https://example.com', [
        'https://cdn.example.com/image.jpg',
      ]);
      expect(result).toBe(false);
    });
  });

  describe('hasInsecureFormAction', () => {
    it('should detect HTTP form action on HTTPS page', () => {
      const result = hasInsecureFormAction('http://other.com/submit', 'https://example.com');
      expect(result).toBe(true);
    });

    it('should allow HTTPS form action', () => {
      const result = hasInsecureFormAction('https://example.com/submit', 'https://example.com');
      expect(result).toBe(false);
    });
  });

  describe('hasSuspiciousPort', () => {
    it('should detect development ports', () => {
      expect(hasSuspiciousPort('https://example.com:3000')).toBe(true);
      expect(hasSuspiciousPort('https://example.com:8080')).toBe(true);
    });

    it('should allow standard ports', () => {
      expect(hasSuspiciousPort('https://example.com')).toBe(false);
      expect(hasSuspiciousPort('https://example.com:443')).toBe(false);
    });
  });
});

// ============================================================================
// SSL Security Check Tests
// ============================================================================

describe('SSL Security Check', () => {
  it('should report issues for HTTP page', () => {
    const info = checkSSLSecurity('http://example.com');
    expect(info.isSecure).toBe(false);
    expect(info.issues.length).toBeGreaterThan(0);
  });

  it('should pass for secure HTTPS page', () => {
    const info = checkSSLSecurity('https://example.com');
    expect(info.isSecure).toBe(true);
    expect(info.hasValidCertificate).toBe(true);
  });

  it('should detect insecure form actions', () => {
    const info = checkSSLSecurity('https://example.com', ['http://bad.com/submit']);
    expect(info.issues.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// SSL Score Tests
// ============================================================================

describe('SSL Score Calculation', () => {
  it('should return 100 for fully secure page', () => {
    const info = checkSSLSecurity('https://example.com');
    const score = calculateSSLScore(info);
    expect(score).toBe(100);
  });

  it('should penalize HTTP pages', () => {
    const info = checkSSLSecurity('http://example.com');
    const score = calculateSSLScore(info);
    expect(score).toBeLessThan(60);
  });

  it('should penalize insecure form actions', () => {
    const info = checkSSLSecurity('https://example.com', ['http://bad.com/submit']);
    const score = calculateSSLScore(info);
    expect(score).toBeLessThan(100);
  });
});
