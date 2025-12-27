/**
 * Heuristic Detection Module for SurfSafe
 * Provides quick local pattern detection before LLM analysis
 */

// ============================================================================
// Types
// ============================================================================

export interface HeuristicFinding {
  type: HeuristicType;
  pattern: string;
  severity: 'low' | 'medium' | 'high';
  evidence: string;
}

export interface HeuristicResult {
  score: number; // 0-100, higher = more suspicious
  findings: HeuristicFinding[];
  shouldSkipLLM: boolean; // true if heuristics are conclusive
}

export enum HeuristicType {
  URGENCY = 'URGENCY',
  PRESSURE = 'PRESSURE',
  TOO_GOOD = 'TOO_GOOD_TO_BE_TRUE',
  SUSPICIOUS_PRICING = 'SUSPICIOUS_PRICING',
  POOR_GRAMMAR = 'POOR_GRAMMAR',
  EXCESSIVE_CAPS = 'EXCESSIVE_CAPS',
  SUSPICIOUS_CLAIMS = 'SUSPICIOUS_CLAIMS',
  LOTTERY_SCAM = 'LOTTERY_SCAM',
  TECH_SUPPORT_SCAM = 'TECH_SUPPORT_SCAM',
}

// ============================================================================
// Pattern Definitions
// ============================================================================

