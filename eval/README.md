# Fact-It Evaluation Framework

Automated evaluation system for testing different AI models and prompts for fact-checking.

## Quick Start

### 1. Install Dependencies

```bash
pip install openai anthropic numpy scikit-learn tqdm
```

### 2. Set up API Keys

```bash
export OPENAI_API_KEY="your-openai-key"
export ANTHROPIC_API_KEY="your-anthropic-key"  # Optional
```

### 3. Create Example Datasets

```bash
cd eval
python dataset_manager.py
```

This creates example datasets in `./datasets/`:
- `stage1_example.json` - Claim detection samples
- `stage2_example.json` - Verification samples

### 4. Run Evaluation

```python
from dataset_manager import DatasetManager
from model_runner import ModelRunner
from evaluators import Stage1Evaluator, print_evaluation_report
from prompt_registry import PromptRegistry

# Load dataset
manager = DatasetManager()
test_data = manager.load_stage1("stage1_example.json")

# Initialize model runner
runner = ModelRunner()

# Get prompt
registry = PromptRegistry()
prompt = registry.get_prompt("baseline", stage=1)

# Run inference
predictions = runner.run_batch(
    model="gpt-4o-mini",
    prompt=prompt.system_prompt,
    samples=test_data
)

# Evaluate
evaluator = Stage1Evaluator()
metrics = evaluator.evaluate(predictions, test_data)

# Print report
print_evaluation_report(1, metrics, "GPT-4o-mini")
```

## Project Structure

```
eval/
├── README.md                    # This file
├── dataset_schema.py            # Data structures and types
├── dataset_manager.py           # Dataset loading and management
├── model_runner.py              # Model API abstractions
├── evaluators.py                # Metrics calculation
├── prompt_registry.py           # Prompt template management
└── datasets/                    # Test datasets
    ├── stage1_dataset.json
    ├── stage2_dataset.json
    └── annotation_guidelines.md
```

## Key Components

### Dataset Schema

Defines typed data structures for test samples:

- **Stage1Sample**: Claim detection samples with ground truth labels
- **Stage2Sample**: Verification samples with verdicts and sources
- **ModelPrediction**: Model output with confidence and metadata

### Dataset Manager

Handles dataset operations:

```python
manager = DatasetManager("./datasets")

# Load datasets
stage1 = manager.load_stage1()
stage2 = manager.load_stage2()

# Train/val/test split
splits = manager.train_val_test_split(
    stage=1,
    train=0.7,
    val=0.15,
    test=0.15,
    stratify_by="has_claim"
)

# Filter datasets
twitter_claims = manager.get_subset(
    stage=1,
    filters={"platform": "twitter", "has_claim": True}
)

# Get statistics
stats = manager.get_statistics(stage=1)
```

### Model Runner

Unified interface for different AI providers:

```python
runner = ModelRunner(
    openai_key="...",
    anthropic_key="..."
)

# Single inference
result = runner.run_single(
    model="gpt-4o-mini",
    prompt="...",
    sample=test_sample
)

# Batch inference (parallel)
results = runner.run_batch(
    model="gpt-4o",
    prompt="...",
    samples=test_data,
    max_workers=5
)

# Cost estimation
cost_est = runner.estimate_cost(
    model="gpt-4o-mini",
    num_samples=500
)
print(f"Estimated cost: ${cost_est['total_cost']:.2f}")
```

### Evaluators

Calculate comprehensive metrics:

**Stage 1 (Claim Detection)**:
- Precision, Recall, F1 Score
- False Positive/Negative Rates
- Confusion matrix analysis
- Performance (latency, cost)
- Error analysis by category

**Stage 2 (Verification)**:
- Multi-class accuracy
- Per-class precision/recall
- Critical errors (TRUE↔FALSE swaps)
- Confidence calibration (ECE)
- Source quality metrics
- Performance and cost metrics

```python
from evaluators import Stage1Evaluator, Stage2Evaluator

# Stage 1
evaluator1 = Stage1Evaluator()
metrics1 = evaluator1.evaluate(predictions, ground_truth)

# Stage 2
evaluator2 = Stage2Evaluator()
metrics2 = evaluator2.evaluate(predictions, ground_truth)
```

### Prompt Registry

Manage prompt templates and variants:

