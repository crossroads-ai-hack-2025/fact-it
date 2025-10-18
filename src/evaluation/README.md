# Evaluation Framework

Automated evaluation system for testing AI models and prompts for fact-checking.

## Quick Start

```bash
# Install dependencies (from project root)
npm install

# Set API key
export OPENAI_API_KEY="your-key"

# Run example evaluation
npm run eval:example
```

## Structure

```
src/evaluation/
├── types/
│   └── dataset-schema.ts      # TypeScript types and Zod schemas
├── dataset/
│   └── dataset-manager.ts     # Dataset loading and management
├── models/
│   └── model-runner.ts        # Model API abstraction (Vercel AI SDK)
├── evaluation/
│   └── evaluators.ts          # Metrics calculation
├── prompts/
│   └── prompt-registry.ts     # Prompt template management
└── examples/
    └── example-evaluation.ts  # Example usage
```

## Usage

### Run Example Evaluation

```bash
npm run eval:example
```

This will:
- Create example datasets automatically (in `datasets/` folder)
- Run Stage 1 evaluation with GPT-4o-mini (~$0.0001 cost)
- Show comprehensive metrics and sample predictions

To also run Stage 2 (costs ~$0.02):
```bash
RUN_STAGE2=true npm run eval:example
```

### Compare Models

```typescript
import { DatasetManager, ModelRunner, Stage1Evaluator, PromptRegistry } from '@/evaluation';

const manager = new DatasetManager('./datasets');
const testData = manager.loadStage1('stage1_example.json');

const runner = new ModelRunner();
const registry = new PromptRegistry();
const evaluator = new Stage1Evaluator();

const prompt = registry.getPrompt('stage1_baseline', 1);

// Test multiple models
const models = ['gpt-4o-mini', 'gpt-4o'];
for (const model of models) {
  const predictions = await runner.runBatch(model, prompt!.systemPrompt, testData);
  const metrics = evaluator.evaluate(predictions, testData);
  console.log(`${model}: F1=${metrics.f1Score.toFixed(3)}`);
}
```

## Supported Models

### OpenAI
- `gpt-4o-mini` - Fast, cost-effective
- `gpt-4o` - High quality
- `o1-preview` - Advanced reasoning
- `o1-mini` - Reasoning, cost-effective

### Anthropic (requires `ANTHROPIC_API_KEY`)
- `claude-3-5-sonnet-20241022` - Latest Sonnet
- `claude-3-opus-20240229` - Highest capability
- `claude-3-haiku-20240307` - Fast and cheap

### Google (requires `GOOGLE_API_KEY`)
- `gemini-1.5-flash` - Fast and cheap
- `gemini-1.5-pro` - High quality

## Metrics

### Stage 1 (Claim Detection)
- Precision, Recall, F1 Score
- False Positive Rate
- Latency percentiles (P90, P95, P99)
- Cost tracking
- Error analysis by platform/topic

### Stage 2 (Verification)
- Multi-class accuracy
- Critical error tracking (TRUE↔FALSE swaps)
- Confidence calibration (ECE)
- Source quality metrics
- Performance and cost analysis

## Prompt Variants

**Stage 1:** `stage1_baseline`, `stage1_detailed_v1`, `stage1_conservative_v1`  
**Stage 2:** `stage2_baseline`, `stage2_detailed_v1`, `stage2_conservative_v1`

## Documentation

- **Design Document**: `docs/2025-10-18-evaluation-framework-design.md`
- **Migration Guide**: `docs/EVALUATION_FRAMEWORK_TYPESCRIPT.md`
