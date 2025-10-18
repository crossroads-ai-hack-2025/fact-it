/**
 * Evaluators for Stage 1 (Claim Detection) and Stage 2 (Verification).
 * 
 * Calculates comprehensive metrics including accuracy, precision, recall, F1,
 * confidence calibration, source quality, and performance metrics.
 */

import {
  Stage1Sample,
  Stage2Sample,
  ModelPrediction,
  Verdict,
} from '../types/dataset-schema';

// ===== Stage 1 Evaluator =====

export interface Stage1Metrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  totalSamples: number;
  meanLatency: number;
  p90Latency: number;
  p95Latency: number;
  p99Latency: number;
  totalCost: number;
  meanCostPerSample: number;
  errorAnalysis: Record<string, any>;
}

export class Stage1Evaluator {
  evaluate(
    predictions: ModelPrediction[],
    groundTruth: Stage1Sample[]
  ): Stage1Metrics {
    // Match predictions to ground truth
    const gtMap = new Map(groundTruth.map((s) => [s.id, s]));
    const matched: Array<[ModelPrediction, Stage1Sample]> = [];
    
    for (const pred of predictions) {
      const gt = gtMap.get(pred.sampleId);
      if (gt) {
        matched.push([pred, gt]);
      }
    }
    
    if (matched.length === 0) {
      throw new Error('No matching predictions found');
    }
    
    // Extract predictions and labels
    const yPred = matched.map(([p]) => Boolean(p.prediction));
    const yTrue = matched.map(([, gt]) => gt.hasClaim);
    
    // Calculate classification metrics
    const classMetrics = this.calculateClassificationMetrics(yPred, yTrue);
    
    // Calculate performance metrics
    const perfMetrics = this.calculatePerformanceMetrics(predictions);
    
    // Error analysis
    const errorAnalysis = this.analyzeErrors(matched, yPred, yTrue);
    
    return {
      ...classMetrics,
      ...perfMetrics,
      errorAnalysis,
    };
  }
  
  private calculateClassificationMetrics(
    yPred: boolean[],
    yTrue: boolean[]
  ): Omit<Stage1Metrics, 'meanLatency' | 'p90Latency' | 'p95Latency' | 'p99Latency' | 'totalCost' | 'meanCostPerSample' | 'errorAnalysis'> {
    const tp = yPred.filter((p, i) => p && yTrue[i]).length;
    const fp = yPred.filter((p, i) => p && !yTrue[i]).length;
    const tn = yPred.filter((p, i) => !p && !yTrue[i]).length;
    const fn = yPred.filter((p, i) => !p && yTrue[i]).length;
    
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const accuracy = (tp + tn) / yPred.length;
    const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
    const fnr = fn + tp > 0 ? fn / (fn + tp) : 0;
    
    return {
      accuracy,
      precision,
      recall,
      f1Score,
      falsePositiveRate: fpr,
      falseNegativeRate: fnr,
      truePositives: tp,
      falsePositives: fp,
      trueNegatives: tn,
      falseNegatives: fn,
      totalSamples: yPred.length,
    };
  }
  
  private calculatePerformanceMetrics(predictions: ModelPrediction[]): {
    meanLatency: number;
    p90Latency: number;
    p95Latency: number;
    p99Latency: number;
    totalCost: number;
    meanCostPerSample: number;
  } {
    const latencies = predictions.map((p) => p.latency).filter((l) => l > 0);
    const costs = predictions.map((p) => p.cost).filter((c) => c > 0);
    
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    
    return {
      meanLatency: mean(latencies),
      p90Latency: percentile(sortedLatencies, 90),
      p95Latency: percentile(sortedLatencies, 95),
      p99Latency: percentile(sortedLatencies, 99),
      totalCost: sum(costs),
      meanCostPerSample: mean(costs),
    };
  }
  
