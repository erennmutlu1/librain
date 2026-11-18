import type { DiscoveryEvaluation, EvaluationSummary } from '../api/types';
import { currentLang, pick, type Lang } from '../i18n/lang';
import { text } from './scoreItems.i18n';

const DISCOVERY_KEYS = ['qualityScore', 'noveltyScore', 'plausibilityScore', 'structuralCoherenceScore'] as const satisfies readonly (keyof DiscoveryEvaluation)[];

/** The four discovery score axes with their names and help text. */
export function discoveryAxes(lang: Lang = currentLang()) {
  const t = pick(text, lang).discovery;
  return DISCOVERY_KEYS.map((key) => ({ key, label: t[key].label, hint: t[key].hint }));
}

export function discoveryScoreItems(e: DiscoveryEvaluation | null, lang: Lang = currentLang()) {
  return discoveryAxes(lang).map((axis) => ({ key: axis.key, label: axis.label, hint: axis.hint, value: e?.[axis.key] }));
}

export function askScoreItems(e: EvaluationSummary, lang: Lang = currentLang()) {
  const t = pick(text, lang).ask;
  return [
    { key: 'quality', label: t.quality.label, value: e.qualityScore, hint: t.quality.hint },
    { key: 'groundedness', label: t.groundedness.label, value: e.groundednessScore, hint: t.groundedness.hint },
    { key: 'relevance', label: t.relevance.label, value: e.relevanceScore, hint: t.relevance.hint },
    { key: 'completeness', label: t.completeness.label, value: e.completenessScore, hint: t.completeness.hint },
  ];
}

/** Bands for aggregate claim risk (the highest per-sentence hallucination probability). */
export function riskBand(value: number, lang: Lang = currentLang()): { label: string; tone: 'low' | 'mid' | 'high' } {
  const t = pick(text, lang).band;
  if (value < 0.34) return { label: t.low, tone: 'low' };
  if (value < 0.67) return { label: t.mid, tone: 'mid' };
  return { label: t.high, tone: 'high' };
}
