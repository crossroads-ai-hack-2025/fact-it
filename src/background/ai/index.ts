/**
 * AI Client for Fact-It extension
 * Handles AI operations using Vercel AI SDK
 */

import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { STORAGE_KEYS } from '@/shared/types';
import { EXTENSION_NAME } from '@/shared/constants';
import { BraveSearchClient } from '@/background/search/brave-search';

/**
 * Zod schema for selector discovery response
 */
const SelectorDiscoverySchema = z.object({
  postContainer: z.string().describe('CSS selector for post/article container element'),
  textContent: z.string().describe('CSS selector for main text content element'),
  author: z.string().optional().describe('CSS selector for author/username (optional)'),
  timestamp: z.string().optional().describe('CSS selector for timestamp (optional)'),
  confidence: z.number().min(0).max(100).describe('Confidence score 0-100'),
  reasoning: z.string().describe('Brief explanation of why these selectors were chosen'),
});

type SelectorDiscoveryResult = z.infer<typeof SelectorDiscoverySchema>;

/**
 * Zod schema for claim detection response (Stage 1)
 */
const ClaimDetectionSchema = z.object({
  hasClaim: z
    .boolean()
    .describe('Whether the text contains checkable factual claims'),
  claims: z
    .array(z.string())
    .describe('List of identified factual claims (empty if none)'),
  reasoning: z
    .string()
    .describe('Brief explanation of why text has/lacks verifiable claims'),
});

export type ClaimDetectionResult = z.infer<typeof ClaimDetectionSchema>;

/**
 * Zod schema for verification verdict (Stage 2)
 */
const VerificationVerdictSchema = z.object({
  verdict: z
    .enum(['true', 'false', 'unknown'])
    .describe(
      'Verdict: true (claim supported by evidence), false (contradicted), unknown (insufficient/conflicting evidence)'
    ),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe('Confidence score 0-100 in the verdict'),
  explanation: z
    .string()
    .describe(
      'Clear explanation of the verdict with evidence from sources (2-3 sentences)'
    ),
  sources: z
    .array(
      z.object({
        title: z.string().describe('Title of the source'),
        url: z.string().describe('URL of the source'),
      })
    )
    .describe('List of sources used for verification (max 5)'),
});

export type VerificationVerdictResult = z.infer<typeof VerificationVerdictSchema>;

export class AIClient {
  private apiKey: string | null = null;
  private braveSearchClient: BraveSearchClient | null = null;

  constructor() {
    // API key loaded on-demand from storage
  }

  /**
   * Load API key from chrome.storage
   */
  private async loadApiKey(): Promise<string> {
    if (this.apiKey) {
      return this.apiKey;
    }

    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = result[STORAGE_KEYS.SETTINGS];

    if (!settings?.openaiApiKey) {
      throw new Error('OpenAI API key not configured. Please add it in the extension settings.');
    }

    const apiKey: string = settings.openaiApiKey;
    this.apiKey = apiKey;
    return apiKey;
  }

  /**
   * Load Brave Search API key and initialize client
   */
  private async loadBraveSearchClient(): Promise<BraveSearchClient> {
    if (this.braveSearchClient) {
      return this.braveSearchClient;
    }

    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = result[STORAGE_KEYS.SETTINGS];

    if (!settings?.braveSearchApiKey) {
      throw new Error(
        'Brave Search API key not configured. Please add it in the extension settings.'
      );
    }

    this.braveSearchClient = new BraveSearchClient(settings.braveSearchApiKey);
    return this.braveSearchClient;
  }

