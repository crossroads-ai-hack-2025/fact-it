#!/usr/bin/env tsx
/**
 * Import External Dataset Script
 *
 * Downloads and transforms external fact-checking datasets to our format.
 * Supports: AVeriTeC, FEVER
 */

import * as fs from 'fs';
import * as path from 'path';
import { transformAVeriTeCDataset, filterAVeriTeCSamples, type AVeriTeCClaim } from '../adapters/averitec-adapter';
import { transformFEVERDataset, filterFEVERSamples, parseFEVERJsonl } from '../adapters/fever-adapter';
import { validateStage2Sample } from '../types/dataset-schema';

// ===== CLI Configuration =====

interface ImportConfig {
  dataset: 'averitec' | 'fever';
  inputPath: string;
  outputPath: string;
  maxSamples?: number;
  filterOptions?: {
    excludeUnknown?: boolean;
    balanceLabels?: boolean;
    minSources?: number;
  };
}

// ===== Helper Functions =====

/**
 * Print usage instructions
 */
function printUsage() {
  console.log(`
Usage: tsx src/evaluation/scripts/import-external-dataset.ts <dataset> <input-file> [options]

Datasets:
  averitec    AVeriTeC dataset (JSON format)
  fever       FEVER dataset (JSONL format)

Options:
  --output <path>         Output file path (default: datasets/<dataset>_imported.json)
  --max-samples <n>       Maximum number of samples to import (default: all)
  --exclude-unknown       Exclude samples with "unknown" verdict
  --balance-labels        Balance true/false/unknown labels
  --min-sources <n>       Minimum number of sources per sample (default: 1)

Examples:
  # Import AVeriTeC dataset
  tsx src/evaluation/scripts/import-external-dataset.ts averitec ./data/averitec_train.json

  # Import FEVER dataset with filtering
  tsx src/evaluation/scripts/import-external-dataset.ts fever ./data/fever_train.jsonl --max-samples 1000 --balance-labels

  # Import with custom output path
  tsx src/evaluation/scripts/import-external-dataset.ts averitec ./data/averitec.json --output datasets/stage2_averitec.json
  `);
}

/**
 * Parse command line arguments
 */
function parseArgs(): ImportConfig | null {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    return null;
  }

  const dataset = args[0].toLowerCase();
  if (dataset !== 'averitec' && dataset !== 'fever') {
    console.error(`Error: Unknown dataset "${dataset}". Must be "averitec" or "fever".`);
    return null;
  }

  const inputPath = args[1];
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    return null;
  }

  // Parse options
  const config: ImportConfig = {
    dataset: dataset as 'averitec' | 'fever',
    inputPath,
    outputPath: path.join(process.cwd(), 'datasets', `${dataset}_imported.json`),
    filterOptions: {},
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--output' && i + 1 < args.length) {
      config.outputPath = args[i + 1];
      i++;
    } else if (arg === '--max-samples' && i + 1 < args.length) {
      config.maxSamples = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--exclude-unknown') {
      config.filterOptions!.excludeUnknown = true;
    } else if (arg === '--balance-labels') {
      config.filterOptions!.balanceLabels = true;
    } else if (arg === '--min-sources' && i + 1 < args.length) {
      config.filterOptions!.minSources = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return config;
}

/**
 * Print dataset statistics
 */
function printStats(samples: any[]) {
  const verdictCounts: Record<string, number> = {};
  const topicCounts: Record<string, number> = {};
  const difficultyCounts: Record<string, number> = {};
  let totalSources = 0;

  for (const sample of samples) {
    // Verdict distribution
    verdictCounts[sample.verdict] = (verdictCounts[sample.verdict] || 0) + 1;

    // Topic distribution
    topicCounts[sample.topic] = (topicCounts[sample.topic] || 0) + 1;

    // Difficulty distribution
    difficultyCounts[sample.difficulty] = (difficultyCounts[sample.difficulty] || 0) + 1;

    // Source count
    totalSources += sample.sources.length;
  }

  console.log('\nDataset Statistics:');
  console.log('='.repeat(60));
  console.log(`Total samples: ${samples.length}`);
  console.log();

  console.log('Verdict distribution:');
  for (const [verdict, count] of Object.entries(verdictCounts)) {
    const percentage = ((count / samples.length) * 100).toFixed(1);
    console.log(`  ${verdict.padEnd(10)}: ${count} (${percentage}%)`);
  }
  console.log();

  console.log('Topic distribution:');
  for (const [topic, count] of Object.entries(topicCounts)) {
    const percentage = ((count / samples.length) * 100).toFixed(1);
    console.log(`  ${topic.padEnd(10)}: ${count} (${percentage}%)`);
  }
  console.log();

  console.log('Difficulty distribution:');
  for (const [difficulty, count] of Object.entries(difficultyCounts)) {
    const percentage = ((count / samples.length) * 100).toFixed(1);
    console.log(`  ${difficulty.padEnd(10)}: ${count} (${percentage}%)`);
  }
  console.log();

  const avgSources = (totalSources / samples.length).toFixed(1);
  console.log(`Average sources per sample: ${avgSources}`);
  console.log('='.repeat(60));
}

