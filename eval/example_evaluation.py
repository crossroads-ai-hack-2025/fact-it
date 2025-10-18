#!/usr/bin/env python3
"""
Example evaluation script demonstrating the complete evaluation workflow.

This script shows how to:
1. Load test datasets
2. Run model inference
3. Calculate evaluation metrics
4. Compare different models and prompts
"""

import os
import sys
from pathlib import Path

# Add eval directory to path
sys.path.insert(0, str(Path(__file__).parent))

from dataset_manager import DatasetManager, create_example_datasets
from model_runner import ModelRunner, ModelConfig
from evaluators import Stage1Evaluator, Stage2Evaluator, print_evaluation_report
from prompt_registry import PromptRegistry


def check_api_keys():
    """Check if API keys are set"""
    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        print("⚠️  OPENAI_API_KEY not set. Set it with:")
        print("   export OPENAI_API_KEY='your-key-here'")
        return False
    print("✓ OpenAI API key found")
    return True


def stage1_evaluation_example():
    """Example: Stage 1 claim detection evaluation"""
    print("\n" + "="*70)
    print("STAGE 1: CLAIM DETECTION EVALUATION")
    print("="*70)
    
    # Setup
    manager = DatasetManager("./datasets")
    
    # Create example dataset if it doesn't exist
    if not (Path("./datasets") / "stage1_example.json").exists():
        print("\nCreating example dataset...")
        create_example_datasets("./datasets")
    
    # Load dataset
    print("\nLoading test dataset...")
    test_data = manager.load_stage1("stage1_example.json")
    
    if len(test_data) == 0:
        print("⚠️  No test data found. Run: python dataset_manager.py")
        return
    
    print(f"Loaded {len(test_data)} samples")
    
    # Initialize model runner
    runner = ModelRunner()
    
    # Get prompt
    registry = PromptRegistry()
    prompt = registry.get_prompt("baseline", stage=1)
    print(f"Using prompt: {prompt.name} (v{prompt.version})")
    
    # Run inference
    print("\nRunning inference with gpt-4o-mini...")
    predictions = runner.run_batch(
        model="gpt-4o-mini",
        prompt=prompt.system_prompt,
        samples=test_data,
        max_workers=2,
        show_progress=True
    )
    
    # Evaluate
    print("\nCalculating metrics...")
    evaluator = Stage1Evaluator()
    metrics = evaluator.evaluate(predictions, test_data)
    
    # Print report
    print_evaluation_report(1, metrics, "GPT-4o-mini (baseline)")
    
    # Show some predictions
    print("\n" + "="*70)
    print("SAMPLE PREDICTIONS")
    print("="*70)
    for i, (pred, sample) in enumerate(zip(predictions[:3], test_data[:3])):
        print(f"\nSample {i+1}:")
        print(f"  Text: {sample.text[:80]}...")
        print(f"  Ground Truth: {'HAS CLAIM' if sample.has_claim else 'NO CLAIM'}")
        print(f"  Prediction: {'HAS CLAIM' if pred.prediction else 'NO CLAIM'}")
        print(f"  Confidence: {pred.confidence:.2f}")
        print(f"  Correct: {'✓' if pred.prediction == sample.has_claim else '✗'}")


def stage2_evaluation_example():
    """Example: Stage 2 verification evaluation"""
    print("\n" + "="*70)
    print("STAGE 2: VERIFICATION EVALUATION")
    print("="*70)
    
    # Setup
    manager = DatasetManager("./datasets")
    
    # Create example dataset if it doesn't exist
    if not (Path("./datasets") / "stage2_example.json").exists():
        print("\nCreating example dataset...")
        create_example_datasets("./datasets")
    
    # Load dataset
    print("\nLoading test dataset...")
    test_data = manager.load_stage2("stage2_example.json")
    
    if len(test_data) == 0:
        print("⚠️  No test data found. Run: python dataset_manager.py")
        return
    
    print(f"Loaded {len(test_data)} samples")
    
    # Initialize model runner
    runner = ModelRunner()
    
    # Get prompt
    registry = PromptRegistry()
    prompt = registry.get_prompt("baseline", stage=2)
    print(f"Using prompt: {prompt.name} (v{prompt.version})")
    
    # Run inference
    print("\nRunning inference with gpt-4o...")
    print("Note: This uses API calls and will incur costs")
    
    predictions = runner.run_batch(
        model="gpt-4o",
        prompt=prompt.system_prompt,
        samples=test_data,
        max_workers=2,
        show_progress=True
    )
    
    # Evaluate
    print("\nCalculating metrics...")
    evaluator = Stage2Evaluator()
    metrics = evaluator.evaluate(predictions, test_data)
    
    # Print report
    print_evaluation_report(2, metrics, "GPT-4o (baseline)")
    
    # Show sample predictions
    print("\n" + "="*70)
    print("SAMPLE PREDICTIONS")
    print("="*70)
    for i, (pred, sample) in enumerate(zip(predictions[:2], test_data[:2])):
        print(f"\nSample {i+1}:")
        print(f"  Claim: {sample.claim[:80]}...")
        print(f"  Ground Truth: {sample.verdict.value.upper()}")
        print(f"  Prediction: {str(pred.prediction).upper()}")
        print(f"  Confidence: {pred.confidence:.2f}")
        print(f"  Correct: {'✓' if str(pred.prediction).lower() == sample.verdict.value else '✗'}")
        if pred.explanation:
            print(f"  Explanation: {pred.explanation[:100]}...")


