# Multi-Provider AI Fact-Checking Architecture

**Document Type:** Enhancement (Major Feature)
**Priority:** High
**Status:** Planning
**Created:** 2025-10-18

## Overview

Extend the Fact-It Chrome extension to support multiple AI providers for fact-checking, enabling users to configure and run fact-checks across OpenAI, Anthropic, and Perplexity simultaneously. This enhancement transforms the extension from a single-provider system into a flexible, multi-source verification platform that leverages each provider's unique strengths.

## Problem Statement

The current implementation is tightly coupled to OpenAI's GPT models with built-in web search. This presents several limitations:

1. **Single Point of Failure**: If OpenAI's API is unavailable or slow, fact-checking fails completely
2. **Limited Verification Sources**: Users cannot cross-verify claims across multiple AI providers
3. **No Provider Choice**: Different providers have unique strengths (e.g., Perplexity's citation-backed search, Anthropic's reasoning capabilities)
4. **Cost Optimization**: Users cannot choose cost-effective providers based on their needs
5. **Vendor Lock-in**: Switching providers requires code changes rather than configuration

## Proposed Solution

Implement a **provider-agnostic architecture** that:

1. Supports multiple AI providers through Vercel AI SDK
2. Allows users to enable/configure multiple providers simultaneously
3. Runs fact-checks in parallel across all enabled providers
4. Aggregates results from multiple sources for cross-verification
5. Provides a unified interface for managing provider credentials and settings

### Supported Providers

| Provider | Primary Strength | Integration Method | Cost Model |
|----------|-----------------|-------------------|------------|
| **OpenAI** (existing) | Built-in web search, proven performance | `@ai-sdk/openai` + web_search tool | Token-based |
| **Anthropic** (new) | Advanced reasoning, web search via Brave | `@ai-sdk/anthropic` + web search tool | Token-based + $10/1k searches |
| **Perplexity** (new) | Real-time search, citation-backed, SimpleQA benchmark leader (F-score: 0.858) | `@ai-sdk/perplexity` | Token-based |

## Technical Approach

### Architecture Design

#### Core Abstraction: Provider Interface

```typescript
// src/background/ai/providers/types.ts
export interface AIProvider {
  name: string;
  displayName: string;

  // Test API key validity
  testApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }>;

  // Stage 1: Claim detection
  detectClaims(text: string, apiKey: string): Promise<ClaimDetectionResult>;

  // Stage 2: Claim verification with web search
  verifyClaim(claim: string, apiKey: string): Promise<VerificationVerdictResult>;
}
```

#### Provider Implementations

**1. OpenAI Provider** (`src/background/ai/providers/openai.ts`)
- Refactor existing `AIClient` into `OpenAIProvider`
- Keep existing web_search tool implementation
- Models: `gpt-4o-mini` (Stage 1), `gpt-4o` (Stage 2)

**2. Anthropic Provider** (`src/background/ai/providers/anthropic.ts`)
- Use `@ai-sdk/anthropic` with web search tool
- Leverage Claude's reasoning capabilities
- Models: `claude-3-5-haiku` (Stage 1), `claude-3-5-sonnet` (Stage 2)
- Web search: Built-in Brave Search integration

```typescript
// Anthropic web search example
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const result = await generateText({
  model: anthropic('claude-3-5-sonnet-20241022'),
  prompt: `Verify this claim: "${claim}"`,
  tools: {
    web_search: anthropic.tools.webSearch({
      // Anthropic's built-in Brave Search
    })
  }
});
```

**3. Perplexity Provider** (`src/background/ai/providers/perplexity.ts`)
- Use `@ai-sdk/perplexity` for search-augmented responses
- Leverage Perplexity's citation-backed search
- Models: `sonar` (Stage 1 & 2 combined - Perplexity handles search internally)

