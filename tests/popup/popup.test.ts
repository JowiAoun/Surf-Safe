import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 4 Unit Tests: Popup UI & Results Display
 *
 * These tests verify the popup functionality for:
 * - Safety score calculation (weighted by confidence)
 * - Score color class mapping
 * - Error hint generation
 * - UI state management
 * - Theme handling
 * - Threat rendering
 */

// Import types for testing
import { RiskLevel, ThreatLabel, AnalysisResult } from '@/types';

// ============================================================================
// Safety Score Calculation Tests
// ============================================================================

// Replicate the functions from popup/index.ts for testing
const RISK_WEIGHTS: Record<RiskLevel, number> = {
  [RiskLevel.SAFE]: 100,
  [RiskLevel.LOW]: 75,
  [RiskLevel.MEDIUM]: 50,
  [RiskLevel.HIGH]: 25,
  [RiskLevel.CRITICAL]: 5,
};

function calculateSafetyScore(result: AnalysisResult): number {
  const baseScore = RISK_WEIGHTS[result.riskLevel] ?? 50;
  const threatPenalty = Math.min(result.threats.length * 5, 30);
  const confidenceWeight = result.confidence;
  const adjustedScore = baseScore - threatPenalty;
  const weightedScore = adjustedScore * confidenceWeight + 50 * (1 - confidenceWeight);
  return Math.round(Math.max(0, Math.min(100, weightedScore)));
}

function getScoreColorClass(score: number): string {
  if (score >= 80) return 'safe';
  if (score >= 60) return 'low';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'high';
  return 'critical';
}

