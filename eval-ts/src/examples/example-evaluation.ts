#!/usr/bin/env tsx
/**
 * Example evaluation script demonstrating the complete evaluation workflow.
 */

import { DatasetManager, createExampleDatasets } from '../dataset/dataset-manager.js';
import { ModelRunner, checkApiKeys } from '../models/model-runner.js';
import { Stage1Evaluator, Stage2Evaluator, printEvaluationReport } from '../evaluation/evaluators.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('='.repeat(70));
  console.log('FACT-IT EVALUATION FRAMEWORK - EXAMPLE SCRIPT');
  console.log('='.repeat(70));
  
  // Check API keys
  const keys = checkApiKeys();
  console.log('\nAPI Keys Status:');
  console.log(`  OpenAI:    ${keys.openai ? '✓' : '✗'}`);
  console.log(`  Anthropic: ${keys.anthropic ? '✓' : '✗'}`);
  console.log(`  Google:    ${keys.google ? '✓' : '✗'}`);
  
  if (!keys.openai) {
    console.log('\n⚠️  OPENAI_API_KEY not set. Set it with:');
    console.log('   export OPENAI_API_KEY="your-key-here"');
    process.exit(1);
  }
  
  // Setup
  const datasetsDir = path.join(process.cwd(), 'datasets');
  const manager = new DatasetManager(datasetsDir);
  
  // Create example datasets if they don't exist
  const stage1Path = path.join(datasetsDir, 'stage1_example.json');
  if (!fs.existsSync(stage1Path)) {
    console.log('\nCreating example datasets...');
    createExampleDatasets(datasetsDir);
  }
  
  // Run Stage 1 evaluation
  await runStage1Example(manager);
  
  // Ask if user wants to run Stage 2 (costs money)
  console.log('\n' + '='.repeat(70));
  console.log('Stage 2 evaluation uses GPT-4o and will incur costs (~$0.02)');
  console.log('To run Stage 2, set RUN_STAGE2=true environment variable');
  
  if (process.env.RUN_STAGE2 === 'true') {
    await runStage2Example(manager);
  }
}

async function runStage1Example(manager: DatasetManager) {
  console.log('\n' + '='.repeat(70));
  console.log('STAGE 1: CLAIM DETECTION EVALUATION');
  console.log('='.repeat(70));
  
  // Load dataset
  console.log('\nLoading test dataset...');
  const testData = manager.loadStage1('stage1_example.json');
  
  if (testData.length === 0) {
    console.log('⚠️  No test data found');
    return;
  }
  
  // Initialize
  const runner = new ModelRunner();
  const registry = new PromptRegistry();
  const evaluator = new Stage1Evaluator();
  
  // Get prompt
  const prompt = registry.getPrompt('stage1_baseline', 1);
  if (!prompt) {
    console.log('⚠️  Prompt not found');
    return;
  }
  
  console.log(`Using prompt: ${prompt.name} (v${prompt.version})`);
  
  // Estimate cost
  const costEst = runner.estimateCost('gpt-4o-mini', testData.length, 300, 100);
  console.log(`\nEstimated cost: $${costEst.totalCost.toFixed(4)}`);
  
  // Run inference
  console.log(`\nRunning inference with gpt-4o-mini...`);
  const predictions = await runner.runBatch('gpt-4o-mini', prompt.systemPrompt, testData, {
    maxConcurrency: 2,
    showProgress: true,
  });
  
  // Evaluate
  console.log('\nCalculating metrics...');
  const metrics = evaluator.evaluate(predictions, testData);
  
  // Print report
  printEvaluationReport(1, metrics, 'GPT-4o-mini (baseline)');
  
  // Show sample predictions
  console.log('='.repeat(70));
  console.log('SAMPLE PREDICTIONS');
  console.log('='.repeat(70));
  
  for (let i = 0; i < Math.min(3, predictions.length); i++) {
    const pred = predictions[i];
    const sample = testData[i];
    
    console.log(`\nSample ${i + 1}:`);
    console.log(`  Text: ${sample.text.substring(0, 80)}...`);
    console.log(`  Ground Truth: ${sample.hasClaim ? 'HAS CLAIM' : 'NO CLAIM'}`);
    console.log(`  Prediction: ${pred.prediction ? 'HAS CLAIM' : 'NO CLAIM'}`);
    console.log(`  Confidence: ${pred.confidence.toFixed(2)}`);
    console.log(`  Correct: ${pred.prediction === sample.hasClaim ? '✓' : '✗'}`);
  }
}

async function runStage2Example(manager: DatasetManager) {
  console.log('\n' + '='.repeat(70));
  console.log('STAGE 2: VERIFICATION EVALUATION');
  console.log('='.repeat(70));
  
  // Load dataset
  console.log('\nLoading test dataset...');
  const testData = manager.loadStage2('stage2_example.json');
  
  if (testData.length === 0) {
    console.log('⚠️  No test data found');
    return;
  }
  
  // Initialize
  const runner = new ModelRunner();
  const registry = new PromptRegistry();
  const evaluator = new Stage2Evaluator();
  
  // Get prompt
  const prompt = registry.getPrompt('stage2_baseline', 2);
  if (!prompt) {
    console.log('⚠️  Prompt not found');
    return;
  }
  
  console.log(`Using prompt: ${prompt.name} (v${prompt.version})`);
  
  // Estimate cost
  const costEst = runner.estimateCost('gpt-4o', testData.length, 2000, 200);
  console.log(`\nEstimated cost: $${costEst.totalCost.toFixed(4)}`);
  
  // Run inference
  console.log(`\nRunning inference with gpt-4o...`);
  const predictions = await runner.runBatch('gpt-4o', prompt.systemPrompt, testData, {
    maxConcurrency: 2,
    showProgress: true,
  });
  
  // Evaluate
  console.log('\nCalculating metrics...');
  const metrics = evaluator.evaluate(predictions, testData);
  
  // Print report
  printEvaluationReport(2, metrics, 'GPT-4o (baseline)');
  
  // Show sample predictions
  console.log('='.repeat(70));
  console.log('SAMPLE PREDICTIONS');
  console.log('='.repeat(70));
  
  for (let i = 0; i < Math.min(2, predictions.length); i++) {
    const pred = predictions[i];
    const sample = testData[i];
    
    console.log(`\nSample ${i + 1}:`);
    console.log(`  Claim: ${sample.claim.substring(0, 80)}...`);
    console.log(`  Ground Truth: ${sample.verdict.toUpperCase()}`);
    console.log(`  Prediction: ${String(pred.prediction).toUpperCase()}`);
    console.log(`  Confidence: ${pred.confidence.toFixed(2)}`);
    console.log(`  Correct: ${String(pred.prediction).toLowerCase() === sample.verdict ? '✓' : '✗'}`);
    if (pred.explanation) {
      console.log(`  Explanation: ${pred.explanation.substring(0, 100)}...`);
    }
  }
}

main().catch((error) => {
  console.error('\nError:', error);
  process.exit(1);
});
