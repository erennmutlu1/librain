import { describe, expect, it } from 'vitest';
import { CATEGORIES, categoryOf } from './categories';
import { EDITORS_PICKS, EXPLORE_MANIFESTS, paperName, RECORDED_DATE } from './manifests';
import {
  buildRound,
  categoryCounts,
  discoveryOfTheDay,
  exploreList,
  exploreTotals,
  firstSentence,
  matchesQuery,
  percentBelow,
  pickSurprise,
  promisingPoints,
  quizQuestions,
  ratingHistogram,
  relatedTo,
  topPassages,
  topPercent,
  trimText,
} from './model';
import { formatRating, normalizeNovelty, rating, ratingExact } from './rating';
import { exploreData } from './runs';

const copies = import.meta.glob<string>('./data/**/*.json', { query: '?raw', import: 'default', eager: true });
const originals = import.meta.glob<string>(
  '../../../experiments/{featured-discoveries,new-areas-discoveries}/{featured.json,runs/*.json}',
  { query: '?raw', import: 'default', eager: true },
);

const { discoveries, byId } = exploreData;
const get = (id: string) => byId.get(id)!;

describe('Explore data', () => {
  it('is a byte-for-byte copy of both experiment folders (46 runs and two manifests)', () => {
    const copied = Object.keys(copies).map((k) => k.replace('./data/', '')).sort();
    const source = Object.keys(originals).map((k) => k.replace('../../../experiments/', '')).sort();
    expect(copied).toEqual(source);
    expect(copied.filter((f) => f.includes('/runs/'))).toHaveLength(46);
    for (const file of source) {
      expect(copies[`./data/${file}`] === originals[`../../../experiments/${file}`], `src/explore/data/${file} differs from experiments/${file}`).toBe(true);
    }
  });

  it('builds all 46 runs with ids D1–D7, A1–A7, C1–C4, N1–N3, F1–F5, S1–S5, W1–W5, P1–P5, J1–J5', () => {
    const expected = [
      ...['D', 'A'].flatMap((p) => [1, 2, 3, 4, 5, 6, 7].map((n) => `${p}${n}`)),
      ...[1, 2, 3, 4].map((n) => `C${n}`),
      ...[1, 2, 3].map((n) => `N${n}`),
      ...['F', 'S', 'W', 'P', 'J'].flatMap((p) => [1, 2, 3, 4, 5].map((n) => `${p}${n}`)),
    ];
    expect(discoveries.map((d) => d.id).sort()).toEqual(expected.sort());
    expect(discoveries.every((d) => d.completed && d.response.claimValidation?.validationFailed === false)).toBe(true);
    expect(get('D1').source).toBe('experiments/featured-discoveries/runs/D1.json');
    expect(get('F4').source).toBe('experiments/new-areas-discoveries/runs/F4.json');
    expect(RECORDED_DATE).toBe('2026-11-18');
  });

  it('marks the 14 editor’s picks with their takeaways', () => {
    expect(EDITORS_PICKS.map((p) => p.id)).toEqual(['D7', 'C1', 'N3', 'A2', 'D5', 'D1', 'F4', 'F2', 'S5', 'S1', 'P5', 'W5', 'J5', 'J4']);
    expect(discoveries.filter((d) => d.pick)).toHaveLength(14);
    expect(get('W5').takeaway).toMatch(/^Turn screenshot-to-code benchmarks into automatically checked web-development lessons/);
    expect(get('W5').pick?.whyFeatured).toMatch(/Lowest claim risk of all 46 runs/);
  });
});