  private analyzeErrors(
    matched: Array<[ModelPrediction, Stage1Sample]>,
    yPred: boolean[],
    yTrue: boolean[]
  ): Record<string, any> {
    const byPlatform: Record<string, { correct: number; total: number }> = {};
    const byTopic: Record<string, { correct: number; total: number }> = {};
    
    matched.forEach(([pred, sample], i) => {
      const correct = yPred[i] === yTrue[i];
      
      // By platform
      const platform = sample.platform;
      if (!byPlatform[platform]) {
        byPlatform[platform] = { correct: 0, total: 0 };
      }
      byPlatform[platform].total++;
      if (correct) byPlatform[platform].correct++;
      
      // By topic
      const topic = sample.metadata.topic || 'other';
      if (!byTopic[topic]) {
        byTopic[topic] = { correct: 0, total: 0 };
      }
      byTopic[topic].total++;
      if (correct) byTopic[topic].correct++;
    });
    
    return {
      byPlatform: Object.fromEntries(
        Object.entries(byPlatform).map(([k, v]) => [
          k,
          { accuracy: v.correct / v.total, ...v },
        ])
      ),
      byTopic: Object.fromEntries(
        Object.entries(byTopic).map(([k, v]) => [
          k,
          { accuracy: v.correct / v.total, ...v },
        ])
      ),
    };
  }
}

// ===== Stage 2 Evaluator =====

export interface Stage2Metrics {
  accuracy: number;
  perClass: Record<string, { precision: number; recall: number; f1Score: number; support: number }>;
  confusionMatrix: Record<string, Record<string, number>>;
  criticalErrors: {
    trueMarkedFalse: number;
    falseMarkedTrue: number;
    totalCriticalErrors: number;
    criticalErrorRate: number;
  };
  calibration: {
    expectedCalibrationError: number;
    calibrationByBin: Record<string, any>;
  };
  sourceQuality: {
    avgSourceOverlap: number;
    avgSourceReliability: number;
    avgSourcesPerPrediction: number;
  };
  meanLatency: number;
  p90Latency: number;
  totalCost: number;
  meanCostPerSample: number;
  errorAnalysis: Record<string, any>;
}

export class Stage2Evaluator {
  evaluate(
    predictions: ModelPrediction[],
    groundTruth: Stage2Sample[]
  ): Stage2Metrics {
    // Match predictions to ground truth
    const gtMap = new Map(groundTruth.map((s) => [s.id, s]));
    const matched: Array<[ModelPrediction, Stage2Sample]> = [];
    
    for (const pred of predictions) {
      const gt = gtMap.get(pred.sampleId);
      if (gt) {
        matched.push([pred, gt]);
      }
    }
    
    if (matched.length === 0) {
      throw new Error('No matching predictions found');
    }
    
    // Extract predictions and labels
    const yPred = matched.map(([p]) => String(p.prediction).toLowerCase());
    const yTrue = matched.map(([, gt]) => gt.verdict);
    const confidences = matched.map(([p]) => p.confidence);
    
    // Calculate metrics
    const accuracy = yPred.filter((p, i) => p === yTrue[i]).length / yPred.length;
    const perClass = this.calculatePerClassMetrics(yPred, yTrue);
    const confusionMatrix = this.buildConfusionMatrix(yPred, yTrue);
    const criticalErrors = this.calculateCriticalErrors(yPred, yTrue);
    const calibration = this.calculateCalibration(yPred, yTrue, confidences);
    const sourceQuality = this.calculateSourceQuality(matched);
    const perfMetrics = this.calculatePerformanceMetrics(predictions);
    const errorAnalysis = this.analyzeErrors(matched, yPred, yTrue);
    
    return {
      accuracy,
      perClass,
      confusionMatrix,
      criticalErrors,
      calibration,
      sourceQuality,
      ...perfMetrics,
      errorAnalysis,
    };
  }
  
  private calculatePerClassMetrics(
    yPred: string[],
    yTrue: string[]
  ): Record<string, { precision: number; recall: number; f1Score: number; support: number }> {
    const labels = ['true', 'false', 'unknown'];
    const result: Record<string, any> = {};
    
    for (const label of labels) {
      const tp = yPred.filter((p, i) => p === label && yTrue[i] === label).length;
      const fp = yPred.filter((p, i) => p === label && yTrue[i] !== label).length;
      const fn = yPred.filter((p, i) => p !== label && yTrue[i] === label).length;
      
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      const support = yTrue.filter((t) => t === label).length;
      
      result[label] = { precision, recall, f1Score, support };
    }
    
    return result;
  }
  
