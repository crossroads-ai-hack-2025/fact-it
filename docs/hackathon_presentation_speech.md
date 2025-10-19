# Fact-It: Hackathon Presentation Speech

**Duration:** 2-3 minutes  
**Audience:** Hackathon jury (post-demo video)  
**Date:** October 19, 2025

---

## Opening (15 seconds)

"Thank you for watching the demo. As you saw, Fact-It tackles a problem we all face: **information overload without verification**. But what makes this solution truly innovative isn't just what it does—it's **how** it does it."

---

## Innovation & Creativity (45 seconds)

"Fact-It introduces **three key innovations**:

**First**, we use a **two-stage AI architecture**. Stage 1 detects whether a post contains verifiable claims—saving API costs and avoiding false positives. Only when claims are detected does Stage 2 kick in with web-search-powered verification. This is fundamentally different from naive fact-checking that treats every post the same.

**Second**, we built a **multi-provider AI system**. Users can run OpenAI, Anthropic, and Perplexity in **parallel**—not sequentially. This means cross-verification from multiple AI sources in the same time it takes to check with one. When providers disagree, we show that disagreement. We're not hiding uncertainty; we're surfacing it.

**Third**, we made it **zero-friction**. No separate app, no copy-paste. It works **where you read**—Twitter, LinkedIn, Facebook—automatically detecting claims as you scroll. The extension is the interface."

---

## Technical Implementation (60 seconds)

"Let me highlight what's under the hood:

**Architecture**: We built this as a Chrome Manifest V3 extension using TypeScript and Vite. The content scripts observe DOM changes using MutationObserver, the background service worker orchestrates parallel API calls, and everything communicates through Chrome's message passing system.

**AI Integration**: We use the Vercel AI SDK with provider abstraction. Each provider—OpenAI, Anthropic, Perplexity—implements the same interface but leverages its unique strengths. OpenAI has built-in web search, Anthropic uses Brave Search, and Perplexity leads the SimpleQA factuality benchmark with an F-score of 0.858.

**Parallel Execution**: We use `Promise.allSettled()` for fault tolerance. If one provider fails, the others continue. Results are aggregated using weighted confidence scoring and source deduplication.

**Evaluation Framework**: We built a complete evaluation system using real datasets—AVeriTeC with 4,500 claims and FEVER with 185,000. We track accuracy, precision, recall, calibration, latency, and cost. This isn't guesswork; it's **measured performance**.

**Configurability**: Users control everything—which providers to enable, automatic vs. manual checking, confidence thresholds. We store selectors in Chrome storage, making it trivial to add new platforms without code changes."

---

## Impact & Scalability (30 seconds)

"**Impact**: This addresses misinformation at the point of consumption. Not after it spreads, not in a separate fact-checking site—**right where people read**. With 4.9 billion social media users, the potential reach is massive.

**Scalability**: The architecture is serverless—it runs entirely in the user's browser. No backend infrastructure to maintain. Users provide their own API keys, so costs scale with usage, not with our user base. Adding new platforms is just configuration—we've already proven this works on Twitter, LinkedIn, and Facebook.

**Open Architecture**: The provider abstraction means we can add Google Gemini, Cohere, or any future AI provider without touching the core logic. The evaluation framework ensures we can measure improvements objectively."

---

## Closing (15 seconds)

"Fact-It isn't trying to be the arbiter of truth. It's a **tool for critical thinking**. In a world where AI can generate convincing misinformation at scale, we're using AI to help people **verify at scale**.

Thank you. I'm happy to answer any questions."

---

## Delivery Tips

- **Pace**: Speak clearly but with energy. You have limited time.
- **Eye Contact**: Look at the jury, not your notes.
- **Emphasis**: Stress the words in **bold** above—these are your key differentiators.
- **Confidence**: You built something technically sophisticated. Own it.
- **Transition**: After the speech, be ready to dive deeper into any area they ask about.

---

## Key Numbers to Remember

- **2-stage architecture**: Stage 1 (detection) + Stage 2 (verification)
- **3 AI providers**: OpenAI, Anthropic, Perplexity (parallel execution)
- **3 platforms**: Twitter, LinkedIn, Facebook (extensible to more)
- **4,500+ claims**: AVeriTeC dataset for evaluation
- **185,000 claims**: FEVER dataset for benchmarking
- **0.858 F-score**: Perplexity's SimpleQA benchmark performance
- **4.9 billion**: Social media users (potential reach)
- **0 backend servers**: Fully client-side architecture
