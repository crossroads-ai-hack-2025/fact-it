# Fact-It: Real-Time Fact-Checking Chrome Extension - Implementation Plan

## Overview

**Project Name:** Fact-It
**Type:** Chrome Extension (Manifest V3)
**Category:** Browser Extension - Fact-Checking Tool
**Priority:** P0 - Initial Implementation
**Estimated Timeline:** 6-8 weeks
**Technology Stack:** TypeScript, Manifest V3, GPT-4o/GPT-4o-mini, Brave Search API

### Executive Summary

Fact-It is a Chrome extension that provides real-time fact-checking for social media posts and web articles. Using a two-stage AI verification system, it identifies factual claims (Stage 1: GPT-4o-mini) and verifies them against web sources (Stage 2: GPT-4o + Brave Search). The extension delivers transparent, cost-effective fact-checking with estimated monthly costs of $8-12 for average users (100 posts/day).

**Key Features:**
- Real-time claim detection and verification
- Visual indicators (✓ true, ✗ false, ? unverifiable)
- Support for Twitter/X, LinkedIn, Facebook, and article sites
- User-controlled API keys (OpenAI + Brave Search)
- Three-category verdict system acknowledging uncertainty
- Transparent methodology with source citations

---

## Problem Statement

Social media users encounter vast amounts of information daily, with 60-70% of posts containing no checkable factual claims, and the remaining 30-40% often containing misinformation. Existing fact-checking solutions suffer from:

1. **Manual curation limitations**: Services like NewsGuard rely on human reviewers, limiting coverage to established news sources
2. **Delayed verification**: Traditional fact-checks appear hours/days after viral spread
3. **Lack of granularity**: Domain-level trust scores don't address individual post accuracy
4. **Cost barriers**: Existing AI fact-checking tools (Factiverse €10/month) target professional users
5. **Binary classification problems**: Forced true/false verdicts ignore nuance and uncertainty

**User Impact**: Users need immediate, accurate feedback on individual claims they encounter while scrolling, with transparent methodology and acknowledgment of verification limitations.

---

## Proposed Solution

### High-Level Architecture

```
User browses social media
    ↓
[STAGE 0] Dynamic Selector Discovery (one-time per domain)
    ├─ Check cache: Selectors for this domain?
    │  ├─ Yes → Validate selectors still work
    │  └─ No → Generate selectors via GPT-4o-mini
    ↓
Content Script (MutationObserver with discovered selectors)
    ↓
Extract text chunks (>50 chars)
    ↓
Message to Background Service Worker
    ↓
[STAGE 1] GPT-4o-mini: Claim Detection
    ├─ No claims → No action
    └─ Has claims → [STAGE 2]
        ↓
    GPT-4o with Function Calling
        ↓
    Brave Search API (1-3 queries)
        ↓
    GPT-4o Synthesis
        ↓
    Verdict: {true|false|unknown, confidence, explanation, sources}
    ↓
Content Script: Display Visual Indicator
    ↓
User clicks → Detailed explanation popup
```

### Three-Stage Verification System

**Stage 0: Dynamic Selector Discovery** (GPT-4o-mini - one-time per domain)
- LLM-powered DOM analysis to identify post containers and content selectors
- Analyzes HTML structure and generates CSS selectors automatically
- Caches selectors per domain (30-day TTL with weekly validation)
- Self-healing: regenerates selectors when platform HTML changes
- Cost: ~$0.0004 per domain (negligible - <$0.02/year even with frequent updates)
- Makes extension universal - works on ANY social media platform without manual configuration

**Stage 1: Claim Detection** (GPT-4o-mini - $0.15/1M tokens)
- Fast filtering to identify checkable factual claims
- Eliminates opinions, questions, subjective statements
- Processes 100-300 token posts in 500-800ms
- Reduces Stage 2 calls by ~65%

**Stage 2: Deep Verification** (GPT-4o - $2.50/1M input, $10/1M output + Brave Search)
- Function calling to trigger web searches
- Multi-source evidence synthesis
- Confidence scoring (0-100)
- Three-category output: true/false/unknown
- Source citation and explanation generation

---

## Technical Approach

### 1. Chrome Extension Architecture (Manifest V3)

#### Core Components

**manifest.json**
```json
{
  "manifest_version": 3,
  "name": "Fact-It",
  "version": "0.1.0",
  "description": "Real-time fact-checking for social media and web articles",
  "permissions": ["storage", "scripting"],
  "host_permissions": [
    "*://twitter.com/*",
    "*://x.com/*",
    "*://linkedin.com/*",
    "*://facebook.com/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["*://twitter.com/*", "*://x.com/*"],
      "js": ["content-twitter.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["*://linkedin.com/*"],
      "js": ["content-linkedin.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["*://facebook.com/*"],
      "js": ["content-facebook.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

**Key Architecture Decisions:**

1. **Service Worker Pattern**: Event-driven background script (no persistent background page)
   - Handles all API calls (OpenAI, Brave Search)
   - Manages API key storage and security
   - Implements rate limiting and retry logic
   - Auto-terminates after idle period (Chrome requirement)

2. **Content Script Isolation**: Runs in isolated world
   - Cannot access page JavaScript directly
   - Uses MutationObserver for DOM monitoring
   - Message passing to background worker
   - Shadow DOM for UI to prevent CSS conflicts

3. **Storage Strategy**:
   - `chrome.storage.local`: API keys (10MB limit, device-specific)
   - LRU cache for verified claims (7-day expiration)
   - User settings (auto-check mode, confidence thresholds)
   - WeakSet for tracking processed DOM elements (memory-efficient)

### 2. TypeScript Project Structure

```
fact-it/
├── src/
│   ├── background/
│   │   ├── service-worker.ts          # Main background script
│   │   ├── ai/
│   │   │   ├── openai-client.ts       # OpenAI API wrapper
│   │   │   ├── stage1-detector.ts     # Claim detection logic
│   │   │   ├── stage2-verifier.ts     # Verification with search
│   │   │   └── prompts.ts             # Prompt templates
│   │   ├── search/
│   │   │   └── brave-search.ts        # Brave Search API client
│   │   ├── utils/
│   │   │   ├── rate-limiter.ts        # Rate limiting queue
│   │   │   ├── cache.ts               # LRU cache implementation
│   │   │   └── retry.ts               # Exponential backoff
│   │   └── types.ts                   # Background type definitions
│   ├── content/
│   │   ├── base-content-script.ts     # Shared base class
│   │   ├── twitter-content.ts         # Twitter/X specific
│   │   ├── linkedin-content.ts        # LinkedIn specific
│   │   ├── facebook-content.ts        # Facebook specific
│   │   ├── ui/
│   │   │   ├── indicator.ts           # Visual indicator component
│   │   │   ├── popup.ts               # Explanation popup
│   │   │   └── styles.ts              # Shadow DOM styles
│   │   └── utils/
│   │       ├── dom-observer.ts        # MutationObserver wrapper
│   │       ├── text-extractor.ts      # Platform-agnostic extraction
│   │       └── element-tracker.ts     # WeakSet tracking
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts                   # Settings UI logic
│   │   ├── components/
│   │   │   ├── api-key-setup.ts       # API key configuration
│   │   │   ├── settings.ts            # User preferences
│   │   │   └── stats.ts               # Usage statistics
│   │   └── popup.css
│   ├── shared/
│   │   ├── types.ts                   # Shared type definitions
│   │   ├── constants.ts               # App-wide constants
│   │   └── messages.ts                # Message type definitions
│   └── manifest.json
├── dist/                               # Build output
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

