/**
 * Provider registry
 * Central registry of all available AI providers
 */

import { AIProvider } from './types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { PerplexityProvider } from './perplexity';

/**
 * Registry of all available providers
 */
export const providerRegistry = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  perplexity: new PerplexityProvider(),
} as const;

/**
 * Provider ID type derived from registry keys
 */
export type ProviderId = keyof typeof providerRegistry;

/**
 * Get a provider by ID
 * @param id - Provider ID
 * @returns Provider instance
 */
export function getProvider(id: ProviderId): AIProvider {
  return providerRegistry[id];
}

/**
 * Get all available providers
 * @returns Array of all providers
 */
export function getAllProviders(): AIProvider[] {
  return Object.values(providerRegistry);
}

/**
 * Get all provider IDs
 * @returns Array of provider IDs
 */
export function getAllProviderIds(): ProviderId[] {
  return Object.keys(providerRegistry) as ProviderId[];
}
