# Fact-It: Model & Prompt Evaluation Framework

## Executive Summary

This document outlines an automated evaluation system for testing different AI models and prompts for the Fact-It fact-checking extension. The framework enables systematic comparison of models, prompts, and configurations to optimize accuracy, cost, and performance.

**Key Objectives:**

1. Build gold-standard test dataset (500+ annotated samples)
2. Define evaluation metrics for both stages
3. Automate model/prompt comparison pipeline
4. Identify optimal model-prompt configurations
5. Enable continuous evaluation as models evolve

**Target Metrics:**

- **Stage 1 (Claim Detection)**: F1 > 0.87, FPR < 0.15, P90 latency < 1s
- **Stage 2 (Verification)**: Accuracy > 0.80, Critical errors < 5%, P90 latency < 4s
- **Cost**: < $0.015 per post (combined stages)

---

## 1. Evaluation Framework Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────┐
│          Evaluation Orchestrator                    │
│  - Loads test datasets                              │
│  - Coordinates model/prompt variants                │
│  - Aggregates results & generates reports           │
└─────────────┬───────────────────────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───▼────────┐    ┌────▼──────┐
│  Stage 1   │    │  Stage 2  │
│  Evaluator │    │  Evaluator│
└───┬────────┘    └────┬──────┘
    │                  │
    └────────┬─────────┘
             │
    ┌────────▼────────┐
    │  Results Store  │
    │   (SQLite DB)   │
    └────────┬────────┘
             │
    ┌────────▼────────┐
    │   Dashboard &   │
    │   Report Gen.   │
    └─────────────────┘
