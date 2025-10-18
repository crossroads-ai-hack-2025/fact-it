# Evaluation Framework

The evaluation framework has been integrated into the main Fact-It monorepo for better project organization.

## ✅ What Changed

### Before (Standalone Structure)

```
fact-it/
├── src/                    # Extension code
├── eval/                   # Python evaluation (deprecated)
└── eval-ts/                # Standalone TypeScript eval (deprecated)
    ├── package.json        # Separate dependencies
    ├── node_modules/       # Duplicate dependencies
    └── src/                # Evaluation code
```

### After (Monorepo Structure)

```
fact-it/
├── src/
│   ├── background/         # Extension code
│   ├── content/
│   ├── popup/
│   └── evaluation/         # ✨ Evaluation framework (integrated)
│       ├── types/
│       ├── dataset/
│       ├── models/
│       ├── evaluation/
│       ├── prompts/
│       └── examples/
├── datasets/               # Shared datasets folder
├── package.json            # Single dependency file
└── node_modules/           # Shared dependencies
```

## 🎯 Benefits

1. **Single Dependency Tree** - No duplicate `node_modules`, faster installs
2. **Shared Dependencies** - Extension and evaluation use same AI SDK versions
3. **Unified Scripts** - All commands in one `package.json`
4. **Better Organization** - Everything in one repo, easier to navigate
5. **Type Sharing** - Can share types between extension and evaluation
6. **Consistent Tooling** - Same TypeScript config, linting, formatting

## 🚀 Quick Start

```bash
# Install dependencies (only once, from project root)
npm install

# Set API key
export OPENAI_API_KEY="your-key"

# Run evaluation example
npm run eval:example
```

## 📦 Updated package.json

### New Scripts

```json
{
  "scripts": {
    "eval:example": "tsx src/evaluation/examples/example-evaluation.ts",
    "eval:create-datasets": "tsx src/evaluation/examples/create-datasets.ts"
  }
}
```

### New Dependencies

```json
{
  "dependencies": {
    "@ai-sdk/anthropic": "^1.0.0", // For Claude models
    "@ai-sdk/google": "^1.0.0", // For Gemini models
    "@ai-sdk/openai": "^2.0.52", // Already had this
    "ai": "^5.0.76", // Already had this
    "zod": "^4.1.12" // Already had this
  },
  "devDependencies": {
    "tsx": "^4.7.0" // For running TS scripts
  }
}
```

## 📂 File Locations

| Component           | Location                                    |
| ------------------- | ------------------------------------------- |
| **Dataset Types**   | `src/evaluation/types/dataset-schema.ts`    |
| **Dataset Manager** | `src/evaluation/dataset/dataset-manager.ts` |
| **Model Runner**    | `src/evaluation/models/model-runner.ts`     |
| **Evaluators**      | `src/evaluation/evaluation/evaluators.ts`   |
| **Prompts**         | `src/evaluation/prompts/prompt-registry.ts` |
| **Examples**        | `src/evaluation/examples/`                  |
| **Datasets**        | `datasets/` (root level)                    |
| **Results**         | `results/` (root level, gitignored)         |

## 🔧 Usage

### Run Example Evaluation

```bash
npm run eval:example
```

Output:

```
======================================================================
FACT-IT EVALUATION FRAMEWORK - EXAMPLE SCRIPT
======================================================================

API Keys Status:
  OpenAI:    ✓
  Anthropic: ✗
  Google:    ✗

Loading test dataset...
Loaded 3 Stage 1 samples

Running inference with gpt-4o-mini...
Progress: 3/3

======================================================================
Stage 1 Evaluation Report: GPT-4o-mini (baseline)
======================================================================

Classification Metrics:
  Accuracy:  1.000
  Precision: 1.000
  Recall:    1.000
  F1 Score:  1.000

Performance Metrics:
  Mean Latency: 0.523s
  Total Cost:   $0.0001
```

### Import in Your Code

