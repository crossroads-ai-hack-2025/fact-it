"""
Dataset Manager for loading and managing test datasets.

Handles dataset loading, validation, train/val/test splitting,
and filtering operations.
"""

import json
import os
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import asdict
import random

from dataset_schema import (
    Stage1Sample, Stage2Sample, Platform, Topic, Complexity,
    Verdict, Difficulty, validate_dataset_balance
)


class DatasetManager:
    """Manages test datasets for evaluation"""
    
    def __init__(self, data_dir: str = "./datasets"):
        """
        Initialize dataset manager
        
        Args:
            data_dir: Directory containing dataset JSON files
        """
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        self.stage1_data: Optional[List[Stage1Sample]] = None
        self.stage2_data: Optional[List[Stage2Sample]] = None
        
        # Cached splits
        self._stage1_splits: Optional[Dict[str, List[Stage1Sample]]] = None
        self._stage2_splits: Optional[Dict[str, List[Stage2Sample]]] = None
    
    def load_stage1(self, filename: str = "stage1_dataset.json") -> List[Stage1Sample]:
        """
        Load Stage 1 dataset from JSON file
        
        Args:
            filename: JSON file name in data_dir
        
        Returns:
            List of Stage1Sample objects
        """
        filepath = self.data_dir / filename
        
        if not filepath.exists():
            print(f"Warning: {filepath} not found. Creating empty dataset.")
            return []
        
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        samples = []
        for item in data:
            try:
                sample = Stage1Sample.from_dict(item)
                samples.append(sample)
            except Exception as e:
                print(f"Error loading sample {item.get('id', 'unknown')}: {e}")
        
        self.stage1_data = samples
        print(f"Loaded {len(samples)} Stage 1 samples from {filepath}")
        
        # Print dataset balance
        balance = validate_dataset_balance(samples, "has_claim")
        print(f"Dataset balance: {balance}")
        
        return samples
    
    def load_stage2(self, filename: str = "stage2_dataset.json") -> List[Stage2Sample]:
        """
        Load Stage 2 dataset from JSON file
        
        Args:
            filename: JSON file name in data_dir
        
        Returns:
            List of Stage2Sample objects
        """
        filepath = self.data_dir / filename
        
        if not filepath.exists():
            print(f"Warning: {filepath} not found. Creating empty dataset.")
            return []
        
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        samples = []
        for item in data:
            try:
                sample = Stage2Sample.from_dict(item)
                samples.append(sample)
            except Exception as e:
                print(f"Error loading sample {item.get('id', 'unknown')}: {e}")
        
        self.stage2_data = samples
        print(f"Loaded {len(samples)} Stage 2 samples from {filepath}")
        
        # Print dataset balance
        balance = validate_dataset_balance(samples, "verdict")
        print(f"Dataset balance: {balance}")
        
        return samples
    
    def save_stage1(self, samples: List[Stage1Sample], filename: str = "stage1_dataset.json"):
        """Save Stage 1 dataset to JSON file"""
        filepath = self.data_dir / filename
        
        with open(filepath, 'w') as f:
            json.dump([s.to_dict() for s in samples], f, indent=2)
        
        print(f"Saved {len(samples)} Stage 1 samples to {filepath}")
    
    def save_stage2(self, samples: List[Stage2Sample], filename: str = "stage2_dataset.json"):
        """Save Stage 2 dataset to JSON file"""
        filepath = self.data_dir / filename
        
        with open(filepath, 'w') as f:
            json.dump([s.to_dict() for s in samples], f, indent=2)
        
        print(f"Saved {len(samples)} Stage 2 samples to {filepath}")
    
    def train_val_test_split(
        self,
        stage: int,
        train: float = 0.7,
        val: float = 0.15,
        test: float = 0.15,
        stratify_by: Optional[str] = None,
        random_seed: int = 42
    ) -> Dict[str, List]:
        """
        Split dataset into train/validation/test sets
        
        Args:
            stage: 1 or 2
            train: Proportion for training set
            val: Proportion for validation set
            test: Proportion for test set
            stratify_by: Field to stratify by (e.g., "has_claim", "verdict", "platform")
            random_seed: Random seed for reproducibility
        
        Returns:
            Dictionary with "train", "val", "test" keys
        """
        if abs(train + val + test - 1.0) > 0.01:
            raise ValueError("train + val + test must sum to 1.0")
        
        # Load data if not already loaded
        if stage == 1:
            if self.stage1_data is None:
                self.load_stage1()
            samples = self.stage1_data
            cache_key = f"stage1_{train}_{val}_{test}_{stratify_by}_{random_seed}"
        else:
            if self.stage2_data is None:
                self.load_stage2()
            samples = self.stage2_data
            cache_key = f"stage2_{train}_{val}_{test}_{stratify_by}_{random_seed}"
        
        # Check cache
        splits_cache = self._stage1_splits if stage == 1 else self._stage2_splits
        if splits_cache and cache_key in splits_cache:
            return splits_cache[cache_key]
        
        random.seed(random_seed)
        
        if stratify_by:
            # Stratified split
            splits = self._stratified_split(samples, train, val, test, stratify_by)
        else:
            # Random split
            shuffled = samples.copy()
            random.shuffle(shuffled)
            
            n = len(shuffled)
            train_end = int(n * train)
            val_end = train_end + int(n * val)
            
            splits = {
                "train": shuffled[:train_end],
                "val": shuffled[train_end:val_end],
                "test": shuffled[val_end:]
            }
        
        # Cache the splits
        if stage == 1:
            if self._stage1_splits is None:
                self._stage1_splits = {}
            self._stage1_splits[cache_key] = splits
        else:
            if self._stage2_splits is None:
                self._stage2_splits = {}
            self._stage2_splits[cache_key] = splits
        
        # Print split info
        print(f"\nDataset splits (stage {stage}):")
        for split_name, split_data in splits.items():
            print(f"  {split_name}: {len(split_data)} samples")
        
        return splits
    
    def _stratified_split(
        self,
        samples: List,
        train: float,
        val: float,
        test: float,
        stratify_field: str
    ) -> Dict[str, List]:
        """
        Perform stratified split maintaining label distribution
        
        Args:
            samples: List of samples
            train, val, test: Split proportions
            stratify_field: Field to stratify by
        
        Returns:
            Dictionary with train/val/test splits
        """
        from collections import defaultdict
        
        # Group by stratify field
        groups = defaultdict(list)
        for sample in samples:
            # Handle nested fields (e.g., "metadata.topic")
            value = sample
            for field in stratify_field.split('.'):
                value = getattr(value, field)
            
            # Convert enums to strings
            if hasattr(value, 'value'):
                value = value.value
            
            groups[value].append(sample)
        
        # Split each group
        train_data, val_data, test_data = [], [], []
        
        for group_samples in groups.values():
            random.shuffle(group_samples)
            n = len(group_samples)
            train_end = int(n * train)
            val_end = train_end + int(n * val)
            
            train_data.extend(group_samples[:train_end])
            val_data.extend(group_samples[train_end:val_end])
            test_data.extend(group_samples[val_end:])
        
        # Shuffle final splits
        random.shuffle(train_data)
        random.shuffle(val_data)
        random.shuffle(test_data)
        
        return {
            "train": train_data,
            "val": val_data,
            "test": test_data
        }
    
    def get_subset(
        self,
        stage: int,
        filters: Dict[str, Any],
        split: Optional[str] = None
    ) -> List:
        """
        Filter dataset by criteria
        
        Args:
            stage: 1 or 2
            filters: Dictionary of field:value pairs to filter by
            split: If provided, filter from specific split (train/val/test)
        
        Returns:
            Filtered list of samples
        
        Examples:
            # Get all Twitter posts with claims
            manager.get_subset(1, {"platform": "twitter", "has_claim": True})
            
            # Get hard verification samples
            manager.get_subset(2, {"difficulty": "hard"})
            
            # Get false claims from test set
            splits = manager.train_val_test_split(2)
            manager.get_subset(2, {"verdict": "false"}, split="test")
        """
        if split:
            splits = self.train_val_test_split(stage)
            samples = splits[split]
        else:
            samples = self.stage1_data if stage == 1 else self.stage2_data
            if samples is None:
                if stage == 1:
                    self.load_stage1()
                    samples = self.stage1_data
                else:
                    self.load_stage2()
                    samples = self.stage2_data
        
        filtered = []
        for sample in samples:
            match = True
            for field, value in filters.items():
                # Handle nested fields
                sample_value = sample
                for f in field.split('.'):
                    sample_value = getattr(sample_value, f)
                
                # Convert enums to strings for comparison
                if hasattr(sample_value, 'value'):
                    sample_value = sample_value.value
                if hasattr(value, 'value'):
                    value = value.value
                
                if sample_value != value:
                    match = False
                    break
            
            if match:
                filtered.append(sample)
        
        return filtered
    
    def get_statistics(self, stage: int) -> Dict[str, Any]:
        """
        Get dataset statistics
        
        Returns comprehensive statistics including:
        - Total samples
        - Label distribution
        - Platform distribution
        - Topic distribution
        - Complexity/difficulty distribution
        """
        samples = self.stage1_data if stage == 1 else self.stage2_data
        if samples is None:
            if stage == 1:
                self.load_stage1()
                samples = self.stage1_data
            else:
                self.load_stage2()
                samples = self.stage2_data
        
        from collections import Counter
        
        stats = {
            "total_samples": len(samples),
            "label_distribution": {},
            "platform_distribution": {},
            "topic_distribution": {},
        }
        
        if stage == 1:
            # Stage 1 specific stats
            stats["label_distribution"] = dict(Counter(s.has_claim for s in samples))
            stats["platform_distribution"] = dict(Counter(s.platform.value for s in samples))
            stats["topic_distribution"] = dict(Counter(s.metadata.get("topic", "other") for s in samples))
            stats["complexity_distribution"] = dict(Counter(s.metadata.get("complexity", "moderate") for s in samples))
            
            # Claim statistics
            stats["avg_claims_per_sample"] = sum(len(s.claims) for s in samples if s.has_claim) / max(sum(s.has_claim for s in samples), 1)
        else:
            # Stage 2 specific stats
            stats["label_distribution"] = dict(Counter(s.verdict.value for s in samples))
            stats["topic_distribution"] = dict(Counter(s.topic.value for s in samples))
            stats["difficulty_distribution"] = dict(Counter(s.difficulty.value for s in samples))
            
            # Source statistics
            stats["avg_sources_per_sample"] = sum(len(s.sources) for s in samples) / len(samples)
            stats["avg_source_reliability"] = sum(sum(src.reliability_score for src in s.sources) for s in samples if s.sources) / sum(len(s.sources) for s in samples if s.sources)
        
        return stats
    
    def export_to_csv(self, stage: int, output_path: str):
        """Export dataset to CSV format"""
        import csv
        
        samples = self.stage1_data if stage == 1 else self.stage2_data
        if samples is None:
            if stage == 1:
                self.load_stage1()
                samples = self.stage1_data
            else:
                self.load_stage2()
                samples = self.stage2_data
        
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            if stage == 1:
                fieldnames = ['id', 'text', 'platform', 'has_claim', 'claims', 'annotator', 'confidence']
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                
                for sample in samples:
                    writer.writerow({
                        'id': sample.id,
                        'text': sample.text,
                        'platform': sample.platform.value,
                        'has_claim': sample.has_claim,
                        'claims': '; '.join(sample.claims),
                        'annotator': sample.annotator,
                        'confidence': sample.confidence
                    })
            else:
                fieldnames = ['id', 'claim', 'verdict', 'confidence', 'explanation', 'difficulty', 'topic', 'num_sources']
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                
                for sample in samples:
                    writer.writerow({
                        'id': sample.id,
                        'claim': sample.claim,
                        'verdict': sample.verdict.value,
                        'confidence': sample.confidence,
                        'explanation': sample.explanation,
                        'difficulty': sample.difficulty.value,
                        'topic': sample.topic.value,
                        'num_sources': len(sample.sources)
                    })
        
        print(f"Exported {len(samples)} samples to {output_path}")


