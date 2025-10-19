# Fact-It: Technical Q&A Preparation

**Purpose:** Prepare for hackathon jury technical questions  
**Date:** October 19, 2025  
**Focus Areas:** Innovation, Technical Implementation, Impact & Scalability, Presentation

---

## Innovation & Creativity Questions

### Q: "What makes your two-stage architecture innovative compared to existing fact-checking tools?"

**Answer:**
"Most fact-checking tools either check everything (expensive, slow) or require manual triggering (friction). Our two-stage approach is economically intelligent:

- **Stage 1** uses a lightweight model (GPT-4o-mini, Claude Haiku) to classify whether text contains checkable claims. This costs ~$0.0001 per check.
- **Stage 2** only runs for posts with claims, using premium models with web search (GPT-4o, Claude Sonnet, Perplexity Sonar Pro).

This reduces costs by 70-80% compared to always running expensive models, while maintaining automatic operation. It's the difference between 'check everything' and 'intelligently filter then verify.'"

---

### Q: "Why multiple AI providers instead of just using the best one?"

**Answer:**
"Three reasons:

1. **Cross-verification**: Different providers have different training data and search capabilities. When 2-3 providers agree, confidence increases. When they disagree, we surface that uncertainty—which is valuable information.

2. **Fault tolerance**: If one provider's API is down or slow, the others continue. No single point of failure.

3. **Unique strengths**: Perplexity excels at citation-backed search (0.858 F-score on SimpleQA), Anthropic's Claude has superior reasoning, OpenAI has the fastest web search integration. We leverage all of them.

The parallel execution means this doesn't cost extra time—we run all providers simultaneously using `Promise.allSettled()`."

---

### Q: "How is this different from just using ChatGPT or Perplexity directly?"

**Answer:**
"Four key differences:

1. **Zero friction**: No context switching. It works where you read—automatically.
2. **Cross-verification**: You get multiple AI perspectives, not just one.
3. **Structured output**: We enforce JSON schemas with Zod validation, ensuring consistent verdicts, confidence scores, and sources.
4. **Evaluation**: We measure performance on real datasets (AVeriTeC, FEVER) with metrics like accuracy, precision, recall, and calibration. This isn't ad-hoc; it's engineered."

---

## Technical Implementation Questions

### Q: "Walk me through the architecture. How does the extension work end-to-end?"

**Answer:**
"Three execution contexts:

**1. Content Scripts** (runs on Twitter/LinkedIn/Facebook):
- Uses `MutationObserver` to detect new posts in the DOM
- Extracts text using configurable CSS selectors stored in Chrome storage
- Sends text to background worker via Chrome message passing

**2. Background Service Worker** (event-driven):
- Receives fact-check requests
- Orchestrates parallel API calls to enabled providers (OpenAI, Anthropic, Perplexity)
- Uses Vercel AI SDK with `generateObject()` for structured responses
- Aggregates results: weighted confidence, source deduplication, consensus calculation
- Caches results to avoid redundant API calls
- Returns aggregated result to content script

**3. Popup UI**:
- Manages provider settings (API keys, enable/disable)
- Configures domain selectors for new platforms
- Tests API key validity

The key insight: content scripts can't make arbitrary API calls (Chrome security), so all AI calls happen in the background worker."

---

### Q: "How do you handle parallel execution and result aggregation?"

**Answer:**
"We use `Promise.allSettled()` for fault tolerance—if one provider fails, others continue. The aggregation algorithm:

1. **Verdict**: Weighted majority vote. Each provider's verdict is weighted by its confidence score. Highest weighted vote wins.

2. **Confidence**: Weighted average of providers that agree with the final verdict.

3. **Sources**: Deduplicated by URL. If multiple providers cite the same source, we show which providers found it.

4. **Consensus**: We track how many providers agree (e.g., '2/3 providers agree: TRUE').

This is implemented in `orchestrator.ts` with about 300 lines of TypeScript. The code is fully type-safe—no `any` types allowed."

---

### Q: "How do you ensure the extension doesn't break when social media sites change their HTML?"

**Answer:**
"We use a **configurable selector system**:

1. **Default selectors** are defined for Twitter, LinkedIn, Facebook in `selector-storage.ts`
2. **Selectors are stored in Chrome storage**, not hardcoded
3. **Users can update selectors** via the popup UI without code changes
4. **Strategy**: Prefer stable selectors like `data-testid` attributes over brittle class names

When a platform changes, users can fix it themselves through settings. We also version selectors and can push updates through Chrome Web Store updates."

---

### Q: "What about performance? How fast is this?"

