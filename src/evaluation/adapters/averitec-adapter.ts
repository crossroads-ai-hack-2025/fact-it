/**
 * AVeriTeC Dataset Adapter
 *
 * Transforms AVeriTeC dataset format to Stage2Sample format.
 * AVeriTeC contains real-world claims with evidence from the web.
 *
 * Source: https://github.com/MichSchli/AVeriTeC
 * Paper: https://arxiv.org/abs/2305.13117
 */

import { Stage2Sample, Verdict, Difficulty, Topic, Source } from '../types/dataset-schema';

/**
 * AVeriTeC raw format (from JSON files)
 */
export interface AVeriTeCClaim {
  claim: string;
  claim_id?: string | number;
  label: string; // "Supported" | "Refuted" | "Not Enough Evidence" | "Conflicting Evidence/Cherry-picking"
  justification: string;
  claim_date?: string;
  speaker?: string;
  fact_checking_article?: string;
  reporting_source?: string;
  location_ISO_code?: string;
  claim_types?: string[];
  fact_checking_strategies?: string[];
  questions?: Array<{
    question: string;
    answers: Array<{
      answer: string;
      answer_type: string; // "Boolean" | "Abstractive" | "Extractive" | "Unanswerable"
      source_url?: string;
      source_medium?: string; // "Web text" | "PDF" | "Image"
      cached_source_url?: string;
      boolean_explanation?: string;
    }>;
  }>;
}

/**
 * Transform AVeriTeC label to Verdict
 */
function transformLabel(label: string): Verdict {
  const normalized = label.toLowerCase().trim();

  if (normalized.includes('supported')) {
    return Verdict.TRUE;
  } else if (normalized.includes('refuted')) {
    return Verdict.FALSE;
  } else {
    // "Not Enough Evidence" or "Conflicting Evidence/Cherry-picking"
    return Verdict.UNKNOWN;
  }
}

/**
 * Classify topic from claim text (simple heuristic)
 */
function classifyTopic(claim: string): Topic {
  const text = claim.toLowerCase();

  if (/(election|president|senator|congress|government|law|policy|vote)/i.test(text)) {
    return Topic.POLITICS;
  } else if (/(vaccine|covid|disease|medicine|health|doctor|hospital)/i.test(text)) {
    return Topic.HEALTH;
  } else if (/(study|research|scientist|experiment|climate|space)/i.test(text)) {
    return Topic.SCIENCE;
  } else if (/(company|economy|stock|market|business|revenue|profit)/i.test(text)) {
    return Topic.BUSINESS;
  } else {
    return Topic.OTHER;
  }
}

/**
 * Estimate difficulty based on justification length and complexity
 */
function estimateDifficulty(claim: AVeriTeCClaim): Difficulty {
  const justificationLength = claim.justification?.length || 0;
  const numQuestions = claim.questions?.length || 0;
  const hasConflictingEvidence = claim.label.includes('Conflicting');

  // Complex if:
  // - Long justification
  // - Many questions needed
  // - Conflicting evidence
  if (justificationLength > 500 || numQuestions > 3 || hasConflictingEvidence) {
    return Difficulty.HARD;
  } else if (justificationLength > 200 || numQuestions > 1) {
    return Difficulty.MEDIUM;
  } else {
    return Difficulty.EASY;
  }
}

/**
 * Extract sources from AVeriTeC questions/answers
 */
function extractSources(claim: AVeriTeCClaim): Source[] {
  if (!claim.questions) {
    return [];
  }

  const sources: Source[] = [];
  const seenUrls = new Set<string>();

  for (const question of claim.questions) {
    for (const answer of question.answers) {
      // Skip if no URL or already seen
      if (!answer.source_url || seenUrls.has(answer.source_url)) {
        continue;
      }

      // Skip unanswerable answers
      if (answer.answer_type === 'Unanswerable') {
        continue;
      }

      seenUrls.add(answer.source_url);

      // Estimate reliability based on source medium and answer type
      let reliabilityScore = 0.7; // Default

      if (answer.source_medium === 'Web text') {
        reliabilityScore = 0.75;
      } else if (answer.source_medium === 'PDF') {
        reliabilityScore = 0.85; // PDFs often from official sources
      }

      // Boost for extractive (direct quotes) vs abstractive
      if (answer.answer_type === 'Extractive') {
        reliabilityScore += 0.05;
      }

      // Cap at 0.95 (human annotations, not 100% perfect)
      reliabilityScore = Math.min(reliabilityScore, 0.95);

      sources.push({
        url: answer.source_url,
        title: extractTitle(answer.source_url),
        reliabilityScore,
        excerpt: answer.answer,
        accessDate: new Date().toISOString().split('T')[0], // Use today's date
      });
    }
  }

  return sources;
}

