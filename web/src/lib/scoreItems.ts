import type { DiscoveryEvaluation, EvaluationSummary } from '../api/types';

export const DISCOVERY_AXES = [
  { key: 'qualityScore', label: 'Quality', hint: 'Mean of the three axes' },
  { key: 'noveltyScore', label: 'Novelty', hint: 'Cosine distance to nearest chunk' },
  { key: 'plausibilityScore', label: 'Plausibility', hint: 'LLM judge' },
  { key: 'structuralCoherenceScore', label: 'Structural coherence', hint: 'LLM judge' },
] as const satisfies readonly { key: keyof DiscoveryEvaluation; label: string; hint: string }[];

export function discoveryScoreItems(e: DiscoveryEvaluation | null) {
  return DISCOVERY_AXES.map((axis) => ({ key: axis.key, label: axis.label, hint: axis.hint, value: e?.[axis.key] }));
}

export function askScoreItems(e: EvaluationSummary) {
  return [
    { key: 'quality', label: 'Quality', value: e.qualityScore, hint: 'Overall judge score' },
    { key: 'groundedness', label: 'Groundedness', value: e.groundednessScore, hint: 'Supported by the cited sources' },
    { key: 'relevance', label: 'Relevance', value: e.relevanceScore, hint: 'Answers the question asked' },
    { key: 'completeness', label: 'Completeness', value: e.completenessScore, hint: 'Covers what the sources allow' },
  ];
}

/** Bands for aggregate claim risk (the highest per-sentence hallucination probability). */
export function riskBand(value: number): { label: string; tone: 'low' | 'mid' | 'high' } {
  if (value < 0.34) return { label: 'Low', tone: 'low' };
  if (value < 0.67) return { label: 'Moderate', tone: 'mid' };
  return { label: 'High', tone: 'high' };
}