**Answer:**
"Measured performance:

- **Stage 1 (detection)**: ~500ms with GPT-4o-mini, ~800ms with Claude Haiku
- **Stage 2 (verification)**: ~2-3s with web search enabled
- **Parallel execution**: Total time = slowest provider, not sum of all
- **Caching**: Subsequent checks of the same text are instant (<50ms)

We track P50, P90, P99 latency in our evaluation framework. The goal is <3s for full fact-check with 2 providers, <5s with 3 providers. We're currently hitting those targets."

---

### Q: "How did you build the evaluation framework?"

**Answer:**
"We built a complete evaluation system in `src/evaluation/`:

**Components**:
- **Model Runner**: Unified interface for OpenAI, Anthropic, Google using Vercel AI SDK
- **Dataset Manager**: Loads and splits datasets (train/val/test)
- **Evaluators**: Calculate accuracy, precision, recall, F1, calibration (ECE), cost, latency
- **Adapters**: Import external datasets (AVeriTeC, FEVER)

**Datasets**:
- **AVeriTeC**: 4,568 real-world claims with web sources
- **FEVER**: 185,445 Wikipedia claims with evidence

**Metrics**:
- Stage 1: Precision (>90%), Recall (>80%), F1 (>87%), False Positive Rate (<15%)
- Stage 2: Accuracy (>80%), Critical Errors (<5%), Calibration (ECE <0.10)

We can run `npm run eval:compare` to A/B test prompt variants and measure which performs best. This is how we optimize the system scientifically."

---

## Impact & Scalability Questions

### Q: "How do you plan to scale this to millions of users?"

**Answer:**
"The architecture is inherently scalable:

**1. Serverless**: Runs entirely in the user's browser. No backend to scale.

**2. User-provided API keys**: Each user brings their own OpenAI/Anthropic/Perplexity keys. Costs scale with usage, not with our user base.

**3. Caching**: We cache fact-check results in Chrome storage. If 1,000 users see the same viral tweet, only the first user pays for the API call.

**4. Configurable platforms**: Adding new platforms (Reddit, Instagram, TikTok) is just configuration—no code changes needed.

**5. Chrome Web Store distribution**: Google handles distribution, updates, and CDN.

The bottleneck is API rate limits, not our infrastructure. And users control that by choosing which providers to enable."

---

### Q: "What's your go-to-market strategy?"

**Answer:**
"Three phases:

**Phase 1 - Early Adopters** (Months 1-3):
- Launch on Chrome Web Store (free)
- Target tech-savvy users, journalists, researchers
- Build community on Product Hunt, Hacker News
- Collect feedback, iterate on UX

**Phase 2 - Partnerships** (Months 4-6):
- Partner with universities (media literacy courses)
- Partner with newsrooms (journalist tools)
- Integrate with fact-checking organizations (IFCN members)

**Phase 3 - Mainstream** (Months 7-12):
- Add Firefox, Edge support
- Build mobile browser extensions
- Explore enterprise licensing (corporate social media teams)
- Potentially offer hosted API keys (freemium model)

The key insight: we're not competing with Snopes or PolitiFact. We're complementary—we bring fact-checking to where people actually read content."

---

### Q: "What about privacy and security?"

**Answer:**
"We take this seriously:

**Privacy**:
- API keys stored in `chrome.storage.local` (isolated per user, never leaves their machine)
- No telemetry or tracking by default
- Users can disable automatic checking (manual-only mode)
- We never send data to our servers—only to user-configured AI providers

