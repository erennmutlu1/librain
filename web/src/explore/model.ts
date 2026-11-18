/*
 * Explore's view of the recorded runs: categories, ratings, takeaways,
 * percentiles, filtering, related ideas and the quiz deck. Everything here is
 * pure and computed from the recorded data; nothing is written by hand except
 * the editor's takeaways, which come from the experiment manifests.
 */
import { normalizeDiscoverRequest, normalizeDiscoverResponse } from '../api/normalize';
import type { ClaimStatus, ClaimValidationEntry, DiscoverRequest, DiscoverResponse } from '../api/types';
import { currentLang, type Lang } from '../i18n/lang';
import { chunkKey } from '../lib/citations';
import { categoryOf, type Category } from './categories';
import { fmtNum, fmtPercent } from './fmt';
import { modelText } from './model.i18n';
import type { ExploreManifest, ExplorePick } from './manifests';
import { normalizeNovelty, noveltyRange, rating, ratingExact, type NoveltyRange } from './rating';

export interface DiscoveryScores {
  plausibility: number;
  coherence: number;
  novelty: number;
  /** Novelty rescaled over all the runs (the rating uses this). */
  noveltyNorm: number;
  /** Aggregate claim risk. */
  risk: number;
  quality: number;
}

export interface Discovery {
  id: string;
  category: Category;
  batch: 1 | 2;
  /** Repository path of the recorded run. */
  source: string;
  request: DiscoverRequest;
  response: DiscoverResponse;
  /** The API answered 200 when it was recorded. */
  completed: boolean;
  costUsd: number | null;
  /** Set for the editor's picks. */
  pick: ExplorePick | null;
  /** The editor's takeaway, or the hypothesis's first sentence, trimmed. */
  takeaway: string;
  scores: DiscoveryScores;
  rating: number;
  ratingExact: number;
  /** Distinct papers behind the supporting evidence, in first-cited order. */
  paperIds: string[];
  /** Sentence verdicts (empty when validation failed). */
  verdicts: ClaimValidationEntry[];
  riskyCount: number;
  /** The prose is a Turkish translation of the recorded run (src/i18n/discoveries). */
  translated: boolean;
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---------- Text ----------

const ABBREVIATIONS = /(?:\b(?:e\.g|i\.e|et al|etc|vs|cf|Fig|Eq|approx|ca)\.)$/i;

/** The first sentence of a paragraph (keeps "e.g." and "et al." inside the sentence). */
export function firstSentence(text: string): string {
  const t = text.trim();
  const boundary = /[.!?](?=\s+["“(]?[\p{Lu}0-9])/gu;
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(t)) !== null) {
    const end = m.index + 1;
    if (!ABBREVIATIONS.test(t.slice(0, end))) return t.slice(0, end);
  }
  return t;
}

/** Cut at a word boundary to at most `max` characters, with an ellipsis when cut. */
export function trimText(text: string, max = 170): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  const head = (space > 0 ? cut.slice(0, space) : t.slice(0, max)).replace(/[\s,;:.(–—-]+$/, '');
  return `${head}…`;
}

export function takeawayFor(pick: ExplorePick | null, hypothesis: string): string {
  return pick?.takeaway.trim() || trimText(firstSentence(hypothesis));
}

// ---------- Building ----------

export interface RawRun {
  /** Path of the copy, relative to the data folder, e.g. "new-areas-discoveries/runs/F4.json". */
  file: string;
  raw: unknown;
  /** The raw run has a translation laid over it (see i18n/discoveries/localize.ts). */
  translated?: boolean;
}

export interface ExploreData {
  /** In display order: batch, then category, then id number. */
  discoveries: Discovery[];
  byId: ReadonlyMap<string, Discovery>;
  noveltyRange: NoveltyRange;
  /** Editor's picks in manifest order. */
  picks: Discovery[];
  /** Areas the experiments considered and left out, with the reason (translated with the runs). */
  droppedAreas: { area: string; reason: string }[];
}

function idOrder(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

export function buildExploreData(runs: readonly RawRun[], manifests: readonly ExploreManifest[]): ExploreData {
  const picks = new Map(manifests.flatMap((m) => m.picks.map((p) => [p.id, p] as const)));
  const bySourceFolder = new Map(manifests.map((m) => [m.sourceDir.split('/').pop()!, m]));

  const parsed = runs.map(({ file, raw, translated = false }) => {
    const r = isRecord(raw) ? raw : {};
    const id = typeof r.id === 'string' ? r.id : '';
    const [folder = ''] = file.split('/');
    const manifest = bySourceFolder.get(folder);
    if (!manifest) throw new Error(`${file} is not in a known experiment folder.`);
    if (!file.endsWith(`/runs/${id}.json`)) throw new Error(`${file} records run ${id || '(no id)'}.`);
    const response = normalizeDiscoverResponse(r.response);
    const request: DiscoverRequest = { provider: 'anthropic', ...normalizeDiscoverRequest(r.request) };
    return { id, file, manifest, raw: r, request, response, translated };
  });

  const novelties = parsed.map((p) => p.response.evaluation?.noveltyScore ?? 0);
  const range = noveltyRange(novelties);

  const discoveries = parsed.map(({ id, file, manifest, raw, request, response, translated }): Discovery => {
    const e = response.evaluation;
    const cv = response.claimValidation;
    const failed = !cv || cv.validationFailed === true;
    const verdicts = failed ? [] : cv.claims;
    const scores: DiscoveryScores = {
      plausibility: e?.plausibilityScore ?? 0,
      coherence: e?.structuralCoherenceScore ?? 0,
      novelty: e?.noveltyScore ?? 0,
      noveltyNorm: normalizeNovelty(e?.noveltyScore ?? 0, range),
      // An unvalidated claim counts as fully risky, as the API reports it.
      risk: cv ? cv.aggregateRisk : 1,
      quality: e?.qualityScore ?? 0,
    };
    const inputs = { plausibility: scores.plausibility, coherence: scores.coherence, novelty: scores.novelty, aggregateRisk: scores.risk };
    const pick = picks.get(id) ?? null;
    return {
      id,
      category: categoryOf(id),
      batch: manifest.batch,
      source: `${manifest.sourceDir}/${file.slice(file.indexOf('/') + 1)}`,
      request,
      response,
      completed: raw.status === 200,
      costUsd: num(raw.costUsd),
      pick,
      takeaway: takeawayFor(pick, response.hypothesis),
      scores,
      rating: rating(inputs, range),
      ratingExact: ratingExact(inputs, range),
      paperIds: [...new Set(response.supportingEvidence.map((s) => s.paperId))],
      verdicts,
      riskyCount: verdicts.filter((c) => c.status === 'risky').length,
      translated,
    };
  });

  discoveries.sort((a, b) => a.batch - b.batch || categoryIndex(a) - categoryIndex(b) || idOrder(a.id, b.id));
  const byId = new Map(discoveries.map((d) => [d.id, d]));
  const missing = [...picks.keys()].filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`Editor's picks without a run: ${missing.join(', ')}.`);

  return {
    discoveries,
    byId,
    noveltyRange: range,
    picks: manifests.flatMap((m) => m.picks.map((p) => byId.get(p.id)!)),
    droppedAreas: manifests.flatMap((m) => m.droppedAreas),
  };
}

function categoryIndex(d: Discovery): number {
  return 'DACNFSWPJ'.indexOf(d.category.prefix);
}

// ---------- Percentiles ----------

/** Percent of `values` strictly below `x`, rounded down. */
export function percentBelow(values: readonly number[], x: number): number {
  if (values.length === 0) return 0;
  return Math.floor((100 * values.filter((v) => v < x).length) / values.length);
}

/** Percent of `values` strictly above `x`, rounded down. */
export function percentAbove(values: readonly number[], x: number): number {
  if (values.length === 0) return 0;
  return Math.floor((100 * values.filter((v) => v > x).length) / values.length);
}

/**
 * The smallest "top N%" that holds every value at least `x`, rounded up. Ties
 * count against the run (four runs sharing the top score are the top 9%, not
 * the top 3%), so the claim is never flattering.
 */
export function topPercent(values: readonly number[], x: number): number {
  if (values.length === 0) return 100;
  return Math.ceil((100 * values.filter((v) => v >= x).length) / values.length);
}

/** Like topPercent, for a measure where lower is better. */
export function bottomPercent(values: readonly number[], x: number): number {
  if (values.length === 0) return 100;
  return Math.ceil((100 * values.filter((v) => v <= x).length) / values.length);
}

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

// ---------- "Why it's promising" ----------

export type PointTone = 'strong' | 'neutral' | 'caution';
export type GlossaryKey = 'novelty' | 'plausibility' | 'coherence' | 'risk' | ClaimStatus;

export interface PromisingPoint {
  key: string;
  tone: PointTone;
  /** A glossary term the point leads with, rendered with its tooltip. */
  term?: { key: GlossaryKey; label: string; value: string };
  text: string;
  /** Paper names listed after the text. */
  papers?: string[];
  /** In-page anchor the point refers to. */
  href?: string;
}

function scorePoint(
  key: 'plausibility' | 'novelty' | 'coherence',
  value: number,
  all: readonly number[],
  lang: Lang,
): PromisingPoint {
  const t = modelText[lang];
  const n = all.length;
  const top = topPercent(all, value);
  const below = percentBelow(all, value);
  const mid = median(all);
  const term = { key, label: t[key], value: fmtNum(value, 2, lang) };
  const pct = (v: number) => fmtPercent(v / 100, lang);
  if (top <= 10) return { key, tone: 'strong', term, text: t.top(pct(top), n) };
  if (value > mid) return { key, tone: 'strong', term, text: t.higher(pct(below), n) };
  if (value === mid) return { key, tone: 'neutral', term, text: t.median(n) };
  return { key, tone: 'caution', term, text: t.belowMedian(n, fmtNum(mid, 2, lang)) };
}

/**
 * Evidence bullets derived from the run and its rank among all the runs.
 * `paperName` maps a corpus id to a display name.
 */
export function promisingPoints(
  d: Discovery,
  data: ExploreData,
  paperName: (id: string) => string,
  lang: Lang = currentLang(),
): PromisingPoint[] {
  const t = modelText[lang];
  const all = data.discoveries;
  const passages = d.response.supportingEvidence.length;
  const papers = d.paperIds.length;
  const points: PromisingPoint[] = [
    {
      key: 'evidence',
      tone: passages > 0 ? 'strong' : 'caution',
      text: passages > 0 ? t.evidence(passages, papers) : t.noEvidence,
      ...(passages > 0 ? { papers: d.paperIds.map(paperName) } : {}),
    },
    scorePoint('plausibility', d.scores.plausibility, all.map((x) => x.scores.plausibility), lang),
    scorePoint('novelty', d.scores.novelty, all.map((x) => x.scores.novelty), lang),
    scorePoint('coherence', d.scores.coherence, all.map((x) => x.scores.coherence), lang),
  ];

  const risks = all.map((x) => x.scores.risk);
  const riskTerm = { key: 'risk' as const, label: t.claimRisk, value: fmtNum(d.scores.risk, 2, lang) };
  const lowest = bottomPercent(risks, d.scores.risk);
  const fewerThan = percentAbove(risks, d.scores.risk);
  if (d.scores.risk === Math.min(...risks)) {
    points.push({ key: 'risk', tone: 'strong', term: riskTerm, text: t.lowest(all.length) });
  } else if (lowest <= 25) {
    points.push({ key: 'risk', tone: 'strong', term: riskTerm, text: t.lower(fmtPercent(fewerThan / 100, lang), all.length) });
  }

  const checked = d.verdicts.length;
  if (d.response.claimValidation?.validationFailed === true || !d.response.claimValidation) {
    points.push({ key: 'sentences', tone: 'caution', text: t.checkFailed, href: '#unproven' });
  } else if (d.riskyCount === 0) {
    points.push({
      key: 'sentences',
      tone: 'strong',
      text: t.noRisky(checked),
    });
  } else {
    points.push({
      key: 'sentences',
      tone: 'caution',
      text: t.someRisky(d.riskyCount),
      href: '#unproven',
    });
  }
  return points;
}

// ---------- The evidence to quote ----------

/**
 * Up to `max` passages to quote: first the chunks the generator says it built
 * on, then the first passage from each paper not yet shown, in evidence order.
 */
export function topPassages(d: Discovery, max = 3) {
  const evidence = d.response.supportingEvidence.filter((e) => (e.content ?? '').trim() !== '');
  const byKey = new Map(evidence.map((e) => [chunkKey(e.paperId, e.chunkIndex), e]));
  const chosen: typeof evidence = [];
  const add = (e: (typeof evidence)[number] | undefined) => {
    if (e && !chosen.includes(e) && chosen.length < max) chosen.push(e);
  };
  for (const b of d.response.extrapolationBasis) if (b.groundedInChunkId) add(byKey.get(b.groundedInChunkId));
  for (const e of evidence) if (!chosen.some((c) => c.paperId === e.paperId)) add(e);
  for (const e of evidence) add(e);
  return chosen;
}

// ---------- Related ideas ----------

export interface Related {
  discovery: Discovery;
  /** Papers the two runs both draw on. */
  sharedPapers: string[];
  sameCategory: boolean;
}

/** Up to `max` runs sharing a paper (counted double) or the category, best match first, then by rating. */
export function relatedTo(d: Discovery, data: ExploreData, max = 3): Related[] {
  return data.discoveries
    .filter((o) => o.id !== d.id)
    .map((o) => ({
      discovery: o,
      sharedPapers: o.paperIds.filter((p) => d.paperIds.includes(p)),
      sameCategory: o.category.prefix === d.category.prefix,
    }))
    .filter((r) => r.sharedPapers.length > 0 || r.sameCategory)
    .sort(
      (a, b) =>
        2 * b.sharedPapers.length + Number(b.sameCategory) - (2 * a.sharedPapers.length + Number(a.sameCategory)) ||
        b.discovery.ratingExact - a.discovery.ratingExact ||
        idOrder(a.discovery.id, b.discovery.id),
    )
    .slice(0, max);
}

// ---------- Explore list ----------

/** The sort keys; sortLabel() names them in the interface language. */
export const SORTS = {
  rating: { label: modelText.en.sorts.rating },
  novelty: { label: modelText.en.sorts.novelty },
  plausibility: { label: modelText.en.sorts.plausibility },
  risk: { label: modelText.en.sorts.risk },
} as const;
export type SortKey = keyof typeof SORTS;

export function sortLabel(key: SortKey, lang: Lang = currentLang()): string {
  return modelText[lang].sorts[key];
}

export function isSortKey(v: string | null): v is SortKey {
  return v !== null && Object.hasOwn(SORTS, v);
}

export interface ExploreQuery {
  q?: string;
  /** Category prefix, or undefined for all. */
  category?: string;
  sort?: SortKey;
  savedOnly?: boolean;
  saved?: ReadonlySet<string>;
}

/** Lower-case, and fold Turkish letters (ı, ç, ğ, ö, ş, ü, İ) to their plain form so "guven" finds "güven". */
function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Every word of the query must appear in the id, category (either language),
 * topics, takeaway, hypothesis or novel claim, in whichever language the data is in.
 */
export function matchesQuery(d: Discovery, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(
    [
      d.id,
      d.category.name,
      d.category.tr.name,
      d.request.topicA,
      d.request.topicB ?? '',
      d.takeaway,
      d.response.hypothesis,
      d.response.novelClaim,
    ].join(' \n '),
  );
  return words.every((w) => hay.includes(w));
}

const SORTERS: Record<SortKey, (a: Discovery, b: Discovery) => number> = {
  rating: (a, b) => b.ratingExact - a.ratingExact,
  novelty: (a, b) => b.scores.novelty - a.scores.novelty,
  plausibility: (a, b) => b.scores.plausibility - a.scores.plausibility || b.ratingExact - a.ratingExact,
  risk: (a, b) => a.scores.risk - b.scores.risk || b.ratingExact - a.ratingExact,
};

function passesBase(d: Discovery, query: ExploreQuery): boolean {
  if (query.savedOnly && !query.saved?.has(d.id)) return false;
  return matchesQuery(d, query.q ?? '');
}

export function exploreList(all: readonly Discovery[], query: ExploreQuery): Discovery[] {
  const sorter = SORTERS[query.sort ?? 'rating'];
  return all
    .filter((d) => passesBase(d, query) && (!query.category || d.category.prefix === query.category))
    .sort((a, b) => sorter(a, b) || idOrder(a.id, b.id));
}

/** How many runs each category chip would show, given the search and the saved filter. */
export function categoryCounts(all: readonly Discovery[], query: ExploreQuery): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of all) if (passesBase(d, query)) counts.set(d.category.prefix, (counts.get(d.category.prefix) ?? 0) + 1);
  return counts;
}

