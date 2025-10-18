# Fact-It Evaluation Framework (TypeScript)

Automated evaluation system for testing different AI models and prompts for fact-checking, built with TypeScript and Vercel AI SDK.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd eval-ts
npm install
```

### 2. Set API Keys

```bash
export OPENAI_API_KEY="your-openai-key"
export ANTHROPIC_API_KEY="your-anthropic-key"  # Optional
export GOOGLE_API_KEY="your-google-key"        # Optional
```

### 3. Run Example Evaluation

```bash
npm run example
```

This will:
- Create example datasets automatically
- Run Stage 1 evaluation with GPT-4o-mini (~$0.0001 cost)
- Show comprehensive metrics and sample predictions

To also run Stage 2 (costs ~$0.02):
```bash
RUN_STAGE2=true npm run example
```

## 📁 Project Structure

```
eval-ts/
├── src/
│   ├── types/
│   │   └── dataset-schema.ts      # TypeScript types and Zod schemas
│   ├── dataset/
│   │   └── dataset-manager.ts     # Dataset loading and management
│   ├── models/
│   │   └── model-runner.ts        # Model API abstraction (Vercel AI SDK)
│   ├── evaluation/
│   │   └── evaluators.ts          # Metrics calculation
│   ├── prompts/
│   │   └── prompt-registry.ts     # Prompt template management
│   └── examples/
│       └── example-evaluation.ts  # Example usage
├── datasets/                       # Test datasets (auto-created)
├── package.json
├── tsconfig.json
└── README.md
```

## 🎯 Key Features

### Multi-Provider Support (via Vercel AI SDK)
- ✅ **OpenAI**: GPT-4o, GPT-4o-mini, o1-preview, o1-mini
- ✅ **Anthropic**: Claude 3.5 Sonnet, Opus, Haiku
- ✅ **Google**: Gemini 1.5 Flash, Gemini 1.5 Pro
- ✅ Easy to add more providers supported by AI SDK

### Comprehensive Metrics

**Stage 1 (Claim Detection):**
- Precision, Recall, F1 Score (target: >0.87)
- False Positive Rate (target: <0.15)
- Latency percentiles (P90, P95, P99)
- Cost tracking
- Error analysis by platform/topic

**Stage 2 (Verification):**
- Multi-class accuracy (target: >0.80)
- Critical error tracking (TRUE↔FALSE swaps, target: <5%)
- Confidence calibration (ECE, target: <0.10)
- Source quality metrics
- Performance and cost analysis

### Prompt Variants

**Stage 1:** baseline, detailed_v1, conservative_v1  
**Stage 2:** baseline, detailed_v1, conservative_v1

## 💻 Usage Examples

### Basic Evaluation

```typescript
import { DatasetManager } from './dataset/dataset-manager.js';
import { ModelRunner } from './models/model-runner.js';
import { Stage1Evaluator, printEvaluationReport } from './evaluation/evaluators.js';
import { PromptRegistry } from './prompts/prompt-registry.js';

// Setup
const manager = new DatasetManager('./datasets');
const testData = manager.loadStage1('stage1_example.json');

const runner = new ModelRunner();
const registry = new PromptRegistry();
const evaluator = new Stage1Evaluator();

// Get prompt
const prompt = registry.getPrompt('stage1_baseline', 1);

// Run inference
const predictions = await runner.runBatch(
  'gpt-4o-mini',
  prompt!.systemPrompt,
  testData
);

// Evaluate
const metrics = evaluator.evaluate(predictions, testData);
printEvaluationReport(1, metrics, 'GPT-4o-mini');
```

### Compare Multiple Models

```typescript
const models = ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet-20241022'];
const results = new Map();

for (const model of models) {
  const predictions = await runner.runBatch(model, prompt!.systemPrompt, testData);
  const metrics = evaluator.evaluate(predictions, testData);
  results.set(model, metrics);
}

// Print comparison
for (const [model, metrics] of results) {
  console.log(`${model}: F1=${metrics.f1Score.toFixed(3)}, Cost=$${metrics.totalCost.toFixed(4)}`);
}
```

### A/B Test Prompts

```typescript
const promptIds = ['stage1_baseline', 'stage1_detailed_v1', 'stage1_conservative_v1'];
const results = new Map();

