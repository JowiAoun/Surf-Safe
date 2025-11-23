import { ApiConfig, PageAnalysisRequest, AnalysisResult, RiskLevel, ThreatLabel } from '@/types';

/**
 * LLM API client for scam detection
 */
export class LLMApiClient {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  /**
   * Analyze a page for scam indicators
   */
  async analyzePage(request: PageAnalysisRequest): Promise<AnalysisResult> {
    const prompt = this.buildPrompt(request);

    try {
      const response = await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content in API response');
      }

      return this.parseResponse(content);
    } catch (error) {
      console.error('LLM API error:', error);
      throw error;
    }
  }

  /**
   * Build the analysis prompt
   */
  private buildPrompt(request: PageAnalysisRequest): string {
    return `Analyze this website for scam indicators:

URL: ${request.url}
Title: ${request.title}
Meta Description: ${request.metaDescription || 'N/A'}

Headings: ${request.headings.slice(0, 10).join(', ')}

Links (sample): ${request.links.slice(0, 5).map((l) => `${l.text} (${l.href})`).join(', ')}

Forms: ${request.forms.length > 0 ? request.forms.map((f) => `Action: ${f.action}, Fields: ${f.fields.join(', ')}`).join(' | ') : 'None'}

Body text (first 1000 chars): ${request.bodyText.substring(0, 1000)}

Analyze for these threat indicators:
- URGENCY: Time-pressure tactics
- PRESSURE: Coercive language
- TOO_GOOD_TO_BE_TRUE: Unrealistic promises
- POOR_GRAMMAR: Language quality issues
- SENSITIVE_DATA_REQ: Unusual data requests
- FAKE_TRUST_SIGNALS: False authority badges
- SUSPICIOUS_LINK: Malformed/misleading URLs
- IMPERSONATION: Brand/entity mimicry
- SUSPICIOUS_DOMAIN: Suspicious domain characteristics

Respond in JSON format:
{
  "riskLevel": "SAFE|LOW|MEDIUM|HIGH|CRITICAL",
  "threats": ["THREAT1", "THREAT2"],
  "explanation": "Brief explanation of findings",
  "confidence": 0.0-1.0
}`;
  }

  /**
   * System prompt for the LLM
   */
  private getSystemPrompt(): string {
    return `You are a cybersecurity expert specializing in scam detection. Analyze websites for scam indicators and provide accurate risk assessments. Be thorough but concise. Always respond in valid JSON format.`;
  }

  /**
   * Parse LLM response into AnalysisResult
   */
  private parseResponse(content: string): AnalysisResult {
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonString.trim());

      return {
        riskLevel: parsed.riskLevel as RiskLevel,
        threats: parsed.threats as ThreatLabel[],
        explanation: parsed.explanation,
        confidence: parsed.confidence,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', content, error);
      throw new Error('Invalid LLM response format');
    }
  }
}

/**
 * Create an LLM API client instance
 */
export function createApiClient(config: ApiConfig): LLMApiClient {
  return new LLMApiClient(config);
}
