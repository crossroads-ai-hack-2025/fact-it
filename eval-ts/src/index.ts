/**
 * Fact-It Evaluation Framework
 * Main exports for library usage
 */

// Types
export * from './types/dataset-schema.js';

// Dataset Management
export { DatasetManager, createExampleDatasets } from './dataset/dataset-manager.js';
export type { DatasetSplits } from './dataset/dataset-manager.js';

// Model Runner
export { ModelRunner, checkApiKeys } from './models/model-runner.js';
export type { ModelConfig, ModelCosts } from './models/model-runner.js';

// Evaluators
export {
  Stage1Evaluator,
  Stage2Evaluator,
  printEvaluationReport,
} from './evaluation/evaluators.js';
export type { Stage1Metrics, Stage2Metrics } from './evaluation/evaluators.js';

// Prompts
export { PromptRegistry } from './prompts/prompt-registry.js';
export type { PromptTemplate } from './prompts/prompt-registry.js';
export {
  STAGE1_BASELINE,
  STAGE1_DETAILED,
  STAGE1_CONSERVATIVE,
  STAGE2_BASELINE,
  STAGE2_DETAILED,
  STAGE2_CONSERVATIVE,
} from './prompts/prompt-registry.js';