// ---------- Discovery of the day, surprise ----------

/** Days since 1970-01-01 for the calendar date `date` shows in local time. */
export function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** The same pick all day, a different one the next day, cycling through the picks. */
export function discoveryOfTheDay(picks: readonly Discovery[], date: Date): Discovery | undefined {
  if (picks.length === 0) return undefined;
  return picks[dayNumber(date) % picks.length];
}

export const SURPRISE_MIN_RATING = 6;

/** A random run rated at least SURPRISE_MIN_RATING, other than `excludeId`. */
export function pickSurprise(all: readonly Discovery[], excludeId?: string, random: () => number = Math.random): Discovery | undefined {
  const pool = all.filter((d) => d.rating >= SURPRISE_MIN_RATING && d.id !== excludeId);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

// ---------- Quiz ----------

export interface QuizQuestion {
  /** "D1.2": run id and 1-based sentence number. */
  qid: string;
  discovery: Discovery;
  sentence: string;
  status: ClaimStatus;
  probability: number;
  rationale: string;
}

export function quizQuestions(all: readonly Discovery[]): QuizQuestion[] {
  return all.flatMap((d) =>
    d.verdicts.map((v, i) => ({
      qid: `${d.id}.${i + 1}`,
      discovery: d,
      sentence: v.sentence,
      status: v.status,
      probability: v.factualHallucinationProbability,
      rationale: v.rationale,
    })),
  );
}

export const ROUND_EXTRAPOLATED = 8;

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * One round: every risky and grounded sentence (they are rare) plus a sample
 * of extrapolated ones, shuffled. `firstQid` (a shared question link) goes first.
 */
export function buildRound(questions: readonly QuizQuestion[], random: () => number = Math.random, firstQid?: string): QuizQuestion[] {
  const rare = questions.filter((q) => q.status !== 'extrapolated');
  const common = shuffle(
    questions.filter((q) => q.status === 'extrapolated'),
    random,
  ).slice(0, ROUND_EXTRAPOLATED);
  let round = shuffle([...rare, ...common], random);
  const first = firstQid ? questions.find((q) => q.qid === firstQid) : undefined;
  if (first) round = [first, ...round.filter((q) => q.qid !== first.qid)];
  return round;
}

// ---------- Stats ----------

export interface Bin {
  from: number;
  to: number;
  count: number;
  ids: string[];
}

/** Ratings in half-point bins from the lowest whole number to the highest. */
export function ratingHistogram(all: readonly Discovery[], width = 0.5): Bin[] {
  const ratings = all.map((d) => d.rating);
  const lo = Math.floor(Math.min(...ratings));
  const hi = Math.max(lo + width, Math.ceil(Math.max(...ratings)));
  const bins: Bin[] = [];
  for (let from = lo; from < hi - 1e-9; from = Math.round((from + width) * 100) / 100) {
    bins.push({ from, to: Math.round((from + width) * 100) / 100, count: 0, ids: [] });
  }
  for (const d of all) {
    const i = Math.min(bins.length - 1, Math.floor((d.rating - lo) / width + 1e-9));
    bins[i]!.count++;
    bins[i]!.ids.push(d.id);
  }
  return bins;
}

export interface CategoryStat {
  category: Category;
  count: number;
  average: number;
  best: Discovery;
}

export function categoryStats(all: readonly Discovery[], categories: readonly Category[]): CategoryStat[] {
  return categories
    .map((category) => {
      const runs = all.filter((d) => d.category.prefix === category.prefix);
      if (runs.length === 0) return null;
      const average = runs.reduce((s, d) => s + d.ratingExact, 0) / runs.length;
      const best = runs.reduce((b, d) => (d.ratingExact > b.ratingExact ? d : b));
      return { category, count: runs.length, average, best };
    })
    .filter((s): s is CategoryStat => s !== null);
}

export interface ExploreTotals {
  runs: number;
  completed: number;
  claimed: number;
  dropped: number;
  /** Kept citations: every one points at a retrieved passage, by the contract. */
  kept: number;
  checksSucceeded: number;
  plausibleAt06: number;
  noRisky: number;
  picks: number;
  sentences: Record<ClaimStatus, number>;
  cost: { total: number; min: number; max: number; mean: number; byBatch: { batch: 1 | 2; runs: number; total: number }[] };
}

export function exploreTotals(all: readonly Discovery[]): ExploreTotals {
  const costs = all.map((d) => d.costUsd ?? 0);
  const sentences: Record<ClaimStatus, number> = { grounded: 0, extrapolated: 0, risky: 0 };
  for (const d of all) for (const v of d.verdicts) sentences[v.status]++;
  const total = costs.reduce((s, c) => s + c, 0);
  return {
    runs: all.length,
    completed: all.filter((d) => d.completed).length,
    claimed: all.reduce((s, d) => s + (d.response.claimedEvidenceCount ?? d.response.supportingEvidence.length), 0),
    dropped: all.reduce((s, d) => s + (d.response.droppedEvidenceCount ?? 0), 0),
    kept: all.reduce((s, d) => s + d.response.supportingEvidence.length, 0),
    checksSucceeded: all.filter((d) => d.response.claimValidation && d.response.claimValidation.validationFailed !== true).length,
    plausibleAt06: all.filter((d) => d.scores.plausibility >= 0.6).length,
    noRisky: all.filter((d) => d.riskyCount === 0 && d.verdicts.length > 0).length,
    picks: all.filter((d) => d.pick).length,
    sentences,
    cost: {
      total,
      min: Math.min(...costs),
      max: Math.max(...costs),
      mean: total / Math.max(1, all.length),
      byBatch: ([1, 2] as const).map((batch) => {
        const runs = all.filter((d) => d.batch === batch);
        return { batch, runs: runs.length, total: runs.reduce((s, d) => s + (d.costUsd ?? 0), 0) };
      }),
    },
  };
}
