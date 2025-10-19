#!/usr/bin/env tsx
/**
 * Compare production prompts against alternative variants.
 * 
 * This script helps you A/B test different prompt formulations to find
 * the best performing one before deploying to production.
 */

import { DatasetManager } from '../dataset/dataset-manager';
import { ModelRunner } from '../models/model-runner';
import { Stage1Evaluator } from '../evaluation/evaluators';
import { PromptRegistry } from '../prompts/prompt-registry';
import * as path from 'path';

// Production prompt from extension
const PRODUCTION_PROMPT = `You are a fact-checking assistant specializing in claim detection.

Your task: Analyze text and identify specific factual claims that can be objectively verified.

INCLUDE:
- Statements about verifiable facts (dates, numbers, events, scientific claims)
- Historical claims that can be checked against records
- Statistical claims with specific numbers or data
- Claims about public figures' actions, statements, or positions
- Claims about companies, organizations, policies
- Claims about current events with verifiable details

EXCLUDE:
- Pure opinions and subjective judgments ("I think...", "in my opinion...")
- Questions without factual assertions
- Predictions about the future (unless claiming historical precedent)
- Personal preferences ("I like...", "X is beautiful")
- General commentary without specific verifiable assertions
- Expressions of emotion or sentiment
- Hypotheticals and conditionals without factual basis

EXAMPLES:
✓ "The Eiffel Tower is 330 meters tall" → HAS CLAIM (verifiable measurement)
✓ "Biden signed an executive order on climate change in 2021" → HAS CLAIM (verifiable event)
✗ "I think climate change is the biggest threat" → NO CLAIM (opinion)
✗ "What will happen if we don't act?" → NO CLAIM (question)
✓ "Scientists have found evidence of water on Mars" → HAS CLAIM (verifiable scientific finding)
✗ "This is the best solution" → NO CLAIM (subjective judgment)

Be conservative: only identify claims that can be fact-checked against reliable sources.`;

interface ComparisonResult {
  name: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  fpr: number;
  fnr: number;
  latency: number;
  cost: number;
}