```typescript
// Perplexity integration example
import { perplexity } from '@ai-sdk/perplexity';
import { generateObject } from 'ai';

const result = await generateObject({
  model: perplexity('sonar-pro'),
  schema: VerificationVerdictSchema,
  prompt: `Verify this claim and provide sources: "${claim}"`
  // Note: Perplexity has built-in search, no separate tool needed
});
```

#### Provider Registry

```typescript
// src/background/ai/providers/registry.ts
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { PerplexityProvider } from './perplexity';

export const providerRegistry = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  perplexity: new PerplexityProvider(),
} as const;

export type ProviderId = keyof typeof providerRegistry;
```

#### Orchestrator for Parallel Execution

```typescript
// src/background/ai/orchestrator.ts
export class FactCheckOrchestrator {
  async checkClaim(
    text: string,
    platform: Platform,
    enabledProviders: ProviderId[]
  ): Promise<AggregatedResult> {
    // Stage 1: Parallel claim detection
    const detectionResults = await Promise.allSettled(
      enabledProviders.map(async (providerId) => {
        const provider = providerRegistry[providerId];
        const apiKey = await this.getApiKey(providerId);
        return provider.detectClaims(text, apiKey);
      })
    );

    // If no provider found claims, return early
    const hasClaims = detectionResults.some(
      (result) => result.status === 'fulfilled' && result.value.hasClaim
    );

    if (!hasClaims) {
      return { verdict: 'no_claim', providers: [] };
    }

    // Stage 2: Parallel verification across providers that found claims
    const verificationResults = await Promise.allSettled(
      enabledProviders
        .filter((_, index) => {
          const result = detectionResults[index];
          return result.status === 'fulfilled' && result.value.hasClaim;
        })
        .map(async (providerId) => {
          const provider = providerRegistry[providerId];
          const apiKey = await this.getApiKey(providerId);
          const claims = detectionResults[/* corresponding index */].value.claims;
          return provider.verifyClaim(claims[0], apiKey);
        })
    );

    // Aggregate results
    return this.aggregateResults(verificationResults);
  }
}
```

### Implementation Phases

#### Phase 1: Provider Abstraction (Days 1-2)

**Tasks:**
- Create `AIProvider` interface in `src/background/ai/providers/types.ts`
- Refactor existing `AIClient` into `OpenAIProvider` implementing the interface
- Create provider registry in `src/background/ai/providers/registry.ts`
- Update `service-worker.ts` to use new provider architecture
- Ensure existing OpenAI functionality remains unchanged

**Acceptance Criteria:**
- [ ] Existing OpenAI implementation works through new provider interface
- [ ] No breaking changes to current functionality
- [ ] All TypeScript types are properly defined

#### Phase 2: Anthropic Integration (Days 3-4)

**Tasks:**
- Install `@ai-sdk/anthropic` package
- Implement `AnthropicProvider` in `src/background/ai/providers/anthropic.ts`
- Configure Anthropic web search tool integration
- Add Anthropic models to provider registry
- Update settings schema to include Anthropic API key

**Acceptance Criteria:**
- [ ] Anthropic provider successfully detects claims
- [ ] Anthropic provider performs web-search-based verification
- [ ] API key validation works for Anthropic
- [ ] Proper error handling for Anthropic-specific errors

**Code References:**
- Current AI implementation: `src/background/ai/index.ts:1-387`
- Settings types: `src/shared/types.ts:122-126`

#### Phase 3: Perplexity Integration (Days 5-6)

**Tasks:**
- Install `@ai-sdk/perplexity` package
- Implement `PerplexityProvider` in `src/background/ai/providers/perplexity.ts`
- Leverage Perplexity's built-in search (no separate tool needed)
- Add Perplexity models to provider registry
- Update settings schema to include Perplexity API key

**Acceptance Criteria:**
- [ ] Perplexity provider successfully detects and verifies claims in one step
- [ ] Citations are properly extracted from Perplexity responses
- [ ] API key validation works for Perplexity
- [ ] Perplexity-specific features (e.g., date filters) are supported

