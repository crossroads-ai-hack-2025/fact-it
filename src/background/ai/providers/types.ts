/**
 * Provider abstraction layer for AI fact-checking services
 * Supports multiple AI providers (OpenAI, Anthropic, Perplexity)
 */

import { z } from 'zod';

/**
 * Zod schema for claim detection response (Stage 1)
 */
export const ClaimDetectionSchema = z.object({
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
export const VerificationVerdictSchema = z.object({
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

/**
 * Core provider interface that all AI providers must implement
 */
export interface AIProvider {
  /** Provider identifier (e.g., 'openai', 'anthropic', 'perplexity') */
  readonly id: string;

  /** Human-readable provider name (e.g., 'OpenAI', 'Anthropic', 'Perplexity') */
  readonly displayName: string;

  /**
   * Test if an API key is valid for this provider
   * @param apiKey - API key to test
   * @returns Object with valid boolean and optional error message
   */
  testApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }>;

  /**
   * Stage 1: Detect factual claims in text
   * Fast classification to filter out opinions, questions, and subjective statements
   *
   * @param text - Text to analyze for factual claims
   * @param apiKey - Provider API key
   * @returns Detection result with hasClaim boolean, list of claims, and reasoning
   */
  detectClaims(text: string, apiKey: string): Promise<ClaimDetectionResult>;

  /**
   * Stage 2: Verify factual claim using web search
   * Uses provider-specific search capabilities to find and synthesize evidence
   *
   * @param claim - Factual claim to verify
   * @param apiKey - Provider API key
   * @returns Verification verdict with confidence, explanation, and sources
   */
  verifyClaim(claim: string, apiKey: string): Promise<VerificationVerdictResult>;
}

/**
 * Result from a single provider's fact-check
 */
export interface ProviderResult {
  providerId: string;
  providerName: string;
  verdict: 'true' | 'false' | 'unknown';
  confidence: number;
  explanation: string;
  sources: Array<{ title: string; url: string }>;
  error?: string; // If provider failed
}

/**
 * Aggregated result from multiple providers
 */
export interface AggregatedResult {
  verdict: 'true' | 'false' | 'unknown' | 'no_claim';
  confidence: number; // Weighted average across providers
  explanation: string; // Combined explanation
  sources: Array<{ title: string; url: string; provider: string }>;
  providerResults: ProviderResult[];
  consensus: {
    total: number; // Total providers that completed
    agreeing: number; // Providers that agree with final verdict
  };
}
