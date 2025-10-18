/**
 * Fact-check orchestrator
 * Coordinates parallel execution across multiple AI providers and aggregates results
 */

import { EXTENSION_NAME } from '@/shared/constants';
import { STORAGE_KEYS } from '@/shared/types';
import { providerRegistry, ProviderId } from './providers/registry';
import { AggregatedResult, ProviderResult } from './providers/types';
import { getCachedResult, setCachedResult } from '@/background/cache/fact-check-cache';

export class FactCheckOrchestrator {
  /**
   * Get enabled providers from settings
   * @returns Array of enabled provider IDs
   */
  private async getEnabledProviders(): Promise<ProviderId[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = result[STORAGE_KEYS.SETTINGS];

    if (!settings?.providers) {
      console.warn(`${EXTENSION_NAME}: No provider settings found`);
      return [];
    }

    const enabledProviders: ProviderId[] = [];
    for (const [providerId, config] of Object.entries(settings.providers)) {
      const providerConfig = config as { enabled: boolean; apiKey: string | null };
      if (providerConfig.enabled && providerConfig.apiKey) {
        enabledProviders.push(providerId as ProviderId);
      }
    }

    console.info(`${EXTENSION_NAME}: Enabled providers: ${enabledProviders.join(', ')}`);
    return enabledProviders;
  }

  /**
   * Get API key for a specific provider
   * @param providerId - Provider ID
   * @returns API key or null if not configured
   */
  private async getApiKey(providerId: ProviderId): Promise<string | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = result[STORAGE_KEYS.SETTINGS];