  private buildConfusionMatrix(
    yPred: string[],
    yTrue: string[]
  ): Record<string, Record<string, number>> {
    const labels = ['true', 'false', 'unknown'];
    const matrix: Record<string, Record<string, number>> = {};
    
    for (const trueLabel of labels) {
      matrix[trueLabel] = {};
      for (const predLabel of labels) {
        matrix[trueLabel][predLabel] = yPred.filter(
          (p, i) => p === predLabel && yTrue[i] === trueLabel
        ).length;
      }
    }
    
    return matrix;
  }
  
  private calculateCriticalErrors(yPred: string[], yTrue: string[]): Stage2Metrics['criticalErrors'] {
    const trueMarkedFalse = yPred.filter((p, i) => p === 'false' && yTrue[i] === 'true').length;
    const falseMarkedTrue = yPred.filter((p, i) => p === 'true' && yTrue[i] === 'false').length;
    const totalCriticalErrors = trueMarkedFalse + falseMarkedTrue;
    const criticalErrorRate = totalCriticalErrors / yPred.length;
    
    return {
      trueMarkedFalse,
      falseMarkedTrue,
      totalCriticalErrors,
      criticalErrorRate,
    };
  }
  
  private calculateCalibration(
    yPred: string[],
    yTrue: string[],
    confidences: number[]
  ): Stage2Metrics['calibration'] {
    const bins = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const calibrationByBin: Record<string, any> = {};
    
    for (let i = 0; i < bins.length - 1; i++) {
      const low = bins[i];
      const high = bins[i + 1];
      
      const inBin = confidences
        .map((c, idx) => ({ c, idx }))
        .filter(({ c }) => c >= low && c < high);
      
      if (inBin.length > 0) {
        const actualAccuracy =
          inBin.filter(({ idx }) => yPred[idx] === yTrue[idx]).length / inBin.length;
        const expectedConfidence = mean(inBin.map(({ c }) => c));
        
        calibrationByBin[`${low.toFixed(1)}-${high.toFixed(1)}`] = {
          expected: expectedConfidence,
          actual: actualAccuracy,
          samples: inBin.length,
          calibrationError: Math.abs(expectedConfidence - actualAccuracy),
        };
      }
    }
    
    const ece =
      Object.values(calibrationByBin).reduce(
        (sum: number, bin: any) => sum + bin.calibrationError * bin.samples,
        0
      ) / confidences.length;
    
    return {
      expectedCalibrationError: ece,
      calibrationByBin,
    };
  }
  
  private calculateSourceQuality(
    matched: Array<[ModelPrediction, Stage2Sample]>
  ): Stage2Metrics['sourceQuality'] {
    const overlaps: number[] = [];
    const reliabilities: number[] = [];
    const sourceCounts: number[] = [];
    
    for (const [pred, gt] of matched) {
      const predUrls = new Set(pred.sources.map((s) => s.url));
      const gtUrls = new Set(gt.sources.map((s) => s.url));
      
      if (gtUrls.size > 0) {
        const overlap = [...predUrls].filter((url) => gtUrls.has(url)).length / gtUrls.size;
        overlaps.push(overlap);
      }
      
      if (pred.sources.length > 0) {
        const avgReliability = mean(pred.sources.map((s) => s.reliabilityScore || 0.7));
        reliabilities.push(avgReliability);
        sourceCounts.push(pred.sources.length);
      }
    }
    
    return {
      avgSourceOverlap: mean(overlaps),
      avgSourceReliability: mean(reliabilities),
      avgSourcesPerPrediction: mean(sourceCounts),
    };
  }
  
  private calculatePerformanceMetrics(predictions: ModelPrediction[]): {
    meanLatency: number;
    p90Latency: number;
    totalCost: number;
    meanCostPerSample: number;
  } {
    const latencies = predictions.map((p) => p.latency).filter((l) => l > 0);
    const costs = predictions.map((p) => p.cost).filter((c) => c > 0);
    
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    
    return {
      meanLatency: mean(latencies),
      p90Latency: percentile(sortedLatencies, 90),
      totalCost: sum(costs),
      meanCostPerSample: mean(costs),
    };
  }
  