```

### Core Components

1. **Test Dataset Manager** - Loads, validates, and manages test datasets
2. **Stage 1 Evaluator** - Tests claim detection (precision, recall, F1)
3. **Stage 2 Evaluator** - Tests verification (accuracy, confidence calibration)
4. **Model Runner** - Abstraction for OpenAI, Anthropic, local models
5. **Prompt Registry** - Version-controlled prompt templates
6. **Results Analyzer** - Statistical testing and visualization

---

## 2. Test Dataset Construction

### Dataset Requirements

**Stage 1 (Claim Detection)**: 500 samples

- 350 WITH factual claims (70%)
- 150 WITHOUT claims - opinions, questions (30%)

**Stage 2 (Verification)**: 300 samples

- 100 TRUE claims (33%)
- 100 FALSE claims (33%)
- 100 UNKNOWN/UNVERIFIABLE (34%)

**Balance Criteria:**

- **Platform**: Twitter (40%), LinkedIn (30%), Facebook (20%), Articles (10%)
- **Topic**: Politics (30%), Health (20%), Science (20%), Business (15%), Other (15%)
- **Complexity**: Simple (40%), Moderate (40%), Complex (20%)
- **Recency**: Recent (50%), Historical (30%), Timeless (20%)

### Annotation Guidelines

#### Stage 1: Claim Detection

**Label: HAS_CLAIM or NO_CLAIM**

**Definition**: A checkable factual assertion that can be objectively verified.

**Examples of CLAIMS:**

- ✓ "The unemployment rate fell to 3.5% in December 2023"
- ✓ "Studies show coffee reduces risk of type 2 diabetes"
- ✓ "Tesla sold 1.8 million vehicles in 2023"

**Examples of NO_CLAIM:**

- ✗ "I think remote work is more productive" (opinion)
- ✗ "Why don't more people use electric vehicles?" (question)
- ✗ "Tesla makes incredible cars" (subjective)

#### Stage 2: Verification

**Labels: TRUE, FALSE, UNKNOWN**

**Annotation Process:**

1. Research claim using Google, fact-checking sites
2. Find primary sources (academic, official statistics, news)
3. Assess source consensus
4. Assign label with confidence score and sources

**Required Metadata:**

```json
{
  "text": "Claim text",
  "label": "TRUE/FALSE/UNKNOWN",
  "confidence": 0.85,
  "sources": [
    {
      "url": "https://...",
      "title": "Source Title",
      "reliability_score": 0.9
    }
  ],
  "explanation": "Brief explanation",
  "difficulty": "easy/medium/hard"
}
```

### Dataset Sources

1. **Curated Social Media** - Manual collection from Twitter/X, LinkedIn, Facebook
2. **Fact-Checking Databases** - PolitiFact, Snopes, FactCheck.org, FEVER dataset
3. **Synthetic Examples** - GPT-4 generated edge cases
4. **User Submissions** - Crowdsourced from beta testers

### Quality Control

- 20% of samples annotated by 3 independent annotators
- Calculate Cohen's Kappa (target: >0.8)
- Regular calibration sessions
- Audit random 10% monthly

---

## 3. Evaluation Metrics

### Stage 1: Claim Detection

**Classification Metrics:**

- **Precision**: >0.90 (minimize false positives → cost control)
- **Recall**: >0.85 (catch most claims)
- **F1 Score**: >0.87
- **False Positive Rate**: <0.15 (critical for Stage 2 cost)

**Performance Metrics:**

- **P90 Latency**: <1 second
- **Mean Cost**: <$0.0001 per sample

**Error Analysis:**

- Confusion matrix by platform, topic, complexity
- False positive/negative pattern analysis

### Stage 2: Verification

**Accuracy Metrics:**

- **Overall Accuracy**: >0.80
- **Precision (FALSE)**: >0.85 (avoid false accusations)
- **Recall (FALSE)**: >0.75 (catch misinformation)
- **Critical Errors** (TRUE↔FALSE swaps): <5%

**Confidence Calibration:**

- **Expected Calibration Error (ECE)**: <0.10
- If model says 80% confident, should be correct ~80% of time

**Source Quality:**

- **Source Overlap**: >0.60 (find 60%+ of ground truth sources)
- **Avg Reliability**: >0.80
- **Source Diversity**: ≥3 unique domains

**Explanation Quality** (GPT-4 as judge):

- **Clarity**: >4.0/5
- **Completeness**: >3.5/5
- **Evidence Support**: >4.0/5

---

## 4. Models to Test

### Stage 1: Claim Detection

| Model             | Cost (per 1K) | Expected Latency | Notes                |
| ----------------- | ------------- | ---------------- | -------------------- |
| **GPT-4o-mini**   | $0.023        | 0.5-0.8s         | Current baseline     |
| GPT-4o            | $0.38         | 0.8-1.2s         | Higher accuracy?     |
| Claude Sonnet 3.5 | $0.30         | 0.7-1.0s         | Alternative provider |
| Gemini 1.5 Flash  | $0.075        | 0.4-0.7s         | Cost-effective       |
| Local: DistilBERT | $0            | 0.05-0.1s        | Future optimization  |

**Test Matrix**: All models × 3 prompt variants = 15 configurations

### Stage 2: Verification

| Model              | Cost (per check) | Expected Latency | Notes                    |
| ------------------ | ---------------- | ---------------- | ------------------------ |
| **GPT-4o**         | $0.007           | 2-4s             | Current baseline         |
| GPT-4o with search | $0.014           | 3-5s             | With Brave Search        |
| Claude Sonnet 3.5  | $0.015           | 2-4s             | Alternative              |
| o1-preview         | $0.035           | 5-10s            | Advanced reasoning       |
| o1-mini            | $0.007           | 3-6s             | Cost-effective reasoning |

**Test Matrix**: All models × 5 prompt variants × 2 search strategies = 50 configurations

---

## 5. Prompt Optimization

### Prompt Variant Types

**1. System Prompt Variations**

- Baseline: Current prompt
- Detailed instructions: More specific guidelines
- Few-shot: Include 3-5 examples
- Chain-of-thought: Explicit reasoning steps
- Role-based: "You are an expert fact-checker..."

**2. Output Format Variations**

- Structured JSON (current)
- Step-by-step reasoning → final answer
- Confidence calibration prompts

**3. Constraint Variations**

- Conservative mode: Bias toward "unknown"
- Aggressive mode: Force true/false verdicts
- Balanced mode: Current approach

### Prompt Registry

```python
# eval/prompts/stage1_prompts.py
PROMPTS = {
    "baseline": {
        "version": "1.0",
        "system": "You are a fact-checking assistant...",
        "user_template": "{text}",
    },
    "detailed_v1": {
        "version": "1.1",
        "system": "You are a fact-checking assistant with expertise...",
        "user_template": "{text}",
    },
    "few_shot_v1": {
        "version": "1.2",
        "system": "...",
        "examples": [
            {"text": "...", "output": "..."},
            {"text": "...", "output": "..."},
        ],
        "user_template": "{text}",
    }
}
```

### A/B Testing Framework

```python
def compare_prompts(prompt_ids: List[str], dataset: str) -> pd.DataFrame:
    """
    Compare multiple prompt variants

    Returns comparison table with:
    - Accuracy metrics
    - Cost per sample
    - Latency percentiles
    - Statistical significance (paired t-test)
    """
    pass