### 3. Platform-Specific DOM Selectors

**Twitter/X**
```typescript
interface TwitterSelectors {
  postContainer: 'article[data-testid="tweet"]';
  textContent: 'div[data-testid="tweetText"]';
  fallback: 'div[lang]'; // Language-tagged content
}
```

**LinkedIn**
```typescript
interface LinkedInSelectors {
  postContainer: '.feed-shared-update-v2';
  textContent: '.feed-shared-update-v2__description';
  urn: '[data-urn]'; // Unique post identifier
}
```

**Facebook**
```typescript
interface FacebookSelectors {
  postContainer: 'div[role="article"]';
  textContent: 'div[data-testid="post_message"]';
  fallback: 'div[dir="auto"]'; // User-generated content marker
}
```

**Generic Articles**
```typescript
interface ArticleSelectors {
  container: 'article, main, [itemprop="articleBody"]';
  textContent: 'p'; // Filter >100 chars
  metadata: 'script[type="application/ld+json"]'; // JSON-LD structured data
}
```

**Defensive Selector Strategy:**
1. Primary selector (data-testid, stable class names)
2. Semantic fallback (role attributes, HTML5 elements)
3. Heuristic fallback (longest text span, language attributes)
4. Graceful degradation if all fail

### 4. MutationObserver Optimization

```typescript
class OptimizedDOMObserver {
  private observer: MutationObserver;
  private processedElements: WeakSet<Element>;
  private debounceTimer: number | null = null;
  private readonly DEBOUNCE_MS = 300;

  constructor(
    private targetSelector: string,
    private onNewElement: (element: Element) => void
  ) {
    this.processedElements = new WeakSet();
    this.initObserver();
  }

  private initObserver() {
    // Observe specific container, NOT entire document
    const feedContainer = document.querySelector(this.targetSelector);
    if (!feedContainer) return;

    this.observer = new MutationObserver((mutations) => {
      this.debouncedProcess(mutations);
    });

    // Critical: childList + subtree ONLY, no attributes
    this.observer.observe(feedContainer, {
      childList: true,
      subtree: true,
      attributes: false, // Prevents performance crush
    });
  }

  private debouncedProcess(mutations: MutationRecord[]) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = window.setTimeout(() => {
      this.processMutations(mutations);
    }, this.DEBOUNCE_MS);
  }

  private processMutations(mutations: MutationRecord[]) {
    // Batch processing during idle time
    requestIdleCallback(() => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node instanceof Element) {
            this.handleNewElement(node);
          }
        });
      });
    });
  }

  private handleNewElement(element: Element) {
    // Skip if already processed
    if (this.processedElements.has(element)) return;

    this.processedElements.add(element);
    this.onNewElement(element);
  }
}
```

**Performance Targets:**
- <5ms overhead per mutation event
- <50ms total processing time per batch
- <100KB memory overhead for WeakSet tracking

### 5. Message Passing Architecture

```typescript
// shared/messages.ts
export enum MessageType {
  CHECK_CLAIM = 'CHECK_CLAIM',
  CLAIM_RESULT = 'CLAIM_RESULT',
  GET_SETTINGS = 'GET_SETTINGS',
  UPDATE_SETTINGS = 'UPDATE_SETTINGS',
}

export interface CheckClaimMessage {
  type: MessageType.CHECK_CLAIM;
  payload: {
    text: string;
    elementId: string;
    platform: 'twitter' | 'linkedin' | 'facebook' | 'article';
  };
}

export interface ClaimResultMessage {
  type: MessageType.CLAIM_RESULT;
  payload: {
    elementId: string;
    verdict: 'true' | 'false' | 'unknown' | 'no_claim';
    confidence: number; // 0-100
    explanation: string;
    sources: Array<{ title: string; url: string }>;
  };
}

// Content script sends
chrome.runtime.sendMessage(
  {
    type: MessageType.CHECK_CLAIM,
    payload: { text, elementId, platform }
  },
  (response: ClaimResultMessage) => {
    if (chrome.runtime.lastError) {
      console.error('Message failed:', chrome.runtime.lastError);
      return;
    }
    updateIndicator(response);
  }
);

// Background worker listens
chrome.runtime.onMessage.addListener(
  (message: CheckClaimMessage, sender, sendResponse) => {
    if (message.type === MessageType.CHECK_CLAIM) {
      // CRITICAL: Return true to keep channel open for async response
      handleClaimCheck(message.payload)
        .then(result => sendResponse({ type: MessageType.CLAIM_RESULT, payload: result }))
        .catch(error => sendResponse({ type: MessageType.CLAIM_RESULT, payload: errorResult }));
      return true; // Keep message channel open
    }
  }
);
```

### 6. OpenAI Integration

#### Stage 1: Claim Detection

```typescript
// background/ai/prompts.ts
export const STAGE1_SYSTEM_PROMPT = `You are a fact-checking assistant specializing in claim detection.

Your task: Analyze text and identify specific factual claims that can be objectively verified.

INCLUDE:
- Statements about verifiable facts (dates, numbers, events, scientific claims)
- Historical claims that can be checked against records
- Statistical claims with specific numbers
- Claims about public figures' actions or statements

EXCLUDE:
- Opinions and subjective judgments
- Questions
- Predictions about the future
- Purely subjective statements ("this is beautiful", "I think...")
- General commentary without specific verifiable assertions

Return JSON only, no additional text.`;

// background/ai/stage1-detector.ts
interface Stage1Response {
  hasClaim: boolean;
  claims: string[];
  reasoning: string;
}

const STAGE1_SCHEMA = {
  type: "object",
  properties: {
    hasClaim: { type: "boolean" },
    claims: { type: "array", items: { type: "string" } },
    reasoning: { type: "string" }
  },
  required: ["hasClaim", "claims", "reasoning"],
  additionalProperties: false
};

async function detectClaims(text: string): Promise<Stage1Response> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: STAGE1_SYSTEM_PROMPT },
      { role: "user", content: text }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "claim_detection",
        strict: true,
        schema: STAGE1_SCHEMA
      }
    },
    temperature: 0.3, // Lower temperature for consistent classification
  });

  return JSON.parse(response.choices[0].message.content);
}
```

#### Stage 2: Verification with Search

```typescript
// background/ai/stage2-verifier.ts
export const STAGE2_SYSTEM_PROMPT = `You are a fact-checking assistant with access to web search.

When verifying claims:
1. Analyze the claim to identify key factual assertions
2. Generate targeted search queries to find relevant sources
3. Evaluate source credibility (prefer authoritative sources)
4. Synthesize findings into a verdict

VERDICT CATEGORIES:
- "true": Claim is supported by multiple credible sources
- "false": Claim is contradicted by credible evidence
- "unknown": Insufficient evidence, conflicting sources, or unverifiable

