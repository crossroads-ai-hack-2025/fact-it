/**
 * Perplexity provider implementation
 * Uses Sonar Pro model with built-in real-time search for both detection and verification
 */

import { generateObject } from 'ai';
import { createPerplexity } from '@ai-sdk/perplexity';
import { z } from 'zod';
import { EXTENSION_NAME } from '@/shared/constants';
import {
  AIProvider,
  ClaimDetectionResult,
  ClaimDetectionSchema,
  VerificationVerdictResult,
  VerificationVerdictSchema,
} from './types';

export class PerplexityProvider implements AIProvider {
  readonly id = 'perplexity';
  readonly displayName = 'Perplexity';

  /**
   * Test API key validity by making a minimal API call
   */
  async testApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const perplexity = createPerplexity({ apiKey });

      await generateObject({
        model: perplexity('sonar'),
        schema: z.object({ test: z.string() }),
        prompt: 'test',
      });

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Stage 1: Detect factual claims in text using Sonar model
   * Perplexity has built-in search, so this is faster than other providers
   *
   * @param text - Text to analyze for factual claims
   * @param apiKey - Perplexity API key
   * @returns Detection result with hasClaim boolean, list of claims, and reasoning
   */
  async detectClaims(text: string, apiKey: string): Promise<ClaimDetectionResult> {
    const systemPrompt = `You are a fact-checking assistant specializing in claim detection.

Your task: Analyze text and identify specific factual claims that can be objectively verified.

INCLUDE:
- Statements about verifiable facts (dates, numbers, events, scientific claims)
- Historical claims that can be checked against records
- Statistical claims with specific numbers or data
- Claims about public figures' actions, statements, or positions
- Claims about companies, organizations, policies
- Claims about current events with verifiable details

EXCLUDE:
- Pure opinions and subjective judgments ("I think...", "in my opinion...")
- Questions without factual assertions
- Predictions about the future (unless claiming historical precedent)
- Personal preferences ("I like...", "X is beautiful")
- General commentary without specific verifiable assertions
- Expressions of emotion or sentiment
- Hypotheticals and conditionals without factual basis

EXAMPLES:
✓ "The Eiffel Tower is 330 meters tall" → HAS CLAIM (verifiable measurement)
✓ "Biden signed an executive order on climate change in 2021" → HAS CLAIM (verifiable event)
✗ "I think climate change is the biggest threat" → NO CLAIM (opinion)
✗ "What will happen if we don't act?" → NO CLAIM (question)
✓ "Scientists have found evidence of water on Mars" → HAS CLAIM (verifiable scientific finding)
✗ "This is the best solution" → NO CLAIM (subjective judgment)

Be conservative: only identify claims that can be fact-checked against reliable sources.`;

    const userPrompt = `Analyze this text for factual claims:

"${text}"`;

    console.info(
      `${EXTENSION_NAME}: [Perplexity] Stage 1 - Detecting claims (model: sonar)`
    );

    const perplexity = createPerplexity({ apiKey });

    const { object, usage } = await generateObject({
      model: perplexity('sonar'),
      schema: ClaimDetectionSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.3, // Low temperature for consistent classification
    });

    console.info(
      `${EXTENSION_NAME}: [Perplexity] Stage 1 - Result: ${object.hasClaim ? 'HAS CLAIMS' : 'NO CLAIMS'} (tokens: ${usage.totalTokens})`
    );

    if (object.hasClaim && object.claims.length > 0) {
      console.info(
        `${EXTENSION_NAME}: [Perplexity] Stage 1 - Claims found: ${object.claims.join('; ')}`
      );
    }

    return object;
  }

  /**
   * Stage 2: Verify factual claim using Sonar Pro with built-in search
   * Perplexity automatically searches the web and provides citation-backed responses
   *
   * @param claim - Factual claim to verify
   * @param apiKey - Perplexity API key
   * @returns Verification verdict with confidence, explanation, and sources
   */
  async verifyClaim(claim: string, apiKey: string): Promise<VerificationVerdictResult> {
    console.info(
      `${EXTENSION_NAME}: [Perplexity] Stage 2 - Verifying claim (model: sonar-pro)`
    );
    console.info(`${EXTENSION_NAME}: [Perplexity] Claim: "${claim}"`);

    const systemPrompt = `You are a fact-checking assistant with built-in web search capabilities.

When verifying claims:
1. Analyze the claim to identify key factual assertions
2. Search the web for relevant authoritative sources
3. Evaluate source credibility (prefer established media, scientific journals, official sources)
4. Synthesize findings into a verdict with evidence

VERDICT CATEGORIES:
- "true": Claim is supported by multiple credible sources with strong evidence
- "false": Claim is contradicted by credible evidence
- "unknown": Insufficient evidence, conflicting sources, or claim is unverifiable

CONFIDENCE SCORING:
- 90-100: Very strong evidence from multiple authoritative sources
- 70-89: Strong evidence but some limitations or minor conflicts
- 50-69: Mixed evidence or moderate quality sources
- 30-49: Weak evidence or significant uncertainties
- 0-29: Very little evidence or highly unreliable sources

IMPORTANT GUIDELINES:
- Be conservative: when in doubt, use "unknown" rather than forcing a verdict
- Always provide source URLs in your response
- Consider recency of sources for time-sensitive claims
- Acknowledge uncertainty and conflicting evidence
- Prefer "unknown" for claims that cannot be verified with available evidence`;

    const userPrompt = `Verify this claim using web search and provide a detailed analysis: "${claim}"

Return your response in this exact JSON format:
{
  "verdict": "true" | "false" | "unknown",
  "confidence": <number 0-100>,
  "explanation": "<2-3 sentence explanation citing specific sources>",
  "sources": [
    {"title": "<source title>", "url": "<source url>"}
  ]
}

Remember:
- "true" if claim is supported by multiple credible sources
- "false" if claim is contradicted by credible evidence
- "unknown" if insufficient evidence or conflicting information
- Include the most relevant sources (max 5)
- Be conservative - prefer "unknown" when uncertain`;

    const perplexity = createPerplexity({ apiKey });

    console.info(
      `${EXTENSION_NAME}: [Perplexity] Using built-in real-time search (SimpleQA F-score: 0.858)...`
    );

    // Perplexity has built-in search, no separate tool needed
    const { object, usage } = await generateObject({
      model: perplexity('sonar-pro'),
      schema: VerificationVerdictSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.5,
    });

    console.info(
      `${EXTENSION_NAME}: [Perplexity] Stage 2 - Verification complete (tokens: ${usage.totalTokens})`
    );
    console.info(
      `${EXTENSION_NAME}: [Perplexity] Stage 2 - Verdict: ${object.verdict} (confidence: ${object.confidence}%)`
    );

    return object;
  }
}
