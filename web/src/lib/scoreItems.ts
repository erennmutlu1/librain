import type { DiscoveryEvaluation, EvaluationSummary } from '../api/types';
import type { GlossaryTermKey } from '../explore/glossary';
import { currentLang, pick, type Lang } from '../i18n/lang';
import { text } from './scoreItems.i18n';

export const DISCOVERY_KEYS = ['qualityScore', 'noveltyScore', 'plausibilityScore', 'structuralCoherenceScore'] as const satisfies readonly (keyof DiscoveryEvaluation)[];

/** Each score's entry in the shared glossary (the ⓘ next to its label). */
const DISCOVERY_INFO: Record<(typeof DISCOVERY_KEYS)[number], GlossaryTermKey> = {
  qualityScore: 'quality',
  noveltyScore: 'novelty',
  plausibilityScore: 'plausibility',
  structuralCoherenceScore: 'coherence',
};

/**
 * The four discovery scores (0–1) with their names, short hints and glossary
 * keys. Quality is the mean of the other three (LIBRAIN/Agents/DiscoveryScoring.cs).
 */
export function discoveryAxes(lang: Lang = currentLang()) {
  const t = pick(text, lang).discovery;
  return DISCOVERY_KEYS.map((key) => ({ key, label: t[key].label, hint: t[key].hint, info: DISCOVERY_INFO[key] }));
}

export function discoveryScoreItems(e: DiscoveryEvaluation | null, lang: Lang = currentLang()) {
  return discoveryAxes(lang).map((axis) => ({ key: axis.key, label: axis.label, hint: axis.hint, info: axis.info, value: e?.[axis.key] }));
}

/** Ask's four scores; quality is the mean of the other three (LIBRAIN/Agents/EvaluatorAgent.cs). */
export function askScoreItems(e: EvaluationSummary, lang: Lang = currentLang()) {
  const t = pick(text, lang).ask;
  return [
    { key: 'quality', label: t.quality.label, value: e.qualityScore, hint: t.quality.hint, info: 'answerQuality' as const },
    { key: 'groundedness', label: t.groundedness.label, value: e.groundednessScore, hint: t.groundedness.hint, info: 'groundedness' as const },
    { key: 'relevance', label: t.relevance.label, value: e.relevanceScore, hint: t.relevance.hint, info: 'relevance' as const },
    { key: 'completeness', label: t.completeness.label, value: e.completenessScore, hint: t.completeness.hint, info: 'completeness' as const },
  ];
}

/** Bands for claim risk (the highest per-sentence hallucination probability, 0–1). */
export function riskBand(value: number, lang: Lang = currentLang()): { label: string; tone: 'low' | 'mid' | 'high' } {
  const t = pick(text, lang).band;
  if (value < 0.34) return { label: t.low, tone: 'low' };
  if (value < 0.67) return { label: t.mid, tone: 'mid' };
  return { label: t.high, tone: 'high' };
}