  private analyzeErrors(
    matched: Array<[ModelPrediction, Stage2Sample]>,
    yPred: string[],
    yTrue: string[]
  ): Record<string, any> {
    const byDifficulty: Record<string, { correct: number; total: number }> = {};
    const byTopic: Record<string, { correct: number; total: number }> = {};
    
    matched.forEach(([pred, sample], i) => {
      const correct = yPred[i] === yTrue[i];
      
      // By difficulty
      const difficulty = sample.difficulty;
      if (!byDifficulty[difficulty]) {
        byDifficulty[difficulty] = { correct: 0, total: 0 };
      }
      byDifficulty[difficulty].total++;
      if (correct) byDifficulty[difficulty].correct++;
      
      // By topic
      const topic = sample.topic;
      if (!byTopic[topic]) {
        byTopic[topic] = { correct: 0, total: 0 };
      }
      byTopic[topic].total++;
      if (correct) byTopic[topic].correct++;
    });
    
    return {
      byDifficulty: Object.fromEntries(
        Object.entries(byDifficulty).map(([k, v]) => [
          k,
          { accuracy: v.correct / v.total, ...v },
        ])
      ),
      byTopic: Object.fromEntries(
        Object.entries(byTopic).map(([k, v]) => [
          k,
          { accuracy: v.correct / v.total, ...v },
        ])
      ),
    };
  }
}

// ===== Utility Functions =====

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

// ===== Report Printing =====

export function printEvaluationReport(
  stage: 1 | 2,
  metrics: Stage1Metrics | Stage2Metrics,
  modelName: string = 'Model'
): void {
  console.log('\n' + '='.repeat(70));
  console.log(`Stage ${stage} Evaluation Report: ${modelName}`);
  console.log('='.repeat(70) + '\n');
  
  if (stage === 1) {
    const m = metrics as Stage1Metrics;
    console.log('Classification Metrics:');
    console.log(`  Accuracy:  ${m.accuracy.toFixed(3)}`);
    console.log(`  Precision: ${m.precision.toFixed(3)}`);
    console.log(`  Recall:    ${m.recall.toFixed(3)}`);
    console.log(`  F1 Score:  ${m.f1Score.toFixed(3)}`);
    console.log(`  FPR:       ${m.falsePositiveRate.toFixed(3)}`);
    console.log(`  FNR:       ${m.falseNegativeRate.toFixed(3)}`);
  } else {
    const m = metrics as Stage2Metrics;
    console.log('Accuracy Metrics:');
    console.log(`  Overall Accuracy: ${m.accuracy.toFixed(3)}`);
    console.log('\n  Per-Class Metrics:');
    for (const [label, scores] of Object.entries(m.perClass)) {
      console.log(
        `    ${label.toUpperCase()}: P=${scores.precision.toFixed(3)}, R=${scores.recall.toFixed(3)}, F1=${scores.f1Score.toFixed(3)}`
      );
    }
    console.log('\n  Critical Errors:');
    console.log(`    TRUE→FALSE: ${m.criticalErrors.trueMarkedFalse}`);
    console.log(`    FALSE→TRUE: ${m.criticalErrors.falseMarkedTrue}`);
    console.log(`    Critical Error Rate: ${m.criticalErrors.criticalErrorRate.toFixed(3)}`);
    console.log('\n  Confidence Calibration:');
    console.log(`    ECE: ${m.calibration.expectedCalibrationError.toFixed(3)}`);
  }
  
  console.log('\nPerformance Metrics:');
  console.log(`  Mean Latency: ${metrics.meanLatency.toFixed(3)}s`);
  console.log(`  P90 Latency:  ${metrics.p90Latency.toFixed(3)}s`);
  console.log(`  Total Cost:   $${metrics.totalCost.toFixed(4)}`);
  console.log(`  Cost/Sample:  $${metrics.meanCostPerSample.toFixed(6)}`);
  
  console.log('\n' + '='.repeat(70) + '\n');
}