const URGENCY_PATTERNS: Array<{ pattern: RegExp; severity: 'low' | 'medium' | 'high' }> = [
  { pattern: /act\s+now/i, severity: 'high' },
  { pattern: /limited\s+time\s+offer/i, severity: 'high' },
  { pattern: /expires?\s+(today|soon|in\s+\d+)/i, severity: 'high' },
  { pattern: /hurry/i, severity: 'medium' },
  { pattern: /don'?t\s+miss\s+(out|this)/i, severity: 'medium' },
  { pattern: /last\s+chance/i, severity: 'high' },
  { pattern: /urgent/i, severity: 'medium' },
  { pattern: /immediate(ly)?\s+(action|response)/i, severity: 'high' },
  { pattern: /within\s+24\s+hours/i, severity: 'medium' },
  { pattern: /deadline/i, severity: 'low' },
  { pattern: /final\s+(notice|warning)/i, severity: 'high' },
];

const PRESSURE_PATTERNS: Array<{ pattern: RegExp; severity: 'low' | 'medium' | 'high' }> = [
  { pattern: /only\s+\d+\s+(left|remaining)/i, severity: 'high' },
  { pattern: /\d+\s+people\s+(are\s+)?(viewing|watching)/i, severity: 'medium' },
  { pattern: /selling\s+fast/i, severity: 'medium' },
  { pattern: /limited\s+(stock|quantity|availability)/i, severity: 'medium' },
  { pattern: /exclusive\s+offer/i, severity: 'low' },
  { pattern: /once\s+in\s+a\s+lifetime/i, severity: 'high' },
  { pattern: /you('ve)?\s+been\s+(selected|chosen)/i, severity: 'high' },
  { pattern: /special(ly)?\s+selected/i, severity: 'medium' },
];

const TOO_GOOD_PATTERNS: Array<{ pattern: RegExp; severity: 'low' | 'medium' | 'high' }> = [
  { pattern: /free\s+(money|cash|gift)/i, severity: 'high' },
  { pattern: /you('ve)?\s+(won|win)/i, severity: 'high' },
  { pattern: /congratulations?\s*[!.]/i, severity: 'high' },
  { pattern: /claim\s+your\s+(prize|reward|gift)/i, severity: 'high' },
  { pattern: /guaranteed\s+(income|returns?|profit)/i, severity: 'high' },
  { pattern: /make\s+\$?\d+k?\s+(a\s+)?(day|week|month)/i, severity: 'high' },
  { pattern: /work\s+from\s+home.{0,20}\$\d+/i, severity: 'medium' },
  { pattern: /easy\s+money/i, severity: 'high' },
  { pattern: /get\s+rich\s+quick/i, severity: 'high' },
  { pattern: /no\s+(experience|skills?)\s+(needed|required)/i, severity: 'medium' },
  { pattern: /risk[\s-]*free/i, severity: 'medium' },
];

const SUSPICIOUS_PRICING_PATTERNS: Array<{ pattern: RegExp; severity: 'low' | 'medium' | 'high' }> = [
  { pattern: /\$0(\.00)?/i, severity: 'medium' },
  { pattern: /100%\s+free/i, severity: 'medium' },
  { pattern: /9[0-9]%\s+off/i, severity: 'high' },
  { pattern: /save\s+(up\s+to\s+)?9[0-9]%/i, severity: 'high' },
  { pattern: /was\s+\$\d+.{0,10}now\s+\$0/i, severity: 'high' },
  { pattern: /price\s+drop.{0,20}9[0-9]%/i, severity: 'high' },
];

const GRAMMAR_PATTERNS: Array<{ pattern: RegExp; severity: 'low' | 'medium' | 'high' }> = [
  { pattern: /\btheir\s+is\b/i, severity: 'medium' },
  { pattern: /\byour\s+(a|the)\s+winner\b/i, severity: 'high' },
  { pattern: /\bkindly\s+(do|click|provide|send)\b/i, severity: 'medium' },
  { pattern: /\bdear\s+(customer|user|valued)\b/i, severity: 'low' },
  { pattern: /\brevert\s+back\b/i, severity: 'low' },
  { pattern: /\bdo\s+the\s+needful\b/i, severity: 'medium' },
];

const LOTTERY_SCAM_PATTERNS: Array<{ pattern: RegExp; severity: 'low' | 'medium' | 'high' }> = [
  { pattern: /lottery\s+(winner|winning)/i, severity: 'high' },
  { pattern: /inheritance.{0,30}(million|deceased)/i, severity: 'high' },
  { pattern: /nigerian?\s+prince/i, severity: 'high' },
  { pattern: /unclaimed\s+(funds?|money|inheritance)/i, severity: 'high' },
  { pattern: /next\s+of\s+kin/i, severity: 'high' },
];

const TECH_SUPPORT_SCAM_PATTERNS: Array<{ pattern: RegExp; severity: 'low' | 'medium' | 'high' }> = [
  { pattern: /your\s+(computer|device)\s+(is|has\s+been)\s+(infected|compromised|hacked)/i, severity: 'high' },
  { pattern: /call\s+(this\s+number|us\s+immediately)/i, severity: 'medium' },
  { pattern: /microsoft\s+(support|technician)/i, severity: 'high' },
  { pattern: /virus\s+(detected|alert|warning)/i, severity: 'high' },
  { pattern: /your\s+account\s+(will\s+be|has\s+been)\s+(suspended|locked|closed)/i, severity: 'high' },
];

// ============================================================================
// Detection Functions
// ============================================================================

function detectPatterns(
  text: string,
  patterns: Array<{ pattern: RegExp; severity: 'low' | 'medium' | 'high' }>,
  type: HeuristicType
): HeuristicFinding[] {
  const findings: HeuristicFinding[] = [];

  for (const { pattern, severity } of patterns) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        type,
        pattern: pattern.source,
        severity,
        evidence: match[0],
      });
    }
  }

  return findings;
}

/**
 * Detect urgency phrases
 */
export function detectUrgencyPhrases(text: string): HeuristicFinding[] {
  return detectPatterns(text, URGENCY_PATTERNS, HeuristicType.URGENCY);
}

/**
 * Detect pressure tactics
 */
export function detectPressureTactics(text: string): HeuristicFinding[] {
  return detectPatterns(text, PRESSURE_PATTERNS, HeuristicType.PRESSURE);
}

/**
 * Detect too-good-to-be-true offers
 */
export function detectTooGoodToBeTrue(text: string): HeuristicFinding[] {
  return detectPatterns(text, TOO_GOOD_PATTERNS, HeuristicType.TOO_GOOD);
}

/**
 * Detect suspicious pricing
 */
export function detectSuspiciousPricing(text: string): HeuristicFinding[] {
  return detectPatterns(text, SUSPICIOUS_PRICING_PATTERNS, HeuristicType.SUSPICIOUS_PRICING);
}

/**
 * Detect poor grammar patterns common in scams
 */
export function detectPoorGrammar(text: string): HeuristicFinding[] {
  return detectPatterns(text, GRAMMAR_PATTERNS, HeuristicType.POOR_GRAMMAR);
}

/**
 * Detect lottery/inheritance scam patterns
 */
export function detectLotteryScam(text: string): HeuristicFinding[] {
  return detectPatterns(text, LOTTERY_SCAM_PATTERNS, HeuristicType.LOTTERY_SCAM);
}

/**
 * Detect tech support scam patterns
 */
export function detectTechSupportScam(text: string): HeuristicFinding[] {
  return detectPatterns(text, TECH_SUPPORT_SCAM_PATTERNS, HeuristicType.TECH_SUPPORT_SCAM);
}

/**
 * Detect excessive use of capitals (shouting)
 */
export function detectExcessiveCaps(text: string): HeuristicFinding[] {
  const findings: HeuristicFinding[] = [];
  
  // Count uppercase words (3+ consecutive uppercase letters)
  const upperWords = text.match(/\b[A-Z]{3,}\b/g) || [];
  const totalWords = text.split(/\s+/).length;
  
  if (totalWords > 10 && upperWords.length / totalWords > 0.15) {
    findings.push({
      type: HeuristicType.EXCESSIVE_CAPS,
      pattern: 'EXCESSIVE_CAPITALS',
      severity: 'medium',
      evidence: `${upperWords.length} uppercase words out of ${totalWords}`,
    });
  }
  
  return findings;
}

// ============================================================================
// Score Calculation
// ============================================================================

const SEVERITY_SCORES = {
  low: 5,
  medium: 15,
  high: 25,
};

/**
 * Calculate heuristic score from findings
 */
export function calculateHeuristicScore(findings: HeuristicFinding[]): number {
  let score = 0;
  const typeCount = new Map<HeuristicType, number>();

  for (const finding of findings) {
    score += SEVERITY_SCORES[finding.severity];
    typeCount.set(finding.type, (typeCount.get(finding.type) || 0) + 1);
  }

  // Bonus for multiple types of issues (more concerning)
  if (typeCount.size >= 3) {
    score += 20;
  } else if (typeCount.size === 2) {
    score += 10;
  }

  // Cap at 100
  return Math.min(100, score);
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Run full heuristic analysis on text content
 */
export function runHeuristicAnalysis(text: string): HeuristicResult {
  const allFindings: HeuristicFinding[] = [
    ...detectUrgencyPhrases(text),
    ...detectPressureTactics(text),
    ...detectTooGoodToBeTrue(text),
    ...detectSuspiciousPricing(text),
    ...detectPoorGrammar(text),
    ...detectLotteryScam(text),
    ...detectTechSupportScam(text),
    ...detectExcessiveCaps(text),
  ];

  const score = calculateHeuristicScore(allFindings);

  // Skip LLM if heuristics are very conclusive (obvious scam)
  const shouldSkipLLM = score >= 70 && allFindings.some(f => f.severity === 'high');

  return {
    score,
    findings: allFindings,
    shouldSkipLLM,
  };
}

/**
 * Get risk level from heuristic score
 */
export function getHeuristicRiskLevel(score: number): 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 70) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  if (score >= 15) return 'LOW';
  return 'SAFE';
}