def create_example_datasets(data_dir: str = "./datasets"):
    """
    Create example datasets for testing
    
    This creates small example datasets to demonstrate the format
    """
    manager = DatasetManager(data_dir)
    
    # Create example Stage 1 samples
    stage1_samples = [
        Stage1Sample(
            id="s1_001",
            text="I think remote work is more productive for most developers.",
            platform=Platform.TWITTER,
            has_claim=False,
            claims=[],
            annotator="annotator1",
            confidence=0.95,
            metadata={"topic": "business", "complexity": "simple"}
        ),
        Stage1Sample(
            id="s1_002",
            text="The unemployment rate in the US fell to 3.5% in December 2023.",
            platform=Platform.LINKEDIN,
            has_claim=True,
            claims=["The unemployment rate in the US fell to 3.5% in December 2023"],
            annotator="annotator1",
            confidence=1.0,
            metadata={"topic": "business", "complexity": "simple"}
        ),
        Stage1Sample(
            id="s1_003",
            text="Studies show that drinking coffee reduces the risk of type 2 diabetes by 30%.",
            platform=Platform.ARTICLE,
            has_claim=True,
            claims=["Drinking coffee reduces the risk of type 2 diabetes by 30%"],
            annotator="annotator2",
            confidence=0.9,
            metadata={"topic": "health", "complexity": "moderate"}
        ),
    ]
    
    # Create example Stage 2 samples
    from dataset_schema import Source
    
    stage2_samples = [
        Stage2Sample(
            id="s2_001",
            claim="The unemployment rate in the US fell to 3.5% in December 2023",
            verdict=Verdict.TRUE,
            confidence=0.95,
            sources=[
                Source(
                    url="https://www.bls.gov/news.release/empsit.nr0.htm",
                    title="Bureau of Labor Statistics - Employment Situation",
                    reliability_score=0.95,
                    excerpt="The unemployment rate edged down to 3.5 percent in December."
                )
            ],
            explanation="The claim is accurate according to official BLS data.",
            reasoning="Verified against official government statistics",
            difficulty=Difficulty.EASY,
            topic=Topic.BUSINESS,
            annotator="annotator1"
        ),
        Stage2Sample(
            id="s2_002",
            claim="Drinking coffee reduces the risk of type 2 diabetes by 30%",
            verdict=Verdict.TRUE,
            confidence=0.85,
            sources=[
                Source(
                    url="https://pubmed.ncbi.nlm.nih.gov/123456789/",
                    title="Coffee consumption and risk of type 2 diabetes: A meta-analysis",
                    reliability_score=0.9,
                    excerpt="Coffee consumption was associated with a 30% lower risk of type 2 diabetes."
                )
            ],
            explanation="Multiple meta-analyses support this claim with similar effect sizes.",
            reasoning="Strong evidence from systematic reviews",
            difficulty=Difficulty.MEDIUM,
            topic=Topic.HEALTH,
            annotator="annotator2"
        ),
    ]
    
    # Save datasets
    manager.save_stage1(stage1_samples, "stage1_example.json")
    manager.save_stage2(stage2_samples, "stage2_example.json")
    
    print("\nExample datasets created successfully!")
    print(f"Location: {data_dir}")
    print("Files: stage1_example.json, stage2_example.json")


if __name__ == "__main__":
    # Create example datasets for testing
    create_example_datasets()
    
    # Demonstrate usage
    manager = DatasetManager()
    
    # Load datasets
    stage1 = manager.load_stage1("stage1_example.json")
    stage2 = manager.load_stage2("stage2_example.json")
    
    # Get statistics
    print("\n=== Stage 1 Statistics ===")
    stats1 = manager.get_statistics(1)
    for key, value in stats1.items():
        print(f"{key}: {value}")
    
    print("\n=== Stage 2 Statistics ===")
    stats2 = manager.get_statistics(2)
    for key, value in stats2.items():
        print(f"{key}: {value}")
    
    # Demonstrate filtering
    print("\n=== Filtering Examples ===")
    claims_only = manager.get_subset(1, {"has_claim": True})
    print(f"Samples with claims: {len(claims_only)}")
    
    true_verdicts = manager.get_subset(2, {"verdict": "true"})
    print(f"True verdicts: {len(true_verdicts)}")