Be conservative: when in doubt, return "unknown" rather than forcing a verdict.
Always cite specific sources in your explanation.`;

const SEARCH_FUNCTION = {
  type: "function",
  function: {
    name: "search_web",
    description: "Search the web for information to verify factual claims",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query optimized for finding relevant verification sources"
        },
        result_count: {
          type: "number",
          description: "Number of results to retrieve (1-10)",
          default: 5
        }
      },
      required: ["query"]
    }
  }
};

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["true", "false", "unknown"]
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 100
    },
    explanation: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" }
        },
        required: ["title", "url"]
      }
    }
  },
  required: ["verdict", "confidence", "explanation", "sources"],
  additionalProperties: false
};

interface VerificationResult {
  verdict: 'true' | 'false' | 'unknown';
  confidence: number;
  explanation: string;
  sources: Array<{ title: string; url: string }>;
}

async function verifyClaim(
  claim: string,
  braveSearchClient: BraveSearchClient
): Promise<VerificationResult> {
  let searchResults: string = "";

  const runner = openai.chat.completions
    .create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: STAGE2_SYSTEM_PROMPT },
        { role: "user", content: `Verify this claim: "${claim}"` }
      ],
      tools: [SEARCH_FUNCTION],
      temperature: 0.5,
    })
    .on("functionCall", async (functionCall) => {
      // Extract search query from function call
      const args = JSON.parse(functionCall.arguments);
      const results = await braveSearchClient.search(args.query, args.result_count || 5);

      // Format results for GPT
      searchResults = results.map((r, i) =>
        `[${i+1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`
      ).join("\n\n");

      // Return search results to model
      return searchResults;
    });

  const finalResponse = await runner;

  // Parse final verdict (using JSON schema for structured output)
  return JSON.parse(finalResponse.choices[0].message.content);
}
```

### 7. Brave Search Integration

```typescript
// background/search/brave-search.ts
interface BraveSearchResult {
  title: string;
  url: string;
  snippet: string;
  age?: string; // Recency indicator
}

class BraveSearchClient {
  private apiKey: string;
  private baseUrl = 'https://api.search.brave.com/res/v1/web/search';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, count: number = 5): Promise<BraveSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      count: count.toString(),
      text_decorations: 'false', // Remove markup from snippets
      search_lang: 'en',
    });

    const response = await fetch(`${this.baseUrl}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Brave Search API error: ${response.status}`);
    }

    const data = await response.json();

    return data.web?.results?.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      age: r.age,
    })) || [];
  }
}
```

**Alternative Search Providers (for future consideration):**
- Serper API: $0.30/1K queries (requires $50 minimum, best for high volume)
- Google Custom Search: Free tier 100/day, complex setup
- Third-party fact-check APIs: ClaimBuster (free), Google Fact Check Tools

### 8. Rate Limiting & Retry Logic

```typescript
// background/utils/rate-limiter.ts
class RateLimiter {
  private queue: Array<{ fn: () => Promise<any>; resolve: (value: any) => void; reject: (error: any) => void }> = [];
  private processing = false;
  private readonly requestsPerMinute: number;
  private readonly intervalMs: number;

  constructor(requestsPerMinute: number) {
    this.requestsPerMinute = requestsPerMinute;
    this.intervalMs = 60000 / requestsPerMinute;
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const { fn, resolve, reject } = this.queue.shift()!;

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    }

    // Wait before processing next request
    setTimeout(() => {
      this.processing = false;
      this.processQueue();
    }, this.intervalMs);
  }
}

// background/utils/retry.ts
async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on 4xx errors (client errors)
      if (error.status && error.status >= 400 && error.status < 500) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * 0.3 * delay; // 0-30% jitter
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
  }

  throw lastError!;
}
```

### 9. LRU Cache Implementation

```typescript
// background/utils/cache.ts
interface CacheEntry<T> {
  value: T;
  expiry: number;
}

class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  async get(key: K): Promise<V | null> {
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  async set(key: K, value: V): Promise<void> {
    // Remove oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttlMs,
    });

    // Persist to chrome.storage.local for cross-session caching
    await this.persistToStorage();
  }

  private async persistToStorage(): Promise<void> {
    const serialized = Array.from(this.cache.entries());
    await chrome.storage.local.set({ claimCache: serialized });
  }

  static async fromStorage<K, V>(maxSize: number, ttlMs: number): Promise<LRUCache<K, V>> {
    const cache = new LRUCache<K, V>(maxSize, ttlMs);
    const stored = await chrome.storage.local.get('claimCache');

    if (stored.claimCache) {
      cache.cache = new Map(stored.claimCache);
    }

    return cache;
  }
}

// Usage: Hash claim text for cache key
function hashClaim(text: string): string {
  // Simple hash for demo - use crypto.subtle.digest in production
  return btoa(text.toLowerCase().trim());
}
```

**Cache Strategy:**
- 7-day TTL for verified claims
- 1000-entry LRU limit
- Persist to `chrome.storage.local` for cross-session
- Hash normalized claim text as key (case-insensitive, trimmed)
- 40-60% hit rate expected for recirculated misinformation

### 10. UI Components

#### Visual Indicators

```typescript
// content/ui/indicator.ts
class FactCheckIndicator {
  private element: HTMLDivElement;
  private shadowRoot: ShadowRoot;

  constructor(
    private parentElement: Element,
    private elementId: string
  ) {
    this.createIndicator();
  }

  private createIndicator(): void {
    this.element = document.createElement('div');
    this.element.id = `fact-check-indicator-${this.elementId}`;

    // Use Shadow DOM for style isolation
    this.shadowRoot = this.element.attachShadow({ mode: 'closed' });

    // Position absolutely in top-right corner
    this.element.style.position = 'absolute';
    this.element.style.top = '8px';
    this.element.style.right = '8px';
    this.element.style.zIndex = '2147483647';

    this.showLoading();
    this.parentElement.appendChild(this.element);
  }

  showLoading(): void {
    this.shadowRoot.innerHTML = `
      <style>
        .indicator {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #FFC107;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid white;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
      </style>
      <div class="indicator" aria-label="Fact check in progress">
        <div class="spinner"></div>
      </div>
    `;
  }

  showResult(result: ClaimResultMessage['payload']): void {
    const colors = {
      true: '#4CAF50',
      false: '#f44336',
      unknown: '#FFC107',
      no_claim: '#9E9E9E',
    };

    const icons = {
      true: '✓',
      false: '✗',
      unknown: '?',
      no_claim: '○',
    };

    const labels = {
      true: 'Fact check result: verified true',
      false: 'Fact check result: verified false',
      unknown: 'Fact check result: unverifiable',
      no_claim: 'No factual claims detected',
    };

    this.shadowRoot.innerHTML = `
      <style>
        .indicator {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: ${colors[result.verdict]};
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 18px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          transition: transform 0.2s;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .indicator:hover {
          transform: scale(1.1);
        }
        @keyframes scaleIn {
          from { transform: scale(1); }
          to { transform: scale(1.05); }
        }
        .indicator.animate {
          animation: scaleIn 0.2s ease-out;
        }
      </style>
      <div class="indicator animate"
           aria-label="${labels[result.verdict]}"
           tabindex="0"
           role="button">
        ${icons[result.verdict]}
      </div>
    `;

    // Add click handler for popup
    const indicator = this.shadowRoot.querySelector('.indicator');
    indicator?.addEventListener('click', () => this.showPopup(result));
    indicator?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.showPopup(result);
    });
  }

  private showPopup(result: ClaimResultMessage['payload']): void {
    // Create popup using FactCheckPopup component
    const popup = new FactCheckPopup(this.element, result);
    popup.show();
  }
}
```

#### Explanation Popup

```typescript
// content/ui/popup.ts
class FactCheckPopup {
  private element: HTMLDivElement;
  private shadowRoot: ShadowRoot;

  constructor(
    private anchorElement: HTMLElement,
    private result: ClaimResultMessage['payload']
  ) {
    this.createElement();
  }

  private createElement(): void {
    this.element = document.createElement('div');
    this.shadowRoot = this.element.attachShadow({ mode: 'closed' });

    this.element.style.position = 'absolute';
    this.element.style.zIndex = '2147483647';

    document.body.appendChild(this.element);
  }

  show(): void {
    const rect = this.anchorElement.getBoundingClientRect();

    // Position below indicator
    this.element.style.top = `${rect.bottom + 8}px`;
    this.element.style.left = `${rect.right - 320}px`;

    const verdictColors = {
      true: '#4CAF50',
      false: '#f44336',
      unknown: '#FFC107',
    };

    this.shadowRoot.innerHTML = `
      <style>
        .popup {
          width: 320px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
          padding: 16px;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          line-height: 1.5;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .verdict {
          font-weight: bold;
          font-size: 16px;
          color: ${verdictColors[this.result.verdict as 'true' | 'false' | 'unknown']};
          text-transform: capitalize;
        }
        .close {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          color: #666;
        }
        .close:hover {
          color: #000;
        }
        .confidence {
          margin-bottom: 12px;
        }
        .confidence-bar {
          width: 100%;
          height: 8px;
          background: #E0E0E0;
          border-radius: 4px;
          overflow: hidden;
        }
        .confidence-fill {
          height: 100%;
          background: ${verdictColors[this.result.verdict as 'true' | 'false' | 'unknown']};
          width: ${this.result.confidence}%;
          transition: width 0.3s;
        }
        .confidence-text {
          font-size: 12px;
          color: #666;
          margin-top: 4px;
        }
        .explanation {
          margin-bottom: 12px;
          color: #333;
        }
        .sources {
          margin-top: 12px;
        }
        .sources-title {
          font-weight: bold;
          margin-bottom: 8px;
          color: #333;
        }
        .source {
          margin-bottom: 8px;
        }
        .source a {
          color: #1976D2;
          text-decoration: none;
          font-size: 13px;
        }
        .source a:hover {
          text-decoration: underline;
        }
        .footer {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid #E0E0E0;
          font-size: 12px;
          color: #666;
        }
      </style>
      <div class="popup">
        <div class="header">
          <div class="verdict">${this.result.verdict}</div>
          <button class="close" aria-label="Close">×</button>
        </div>

        <div class="confidence">
          <div class="confidence-bar">
            <div class="confidence-fill"></div>
          </div>
          <div class="confidence-text">Confidence: ${this.result.confidence}%</div>
        </div>

        <div class="explanation">${this.escapeHtml(this.result.explanation)}</div>

        ${this.result.sources.length > 0 ? `
          <div class="sources">
            <div class="sources-title">Sources:</div>
            ${this.result.sources.map(s => `
              <div class="source">
                <a href="${this.escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">
                  ${this.escapeHtml(s.title)}
                </a>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="footer">
          Powered by Fact-It | AI-generated verification
        </div>
      </div>
    `;

    // Close button handler
    const closeBtn = this.shadowRoot.querySelector('.close');
    closeBtn?.addEventListener('click', () => this.hide());

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick);
    }, 0);
  }

  hide(): void {
    document.removeEventListener('click', this.handleOutsideClick);
    this.element.remove();
  }

  private handleOutsideClick = (e: MouseEvent): void => {
    if (!this.element.contains(e.target as Node) &&
        !this.anchorElement.contains(e.target as Node)) {
      this.hide();
    }
  };

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
```

---

## Implementation Phases

### Phase 0: Dynamic Selector Discovery (Week 2)

**Objectives:**
- Implement LLM-powered selector discovery for universal platform support
- Replace hardcoded platform-specific selectors with dynamic detection
- Create self-healing system that adapts to HTML structure changes

**Deliverables:**

1. **DOM Sampling Module** (`src/background/selectors/dom-sampler.ts`):
   - Extract simplified HTML sample from page (first 10-20 post elements)
   - Remove `style`, `script`, inline styles to reduce token count
   - Target: <2000 tokens per sample (~8KB HTML)
   - Use heuristic detection for initial post identification (article, role="article", >100 chars text)

2. **Selector Generator** (`src/background/selectors/selector-generator.ts`):
   - GPT-4o-mini integration with structured JSON output
   - Prompt engineering to identify post containers, text content, author, timestamp
   - Preference hierarchy: data-* attributes > role attributes > semantic tags > classes
   - Returns selectors with confidence score (0-100)

3. **Selector Validator** (`src/background/selectors/selector-validator.ts`):
   - Test generated selectors on current page
   - Require: ≥5 post containers found, ≥70% with extractable text
   - Calculate success rate and confidence metrics
   - Retry with different sample if validation fails

4. **Selector Cache Manager** (`src/background/selectors/selector-cache.ts`):
   - Store selectors per domain in chrome.storage.local
   - Cache schema: selectors, confidence, timestamps, validation metrics
   - 30-day TTL with weekly revalidation
   - Automatic regeneration if selectors find <5 posts

5. **Message Passing** (update `src/shared/types.ts`):
   ```typescript
   MessageType.DISCOVER_SELECTORS = 'DISCOVER_SELECTORS'
   MessageType.SELECTORS_DISCOVERED = 'SELECTORS_DISCOVERED'

   interface DiscoverSelectorsMessage {
     type: MessageType.DISCOVER_SELECTORS;
     payload: {
       domain: string;
       htmlSample: string;
     };
   }

   interface SelectorsDiscoveredMessage {
     type: MessageType.SELECTORS_DISCOVERED;
     payload: {
       domain: string;
       selectors: {
         postContainer: string;
         textContent: string;
         author?: string;
         timestamp?: string;
       };
       confidence: number;
       cached: boolean;
     };
   }
   ```

6. **Integration with Content Scripts**:
   - Content script initialization checks for cached selectors
   - If not found, sends DOM sample to background worker
   - Background worker generates + validates selectors
   - Returns selectors to content script
   - Content script uses discovered selectors for MutationObserver

**Testing:**
- Test selector discovery on 6+ platforms:
  - Twitter/X (known working selector: `article[role="article"]`)
  - LinkedIn
  - Facebook
  - Reddit
  - Medium
  - News sites (CNN, BBC, NYTimes)
- Validate >80% success rate across platforms
- Test regeneration when selectors become stale

**Success Criteria:**
- Selector discovery succeeds on ≥80% of tested platforms
- Cached selectors work for ≥30 days
- Validation catches broken selectors within 1 page load
- Total cost per domain <$0.001 (including retries)

**Cost Analysis:**
- GPT-4o-mini per domain: ~2000 input + 200 output tokens = $0.00042
- 20 domains = $0.0084 (less than 1 cent)
- Annual regeneration (52 weeks): $0.02 per domain
- **Conclusion**: Negligible cost impact vs. fact-checking costs ($8-12/month)

**Fallback Strategy:**
- If Stage 0 fails 3 consecutive times → Use hardcoded fallback selectors
- Log failures to chrome.storage for manual review
- Known platforms (Twitter, LinkedIn, Facebook) maintain hardcoded backups

**Estimated Effort:** 30-40 hours

---

### Phase 1: Foundation & Single Platform (Weeks 1-2) ✅ COMPLETE

**Objectives:**
- Basic Chrome extension structure with TypeScript
- OpenAI API integration (Stage 1 + Stage 2)
- Twitter/X content script with DOM monitoring
- Simple visual indicators (no popups yet)

**Deliverables:**
1. Project setup:
   - TypeScript + Webpack configuration
   - Manifest V3 manifest.json
   - Chrome types (@types/chrome)
   - Directory structure per architecture

2. Settings UI:
   - popup.html with API key input fields (OpenAI, Brave Search)
   - Validation and test API calls
   - Store keys in chrome.storage.local

3. Background service worker:
   - OpenAI client wrapper
   - Stage 1 claim detection implementation
   - Message listener for content script requests

4. Twitter content script:
   - MutationObserver for `article[data-testid="tweet"]`
   - Text extraction from `div[data-testid="tweetText"]`
   - Send to background worker
   - Display loading + result indicators

5. Testing:
   - Manual testing on Twitter.com
   - 10-20 test tweets covering opinions vs. facts
   - Verify Stage 1 filtering accuracy

**Success Criteria:**
- Extension loads without errors
- Detects new tweets in real-time
- Stage 1 accurately filters ~65% of content (no claims)
- Visual indicators appear within 2 seconds

**Estimated Effort:** 40-50 hours

---

### Phase 2: Complete Verification Pipeline (Weeks 3-4)

**Objectives:**
- Brave Search API integration
- Stage 1 + Stage 2 AI verification with function calling
- Detailed explanation popups
- Rate limiting and retry logic

**Deliverables:**
1. Brave Search client:
   - API wrapper with error handling
   - Result formatting for GPT consumption

2. Stage 2 verifier:
   - Function calling implementation
   - Search result synthesis
   - Structured JSON output with confidence scores

3. Enhanced UI:
   - FactCheckPopup component with Shadow DOM
   - Confidence bar visualization
   - Source links (clickable, open in new tab)
   - Close button and outside-click handling

4. Robustness:
   - Rate limiter (500 RPM for OpenAI)
   - Exponential backoff retry (3 attempts, jitter)
   - Error handling and user feedback

5. Testing:
   - 50+ real tweets with verifiable claims
   - Accuracy assessment (manual verification of verdicts)
   - Performance profiling (response times)

**Success Criteria:**
- Stage 2 completes in <4 seconds (90th percentile)
- Popups display detailed explanations with sources
- Rate limiting prevents API errors
- Retry logic recovers from transient failures

**Estimated Effort:** 50-60 hours

---

### Phase 3: Multi-Platform Testing (Week 5)

**Objectives:**
- Test Stage 0 selector discovery across diverse platforms
- Validate universal platform support without hardcoded selectors
- Gather metrics on selector discovery success rates

**Deliverables:**
1. **Platform Testing Suite:**
   - Test selector discovery on 10+ platforms:
     - Social: Twitter/X, LinkedIn, Facebook, Reddit, Instagram (if accessible)
     - News: CNN, BBC, NYTimes, Medium, Substack
     - Forums: Hacker News, Stack Overflow
   - Document selector patterns discovered per platform
   - Track confidence scores and success rates

2. **Edge Case Handling:**
   - Test on pages with unusual structures (nested posts, infinite scroll, lazy loading)
   - Verify selector regeneration when HTML changes
   - Test fallback to hardcoded selectors when Stage 0 fails

3. **Performance Validation:**
   - Measure selector discovery time (target: <2 seconds)
   - Verify cache hits reduce redundant LLM calls
   - Monitor API costs across platforms

4. **Generic Base Content Script:**
   - Create `src/content/universal-content.ts` that works with any selectors
   - Platform-agnostic MutationObserver implementation
   - Dynamic selector application from cache

5. **Fallback Refinement:**
   - Maintain hardcoded selectors for top 3 platforms (Twitter, LinkedIn, Facebook)
   - Automatic fallback when Stage 0 confidence <70%
   - User notification when using fallback mode

**Success Criteria:**
- Selector discovery succeeds on ≥80% of tested platforms
- Average discovery time <2 seconds
- Cache hit rate >95% on repeated visits
- Zero manual selector configuration needed

**Estimated Effort:** 25-30 hours

---

### Phase 4: Performance & Caching (Week 6)

**Objectives:**
- LRU caching for verified claims
- Request batching for auto-check mode
- Performance optimization
- Memory profiling

**Deliverables:**
1. LRU cache:
   - 1000-entry limit, 7-day TTL
   - Persist to chrome.storage.local
   - Claim text hashing for keys

2. Request batching:
   - Collect 5-10 text chunks before Stage 1
   - Process during `requestIdleCallback`
   - User setting to enable/disable auto-check

3. Optimization:
   - WeakSet for processed elements
   - Debounced MutationObserver (300ms)
   - Lazy-load popup on demand

4. Monitoring:
   - Chrome DevTools performance profiling
   - Memory leak detection
   - API cost tracking in settings UI

5. Testing:
   - Infinite scroll performance (100+ posts)
   - Cache hit rate measurement
   - Memory usage over 30-minute session

**Success Criteria:**
- Cache hit rate >40% for recirculated content
- <5ms overhead per mutation event
- <50MB memory usage after 100 posts

**Estimated Effort:** 25-30 hours

---

### Phase 5: Polish & User Experience (Week 7)

**Objectives:**
- Accessibility improvements
- Settings enhancements
- Usage statistics dashboard
- Error messaging and user guidance

**Deliverables:**
1. Accessibility:
   - ARIA labels on all interactive elements
   - Keyboard navigation (Tab, Enter)
   - Screen reader testing
   - Color-blind friendly icons (✓, ✗, ? distinct shapes)

2. Enhanced settings:
   - Confidence threshold slider (only show verdicts >X%)
   - Platform enable/disable toggles
   - Auto-check mode toggle
   - Export/import settings

3. Statistics dashboard:
   - Total checks performed
   - Verdicts breakdown (true/false/unknown)
   - API cost estimate (based on usage)
   - Cache hit rate

4. User guidance:
   - Onboarding flow (first install)
   - API key setup instructions with screenshots
   - Privacy policy disclosure
   - FAQ section

5. Error handling:
   - Clear error messages ("API key invalid", "Rate limit exceeded")
   - Retry prompts for transient errors
   - Link to troubleshooting docs

**Success Criteria:**
- Passes WCAG 2.1 Level AA accessibility audit
- First-time users can set up API keys in <5 minutes
- Error messages are actionable (tell user what to do)

**Estimated Effort:** 25-30 hours

---

### Phase 6: Testing, Documentation & Release (Week 8)

**Objectives:**
- Comprehensive testing (unit + integration)
- Documentation (README, user guide, API docs)
- Chrome Web Store preparation
- Release v0.1.0

**Deliverables:**
1. Testing:
   - Unit tests for key functions (claim detection, caching, rate limiting)
   - Integration tests for message passing
   - End-to-end tests on each platform
   - Load testing (API rate limits, performance under stress)

2. Documentation:
   - README.md (installation, setup, features, architecture)
   - USER_GUIDE.md (getting API keys, using the extension, interpreting results)
   - API_REFERENCE.md (for developers extending the extension)
   - PRIVACY.md (data handling, API provider policies)

3. Chrome Web Store:
   - Promotional images (1280x800, 640x400)
   - Extension description and screenshots
   - Privacy policy compliance
   - Permissions justification document

4. Release preparation:
   - Version bump to 0.1.0
   - Build production bundle (minified, no source maps)
   - Create release notes
   - Submit to Chrome Web Store

5. Post-release:
   - Monitor user feedback (GitHub issues)
   - Track error reports (consider Sentry integration)
   - Plan v0.2.0 features based on feedback

**Success Criteria:**
- Test coverage >70% for critical paths
- Documentation covers all user-facing features
- Chrome Web Store approval within 7 days
- Zero critical bugs in first 100 installs

**Estimated Effort:** 30-40 hours

---

## Alternative Approaches Considered

### Approach 1: Single-Stage with GPT-4o Only

**Description:** Use only GPT-4o for both claim detection and verification in a single pass.

**Pros:**
- Simpler architecture (fewer API calls to manage)
- Potentially more accurate (stronger model throughout)
- Reduced latency (one round trip instead of two)

**Cons:**
- **Cost explosion**: 16x more expensive than GPT-4o-mini for Stage 1
- Processes all content (opinions, questions) unnecessarily
- User checking 100 posts/day → $20-30/month (vs. $8-12 with two-stage)

**Why Rejected:** Cost unsustainable for individual users. Two-stage approach reduces costs by 60%+ while maintaining accuracy where it matters (verification).

---

### Approach 2: Local Model (ONNX Runtime)

**Description:** Run claim detection locally in browser using fine-tuned smaller model (BERT, DistilBERT) via ONNX Runtime.

**Pros:**
- Zero API costs for Stage 1
- Instant response (<100ms)
- Complete privacy (no external API calls)
- Works offline

**Cons:**
- Requires model fine-tuning (expensive data annotation)
- Lower accuracy than GPT-4o-mini (~80% vs. 95%)
- Browser bundle size increase (20-50MB)
- Complexity of model deployment and updates

**Why Deferred:** Excellent optimization for v0.2.0+, but adds significant complexity to initial release. Two-stage approach with GPT-4o-mini provides fast, accurate Stage 1 at acceptable cost ($0.023 per 1000 posts).

---

### Approach 3: Third-Party Fact-Check API Primary

**Description:** Use ClaimBuster or Google Fact Check Tools API as primary verification, fall back to AI only if no match.

**Pros:**
- Leverages human-curated fact-checks (higher accuracy)
- Lower cost (these APIs are free)
- Faster response for previously checked claims

**Cons:**
- **Coverage limited to ~5-10% of claims** (only major news/politics)
- API latency often 3-5 seconds (slower than GPT-4o)
- Google Fact Check Tools has sparse data
- Doesn't scale to user-generated content on social media

**Why Hybrid Selected:** Use as preliminary check (cache lookup), but primary pipeline must handle arbitrary claims. Potential addition in Phase 7 optimization.

---

### Approach 4: Persistent Background Page (Manifest V2)

**Description:** Use Manifest V2 with persistent background page instead of V3 service worker.

**Pros:**
- Simpler state management (background page always running)
- No service worker termination issues
- Easier debugging

**Cons:**
- **Manifest V2 deprecated**: Chrome will disable in June 2025
- Higher resource usage (persistent background page)
- No long-term viability

**Why Rejected:** Must use Manifest V3 for future compatibility. Service worker pattern is mandatory.

---

## Acceptance Criteria

### Functional Requirements

- [ ] Detects new posts in real-time on Twitter/X, LinkedIn, Facebook
- [ ] Stage 1 filters out opinions, questions, subjective statements (>60% of content)
- [ ] Stage 2 verifies factual claims using web search
- [ ] Returns three-category verdicts: true, false, unknown
- [ ] Displays visual indicators (✓, ✗, ?) in post containers
- [ ] Shows detailed explanations with confidence scores and source links on click
- [ ] Supports user-provided API keys (OpenAI + Brave Search)
- [ ] Validates API keys before saving (test API calls)
- [ ] Caches verified claims for 7 days (LRU cache)
- [ ] Implements rate limiting (500 RPM for OpenAI)
- [ ] Retries failed requests with exponential backoff

### Non-Functional Requirements

- [ ] **Performance:**
  - Stage 1 completes in <1 second (90th percentile)
  - Stage 2 completes in <4 seconds (90th percentile)
  - MutationObserver overhead <5ms per event
  - Memory usage <50MB after 100 posts

- [ ] **Cost:**
  - User checking 100 posts/day incurs <$15/month total API costs
  - Cache reduces redundant checks by >40%

- [ ] **Accuracy:**
  - Stage 1 claim detection precision >90% (manual audit of 100 samples)
  - Stage 2 verdicts agree with manual fact-checks >85% of time
  - "Unknown" used appropriately for ambiguous cases (not forced verdicts)

- [ ] **Security:**
  - API keys stored in chrome.storage.local (not accessible to page scripts)
  - No API keys in content script context
  - All HTTPS connections to APIs
  - No PII sent to external services (only claim text)

- [ ] **Accessibility:**
  - Passes WCAG 2.1 Level AA audit
  - Keyboard navigation functional (Tab, Enter)
  - Screen reader announces verdict states
  - Color-blind friendly indicators (shape + color)

- [ ] **User Experience:**
  - First-time setup completable in <5 minutes
  - Clear error messages with actionable guidance
  - Privacy disclosures visible before data transmission
  - Visual feedback during loading states

### Quality Gates

- [ ] **Test Coverage:**
  - Unit test coverage >70% for business logic
  - Integration tests for all message passing flows
  - Manual testing on 3 platforms (Twitter, LinkedIn, Facebook)

- [ ] **Code Quality:**
  - TypeScript strict mode enabled, zero `any` types
  - ESLint + Prettier configured and passing
  - No console errors in production build

- [ ] **Documentation:**
  - README with installation, setup, usage instructions
  - API key setup guide with screenshots
  - Privacy policy disclosure
  - Architecture documentation (this document)

- [ ] **Chrome Web Store:**
  - Promotional images (1280x800, 640x400)
  - Extension description <132 characters
  - Privacy policy URL included
  - Permissions justified in submission

---

## Success Metrics

### Primary KPIs

1. **Accuracy Rate**: >85% of Stage 2 verdicts agree with manual fact-checks
   - *Measurement*: Monthly audit of 50 random verdicts by human reviewers
   - *Target*: 85% agreement in Phase 6, 90% by v0.2.0

2. **Response Time**: <4 seconds for Stage 2 verification (90th percentile)
   - *Measurement*: Log timestamps in background worker, analyze distribution
   - *Target*: 90% of checks complete in <4s

3. **Cost Per Check**: <$0.012 per post (combined OpenAI + Brave Search)
   - *Measurement*: Track API calls, calculate actual costs
   - *Target*: 100 posts → $1.20 or less

4. **Cache Hit Rate**: >40% for Stage 2 verifications
   - *Measurement*: Cache hits / total Stage 2 requests
   - *Target*: 40% by Week 6, 50% by Week 12 (as cache populates)

### Secondary Metrics

5. **User Retention**: >60% of installers use extension 7 days after install
   - *Measurement*: Chrome Web Store analytics
   - *Target*: 60% D7 retention

6. **API Key Setup Completion**: >70% of installers complete API key setup
   - *Measurement*: Log anonymous event when keys validated
   - *Target*: 70% setup completion rate

7. **Error Rate**: <5% of fact-check requests fail
   - *Measurement*: Failed requests / total requests
   - *Target*: <5% error rate (includes API errors, timeouts)

8. **Extension Performance**: <5ms MutationObserver overhead
   - *Measurement*: Chrome DevTools Performance profiling
   - *Target*: Observer processing time <5ms per batch

---

## Dependencies & Prerequisites

### External Services

1. **OpenAI API** (Required)
   - Account signup: platform.openai.com
   - Tier 1 minimum (500 RPM for GPT-4o-mini, GPT-4o)
   - API key with billing enabled
   - **Risk**: API pricing changes (monitor monthly)

2. **Brave Search API** (Required)
   - Account signup: brave.com/search/api
   - 2,000 free queries/month, then $5 per 1K
   - API key (subscription token)
   - **Risk**: Free tier removal (have Serper as backup)

3. **Chrome Web Store** (Distribution)
   - Developer account ($5 one-time fee)
   - Privacy policy hosted URL
   - Promotional images prepared

### Technical Prerequisites

1. **Development Environment:**
   - Node.js 18+ (for TypeScript + Webpack)
   - Chrome 120+ (Manifest V3 support)
   - VSCode with TypeScript extension (recommended)

2. **Build Tools:**
   - TypeScript 5.0+
   - Webpack 5+ (with ts-loader)
   - ESLint + Prettier
   - @types/chrome (Chrome extension types)

3. **Testing:**
   - Jest (unit testing)
   - Puppeteer (E2E testing)
   - Chrome DevTools Protocol (performance profiling)

### User Prerequisites

1. **API Access:**
   - Users must obtain their own OpenAI API key
   - Users must obtain their own Brave Search API key
   - Clear documentation on setup process

2. **Platform Access:**
   - Active accounts on target platforms (Twitter, LinkedIn, Facebook)
   - Platforms must be accessible (not blocked by corporate firewalls)

3. **Browser:**
   - Chrome 120+ or Chromium-based browser (Edge, Brave, etc.)

---

## Risk Analysis & Mitigation

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Platform selector changes** (Twitter/X changes class names) | High | Low | Stage 0 auto-regenerates selectors, 30-day cache with weekly validation, self-healing architecture |
| **LLM selector generation fails** (returns invalid selectors) | Medium | Medium | Validation layer requires ≥70% success rate, retry with different samples, fallback to hardcoded selectors after 3 failures |
| **Service worker termination** (Chrome kills worker mid-request) | Medium | High | Implement request retry logic, persist state to storage, handle worker restart gracefully |
| **API rate limiting** (OpenAI 500 RPM exceeded) | Medium | Medium | Rate limiter queue (500 RPM), exponential backoff, user feedback during delays |
| **Cache invalidation bugs** (stale verdicts served) | Low | Medium | 7-day TTL conservative, cache version key (clear on schema changes), manual clear button |
| **Shadow DOM conflicts** (platform updates break isolation) | Low | Low | Use closed Shadow DOM, minimize global state, test regularly |
| **DOM sampling too large** (exceeds token limits) | Low | Medium | Aggressive HTML simplification, sample only first 10-20 posts, fallback to fewer posts if needed |

### Business/Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **API pricing increases** (OpenAI raises GPT-4o costs) | Medium | High | Monitor pricing monthly, implement cost alerts in UI, provide model selection (GPT-4o-mini for both stages option) |
| **User API key friction** (users don't want to pay for APIs) | High | High | Clear cost disclosure ($8-12/month for 100 posts/day), free tier demo mode (2K Brave searches/month), future: offer managed service option |
| **Accuracy criticism** (verdicts disputed by users) | Medium | High | Transparent methodology disclosure, "Report Error" button, public changelog, emphasize "AI-generated" disclaimer |
| **Bias accusations** (political users claim bias) | High | Medium | Three-category verdicts (acknowledge uncertainty), publish prompts publicly, cite diverse sources, allow user feedback |
| **Chrome Web Store rejection** (privacy/permissions issues) | Low | High | Pre-submission review, minimal permissions (only storage + scripting), privacy policy, permissions justification doc |

### Ethical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **False positives harm** (marking true info as false) | Medium | Critical | Conservative confidence thresholds (>80% for "false"), prefer "unknown" when uncertain, show sources for verification |
| **Over-reliance on AI** (users treat verdicts as absolute truth) | High | High | Prominent disclaimer ("AI-generated, not definitive"), encourage critical thinking, show confidence scores |
| **Privacy concerns** (claim text sent to APIs) | Medium | Medium | Privacy disclosure in settings, no PII extraction, users control API keys (direct relationship with providers) |
| **Weaponization** (bad actors use to discredit legitimate info) | Low | High | Emphasize uncertainty acknowledgment, require user-controlled API keys (prevents mass abuse), monitor for misuse patterns |

### Mitigation Strategies Summary

1. **Technical Robustness:**
   - Multi-layered selector strategies
   - Comprehensive error handling
   - Rate limiting and retry logic
   - Regular platform monitoring

2. **Cost Management:**
   - Two-stage architecture
   - Aggressive caching (40-60% hit rate)
   - User model selection options
   - Cost tracking in settings UI

3. **Accuracy & Trust:**
   - Three-category verdicts (true/false/unknown)
   - Confidence scores (0-100)
   - Source citations (clickable links)
   - "Report Error" feedback mechanism

4. **Ethical Transparency:**
   - Public methodology disclosure
   - "AI-generated" disclaimers
   - Privacy policy compliance
   - User-controlled API keys

---

## Resource Requirements

### Development Team

**Phase 1-8 (Initial Release):**
- 1× Full-stack developer (TypeScript, Chrome APIs, AI integration)
  - 225-280 hours over 8 weeks (~28-35 hours/week)
  - Skills: TypeScript, Chrome Extensions, OpenAI API, Webpack

**Post-Release (Maintenance):**
- 1× Developer part-time (10-15 hours/week)
  - Platform selector updates
  - Bug fixes
  - User support

### Infrastructure Costs

**Development:**
- OpenAI API (testing): ~$50-100/month
- Brave Search API (testing): Free tier (2K/month) sufficient
- Chrome Web Store: $5 one-time
- **Total Development Costs**: ~$55-105

**User Costs (Per User):**
- OpenAI API: $8-12/month (100 posts/day)
- Brave Search API: $2-5/month (100 posts/day, 50 searches)
- **Total User Costs**: $10-17/month

### Timeline

| Phase | Duration | Hours | Calendar Weeks |
|-------|----------|-------|----------------|
| Phase 1: Foundation | 2 weeks | 40-50 | Weeks 1-2 ✅ COMPLETE |
| **Phase 0: Selector Discovery** | **1 week** | **30-40** | **Week 2** (NEW) |
| Phase 2: Verification | 2 weeks | 50-60 | Weeks 3-4 |
| Phase 3: Multi-Platform Testing | 1 week | 25-30 | Week 5 |
| Phase 4: Performance | 1 week | 25-30 | Week 6 |
| Phase 5: Polish | 1 week | 25-30 | Week 7 |
| Phase 6: Testing & Release | 1 week | 30-40 | Week 8 |
| **Total** | **9 weeks** | **255-320** | **9 weeks** |

**Assumptions:**
- Single developer working 28-35 hours/week
- No major blockers (API outages, Chrome API changes)
- Testing integrated throughout (not separate phase)
- Phase 0 can overlap with Phase 1 completion for efficiency

---

## Future Considerations

### v0.2.0 Enhancements (3-6 months post-release)

1. **Advanced Selector Discovery:**
   - Visual analysis using GPT-4 Vision to identify posts from screenshots
   - Hybrid approach: LLM-generated selectors + computer vision validation
   - Machine learning model trained on selector patterns across 100+ sites
   - Automatic A/B testing of multiple selector candidates

2. **Local Claim Detection Model:**
   - Fine-tune DistilBERT for Stage 1
   - Deploy via ONNX Runtime in browser
   - Eliminate Stage 1 API costs (60% cost reduction)
   - Requires: 10K+ annotated training examples ($2-5K labeling costs)

2. **Managed API Service (Backend Proxy):**
   - Offer optional hosted service ($5/month subscription)
   - Users don't need own API keys
   - Backend manages API calls, rate limiting, caching
   - Reduces setup friction, enables free tier (limited checks/day)

3. **Fact-Check API Integration:**
   - ClaimBuster API (free) for preliminary checks
   - Google Fact Check Tools (free) as cache layer
   - Reduces costs 40-60% for political/health claims

4. **Enhanced Platforms:**
   - Reddit support
   - YouTube comments support
   - News aggregator sites (Google News, Apple News)

### Long-Term Vision (12+ months)

1. **Collaborative Fact-Checking:**
   - Users can submit corrections to verdicts
   - Community voting on accuracy
   - Shared cache across all users (opt-in)

2. **Browser-Native Integration:**
   - Explore Chrome Extensions API enhancements
   - Potential partnership with Google for pre-installed extension

3. **Cross-Browser Support:**
   - Firefox port (WebExtensions API compatible)
   - Safari port (requires separate submission)

4. **Advanced AI Features:**
   - Multi-claim breakdown (identify all claims in long posts)
   - Claim tracking over time (how claim evolved)
   - Source credibility scoring (ML model for source quality)

5. **Enterprise/Education Licensing:**
   - White-label for universities (media literacy programs)
   - Corporate fact-checking for internal communications
   - API for third-party integrations

---

## Documentation Plan

### User-Facing Documentation

1. **README.md** (GitHub + Chrome Web Store)
   - Overview and features
   - Installation instructions
   - Quick start guide
   - Screenshots of key features

2. **USER_GUIDE.md**
   - How to obtain OpenAI API key (step-by-step with screenshots)
   - How to obtain Brave Search API key
   - Configuring settings (confidence thresholds, auto-check mode)
   - Interpreting results (what do verdicts mean?)
   - Privacy and data handling
   - Troubleshooting common issues

3. **FAQ.md**
   - "How much does this cost?"
   - "Why do I need my own API keys?"
   - "Is my data private?"
   - "Why does it say 'unknown' so often?"
   - "Can I trust the verdicts?"
   - "How do I report an error?"

4. **PRIVACY.md**
   - What data is collected (claim text only)
   - What data is sent to third parties (OpenAI, Brave Search)
   - What data is NOT collected (no PII, no browsing history)
   - API provider privacy policies (links)
   - User control over data (API keys, opt-out)

### Developer Documentation

1. **ARCHITECTURE.md** (this document)
   - System architecture
   - Implementation details
   - API integration patterns
   - Testing strategies

2. **API_REFERENCE.md**
   - Message passing protocol
   - Extensibility points (adding new platforms)
   - Storage schema
   - Event lifecycle

3. **CONTRIBUTING.md**
   - Development setup
   - Code style guide
   - Testing requirements
   - Pull request process

### Chrome Web Store Listing

1. **Description** (<132 chars):
   "Real-time fact-checking for social media. AI-powered verification with transparent sources. User-controlled, privacy-focused."

2. **Detailed Description** (detailed overview)
   - Key features (bullet points)
   - How it works (high-level)
   - Cost transparency ($8-12/month for avg user)
   - Privacy commitment

3. **Screenshots** (minimum 5):
   - Extension popup (settings)
   - Fact-check indicator on tweet
   - Detailed explanation popup
   - LinkedIn post with indicator
   - Usage statistics dashboard

4. **Promotional Images:**
   - 1280x800 hero image
   - 640x400 marquee image
   - 440x280 small tile

---

## References & Research

### Internal References

*None (new project, no existing codebase)*

### External References

**Chrome Extension Development:**
- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/) - Official Manifest V3 guide
- [Chrome Extension Samples](https://github.com/googlechrome/chrome-extensions-samples) - Official code examples
- [TypeScript Chrome Extensions Best Practices 2025](https://github.com/dipankar/chrome-extension-best-practices)

**AI & Fact-Checking:**
- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling) - GPT-4o function calling
- [Brave Search API Documentation](https://brave.com/search/api/) - Search API reference
- [Factiverse Technical Stack](https://factiverse.ai/) - AI fact-checking case study
- Research document: `/tmp/compass_artifact_wf-daa2df47-8d7f-4a80-b0f2-9c7663e6c9e9_text_markdown.md`

**DOM Manipulation & Performance:**
- [MutationObserver Performance Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [Shadow DOM v1: Self-Contained Web Components](https://developers.google.com/web/fundamentals/web-components/shadowdom)

**Similar Projects:**
- [NewsGuard](https://www.newsguard.com/) - Human-curated news source ratings
- [Factiverse](https://factiverse.ai/) - AI-powered fact-checking for journalists
- [Factmata](https://factmata.com/) - Lessons from failed automated fact-checking startup

### Related Work

**Industry Research:**
- Duke Reporters' Lab: Real-time fact-checking UX experiments (2016 debates)
- Stanford Internet Observatory: Social media misinformation patterns
- Full Fact: Automated fact-checking methodologies

**Academic Papers:**
- "The Science of Fake News" (Science, 2018) - Misinformation spread patterns
- "Automated Fact-Checking: Task Formulations, Methods, and Future Directions" (ACL, 2021)

---

## Appendix: Cost Calculation Details

### Stage 1: Claim Detection (GPT-4o-mini)

- **Model**: GPT-4o-mini
- **Cost**: $0.15 per 1M input tokens, $0.60 per 1M output tokens
- **Average Input**: 150 tokens (social media post) + 100 tokens (system prompt) = 250 tokens
- **Average Output**: 50 tokens (JSON response)
- **Cost per Check**: (250 × $0.15 + 50 × $0.60) / 1,000,000 = **$0.0000675 per post**

**1,000 posts**: $0.0675

### Stage 2: Verification (GPT-4o + Search)

- **Model**: GPT-4o
- **Cost**: $2.50 per 1M input tokens, $10.00 per 1M output tokens
- **Average Input**: 150 tokens (claim) + 1,500 tokens (search results) + 300 tokens (system prompt) = 1,950 tokens
- **Average Output**: 200 tokens (verdict JSON)
- **Cost per Verification**: (1,950 × $2.50 + 200 × $10.00) / 1,000,000 = **$0.00688 per verification**

**Brave Search**:
- **Cost**: $5 per 1,000 queries (after 2K free monthly)
- **Average Queries per Verification**: 1.5
- **Cost per Verification**: 1.5 × $5 / 1,000 = **$0.0075**

**Total Stage 2 Cost**: $0.00688 + $0.0075 = **$0.01438 per verification**

### Combined Cost for 1,000 Posts

- **Stage 1** (all 1,000 posts): $0.0675
- **Stage 2** (35% of posts = 350 verifications): 350 × $0.01438 = $5.033
- **Total**: $0.0675 + $5.033 = **$5.10 per 1,000 posts**

### Monthly Cost Scenarios

| Usage Level | Posts/Day | Posts/Month | Monthly Cost |
|-------------|-----------|-------------|--------------|
| Very Light | 20 | 600 | **$3.06** |
| Light | 50 | 1,500 | **$7.65** |
| Average | 100 | 3,000 | **$15.30** |
| Heavy | 200 | 6,000 | **$30.60** |

**Note**: First 2,000 Brave searches are free monthly, reducing costs for light users:
- Light user (50 posts/day): ~260 searches/month → **FREE** (within free tier)
- Average user (100 posts/day): ~520 searches/month → **~$1.60** Brave costs (520 - 2000 free = 0, within free tier for first 3.8 days, then paid)

**Revised Average User Monthly Cost**: ~$12-15 (accounting for free tier usage patterns)

---