```

---

## 6. Implementation Plan

### Phase 1: Dataset Construction (Week 1)

**Tasks:**

1. Set up annotation tool (Label Studio or custom)
2. Recruit 3 annotators
3. Create annotation guidelines document
4. Annotate 100 samples for calibration
5. Calculate inter-annotator agreement
6. Complete 500 Stage 1 samples
7. Complete 300 Stage 2 samples

**Deliverables:**

- `datasets/stage1_dataset.json`
- `datasets/stage2_dataset.json`
- `datasets/annotation_guidelines.md`
- Train/val/test splits (70/15/15)

**Effort**: 40-50 hours

### Phase 2: Evaluation Framework (Week 2)

**Tasks:**

1. Implement Dataset Manager
2. Implement Model Runner (OpenAI, Anthropic)
3. Implement Stage 1 Evaluator
4. Implement Stage 2 Evaluator
5. Set up Results Store (SQLite)
6. Create evaluation CLI

**Deliverables:**

- `eval/dataset_manager.py`
- `eval/model_runner.py`
- `eval/stage1_evaluator.py`
- `eval/stage2_evaluator.py`
- `eval/results_store.py`
- `eval/cli.py`

**Effort**: 30-40 hours

### Phase 3: Baseline Evaluation (Week 3)

**Tasks:**

1. Run baseline (GPT-4o-mini for Stage 1, GPT-4o for Stage 2)
2. Analyze results and error patterns
3. Document baseline metrics
4. Identify common failure cases

**Deliverables:**

- Baseline metrics report
- Error analysis document
- Recommended improvements

**Effort**: 10-15 hours

### Phase 4: Model Comparison (Week 4)

**Tasks:**

1. Test alternative models (Claude, Gemini, o1)
2. Compare accuracy, cost, latency
3. Statistical significance testing
4. Generate comparison report

**Deliverables:**

- Model comparison report with visualizations
- Recommended model selections
- Cost-accuracy tradeoff analysis

**Effort**: 20-25 hours

### Phase 5: Prompt Optimization (Week 5)

**Tasks:**

1. Create 5 prompt variants for each stage
2. Run A/B tests on all variants
3. Identify best-performing prompts
4. Document prompt engineering insights

**Deliverables:**

- Prompt comparison report
- Optimized prompts for production
- Prompt engineering guidelines

**Effort**: 20-25 hours

### Phase 6: Continuous Evaluation Setup (Week 6)

**Tasks:**

1. Set up automated evaluation CI/CD
2. Create dashboard for monitoring
3. Configure alerts for metric regressions
4. Document evaluation process

**Deliverables:**

- GitHub Actions workflow for evaluation
- Web dashboard for results
- Monitoring and alerting setup
- `docs/evaluation-process.md`

**Effort**: 15-20 hours

**Total Estimated Effort**: 135-175 hours over 6 weeks

---

## 7. Results Analysis & Reporting

### Comparison Report Template

```markdown
# Model Evaluation Report

Date: YYYY-MM-DD
Dataset: stage1_test (500 samples)

## Summary

| Model         | Accuracy | F1   | Cost/1K | P90 Latency |
| ------------- | -------- | ---- | ------- | ----------- |
| GPT-4o-mini   | 0.89     | 0.88 | $0.023  | 0.7s        |
| GPT-4o        | 0.92     | 0.91 | $0.38   | 1.1s        |
| Claude Sonnet | 0.90     | 0.89 | $0.30   | 0.9s        |

## Detailed Analysis

### Accuracy by Category

- Politics: 0.85
- Health: 0.91
- Science: 0.88

### Error Analysis

- Most common false positives: Opinion statements with statistical claims
- Most common false negatives: Vague/implicit claims

### Recommendations

Based on cost-accuracy tradeoff, **GPT-4o-mini** remains optimal for Stage 1.
Consider GPT-4o only for high-stakes verification.
```

### Visualization Dashboard

**Key Charts:**

1. **Accuracy vs Cost scatter plot** - Identify pareto frontier
2. **Confusion matrix heatmap** - Visualize error patterns
3. **Latency distribution** - Boxplots by model
4. **Calibration plot** - Expected vs actual confidence
5. **Error breakdown** - Bar charts by category

**Tools**: Streamlit or Jupyter Dashboard

---

## 8. Continuous Evaluation

### Monitoring Strategy

**1. Automated Evaluation Pipeline**

- Run evaluation on test set weekly
- Compare to baseline metrics
- Alert on >5% metric regression

**2. Production Monitoring**

- Sample 1% of production requests
- Manual annotation of sampled requests
- Compare production accuracy to test set

**3. Model Updates**

- Re-evaluate when OpenAI/Anthropic release new models
- Test every 3 months for model drift
- Update prompts as needed

### CI/CD Integration

```yaml
# .github/workflows/evaluation.yml
name: Model Evaluation
on:
  schedule:
    - cron: '0 0 * * 0' # Weekly on Sunday
  workflow_dispatch: # Manual trigger

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run evaluation
        run: python eval/cli.py run-all
      - name: Generate report
        run: python eval/cli.py report
      - name: Check for regressions
        run: python eval/cli.py check-regression