    return settings?.providers?.[providerId]?.apiKey || null;
  }

  /**
   * Aggregate results from multiple providers
   * @param providerResults - Array of provider results
   * @returns Aggregated result
   */
  private aggregateResults(providerResults: ProviderResult[]): AggregatedResult {
    // Filter out failed providers
    const successfulResults = providerResults.filter((r) => !r.error);

    if (successfulResults.length === 0) {
      // All providers failed
      return {
        verdict: 'unknown',
        confidence: 0,
        explanation: 'All fact-checking providers failed. Please try again later.',
        sources: [],
        providerResults,
        consensus: {
          total: providerResults.length,
          agreeing: 0,
        },
      };
    }

    // Calculate verdict by majority vote (weighted by confidence)
    const verdictWeights: Record<string, number> = {};
    for (const result of successfulResults) {
      verdictWeights[result.verdict] = (verdictWeights[result.verdict] || 0) + result.confidence;
    }

    // Determine final verdict (highest weighted vote)
    const finalVerdict = Object.entries(verdictWeights).reduce((a, b) =>
      b[1] > a[1] ? b : a
    )[0] as 'true' | 'false' | 'unknown';

    // Calculate weighted average confidence for final verdict
    const verdictResults = successfulResults.filter((r) => r.verdict === finalVerdict);
    const totalConfidence = verdictResults.reduce((sum, r) => sum + r.confidence, 0);
    const avgConfidence = Math.round(totalConfidence / verdictResults.length);

    // Count consensus (providers that agree with final verdict)
    const agreeing = verdictResults.length;

    // Combine explanations
    const explanation = this.combineExplanations(verdictResults);

    // Deduplicate and aggregate sources
    const sources = this.aggregateSources(successfulResults);

    return {
      verdict: finalVerdict,
      confidence: avgConfidence,
      explanation,
      sources,
      providerResults,
      consensus: {
        total: successfulResults.length,
        agreeing,
      },
    };
  }

  /**
   * Combine explanations from multiple providers
   * @param results - Array of provider results with same verdict
   * @returns Combined explanation
   */
  private combineExplanations(results: ProviderResult[]): string {
    if (results.length === 1) {
      return results[0].explanation;
    }

    // For multiple providers, create a summary that mentions consensus
    const firstExplanation = results[0].explanation;
    const providerNames = results.map((r) => r.providerName).join(', ');

    return `Multiple sources agree: ${firstExplanation} (Confirmed by: ${providerNames})`;
  }

  /**
   * Aggregate and deduplicate sources from multiple providers
   * @param results - Array of provider results
   * @returns Deduplicated sources with provider attribution
   */
  private aggregateSources(
    results: ProviderResult[]
  ): Array<{ title: string; url: string; provider: string }> {
    const sourceMap = new Map<string, { title: string; url: string; providers: string[] }>();

    for (const result of results) {
      for (const source of result.sources) {
        const key = source.url.toLowerCase();
        if (sourceMap.has(key)) {
          // Source already exists, add provider to list
          sourceMap.get(key)!.providers.push(result.providerName);
        } else {
          // New source
          sourceMap.set(key, {
            title: source.title,
            url: source.url,
            providers: [result.providerName],
          });
        }
      }
    }

    // Convert to array and format
    return Array.from(sourceMap.values()).map(({ title, url, providers }) => ({
      title,
      url,
      provider: providers.join(', '),
    }));
  }

  /**
   * Check a claim across multiple AI providers in parallel
   * @param text - Text to fact-check
   * @returns Aggregated result from all enabled providers
   */
  async checkClaim(text: string): Promise<AggregatedResult> {
    // Check cache first
    const cachedResult = await getCachedResult(text);
    if (cachedResult) {
      console.info(
        `${EXTENSION_NAME}: Returning cached result (verdict: ${cachedResult.verdict}, confidence: ${cachedResult.confidence}%)`
      );
      return cachedResult;
    }

    const enabledProviders = await this.getEnabledProviders();

    if (enabledProviders.length === 0) {
      console.warn(`${EXTENSION_NAME}: No providers enabled`);
      return {
        verdict: 'unknown',
        confidence: 0,
        explanation: 'No AI providers configured. Please configure at least one provider in settings.',
        sources: [],
        providerResults: [],
        consensus: {
          total: 0,
          agreeing: 0,
        },
      };
    }

    console.info(
      `${EXTENSION_NAME}: Starting fact-check with ${enabledProviders.length} provider(s)`
    );

    // Stage 1: Parallel claim detection across all enabled providers
    console.info(`${EXTENSION_NAME}: Stage 1 - Running claim detection in parallel...`);

    const detectionResults = await Promise.allSettled(
      enabledProviders.map(async (providerId) => {
        const provider = providerRegistry[providerId];
        const apiKey = await this.getApiKey(providerId);

        if (!apiKey) {
          throw new Error(`No API key configured for ${provider.displayName}`);
        }

        return {
          providerId,
          result: await provider.detectClaims(text, apiKey),
        };
      })
    );

    // Check if any provider found claims
    const providersWithClaims = detectionResults
      .filter((r) => r.status === 'fulfilled' && r.value.result.hasClaim)
      .map((r) => (r as PromiseFulfilledResult<{ providerId: ProviderId; result: any }>).value);

    if (providersWithClaims.length === 0) {
      console.info(`${EXTENSION_NAME}: No claims detected by any provider`);
      return {
        verdict: 'no_claim',
        confidence: 100,
        explanation: 'No verifiable factual claims detected in this text.',
        sources: [],
        providerResults: [],
        consensus: {
          total: detectionResults.filter((r) => r.status === 'fulfilled').length,
          agreeing: detectionResults.filter((r) => r.status === 'fulfilled').length,
        },
      };
    }

    console.info(
      `${EXTENSION_NAME}: ${providersWithClaims.length} provider(s) found claims, proceeding to Stage 2...`
    );

    // Stage 2: Parallel verification for providers that found claims
    console.info(`${EXTENSION_NAME}: Stage 2 - Running verification in parallel...`);

    const verificationResults = await Promise.allSettled(
      providersWithClaims.map(async ({ providerId, result: detectionResult }) => {
        const provider = providerRegistry[providerId];
        const apiKey = await this.getApiKey(providerId);

        if (!apiKey) {
          throw new Error(`No API key configured for ${provider.displayName}`);
        }

        // Use the first claim for verification
        const claim = detectionResult.claims[0];
        const verificationResult = await provider.verifyClaim(claim, apiKey);

        return {
          providerId,
          providerName: provider.displayName,
          ...verificationResult,
        } as ProviderResult;
      })
    );

    // Convert PromiseSettledResult to ProviderResult
    const providerResults: ProviderResult[] = verificationResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Provider failed
        const providerId = providersWithClaims[index].providerId;
        const provider = providerRegistry[providerId];
        return {
          providerId,
          providerName: provider.displayName,
          verdict: 'unknown',
          confidence: 0,
          explanation: 'Verification failed',
          sources: [],
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        };
      }
    });

    console.info(`${EXTENSION_NAME}: All providers completed, aggregating results...`);

    // Aggregate results
    const aggregatedResult = this.aggregateResults(providerResults);

    console.info(
      `${EXTENSION_NAME}: Final verdict: ${aggregatedResult.verdict} (confidence: ${aggregatedResult.confidence}%, consensus: ${aggregatedResult.consensus.agreeing}/${aggregatedResult.consensus.total})`
    );

    // Cache the result for future lookups
    await setCachedResult(text, aggregatedResult);

    return aggregatedResult;
  }
}

// Singleton instance
export const orchestrator = new FactCheckOrchestrator();
