/**
 * Dataset schema definitions for evaluation framework.
 * 
 * Defines data structures for Stage 1 (claim detection) and Stage 2 (verification)
 * test samples with type safety.
 */

import { z } from 'zod';

// ===== Enums =====

export enum Platform {
  TWITTER = 'twitter',
  LINKEDIN = 'linkedin',
  FACEBOOK = 'facebook',
  ARTICLE = 'article',
  OTHER = 'other',
}

export enum Topic {
  POLITICS = 'politics',
  HEALTH = 'health',
  SCIENCE = 'science',
  BUSINESS = 'business',
  OTHER = 'other',
}

export enum Complexity {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
}

export enum Verdict {
  TRUE = 'true',
  FALSE = 'false',
  UNKNOWN = 'unknown',
}

export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

// ===== Zod Schemas =====

export const SourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  reliabilityScore: z.number().min(0).max(1),
  excerpt: z.string().optional(),
  accessDate: z.string().optional(),
});

export const Stage1SampleSchema = z.object({
  id: z.string(),
  text: z.string(),
  platform: z.nativeEnum(Platform),
  hasClaim: z.boolean(),
  claims: z.array(z.string()),
  annotator: z.string().default(''),
  confidence: z.number().min(0).max(1).default(1.0),
  metadata: z.record(z.any()).default({}),
});

export const Stage2SampleSchema = z.object({
  id: z.string(),
  claim: z.string(),
  verdict: z.nativeEnum(Verdict),
  confidence: z.number().min(0).max(1),
  sources: z.array(SourceSchema),
  explanation: z.string().default(''),
  reasoning: z.string().default(''),
  difficulty: z.nativeEnum(Difficulty).default(Difficulty.MEDIUM),
  topic: z.nativeEnum(Topic).default(Topic.OTHER),
  annotator: z.string().default(''),
  metadata: z.record(z.any()).default({}),
});

export const ModelPredictionSchema = z.object({
  sampleId: z.string(),
  prediction: z.union([z.boolean(), z.nativeEnum(Verdict), z.null()]),
  confidence: z.number().min(0).max(1),
  explanation: z.string().optional(),
  sources: z.array(SourceSchema).default([]),
  latency: z.number().default(0),
  cost: z.number().default(0),
  metadata: z.record(z.any()).default({}),
});

export const EvaluationResultSchema = z.object({
  runId: z.string(),
  timestamp: z.string(),
  model: z.string(),
  promptId: z.string(),
  dataset: z.string(),
  stage: z.union([z.literal(1), z.literal(2)]),
  metrics: z.record(z.any()),
  predictions: z.array(ModelPredictionSchema),
  config: z.record(z.any()).default({}),
});

// ===== TypeScript Types =====

export type Source = z.infer<typeof SourceSchema>;
export type Stage1Sample = z.infer<typeof Stage1SampleSchema>;
export type Stage2Sample = z.infer<typeof Stage2SampleSchema>;
export type ModelPrediction = z.infer<typeof ModelPredictionSchema>;
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

// ===== Validation Helpers =====

/**
 * Validate Stage 1 sample
 */
export function validateStage1Sample(data: unknown): Stage1Sample {
  const sample = Stage1SampleSchema.parse(data);
  
  // Ensure claims list is populated if hasClaim is true
  if (sample.hasClaim && sample.claims.length === 0) {
    throw new Error(`Sample ${sample.id} has hasClaim=true but no claims listed`);
  }
  
  return sample;
}

/**
 * Validate Stage 2 sample
 */
export function validateStage2Sample(data: unknown): Stage2Sample {
  const sample = Stage2SampleSchema.parse(data);
  
  // Validate sources for non-unknown verdicts
  if (sample.verdict !== Verdict.UNKNOWN && sample.sources.length === 0) {
    throw new Error(`Sample ${sample.id} has verdict ${sample.verdict} but no sources`);
  }
  
  return sample;
}

/**
 * Check dataset balance and return label distribution
 */
export function validateDatasetBalance<T extends { hasClaim?: boolean; verdict?: Verdict }>(
  samples: T[],
  labelField: 'hasClaim' | 'verdict'
): Record<string, { count: number; percentage: number }> {
  const counts: Record<string, number> = {};
  const total = samples.length;
  
  samples.forEach((sample) => {
    const label = String(sample[labelField]);
    counts[label] = (counts[label] || 0) + 1;
  });
  
  const result: Record<string, { count: number; percentage: number }> = {};
  Object.entries(counts).forEach(([label, count]) => {
    result[label] = {
      count,
      percentage: (count / total) * 100,
    };
  });
  
  return result;
}

/**
 * Export samples to JSONL format (one JSON object per line)
 */
export function exportToJsonl(samples: unknown[], filepath: string): void {
  const fs = require('fs');
  const lines = samples.map((sample) => JSON.stringify(sample)).join('\n');
  fs.writeFileSync(filepath, lines, 'utf-8');
}

/**
 * Load samples from JSONL format
 */
export function loadFromJsonl<T>(
  filepath: string,
  validator: (data: unknown) => T
): T[] {
  const fs = require('fs');
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());
  
  return lines.map((line) => {
    const data = JSON.parse(line);
    return validator(data);
  });
}