async function main() {
  console.log('='.repeat(80));
  console.log('PROMPT COMPARISON TOOL');
  console.log('='.repeat(80));
  console.log();

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set. Please set it:');
    console.error('   export OPENAI_API_KEY="your-key"');
    process.exit(1);
  }

  // Setup
  const datasetsDir = path.join(process.cwd(), 'datasets');
  const manager = new DatasetManager(datasetsDir);
  const runner = new ModelRunner();
  const evaluator = new Stage1Evaluator();
  const registry = new PromptRegistry();

  // Load test data
  let testData;
  try {
    testData = manager.loadStage1('stage1_example.json');
    console.log(`✓ Loaded ${testData.length} test samples`);
  } catch (error) {
    console.error('❌ No test dataset found. Run: npm run eval:example');
    process.exit(1);
  }

  console.log();
  console.log('Testing prompts:');
  console.log('  1. Production (current extension prompt)');
  console.log('  2. Baseline (evaluation framework)');
  console.log('  3. Detailed (more explicit criteria)');
  console.log('  4. Conservative (fewer false positives)');
  console.log();

  const model = 'gpt-4o-mini';
  const results: ComparisonResult[] = [];

  // Test 1: Production prompt
  console.log('='.repeat(80));
  console.log('[1/4] Testing: Production Prompt');
  console.log('='.repeat(80));
  const prod = await runner.runBatch(model, PRODUCTION_PROMPT, testData, { config: { temperature: 0.3 } });
  const prodMetrics = evaluator.evaluate(prod, testData);
  results.push({
    name: 'Production',
    accuracy: prodMetrics.accuracy,
    precision: prodMetrics.precision,
    recall: prodMetrics.recall,
    f1Score: prodMetrics.f1Score,
    fpr: prodMetrics.falsePositiveRate,
    fnr: prodMetrics.falseNegativeRate,
    latency: prodMetrics.meanLatency,
    cost: prodMetrics.totalCost,
  });
  console.log(`F1: ${prodMetrics.f1Score.toFixed(3)}, Cost: $${prodMetrics.totalCost.toFixed(4)}`);
  console.log();

  // Test 2: Baseline
  console.log('='.repeat(80));
  console.log('[2/4] Testing: Baseline Prompt');
  console.log('='.repeat(80));
  const baseline = registry.getPrompt('stage1_baseline', 1);
  const baselinePred = await runner.runBatch(model, baseline!.systemPrompt, testData, { config: { temperature: 0.3 } });
  const baselineMetrics = evaluator.evaluate(baselinePred, testData);
  results.push({
    name: 'Baseline',
    accuracy: baselineMetrics.accuracy,
    precision: baselineMetrics.precision,
    recall: baselineMetrics.recall,
    f1Score: baselineMetrics.f1Score,
    fpr: baselineMetrics.falsePositiveRate,
    fnr: baselineMetrics.falseNegativeRate,
    latency: baselineMetrics.meanLatency,
    cost: baselineMetrics.totalCost,
  });
  console.log(`F1: ${baselineMetrics.f1Score.toFixed(3)}, Cost: $${baselineMetrics.totalCost.toFixed(4)}`);
  console.log();

  // Test 3: Detailed
  console.log('='.repeat(80));
  console.log('[3/4] Testing: Detailed Prompt');
  console.log('='.repeat(80));
  const detailed = registry.getPrompt('stage1_detailed_v1', 1);
  const detailedPred = await runner.runBatch(model, detailed!.systemPrompt, testData, { config: { temperature: 0.3 } });
  const detailedMetrics = evaluator.evaluate(detailedPred, testData);
  results.push({
    name: 'Detailed',
    accuracy: detailedMetrics.accuracy,
    precision: detailedMetrics.precision,
    recall: detailedMetrics.recall,
    f1Score: detailedMetrics.f1Score,
    fpr: detailedMetrics.falsePositiveRate,
    fnr: detailedMetrics.falseNegativeRate,
    latency: detailedMetrics.meanLatency,
    cost: detailedMetrics.totalCost,
  });
  console.log(`F1: ${detailedMetrics.f1Score.toFixed(3)}, Cost: $${detailedMetrics.totalCost.toFixed(4)}`);
  console.log();

  // Test 4: Conservative
  console.log('='.repeat(80));
  console.log('[4/4] Testing: Conservative Prompt');
  console.log('='.repeat(80));
  const conservative = registry.getPrompt('stage1_conservative_v1', 1);
  const conservativePred = await runner.runBatch(model, conservative!.systemPrompt, testData, { config: { temperature: 0.3 } });
  const conservativeMetrics = evaluator.evaluate(conservativePred, testData);
  results.push({
    name: 'Conservative',
    accuracy: conservativeMetrics.accuracy,
    precision: conservativeMetrics.precision,
    recall: conservativeMetrics.recall,
    f1Score: conservativeMetrics.f1Score,
    fpr: conservativeMetrics.falsePositiveRate,
    fnr: conservativeMetrics.falseNegativeRate,
    latency: conservativeMetrics.meanLatency,
    cost: conservativeMetrics.totalCost,
  });
  console.log(`F1: ${conservativeMetrics.f1Score.toFixed(3)}, Cost: $${conservativeMetrics.totalCost.toFixed(4)}`);
  console.log();

  // Comparison table
  console.log('='.repeat(80));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(80));
  console.log();
  console.log('Prompt         | Accuracy | Precision | Recall | F1     | FPR    | Latency | Cost');
  console.log('---------------|----------|-----------|--------|--------|--------|---------|--------');
  
  results.forEach(r => {
    const name = r.name.padEnd(14);
    const acc = (r.accuracy * 100).toFixed(1).padStart(6) + '%';
    const prec = (r.precision * 100).toFixed(1).padStart(7) + '%';
    const rec = (r.recall * 100).toFixed(1).padStart(4) + '%';
    const f1 = (r.f1Score * 100).toFixed(1).padStart(4) + '%';
    const fpr = (r.fpr * 100).toFixed(1).padStart(4) + '%';
    const lat = r.latency.toFixed(2).padStart(5) + 's';
    const cost = '$' + r.cost.toFixed(4);
    console.log(`${name} | ${acc} | ${prec} | ${rec} | ${f1} | ${fpr} | ${lat} | ${cost}`);
  });

  console.log();

  // Winner
  const bestF1 = results.reduce((best, r) => r.f1Score > best.f1Score ? r : best);
  const bestPrecision = results.reduce((best, r) => r.precision > best.precision ? r : best);
  const lowestFPR = results.reduce((best, r) => r.fpr < best.fpr ? r : best);

  console.log('='.repeat(80));
  console.log('WINNERS');
  console.log('='.repeat(80));
  console.log();
  console.log(`🏆 Best F1 Score:    ${bestF1.name} (${(bestF1.f1Score * 100).toFixed(1)}%)`);
  console.log(`🎯 Best Precision:   ${bestPrecision.name} (${(bestPrecision.precision * 100).toFixed(1)}%)`);
  console.log(`✓  Lowest FPR:       ${lowestFPR.name} (${(lowestFPR.fpr * 100).toFixed(1)}%)`);
  console.log();

  // Recommendations
  console.log('='.repeat(80));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(80));
  console.log();

  if (bestF1.name !== 'Production') {
    console.log(`⚠️  Consider switching to "${bestF1.name}" prompt for better F1 score`);
    console.log(`   Improvement: ${((bestF1.f1Score - results[0].f1Score) * 100).toFixed(1)}% higher F1`);
  } else {
    console.log('✓ Production prompt is performing best overall');
  }

  if (lowestFPR.name !== 'Production' && results[0].fpr > 0.1) {
    console.log(`⚠️  High false positive rate in production (${(results[0].fpr * 100).toFixed(1)}%)`);
    console.log(`   Consider "${lowestFPR.name}" to reduce false positives`);
  }

  console.log();
  console.log('Next steps:');
  console.log('1. Test winner on a larger dataset (500+ samples)');
  console.log('2. Analyze specific failure cases');
  console.log('3. Consider A/B testing in production');
  console.log();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