```python
registry = PromptRegistry()

# List available prompts
stage1_prompts = registry.list_prompts(stage=1)
# ['baseline', 'detailed_v1', 'few_shot_v1', 'conservative_v1']

stage2_prompts = registry.list_prompts(stage=2)
# ['baseline', 'detailed_v1', 'cot_v1', 'conservative_v1', 'aggressive_v1']

# Get prompt
prompt = registry.get_prompt("baseline", stage=1)
print(prompt.system_prompt)

# Add custom prompt
from prompt_registry import PromptTemplate

custom_prompt = PromptTemplate(
    id="my_custom_prompt",
    name="My Custom Prompt",
    version="1.0",
    stage=1,
    system_prompt="...",
    description="Custom prompt for testing"
)
registry.add_custom_prompt(custom_prompt)
```

## Usage Examples

### Example 1: Compare Multiple Models (Stage 1)

```python
from dataset_manager import DatasetManager
from model_runner import ModelRunner
from evaluators import Stage1Evaluator, print_evaluation_report
from prompt_registry import PromptRegistry

# Setup
manager = DatasetManager()
test_data = manager.load_stage1()
runner = ModelRunner()
registry = PromptRegistry()
evaluator = Stage1Evaluator()

# Get prompt
prompt = registry.get_prompt("baseline", stage=1)

# Test models
models = ["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet-20241022"]
results = {}

for model in models:
    print(f"\nTesting {model}...")
    
    # Run inference
    predictions = runner.run_batch(
        model=model,
        prompt=prompt.system_prompt,
        samples=test_data
    )
    
    # Evaluate
    metrics = evaluator.evaluate(predictions, test_data)
    results[model] = metrics
    
    # Print report
    print_evaluation_report(1, metrics, model)

# Compare results
print("\n=== Model Comparison ===")
print(f"{'Model':<30} {'F1':<8} {'Cost':<10} {'P90 Latency':<12}")
print("-" * 60)
for model, metrics in results.items():
    print(f"{model:<30} {metrics['f1_score']:.3f}    ${metrics['total_cost']:<8.4f} {metrics['p90_latency']:.2f}s")
```

### Example 2: A/B Test Prompts (Stage 2)

```python
from dataset_manager import DatasetManager
from model_runner import ModelRunner
from evaluators import Stage2Evaluator, print_evaluation_report
from prompt_registry import PromptRegistry

# Setup
manager = DatasetManager()
test_data = manager.load_stage2()
runner = ModelRunner()
registry = PromptRegistry()
evaluator = Stage2Evaluator()

# Test prompt variants
model = "gpt-4o"
prompt_ids = ["baseline", "detailed_v1", "cot_v1", "conservative_v1"]
results = {}

for prompt_id in prompt_ids:
    print(f"\nTesting prompt: {prompt_id}...")
    
    prompt = registry.get_prompt(prompt_id, stage=2)
    
    # Run inference
    predictions = runner.run_batch(
        model=model,
        prompt=prompt.system_prompt,
        samples=test_data,
        max_workers=3  # Slower for Stage 2
    )
    
    # Evaluate
    metrics = evaluator.evaluate(predictions, test_data)
    results[prompt_id] = metrics
    
    print_evaluation_report(2, metrics, f"{model} + {prompt_id}")

# Compare prompts
print("\n=== Prompt Comparison ===")
print(f"{'Prompt':<20} {'Accuracy':<10} {'Critical Err':<12} {'ECE':<8}")
print("-" * 50)
for prompt_id, metrics in results.items():
    crit_rate = metrics['critical_errors']['critical_error_rate']
    ece = metrics['calibration']['expected_calibration_error']
    print(f"{prompt_id:<20} {metrics['accuracy']:.3f}      {crit_rate:.3f}        {ece:.3f}")
```

### Example 3: Analyze Specific Error Categories

```python
from dataset_manager import DatasetManager
from model_runner import ModelRunner
from evaluators import Stage1Evaluator

# Setup
manager = DatasetManager()
test_data = manager.load_stage1()
runner = ModelRunner()
evaluator = Stage1Evaluator()

# Run evaluation
prompt = "..."  # Your prompt
predictions = runner.run_batch("gpt-4o-mini", prompt, test_data)
metrics = evaluator.evaluate(predictions, test_data)

# Analyze errors by platform
print("\n=== Accuracy by Platform ===")
for platform, stats in metrics['error_analysis']['by_platform'].items():
    print(f"{platform}: {stats['accuracy']:.2%} ({stats['correct']}/{stats['total']})")

# Analyze false positives
print("\n=== False Positives (Opinions Marked as Claims) ===")
for fp in metrics['confusion_analysis']['false_positives'][:5]:
    print(f"  ID: {fp['id']}")
    print(f"  Text: {fp['text']}")
    print(f"  Platform: {fp['platform']}\n")
```