**Research Notes:**
- Perplexity has built-in search, simpler than OpenAI/Anthropic two-stage approach
- Perplexity leads SimpleQA factuality benchmark (F-score: 0.858)
- Median latency: 358ms (150ms faster than competitors)
- Models: `sonar`, `sonar-pro`, `sonar-reasoning`, `sonar-reasoning-pro`

#### Phase 4: Parallel Execution & Aggregation (Days 7-8)

**Tasks:**
- Create `FactCheckOrchestrator` in `src/background/ai/orchestrator.ts`
- Implement parallel claim detection across enabled providers
- Implement parallel verification across providers
- Design result aggregation strategy (weighted by confidence, provider reputation)
- Update `service-worker.ts` to use orchestrator

**Aggregation Strategy:**
```typescript
interface AggregatedResult {
  verdict: Verdict; // 'true' | 'false' | 'unknown' | 'no_claim'
  confidence: number; // Weighted average
  explanation: string; // Combined from all providers
  sources: Array<{ title: string; url: string; provider: string }>;
  providerResults: Array<{
    provider: ProviderId;
    verdict: Verdict;
    confidence: number;
    explanation: string;
  }>;
}
```

**Acceptance Criteria:**
- [ ] Multiple providers run in parallel without blocking
- [ ] Failed providers don't cause entire fact-check to fail
- [ ] Results are properly aggregated across providers
- [ ] Sources are deduplicated and attributed to providers
- [ ] Execution time scales with slowest provider, not sum of all

#### Phase 5: UI Updates for Multi-Provider Configuration (Days 9-10)

**Tasks:**
- Update `src/popup/popup.html` to support multiple provider configurations
- Add enable/disable toggles for each provider
- Add API key input fields for Anthropic and Perplexity
- Add "Test API Key" buttons for each provider
- Display aggregated results with provider breakdown
- Update storage schema for multi-provider settings

**New Settings Schema:**
```typescript
// src/shared/types.ts
export interface ProviderSettings {
  enabled: boolean;
  apiKey: string | null;
}

export interface ExtensionSettings {
  providers: {
    openai: ProviderSettings;
    anthropic: ProviderSettings;
    perplexity: ProviderSettings;
  };
  autoCheckEnabled: boolean;
  confidenceThreshold: number;
}
```

**UI Mockup:**
```
┌─────────────────────────────────────┐
│ Fact-It Settings                    │
├─────────────────────────────────────┤
│ AI Providers (select multiple)      │
│                                     │
│ [✓] OpenAI                          │
│     API Key: ••••••••••• [Test]     │
│                                     │
│ [✓] Anthropic                       │
│     API Key: ••••••••••• [Test]     │
│                                     │
│ [ ] Perplexity                      │
│     API Key: [empty] [Test]         │
│                                     │
│ Auto-check: [✓] Enabled             │
│ Confidence threshold: [70]%         │
│                                     │
│ [Save Settings]                     │
└─────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Users can enable/disable providers individually
- [ ] API key input fields work for all providers
- [ ] "Test API Key" functionality validates each provider's credentials
- [ ] Settings persist in `chrome.storage.local`
- [ ] UI clearly shows which providers are active

#### Phase 6: Result Display Enhancement (Days 11-12)

**Tasks:**
- Update content script to display multi-provider results
- Show provider-specific verdicts and confidence scores
- Add collapsible sections for detailed provider breakdown
- Implement consensus indicator (e.g., "2/3 providers agree")
- Update visual indicators to reflect aggregated verdict

**Enhanced Result Display:**
```
┌──────────────────────────────────────────┐
│ Fact-Check Result                        │
├──────────────────────────────────────────┤
│ Verdict: ✓ TRUE (85% confidence)         │
│ Consensus: 2/2 providers agree           │
│                                          │
│ [▼] Provider Details                     │
│   • OpenAI (GPT-4o): TRUE (90%)          │
│   • Anthropic (Claude): TRUE (80%)       │
│                                          │
│ [▼] Sources (5 total)                    │
│   • Source 1 (OpenAI, Anthropic)         │
│   • Source 2 (OpenAI)                    │
│   • Source 3 (Anthropic)                 │
└──────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Aggregated verdict is clearly displayed
- [ ] Individual provider results are accessible
- [ ] Sources are deduplicated and show which providers cited them
- [ ] UI gracefully handles partial provider failures
- [ ] Loading states show which providers are still processing

