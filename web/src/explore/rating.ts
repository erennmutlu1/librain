/*
 * The Explore rating: one number out of 10 that ranks the recorded runs
 * against each other. It is a reading aid computed from the scores the run
 * already carries; nothing here calls a model.
 *
 *   rating      = 10 × (0.35·plausibility + 0.25·coherence + 0.25·noveltyNorm + 0.15·(1 − aggregateRisk))
 *   noveltyNorm = (novelty − min) / (max − min), min and max over the runs being rated
 *
 * Novelty is rescaled because raw novelty (cosine distance to the nearest
 * corpus chunk) only spans about 0.28 to 0.54 across these runs, so it would
 * barely move the total. The rating is rounded to one decimal.
 */

export const RATING_WEIGHTS = {
  plausibility: 0.35,
  coherence: 0.25,
  novelty: 0.25,
  safety: 0.15,
} as const;

export interface RatingInputs {
  plausibility: number;
  /** Structural coherence. */
  coherence: number;
  /** Raw novelty score, 0 to 1. */
  novelty: number;
  /** Aggregate claim risk: the highest per-sentence hallucination probability. */
  aggregateRisk: number;
}

export interface NoveltyRange {
  min: number;
  max: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The min and max novelty over a set of runs. */
export function noveltyRange(novelties: readonly number[]): NoveltyRange {
  if (novelties.length === 0) throw new Error('A novelty range needs at least one run.');
  return { min: Math.min(...novelties), max: Math.max(...novelties) };
}

/** Novelty rescaled to 0..1 over the range; 0.5 when every run has the same novelty. */
export function normalizeNovelty(novelty: number, range: NoveltyRange): number {
  const span = range.max - range.min;
  if (!(span > 0)) return 0.5;
  return clamp01((novelty - range.min) / span);
}

/** The unrounded rating, 0 to 10. */
export function ratingExact(inputs: RatingInputs, range: NoveltyRange): number {
  const w = RATING_WEIGHTS;
  return (
    10 *
    (w.plausibility * clamp01(inputs.plausibility) +
      w.coherence * clamp01(inputs.coherence) +
      w.novelty * normalizeNovelty(inputs.novelty, range) +
      w.safety * (1 - clamp01(inputs.aggregateRisk)))
  );
}

/** The rating shown in the UI: 0 to 10, one decimal. */
export function rating(inputs: RatingInputs, range: NoveltyRange): number {
  return Math.round(ratingExact(inputs, range) * 10) / 10;
}

/** "7.4" */
export function formatRating(value: number): string {
  return value.toFixed(1);
}