  /**
   * Specialized method for selector discovery
   * Returns parsed JSON from structured output using Vercel AI SDK
   */
  async discoverSelectors(htmlSample: string): Promise<SelectorDiscoveryResult> {
    const apiKey = await this.loadApiKey();

    const systemPrompt = `You are a web scraping expert analyzing HTML to find CSS selectors for social media posts or article content.

Your task: Identify stable, reliable CSS selectors that can extract post/article information from this HTML sample.

FIND SELECTORS FOR:
1. **Post Container** - The element wrapping each complete post/article
2. **Text Content** - The element containing the main text of the post
3. **Author** (optional) - Element with author/username
4. **Timestamp** (optional) - Element with post date/time

SELECTOR QUALITY RULES:
✓ PREFER: data-* attributes (e.g., [data-testid="tweet"])
✓ PREFER: role attributes (e.g., [role="article"])
✓ PREFER: semantic HTML (e.g., article, main)
✓ PREFER: stable class names (e.g., .post, .feed-item)
✗ AVOID: random hash classes (e.g., .css-1dbjc4n)
✗ AVOID: positional selectors (e.g., nth-child)
✗ AVOID: overly specific selectors

CONFIDENCE SCORING:
- 90-100: Uses data-* or role attributes
- 70-89: Uses semantic HTML or stable classes
- 50-69: Uses classes but may be fragile
- <50: Very fragile selectors, likely to break

Return your analysis as JSON with the selectors and confidence score.`;

    const userPrompt = `Analyze this HTML sample and return CSS selectors:

\`\`\`html
${htmlSample}
\`\`\``;

    console.info(`${EXTENSION_NAME}: AI SDK call - model: gpt-4o-mini`);

    // Create OpenAI provider with API key
    const openai = createOpenAI({ apiKey });

    const { object, usage } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: SelectorDiscoverySchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.3,
    });

    // Log token usage for cost tracking
    console.info(
      `${EXTENSION_NAME}: AI tokens used - input: ${usage.inputTokens}, output: ${usage.outputTokens}, total: ${usage.totalTokens}`
    );

    console.info(
      `${EXTENSION_NAME}: Selector discovery result - confidence: ${object.confidence}%, container: ${object.postContainer}`
    );

    return object;
  }

  /**
   * Stage 1: Detect factual claims in text using GPT-4o-mini
   * Fast classification to filter out opinions, questions, and subjective statements
   *
   * @param text - Text to analyze for factual claims
   * @returns Detection result with hasClaim boolean, list of claims, and reasoning
   */
  async detectClaims(text: string): Promise<ClaimDetectionResult> {
    const apiKey = await this.loadApiKey();

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

    console.info(`${EXTENSION_NAME}: Stage 1 - Detecting claims (model: gpt-4o-mini)`);

    const openai = createOpenAI({ apiKey });

    const { object, usage } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: ClaimDetectionSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.3, // Low temperature for consistent classification
    });

    console.info(
      `${EXTENSION_NAME}: Stage 1 - Result: ${object.hasClaim ? 'HAS CLAIMS' : 'NO CLAIMS'} (tokens: ${usage.totalTokens})`
    );

    if (object.hasClaim && object.claims.length > 0) {
      console.info(
        `${EXTENSION_NAME}: Stage 1 - Claims found: ${object.claims.join('; ')}`
      );
    }

    return object;
  }

  /**
   * Stage 2: Verify factual claim using GPT-4o with web search
   * Uses function calling to search the web and synthesize evidence
   *
   * @param claim - Factual claim to verify
   * @returns Verification verdict with confidence, explanation, and sources
   */
  async verifyClaim(claim: string): Promise<VerificationVerdictResult> {
    const apiKey = await this.loadApiKey();
    const braveSearch = await this.loadBraveSearchClient();

    console.info(`${EXTENSION_NAME}: Stage 2 - Verifying claim (model: gpt-4o)`);
    console.info(`${EXTENSION_NAME}: Claim: "${claim}"`);

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

Always search the web before making your final determination.`;

    const openai = createOpenAI({ apiKey });

    // For simplicity in Phase 2, we'll perform a web search ourselves
    // and then ask GPT-4o to analyze the results
    // This avoids complex function calling setup and gets us working faster

    console.info(`${EXTENSION_NAME}: Performing web search for claim...`);

    // Search the web for the claim
    const searchResults = await braveSearch.search(claim, 5);
    const formattedResults = braveSearch.formatResultsForLLM(searchResults);

    console.info(
      `${EXTENSION_NAME}: Search complete, ${searchResults.length} results found`
    );

    // Now ask GPT-4o to analyze the search results and provide a verdict
    const analysisPrompt = `Verify this claim based on the search results below: "${claim}"

SEARCH RESULTS:
${formattedResults}

Based on these search results, provide your verdict as a JSON object with this exact structure:
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
- Include the most relevant sources in your response (max 5)
- Be conservative - prefer "unknown" when uncertain`;

    const { object: verdictResult } = await generateObject({
      model: openai('gpt-4o'),
      schema: VerificationVerdictSchema,
      system: systemPrompt,
      prompt: analysisPrompt,
      temperature: 0.5,
    });

    console.info(`${EXTENSION_NAME}: Stage 2 - Analysis complete`);

    console.info(
      `${EXTENSION_NAME}: Stage 2 - Verdict: ${verdictResult.verdict} (confidence: ${verdictResult.confidence}%)`
    );

    return verdictResult;
  }

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
}

// Singleton instance
export const aiClient = new AIClient();
