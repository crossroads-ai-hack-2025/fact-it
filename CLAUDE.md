# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fact-It is a Chrome extension (Manifest V3) that provides real-time fact-checking for social media posts. It uses a two-stage AI verification system: GPT-4o-mini for claim detection (Stage 1) and GPT-4o + Brave Search for verification (Stage 2). The extension is currently in Phase 1 (skeleton implementation).

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
- Handles all API calls (OpenAI, Brave Search) - content scripts have restricted network access
- Manages chrome.storage.local (API keys, cache, settings)
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

## Two-Stage Fact-Checking Architecture (Future Implementation)

**Current status:** Phase 1 skeleton - returns mock responses

**Planned architecture:**

1. Content script extracts text from post
2. Background worker: **Stage 1** - GPT-4o-mini classifies if text contains checkable factual claims
   - If no claims → Stop (saves API costs)
   - If has claims → Proceed to Stage 2
3. Background worker: **Stage 2** - GPT-4o with function calling:
   - Calls Brave Search API (1-3 queries)
   - Synthesizes search results
   - Returns verdict: 'true' | 'false' | 'unknown' with confidence score (0-100)
4. Content script displays visual indicator with verdict

**Important:** Prefer 'unknown' verdict over forced classification when evidence is insufficient. This is an ethical design decision.

## Code Style Enforcement

- **TypeScript strict mode** - No `any` types allowed
- **ESLint + Prettier** - Auto-formatting on save in VS Code
- **No `console.log` in production** - Use `console.info` for intentional logs, `console.error` for errors
- When making TypeScript changes, always run `npm run type-check` before committing

## Development Phase Status

**Current Phase:** Phase 1 - Skeleton (COMPLETE)
- ✅ Vite build system with HMR
- ✅ Twitter/X content script with MutationObserver
- ✅ Background service worker with message passing
- ✅ Popup UI for settings
- ✅ Mock fact-checking responses

**Next Phases** (see `tmp/2025-10-18-fact-checking-extension-implementation-plan.md`):
- Phase 2: OpenAI API integration (Stage 1 + Stage 2)
- Phase 3: Multi-platform support (LinkedIn, Facebook, articles)
- Phase 4: Caching & performance optimization
- Phase 5: UI polish & accessibility
- Phase 6: Testing & Chrome Web Store release

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
