#!/usr/bin/env tsx
/**
 * Quick annotation tool for hackathons.
 * 
 * Paste real social media posts and quickly label them.
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

interface Sample {
  id: string;
  text: string;
  platform: string;
  hasClaim: boolean;
  claims: string[];
  annotator: string;
  confidence: number;
  metadata: Record<string, any>;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function annotateSample(id: string): Promise<Sample | null> {
  console.log('\n' + '='.repeat(80));
  console.log(`Sample ${id}`);
  console.log('='.repeat(80));

  const text = await question('\nPaste social media post (or "done" to finish):\n> ');
  
  if (text.toLowerCase() === 'done') {
    return null;
  }

  const platform = await question('\nPlatform (twitter/facebook/reddit/instagram/tiktok):\n> ');
  
  const hasClaimInput = await question('\nHas factual claim? (y/n):\n> ');
  const hasClaim = hasClaimInput.toLowerCase() === 'y';

  let claims: string[] = [];
  if (hasClaim) {
    const claimText = await question('\nWhat is the claim? (press Enter if same as post):\n> ');
    claims = [claimText || text];
  }

  console.log('\n✓ Sample added');

  return {
    id,
    text,
    platform: platform || 'twitter',
    hasClaim,
    claims,
    annotator: 'manual',
    confidence: 1.0,
    metadata: {},
  };
}

async function main() {
  console.log('='.repeat(80));
  console.log('QUICK ANNOTATION TOOL');
  console.log('='.repeat(80));
  console.log();
  console.log('Paste social media posts and label them quickly.');
  console.log('Type "done" when finished.');
  console.log();

  const samples: Sample[] = [];
  let counter = 1;

  while (true) {
    const sample = await annotateSample(`manual_${String(counter).padStart(3, '0')}`);
    
    if (!sample) {
      break;
    }

    samples.push(sample);
    counter++;

    console.log(`\nTotal samples: ${samples.length}`);
  }

  if (samples.length === 0) {
    console.log('\nNo samples created. Exiting.');
    rl.close();
    return;
  }

  // Save
  const datasetsDir = path.join(process.cwd(), 'datasets');
  if (!fs.existsSync(datasetsDir)) {
    fs.mkdirSync(datasetsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const outputPath = path.join(datasetsDir, `stage1_manual_${timestamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(samples, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('DONE!');
  console.log('='.repeat(80));
  console.log(`\n✓ Created ${samples.length} samples`);
  console.log(`✓ Saved to: ${outputPath}`);
  
  const withClaims = samples.filter((s) => s.hasClaim).length;
  console.log(`\nStats:`);
  console.log(`  With claims:    ${withClaims}`);
  console.log(`  Without claims: ${samples.length - withClaims}`);
  console.log();

  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});
