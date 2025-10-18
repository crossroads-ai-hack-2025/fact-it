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
    sources: Array<{ title: string; url: string }>;
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
    openaiApiKey?: string;
    braveSearchApiKey?: string;
    autoCheckEnabled?: boolean;
    confidenceThreshold?: number;
  };
}

// Union type for all messages
export type Message =
  | CheckClaimMessage
  | ClaimResultMessage
  | PingMessage
  | GetSettingsMessage
  | UpdateSettingsMessage;

// Settings interface
export interface ExtensionSettings {
  openaiApiKey: string | null;
  braveSearchApiKey: string | null;
  autoCheckEnabled: boolean;
  confidenceThreshold: number; // 0-100, only show results above this confidence
}

// Storage keys
export const STORAGE_KEYS = {
  SETTINGS: 'fact_it_settings',
  CACHE: 'fact_it_cache',
} as const;
