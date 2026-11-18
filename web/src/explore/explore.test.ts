import { describe, expect, it } from 'vitest';
import type { ClaimStatus } from '../api/types';
import { CATEGORIES, categoryOf } from './categories';
import { RECORDED_IDEA_COUNT } from './ideaCount';
import { compareRunFiles, EDITORS_PICKS, EXPLORE_MANIFESTS, paperName, RECORDED_DATE } from './manifests';
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
  ROUND_EXTRAPOLATED,
  topPassages,
  topPercent,
  trimText,
} from './model';
import { formatRating, normalizeNovelty, noveltyRange, rating, ratingExact } from './rating';
import { exploreData } from './runs';

const copies = import.meta.glob<string>('./data/**/*.json', { query: '?raw', import: 'default', eager: true });
// Batches 3 and 4 keep a cost ledger (runs/ledger.json) next to the runs; it is not a run and is not copied.
const originals = import.meta.glob<string>(
  [
    '../../../experiments/{featured-discoveries,new-areas-discoveries,cross-field-discoveries,new-domains-discoveries}/{featured.json,runs/*.json}',
    '!**/runs/ledger.json',
  ],
  { query: '?raw', import: 'default', eager: true },
);
const originalRunCount = Object.keys(originals).filter((k) => k.includes('/runs/')).length;

// Batch 4's own record: its run ids (pairs.json), its ratings on the combined scale (ranking.csv) and its cost (runs/ledger.json).
const batch4Pairs = Object.values(
  import.meta.glob<{ id: string }[]>('../../../experiments/new-domains-discoveries/pairs.json', { eager: true, import: 'default' }),
)[0]!;
const batch4Ledger = Object.values(
  import.meta.glob<{ total: number }>('../../../experiments/new-domains-discoveries/runs/ledger.json', { eager: true, import: 'default' }),
)[0]!;
const batch4Ranking = Object.values(
  import.meta.glob<string>('../../../experiments/new-domains-discoveries/ranking.csv', { query: '?raw', import: 'default', eager: true }),
)[0]!
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const [id, ratingOn88] = line.split(',');
    return { id: id!, rating: Number(ratingOn88) };
  });

const { discoveries, byId } = exploreData;
const get = (id: string) => byId.get(id)!;
/** Every validator verdict of every run. */
const allClaims = discoveries.flatMap((d) => d.response.claimValidation?.claims ?? []);
const verdictCount = (status: ClaimStatus) => allClaims.filter((c) => c.status === status).length;