```

---

## 9. Success Criteria

### Phase Completion Criteria

**Phase 1: Dataset** ✅

- [ ] 500 Stage 1 samples annotated
- [ ] 300 Stage 2 samples annotated
- [ ] Inter-annotator agreement Kappa > 0.75
- [ ] Dataset documented and version-controlled

**Phase 2: Framework** ✅

- [ ] All evaluator components implemented
- [ ] Test coverage > 80%
- [ ] CLI functional
- [ ] Documentation complete

**Phase 3: Baseline** ✅

- [ ] Baseline metrics established
- [ ] Error patterns documented
- [ ] Improvement opportunities identified

**Phase 4: Model Comparison** ✅

- [ ] ≥3 alternative models tested
- [ ] Statistical significance computed
- [ ] Recommendations documented

**Phase 5: Prompt Optimization** ✅

- [ ] ≥5 prompt variants tested per stage
- [ ] Best prompts identified
- [ ] Prompt guidelines documented

**Phase 6: Continuous Eval** ✅

- [ ] CI/CD pipeline operational
- [ ] Dashboard deployed
- [ ] Team trained on evaluation process

### Overall Success Metrics

- **Evaluation time**: <2 hours for full test set (500 samples)
- **Cost**: <$50 per evaluation run
- **Reproducibility**: Same config → same results (±1%)
- **Coverage**: Test all production model/prompt combinations
- **Adoption**: Team runs evaluation before every prompt/model change

---

## Appendix A: File Structure

```
fact-it/
├── datasets/
│   ├── stage1_dataset.json          # Stage 1 test samples
│   ├── stage2_dataset.json          # Stage 2 test samples
│   ├── annotation_guidelines.md     # Annotation instructions
│   └── schema.py                    # Dataset schemas
├── eval/
│   ├── __init__.py
│   ├── cli.py                       # Command-line interface
│   ├── pipeline.py                  # Evaluation orchestrator
│   ├── dataset_manager.py           # Dataset loading/splitting
│   ├── model_runner.py              # Model API abstraction
│   ├── stage1_evaluator.py          # Stage 1 metrics
│   ├── stage2_evaluator.py          # Stage 2 metrics
│   ├── results_store.py             # SQLite storage
│   ├── prompts/
│   │   ├── stage1_prompts.py        # Stage 1 prompt registry
│   │   └── stage2_prompts.py        # Stage 2 prompt registry
│   └── utils/
│       ├── metrics.py               # Metric calculations
│       ├── visualization.py         # Charts and plots
│       └── reporting.py             # Report generation
├── results/
│   ├── evaluation.db                # Results database
│   ├── reports/                     # Generated reports
│   └── plots/                       # Visualization outputs
└── docs/
    ├── evaluation-framework-design.md  # This document
    ├── annotation-guidelines.md        # Detailed guidelines
    └── evaluation-process.md           # Team procedures
```

---

## Appendix B: CLI Usage Examples

```bash
# Run evaluation on baseline models
python eval/cli.py evaluate \
  --stage stage1 \
  --models gpt-4o-mini,gpt-4o \
  --prompts baseline \
  --dataset stage1_test

# Compare multiple prompts
python eval/cli.py compare-prompts \
  --stage stage2 \
  --model gpt-4o \
  --prompts baseline,detailed_v1,few_shot_v1

# Generate comparison report
python eval/cli.py report \
  --run-ids run_abc123,run_def456 \
  --output results/comparison.md

# Check for metric regressions
python eval/cli.py check-regression \
  --baseline-run run_abc123 \
  --new-run run_def456 \
  --threshold 0.05  # Alert if >5% drop

# Export results to CSV
python eval/cli.py export \
  --run-id run_abc123 \
  --format csv \
  --output results/run_abc123.csv
```

---

## Appendix C: Cost Estimates

### Dataset Annotation

- 3 annotators × 800 total samples × 5 min/sample = 200 hours
- At $25/hour = **$5,000 total** (one-time)
- Or use GPT-4 pre-annotation + human review: **$500 + 50 hours**

### Evaluation Runs

- Full test set (500 Stage 1 + 300 Stage 2)
- Stage 1: 500 × $0.0001 = $0.05
- Stage 2: 300 × $0.015 = $4.50
- **Total per run: ~$5**
- 50 runs (model/prompt combinations): **$250**

### Continuous Evaluation

- Weekly runs: $5/week × 52 weeks = **$260/year**
- Production sampling (1%): ~$15/month = **$180/year**
- **Total ongoing cost: ~$450/year**

---

## References

- [FEVER Dataset](https://fever.ai/) - Fact Extraction and VERification dataset
- [PolitiFact API](https://www.politifact.com/) - Fact-checking database
- [Prompt Engineering Guide](https://www.promptingguide.ai/) - Best practices
- [OpenAI Evals](https://github.com/openai/evals) - Evaluation framework reference
- [Anthropic Claude Evals](https://www.anthropic.com/research) - Evaluation methodologies
