import { STATUS_META } from '../lib/vocabulary';
import type { GlossaryKey } from './model';

/** One plain sentence per term, shown in Explore's glossary tooltips. */
export const GLOSSARY: Record<GlossaryKey, { term: string; definition: string }> = {
  novelty: {
    term: 'Novelty',
    definition: 'How far the idea sits from the closest passage in the paper corpus; higher means less like anything already there.',
  },
  plausibility: {
    term: 'Plausibility',
    definition: 'A judge model’s 0 to 1 estimate of how likely the idea is to hold up, given the evidence it cites.',
  },
  coherence: {
    term: 'Coherence',
    definition: 'A judge model’s 0 to 1 score for how well the idea’s steps fit together into one argument.',
  },
  risk: {
    term: 'Claim risk',
    definition: 'The highest chance, over the novel claim’s sentences, that one states something as fact the evidence does not support.',
  },
  grounded: { term: 'Grounded', definition: STATUS_META.grounded.description },
  extrapolated: { term: 'Extrapolated', definition: STATUS_META.extrapolated.description },
  risky: { term: 'Risky', definition: STATUS_META.risky.description },
};
