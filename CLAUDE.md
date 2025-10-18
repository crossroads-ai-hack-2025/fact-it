# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fact-It is a Chrome extension (Manifest V3) that provides real-time fact-checking for social media posts. It uses a **multi-provider AI architecture** supporting OpenAI, Anthropic, and Perplexity for parallel fact-checking and cross-verification.

**Multi-Provider System:**
- **OpenAI**: GPT-4o with built-in web search
- **Anthropic**: Claude 3.5 Sonnet/Haiku with Brave Search integration
- **Perplexity**: Sonar Pro with real-time citation-backed search (SimpleQA F-score: 0.858)

Each provider runs a two-stage pipeline: Stage 1 (claim detection) and Stage 2 (claim verification with web search). Results from all enabled providers are aggregated to show consensus and individual provider verdicts.

## Development Commands

```bash
# Primary development workflow
npm run build        # Build extension to dist/ folder

# Build and quality
npm run type-check   # Run TypeScript compiler checks
npm run lint         # Check code quality with ESLint
npm run lint:fix     # Auto-fix ESLint issues
npm run format       # Format code with Prettier
```

## Chrome Extension Development Workflow

**Current workflow: Static build + manual reload (no HMR)**

1. Run `npm run build` to build to `dist/` folder
2. Load `dist/` folder in Chrome via `chrome://extensions` (Developer mode → Load unpacked)
3. Make code changes → Run `npm run build` → **Manually reload extension** in Chrome
4. **Reload requirements after build:**
   - `manifest.json` changes → Click reload button in `chrome://extensions`
   - Content script changes → Click reload button + refresh target page (LinkedIn/Twitter)
   - Background worker changes → Click reload button in `chrome://extensions`
   - Popup changes → Click reload button + reopen popup

**Note**: The `npm run dev` HMR workflow is available but not currently in use. Manual reload provides more predictable behavior during development.

## Architecture: Message Passing System

The extension uses Chrome's message passing to communicate between isolated contexts:

**Content Scripts → Background Worker:**
```typescript
import { MessageType, CheckClaimMessage } from '@/shared/types';

const message: CheckClaimMessage = {
  type: MessageType.CHECK_CLAIM,
  payload: { text, elementId, platform: 'twitter' }
};

chrome.runtime.sendMessage(message, (response) => {
  // Handle response
  // ALWAYS check chrome.runtime.lastError
});
```

**Background Worker receives:**
```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle message by type (MessageType enum)
  // Return true to keep channel open for async responses
  return true;
});
```

**Key types in `src/shared/types.ts`:**
- `MessageType` enum - All message types (CHECK_CLAIM, CLAIM_RESULT, etc.)
- `Message` union type - All possible message interfaces
- `Verdict` type - Result categories ('true' | 'false' | 'unknown' | 'no_claim')
- `Platform` type - Supported platforms ('twitter' | 'linkedin' | 'facebook' | 'article')

## Architecture: Three Execution Contexts

**1. Content Scripts** (`src/content/`) - Run on web pages
- Isolated from page JavaScript (separate execution context)
- Use MutationObserver to detect DOM changes
- Extract text from platform-specific selectors (in `src/shared/constants.ts`)
- Send messages to background worker for processing
- Add visual indicators to page via Shadow DOM

**2. Background Service Worker** (`src/background/service-worker.ts`) - Persistent background
- Event-driven (Chrome may terminate when idle)
- Orchestrates parallel fact-checking across multiple AI providers
- Handles all API calls (OpenAI, Anthropic, Perplexity) - content scripts have restricted network access
- Manages chrome.storage.local (API keys for all providers, cache, settings)
- Message passing hub between content scripts and popup
- **Critical:** Service workers can terminate - always use async/await properly and handle restarts

**3. Popup** (`src/popup/`) - Extension settings UI
- Opened by clicking extension icon
- Manages API key configuration
- Communicates with background worker for settings storage

## TypeScript Path Aliases

Import paths use `@/` alias for `src/`:
```typescript
import { MessageType } from '@/shared/types';
import { SELECTORS } from '@/shared/constants';
```

Configured in:
- `tsconfig.json` → `"paths": { "@/*": ["src/*"] }`
- `vite.config.ts` → `resolve: { alias: { '@': '/src' } }`

