/**
 * Brave Search API Client
 * Provides web search functionality for fact verification
 */

import { EXTENSION_NAME } from '@/shared/constants';

export interface BraveSearchResult {
  title: string;
  url: string;
  snippet: string;
  age?: string; // Recency indicator (e.g., "2 days ago")
}

export interface BraveSearchResponse {
  results: BraveSearchResult[];
  query: string;
}

/**
 * Brave Search API Client
 * API Docs: https://brave.com/search/api/
 */
export class BraveSearchClient {
  private readonly baseUrl = 'https://api.search.brave.com/res/v1/web/search';

  constructor(private apiKey: string) {
    if (!apiKey) {
      throw new Error('Brave Search API key is required');
    }
  }

  /**
   * Search the web using Brave Search API
   * @param query - Search query string
   * @param count - Number of results to return (default: 5, max: 20)
   * @returns Array of search results
   */
  async search(query: string, count: number = 5): Promise<BraveSearchResult[]> {
    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    // Validate count
    const resultCount = Math.min(Math.max(1, count), 20);

    console.info(
      `${EXTENSION_NAME}: Brave Search query: "${query}" (${resultCount} results)`
    );

    try {
      const params = new URLSearchParams({
        q: query,
        count: resultCount.toString(),
        text_decorations: 'false', // Remove HTML markup from snippets
        search_lang: 'en',
        safesearch: 'moderate',
      });

      const response = await fetch(`${this.baseUrl}?${params}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Brave Search API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Extract web results
      const results: BraveSearchResult[] =
        data.web?.results?.map((r: any) => ({
          title: r.title || 'Untitled',
          url: r.url,
          snippet: r.description || '',
          age: r.age || undefined,
        })) || [];

      console.info(
        `${EXTENSION_NAME}: Brave Search returned ${results.length} results`
      );

      return results;
    } catch (error) {
      console.error(`${EXTENSION_NAME}: Brave Search error:`, error);
      throw error;
    }
  }

  /**
   * Format search results for LLM consumption
   * @param results - Array of search results
   * @returns Formatted string with numbered results
   */
  formatResultsForLLM(results: BraveSearchResult[]): string {
    if (results.length === 0) {
      return 'No search results found.';
    }

    return results
      .map(
        (result, index) =>
          `[${index + 1}] ${result.title}\n${result.snippet}\nSource: ${result.url}${result.age ? ` (${result.age})` : ''}`
      )
      .join('\n\n');
  }

  /**
   * Test API key validity by performing a simple search
   * @returns true if API key is valid, false otherwise
   */
  async testApiKey(): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.search('test', 1);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