def model_comparison_example():
    """Example: Compare multiple models"""
    print("\n" + "="*70)
    print("MODEL COMPARISON (Stage 1)")
    print("="*70)
    
    # Setup
    manager = DatasetManager("./datasets")
    
    # Create example dataset if it doesn't exist
    if not (Path("./datasets") / "stage1_example.json").exists():
        print("\nCreating example dataset...")
        create_example_datasets("./datasets")
    
    test_data = manager.load_stage1("stage1_example.json")
    
    if len(test_data) == 0:
        print("⚠️  No test data found")
        return
    
    runner = ModelRunner()
    registry = PromptRegistry()
    evaluator = Stage1Evaluator()
    
    prompt = registry.get_prompt("baseline", stage=1)
    
    # Models to compare
    models = ["gpt-4o-mini", "gpt-4o"]
    
    print(f"\nComparing {len(models)} models on {len(test_data)} samples...")
    
    results = {}
    for model in models:
        print(f"\nTesting {model}...")
        
        # Cost estimation
        est = runner.estimate_cost(model, len(test_data), 300, 100)
        if "error" not in est:
            print(f"  Estimated cost: ${est['total_cost']:.4f}")
        
        # Run inference
        predictions = runner.run_batch(
            model=model,
            prompt=prompt.system_prompt,
            samples=test_data,
            max_workers=2
        )
        
        # Evaluate
        metrics = evaluator.evaluate(predictions, test_data)
        results[model] = metrics
    
    # Comparison table
    print("\n" + "="*70)
    print("COMPARISON RESULTS")
    print("="*70)
    print(f"\n{'Model':<20} {'F1':<8} {'Precision':<12} {'Recall':<8} {'Cost':<10} {'P90 Latency':<12}")
    print("-" * 70)
    
    for model, metrics in results.items():
        print(
            f"{model:<20} "
            f"{metrics['f1_score']:.3f}    "
            f"{metrics['precision']:.3f}        "
            f"{metrics['recall']:.3f}    "
            f"${metrics['total_cost']:<8.4f}  "
            f"{metrics['p90_latency']:.2f}s"
        )


def prompt_comparison_example():
    """Example: A/B test different prompts"""
    print("\n" + "="*70)
    print("PROMPT A/B TESTING (Stage 1)")
    print("="*70)
    
    # Setup
    manager = DatasetManager("./datasets")
    
    if not (Path("./datasets") / "stage1_example.json").exists():
        create_example_datasets("./datasets")
    
    test_data = manager.load_stage1("stage1_example.json")
    
    if len(test_data) == 0:
        print("⚠️  No test data found")
        return
    
    runner = ModelRunner()
    registry = PromptRegistry()
    evaluator = Stage1Evaluator()
    
    # Test different prompt variants
    model = "gpt-4o-mini"
    prompt_ids = ["baseline", "detailed_v1", "conservative_v1"]
    
    print(f"\nTesting {len(prompt_ids)} prompt variants with {model}...")
    
    results = {}
    for prompt_id in prompt_ids:
        print(f"\nTesting prompt: {prompt_id}")
        
        prompt = registry.get_prompt(prompt_id, stage=1)
        
        # Run inference
        predictions = runner.run_batch(
            model=model,
            prompt=prompt.system_prompt,
            samples=test_data,
            max_workers=2
        )
        
        # Evaluate
        metrics = evaluator.evaluate(predictions, test_data)
        results[prompt_id] = metrics
    
    # Comparison
    print("\n" + "="*70)
    print("PROMPT COMPARISON RESULTS")
    print("="*70)
    print(f"\n{'Prompt':<20} {'F1':<8} {'Precision':<12} {'Recall':<8} {'FPR':<8}")
    print("-" * 56)
    
    for prompt_id, metrics in results.items():
        print(
            f"{prompt_id:<20} "
            f"{metrics['f1_score']:.3f}    "
            f"{metrics['precision']:.3f}        "
            f"{metrics['recall']:.3f}    "
            f"{metrics['false_positive_rate']:.3f}"
        )


def main():
    """Main function"""
    print("="*70)
    print("FACT-IT EVALUATION FRAMEWORK - EXAMPLE SCRIPT")
    print("="*70)
    
    # Check API keys
    if not check_api_keys():
        print("\n⚠️  Cannot proceed without API keys")
        return
    
    print("\nSelect example to run:")
    print("  1. Stage 1 Evaluation (Claim Detection)")
    print("  2. Stage 2 Evaluation (Verification) - Uses API, costs money")
    print("  3. Model Comparison")
    print("  4. Prompt A/B Testing")
    print("  5. Run all examples")
    
    choice = input("\nEnter choice (1-5): ").strip()
    
    if choice == "1":
        stage1_evaluation_example()
    elif choice == "2":
        confirm = input("This will use OpenAI API and incur costs. Continue? (y/n): ")
        if confirm.lower() == 'y':
            stage2_evaluation_example()
    elif choice == "3":
        model_comparison_example()
    elif choice == "4":
        prompt_comparison_example()
    elif choice == "5":
        stage1_evaluation_example()
        model_comparison_example()
        prompt_comparison_example()
        
        confirm = input("\nRun Stage 2 (uses API, costs money)? (y/n): ")
        if confirm.lower() == 'y':
            stage2_evaluation_example()
    else:
        print("Invalid choice")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
