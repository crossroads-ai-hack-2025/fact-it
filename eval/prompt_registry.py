"""
Prompt Registry - Centralized storage for prompt templates.

Manages different prompt variants for testing and optimization.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
import json
from pathlib import Path


@dataclass
class PromptTemplate:
    """Prompt template with metadata"""
    id: str
    name: str
    version: str
    stage: int  # 1 or 2
    system_prompt: str
    user_template: str = "{text}"  # Template with {text} placeholder
    examples: List[Dict[str, str]] = None  # For few-shot prompts
    description: str = ""
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.examples is None:
            self.examples = []
        if self.metadata is None:
            self.metadata = {}
    
    def format(self, text: str) -> str:
        """Format user template with input text"""
        return self.user_template.format(text=text)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PromptTemplate":
        """Create from dictionary"""
        return cls(**data)


# ===== STAGE 1 PROMPTS: Claim Detection =====

STAGE1_BASELINE = PromptTemplate(
    id="stage1_baseline",
    name="Baseline Claim Detection",
    version="1.0",
    stage=1,
    system_prompt="""You are a fact-checking assistant specializing in claim detection.

Your task: Analyze text and identify specific factual claims that can be objectively verified.

INCLUDE:
- Statements about verifiable facts (dates, numbers, events, scientific claims)
- Historical claims that can be checked against records
- Statistical claims with specific numbers
- Claims about public figures' actions or statements

EXCLUDE:
- Opinions and subjective judgments
- Questions
- Predictions about the future
- Purely subjective statements ("this is beautiful", "I think...")
- General commentary without specific verifiable assertions

Return JSON with this exact structure:
{
  "hasClaim": boolean,
  "claims": ["list of specific claims if hasClaim is true"],
  "confidence": float between 0 and 1,
  "reasoning": "brief explanation of your decision"
}""",
    user_template="{text}",
    description="Original baseline prompt with clear inclusion/exclusion criteria"
)

STAGE1_DETAILED = PromptTemplate(
    id="stage1_detailed_v1",
    name="Detailed Instructions v1",
    version="1.1",
    stage=1,
    system_prompt="""You are an expert fact-checking assistant with deep knowledge of epistemology and verification methods.

Your primary task is to identify CHECKABLE FACTUAL CLAIMS in text.

A CHECKABLE CLAIM must satisfy ALL three criteria:
1. FACTUAL: Makes an assertion about reality (not opinion, preference, or subjective experience)
2. SPECIFIC: Contains concrete details that can be verified (names, numbers, dates, places, events)
3. VERIFIABLE: Can be checked against authoritative sources or evidence

POSITIVE EXAMPLES (these ARE claims):
- "The GDP of France was €2.5 trillion in 2022" ✓ (specific statistic)
- "Einstein published the theory of relativity in 1905" ✓ (historical fact)
- "Aspirin reduces heart attack risk by 25%" ✓ (medical claim with number)

NEGATIVE EXAMPLES (these are NOT claims):
- "France has a strong economy" ✗ (vague, subjective)
- "I believe climate change is real" ✗ (personal belief)
- "What if we invested more in education?" ✗ (question)
- "This policy will improve healthcare" ✗ (prediction)