describe('Explore data', () => {
  it('is a byte-for-byte copy of every experiment folder (each run and each manifest)', () => {
    const copied = Object.keys(copies).map((k) => k.replace('./data/', '')).sort();
    const source = Object.keys(originals).map((k) => k.replace('../../../experiments/', '')).sort();
    expect(copied).toEqual(source);
    expect(copied.filter((f) => f.includes('/runs/'))).toHaveLength(discoveries.length);
    expect(copied.filter((f) => f.endsWith('/featured.json'))).toHaveLength(EXPLORE_MANIFESTS.length);
    for (const file of source) {
      expect(copies[`./data/${file}`] === originals[`../../../experiments/${file}`], `src/explore/data/${file} differs from experiments/${file}`).toBe(true);
    }
  });

  it('builds every run: D1–D7, A1–A7, C1–C4, N1–N3, F1–F5, S1–S5, W1–W5, P1–P5, J1–J5, X01–X23, X25 and batch 4’s pairs', () => {
    const expected = [
      ...['D', 'A'].flatMap((p) => [1, 2, 3, 4, 5, 6, 7].map((n) => `${p}${n}`)),
      ...[1, 2, 3, 4].map((n) => `C${n}`),
      ...[1, 2, 3].map((n) => `N${n}`),
      ...['F', 'S', 'W', 'P', 'J'].flatMap((p) => [1, 2, 3, 4, 5].map((n) => `${p}${n}`)),
      ...[...Array.from({ length: 23 }, (_, i) => i + 1), 25].map((n) => `X${String(n).padStart(2, '0')}`),
      ...batch4Pairs.map((p) => p.id),
    ];
    expect(discoveries.map((d) => d.id).sort()).toEqual(expected.sort());
    expect(discoveries.every((d) => d.completed && d.response.claimValidation?.validationFailed === false)).toBe(true);
    expect(get('D1').source).toBe('experiments/featured-discoveries/runs/D1.json');
    expect(get('F4').source).toBe('experiments/new-areas-discoveries/runs/F4.json');
    expect(get('X17').source).toBe('experiments/cross-field-discoveries/runs/X17.json');
    expect(get('X17').batch).toBe(3);
    expect(get('E5').source).toBe('experiments/new-domains-discoveries/runs/E5.json');
    expect(get('E5').batch).toBe(4);
    expect(RECORDED_DATE).toBe('2026-11-18');
    expect(EXPLORE_MANIFESTS.every((m) => m.date === RECORDED_DATE)).toBe(true);
    expect(EXPLORE_MANIFESTS.map((m) => m.batch)).toEqual([1, 2, 3, 4]);
  });

  it('counts the ideas at build time for text shown before the runs load', () => {
    expect(RECORDED_IDEA_COUNT).toBe(discoveries.length);
    expect(RECORDED_IDEA_COUNT).toBe(originalRunCount);
  });

  it('orders run files by batch, then by id', () => {
    const paths = [
      'x/new-domains-discoveries/runs/M1.json',
      'x/cross-field-discoveries/runs/X10.json',
      'x/new-areas-discoveries/runs/F1.json',
      'x/new-domains-discoveries/runs/E5.json',
      'x/cross-field-discoveries/runs/X02.json',
      'x/featured-discoveries/runs/D10.json',
      'x/featured-discoveries/runs/D2.json',
    ];
    expect([...paths].sort(compareRunFiles).map((p) => p.split('/').pop())).toEqual(['D2.json', 'D10.json', 'F1.json', 'X02.json', 'X10.json', 'E5.json', 'M1.json']);
  });

  it('marks the editor’s picks with their takeaways', () => {
    expect(EDITORS_PICKS.map((p) => p.id)).toEqual(['D7', 'C1', 'N3', 'A2', 'D5', 'D1', 'F4', 'F2', 'S5', 'S1', 'P5', 'W5', 'J5', 'J4', 'X17', 'X01', 'X13', 'E5', 'M5', 'E3']);
    expect(discoveries.filter((d) => d.pick)).toHaveLength(EDITORS_PICKS.length);
    expect(get('E5').pick?.whyFeatured).toMatch(/^Highest rating of all 88 runs \(8\.1\) and the only one above 7\.8/);
    expect(get('E3').pick?.whyFeatured).toMatch(/validator marks its last sentence risky \(0\.72\)/);
    expect(get('X13').takeaway).toMatch(/^Screenshot-to-code benchmarks such as Design2Code/);
    expect(get('X13').pick?.whyFeatured).toMatch(/validator marks the sentence risky \(0\.75\)/);
    expect(get('W5').takeaway).toMatch(/^Turn screenshot-to-code benchmarks into automatically checked web-development lessons/);
    expect(get('W5').pick?.whyFeatured).toMatch(/Lowest claim risk of all 46 runs/);
  });
});

