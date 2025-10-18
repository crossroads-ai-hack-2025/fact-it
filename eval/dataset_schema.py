"""
Dataset schema definitions for evaluation framework.

Defines data structures for Stage 1 (claim detection) and Stage 2 (verification)
test samples with type hints and validation.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any
from datetime import datetime
import json
from enum import Enum


class Platform(str, Enum):
    """Supported platforms"""
    TWITTER = "twitter"
    LINKEDIN = "linkedin"
    FACEBOOK = "facebook"
    ARTICLE = "article"
    OTHER = "other"


class Topic(str, Enum):
    """Content topics"""
    POLITICS = "politics"
    HEALTH = "health"
    SCIENCE = "science"
    BUSINESS = "business"
    OTHER = "other"


class Complexity(str, Enum):
    """Claim complexity levels"""
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"


class Verdict(str, Enum):
    """Stage 2 verification verdicts"""
    TRUE = "true"
    FALSE = "false"
    UNKNOWN = "unknown"


class Difficulty(str, Enum):
    """Verification difficulty"""
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


@dataclass
class Stage1Sample:
    """Stage 1: Claim Detection Sample"""
    id: str
    text: str
    platform: Platform
    has_claim: bool  # Ground truth
    claims: List[str] = field(default_factory=list)  # Extracted claims if has_claim=True
    annotator: str = ""
    confidence: float = 1.0  # Annotator confidence (0-1)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        """Validate and convert types"""
        if isinstance(self.platform, str):
            self.platform = Platform(self.platform)
        
        # Ensure claims list is populated if has_claim is True
        if self.has_claim and not self.claims:
            raise ValueError(f"Sample {self.id} has has_claim=True but no claims listed")
        
        # Add default metadata
        if "topic" not in self.metadata:
            self.metadata["topic"] = Topic.OTHER.value
        if "complexity" not in self.metadata:
            self.metadata["complexity"] = Complexity.MODERATE.value
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        d = asdict(self)
        d["platform"] = self.platform.value
        return d
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Stage1Sample":
        """Create from dictionary"""
        return cls(**data)


@dataclass
class Source:
    """Source citation for fact-checking"""
    url: str
    title: str
    reliability_score: float  # 0-1, based on source reputation
    excerpt: Optional[str] = None
    access_date: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Source":
        """Create from dictionary"""
        return cls(**data)


@dataclass
class Stage2Sample:
    """Stage 2: Verification Sample"""
    id: str
    claim: str
    verdict: Verdict  # Ground truth
    confidence: float  # Annotator confidence (0-1)
    sources: List[Source] = field(default_factory=list)
    explanation: str = ""
    reasoning: str = ""  # Annotator notes on decision process
    difficulty: Difficulty = Difficulty.MEDIUM
    topic: Topic = Topic.OTHER
    annotator: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        """Validate and convert types"""
        if isinstance(self.verdict, str):
            self.verdict = Verdict(self.verdict)
        if isinstance(self.difficulty, str):
            self.difficulty = Difficulty(self.difficulty)
        if isinstance(self.topic, str):
            self.topic = Topic(self.topic)
        
        # Convert source dicts to Source objects if needed
        if self.sources and isinstance(self.sources[0], dict):
            self.sources = [Source.from_dict(s) for s in self.sources]
        
        # Validate sources for non-unknown verdicts
        if self.verdict != Verdict.UNKNOWN and not self.sources:
            raise ValueError(f"Sample {self.id} has verdict {self.verdict} but no sources")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        d = asdict(self)
        d["verdict"] = self.verdict.value
        d["difficulty"] = self.difficulty.value
        d["topic"] = self.topic.value
        d["sources"] = [s.to_dict() for s in self.sources]
        return d
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Stage2Sample":
        """Create from dictionary"""
        return cls(**data)


@dataclass
class ModelPrediction:
    """Model prediction result"""
    sample_id: str
    prediction: Any  # bool for Stage 1, Verdict for Stage 2
    confidence: float  # Model confidence (0-1)
    explanation: Optional[str] = None
    sources: List[Source] = field(default_factory=list)
    latency: float = 0.0  # Inference time in seconds
    cost: float = 0.0  # API cost in USD
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        d = asdict(self)
        if isinstance(self.prediction, Enum):
            d["prediction"] = self.prediction.value
        d["sources"] = [s.to_dict() for s in self.sources]
        return d


@dataclass
class EvaluationResult:
    """Results from evaluation run"""
    run_id: str
    timestamp: str
    model: str
    prompt_id: str
    dataset: str
    stage: int  # 1 or 2
    metrics: Dict[str, float]
    predictions: List[ModelPrediction]
    config: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        d = asdict(self)
        d["predictions"] = [p.to_dict() for p in self.predictions]
        return d
    
    def save_json(self, filepath: str):
        """Save to JSON file"""
        with open(filepath, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)
    
    @classmethod
    def load_json(cls, filepath: str) -> "EvaluationResult":
        """Load from JSON file"""
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        # Reconstruct predictions
        data["predictions"] = [
            ModelPrediction(**p) for p in data["predictions"]
        ]
        
        return cls(**data)


def validate_dataset_balance(samples: List[Any], label_field: str) -> Dict[str, float]:
    """
    Check dataset balance and return label distribution
    
    Args:
        samples: List of Stage1Sample or Stage2Sample
        label_field: Field name to check ("has_claim" or "verdict")
    
    Returns:
        Dictionary with label counts and percentages
    """
    from collections import Counter
    
    labels = [getattr(s, label_field) for s in samples]
    counts = Counter(labels)
    total = len(samples)
    
    return {
        str(label): {
            "count": count,
            "percentage": (count / total) * 100
        }
        for label, count in counts.items()
    }


def export_to_jsonl(samples: List[Any], filepath: str):
    """
    Export dataset to JSONL format (one JSON object per line)
    Useful for streaming large datasets
    """
    with open(filepath, 'w') as f:
        for sample in samples:
            f.write(json.dumps(sample.to_dict()) + '\n')


def load_from_jsonl(filepath: str, sample_class) -> List[Any]:
    """
    Load dataset from JSONL format
    
    Args:
        filepath: Path to JSONL file
        sample_class: Stage1Sample or Stage2Sample class
    """
    samples = []
    with open(filepath, 'r') as f:
        for line in f:
            data = json.loads(line)
            samples.append(sample_class.from_dict(data))
    return samples