## Cost Estimation

Before running large evaluations:

```python
from model_runner import ModelRunner

runner = ModelRunner()

# Estimate costs for different models
models = [
    ("gpt-4o-mini", 300, 100),    # 300 input, 100 output tokens avg
    ("gpt-4o", 2000, 200),         # Stage 2: more input from search
    ("claude-3-5-sonnet", 2000, 200),
]

print("Cost estimates for 300 samples:")
for model, input_tokens, output_tokens in models:
    est = runner.estimate_cost(model, 300, input_tokens, output_tokens)
    if "error" not in est:
        print(f"  {model}: ${est['total_cost']:.2f}")
```

## Tips & Best Practices

### Dataset Construction

1. **Balance your dataset**: Ensure representative distribution of labels, platforms, topics
2. **Multiple annotators**: Use 2-3 annotators for 20% of samples to measure agreement
3. **Quality over quantity**: 300 high-quality samples > 1000 noisy samples
4. **Include edge cases**: Vague claims, mixed statements, implicit claims

### Model Selection

1. **Start with baseline**: Use GPT-4o-mini for Stage 1, GPT-4o for Stage 2
2. **Test alternatives**: Claude Sonnet often comparable to GPT-4o
3. **Consider cost-accuracy tradeoff**: Sometimes 2x cost doesn't mean 2x accuracy

### Prompt Optimization

1. **Ablation testing**: Change one thing at a time (instructions, examples, format)
2. **Test on validation set**: Don't overfit to test set
3. **Monitor false positives**: For Stage 1, FPR directly impacts Stage 2 costs

### Evaluation Process

1. **Use fixed random seeds**: Ensure reproducibility in dataset splits
2. **Run multiple times**: Check consistency across runs (stochastic models)
3. **Statistical significance**: Use t-tests when comparing models/prompts
4. **Error analysis**: Don't just look at aggregate metrics, inspect failures

## Metrics Reference

### Stage 1 Target Metrics

- **F1 Score**: > 0.87
- **Precision**: > 0.90 (minimize false positives for cost control)
- **Recall**: > 0.85 (catch most claims)
- **False Positive Rate**: < 0.15
- **P90 Latency**: < 1 second
- **Cost per 1K samples**: < $0.025

### Stage 2 Target Metrics

- **Accuracy**: > 0.80
- **Precision (FALSE)**: > 0.85 (avoid false accusations)
- **Recall (FALSE)**: > 0.75 (catch misinformation)
- **Critical Error Rate**: < 5% (TRUE↔FALSE swaps)
- **Expected Calibration Error**: < 0.10
- **Source Overlap**: > 0.60
- **P90 Latency**: < 4 seconds
- **Cost per verification**: < $0.015

## Troubleshooting

### "No matching predictions found"

Ensure sample IDs match between predictions and ground truth:
```python
print("Ground truth IDs:", [s.id for s in ground_truth[:5]])
print("Prediction IDs:", [p.sample_id for p in predictions[:5]])
```

### "Provider not available"

Check API keys are set:
```python
import os
print("OpenAI key set:", "OPENAI_API_KEY" in os.environ)
print("Anthropic key set:", "ANTHROPIC_API_KEY" in os.environ)
```

### High costs

- Use smaller test set for development (`test_data[:10]`)
- Use cost estimation before running full evaluation
- Consider using GPT-4o-mini for initial testing

### Inconsistent results

- Fix random seed in train_val_test_split
- For o1 models, note they use different parameters (no temperature)
- Check for rate limiting (reduce max_workers)

## Next Steps

1. **Build your dataset**: Follow annotation guidelines in docs/
2. **Run baseline evaluation**: Establish performance benchmarks
3. **Test alternative models**: Compare accuracy, cost, latency
4. **Optimize prompts**: A/B test different prompt variants
5. **Error analysis**: Identify systematic failures and iterate
6. **Deploy best configuration**: Use winning model+prompt in production

## Additional Resources

- **Design Document**: `docs/2025-10-18-evaluation-framework-design.md`
- **Implementation Plan**: See design doc Section 6
- **Annotation Guidelines**: `datasets/annotation_guidelines.md` (to be created)
- **Full documentation**: See individual module docstrings

---

For questions or issues, refer to the main project documentation or implementation plan.
