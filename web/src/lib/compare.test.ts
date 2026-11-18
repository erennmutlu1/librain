import { describe, expect, it } from 'vitest';
import { normalizeCompareResponse } from '../api/normalize';
import { compareScenarios } from '../mocks/scenarios';
import { ALL_LOADING, compareStates, compareTakeaway, type CompareStates } from './compare';

const states = (id: string): CompareStates => compareStates(normalizeCompareResponse(compareScenarios.find((s) => s.id === id)!.response));

describe('compareTakeaway (what this pair shows)', () => {
  it('reads the leaders, citations and claim risk off the recorded pair 10', () => {
    const s = states('pair-10');
    const facts = compareTakeaway(s)!;

    // Cross-check every lead against the numbers themselves.
    const value = (system: 'librain' | 'naiveRag' | 'singleLlm', key: 'qualityScore' | 'noveltyScore' | 'plausibilityScore' | 'structuralCoherenceScore') => {
      const st = s[system];
      return st.status === 'success' ? st.data.evaluation![key] : NaN;
    };
    for (const { system, scores } of facts.leads) {
      for (const key of scores) {
        for (const other of ['librain', 'naiveRag', 'singleLlm'] as const) {
          if (other !== system) expect(value(system, key)).toBeGreaterThan(value(other, key));
        }
      }
    }
    // pair-10: quality 0.569 / 0.545 / 0.527; plausibility 0.62 / 0.72 / 0.35; novelty 0.41 / 0.23 / 0.51; coherence 0.68 / 0.68 / 0.72.
    expect(facts.leads).toEqual([
      { system: 'librain', scores: ['qualityScore'] },
      { system: 'naiveRag', scores: ['plausibilityScore'] },
      { system: 'singleLlm', scores: ['noveltyScore', 'structuralCoherenceScore'] },
    ]);
    expect(facts.ties).toEqual([]);
    expect(facts.naiveCitations).toEqual({ fabricated: 0, total: 4 });
    // The baseline experiment's LIBRAIN run predates the claimed/dropped counters.
    expect(facts.librainCitations).toBeNull();
    expect(facts.librainRisk).toEqual({ value: 0.75, failed: false });
    expect(facts.baselinesShown).toBe(true);
  });

  it('reports ties and the citation check from the API snapshot', () => {
    const facts = compareTakeaway(states('contract-compare'))!;
    expect(facts.leads).toEqual([]);
    expect(facts.ties).toEqual(['qualityScore', 'noveltyScore', 'plausibilityScore', 'structuralCoherenceScore']);
    expect(facts.naiveCitations).toEqual({ fabricated: 1, total: 2 });
    expect(facts.librainCitations).toEqual({ claimed: 3, dropped: 1 });
    expect(facts.librainRisk?.failed).toBe(false);
  });

  it('says nothing while loading or when every system failed, and ignores failed systems', () => {
    expect(compareTakeaway(ALL_LOADING)).toBeNull();
    const failed = { status: 'error' as const, error: new Error('x') };
    expect(compareTakeaway({ librain: failed, naiveRag: failed, singleLlm: failed })).toBeNull();

    const s = states('pair-10');
    const facts = compareTakeaway({ ...s, naiveRag: failed, singleLlm: failed })!;
    expect(facts.leads).toEqual([]); // nothing to lead over
    expect(facts.naiveCitations).toBeNull();
    expect(facts.baselinesShown).toBe(false);
  });
});