## Alternative Approaches Considered

### 1. Sequential Execution Instead of Parallel
**Rejected because:** Sequential execution would triple fact-checking time (e.g., 3 providers × 2s each = 6s total vs. 2s in parallel). User experience would degrade significantly.

### 2. Custom API Wrappers Instead of Vercel AI SDK
**Rejected because:** Vercel AI SDK provides standardized interfaces, reducing code duplication and maintenance burden. Custom wrappers would require implementing retry logic, streaming, error handling, etc. for each provider.

### 3. Single "Best" Provider Instead of Multi-Provider
**Rejected because:** Different providers excel in different scenarios. Cross-verification increases fact-checking reliability. Users may prefer specific providers for cost or trust reasons.

### 4. Client-Side Provider Execution
**Rejected because:** Chrome extension content scripts have restricted network access and cannot make arbitrary API calls. Background service worker is the only viable execution context.

## Dependencies & Prerequisites

### New Package Dependencies
```json
{
  "@ai-sdk/anthropic": "^2.0.9",
  "@ai-sdk/perplexity": "^latest"
}
```

### API Keys Required
- OpenAI API key (existing)
- Anthropic API key (new, user-provided)
- Perplexity API key (new, user-provided)

### External Services
- OpenAI API: https://api.openai.com/v1
- Anthropic API: https://api.anthropic.com/v1
- Perplexity API: https://api.perplexity.ai/chat/completions

### Browser Compatibility
- Chrome Manifest V3 (existing requirement)
- `chrome.storage.local` for multi-provider settings
- Service worker for API calls (existing architecture)

## Risk Analysis & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Provider API Failures** | High | Medium | Use `Promise.allSettled()` to handle individual failures gracefully. Show partial results if any provider succeeds. |
| **Increased Latency** | Medium | Low | Parallel execution limits latency to slowest provider. Add timeout configurations. |
| **Cost Explosion** | High | Medium | Add cost estimation warnings in UI. Allow users to disable expensive providers. Implement caching (future). |
| **API Key Security** | High | Low | Store keys in `chrome.storage.local` (isolated per user). Never log keys. Add encryption (future enhancement). |
| **Conflicting Verdicts** | Medium | Medium | Clearly display provider disagreements. Use weighted aggregation. Prefer "unknown" over forced consensus. |
| **Vercel AI SDK Breaking Changes** | Medium | Low | Pin package versions. Monitor Vercel AI SDK changelog. Maintain provider abstraction for easier migration. |

## Success Metrics

### Functional Metrics
- [ ] All three providers successfully integrate and return results
- [ ] Parallel execution completes within 1.5× slowest provider time
- [ ] API key validation works for all providers with <2s response time
- [ ] Settings persist correctly across browser sessions

### Performance Metrics
- [ ] **P50 Latency**: <3s for 2-provider fact-check (vs. 2s for single provider)
- [ ] **P95 Latency**: <5s for 3-provider fact-check
- [ ] **Failure Rate**: <5% per provider (network issues excluded)
- [ ] **Aggregation Time**: <100ms overhead for combining results

### User Experience Metrics
- [ ] **Provider Agreement Rate**: Track how often providers agree (target: >70%)
- [ ] **User Preference**: Survey which providers users enable most
- [ ] **Configuration Success**: >90% of users successfully configure at least 2 providers