for (const promptId of promptIds) {
  const prompt = registry.getPrompt(promptId, 1);
  const predictions = await runner.runBatch('gpt-4o-mini', prompt!.systemPrompt, testData);
  const metrics = evaluator.evaluate(predictions, testData);
  results.set(promptId, metrics);
}

// Compare
for (const [promptId, metrics] of results) {
  console.log(
    `${promptId}: Precision=${metrics.precision.toFixed(3)}, FPR=${metrics.falsePositiveRate.toFixed(3)}`
  );
}
```

### Cost Estimation

```typescript
const runner = new ModelRunner();

// Estimate before running
const estimate = runner.estimateCost('gpt-4o-mini', 500, 300, 100);
console.log(`Estimated cost for 500 samples: $${estimate.totalCost.toFixed(2)}`);
console.log(`Cost per sample: $${estimate.costPerSample.toFixed(6)}`);
```

### Dataset Management

```typescript
const manager = new DatasetManager('./datasets');

// Load datasets
const stage1 = manager.loadStage1('stage1_dataset.json');
const stage2 = manager.loadStage2('stage2_dataset.json');

// Train/val/test split
const splits = manager.trainValTestSplit(1, {
  train: 0.7,
  val: 0.15,
  test: 0.15,
  stratifyBy: 'hasClaim',
  randomSeed: 42,
});

// Filter datasets
const twitterClaims = manager.getSubset(1, {
  platform: 'twitter',
  hasClaim: true,
});

// Get statistics
const stats = manager.getStatistics(1);
console.log(stats);
```

## 🔧 Development

### Build

```bash
npm run build
```

### Run in Development Mode

```bash
npm run dev
```

### Lint and Format

```bash
npm run lint
npm run format
```

## 📊 Supported Models

### OpenAI
- `gpt-4o-mini` - Fast, cost-effective ($0.15/$0.60 per 1M tokens)
- `gpt-4o` - High quality ($2.50/$10.00 per 1M tokens)
- `o1-preview` - Advanced reasoning ($15.00/$60.00 per 1M tokens)
- `o1-mini` - Reasoning, cost-effective ($3.00/$12.00 per 1M tokens)

### Anthropic
- `claude-3-5-sonnet-20241022` - Latest Sonnet ($3.00/$15.00 per 1M tokens)
- `claude-3-opus-20240229` - Highest capability ($15.00/$75.00 per 1M tokens)
- `claude-3-haiku-20240307` - Fast and cheap ($0.25/$1.25 per 1M tokens)

### Google
- `gemini-1.5-flash` - Fast and cheap ($0.075/$0.30 per 1M tokens)
- `gemini-1.5-pro` - High quality ($1.25/$5.00 per 1M tokens)

## 📈 Next Steps

1. **Build Real Dataset** - Annotate 500 Stage 1 + 300 Stage 2 samples
2. **Run Baseline** - Evaluate current production prompts
3. **Compare Models** - Find optimal model for cost/accuracy
4. **Optimize Prompts** - A/B test variants
5. **Deploy** - Update extension with winning configuration

## 🔗 Integration with Extension

This framework uses the same Vercel AI SDK as your Fact-It extension:
- Same API patterns
- Same model providers
- Easy to share prompts between evaluation and production
- Consistent cost tracking

## 💰 Cost Estimates

**Setup:**
- Example evaluation: ~$0.0001 (Stage 1 only)
- Full evaluation run (500 samples): ~$0.50-$2.00 depending on model

**Ongoing:**
- Weekly evaluation: ~$5/run
- Annual monitoring: ~$450/year

## 🐛 Troubleshooting

### "OPENAI_API_KEY not set"
```bash
export OPENAI_API_KEY="sk-..."
```

### "Module not found"
```bash
npm install
```

### "Unknown model provider"
Make sure you're using a supported model name and have the correct API key set.

## 📝 License

MIT

---

For more details, see the [design document](../docs/2025-10-18-evaluation-framework-design.md).