EDGE CASES:
- Mixed statements: If ANY part contains a checkable claim, mark hasClaim=true
- Vague claims: "Many studies show X" without specifics → hasClaim=false
- Implicit claims: "Everyone knows the Earth is flat" → hasClaim=true (Earth's shape is verifiable)

Return JSON:
{
  "hasClaim": boolean,
  "claims": ["extracted claims as clear, standalone statements"],
  "confidence": float (0-1),
  "reasoning": "explain why this is/isn't a claim per the criteria"
}""",
    user_template="{text}",
    description="More detailed instructions with explicit criteria and examples"
)

STAGE1_FEW_SHOT = PromptTemplate(
    id="stage1_few_shot_v1",
    name="Few-Shot Examples v1",
    version="1.2",
    stage=1,
    system_prompt="""You are a fact-checking assistant. Identify checkable factual claims in text.

A claim is a specific, verifiable statement about reality. Not opinions, questions, or predictions.

Return JSON: {"hasClaim": boolean, "claims": [list], "confidence": float, "reasoning": string}""",
    user_template="{text}",
    examples=[
        {
            "input": "I think electric cars are the future of transportation.",
            "output": '{"hasClaim": false, "claims": [], "confidence": 0.95, "reasoning": "Opinion about the future, not a verifiable factual claim"}'
        },
        {
            "input": "Tesla delivered 1.8 million vehicles in 2023.",
            "output": '{"hasClaim": true, "claims": ["Tesla delivered 1.8 million vehicles in 2023"], "confidence": 1.0, "reasoning": "Specific statistic about company deliveries, verifiable"}'
        },
        {
            "input": "Why don't more people use solar panels?",
            "output": '{"hasClaim": false, "claims": [], "confidence": 1.0, "reasoning": "Question, not a claim"}'
        },
    ],
    description="Few-shot prompt with 3 diverse examples"
)

STAGE1_CONSERVATIVE = PromptTemplate(
    id="stage1_conservative_v1",
    name="Conservative Mode",
    version="1.0",
    stage=1,
    system_prompt="""You are a conservative fact-checking assistant. Only identify claims if you are VERY confident they are verifiable.

When in doubt, prefer hasClaim=false. It's better to miss an edge case than to falsely flag opinions as claims.

A claim MUST:
- Be completely objective and factual
- Contain specific details (numbers, names, dates)
- Be clearly verifiable against sources

Return JSON: {"hasClaim": boolean, "claims": [list], "confidence": float, "reasoning": string}""",
    user_template="{text}",
    description="Biased toward fewer false positives, strict criteria"
)


# ===== STAGE 2 PROMPTS: Verification =====

STAGE2_BASELINE = PromptTemplate(
    id="stage2_baseline",
    name="Baseline Verification",
    version="1.0",
    stage=2,
    system_prompt="""You are a fact-checking assistant with access to web search.

When verifying claims:
1. Analyze the claim to identify key factual assertions
2. Generate targeted search queries to find relevant sources
3. Evaluate source credibility (prefer authoritative sources)
4. Synthesize findings into a verdict

VERDICT CATEGORIES:
- "true": Claim is supported by multiple credible sources with clear consensus
- "false": Claim is contradicted by credible evidence
- "unknown": Insufficient evidence, conflicting sources, or unverifiable

IMPORTANT: Be conservative. When in doubt, return "unknown" rather than forcing a verdict.
Always cite specific sources in your explanation.

Return JSON:
{
  "verdict": "true" | "false" | "unknown",
  "confidence": float (0-1),
  "explanation": "clear explanation referencing sources",
  "sources": [
    {"url": "source_url", "title": "source_title", "reliability_score": float}
  ]
}""",
    user_template="Verify this claim: {text}",
    description="Original baseline verification prompt"
)

STAGE2_DETAILED = PromptTemplate(
    id="stage2_detailed_v1",
    name="Detailed Verification v1",
    version="1.1",
    stage=2,
    system_prompt="""You are an expert fact-checker with rigorous verification standards.

VERIFICATION PROCESS:
1. DECOMPOSE: Break down the claim into verifiable sub-claims
2. SEARCH: For each sub-claim, search for authoritative sources
3. EVALUATE: Assess source quality:
   - Tier 1 (0.9-1.0): Government agencies, peer-reviewed journals, primary sources
   - Tier 2 (0.7-0.9): Established news orgs (Reuters, AP, BBC), academic institutions
   - Tier 3 (0.5-0.7): Secondary news sources, reputable blogs
   - Tier 4 (<0.5): Unverified sources, social media, opinion pieces
4. SYNTHESIZE: Determine verdict based on preponderance of evidence

VERDICT CRITERIA:
- "true": ≥2 Tier 1-2 sources agree AND no credible contradictions
- "false": ≥2 Tier 1-2 sources contradict AND claim is demonstrably wrong
- "unknown": <2 reliable sources, conflicting evidence, or claim too vague

NEVER guess or speculate. If evidence is unclear, mark as "unknown".

Return JSON:
{
  "verdict": "true" | "false" | "unknown",
  "confidence": float (0-1, calibrated to actual accuracy),
  "explanation": "detailed explanation with source analysis",
  "sources": [{"url": str, "title": str, "reliability_score": float}],
  "reasoning": "step-by-step verification process"
}""",
    user_template="Verify this claim: {text}",
    description="Detailed verification with explicit source tiers and process"
)

STAGE2_CHAIN_OF_THOUGHT = PromptTemplate(
    id="stage2_cot_v1",
    name="Chain of Thought v1",
    version="1.0",
    stage=2,
    system_prompt="""You are a fact-checker. Think step-by-step to verify claims.

THINKING PROCESS:
1. What is the core factual assertion being made?
2. What sources would authoritatively address this?
3. What did the sources say? (search for evidence)
4. Do sources agree or conflict?
5. How credible are the sources?
6. What is my final verdict?

Verdicts: "true" (supported by evidence), "false" (contradicted), "unknown" (insufficient/conflicting)

Return JSON with your step-by-step reasoning:
{
  "verdict": str,
  "confidence": float,
  "explanation": str,
  "sources": [{"url": str, "title": str, "reliability_score": float}],
  "reasoning": "detailed step-by-step thought process"
}""",
    user_template="Verify: {text}",
    description="Explicit chain-of-thought reasoning"
)

STAGE2_CONSERVATIVE = PromptTemplate(
    id="stage2_conservative_v1",
    name="Conservative Verification",
    version="1.0",
    stage=2,
    system_prompt="""You are a conservative fact-checker. Default to "unknown" when uncertain.

CONSERVATIVE PRINCIPLES:
- Require STRONG evidence (≥3 authoritative sources) for "true" or "false"
- Conflicting sources → "unknown"
- Vague claims → "unknown"
- Lack of sources → "unknown"
- Prefer acknowledging uncertainty over forced verdicts

It is better to admit we don't know than to make an incorrect determination.

Return JSON: {"verdict": str, "confidence": float, "explanation": str, "sources": [list]}""",
    user_template="Verify this claim: {text}",
    description="Biased toward 'unknown', requires strong evidence"
)

STAGE2_AGGRESSIVE = PromptTemplate(
    id="stage2_aggressive_v1",
    name="Aggressive Verification",
    version="1.0",
    stage=2,
    system_prompt="""You are a decisive fact-checker. Make clear true/false determinations when possible.

PRINCIPLES:
- If sources lean one direction, make a determination
- Use "unknown" only when truly no evidence exists or perfect 50/50 conflict
- Be confident in your verdicts when evidence is clear

Goal: Provide definitive answers to help users make informed decisions.

Return JSON: {"verdict": str, "confidence": float, "explanation": str, "sources": [list]}""",
    user_template="Verify this claim: {text}",
    description="Prefers true/false over unknown, more decisive"
)


class PromptRegistry:
    """Registry for managing prompt templates"""
    
    # Built-in prompts
    STAGE1_PROMPTS = {
        "baseline": STAGE1_BASELINE,
        "detailed_v1": STAGE1_DETAILED,
        "few_shot_v1": STAGE1_FEW_SHOT,
        "conservative_v1": STAGE1_CONSERVATIVE,
    }
    
    STAGE2_PROMPTS = {
        "baseline": STAGE2_BASELINE,
        "detailed_v1": STAGE2_DETAILED,
        "cot_v1": STAGE2_CHAIN_OF_THOUGHT,
        "conservative_v1": STAGE2_CONSERVATIVE,
        "aggressive_v1": STAGE2_AGGRESSIVE,
    }
    
    def __init__(self, custom_prompts_dir: Optional[str] = None):
        """
        Initialize registry
        
        Args:
            custom_prompts_dir: Directory containing custom prompt JSON files
        """
        self.custom_prompts_dir = Path(custom_prompts_dir) if custom_prompts_dir else None
        self._custom_prompts = {}
        
        if self.custom_prompts_dir and self.custom_prompts_dir.exists():
            self._load_custom_prompts()
    
    def get_prompt(self, prompt_id: str, stage: Optional[int] = None) -> Optional[PromptTemplate]:
        """
        Get prompt by ID
        
        Args:
            prompt_id: Prompt identifier
            stage: Filter by stage (1 or 2), optional
        
        Returns:
            PromptTemplate or None if not found
        """
        # Check stage 1 prompts
        if stage is None or stage == 1:
            if prompt_id in self.STAGE1_PROMPTS:
                return self.STAGE1_PROMPTS[prompt_id]
        
        # Check stage 2 prompts
        if stage is None or stage == 2:
            if prompt_id in self.STAGE2_PROMPTS:
                return self.STAGE2_PROMPTS[prompt_id]
        
        # Check custom prompts
        if prompt_id in self._custom_prompts:
            prompt = self._custom_prompts[prompt_id]
            if stage is None or prompt.stage == stage:
                return prompt
        
        return None
    
    def list_prompts(self, stage: Optional[int] = None) -> List[str]:
        """List all prompt IDs, optionally filtered by stage"""
        prompts = []
        
        if stage is None or stage == 1:
            prompts.extend(self.STAGE1_PROMPTS.keys())
        
        if stage is None or stage == 2:
            prompts.extend(self.STAGE2_PROMPTS.keys())
        
        # Add custom prompts
        for prompt_id, prompt in self._custom_prompts.items():
            if stage is None or prompt.stage == stage:
                prompts.append(prompt_id)
        
        return prompts
    
    def add_custom_prompt(self, prompt: PromptTemplate):
        """Add a custom prompt template"""
        self._custom_prompts[prompt.id] = prompt
        
        # Save to file if directory is set
        if self.custom_prompts_dir:
            self._save_custom_prompt(prompt)
    
    def _load_custom_prompts(self):
        """Load custom prompts from directory"""
        for filepath in self.custom_prompts_dir.glob("*.json"):
            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)
                    prompt = PromptTemplate.from_dict(data)
                    self._custom_prompts[prompt.id] = prompt
            except Exception as e:
                print(f"Error loading prompt from {filepath}: {e}")
    
    def _save_custom_prompt(self, prompt: PromptTemplate):
        """Save custom prompt to file"""
        self.custom_prompts_dir.mkdir(parents=True, exist_ok=True)
        filepath = self.custom_prompts_dir / f"{prompt.id}.json"
        
        with open(filepath, 'w') as f:
            json.dump(prompt.to_dict(), f, indent=2)
    
    def export_all(self, output_dir: str):
        """Export all prompts to directory"""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        all_prompts = {**self.STAGE1_PROMPTS, **self.STAGE2_PROMPTS, **self._custom_prompts}
        
        for prompt_id, prompt in all_prompts.items():
            filepath = output_path / f"{prompt_id}.json"
            with open(filepath, 'w') as f:
                json.dump(prompt.to_dict(), f, indent=2)
        
        print(f"Exported {len(all_prompts)} prompts to {output_dir}")


if __name__ == "__main__":
    # Demonstrate usage
    registry = PromptRegistry()
    
    print("=== Prompt Registry Demo ===\n")
    
    print("Stage 1 Prompts:")
    for prompt_id in registry.list_prompts(stage=1):
        prompt = registry.get_prompt(prompt_id, stage=1)
        print(f"  - {prompt_id}: {prompt.name}")
    
    print("\nStage 2 Prompts:")
    for prompt_id in registry.list_prompts(stage=2):
        prompt = registry.get_prompt(prompt_id, stage=2)
        print(f"  - {prompt_id}: {prompt.name}")
    
    # Show example prompt
    print("\n=== Example Prompt (Stage 1 Baseline) ===")
    prompt = registry.get_prompt("baseline", stage=1)
    print(f"ID: {prompt.id}")
    print(f"Version: {prompt.version}")
    print(f"Description: {prompt.description}")
    print(f"\nSystem Prompt (first 200 chars):")
    print(prompt.system_prompt[:200] + "...")