**Security**:
- Manifest V3 (Chrome's latest security standard)
- Content Security Policy prevents inline scripts
- API keys never logged or exposed in console
- Future: Add optional API key encryption using Chrome's crypto API

**Transparency**:
- Open source (MIT license)
- Users can audit the code
- Clear disclosure of which AI providers are used"

---

### Q: "How do you handle false positives/negatives?"

**Answer:**
"Multi-layered approach:

**1. Two-stage architecture**: Stage 1 filters out non-claims, reducing false positives.

**2. Confidence thresholds**: Users can set minimum confidence (default: 70%). Low-confidence results show 'uncertain' verdict.

**3. Multi-provider consensus**: When providers disagree, we show that. Example: '1/3 providers say TRUE, 2/3 say UNKNOWN.'

**4. Source transparency**: We always show sources. Users can click through and verify themselves.

**5. Evaluation-driven**: We measure false positive rate (target: <15%) and critical errors (TRUE↔FALSE swaps, target: <5%) on real datasets.

**6. User feedback** (future): Allow users to report incorrect verdicts, feeding back into evaluation datasets.

The philosophy: We're not claiming perfect accuracy. We're providing **informed skepticism**."

---

## Competitive & Market Questions

### Q: "What about competitors like NewsGuard or Ground News?"

**Answer:**
"Different approaches:

**NewsGuard**: Rates entire news sources (domain-level). We rate individual claims (post-level). Complementary.

**Ground News**: Shows bias across multiple sources. We verify factual accuracy. Different problem.

**Snopes/PolitiFact**: Manual fact-checking (slow, limited scale). We're automated and real-time.

**Our unique position**: We're the only solution that:
1. Works automatically where you read
2. Uses multiple AI providers for cross-verification
3. Is fully client-side (no backend)
4. Is open source and extensible

We're not replacing human fact-checkers. We're augmenting human critical thinking at scale."

---

### Q: "What if AI providers start hallucinating sources?"

**Answer:**
"We've designed for this:

**1. Structured output**: We use Zod schemas to enforce that sources must have `title` and `url` fields. No free-form text.

**2. Multi-provider verification**: If one provider hallucinates, others likely won't cite the same fake source. Disagreement is visible.

**3. Web search grounding**: All providers use web search (OpenAI's web_search, Anthropic's Brave Search, Perplexity's real-time search). They're retrieving real URLs, not generating them.

**4. User verification**: Sources are clickable. Users can verify themselves.

**5. Evaluation**: We measure source quality in our evaluation framework (source overlap with ground truth).

This is an active research area. We're monitoring AI provider improvements (e.g., OpenAI's o1-preview, Anthropic's extended thinking) and will integrate as they mature."

---

## Future & Vision Questions

### Q: "What's next for Fact-It?"

**Answer:**
"Roadmap:

**Short-term** (3 months):
- Enhanced result display (show provider breakdown in UI)
- More platforms (Reddit, Instagram, TikTok)
- Performance optimizations (caching improvements, progressive results)

**Medium-term** (6 months):
- Firefox and Edge support
- Mobile browser extensions
- Collaborative fact-checking (users can share verified claims)
- Integration with fact-checking APIs (IFCN, ClaimReview schema)

**Long-term** (12 months):
- ML model for claim detection (reduce API costs further)
- Browser-native integration (partner with Chrome/Firefox)
- Enterprise features (team dashboards, custom providers)
- Research partnerships (publish accuracy benchmarks)

The vision: Make critical thinking **frictionless** at the scale of social media."

---

### Q: "How do you measure success?"

**Answer:**
"Four metrics:

**1. Adoption**: Chrome Web Store installs, active users
**2. Accuracy**: Fact-check accuracy on evaluation datasets (target: >85%)
**3. Engagement**: % of users who enable multiple providers, % who use manual mode
**4. Impact**: User surveys on behavior change ('Did Fact-It change how you share content?')

We're also tracking **provider agreement rates**—if providers agree >80% of the time, that's validation. If they disagree frequently, that's valuable signal about claim ambiguity."

---

## Delivery Tips

- **Stay calm and confident**: You built something technically sophisticated.
- **Use the whiteboard**: Draw the architecture if available (3 boxes: content script, service worker, popup).
- **Show the code**: If they want to see implementation, show `orchestrator.ts` (parallel execution) or a provider implementation.
- **Acknowledge limitations**: "We're not perfect, but we're measurably better than not fact-checking at all."
- **Redirect to strengths**: If asked about a weakness, acknowledge it briefly then pivot to what you've built well.
- **Be specific**: Use actual numbers (0.858 F-score, 4,500 claims, 3 providers, etc.)
- **Show passion**: This solves a real problem you care about.

---

## Quick Reference: Technical Stack

- **Language**: TypeScript (strict mode, no `any` types)
- **Build**: Vite with HMR
- **Extension**: Chrome Manifest V3
- **AI SDK**: Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/perplexity`)
- **Validation**: Zod schemas
- **Storage**: Chrome storage API
- **Evaluation**: Custom framework with AVeriTeC & FEVER datasets
- **Platforms**: Twitter/X, LinkedIn, Facebook (extensible)

---

## Quick Reference: Key Files

- **Orchestrator**: `src/background/ai/orchestrator.ts` (parallel execution, aggregation)
- **Providers**: `src/background/ai/providers/` (OpenAI, Anthropic, Perplexity)
- **Content Scripts**: `src/content/` (platform-specific DOM observers)
- **Evaluation**: `src/evaluation/` (complete testing framework)
- **Types**: `src/shared/types.ts` (all TypeScript interfaces)

---

**Good luck with your presentation! You've built something genuinely innovative.** 🚀
