#!/usr/bin/env tsx
/**
 * Generate synthetic dataset using LLM for hackathon/rapid prototyping.
 * 
 * This creates realistic test data quickly without manual annotation.
 */

import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

const Stage1SampleSchema = z.object({
  samples: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      platform: z.enum(['twitter', 'facebook', 'reddit', 'instagram', 'tiktok']),
      hasClaim: z.boolean(),
      claims: z.array(z.string()),
      confidence: z.number(),
    })
  ),
});

async function generateStage1Dataset(count: number = 50) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set');
  }

  console.log(`Generating ${count} Stage 1 samples...`);

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `Generate ${count} diverse social media posts for fact-checking evaluation.

Create a balanced mix:
- 50% WITH factual claims (hasClaim: true)
- 50% WITHOUT claims - opinions, questions, jokes (hasClaim: false)

For posts WITH claims, include:
- Specific numbers, dates, statistics
- Claims about public figures, companies, events
- Scientific or health claims
- Historical facts
- Mix of TRUE and FALSE claims

For posts WITHOUT claims, include:
- Pure opinions ("I think...", "X is beautiful")
- Questions
- Jokes and sarcasm
- Personal preferences
- Emotional expressions

Vary platforms: twitter, facebook, reddit, instagram, tiktok
Make them realistic - use casual language, typos, emojis occasionally.

Examples:
✓ "Biden signed 50 executive orders in his first week" (has claim)
✓ "The iPhone 15 costs $799" (has claim)
✗ "I love this new phone!" (no claim - opinion)
✗ "What do you think about climate change?" (no claim - question)
✓ "Scientists discovered a new planet 100 light years away" (has claim)
✗ "This movie is trash lol" (no claim - opinion)

Return ${count} samples with realistic variety.`;

  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: Stage1SampleSchema,
    prompt,
    temperature: 0.9, // High creativity for diversity
  });

  // Add metadata
  const samples = object.samples.map((s, i) => ({
    ...s,
    id: `gen_${String(i + 1).padStart(3, '0')}`,
    annotator: 'gpt-4o-synthetic',
    metadata: {},
  }));

  return samples;
}

async function main() {
  console.log('='.repeat(80));
  console.log('SYNTHETIC DATASET GENERATOR');
  console.log('='.repeat(80));
  console.log();

  const count = parseInt(process.argv[2] || '100');
  console.log(`Generating ${count} samples...`);
  console.log();

  const samples = await generateStage1Dataset(count);

  // Save to file
  const datasetsDir = path.join(process.cwd(), 'datasets');
  if (!fs.existsSync(datasetsDir)) {
    fs.mkdirSync(datasetsDir, { recursive: true });
  }

  const outputPath = path.join(datasetsDir, 'stage1_synthetic.json');
  fs.writeFileSync(outputPath, JSON.stringify(samples, null, 2));

  console.log(`✓ Generated ${samples.length} samples`);
  console.log(`✓ Saved to: ${outputPath}`);
  console.log();

  // Stats
  const withClaims = samples.filter((s) => s.hasClaim).length;
  const withoutClaims = samples.length - withClaims;
  const platforms = [...new Set(samples.map((s) => s.platform))];

  console.log('Dataset stats:');
  console.log(`  With claims:    ${withClaims} (${((withClaims / samples.length) * 100).toFixed(1)}%)`);
  console.log(`  Without claims: ${withoutClaims} (${((withoutClaims / samples.length) * 100).toFixed(1)}%)`);
  console.log(`  Platforms:      ${platforms.join(', ')}`);
  console.log();

  console.log('Next steps:');
  console.log('1. Review the generated dataset (spot check quality)');
  console.log('2. Run: npm run eval:production');
  console.log('3. Run: npm run eval:compare');
  console.log();
  console.log('To generate more samples:');
  console.log(`  tsx src/evaluation/scripts/generate-synthetic-dataset.ts 200`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
