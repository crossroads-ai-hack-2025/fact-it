# Evaluation Framework - Quick Start Guide

## 🎯 Goal

Evaluate and improve the prompts used in your fact-checking extension.

## 📋 Prerequisites

```bash
# Set your OpenAI API key
export OPENAI_API_KEY="your-key-here"
```

## 🚀 Workflow

### Step 1: Run Example (First Time)

This creates example datasets and shows you how the framework works:

```bash
npm run eval:example
```

**Output**: Creates `datasets/stage1_example.json` with 3 test samples and runs a basic evaluation.

### Step 2: Evaluate Production Prompts

Test the actual prompts currently used in your extension:

```bash
npm run eval:production
```

**What it does**:
- Extracts the production prompt from `src/background/ai/providers/openai.ts`
- Runs it against your test dataset
- Shows metrics: Accuracy, Precision, Recall, F1, FPR
- Provides recommendations

**Example output**:
```
Production Prompt Evaluation
============================
Accuracy:  100.0%
Precision: 100.0%
Recall:    100.0%
F1 Score:  100.0%
FPR:       0.0%

Mean Latency: 0.52s
Total Cost:   $0.0001

✓ Excellent performance! Prompt is working very well.
```

### Step 3: Compare Prompt Variants

A/B test different prompt formulations:

```bash
npm run eval:compare
```

**What it does**:
- Tests 4 prompts: Production, Baseline, Detailed, Conservative
- Compares them side-by-side
- Shows which one performs best
- Recommends the winner

**Example output**:
```
COMPARISON RESULTS
==================
Prompt         | Accuracy | Precision | Recall | F1     | FPR    | Cost
---------------|----------|-----------|--------|--------|--------|--------
Production     |  100.0%  |   100.0%  | 100.0% | 100.0% |  0.0%  | $0.0001
Baseline       |  100.0%  |   100.0%  | 100.0% | 100.0% |  0.0%  | $0.0001
Detailed       |  100.0%  |   100.0%  | 100.0% | 100.0% |  0.0%  | $0.0001
Conservative   |   66.7%  |   100.0%  |  50.0% |  66.7% |  0.0%  | $0.0001

🏆 Best F1 Score: Production (100.0%)
```

## 📊 Building a Real Dataset

The example datasets are tiny (3 samples). For real evaluation, you need more data:

### 1. Create Dataset Files

```bash
mkdir -p datasets
```

Create `datasets/stage1_dataset.json`:

```json
[
  {
    "id": "001",
    "text": "The Eiffel Tower is 330 meters tall",
    "platform": "twitter",
    "hasClaim": true,
    "claims": ["The Eiffel Tower is 330 meters tall"],
    "annotator": "your-name",
    "confidence": 1.0,
    "metadata": {}
  },
  {
    "id": "002",
    "text": "I think Paris is beautiful",
    "platform": "twitter",
    "hasClaim": false,
    "claims": [],
    "annotator": "your-name",
    "confidence": 1.0,
    "metadata": {}
  }
]
```

### 2. Annotation Guidelines

**Label as `hasClaim: true` if**:
- Contains verifiable facts (dates, numbers, events)
- Makes specific assertions about reality
- Can be checked against sources

**Label as `hasClaim: false` if**:
- Pure opinion ("I think...", "X is beautiful")
- Questions
- Subjective preferences
- Hypotheticals

### 3. Dataset Size Recommendations

- **Minimum**: 100 samples (50 with claims, 50 without)
- **Good**: 500 samples (balanced across platforms/topics)
- **Excellent**: 1000+ samples

### 4. Update Scripts to Use Your Dataset

Edit the scripts to load your dataset:

```typescript
// Change this line:
const testData = manager.loadStage1('stage1_example.json');

// To this:
const testData = manager.loadStage1('stage1_dataset.json');
```

## 🔄 Iterative Improvement Workflow

```
1. Annotate dataset (100-500 samples)
   ↓
2. Run: npm run eval:production
   ↓
3. Analyze results (check F1, FPR, error patterns)
   ↓
4. Run: npm run eval:compare
   ↓
5. Pick best prompt variant
   ↓
6. Update extension code with winning prompt
   ↓
7. Deploy and monitor
   ↓
8. Repeat with more data
```

## 📈 Understanding Metrics

### Key Metrics

- **Accuracy**: Overall correctness (good for balanced datasets)
- **Precision**: Of claims detected, how many are real? (low = too many false positives)
- **Recall**: Of real claims, how many did we detect? (low = missing claims)
- **F1 Score**: Balance between precision and recall (best overall metric)
- **FPR (False Positive Rate)**: How often we incorrectly flag non-claims as claims

### What to Optimize For

**For fact-checking extension**:
- **High Precision** (>90%): Don't annoy users with false flags
- **Good Recall** (>80%): Don't miss important claims
- **Low FPR** (<10%): Minimize false positives

**Trade-offs**:
- Conservative prompt → High precision, lower recall
- Aggressive prompt → High recall, lower precision
- Balanced prompt → Middle ground

## 🎯 Real-World Example

### Scenario: Your production prompt has FPR = 15%

**Problem**: Too many false positives - flagging opinions as claims

**Solution**:
```bash
npm run eval:compare
```

**Result**: Conservative prompt has FPR = 5%, F1 = 85%

**Action**:
1. Copy conservative prompt to `src/background/ai/providers/openai.ts`
2. Test in extension
3. Deploy
4. Monitor real-world performance

## 🔧 Advanced Usage

### Test Different Models

```typescript
// In compare-prompts.ts, change:
const model = 'gpt-4o-mini';

// To:
const model = 'gpt-4o';  // Higher quality, more expensive
// or
const model = 'claude-3-5-sonnet-20241022';  // Anthropic
```

### Custom Prompts

Add your own prompt variant to `src/evaluation/prompts/prompt-registry.ts`:

```typescript
export const MY_CUSTOM_PROMPT: PromptTemplate = {
  id: 'stage1_custom_v1',
  name: 'My Custom Prompt',
  version: '1.0',
  stage: 1,
  systemPrompt: `Your custom prompt here...`,
  description: 'What makes this prompt special',
};
```

Then test it in your scripts.

## 💰 Cost Estimates

### Small dataset (100 samples)
- GPT-4o-mini: ~$0.002 per run
- GPT-4o: ~$0.02 per run

### Medium dataset (500 samples)
- GPT-4o-mini: ~$0.01 per run
- GPT-4o: ~$0.10 per run

### Large dataset (1000 samples)
- GPT-4o-mini: ~$0.02 per run
- GPT-4o: ~$0.20 per run

**Tip**: Use GPT-4o-mini for rapid iteration, GPT-4o for final validation.

## 📚 Next Steps

1. **Build your dataset**: Start with 100 samples
2. **Run baseline**: `npm run eval:production`
3. **Compare variants**: `npm run eval:compare`
4. **Pick winner**: Update extension code
5. **Scale up**: Grow to 500+ samples
6. **Monitor**: Track real-world performance

## 🆘 Troubleshooting

### "No test dataset found"
```bash
# Create example datasets first:
npm run eval:example
```

### "OPENAI_API_KEY not set"
```bash
export OPENAI_API_KEY="your-key"
```

### "Module not found"
```bash
# Make sure you've installed dependencies:
npm install
```

## 📖 More Resources

- **Full README**: `src/evaluation/README.md`
- **Design Doc**: `docs/2025-10-18-evaluation-framework-design.md`
- **Integration Guide**: `docs/EVALUATION_MONOREPO_INTEGRATION.md`
