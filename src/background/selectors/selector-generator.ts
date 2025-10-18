/**
 * Selector Generator - Uses GPT-4o-mini to discover CSS selectors from HTML samples
 */

import { aiClient } from '@/background/ai';
import { PlatformSelectors } from '@/shared/types';
import { EXTENSION_NAME } from '@/shared/constants';

export interface SelectorDiscoveryResult {
  selectors: PlatformSelectors;
  confidence: number;
  reasoning: string;
}

/**
 * Generate CSS selectors from an HTML sample using GPT-4o-mini
 */
export async function generateSelectors(
  domain: string,
  htmlSample: string
): Promise<SelectorDiscoveryResult> {
  console.info(`${EXTENSION_NAME}: Generating selectors for domain: ${domain}`);

  try {
    const result = await aiClient.discoverSelectors(htmlSample);

    return {
      selectors: {
        postContainer: result.postContainer,
        textContent: result.textContent,
        author: result.author,
        timestamp: result.timestamp,
      },
      confidence: result.confidence,
      reasoning: result.reasoning,
    };
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Selector generation failed:`, error);
    throw error;
  }
}

/**
 * Generate selectors with retry logic
 * Attempts up to maxAttempts times with different strategies
 */
export async function generateSelectorsWithRetry(
  domain: string,
  htmlSample: string,
  maxAttempts: number = 3
): Promise<SelectorDiscoveryResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.info(`${EXTENSION_NAME}: Selector generation attempt ${attempt}/${maxAttempts}`);

      const result = await generateSelectors(domain, htmlSample);

      // Success!
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `${EXTENSION_NAME}: Attempt ${attempt} failed:`,
        lastError.message
      );

      // Don't retry on API key errors
      if (lastError.message.includes('API key')) {
        throw lastError;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed
  throw new Error(
    `Selector generation failed after ${maxAttempts} attempts: ${lastError?.message}`
  );
}
