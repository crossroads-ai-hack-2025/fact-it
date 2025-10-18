/**
 * Shared type definitions for Fact-It extension
 */

// Message types for communication between content scripts and service worker
export enum MessageType {
  CHECK_CLAIM = 'CHECK_CLAIM',
  CLAIM_RESULT = 'CLAIM_RESULT',
  GET_SETTINGS = 'GET_SETTINGS',
  UPDATE_SETTINGS = 'UPDATE_SETTINGS',
  PING = 'PING',
  GET_DOMAIN_SELECTORS = 'GET_DOMAIN_SELECTORS',
  GET_ALL_SELECTORS = 'GET_ALL_SELECTORS',
  UPDATE_DOMAIN_SELECTOR = 'UPDATE_DOMAIN_SELECTOR',
  ADD_DOMAIN_SELECTOR = 'ADD_DOMAIN_SELECTOR',
  REMOVE_DOMAIN_SELECTOR = 'REMOVE_DOMAIN_SELECTOR',
  GET_SELECTOR_STATS = 'GET_SELECTOR_STATS',
  GET_CACHE_STATS = 'GET_CACHE_STATS',
  CLEAR_CACHE = 'CLEAR_CACHE',
}

// Platform types
export type Platform = 'twitter' | 'linkedin' | 'facebook' | 'article';

// Verdict types
export type Verdict = 'true' | 'false' | 'unknown' | 'no_claim';

// Message interfaces
export interface CheckClaimMessage {
  type: MessageType.CHECK_CLAIM;
  payload: {
    text: string;
    elementId: string;
    platform: Platform;
  };
}

export interface ClaimResultMessage {
  type: MessageType.CLAIM_RESULT;
  payload: {
    elementId: string;
    verdict: Verdict;
    confidence: number; // 0-100
    explanation: string;
    sources: Array<{ title: string; url: string; provider?: string }>;
    providerResults?: Array<{
      providerId: string;
      providerName: string;
      verdict: 'true' | 'false' | 'unknown';
      confidence: number;
      explanation: string;
    }>;
    consensus?: {
      total: number;
      agreeing: number;
    };
  };
}

export interface PingMessage {
  type: MessageType.PING;
}

export interface GetSettingsMessage {
  type: MessageType.GET_SETTINGS;
}

export interface UpdateSettingsMessage {
  type: MessageType.UPDATE_SETTINGS;
  payload: {
    providers?: {
      openai?: ProviderSettings;
      anthropic?: ProviderSettings;
      perplexity?: ProviderSettings;
    };
    autoCheckEnabled?: boolean;
    confidenceThreshold?: number;
  };
}

// Selector storage messages
export interface PlatformSelectors {
  postContainer: string;
  textContent: string;
  author?: string;
  timestamp?: string;
}

export interface GetDomainSelectorsMessage {
  type: MessageType.GET_DOMAIN_SELECTORS;
  payload: {
    domain: string;
  };
}

export interface GetAllSelectorsMessage {
  type: MessageType.GET_ALL_SELECTORS;
}

export interface UpdateDomainSelectorMessage {
  type: MessageType.UPDATE_DOMAIN_SELECTOR;
  payload: {
    domain: string;
    selectors: PlatformSelectors;
  };
}

export interface AddDomainSelectorMessage {
  type: MessageType.ADD_DOMAIN_SELECTOR;
  payload: {
    domain: string;
    selectors: PlatformSelectors;
  };
}

export interface RemoveDomainSelectorMessage {
  type: MessageType.REMOVE_DOMAIN_SELECTOR;
  payload: {
    domain: string;
  };
}

export interface GetSelectorStatsMessage {
  type: MessageType.GET_SELECTOR_STATS;
}

export interface SelectorStatsMessage {
  totalDomains: number;
  storageEstimateMB: number;
}

// Cache management messages
export interface GetCacheStatsMessage {
  type: MessageType.GET_CACHE_STATS;
}

export interface CacheStatsMessage {
  totalEntries: number;
  oldestEntry: number;
  newestEntry: number;
  averageAge: number;
  storageEstimateMB: number;
}

export interface ClearCacheMessage {
  type: MessageType.CLEAR_CACHE;
}

// Union type for all messages
export type Message =
  | CheckClaimMessage
  | ClaimResultMessage
  | PingMessage
  | GetSettingsMessage
  | UpdateSettingsMessage
  | GetDomainSelectorsMessage
  | GetAllSelectorsMessage
  | UpdateDomainSelectorMessage
  | AddDomainSelectorMessage
  | RemoveDomainSelectorMessage
  | GetSelectorStatsMessage
  | GetCacheStatsMessage
  | ClearCacheMessage;

// Provider settings interface
export interface ProviderSettings {
  enabled: boolean;
  apiKey: string | null;
}

// Settings interface
export interface ExtensionSettings {
  providers: {
    openai: ProviderSettings;
    anthropic: ProviderSettings;
    perplexity: ProviderSettings;
  };
  autoCheckEnabled: boolean;
  confidenceThreshold: number; // 0-100, only show results above this confidence
}

// Storage keys
export const STORAGE_KEYS = {
  SETTINGS: 'fact_it_settings',
  CACHE: 'fact_it_cache',
  SELECTORS: 'fact_it_selectors',
} as const;