## Architecture: Multi-Provider AI System

The extension uses a provider-agnostic architecture that supports multiple AI services running in parallel.

**Provider Interface** (`src/background/ai/providers/types.ts`):
```typescript
interface AIProvider {
  id: string;
  displayName: string;
  testApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }>;
  detectClaims(text: string, apiKey: string): Promise<ClaimDetectionResult>;
  verifyClaim(claim: string, apiKey: string): Promise<VerificationVerdictResult>;
}
```

**Supported Providers:**
1. **OpenAI** (`src/background/ai/providers/openai.ts`)
   - Models: `gpt-4o-mini` (Stage 1), `gpt-4o` (Stage 2)
   - Web search: Built-in OpenAI web_search tool
   - Cost: Token-based only

2. **Anthropic** (`src/background/ai/providers/anthropic.ts`)
   - Models: `claude-3-5-haiku` (Stage 1), `claude-3-5-sonnet` (Stage 2)
   - Web search: Built-in Brave Search (`webSearch_20250305` tool)
   - Cost: Token-based + $10 per 1,000 searches

3. **Perplexity** (`src/background/ai/providers/perplexity.ts`)
   - Models: `sonar` (Stage 1), `sonar-pro` (Stage 2)
   - Web search: Built-in real-time search (no separate tool needed)
   - Cost: Token-based only
   - Note: Leads SimpleQA factuality benchmark (F-score: 0.858)

**Provider Registry** (`src/background/ai/providers/registry.ts`):
```typescript
export const providerRegistry = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  perplexity: new PerplexityProvider(),
} as const;
```

**Orchestrator** (`src/background/ai/orchestrator.ts`):
- Manages parallel execution across enabled providers
- Uses `Promise.allSettled()` for fault tolerance
- Aggregates results: weighted average confidence, source deduplication
- Calculates consensus: how many providers agree on verdict
- Returns `AggregatedResult` with provider-specific details

**Parallel Execution Flow:**
1. User enables multiple providers in popup settings
2. Content script sends `CHECK_CLAIM` message to service worker
3. Orchestrator runs **Stage 1** (claim detection) in parallel across all enabled providers
4. If no providers find claims, return `no_claim` verdict early
5. Orchestrator runs **Stage 2** (verification) in parallel for providers that found claims
6. Results aggregated: majority vote determines verdict, confidence is weighted average
7. Aggregated result sent back to content script with consensus details

**Settings Structure** (`src/shared/types.ts`):
```typescript
interface ExtensionSettings {
  providers: {
    openai: ProviderSettings;
    anthropic: ProviderSettings;
    perplexity: ProviderSettings;
  };
  autoCheckEnabled: boolean;
  confidenceThreshold: number;
}

interface ProviderSettings {
  enabled: boolean;
  apiKey: string | null;
}
```

**Adding New Providers:**
1. Create provider class implementing `AIProvider` interface
2. Add to `providerRegistry` in `registry.ts`
3. Update `ExtensionSettings` type to include new provider
4. Add UI controls in `popup.html` and `popup.ts`
5. Provider automatically participates in parallel execution

## Platform-Specific Selectors

When adding new platform support:

1. Add selectors to `src/shared/constants.ts` in `SELECTORS` object
2. Create content script in `src/content/{platform}-content.ts`
3. Add to `manifest.json`:
```json
{
  "content_scripts": [{
    "matches": ["*://platform.com/*"],
    "js": ["content/platform-content.ts"],
    "run_at": "document_idle"
  }],
  "host_permissions": ["*://platform.com/*"]
}
```

**Selector strategy:** Primary selector → Semantic fallback → Heuristic fallback
(Social media platforms frequently change class names; use `data-testid` attributes when available)

## Debugging Chrome Extensions

**Content Script (on target page):**
- Open DevTools on Twitter/X → Console tab shows content script logs
- Sources tab → Original TypeScript files (source maps enabled)

**Background Worker:**
- Navigate to `chrome://extensions`
- Click "service worker" link under Fact-It
- DevTools opens with console and sources

**Popup:**
- Right-click extension icon → "Inspect popup"
- DevTools opens for popup context