describe('categories', () => {
  it('maps every run to a category by id prefix: batch 1’s four, then one per area a later batch recorded', () => {
    expect(CATEGORIES).toHaveLength(4 + EXPLORE_MANIFESTS.flatMap((m) => m.areas).length);
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c.prefix, discoveries.filter((d) => d.category === c).length]));
    const batch4Counts = Object.fromEntries(['M', 'L', 'E'].map((prefix) => [prefix, batch4Pairs.filter((p) => p.id.startsWith(prefix)).length]));
    expect(counts).toEqual({ D: 7, A: 7, C: 4, N: 3, F: 5, S: 5, W: 5, P: 5, J: 5, X: 24, ...batch4Counts });
    expect(discoveries.every((d) => d.category === categoryOf(d.id))).toBe(true);
    expect(categoryOf('D1').name).toBe('Drug & materials discovery × agents');
    expect(categoryOf('C1').name).toBe('Clinical trials × causal & graph methods');
    expect(categoryOf('J4').name).toBe('Future jobs');
    expect(categoryOf('X17').name).toBe('Cross-field bridges');
    expect(categoryOf('X17').batch).toBe(3);
    expect(categoryOf('E5').name).toBe('AI × wildlife and nature conservation');
    expect(categoryOf('L4').batch).toBe(4);
    expect(() => categoryOf('Z1')).toThrow(/no Explore category/);
  });

  it('agrees with the area names batches 2 to 4 recorded', () => {
    const areas = EXPLORE_MANIFESTS.slice(1).flatMap((m) => m.areas);
    expect(areas.map((a) => a.prefix)).toEqual(['F', 'S', 'W', 'P', 'J', 'X', 'M', 'L', 'E']);
    for (const area of areas) expect(categoryOf(`${area.prefix}1`).name).toBe(area.name);
  });

  it('gives each category its own icon and colour token', () => {
    expect(new Set(CATEGORIES.map((c) => c.icon)).size).toBe(CATEGORIES.length);
    expect(new Set(CATEGORIES.map((c) => c.colorVar)).size).toBe(CATEGORIES.length);
  });
});

