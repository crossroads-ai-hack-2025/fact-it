/**
 * FEVER Dataset Adapter
 *
 * Transforms FEVER (Fact Extraction and VERification) dataset to Stage2Sample format.
 * FEVER contains claims verified against Wikipedia with evidence sentences.
 *
 * Source: https://fever.ai/dataset/fever.html
 * Paper: https://arxiv.org/abs/1803.05355
 */

import { Stage2Sample, Verdict, Difficulty, Topic, Source } from '../types/dataset-schema';

/**
 * FEVER raw format (from JSONL files)
 */
export interface FEVERClaim {
  id: number;
  label: string; // "SUPPORTS" | "REFUTES" | "NOT ENOUGH INFO"
  claim: string;
  evidence?: Array<
    Array<
      [
        number, // Annotation ID
        number | null, // Evidence ID
        string | null, // Wikipedia URL (title)
        number | null // Sentence ID
      ]
    >
  >;
}

/**
 * Transform FEVER label to Verdict
 */
function transformLabel(label: string): Verdict {
  const normalized = label.toUpperCase().trim();

  if (normalized === 'SUPPORTS') {
    return Verdict.TRUE;
  } else if (normalized === 'REFUTES') {
    return Verdict.FALSE;
  } else {
    // "NOT ENOUGH INFO"
    return Verdict.UNKNOWN;
  }
}

/**
 * Classify topic from claim text (simple heuristic)
 */
function classifyTopic(claim: string): Topic {
  const text = claim.toLowerCase();

  if (/(election|president|senator|congress|government|law|policy|vote|minister|parliament)/i.test(text)) {
    return Topic.POLITICS;
  } else if (/(vaccine|disease|medicine|health|doctor|hospital|drug|treatment)/i.test(text)) {
    return Topic.HEALTH;
  } else if (/(study|research|scientist|experiment|climate|space|university|physics|chemistry)/i.test(text)) {
    return Topic.SCIENCE;
  } else if (/(company|economy|stock|market|business|revenue|profit|industry|trade)/i.test(text)) {
    return Topic.BUSINESS;
  } else {
    return Topic.OTHER;
  }
}

/**
 * Estimate difficulty based on claim complexity
 */
function estimateDifficulty(claim: FEVERClaim): Difficulty {
  const claimLength = claim.claim.length;
  const numWords = claim.claim.split(/\s+/).length;
  const numEvidenceSets = claim.evidence?.length || 0;
  const totalEvidenceItems = claim.evidence?.flat().length || 0;

  // Complex if:
  // - Long claim
  // - Multiple evidence sets (requires reasoning across sources)
  // - Many evidence items
  if (numEvidenceSets > 2 || totalEvidenceItems > 3 || claimLength > 200) {
    return Difficulty.HARD;
  } else if (numEvidenceSets > 1 || totalEvidenceItems > 1 || numWords > 15) {
    return Difficulty.MEDIUM;
  } else {
    return Difficulty.EASY;
  }
}

/**
 * Extract sources from FEVER evidence
 *
 * FEVER evidence is Wikipedia-based with format:
 * [Annotation ID, Evidence ID, Wikipedia Title, Sentence ID]
 */