// ===== Import Functions =====

/**
 * Import AVeriTeC dataset
 */
async function importAVeriTeC(config: ImportConfig) {
  console.log('Loading AVeriTeC dataset...');
  console.log(`Input: ${config.inputPath}`);
  console.log();

  // Read JSON file
  const content = fs.readFileSync(config.inputPath, 'utf-8');
  const rawData = JSON.parse(content);

  // Handle both array format and object with "data" field
  let claims: AVeriTeCClaim[];
  if (Array.isArray(rawData)) {
    claims = rawData;
  } else if (rawData.data && Array.isArray(rawData.data)) {
    claims = rawData.data;
  } else {
    throw new Error('Unexpected AVeriTeC format. Expected array or object with "data" field.');
  }

  console.log(`Found ${claims.length} claims in input file`);

  // Limit if specified
  if (config.maxSamples && config.maxSamples < claims.length) {
    claims = claims.slice(0, config.maxSamples);
    console.log(`Limited to ${config.maxSamples} samples`);
  }

  // Transform
  console.log('Transforming to Stage2Sample format...');
  let samples = transformAVeriTeCDataset(claims);
  console.log(`Transformed ${samples.length} samples`);

  // Filter
  if (config.filterOptions && Object.keys(config.filterOptions).length > 0) {
    console.log('Applying filters...');
    const beforeFilter = samples.length;
    samples = filterAVeriTeCSamples(samples, config.filterOptions);
    console.log(`Filtered: ${beforeFilter} → ${samples.length} samples`);
  }

  return samples;
}

/**
 * Import FEVER dataset
 */
async function importFEVER(config: ImportConfig) {
  console.log('Loading FEVER dataset...');
  console.log(`Input: ${config.inputPath}`);
  console.log();

  // Read JSONL file
  const content = fs.readFileSync(config.inputPath, 'utf-8');
  let claims = parseFEVERJsonl(content);

  console.log(`Found ${claims.length} claims in input file`);

  // Limit if specified
  if (config.maxSamples && config.maxSamples < claims.length) {
    claims = claims.slice(0, config.maxSamples);
    console.log(`Limited to ${config.maxSamples} samples`);
  }

  // Transform
  console.log('Transforming to Stage2Sample format...');
  let samples = transformFEVERDataset(claims);
  console.log(`Transformed ${samples.length} samples`);

  // Filter
  if (config.filterOptions && Object.keys(config.filterOptions).length > 0) {
    console.log('Applying filters...');
    const beforeFilter = samples.length;
    samples = filterFEVERSamples(samples, {
      requireEvidence: true,
      ...config.filterOptions,
    });
    console.log(`Filtered: ${beforeFilter} → ${samples.length} samples`);
  }

  return samples;
}

// ===== Main =====

async function main() {
  console.log('='.repeat(80));
  console.log('EXTERNAL DATASET IMPORT');
  console.log('='.repeat(80));
  console.log();

  const config = parseArgs();

  if (!config) {
    printUsage();
    process.exit(1);
  }

  try {
    // Import based on dataset type
    let samples;
    if (config.dataset === 'averitec') {
      samples = await importAVeriTeC(config);
    } else if (config.dataset === 'fever') {
      samples = await importFEVER(config);
    } else {
      throw new Error(`Unknown dataset: ${config.dataset}`);
    }

    // Validate samples
    console.log('Validating samples...');
    const validatedSamples = [];
    let errorCount = 0;

    for (const sample of samples) {
      try {
        const validated = validateStage2Sample(sample);
        validatedSamples.push(validated);
      } catch (error) {
        errorCount++;
        if (errorCount <= 5) {
          console.error(`Validation error for sample ${sample.id}:`, error);
        }
      }
    }

    if (errorCount > 5) {
      console.error(`... and ${errorCount - 5} more validation errors`);
    }

    console.log(`Validated: ${validatedSamples.length} samples (${errorCount} errors)`);
    console.log();

    if (validatedSamples.length === 0) {
      console.error('Error: No valid samples after transformation and validation.');
      process.exit(1);
    }

    // Print statistics
    printStats(validatedSamples);

    // Save to file
    console.log();
    console.log(`Saving to ${config.outputPath}...`);

    const outputDir = path.dirname(config.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(config.outputPath, JSON.stringify(validatedSamples, null, 2));

    console.log('✓ Import complete!');
    console.log();
    console.log('Next steps:');
    console.log(`1. Review the dataset: cat ${config.outputPath} | head`);
    console.log(`2. Run evaluation: npm run eval:production`);
    console.log(`3. Compare prompts: npm run eval:compare`);
  } catch (error) {
    console.error('Error during import:', error);
    process.exit(1);
  }
}

main();
