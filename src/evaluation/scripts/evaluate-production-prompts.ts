#!/usr/bin/env tsx
/**
 * Evaluate production prompts from the extension against test datasets.
 *
 * This script extracts the actual prompts used in the extension and tests them
 * with the evaluation framework to measure their performance.
 */

import { DatasetManager } from '../dataset/dataset-manager';
import { ModelRunner } from '../models/model-runner';
import { Stage1Evaluator, printEvaluationReport } from '../evaluation/evaluators';
import * as path from 'path';

// ===== PRODUCTION PROMPTS FROM EXTENSION =====

/**
 * Stage 1 prompt from src/background/ai/providers/openai.ts
 * This is the actual prompt used in production for claim detection
 */
const PRODUCTION_STAGE1_PROMPT = `You are a fact-checking assistant specializing in claim detection.

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

async function main() {
  console.log('='.repeat(80));
  console.log('PRODUCTION PROMPT EVALUATION');
  console.log('='.repeat(80));
  console.log();
  console.log('This script evaluates the actual prompts used in the extension.');
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

  // Check if dataset exists
  let testData;

  try {
    testData = manager.loadStage1('stage1_example.json');
    console.log(`✓ Loaded ${testData.length} test samples from stage1_example.json`);
  } catch (error) {
    console.error('❌ No test dataset found. Please create one first:');
    console.error('   Run: npm run eval:example');
    console.error('   This will create example datasets automatically.');
    process.exit(1);
  }

  console.log();
  console.log('='.repeat(80));
  console.log('EVALUATING: Production Stage 1 Prompt (OpenAI GPT-4o-mini)');
  console.log('='.repeat(80));
  console.log();
  console.log('Prompt source: src/background/ai/providers/openai.ts');
  console.log('Model: gpt-4o-mini');
  console.log('Temperature: 0.3');
  console.log();

  // Estimate cost
  const estimate = runner.estimateCost('gpt-4o-mini', testData.length, 200, 100);
  console.log(`Estimated cost: $${estimate.totalCost.toFixed(4)}`);
  console.log(`Cost per sample: $${estimate.costPerSample.toFixed(6)}`);
  console.log();

  // Run evaluation
  console.log('Running inference...');
  const predictions = await runner.runBatch(
    'gpt-4o-mini',
    PRODUCTION_STAGE1_PROMPT,
    testData,
    { config: { temperature: 0.3 } } // Match production settings
  );

  console.log();
  console.log('Calculating metrics...');
  const metrics = evaluator.evaluate(predictions, testData);

  console.log();
  printEvaluationReport(1, metrics, 'Production Prompt (gpt-4o-mini)');

  // Summary
  console.log();
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log();
  console.log(`Accuracy:  ${(metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`Precision: ${(metrics.precision * 100).toFixed(1)}%`);
  console.log(`Recall:    ${(metrics.recall * 100).toFixed(1)}%`);
  console.log(`F1 Score:  ${(metrics.f1Score * 100).toFixed(1)}%`);
  console.log(`FPR:       ${(metrics.falsePositiveRate * 100).toFixed(1)}%`);
  console.log();
  console.log(`Mean Latency: ${metrics.meanLatency.toFixed(2)}s`);
  console.log(`P90 Latency:  ${metrics.p90Latency.toFixed(2)}s`);
  console.log(`Total Cost:   $${metrics.totalCost.toFixed(4)}`);
  console.log();

  // Recommendations
  console.log('='.repeat(80));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(80));
  console.log();

  if (metrics.f1Score >= 0.9) {
    console.log('✓ Excellent performance! Prompt is working very well.');
  } else if (metrics.f1Score >= 0.8) {
    console.log('✓ Good performance. Consider minor tweaks for improvement.');
  } else if (metrics.f1Score >= 0.7) {
    console.log('⚠ Moderate performance. Consider testing alternative prompts.');
  } else {
    console.log('❌ Low performance. Prompt needs significant improvement.');
  }

  if (metrics.falsePositiveRate > 0.1) {
    console.log('⚠ High false positive rate - prompt may be too aggressive.');
    console.log('  Consider: Testing the "conservative" prompt variant.');
  }

  if (metrics.falseNegativeRate > 0.1) {
    console.log('⚠ High false negative rate - prompt may be too strict.');
    console.log('  Consider: Testing the "detailed" prompt variant.');
  }

  console.log();
  console.log('Next steps:');
  console.log('1. Create a larger, more diverse test dataset (500+ samples)');
  console.log('2. Compare with alternative prompt variants');
  console.log('3. Test with different models (gpt-4o, claude-3-5-sonnet)');
  console.log('4. Analyze error patterns by platform and topic');
  console.log();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