**Test extension connectivity:**
```javascript
// Run in page console
chrome.runtime.sendMessage({ type: 'PING' }, console.log);
// Should return: { status: 'ok', timestamp: ... }
```

## Two-Stage Fact-Checking Architecture

**Current status:** Fully implemented with multi-provider support (v0.2.0)

**How it works:**

1. Content script extracts text from social media post
2. Background orchestrator runs **Stage 1** (claim detection) in **parallel** across all enabled providers
   - Each provider classifies if text contains checkable factual claims
   - If NO providers find claims → Return `no_claim` verdict (saves API costs)
   - If ANY providers find claims → Proceed to Stage 2
3. Background orchestrator runs **Stage 2** (verification) in **parallel** for providers that found claims
   - Each provider uses its own web search capabilities:
     - **OpenAI**: GPT-4o with built-in web_search tool
     - **Anthropic**: Claude 3.5 Sonnet with Brave Search
     - **Perplexity**: Sonar Pro with real-time citation-backed search
   - Each provider returns verdict: 'true' | 'false' | 'unknown' with confidence (0-100)
4. Orchestrator aggregates results:
   - **Verdict**: Majority vote weighted by confidence
   - **Confidence**: Weighted average of agreeing providers
   - **Sources**: Deduplicated across all providers with attribution
   - **Consensus**: How many providers agree (e.g., "2/3 providers agree")
5. Content script displays aggregated result with provider-specific details

**Ethical Design Decisions:**
- Prefer 'unknown' verdict over forced classification when evidence is insufficient
- Show consensus to indicate provider agreement/disagreement
- Display individual provider results for transparency
- Aggregate sources from multiple providers for comprehensive verification

## Code Style Enforcement

- **TypeScript strict mode** - No `any` types allowed
- **ESLint + Prettier** - Auto-formatting on save in VS Code
- **No `console.log` in production** - Use `console.info` for intentional logs, `console.error` for errors
- When making TypeScript changes, always run `npm run type-check` before committing

## Development Phase Status

**Current Phase:** Phase 2 - Multi-Provider AI Integration (COMPLETE)
- ✅ Vite build system with HMR
- ✅ Twitter/X content script with MutationObserver
- ✅ Background service worker with message passing
- ✅ Popup UI for multi-provider settings
- ✅ Provider abstraction layer (AIProvider interface)
- ✅ OpenAI provider (GPT-4o-mini + GPT-4o with web search)
- ✅ Anthropic provider (Claude 3.5 Haiku + Sonnet with Brave Search)
- ✅ Perplexity provider (Sonar + Sonar Pro with real-time search)
- ✅ Parallel execution orchestrator with result aggregation
- ✅ Settings UI with API key testing for all providers

**Next Phases:**
- Phase 3: Enhanced content script result display (show provider breakdown)
- Phase 4: Multi-platform support (LinkedIn, Facebook, articles)
- Phase 5: Caching & performance optimization
- Phase 6: UI polish & accessibility
- Phase 7: Testing & Chrome Web Store release

## Important Constraints

- **Do not over-engineer** - Implement minimal required functionality per plan
- **Never commit API keys** - Keys stored in chrome.storage.local only, user-provided
- **Test after TypeScript changes** - Always run `npm run type-check` and `npm run dev`
- **Manifest V3 restrictions:**
  - No persistent background pages (use event-driven service workers)
  - Content Security Policy forbids inline scripts
  - Service workers cannot use DOM APIs
  - All network requests must go through background worker

## Common Pitfalls

1. **Service worker termination** - Chrome terminates inactive service workers; design for restarts
2. **Message passing async** - Always return `true` in `onMessage.addListener` for async responses
3. **Content script isolation** - Cannot access page JavaScript variables; use message passing
4. **Selector brittleness** - Social media platforms change frequently; implement fallback selectors
5. **HMR limitations** - Manifest changes require manual reload; content scripts need page refresh

## File Naming Convention

- Service worker: `service-worker.ts` (Chrome convention)
- Content scripts: `{platform}-content.ts` (e.g., `twitter-content.ts`)
- Shared utilities: `src/shared/{purpose}.ts`
- No test files yet (Phase 6)