describe('categories', () => {
  it('maps every one of the 46 runs to one of nine categories by id prefix', () => {
    expect(CATEGORIES).toHaveLength(9);
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c.prefix, discoveries.filter((d) => d.category === c).length]));
    expect(counts).toEqual({ D: 7, A: 7, C: 4, N: 3, F: 5, S: 5, W: 5, P: 5, J: 5 });
    expect(discoveries.every((d) => d.category === categoryOf(d.id))).toBe(true);
    expect(categoryOf('D1').name).toBe('Drug & materials discovery × agents');
    expect(categoryOf('C1').name).toBe('Clinical trials × causal & graph methods');
    expect(categoryOf('J4').name).toBe('Future jobs');
    expect(() => categoryOf('X1')).toThrow(/no Explore category/);
  });

  it('agrees with the area names batch 2 recorded', () => {
    const areas = EXPLORE_MANIFESTS[1]!.areas;
    expect(areas).toHaveLength(5);
    for (const area of areas) expect(categoryOf(`${area.prefix}1`).name).toBe(area.name);
  });

  it('gives each category its own icon and colour token', () => {
    expect(new Set(CATEGORIES.map((c) => c.icon)).size).toBe(9);
    expect(new Set(CATEGORIES.map((c) => c.colorVar)).size).toBe(9);
  });
});

describe('rating', () => {
  // Novelty over all 46 runs: min 0.28074628 (A7), max 0.5407054 (S3), span 0.25995912.
  it('matches hand-computed values for W5 and D1', () => {
    // W5: plausibility 0.72, coherence 0.78, novelty 0.47873873, risk 0.05
    //   noveltyNorm = (0.47873873 − 0.28074628) / 0.25995912 = 0.761629
    //   10 × (0.35·0.72 + 0.25·0.78 + 0.25·0.761629 + 0.15·0.95)
    //   = 10 × (0.252 + 0.195 + 0.190407 + 0.1425) = 7.79907 → 7.8
    expect(get('W5').scores.noveltyNorm).toBeCloseTo(0.761629, 5);
    expect(get('W5').ratingExact).toBeCloseTo(7.79907, 4);
    expect(get('W5').rating).toBe(7.8);

    // D1: plausibility 0.68, coherence 0.72, novelty 0.33448893, risk 0.72
    //   noveltyNorm = (0.33448893 − 0.28074628) / 0.25995912 = 0.206735
    //   10 × (0.238 + 0.18 + 0.051684 + 0.042) = 5.11684 → 5.1
    expect(get('D1').scores.noveltyNorm).toBeCloseTo(0.206735, 5);
    expect(get('D1').ratingExact).toBeCloseTo(5.11684, 4);
    expect(get('D1').rating).toBe(5.1);
  });

  it('normalises novelty over all 46 runs: the least novel is 0, the most novel 1', () => {
    expect(exploreData.noveltyRange).toEqual({ min: 0.28074628, max: 0.5407054 });
    expect(get('A7').scores.noveltyNorm).toBe(0);
    expect(get('S3').scores.noveltyNorm).toBe(1);
  });

  it('stays within 0..10 with one decimal, for every run and at the extremes', () => {
    for (const d of discoveries) {
      expect(d.rating).toBeGreaterThanOrEqual(0);
      expect(d.rating).toBeLessThanOrEqual(10);
      expect(Number.isInteger(Math.round(d.rating * 10)) && Math.abs(d.rating * 10 - Math.round(d.rating * 10)) < 1e-9).toBe(true);
    }
    const range = { min: 0.2, max: 0.6 };
    expect(rating({ plausibility: 1, coherence: 1, novelty: 0.6, aggregateRisk: 0 }, range)).toBe(10);
    expect(rating({ plausibility: 0, coherence: 0, novelty: 0.2, aggregateRisk: 1 }, range)).toBe(0);
    // Out-of-range inputs are clamped rather than leaving the scale.
    expect(ratingExact({ plausibility: 2, coherence: -1, novelty: 9, aggregateRisk: -3 }, range)).toBe(10 * (0.35 + 0.25 + 0.15));
    expect(normalizeNovelty(0.4, { min: 0.4, max: 0.4 })).toBe(0.5);
    expect(formatRating(7)).toBe('7.0');
  });

  it('ranks the 46 ideas from 4.1 to 7.8', () => {
    const ratings = discoveries.map((d) => d.rating);
    expect(Math.min(...ratings)).toBe(4.1);
    expect(Math.max(...ratings)).toBe(7.8);
    expect(get('F2').rating).toBe(7.6);
    expect(get('C2').rating).toBe(4.1);
  });
});