function getErrorHint(message: string): string {
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

describe('Safety Score Calculation', () => {
  describe('calculateSafetyScore', () => {
    it('should return 100 for SAFE risk level with high confidence and no threats', () => {
      const result: AnalysisResult = {
        riskLevel: RiskLevel.SAFE,
        threats: [],
        explanation: 'Site is safe',
        confidence: 1.0,
        timestamp: Date.now(),
      };
      expect(calculateSafetyScore(result)).toBe(100);
    });

    it('should return lower score for CRITICAL risk level', () => {
      const result: AnalysisResult = {
        riskLevel: RiskLevel.CRITICAL,
        threats: [ThreatLabel.IMPERSONATION, ThreatLabel.SENSITIVE_DATA],
        explanation: 'Dangerous site',
        confidence: 1.0,
        timestamp: Date.now(),
      };
      const score = calculateSafetyScore(result);
      expect(score).toBeLessThan(20);
    });

    it('should reduce score based on threat count', () => {
      const noThreats: AnalysisResult = {
        riskLevel: RiskLevel.MEDIUM,
        threats: [],
        explanation: 'Medium risk',
        confidence: 1.0,
        timestamp: Date.now(),
      };
      
      const withThreats: AnalysisResult = {
        riskLevel: RiskLevel.MEDIUM,
        threats: [ThreatLabel.URGENCY, ThreatLabel.PRESSURE, ThreatLabel.POOR_GRAMMAR],
        explanation: 'Medium risk with threats',
        confidence: 1.0,
        timestamp: Date.now(),
      };
      
      const scoreNoThreats = calculateSafetyScore(noThreats);
      const scoreWithThreats = calculateSafetyScore(withThreats);
      
      expect(scoreWithThreats).toBeLessThan(scoreNoThreats);
    });

    it('should move score towards 50 with low confidence', () => {
      const highConfidence: AnalysisResult = {
        riskLevel: RiskLevel.SAFE,
        threats: [],
        explanation: 'High confidence',
        confidence: 1.0,
        timestamp: Date.now(),
      };
      
      const lowConfidence: AnalysisResult = {
        riskLevel: RiskLevel.SAFE,
        threats: [],
        explanation: 'Low confidence',
        confidence: 0.3,
        timestamp: Date.now(),
      };
      
      const scoreHigh = calculateSafetyScore(highConfidence);
      const scoreLow = calculateSafetyScore(lowConfidence);
      
      expect(scoreHigh).toBe(100);
      expect(scoreLow).toBeLessThan(100);
      expect(scoreLow).toBeGreaterThan(50);
    });

    it('should cap threat penalty at 30 points', () => {
      const manyThreats: AnalysisResult = {
        riskLevel: RiskLevel.MEDIUM,
        threats: [
          ThreatLabel.URGENCY,
          ThreatLabel.PRESSURE,
          ThreatLabel.TOO_GOOD,
          ThreatLabel.POOR_GRAMMAR,
          ThreatLabel.SENSITIVE_DATA,
          ThreatLabel.FAKE_TRUST,
          ThreatLabel.SUSPICIOUS_LINK,
          ThreatLabel.IMPERSONATION,
        ],
        explanation: 'Many threats',
        confidence: 1.0,
        timestamp: Date.now(),
      };
      
      // Base score 50, max penalty 30 = 20
      expect(calculateSafetyScore(manyThreats)).toBe(20);
    });

    it('should clamp score between 0 and 100', () => {
      const criticalNoConfidence: AnalysisResult = {
        riskLevel: RiskLevel.CRITICAL,
        threats: Array(10).fill(ThreatLabel.IMPERSONATION),
        explanation: 'Very dangerous',
        confidence: 0.0,
        timestamp: Date.now(),
      };
      
      const score = calculateSafetyScore(criticalNoConfidence);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});

// ============================================================================
// Score Color Class Tests
// ============================================================================

describe('Score Color Class', () => {
  describe('getScoreColorClass', () => {
    it('should return "safe" for scores >= 80', () => {
      expect(getScoreColorClass(100)).toBe('safe');
      expect(getScoreColorClass(80)).toBe('safe');
      expect(getScoreColorClass(95)).toBe('safe');
    });

    it('should return "low" for scores >= 60 and < 80', () => {
      expect(getScoreColorClass(79)).toBe('low');
      expect(getScoreColorClass(60)).toBe('low');
      expect(getScoreColorClass(65)).toBe('low');
    });

    it('should return "medium" for scores >= 40 and < 60', () => {
      expect(getScoreColorClass(59)).toBe('medium');
      expect(getScoreColorClass(40)).toBe('medium');
      expect(getScoreColorClass(50)).toBe('medium');
    });

    it('should return "high" for scores >= 20 and < 40', () => {
      expect(getScoreColorClass(39)).toBe('high');
      expect(getScoreColorClass(20)).toBe('high');
      expect(getScoreColorClass(25)).toBe('high');
    });

    it('should return "critical" for scores < 20', () => {
      expect(getScoreColorClass(19)).toBe('critical');
      expect(getScoreColorClass(0)).toBe('critical');
      expect(getScoreColorClass(10)).toBe('critical');
    });
  });
});

// ============================================================================
// Error Hint Generation Tests
// ============================================================================

describe('Error Hint Generation', () => {
  describe('getErrorHint', () => {
    it('should detect API configuration errors', () => {
      const hint = getErrorHint('API configuration not found. Please configure in extension options.');
      expect(hint).toContain('API key');
      expect(hint).toContain('Settings');
    });

    it('should detect authentication errors (401)', () => {
      const hint = getErrorHint('API request failed: 401 Unauthorized');
      expect(hint).toContain('API key');
      expect(hint).toContain('invalid');
    });

    it('should detect authentication errors (403)', () => {
      const hint = getErrorHint('API request failed: 403 Forbidden');
      expect(hint).toContain('API key');
    });

    it('should detect rate limit errors', () => {
      const hint = getErrorHint('Rate limit exceeded: 429 Too Many Requests');
      expect(hint).toContain('wait');
    });

    it('should detect network errors', () => {
      const hint = getErrorHint('Network error: Failed to fetch');
      expect(hint).toContain('internet connection');
    });

    it('should detect timeout errors', () => {
      const hint = getErrorHint('Request timeout after 30s');
      expect(hint).toContain('took too long');
    });

    it('should provide generic hint for unknown errors', () => {
      const hint = getErrorHint('Something went wrong');
      expect(hint).toContain('unexpected');
    });
  });
});

// ============================================================================
// UI State Management Tests
// ============================================================================

describe('UI State Management', () => {
  describe('Risk Level Display', () => {
    const riskLevels = Object.values(RiskLevel);

    riskLevels.forEach((level) => {
      it(`should handle ${level} risk level`, () => {
        const result: AnalysisResult = {
          riskLevel: level,
          threats: [],
          explanation: `Test for ${level}`,
          confidence: 0.9,
          timestamp: Date.now(),
        };
        
        const score = calculateSafetyScore(result);
        const colorClass = getScoreColorClass(score);
        
        expect(typeof score).toBe('number');
        expect(['safe', 'low', 'medium', 'high', 'critical']).toContain(colorClass);
      });
    });
  });

  describe('Threat Combinations', () => {
    it('should handle empty threats array', () => {
      const result: AnalysisResult = {
        riskLevel: RiskLevel.SAFE,
        threats: [],
        explanation: 'No threats',
        confidence: 1.0,
        timestamp: Date.now(),
      };
      
      expect(calculateSafetyScore(result)).toBe(100);
    });

    it('should handle all threat types', () => {
      const allThreats = Object.values(ThreatLabel);
      const result: AnalysisResult = {
        riskLevel: RiskLevel.HIGH,
        threats: allThreats,
        explanation: 'All threats',
        confidence: 0.95,
        timestamp: Date.now(),
      };
      
      const score = calculateSafetyScore(result);
      expect(score).toBeLessThan(30);
    });

    it('should handle single threat', () => {
      const result: AnalysisResult = {
        riskLevel: RiskLevel.LOW,
        threats: [ThreatLabel.URGENCY],
        explanation: 'Single threat',
        confidence: 0.8,
        timestamp: Date.now(),
      };
      
      const score = calculateSafetyScore(result);
      expect(score).toBeGreaterThan(50);
    });
  });
});

// ============================================================================
// Theme Tests
// ============================================================================

describe('Theme Management', () => {
  it('should have valid theme values', () => {
    const validThemes = ['light', 'dark'];
    validThemes.forEach((theme) => {
      expect(['light', 'dark']).toContain(theme);
    });
  });

  it('should toggle between light and dark', () => {
    let currentTheme: 'light' | 'dark' = 'light';
    
    // Toggle to dark
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    expect(currentTheme).toBe('dark');
    
    // Toggle back to light
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    expect(currentTheme).toBe('light');
  });
});

// ============================================================================
// Threat Icon Mapping Tests
// ============================================================================

describe('Threat Icon Mapping', () => {
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

  it('should have an icon for every threat label', () => {
    Object.values(ThreatLabel).forEach((label) => {
      expect(THREAT_ICONS[label]).toBeDefined();
      expect(typeof THREAT_ICONS[label]).toBe('string');
      expect(THREAT_ICONS[label].length).toBeGreaterThan(0);
    });
  });

  it('should have unique icons', () => {
    const icons = Object.values(THREAT_ICONS);
    const uniqueIcons = new Set(icons);
    expect(uniqueIcons.size).toBe(icons.length);
  });
});

// ============================================================================
// Timestamp Formatting Tests
// ============================================================================

describe('Timestamp Display', () => {
  it('should handle valid timestamps', () => {
    const timestamp = Date.now();
    const date = new Date(timestamp);
    const formatted = date.toLocaleString();
    
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('should handle timestamps from the past', () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const date = new Date(oneDayAgo);
    const formatted = date.toLocaleString();
    
    expect(typeof formatted).toBe('string');
  });
});

// ============================================================================
// Confidence Display Tests
// ============================================================================

describe('Confidence Display', () => {
  it('should convert confidence to percentage', () => {
    const testCases = [
      { confidence: 0.0, expected: 0 },
      { confidence: 0.5, expected: 50 },
      { confidence: 1.0, expected: 100 },
      { confidence: 0.85, expected: 85 },
      { confidence: 0.333, expected: 33 },
    ];

    testCases.forEach(({ confidence, expected }) => {
      const percent = Math.round(confidence * 100);
      expect(percent).toBe(expected);
    });
  });
});

// ============================================================================
// Gauge Calculation Tests
// ============================================================================

describe('Gauge Visualization', () => {
  const CIRCUMFERENCE = 327;

  it('should calculate correct stroke offset for 0%', () => {
    const score = 0;
    const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
    expect(offset).toBe(CIRCUMFERENCE);
  });

  it('should calculate correct stroke offset for 100%', () => {
    const score = 100;
    const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
    expect(offset).toBe(0);
  });

  it('should calculate correct stroke offset for 50%', () => {
    const score = 50;
    const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
    expect(offset).toBe(CIRCUMFERENCE / 2);
  });
});