function extractSources(claim: FEVERClaim): Source[] {
  if (!claim.evidence || claim.evidence.length === 0) {
    return [];
  }

  const sources: Source[] = [];
  const seenPages = new Set<string>();

  for (const evidenceSet of claim.evidence) {
    for (const [_annotationId, _evidenceId, wikiTitle, sentenceId] of evidenceSet) {
      // Skip if no Wikipedia title
      if (!wikiTitle) {
        continue;
      }

      // Create unique key for page + sentence
      const key = `${wikiTitle}_${sentenceId}`;
      if (seenPages.has(key)) {
        continue;
      }
      seenPages.add(key);

      // Convert Wikipedia title to URL
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, '_'))}`;

      sources.push({
        url,
        title: `${wikiTitle} - Wikipedia`,
        reliabilityScore: 0.85, // Wikipedia is generally reliable, but not perfect
        excerpt: `Sentence ${sentenceId} from ${wikiTitle}`, // FEVER doesn't include actual text
        accessDate: new Date().toISOString().split('T')[0],
      });
    }
  }

  return sources;
}

/**
 * Calculate confidence based on label and evidence
 */
function calculateConfidence(claim: FEVERClaim): number {
  const label = claim.label.toUpperCase();

  // "NOT ENOUGH INFO" has lower confidence
  if (label === 'NOT ENOUGH INFO') {
    return 0.70;
  }

  // Base confidence for human-annotated data
  let confidence = 0.90;

  const numSources = extractSources(claim).length;

  // Boost confidence for multiple evidence sources
  if (numSources >= 3) {
    confidence = 0.95;
  } else if (numSources >= 2) {
    confidence = 0.92;
  }

  return confidence;
}

/**
 * Generate explanation from evidence (since FEVER doesn't include it)
 */
function generateExplanation(claim: FEVERClaim): string {
  const label = claim.label.toUpperCase();
  const numSources = extractSources(claim).length;

  if (label === 'SUPPORTS') {
    return numSources > 0
      ? `This claim is supported by evidence from ${numSources} Wikipedia source(s).`
      : 'This claim is supported by available evidence.';
  } else if (label === 'REFUTES') {
    return numSources > 0
      ? `This claim is refuted by evidence from ${numSources} Wikipedia source(s).`
      : 'This claim is contradicted by available evidence.';
  } else {
    return 'There is not enough information available to verify this claim.';
  }
}

/**
 * Transform FEVER claim to Stage2Sample
 */
export function transformFEVERToStage2(claim: FEVERClaim): Stage2Sample {
  const id = `fever_${claim.id}`;

  return {
    id,
    claim: claim.claim,
    verdict: transformLabel(claim.label),
    confidence: calculateConfidence(claim),
    sources: extractSources(claim),
    explanation: generateExplanation(claim),
    reasoning: 'Evidence-based verification using Wikipedia sources',
    difficulty: estimateDifficulty(claim),
    topic: classifyTopic(claim.claim),
    annotator: 'fever-dataset',
    metadata: {
      original_label: claim.label,
      num_evidence_sets: claim.evidence?.length || 0,
    },
  };
}

/**
 * Transform multiple FEVER claims
 */
export function transformFEVERDataset(claims: FEVERClaim[]): Stage2Sample[] {
  const samples: Stage2Sample[] = [];

  for (const claim of claims) {
    try {
      const sample = transformFEVERToStage2(claim);
      samples.push(sample);
    } catch (error) {
      console.error(`Error transforming claim ${claim.id}:`, error);
    }
  }

  return samples;
}

/**
 * Filter FEVER samples for quality
 *
 * Removes samples that:
 * - Have no evidence (for SUPPORTS/REFUTES)
 * - Are marked as "NOT ENOUGH INFO" (optional)
 */
export function filterFEVERSamples(
  samples: Stage2Sample[],
  options: {
    requireEvidence?: boolean;
    excludeUnknown?: boolean;
    balanceLabels?: boolean;
  } = {}
): Stage2Sample[] {
  const {
    requireEvidence = true,
    excludeUnknown = false,
    balanceLabels = false,
  } = options;

  let filtered = samples.filter(sample => {
    // Require evidence for definitive verdicts
    if (requireEvidence && sample.verdict !== Verdict.UNKNOWN && sample.sources.length === 0) {
      return false;
    }

    // Optionally exclude unknown verdicts
    if (excludeUnknown && sample.verdict === Verdict.UNKNOWN) {
      return false;
    }

    return true;
  });

  // Balance labels (equal true/false, fewer unknown)
  if (balanceLabels) {
    const trueCount = filtered.filter(s => s.verdict === Verdict.TRUE).length;
    const falseCount = filtered.filter(s => s.verdict === Verdict.FALSE).length;

    const minCount = Math.min(trueCount, falseCount);
    const targetUnknown = Math.floor(minCount * 0.3); // 30% unknown

    const balanced: Stage2Sample[] = [];
    let trueSeen = 0;
    let falseSeen = 0;
    let unknownSeen = 0;

    for (const sample of filtered) {
      if (sample.verdict === Verdict.TRUE && trueSeen < minCount) {
        balanced.push(sample);
        trueSeen++;
      } else if (sample.verdict === Verdict.FALSE && falseSeen < minCount) {
        balanced.push(sample);
        falseSeen++;
      } else if (sample.verdict === Verdict.UNKNOWN && unknownSeen < targetUnknown) {
        balanced.push(sample);
        unknownSeen++;
      }

      // Stop if we've reached target counts
      if (trueSeen >= minCount && falseSeen >= minCount && unknownSeen >= targetUnknown) {
        break;
      }
    }

    filtered = balanced;
  }

  return filtered;
}

/**
 * Parse FEVER JSONL file
 *
 * FEVER uses JSONL format (one JSON object per line)
 */
export function parseFEVERJsonl(content: string): FEVERClaim[] {
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  const claims: FEVERClaim[] = [];

  for (const line of lines) {
    try {
      const claim = JSON.parse(line) as FEVERClaim;
      claims.push(claim);
    } catch (error) {
      console.error('Error parsing JSONL line:', error);
    }
  }

  return claims;
}