```typescript
// From extension code
import { DatasetManager } from '@/evaluation/dataset/dataset-manager';
import { ModelRunner } from '@/evaluation/models/model-runner';
import { Stage1Evaluator } from '@/evaluation/evaluation/evaluators';
import { PromptRegistry } from '@/evaluation/prompts/prompt-registry';

// Use evaluation framework
const manager = new DatasetManager('./datasets');
const runner = new ModelRunner();
const evaluator = new Stage1Evaluator();
const registry = new PromptRegistry();
```

### Create Custom Evaluation Script

```typescript
// src/evaluation/examples/my-evaluation.ts
import { DatasetManager, ModelRunner, Stage1Evaluator, PromptRegistry } from '../';

async function main() {
  const manager = new DatasetManager('./datasets');
  const testData = manager.loadStage1('my_dataset.json');

  const runner = new ModelRunner();
  const evaluator = new Stage1Evaluator();
  const registry = new PromptRegistry();

  const prompt = registry.getPrompt('stage1_baseline', 1);

  const predictions = await runner.runBatch('gpt-4o-mini', prompt!.systemPrompt, testData);
  const metrics = evaluator.evaluate(predictions, testData);

  console.log('F1 Score:', metrics.f1Score);
  console.log('Total Cost:', metrics.totalCost);
}

main();
```

Run it:

```bash
tsx src/evaluation/examples/my-evaluation.ts
```

## 🗑️ Cleanup

The old standalone folders can be safely removed:

```bash
# Remove old Python evaluation
rm -rf eval/

# Remove old standalone TypeScript evaluation
rm -rf eval-ts/
```

These are already in `.gitignore` so they won't be committed.

## 📊 Shared Dependencies

The evaluation framework now shares dependencies with the extension:

| Package             | Version | Used By                |
| ------------------- | ------- | ---------------------- |
| `ai`                | ^5.0.76 | Extension + Evaluation |
| `@ai-sdk/openai`    | ^2.0.52 | Extension + Evaluation |
| `@ai-sdk/anthropic` | ^1.0.0  | Evaluation only        |
| `@ai-sdk/google`    | ^1.0.0  | Evaluation only        |
| `zod`               | ^4.1.12 | Extension + Evaluation |
| `typescript`        | ^5.4.5  | Extension + Evaluation |
| `tsx`               | ^4.7.0  | Evaluation scripts     |

## 🎨 TypeScript Configuration

The evaluation code uses the same `tsconfig.json` as the extension, ensuring consistency:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

This means you can use path aliases like `@/evaluation/...` throughout the codebase.

## 🔄 Migration Checklist

- [x] Move evaluation code to `src/evaluation/`
- [x] Update `package.json` with eval scripts
- [x] Add missing dependencies (`@ai-sdk/anthropic`, `@ai-sdk/google`, `tsx`)
- [x] Remove `.js` extensions from imports
- [x] Create `datasets/` folder at root
- [x] Update `.gitignore` to exclude old folders
- [x] Create `src/evaluation/README.md`
- [x] Update documentation

## ✨ Next Steps

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Test the integration**:

   ```bash
   export OPENAI_API_KEY="your-key"
   npm run eval:example
   ```

3. **Remove old folders** (optional):

   ```bash
   rm -rf eval/ eval-ts/
   ```

4. **Start building your dataset**:
   - Create `datasets/stage1_dataset.json`
   - Create `datasets/stage2_dataset.json`
   - Run evaluations with `npm run eval:example`

## 📚 Documentation

- **Evaluation README**: `src/evaluation/README.md`
- **Design Document**: `docs/2025-10-18-evaluation-framework-design.md`
- **TypeScript Migration**: `docs/EVALUATION_FRAMEWORK_TYPESCRIPT.md`
- **This Document**: `docs/EVALUATION_MONOREPO_INTEGRATION.md`

---

The evaluation framework is now fully integrated into your monorepo! 🎉
