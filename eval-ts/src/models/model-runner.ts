/**
 * Model Runner - Unified interface for AI models using Vercel AI SDK.
 * 
 * Supports OpenAI, Anthropic, Google, and other providers through AI SDK.
 */

import { generateObject, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import {
  Stage1Sample,
  Stage2Sample,
  ModelPrediction,
  Verdict,
  Source,
} from '../types/dataset-schema.js';

// ===== Model Configuration =====

export interface ModelConfig {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface ModelCosts {
  inputCostPer1M: number;
  outputCostPer1M: number;
}

// Pricing as of January 2024 (USD per 1M tokens)
const MODEL_PRICING: Record<string, ModelCosts> = {
  // OpenAI
  'gpt-4o-mini': { inputCostPer1M: 0.15, outputCostPer1M: 0.60 },
  'gpt-4o': { inputCostPer1M: 2.50, outputCostPer1M: 10.00 },
  'gpt-4o-2024-08-06': { inputCostPer1M: 2.50, outputCostPer1M: 10.00 },
  'o1-preview': { inputCostPer1M: 15.00, outputCostPer1M: 60.00 },
  'o1-mini': { inputCostPer1M: 3.00, outputCostPer1M: 12.00 },
  'gpt-4-turbo': { inputCostPer1M: 10.00, outputCostPer1M: 30.00 },
  
  // Anthropic
  'claude-3-5-sonnet-20241022': { inputCostPer1M: 3.00, outputCostPer1M: 15.00 },
  'claude-3-5-sonnet-20240620': { inputCostPer1M: 3.00, outputCostPer1M: 15.00 },
  'claude-3-opus-20240229': { inputCostPer1M: 15.00, outputCostPer1M: 75.00 },
  'claude-3-sonnet-20240229': { inputCostPer1M: 3.00, outputCostPer1M: 15.00 },
  'claude-3-haiku-20240307': { inputCostPer1M: 0.25, outputCostPer1M: 1.25 },
  
  // Google
  'gemini-1.5-flash': { inputCostPer1M: 0.075, outputCostPer1M: 0.30 },
  'gemini-1.5-pro': { inputCostPer1M: 1.25, outputCostPer1M: 5.00 },
};

// ===== Schemas for AI Responses =====

const Stage1ResponseSchema = z.object({
  hasClaim: z.boolean(),
  claims: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const Stage2ResponseSchema = z.object({
  verdict: z.enum(['true', 'false', 'unknown']),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  sources: z.array(z.object({
    url: z.string(),
    title: z.string(),
    reliabilityScore: z.number().min(0).max(1).optional().default(0.7),
  })),
  reasoning: z.string().optional(),
});

// ===== Model Runner =====

export class ModelRunner {
  private openaiKey: string | null = null;
  private anthropicKey: string | null = null;
  private googleKey: string | null = null;
  
  constructor(options: {
    openaiKey?: string;
    anthropicKey?: string;
    googleKey?: string;
  } = {}) {
    this.openaiKey = options.openaiKey || process.env.OPENAI_API_KEY || null;
    this.anthropicKey = options.anthropicKey || process.env.ANTHROPIC_API_KEY || null;
    this.googleKey = options.googleKey || process.env.GOOGLE_API_KEY || null;
  }
  
  /**
   * Run single inference
   */
  async runSingle(
    model: string,
    prompt: string,
    sample: Stage1Sample | Stage2Sample,
    config: ModelConfig = {}
  ): Promise<ModelPrediction> {
    const startTime = Date.now();
    const sampleId = sample.id;
    
    try {
      // Determine stage from sample type
      const isStage1 = 'hasClaim' in sample;
      
      // Get model provider
      const provider = this.getProvider(model);
      
      // Prepare input text
      const inputText = isStage1 ? (sample as Stage1Sample).text : (sample as Stage2Sample).claim;
      
      // Run inference based on stage
      let result: any;
      let usage: any;
      
      if (isStage1) {
        // Stage 1: Claim Detection
        const response = await generateObject({
          model: provider(model),
          schema: Stage1ResponseSchema,
          system: prompt,
          prompt: inputText,
          temperature: config.temperature ?? 0.3,
          maxTokens: config.maxTokens ?? 1024,
        });
        
        result = response.object;
        usage = response.usage;
      } else {
        // Stage 2: Verification
        const response = await generateObject({
          model: provider(model),
          schema: Stage2ResponseSchema,
          system: prompt,
          prompt: `Verify this claim: ${inputText}`,
          temperature: config.temperature ?? 0.5,
          maxTokens: config.maxTokens ?? 2048,
        });
        
        result = response.object;
        usage = response.usage;
      }
      
      const latency = (Date.now() - startTime) / 1000;
      const cost = this.calculateCost(model, usage.promptTokens, usage.completionTokens);
      
      // Format prediction
      const prediction: ModelPrediction = {
        sampleId,
        prediction: isStage1 ? result.hasClaim : result.verdict,
        confidence: result.confidence,
        explanation: result.explanation || result.reasoning,
        sources: result.sources || [],
        latency,
        cost,
        metadata: {
          model,
          tokensUsed: usage.totalTokens,
          success: true,
        },
      };
      
      return prediction;
    } catch (error) {
      const latency = (Date.now() - startTime) / 1000;
      
      return {
        sampleId,
        prediction: null,
        confidence: 0,
        sources: [],
        latency,
        cost: 0,
        metadata: {
          model,
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false,
        },
      };
    }
  }
  
  /**
   * Run batch inference with parallel execution
   */
  async runBatch(
    model: string,
    prompt: string,
    samples: (Stage1Sample | Stage2Sample)[],
    options: {
      maxConcurrency?: number;
      showProgress?: boolean;
      config?: ModelConfig;
    } = {}
  ): Promise<ModelPrediction[]> {
    const { maxConcurrency = 5, showProgress = true, config = {} } = options;
    
    if (showProgress) {
      console.log(`Processing ${samples.length} samples with ${model}...`);
    }
    
    const predictions: ModelPrediction[] = [];
    const batches: (Stage1Sample | Stage2Sample)[][] = [];
    
    // Split into batches
    for (let i = 0; i < samples.length; i += maxConcurrency) {
      batches.push(samples.slice(i, i + maxConcurrency));
    }
    
    // Process batches
    let completed = 0;
    for (const batch of batches) {
      const batchPromises = batch.map((sample) =>
        this.runSingle(model, prompt, sample, config)
      );
      
      const batchResults = await Promise.all(batchPromises);
      predictions.push(...batchResults);
      
      completed += batch.length;
      if (showProgress) {
        console.log(`Progress: ${completed}/${samples.length}`);
      }
    }
    
    return predictions;
  }
  
  /**
   * Get provider for model
   */
  private getProvider(model: string): any {
    const modelLower = model.toLowerCase();
    
    if (modelLower.includes('gpt') || modelLower.includes('o1')) {
      if (!this.openaiKey) {
        throw new Error('OpenAI API key not provided');
      }
      return createOpenAI({ apiKey: this.openaiKey });
    } else if (modelLower.includes('claude')) {
      if (!this.anthropicKey) {
        throw new Error('Anthropic API key not provided');
      }
      return createAnthropic({ apiKey: this.anthropicKey });
    } else if (modelLower.includes('gemini')) {
      if (!this.googleKey) {
        throw new Error('Google API key not provided');
      }
      return createGoogleGenerativeAI({ apiKey: this.googleKey });
    } else {
      throw new Error(`Unknown model provider for: ${model}`);
    }
  }
  
  /**
   * Calculate API cost
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model];
    
    if (!pricing) {
      // Default to gpt-4o pricing if unknown
      const defaultPricing = MODEL_PRICING['gpt-4o'];
      return (
        (inputTokens * defaultPricing.inputCostPer1M +
          outputTokens * defaultPricing.outputCostPer1M) /
        1_000_000
      );
    }
    
    return (
      (inputTokens * pricing.inputCostPer1M + outputTokens * pricing.outputCostPer1M) /
      1_000_000
    );
  }
  
  /**
   * Estimate cost for batch processing
   */
  estimateCost(
    model: string,
    numSamples: number,
    avgInputTokens: number = 300,
    avgOutputTokens: number = 150
  ): {
    model: string;
    numSamples: number;
    costPerSample: number;
    totalCost: number;
    totalTokens: number;
  } {
    const costPerSample = this.calculateCost(model, avgInputTokens, avgOutputTokens);
    const totalCost = costPerSample * numSamples;
    const totalTokens = (avgInputTokens + avgOutputTokens) * numSamples;
    
    return {
      model,
      numSamples,
      costPerSample,
      totalCost,
      totalTokens,
    };
  }
}

/**
 * Check if API keys are available
 */
export function checkApiKeys(): {
  openai: boolean;
  anthropic: boolean;
  google: boolean;
} {
  return {
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google: !!process.env.GOOGLE_API_KEY,
  };
}
