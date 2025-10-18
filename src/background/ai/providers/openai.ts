/**
 * OpenAI provider implementation
 * Uses GPT-4o-mini for claim detection and GPT-4o with web search for verification
 */

import { generateObject, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { EXTENSION_NAME } from '@/shared/constants';
import {
  AIProvider,
  ClaimDetectionResult,
  ClaimDetectionSchema,
  VerificationVerdictResult,
  VerificationVerdictSchema,
} from './types';

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai';
  readonly displayName = 'OpenAI';

  /**
   * Test API key validity by making a minimal API call
   */
  async testApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const openai = createOpenAI({ apiKey });

      await generateObject({
        model: openai('gpt-4o-mini'),
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
   * Stage 1: Detect factual claims in text using GPT-4o-mini
   * Fast classification to filter out opinions, questions, and subjective statements
   *
   * @param text - Text to analyze for factual claims
   * @param apiKey - OpenAI API key
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

    console.info(`${EXTENSION_NAME}: [OpenAI] Stage 1 - Detecting claims (model: gpt-4o-mini)`);

    const openai = createOpenAI({ apiKey });

    const { object, usage } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: ClaimDetectionSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.3, // Low temperature for consistent classification
    });

    console.info(
      `${EXTENSION_NAME}: [OpenAI] Stage 1 - Result: ${object.hasClaim ? 'HAS CLAIMS' : 'NO CLAIMS'} (tokens: ${usage.totalTokens})`
    );

    if (object.hasClaim && object.claims.length > 0) {
      console.info(
        `${EXTENSION_NAME}: [OpenAI] Stage 1 - Claims found: ${object.claims.join('; ')}`
      );
    }

    return object;
  }

  /**
   * Stage 2: Verify factual claim using GPT-4o with built-in web search
   * Uses OpenAI's integrated web search tool to find and synthesize evidence
   *
   * @param claim - Factual claim to verify
   * @param apiKey - OpenAI API key
   * @returns Verification verdict with confidence, explanation, and sources
   */
  async verifyClaim(claim: string, apiKey: string): Promise<VerificationVerdictResult> {
    console.info(`${EXTENSION_NAME}: [OpenAI] Stage 2 - Verifying claim (model: gpt-4o)`);
    console.info(`${EXTENSION_NAME}: [OpenAI] Claim: "${claim}"`);

    const systemPrompt = `You are a fact-checking assistant with access to web search.

When verifying claims:
1. Analyze the claim to identify key factual assertions
2. Use web search to find relevant authoritative sources
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
- Cite specific sources in your explanation
- Consider recency of sources for time-sensitive claims
- Acknowledge uncertainty and conflicting evidence
- Prefer "unknown" for claims that cannot be verified with available evidence
- Always use web search to find current, authoritative information`;

    const openai = createOpenAI({ apiKey });

    console.info(`${EXTENSION_NAME}: [OpenAI] Using OpenAI built-in web search...`);

    // Use generateText with built-in web search tool
    const result = await generateText({
      model: openai('gpt-4o'),
      system: systemPrompt,
      prompt: `Verify this claim and provide a detailed analysis: "${claim}"

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
- Be conservative - prefer "unknown" when uncertain`,
      tools: {
        web_search: openai.tools.webSearch({
          searchContextSize: 'high', // Use comprehensive search context
        }),
      },
      temperature: 0.5,
    });

    console.info(`${EXTENSION_NAME}: [OpenAI] Stage 2 - Web search and analysis complete`);

    // Parse the JSON response from the model
    let verdictResult: VerificationVerdictResult;
    try {
      // Extract JSON from the text response (model should return JSON)
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsedJson = JSON.parse(jsonMatch[0]);
      verdictResult = VerificationVerdictSchema.parse(parsedJson);

      // If the model didn't include sources in JSON but result.sources exists, use those
      if ((!verdictResult.sources || verdictResult.sources.length === 0) && result.sources) {
        verdictResult.sources = result.sources
          .filter((source) => source.type === 'source' && 'url' in source)
          .map((source) => ({
            title: 'title' in source ? (source.title as string) || 'Source' : 'Source',
            url: (source as { url: string }).url,
          }));
      }
    } catch (error) {
      console.error(`${EXTENSION_NAME}: [OpenAI] Failed to parse verification result:`, error);
      console.error(`${EXTENSION_NAME}: [OpenAI] Raw response:`, result.text);

      // Fallback: return unknown verdict with error explanation
      verdictResult = {
        verdict: 'unknown',
        confidence: 0,
        explanation: `Failed to parse verification result: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sources: result.sources
          ? result.sources
              .filter((s) => s.type === 'source' && 'url' in s)
              .map((s) => ({
                title: 'title' in s ? (s.title as string) || 'Source' : 'Source',
                url: (s as { url: string }).url,
              }))
          : [],
      };
    }

    console.info(
      `${EXTENSION_NAME}: [OpenAI] Stage 2 - Verdict: ${verdictResult.verdict} (confidence: ${verdictResult.confidence}%)`
    );

    return verdictResult;
  }
}
