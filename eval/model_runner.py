"""
Model Runner - Abstraction layer for different AI model APIs.

Supports OpenAI, Anthropic, and local models with unified interface.
"""

import time
import json
import os
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from dataclasses import dataclass

from dataset_schema import Stage1Sample, Stage2Sample, ModelPrediction, Verdict


@dataclass
class ModelConfig:
    """Configuration for model inference"""
    temperature: float = 0.3
    max_tokens: int = 1024
    timeout: int = 30
    retry_attempts: int = 3


class BaseModelRunner(ABC):
    """Base class for model runners"""
    
    def __init__(self, config: Optional[ModelConfig] = None):
        self.config = config or ModelConfig()
    
    @abstractmethod
    def run(self, model: str, prompt: str, sample: Any) -> Dict[str, Any]:
        """
        Run model inference
        
        Args:
            model: Model identifier
            prompt: System prompt
            sample: Stage1Sample or Stage2Sample
        
        Returns:
            Dictionary with prediction, confidence, sources, etc.
        """
        pass
    
    @abstractmethod
    def calculate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Calculate API cost based on token usage"""
        pass


class OpenAIRunner(BaseModelRunner):
    """OpenAI API wrapper"""
    
    # Pricing as of January 2024 (USD per 1M tokens)
    PRICING = {
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4o": {"input": 2.50, "output": 10.00},
        "gpt-4o-2024-08-06": {"input": 2.50, "output": 10.00},
        "o1-preview": {"input": 15.00, "output": 60.00},
        "o1-mini": {"input": 3.00, "output": 12.00},
        "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    }
    
    def __init__(self, api_key: Optional[str] = None, config: Optional[ModelConfig] = None):
        super().__init__(config)
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API key not provided")
        
        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=self.api_key)
        except ImportError:
            raise ImportError("openai package not installed. Run: pip install openai")
    
    def run(self, model: str, prompt: str, sample: Any) -> Dict[str, Any]:
        """Run OpenAI inference"""
        
        # Prepare input text
        if isinstance(sample, Stage1Sample):
            user_content = sample.text
        elif isinstance(sample, Stage2Sample):
            user_content = sample.claim
        else:
            user_content = str(sample)
        
        try:
            # For o1 models, use different parameters
            if model.startswith("o1"):
                response = self.client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "user", "content": f"{prompt}\n\n{user_content}"}
                    ],
                    # o1 models don't support temperature or response_format
                )
            else:
                response = self.client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": user_content}
                    ],
                    response_format={"type": "json_object"},
                    temperature=self.config.temperature,
                    max_tokens=self.config.max_tokens,
                )
            
            # Parse response
            content = response.choices[0].message.content
            
            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                # If not valid JSON, try to extract JSON from markdown
                import re
                json_match = re.search(r'```json\n(.*?)\n```', content, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group(1))
                else:
                    result = {"raw_response": content}
            
            # Calculate cost
            usage = response.usage
            cost = self.calculate_cost(model, usage.prompt_tokens, usage.completion_tokens)
            
            return {
                "prediction": result.get("verdict") or result.get("hasClaim"),
                "confidence": result.get("confidence", 0.0),
                "sources": result.get("sources", []),
                "explanation": result.get("explanation", ""),
                "reasoning": result.get("reasoning", ""),
                "cost": cost,
                "tokens_used": usage.total_tokens,
                "raw_response": content,
            }
        
        except Exception as e:
            return {
                "error": str(e),
                "prediction": None,
                "confidence": 0.0,
                "cost": 0.0,
            }
    
    def calculate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Calculate OpenAI API cost"""
        if model not in self.PRICING:
            # Default to gpt-4o pricing if model not recognized
            rates = self.PRICING["gpt-4o"]
        else:
            rates = self.PRICING[model]
        
        return (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000


class AnthropicRunner(BaseModelRunner):
    """Anthropic Claude API wrapper"""
    
    # Pricing as of January 2024 (USD per 1M tokens)
    PRICING = {
        "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
        "claude-3-5-sonnet-20240620": {"input": 3.00, "output": 15.00},
        "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},
        "claude-3-sonnet-20240229": {"input": 3.00, "output": 15.00},
        "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    }
    
    def __init__(self, api_key: Optional[str] = None, config: Optional[ModelConfig] = None):
        super().__init__(config)
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("Anthropic API key not provided")
        
        try:
            import anthropic
            self.client = anthropic.Anthropic(api_key=self.api_key)
        except ImportError:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")
    
    def run(self, model: str, prompt: str, sample: Any) -> Dict[str, Any]:
        """Run Anthropic inference"""
        
        # Prepare input text
        if isinstance(sample, Stage1Sample):
            user_content = sample.text
        elif isinstance(sample, Stage2Sample):
            user_content = sample.claim
        else:
            user_content = str(sample)
        
        try:
            message = self.client.messages.create(
                model=model,
                max_tokens=self.config.max_tokens,
                temperature=self.config.temperature,
                system=prompt,
                messages=[
                    {"role": "user", "content": user_content}
                ]
            )
            
            # Parse response
            content = message.content[0].text
            
            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                # Try to extract JSON from response
                import re
                json_match = re.search(r'\{.*\}', content, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group(0))
                else:
                    result = {"raw_response": content}
            
            # Calculate cost
            usage = message.usage
            cost = self.calculate_cost(model, usage.input_tokens, usage.output_tokens)
            
            return {
                "prediction": result.get("verdict") or result.get("hasClaim"),
                "confidence": result.get("confidence", 0.0),
                "sources": result.get("sources", []),
                "explanation": result.get("explanation", ""),
                "reasoning": result.get("reasoning", ""),
                "cost": cost,
                "tokens_used": usage.input_tokens + usage.output_tokens,
                "raw_response": content,
            }
        
        except Exception as e:
            return {
                "error": str(e),
                "prediction": None,
                "confidence": 0.0,
                "cost": 0.0,
            }
    
    def calculate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Calculate Anthropic API cost"""
        if model not in self.PRICING:
            # Default to Sonnet pricing
            rates = self.PRICING["claude-3-5-sonnet-20241022"]
        else:
            rates = self.PRICING[model]
        
        return (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000


class LocalModelRunner(BaseModelRunner):
    """Local model runner (for future implementation)"""
    
    def __init__(self, model_path: str, config: Optional[ModelConfig] = None):
        super().__init__(config)
        self.model_path = model_path
        # TODO: Implement local model loading (ONNX, transformers, etc.)
    
    def run(self, model: str, prompt: str, sample: Any) -> Dict[str, Any]:
        """Run local model inference"""
        raise NotImplementedError("Local model runner not yet implemented")
    
    def calculate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Local models have zero API cost"""
        return 0.0


class ModelRunner:
    """Main model runner that routes to appropriate provider"""
    
    def __init__(
        self,
        openai_key: Optional[str] = None,
        anthropic_key: Optional[str] = None,
        config: Optional[ModelConfig] = None
    ):
        """
        Initialize model runner with API keys
        
        Args:
            openai_key: OpenAI API key (or use OPENAI_API_KEY env var)
            anthropic_key: Anthropic API key (or use ANTHROPIC_API_KEY env var)
            config: Model configuration
        """
        self.config = config or ModelConfig()
        
        # Initialize providers
        self.providers = {}
        
        try:
            self.providers["openai"] = OpenAIRunner(openai_key, config)
        except (ValueError, ImportError) as e:
            print(f"Warning: OpenAI runner not available: {e}")
        
        try:
            self.providers["anthropic"] = AnthropicRunner(anthropic_key, config)
        except (ValueError, ImportError) as e:
            print(f"Warning: Anthropic runner not available: {e}")
    
    def run_single(
        self,
        model: str,
        prompt: str,
        sample: Any,
        sample_id: Optional[str] = None
    ) -> ModelPrediction:
        """
        Run single inference and return ModelPrediction
        
        Args:
            model: Model identifier
            prompt: System prompt
            sample: Stage1Sample or Stage2Sample
            sample_id: Optional sample ID (extracted from sample if not provided)
        
        Returns:
            ModelPrediction object
        """
        provider = self.get_provider(model)
        
        if provider is None:
            raise ValueError(f"No provider available for model: {model}")
        
        # Get sample ID
        if sample_id is None:
            sample_id = getattr(sample, 'id', 'unknown')
        
        start = time.time()
        
        try:
            result = provider.run(model, prompt, sample)
            latency = time.time() - start
            
            # Handle prediction format
            prediction = result.get("prediction")
            if isinstance(prediction, str) and prediction in ["true", "false", "unknown"]:
                prediction = Verdict(prediction)
            
            return ModelPrediction(
                sample_id=sample_id,
                prediction=prediction,
                confidence=result.get("confidence", 0.0),
                explanation=result.get("explanation"),
                sources=result.get("sources", []),
                latency=latency,
                cost=result.get("cost", 0.0),
                metadata={
                    "model": model,
                    "tokens_used": result.get("tokens_used", 0),
                    "raw_response": result.get("raw_response", ""),
                    "error": result.get("error"),
                    "success": "error" not in result,
                }
            )
        
        except Exception as e:
            return ModelPrediction(
                sample_id=sample_id,
                prediction=None,
                confidence=0.0,
                latency=time.time() - start,
                cost=0.0,
                metadata={
                    "model": model,
                    "error": str(e),
                    "success": False,
                }
            )
    
    def run_batch(
        self,
        model: str,
        prompt: str,
        samples: List[Any],
        max_workers: int = 5,
        show_progress: bool = True
    ) -> List[ModelPrediction]:
        """
        Run batch inference with parallel execution
        
        Args:
            model: Model identifier
            prompt: System prompt
            samples: List of Stage1Sample or Stage2Sample
            max_workers: Number of parallel workers
            show_progress: Show progress bar
        
        Returns:
            List of ModelPrediction objects
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        if show_progress:
            try:
                from tqdm import tqdm
                use_tqdm = True
            except ImportError:
                use_tqdm = False
                print(f"Processing {len(samples)} samples...")
        else:
            use_tqdm = False
        
        predictions = []
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(self.run_single, model, prompt, sample): sample
                for sample in samples
            }
            
            iterator = as_completed(futures)
            if use_tqdm and show_progress:
                iterator = tqdm(iterator, total=len(samples), desc="Running inference")
            
            for future in iterator:
                try:
                    result = future.result(timeout=self.config.timeout)
                    predictions.append(result)
                except Exception as e:
                    sample = futures[future]
                    sample_id = getattr(sample, 'id', 'unknown')
                    print(f"Error processing sample {sample_id}: {e}")
                    predictions.append(ModelPrediction(
                        sample_id=sample_id,
                        prediction=None,
                        confidence=0.0,
                        metadata={"error": str(e), "success": False}
                    ))
        
        return predictions
    
    def get_provider(self, model: str) -> Optional[BaseModelRunner]:
        """Determine provider from model name"""
        model_lower = model.lower()
        
        if "gpt" in model_lower or "o1" in model_lower:
            return self.providers.get("openai")
        elif "claude" in model_lower:
            return self.providers.get("anthropic")
        elif "local" in model_lower:
            return self.providers.get("local")
        else:
            # Try to guess from model name
            for provider_name, provider in self.providers.items():
                if provider is not None:
                    return provider
            return None
    
    def estimate_cost(
        self,
        model: str,
        num_samples: int,
        avg_input_tokens: int = 300,
        avg_output_tokens: int = 150
    ) -> Dict[str, float]:
        """
        Estimate cost for batch processing
        
        Args:
            model: Model identifier
            num_samples: Number of samples to process
            avg_input_tokens: Average input tokens per sample
            avg_output_tokens: Average output tokens per sample
        
        Returns:
            Dictionary with cost estimates
        """
        provider = self.get_provider(model)
        
        if provider is None:
            return {"error": "Provider not available"}
        
        cost_per_sample = provider.calculate_cost(
            model, avg_input_tokens, avg_output_tokens
        )
        total_cost = cost_per_sample * num_samples
        
        return {
            "model": model,
            "num_samples": num_samples,
            "cost_per_sample": cost_per_sample,
            "total_cost": total_cost,
            "total_tokens": (avg_input_tokens + avg_output_tokens) * num_samples,
        }


if __name__ == "__main__":
    # Example usage
    print("=== Model Runner Example ===\n")
    
    # Initialize runner
    runner = ModelRunner()
    
    # Cost estimation
    print("Cost estimates for 100 samples:")
    for model in ["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet-20241022"]:
        est = runner.estimate_cost(model, 100)
        if "error" not in est:
            print(f"{model}: ${est['total_cost']:.2f} (${est['cost_per_sample']:.6f} per sample)")
    
    # Example inference (requires API key)
    try:
        from dataset_schema import Stage1Sample, Platform
        
        sample = Stage1Sample(
            id="test_001",
            text="The Earth orbits around the Sun.",
            platform=Platform.TWITTER,
            has_claim=True,
            claims=["The Earth orbits around the Sun"],
            annotator="test"
        )
        
        prompt = "You are a fact-checking assistant. Determine if the text contains factual claims. Return JSON with {hasClaim: boolean, confidence: float}."
        
        print("\nRunning test inference...")
        result = runner.run_single("gpt-4o-mini", prompt, sample)
        print(f"Result: {result.prediction}, Confidence: {result.confidence}, Cost: ${result.cost:.6f}")
    
    except Exception as e:
        print(f"\nSkipping inference test: {e}")