### Quality Metrics
- [ ] **Fact-Check Accuracy**: Maintain or improve accuracy vs. single-provider baseline
- [ ] **Source Quality**: Average 3+ unique sources per fact-check
- [ ] **Citation Freshness**: Sources dated within 1 month for current events

## Resource Requirements

### Development Time
- **Estimated Effort**: 12 development days (2 weeks)
- **Breakdown**:
  - Phase 1 (Abstraction): 2 days
  - Phase 2 (Anthropic): 2 days
  - Phase 3 (Perplexity): 2 days
  - Phase 4 (Orchestration): 2 days
  - Phase 5 (UI Settings): 2 days
  - Phase 6 (Result Display): 2 days

### Infrastructure
- No additional infrastructure required (serverless Chrome extension)
- API costs passed to end users (they provide their own API keys)

### Testing Resources
- API keys for all three providers (for testing)
- Test corpus of verifiable claims (reuse existing test cases)
- Chrome extension test environment (existing)

## Future Considerations

### Extensibility
1. **Additional Providers**: Architecture supports adding more providers (e.g., Google Gemini, Cohere)
2. **Custom Provider Weights**: Allow users to prioritize certain providers in aggregation
3. **Provider-Specific Features**: Expose unique features (e.g., Perplexity's date filters, Anthropic's thinking tokens)

### Performance Optimizations
1. **Smart Provider Selection**: Use cheaper providers (OpenAI mini, Anthropic Haiku) for Stage 1, reserve expensive models for Stage 2
2. **Caching Layer**: Cache provider responses to avoid redundant API calls
3. **Progressive Results**: Stream results as providers complete (don't wait for all)

### Advanced Features
1. **Consensus Visualization**: Show provider agreement/disagreement graphically
2. **Source Cross-Validation**: Highlight when multiple providers cite the same source
3. **Provider Benchmarking**: Track and display each provider's accuracy over time
4. **Cost Tracking**: Show estimated API costs per fact-check

## Documentation Plan

### Code Documentation
- [ ] Add JSDoc comments to all provider interfaces
- [ ] Document aggregation algorithm in `orchestrator.ts`
- [ ] Update `CLAUDE.md` with multi-provider architecture

### User Documentation
- [ ] Update README with multi-provider setup instructions
- [ ] Add API key acquisition guides for Anthropic and Perplexity
- [ ] Create troubleshooting guide for provider-specific errors

### Developer Documentation
- [ ] Write provider implementation guide for future providers
- [ ] Document Vercel AI SDK version compatibility
- [ ] Add architecture diagrams to `docs/` folder

## References & Research

### Internal References
- Current AI implementation: `src/background/ai/index.ts:74-387`
- Settings storage: `src/shared/types.ts:122-133`
- Message passing: `src/shared/types.ts:6-119`
- Service worker: `src/background/service-worker.ts`

### External Documentation
- **Vercel AI SDK**: https://ai-sdk.dev/docs/introduction
- **Anthropic Provider**: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- **Perplexity Provider**: https://ai-sdk.dev/providers/ai-sdk-providers/perplexity
- **OpenAI Provider**: https://ai-sdk.dev/providers/ai-sdk-providers/openai
- **Perplexity API Docs**: https://docs.perplexity.ai/
- **Anthropic API Docs**: https://docs.anthropic.com/

### Research Findings
1. **Perplexity Strength**: Leads SimpleQA factuality benchmark with F-score of 0.858, median latency 358ms
2. **Anthropic Web Search**: Uses Brave Search, costs $10 per 1,000 searches + token costs
3. **OpenAI Built-in Search**: Integrated web search tool in GPT-4o, no separate API costs
4. **Vercel AI SDK Support**: All three providers have official SDK support with active maintenance

### Related Implementation Patterns
- Vercel AI SDK Provider Registry: https://ai-sdk.dev/docs/ai-sdk-core/provider-management
- Multi-Provider Example: https://ai-sdk.dev/docs/guides/multi-modal-chatbot
- Tool Calling with Web Search: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