/**
 * Extract title from URL (simple heuristic)
 */
function extractTitle(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    const path = urlObj.pathname.split('/').filter(p => p.length > 0);

    if (path.length > 0) {
      // Use last path segment, clean it up
      const lastSegment = path[path.length - 1]
        .replace(/[-_]/g, ' ')
        .replace(/\.\w+$/, '') // Remove extension
        .replace(/\b\w/g, c => c.toUpperCase()); // Title case
      return `${lastSegment} - ${hostname}`;
    }

    return hostname;
  } catch {
    return url;
  }
}

/**
 * Calculate confidence based on label and evidence quality
 */
function calculateConfidence(claim: AVeriTeCClaim): number {
  let confidence = 0.85; // Base confidence for human-annotated data

  const numSources = claim.questions?.flatMap(q => q.answers).filter(a => a.source_url).length || 0;

  // Boost confidence for more sources
  if (numSources >= 3) {
    confidence += 0.05;
  } else if (numSources >= 5) {
    confidence += 0.10;
  }

  // Reduce confidence for "Not Enough Evidence" or "Conflicting"
  if (claim.label.includes('Not Enough Evidence')) {
    confidence = 0.60;
  } else if (claim.label.includes('Conflicting')) {
    confidence = 0.70;
  }

  return Math.min(confidence, 0.95);
}

/**
 * Transform AVeriTeC claim to Stage2Sample
 */
export function transformAVeriTeCToStage2(claim: AVeriTeCClaim): Stage2Sample {
  const id = claim.claim_id ? `averitec_${claim.claim_id}` : `averitec_${Math.random().toString(36).substring(7)}`;

  return {
    id,
    claim: claim.claim,
    verdict: transformLabel(claim.label),
    confidence: calculateConfidence(claim),
    sources: extractSources(claim),
    explanation: claim.justification || '',
    reasoning: claim.fact_checking_strategies?.join('; ') || '',
    difficulty: estimateDifficulty(claim),
    topic: classifyTopic(claim.claim),
    annotator: 'averitec-dataset',
    metadata: {
      original_label: claim.label,
      claim_date: claim.claim_date,
      speaker: claim.speaker,
      fact_checking_article: claim.fact_checking_article,
      location: claim.location_ISO_code,
      claim_types: claim.claim_types,
    },
  };
}

/**
 * Transform multiple AVeriTeC claims
 */
export function transformAVeriTeCDataset(claims: AVeriTeCClaim[]): Stage2Sample[] {
  const samples: Stage2Sample[] = [];

  for (const claim of claims) {
    try {
      const sample = transformAVeriTeCToStage2(claim);
      samples.push(sample);
    } catch (error) {
      console.error(`Error transforming claim ${claim.claim_id}:`, error);
    }
  }

  return samples;
}

/**
 * Filter AVeriTeC samples for quality
 *
 * Removes samples that:
 * - Have no sources
 * - Have very short justifications
 * - Are marked as "Not Enough Evidence" (optional)
 */
export function filterAVeriTeCSamples(
  samples: Stage2Sample[],
  options: {
    minSources?: number;
    minJustificationLength?: number;
    excludeUnknown?: boolean;
  } = {}
): Stage2Sample[] {
  const {
    minSources = 1,
    minJustificationLength = 50,
    excludeUnknown = false,
  } = options;

  return samples.filter(sample => {
    // Must have sources
    if (sample.sources.length < minSources) {
      return false;
    }

    // Must have reasonable justification
    if (sample.explanation.length < minJustificationLength) {
      return false;
    }

    // Optionally exclude unknown verdicts
    if (excludeUnknown && sample.verdict === Verdict.UNKNOWN) {
      return false;
    }

    return true;
  });
}
