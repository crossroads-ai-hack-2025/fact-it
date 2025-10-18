/**
 * Dataset Manager for loading and managing test datasets.
 * 
 * Handles dataset loading, validation, train/val/test splitting,
 * and filtering operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Stage1Sample,
  Stage2Sample,
  validateStage1Sample,
  validateStage2Sample,
  validateDatasetBalance,
  Platform,
  Topic,
  Verdict,
  Difficulty,
} from '../types/dataset-schema';

export interface DatasetSplits<T> {
  train: T[];
  val: T[];
  test: T[];
}

export class DatasetManager {
  private dataDir: string;
  private stage1Data: Stage1Sample[] | null = null;
  private stage2Data: Stage2Sample[] | null = null;
  
  // Cached splits
  private stage1Splits: Map<string, DatasetSplits<Stage1Sample>> = new Map();
  private stage2Splits: Map<string, DatasetSplits<Stage2Sample>> = new Map();
  
  constructor(dataDir: string = './datasets') {
    this.dataDir = dataDir;
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }
  
  /**
   * Load Stage 1 dataset from JSON file
   */
  loadStage1(filename: string = 'stage1_dataset.json'): Stage1Sample[] {
    const filepath = path.join(this.dataDir, filename);
    
    if (!fs.existsSync(filepath)) {
      console.warn(`Warning: ${filepath} not found. Creating empty dataset.`);
      return [];
    }
    
    const content = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content);
    
    const samples: Stage1Sample[] = [];
    for (const item of data) {
      try {
        const sample = validateStage1Sample(item);
        samples.push(sample);
      } catch (error) {
        console.error(`Error loading sample ${item.id || 'unknown'}:`, error);
      }
    }
    
    this.stage1Data = samples;
    console.log(`Loaded ${samples.length} Stage 1 samples from ${filepath}`);
    
    // Print dataset balance
    const balance = validateDatasetBalance(samples, 'hasClaim');
    console.log('Dataset balance:', balance);
    
    return samples;
  }
  
  /**
   * Load Stage 2 dataset from JSON file
   */
  loadStage2(filename: string = 'stage2_dataset.json'): Stage2Sample[] {
    const filepath = path.join(this.dataDir, filename);
    
    if (!fs.existsSync(filepath)) {
      console.warn(`Warning: ${filepath} not found. Creating empty dataset.`);
      return [];
    }
    
    const content = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content);
    
    const samples: Stage2Sample[] = [];
    for (const item of data) {
      try {
        const sample = validateStage2Sample(item);
        samples.push(sample);
      } catch (error) {
        console.error(`Error loading sample ${item.id || 'unknown'}:`, error);
      }
    }
    
    this.stage2Data = samples;
    console.log(`Loaded ${samples.length} Stage 2 samples from ${filepath}`);
    
    // Print dataset balance
    const balance = validateDatasetBalance(samples, 'verdict');
    console.log('Dataset balance:', balance);
    
    return samples;
  }
  
  /**
   * Save Stage 1 dataset to JSON file
   */
  saveStage1(samples: Stage1Sample[], filename: string = 'stage1_dataset.json'): void {
    const filepath = path.join(this.dataDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(samples, null, 2), 'utf-8');
    console.log(`Saved ${samples.length} Stage 1 samples to ${filepath}`);
  }
  
  /**
   * Save Stage 2 dataset to JSON file
   */
  saveStage2(samples: Stage2Sample[], filename: string = 'stage2_dataset.json'): void {
    const filepath = path.join(this.dataDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(samples, null, 2), 'utf-8');
    console.log(`Saved ${samples.length} Stage 2 samples to ${filepath}`);
  }
  
  /**
   * Split dataset into train/validation/test sets
   */
  trainValTestSplit<T>(
    stage: 1 | 2,
    options: {
      train?: number;
      val?: number;
      test?: number;
      stratifyBy?: string;
      randomSeed?: number;
    } = {}
  ): DatasetSplits<T> {
    const {
      train = 0.7,
      val = 0.15,
      test = 0.15,
      stratifyBy,
      randomSeed = 42,
    } = options;
    
    if (Math.abs(train + val + test - 1.0) > 0.01) {
      throw new Error('train + val + test must sum to 1.0');
    }
    
    // Load data if not already loaded
    let samples: any[];
    if (stage === 1) {
      if (!this.stage1Data) {
        this.loadStage1();
      }
      samples = this.stage1Data!;
    } else {
      if (!this.stage2Data) {
        this.loadStage2();
      }
      samples = this.stage2Data!;
    }
    
    // Check cache
    const cacheKey = `${stage}_${train}_${val}_${test}_${stratifyBy}_${randomSeed}`;
    const cache = stage === 1 ? this.stage1Splits : this.stage2Splits;
    
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) as DatasetSplits<T>;
    }
    
    // Seed random number generator
    const random = seededRandom(randomSeed);
    
    let splits: DatasetSplits<any>;
    if (stratifyBy) {
      splits = this.stratifiedSplit(samples, train, val, test, stratifyBy, random);
    } else {
      splits = this.randomSplit(samples, train, val, test, random);
    }
    
    // Cache the splits
    cache.set(cacheKey, splits);
    
    // Print split info
    console.log(`\nDataset splits (stage ${stage}):`);
    console.log(`  train: ${splits.train.length} samples`);
    console.log(`  val: ${splits.val.length} samples`);
    console.log(`  test: ${splits.test.length} samples`);
    
    return splits as DatasetSplits<T>;
  }
  
  /**
   * Random split
   */
  private randomSplit<T>(
    samples: T[],
    train: number,
    val: number,
    test: number,
    random: () => number
  ): DatasetSplits<T> {
    const shuffled = [...samples].sort(() => random() - 0.5);
    
    const n = shuffled.length;
    const trainEnd = Math.floor(n * train);
    const valEnd = trainEnd + Math.floor(n * val);
    
    return {
      train: shuffled.slice(0, trainEnd),
      val: shuffled.slice(trainEnd, valEnd),
      test: shuffled.slice(valEnd),
    };
  }
  
  /**
   * Stratified split maintaining label distribution
   */
  private stratifiedSplit<T>(
    samples: T[],
    train: number,
    val: number,
    test: number,
    stratifyField: string,
    random: () => number
  ): DatasetSplits<T> {
    // Group by stratify field
    const groups: Map<string, T[]> = new Map();
    
    samples.forEach((sample: any) => {
      const value = String(sample[stratifyField]);
      if (!groups.has(value)) {
        groups.set(value, []);
      }
      groups.get(value)!.push(sample);
    });
    
    // Split each group
    const trainData: T[] = [];
    const valData: T[] = [];
    const testData: T[] = [];
    
    groups.forEach((groupSamples) => {
      const shuffled = [...groupSamples].sort(() => random() - 0.5);
      const n = shuffled.length;
      const trainEnd = Math.floor(n * train);
      const valEnd = trainEnd + Math.floor(n * val);
      
      trainData.push(...shuffled.slice(0, trainEnd));
      valData.push(...shuffled.slice(trainEnd, valEnd));
      testData.push(...shuffled.slice(valEnd));
    });
    
    // Shuffle final splits
    return {
      train: trainData.sort(() => random() - 0.5),
      val: valData.sort(() => random() - 0.5),
      test: testData.sort(() => random() - 0.5),
    };
  }
  
  /**
   * Filter dataset by criteria
   */
  getSubset<T extends Stage1Sample | Stage2Sample>(
    stage: 1 | 2,
    filters: Record<string, any>,
    split?: 'train' | 'val' | 'test'
  ): T[] {
    let samples: any[];
    
    if (split) {
      const splits = this.trainValTestSplit(stage);
      samples = splits[split];
    } else {
      samples = stage === 1 ? this.stage1Data! : this.stage2Data!;
      if (!samples) {
        if (stage === 1) {
          this.loadStage1();
          samples = this.stage1Data!;
        } else {
          this.loadStage2();
          samples = this.stage2Data!;
        }
      }
    }
    
    return samples.filter((sample: any) => {
      return Object.entries(filters).every(([field, value]) => {
        return sample[field] === value;
      });
    }) as T[];
  }
  
  /**
   * Get dataset statistics
   */
  getStatistics(stage: 1 | 2): Record<string, any> {
    let samples: any[];
    
    if (stage === 1) {
      if (!this.stage1Data) {
        this.loadStage1();
      }
      samples = this.stage1Data!;
    } else {
      if (!this.stage2Data) {
        this.loadStage2();
      }
      samples = this.stage2Data!;
    }
    
    const stats: Record<string, any> = {
      totalSamples: samples.length,
    };
    
    if (stage === 1) {
      // Stage 1 specific stats
      const labelCounts = countBy(samples, 'hasClaim');
      const platformCounts = countBy(samples, 'platform');
      const topicCounts = countBy(samples, (s: any) => s.metadata.topic || 'other');
      const complexityCounts = countBy(samples, (s: any) => s.metadata.complexity || 'moderate');
      
      stats.labelDistribution = labelCounts;
      stats.platformDistribution = platformCounts;
      stats.topicDistribution = topicCounts;
      stats.complexityDistribution = complexityCounts;
      
      // Claim statistics
      const samplesWithClaims = samples.filter((s: Stage1Sample) => s.hasClaim);
      stats.avgClaimsPerSample = samplesWithClaims.length > 0
        ? samplesWithClaims.reduce((sum, s: Stage1Sample) => sum + s.claims.length, 0) / samplesWithClaims.length
        : 0;
    } else {
      // Stage 2 specific stats
      const verdictCounts = countBy(samples, 'verdict');
      const topicCounts = countBy(samples, 'topic');
      const difficultyCounts = countBy(samples, 'difficulty');
      
      stats.labelDistribution = verdictCounts;
      stats.topicDistribution = topicCounts;
      stats.difficultyDistribution = difficultyCounts;
      
      // Source statistics
      const totalSources = samples.reduce((sum, s: Stage2Sample) => sum + s.sources.length, 0);
      stats.avgSourcesPerSample = totalSources / samples.length;
      
      const sourcesWithReliability = samples.flatMap((s: Stage2Sample) => s.sources);
      if (sourcesWithReliability.length > 0) {
        stats.avgSourceReliability = sourcesWithReliability.reduce((sum, src) => sum + src.reliabilityScore, 0) / sourcesWithReliability.length;
      }
    }
    
    return stats;
  }
}