describe('takeaways', () => {
  it('uses the first sentence of the hypothesis, trimmed, for runs without an editor’s takeaway', () => {
    const a6 = get('A6');
    expect(a6.pick).toBeNull();
    expect(a6.takeaway.startsWith('Vision Transformer patch embeddings')).toBe(true);
    expect(a6.takeaway.length).toBeLessThanOrEqual(171);
    expect(a6.takeaway.endsWith('…')).toBe(true);
    // "e.g." does not end the sentence.
    expect(firstSentence('Use tiles (e.g. 4×4 crops) as tokens. Then attend.')).toBe('Use tiles (e.g. 4×4 crops) as tokens.');
    expect(trimText('short text')).toBe('short text');
    expect(trimText('one two three four five', 12)).toBe('one two…');
  });
});

describe('Explore list', () => {
  it('filters by category, with counts that follow the search', () => {
    expect(exploreList(discoveries, { category: 'F' }).map((d) => d.id).sort()).toEqual(['F1', 'F2', 'F3', 'F4', 'F5']);
    const counts = categoryCounts(discoveries, {});
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(46);
    const searched = categoryCounts(discoveries, { q: 'injury' });
    expect(searched.get('S')).toBeGreaterThan(0);
    expect(searched.get('D') ?? 0).toBe(0);
  });

  it('sorts by rating, novelty, plausibility and lowest risk', () => {
    expect(exploreList(discoveries, { sort: 'rating' }).slice(0, 3).map((d) => d.id)).toEqual(['S3', 'W5', 'F2']);
    expect(exploreList(discoveries, { sort: 'novelty' }).slice(0, 2).map((d) => d.id)).toEqual(['S3', 'F2']);
    const plaus = exploreList(discoveries, { sort: 'plausibility' });
    expect(plaus[0]!.scores.plausibility).toBe(0.72);
    expect(plaus.at(-1)!.scores.plausibility).toBe(0.28);
    const risk = exploreList(discoveries, { sort: 'risk' });
    expect(risk[0]!.id).toBe('W5');
    expect(risk.at(-1)!.id).toBe('P1');
  });

  it('searches topics and claims, every word required', () => {
    expect(exploreList(discoveries, { q: 'PharmAgents' }).map((d) => d.id)).toContain('D1');
    expect(matchesQuery(get('D1'), '37.94% ceiling')).toBe(true); // in the novel claim only
    expect(exploreList(discoveries, { q: 'corner kick' }).map((d) => d.id)).toEqual(['F4']);
    expect(exploreList(discoveries, { q: 'football zzzz' })).toHaveLength(0);
    expect(exploreList(discoveries, { q: 'FOOTBALL', category: 'F' }).length).toBeGreaterThan(0);
  });

  it('shows only saved runs under the Saved filter', () => {
    const saved = new Set(['W5', 'D1']);
    expect(exploreList(discoveries, { savedOnly: true, saved }).map((d) => d.id)).toEqual(['W5', 'D1']);
    expect(categoryCounts(discoveries, { savedOnly: true, saved })).toEqual(new Map([['D', 1], ['W', 1]]));
  });
});