describe('rating', () => {
  // Novelty over every run (batches 1–4): min 0.2562884 (E4), max 0.55507976 (E5), span 0.29879136.
  it('matches hand-computed values for W5 and D1', () => {
    // W5: plausibility 0.72, coherence 0.78, novelty 0.47873873, risk 0.05
    //   noveltyNorm = (0.47873873 − 0.2562884) / 0.29879136 = 0.744501
    //   10 × (0.35·0.72 + 0.25·0.78 + 0.25·0.744501 + 0.15·0.95)
    //   = 10 × (0.252 + 0.195 + 0.186125 + 0.1425) = 7.75625 → 7.8
    expect(get('W5').scores.noveltyNorm).toBeCloseTo(0.744501, 5);
    expect(get('W5').ratingExact).toBeCloseTo(7.75625, 4);
    expect(get('W5').rating).toBe(7.8);

    // D1: plausibility 0.68, coherence 0.72, novelty 0.33448893, risk 0.72
    //   noveltyNorm = (0.33448893 − 0.2562884) / 0.29879136 = 0.261723
    //   10 × (0.238 + 0.18 + 0.065431 + 0.042) = 5.25431 → 5.3
    expect(get('D1').scores.noveltyNorm).toBeCloseTo(0.261723, 5);
    expect(get('D1').ratingExact).toBeCloseTo(5.25431, 4);
    expect(get('D1').rating).toBe(5.3);
  });

  it('normalises novelty over every run: the least novel is 0, the most novel 1', () => {
    expect(exploreData.noveltyRange).toEqual(noveltyRange(discoveries.map((d) => d.scores.novelty)));
    expect(exploreData.noveltyRange).toEqual({ min: get('E4').scores.novelty, max: get('E5').scores.novelty });
    expect(get('E4').scores.noveltyNorm).toBe(0);
    expect(get('E5').scores.noveltyNorm).toBe(1);
  });

  it('matches the ratings the batch-3 README reports on the 70-run scale of its day', () => {
    // experiments/cross-field-discoveries/ranking.csv, rating_on_70: novelty normalised over batches 1–3 only.
    const first70 = discoveries.filter((d) => d.batch <= 3);
    const range70 = noveltyRange(first70.map((d) => d.scores.novelty));
    const on70 = (d: (typeof discoveries)[number]) =>
      rating({ plausibility: d.scores.plausibility, coherence: d.scores.coherence, novelty: d.scores.novelty, aggregateRisk: d.scores.risk }, range70);
    expect(['X17', 'X01', 'X25', 'X23', 'X09', 'X13'].map((id) => on70(get(id)))).toEqual([7.7, 7.6, 6.8, 6.6, 6.6, 4.6]);
    expect(Math.max(...first70.filter((d) => d.batch === 3).map(on70))).toBe(7.7);
  });

  it('matches every rating batch 4’s ranking.csv reports on the combined scale', () => {
    // ranking.csv keeps two decimals; the app shows one.
    expect(batch4Ranking.map((r) => r.id).sort()).toEqual(batch4Pairs.map((p) => p.id).sort());
    for (const r of batch4Ranking) expect(Math.abs(get(r.id).ratingExact - r.rating), r.id).toBeLessThanOrEqual(0.005 + 1e-9);
    // Its README: E5 is the only run above 7.8.
    expect(discoveries.filter((d) => d.rating > 7.8).map((d) => d.id)).toEqual(['E5']);
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

  it('ranks the ideas from batch 4’s lowest to its highest, as its ranking.csv rates them', () => {
    const ratings = discoveries.map((d) => d.rating);
    const round1 = (v: number) => Math.round(v * 10) / 10;
    expect(Math.min(...ratings)).toBe(round1(Math.min(...batch4Ranking.map((r) => r.rating))));
    expect(Math.max(...ratings)).toBe(round1(Math.max(...batch4Ranking.map((r) => r.rating))));
    expect(get('E5').rating).toBe(Math.max(...ratings));
    expect(get('M2').rating).toBe(Math.min(...ratings));
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
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(discoveries.length);
    const searched = categoryCounts(discoveries, { q: 'injury' });
    expect(searched.get('S')).toBeGreaterThan(0);
    expect(searched.get('D') ?? 0).toBe(0);
  });

  it('sorts by rating, novelty, plausibility and lowest risk', () => {
    expect(exploreList(discoveries, { sort: 'rating' }).slice(0, 3).map((d) => d.id)).toEqual(['E5', 'W5', 'S3']);
    expect(exploreList(discoveries, { sort: 'novelty' }).slice(0, 2).map((d) => d.id)).toEqual(['E5', 'S3']);
    const plaus = exploreList(discoveries, { sort: 'plausibility' });
    expect(plaus[0]!.scores.plausibility).toBe(0.72);
    expect(plaus.at(-1)!.scores.plausibility).toBe(0.28);
    const risk = exploreList(discoveries, { sort: 'risk' });
    expect(risk[0]!.id).toBe('W5');
    expect(risk.at(-1)!.id).toBe('M2');
  });

  it('searches topics and claims, every word required', () => {
    expect(exploreList(discoveries, { q: 'PharmAgents' }).map((d) => d.id)).toContain('D1');
    expect(matchesQuery(get('D1'), '37.94% ceiling')).toBe(true); // in the novel claim only
    expect(exploreList(discoveries, { q: 'corner kick' }).map((d) => d.id)).toEqual(['X10', 'F4']);
    expect(exploreList(discoveries, { q: 'GraphCast mobility' }).map((d) => d.id)).toEqual(['X17']);
    expect(exploreList(discoveries, { q: 'köprüler' }).map((d) => d.id)).toHaveLength(24); // the category's Turkish name
    expect(exploreList(discoveries, { q: 'bio-logging drones' }).map((d) => d.id)).toEqual(['E5']);
    const wildlife = batch4Pairs.map((p) => p.id).filter((id) => id.startsWith('E'));
    expect(exploreList(discoveries, { q: 'yaban hayatı' }).map((d) => d.id).sort()).toEqual(wildlife.sort()); // the Turkish name
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
  it('derives D1’s bullets from its data and its rank among all ideas', () => {
    const points = promisingPoints(get('D1'), exploreData, paperName);
    const evidence = points.find((p) => p.key === 'evidence')!;
    expect(evidence.text).toBe('Backed by 7 passages from 3 papers:');
    expect(evidence.papers).toEqual(['self-rag', 'pharmagents', '2508.14111']);
    const n = discoveries.length;
    const below = Math.floor((100 * discoveries.filter((d) => d.scores.plausibility < 0.68).length) / n);
    expect(points.find((p) => p.key === 'plausibility')).toMatchObject({ term: { value: '0.68' }, text: `higher than ${below}% of all ${n} ideas` });
    expect(points.find((p) => p.key === 'sentences')!.text).toBe('1 sentence flagged risky — see below.');
  });

  it('names batch-2 papers by their arXiv titles and finds percentiles at the top', () => {
    const points = promisingPoints(get('F2'), exploreData, paperName);
    expect(points[0]!.papers).toEqual(['Actions Speak Louder Than Goals: Valuing Player Actions in Soccer', 'gat']);
    const n = discoveries.length;
    const asNovel = discoveries.filter((d) => d.scores.novelty >= get('F2').scores.novelty).length;
    expect(points.find((p) => p.key === 'novelty')!.text).toBe(`top ${Math.ceil((100 * asNovel) / n)}% of all ${n} ideas`);
    const w5 = promisingPoints(get('W5'), exploreData, paperName);
    const lessPlausible = discoveries.filter((d) => d.scores.plausibility < get('W5').scores.plausibility).length;
    expect(w5.find((p) => p.key === 'plausibility')!.text).toBe(`higher than ${Math.floor((100 * lessPlausible) / n)}% of all ${n} ideas`);
    expect(w5.find((p) => p.key === 'risk')!.text).toBe(`the lowest of all ${n} ideas`);
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
    expect(questions).toHaveLength(allClaims.length);
    expect(questions.filter((q) => q.status === 'risky').map((q) => q.qid).sort()).toEqual(['D1.2', 'D4.2', 'E3.2', 'M2.1', 'P1.1', 'P3.2', 'X05.1', 'X06.1', 'X13.1']);
    const round = buildRound(questions, () => 0.42);
    expect(round).toHaveLength(verdictCount('grounded') + verdictCount('risky') + ROUND_EXTRAPOLATED);
    expect(round.filter((q) => q.status === 'risky')).toHaveLength(verdictCount('risky'));
    expect(round.filter((q) => q.status === 'grounded')).toHaveLength(verdictCount('grounded'));
    expect(buildRound(questions, () => 0.42, 'A1.2')[0]!.qid).toBe('A1.2');
  });
});

describe('totals', () => {
  it('counts what the stats page reports', () => {
    const t = exploreTotals(discoveries);
    const n = discoveries.length;
    const claimed = discoveries.reduce((s, d) => s + (d.response.claimedEvidenceCount ?? 0), 0);
    const noRisky = discoveries.filter((d) => !(d.response.claimValidation?.claims ?? []).some((c) => c.status === 'risky')).length;
    expect(t).toMatchObject({ runs: n, completed: n, checksSucceeded: n, dropped: 0, claimed, noRisky, picks: EDITORS_PICKS.length });
    expect(t.plausibleAt06).toBe(discoveries.filter((d) => d.scores.plausibility >= 0.6).length);
    expect(t.sentences).toEqual({ grounded: verdictCount('grounded'), extrapolated: verdictCount('extrapolated'), risky: verdictCount('risky') });
    // Batch 3's README: US$1.598 for its 24 runs; batch 4: the total of its runs/ledger.json.
    expect(t.cost.byBatch.map((b) => [b.batch, b.runs, b.total.toFixed(3)])).toEqual([
      [1, 21, t.cost.byBatch[0]!.total.toFixed(3)],
      [2, 25, t.cost.byBatch[1]!.total.toFixed(3)],
      [3, 24, '1.598'],
      [4, batch4Pairs.length, batch4Ledger.total.toFixed(3)],
    ]);
    expect(t.cost.total).toBeCloseTo(t.cost.byBatch.reduce((s, b) => s + b.total, 0), 9);
    const bins = ratingHistogram(discoveries);
    expect(bins[0]!.from).toBe(Math.floor(get('M2').rating));
    expect(bins.at(-1)!.to).toBe(Math.ceil(get('E5').rating));
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(n);
  });
});