/**
 * Seeded random number generator
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

/**
 * Count occurrences by field or function
 */
function countBy<T>(array: T[], keyOrFn: string | ((item: T) => any)): Record<string, number> {
  const counts: Record<string, number> = {};
  
  array.forEach((item) => {
    const key = typeof keyOrFn === 'function'
      ? String(keyOrFn(item))
      : String((item as any)[keyOrFn]);
    
    counts[key] = (counts[key] || 0) + 1;
  });
  
  return counts;
}

/**
 * Create example datasets for testing
 */
export function createExampleDatasets(dataDir: string = './datasets'): void {
  const manager = new DatasetManager(dataDir);
  
  // Create example Stage 1 samples
  const stage1Samples: Stage1Sample[] = [
    {
      id: 's1_001',
      text: 'I think remote work is more productive for most developers.',
      platform: Platform.TWITTER,
      hasClaim: false,
      claims: [],
      annotator: 'annotator1',
      confidence: 0.95,
      metadata: { topic: 'business', complexity: 'simple' },
    },
    {
      id: 's1_002',
      text: 'The unemployment rate in the US fell to 3.5% in December 2023.',
      platform: Platform.LINKEDIN,
      hasClaim: true,
      claims: ['The unemployment rate in the US fell to 3.5% in December 2023'],
      annotator: 'annotator1',
      confidence: 1.0,
      metadata: { topic: 'business', complexity: 'simple' },
    },
    {
      id: 's1_003',
      text: 'Studies show that drinking coffee reduces the risk of type 2 diabetes by 30%.',
      platform: Platform.ARTICLE,
      hasClaim: true,
      claims: ['Drinking coffee reduces the risk of type 2 diabetes by 30%'],
      annotator: 'annotator2',
      confidence: 0.9,
      metadata: { topic: 'health', complexity: 'moderate' },
    },
  ];
  
  // Create example Stage 2 samples
  const stage2Samples: Stage2Sample[] = [
    {
      id: 's2_001',
      claim: 'The unemployment rate in the US fell to 3.5% in December 2023',
      verdict: Verdict.TRUE,
      confidence: 0.95,
      sources: [
        {
          url: 'https://www.bls.gov/news.release/empsit.nr0.htm',
          title: 'Bureau of Labor Statistics - Employment Situation',
          reliabilityScore: 0.95,
          excerpt: 'The unemployment rate edged down to 3.5 percent in December.',
        },
      ],
      explanation: 'The claim is accurate according to official BLS data.',
      reasoning: 'Verified against official government statistics',
      difficulty: Difficulty.EASY,
      topic: Topic.BUSINESS,
      annotator: 'annotator1',
      metadata: {},
    },
    {
      id: 's2_002',
      claim: 'Drinking coffee reduces the risk of type 2 diabetes by 30%',
      verdict: Verdict.TRUE,
      confidence: 0.85,
      sources: [
        {
          url: 'https://pubmed.ncbi.nlm.nih.gov/123456789/',
          title: 'Coffee consumption and risk of type 2 diabetes: A meta-analysis',
          reliabilityScore: 0.9,
          excerpt: 'Coffee consumption was associated with a 30% lower risk of type 2 diabetes.',
        },
      ],
      explanation: 'Multiple meta-analyses support this claim with similar effect sizes.',
      reasoning: 'Strong evidence from systematic reviews',
      difficulty: Difficulty.MEDIUM,
      topic: Topic.HEALTH,
      annotator: 'annotator2',
      metadata: {},
    },
  ];
  
  // Save datasets
  manager.saveStage1(stage1Samples, 'stage1_example.json');
  manager.saveStage2(stage2Samples, 'stage2_example.json');
  
  console.log('\nExample datasets created successfully!');
  console.log(`Location: ${dataDir}`);
  console.log('Files: stage1_example.json, stage2_example.json');
}