describe('evidence bullets and related ideas', () => {
  it('derives D1’s bullets from its data and its rank among the 46', () => {
    const points = promisingPoints(get('D1'), exploreData, paperName);
    const evidence = points.find((p) => p.key === 'evidence')!;
    expect(evidence.text).toBe('Backed by 7 passages from 3 papers:');
    expect(evidence.papers).toEqual(['self-rag', 'pharmagents', '2508.14111']);
    expect(points.find((p) => p.key === 'plausibility')).toMatchObject({ term: { value: '0.68' }, text: 'higher than 67% of all 46 ideas' });
    expect(points.find((p) => p.key === 'sentences')!.text).toBe('1 sentence flagged risky — see below.');
  });

  it('names batch-2 papers by their arXiv titles and finds percentiles at the top', () => {
    const points = promisingPoints(get('F2'), exploreData, paperName);
    expect(points[0]!.papers).toEqual(['Actions Speak Louder Than Goals: Valuing Player Actions in Soccer', 'gat']);
    expect(points.find((p) => p.key === 'novelty')!.text).toBe('top 5% of all 46 ideas');
    const w5 = promisingPoints(get('W5'), exploreData, paperName);
    expect(w5.find((p) => p.key === 'plausibility')!.text).toBe('top 9% of all 46 ideas');
    expect(w5.find((p) => p.key === 'risk')!.text).toBe('the lowest of all 46 ideas');
    expect(w5.find((p) => p.key === 'sentences')!.text).toBe('No sentence stated as unsupported fact (1 checked).');
  });

  it('computes percentiles conservatively', () => {
    expect(percentBelow([1, 2, 3, 4], 3)).toBe(50);
    expect(topPercent([1, 2, 3, 4], 4)).toBe(25);
    expect(topPercent([1, 2, 3, 3], 3)).toBe(50); // a tie takes the lower rank
  });

  it('quotes the passages the generator built on first, at most three', () => {
    const passages = topPassages(get('D1'));
    expect(passages.length).toBeLessThanOrEqual(3);
    expect(`${passages[0]!.paperId}:${passages[0]!.chunkIndex}`).toBe('self-rag:4');
    expect(new Set(passages.map((p) => p.paperId)).size).toBeGreaterThan(1);
  });

  it('relates runs that share a paper or a category', () => {
    const related = relatedTo(get('F2'), exploreData);
    expect(related).toHaveLength(3);
    for (const r of related) expect(r.sharedPapers.length > 0 || r.sameCategory).toBe(true);
    expect(related.some((r) => r.sharedPapers.includes('gat'))).toBe(true);
    expect(related.map((r) => r.discovery.id)).not.toContain('F2');
  });
});

describe('day pick, surprise and quiz', () => {
  it('picks the discovery of the day from the editor’s picks, the same all day', () => {
    const a = discoveryOfTheDay(exploreData.picks, new Date(2026, 10, 18, 0, 5));
    const b = discoveryOfTheDay(exploreData.picks, new Date(2026, 10, 18, 23, 55));
    const c = discoveryOfTheDay(exploreData.picks, new Date(2026, 10, 19, 12));
    expect(a?.pick).toBeTruthy();
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('surprises with a run rated 6 or more, never the current one', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const d = pickSurprise(discoveries, 'S3', () => i / 40)!;
      expect(d.rating).toBeGreaterThanOrEqual(6);
      expect(d.id).not.toBe('S3');
      seen.add(d.id);
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('builds quiz rounds with every risky and grounded sentence', () => {
    const questions = quizQuestions(discoveries);
    expect(questions).toHaveLength(73);
    expect(questions.filter((q) => q.status === 'risky').map((q) => q.qid).sort()).toEqual(['D1.2', 'D4.2', 'P1.1', 'P3.2']);
    const round = buildRound(questions, () => 0.42);
    expect(round).toHaveLength(14);
    expect(round.filter((q) => q.status === 'risky')).toHaveLength(4);
    expect(round.filter((q) => q.status === 'grounded')).toHaveLength(2);
    expect(buildRound(questions, () => 0.42, 'A1.2')[0]!.qid).toBe('A1.2');
  });
});

describe('totals', () => {
  it('counts what the stats page reports', () => {
    const t = exploreTotals(discoveries);
    expect(t).toMatchObject({ runs: 46, completed: 46, checksSucceeded: 46, dropped: 0, claimed: 246, noRisky: 42, picks: 14 });
    expect(t.plausibleAt06).toBe(discoveries.filter((d) => d.scores.plausibility >= 0.6).length);
    expect(t.sentences).toEqual({ grounded: 2, extrapolated: 67, risky: 4 });
    expect(t.cost.total.toFixed(2)).toBe('3.05');
    const bins = ratingHistogram(discoveries);
    expect(bins[0]!.from).toBe(4);
    expect(bins.at(-1)!.to).toBe(8);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(46);
  });
});
