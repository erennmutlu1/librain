/*
 * Aligns ClaimValidator sentences with the novelClaim text they came from.
 *
 * The validator re-types sentences rather than quoting offsets, so its output
 * drifts from the source: curly vs straight quotes, different dashes,
 * collapsed whitespace, a clause split off into its own "sentence" with a new
 * capital letter and full stop. Matching therefore runs on word tokens
 * (letters and digits only, case- and accent-folded) that keep their
 * character offsets in the original string:
 *
 *   1. exact: the claim's token sequence appears contiguously in the text;
 *   2. fuzzy: otherwise, the best still-free sentence of the text with token
 *      Dice similarity >= FUZZY_THRESHOLD;
 *   3. anything left is reported as unmatched so the UI can list it below.
 */

export interface Span {
  start: number;
  end: number;
}

export type MatchMethod = 'exact' | 'fuzzy';

export interface SentenceMatch {
  span: Span;
  method: MatchMethod;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  /** Index into the matched sentence list, or null for unannotated text. */
  index: number | null;
}

interface Token {
  norm: string;
  start: number;
  end: number;
}

export const FUZZY_THRESHOLD = 0.6;

const WORD = /[\p{L}\p{N}]+/gu;

function fold(word: string): string {
  return word.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(WORD)) {
    const start = m.index ?? 0;
    tokens.push({ norm: fold(m[0]), start, end: start + m[0].length });
  }
  return tokens;
}

/** Normalises quotes, dashes and whitespace for display-level comparisons. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const TRAILING = /[.,;:!?'"’”)\]…]/;
const LEADING = /['"‘“([]/;

/** Grows a token span to swallow adjacent punctuation and quotes (not spaces). */
function widen(text: string, start: number, end: number): Span {
  let s = start;
  let e = end;
  while (s > 0 && LEADING.test(text.charAt(s - 1))) s--;
  while (e < text.length && TRAILING.test(text.charAt(e))) e++;
  return { start: s, end: e };
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

function isFree(span: Span, taken: Span[]): boolean {
  return taken.every((t) => !overlaps(span, t));
}

const ABBREVIATIONS = new Set(['e.g', 'i.e', 'et al', 'al', 'fig', 'eq', 'vs', 'cf', 'approx', 'etc', 'no', 'ref', 'sec']);

/** Splits text into sentence spans. Conservative: only breaks before a capital, digit or opening quote. */
export function segmentSentences(text: string): Span[] {
  const spans: Span[] = [];
  const boundary = /[.!?]+['"’”)\]]*\s+(?=['"‘“([]?[\p{Lu}\p{N}])/gu;
  let start = 0;
  for (const m of text.matchAll(boundary)) {
    const punctAt = m.index ?? 0;
    const before = text.slice(Math.max(0, punctAt - 8), punctAt).toLowerCase();
    const lastWord = before.split(/\s+/).pop() ?? '';
    if (ABBREVIATIONS.has(lastWord.replace(/^[(["']+/, ''))) continue;
    const end = punctAt + m[0].trimEnd().length;
    if (end > start) spans.push({ start, end });
    start = punctAt + m[0].length;
  }
  if (start < text.length && text.slice(start).trim()) spans.push({ start, end: text.length });
  // Trim leading whitespace inside each span.
  return spans.map((s) => {
    let st = s.start;
    while (st < s.end && /\s/.test(text.charAt(st))) st++;
    return { start: st, end: s.end };
  });
}

function findExact(textTokens: Token[], needle: Token[], text: string, taken: Span[], cursor: number): Span | null {
  if (needle.length === 0 || needle.length > textTokens.length) return null;
  const candidates: Span[] = [];
  outer: for (let i = 0; i <= textTokens.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (textTokens[i + j]!.norm !== needle[j]!.norm) continue outer;
    }
    const first = textTokens[i]!;
    const last = textTokens[i + needle.length - 1]!;
    const span = widen(text, first.start, last.end);
    if (isFree(span, taken)) candidates.push(span);
  }
  // Prefer the first free occurrence after the previous match (validators keep order).
  return candidates.find((c) => c.start >= cursor) ?? candidates[0] ?? null;
}

function dice(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of a) counts.set(t, (counts.get(t) ?? 0) + 1);
  let shared = 0;
  for (const t of b) {
    const c = counts.get(t) ?? 0;
    if (c > 0) {
      shared++;
      counts.set(t, c - 1);
    }
  }
  return (2 * shared) / (a.length + b.length);
}

/**
 * Locates each sentence in `text`. Returns one entry per input sentence, in
 * input order: the matched span, or null when it could not be placed.
 * Matched spans never overlap.
 */
export function matchSentences(text: string, sentences: readonly string[]): (SentenceMatch | null)[] {
  const textTokens = tokenize(text);
  const taken: Span[] = [];
  const results: (SentenceMatch | null)[] = sentences.map(() => null);
  let cursor = 0;

  sentences.forEach((sentence, i) => {
    const span = findExact(textTokens, tokenize(sentence), text, taken, cursor);
    if (span) {
      results[i] = { span, method: 'exact' };
      taken.push(span);
      cursor = span.end;
    }
  });

  const pending = results.map((r, i) => (r === null ? i : -1)).filter((i) => i >= 0);
  if (pending.length > 0) {
    const units = segmentSentences(text);
    for (const i of pending) {
      const needle = tokenize(sentences[i] ?? '').map((t) => t.norm);
      let best: { span: Span; score: number } | null = null;
      for (const unit of units) {
        if (!isFree(unit, taken)) continue;
        const unitTokens = tokenize(text.slice(unit.start, unit.end)).map((t) => t.norm);
        const score = dice(needle, unitTokens);
        if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) best = { span: unit, score };
      }
      if (best) {
        results[i] = { span: best.span, method: 'fuzzy' };
        taken.push(best.span);
      }
    }
  }

  return results;
}

/** Cuts `text` into consecutive segments, tagging those covered by a match. */
export function buildSegments(text: string, matches: readonly (SentenceMatch | null)[]): Segment[] {
  const placed = matches
    .map((m, index) => (m ? { ...m.span, index } : null))
    .filter((m): m is Span & { index: number } => m !== null)
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let pos = 0;
  for (const p of placed) {
    if (p.start < pos) continue; // defensive: overlapping spans are never emitted twice
    if (p.start > pos) segments.push({ start: pos, end: p.start, text: text.slice(pos, p.start), index: null });
    segments.push({ start: p.start, end: p.end, text: text.slice(p.start, p.end), index: p.index });
    pos = p.end;
  }
  if (pos < text.length) segments.push({ start: pos, end: text.length, text: text.slice(pos), index: null });
  return segments;
}

export interface Annotation {
  segments: Segment[];
  matches: (SentenceMatch | null)[];
  /** Indexes of sentences that could not be placed in the text. */
  unmatched: number[];
  /** For each sentence, the index of the best-overlapping secondary sentence (e.g. extrapolation basis), or null. */
  secondary: (number | null)[];
}

/**
 * Full annotation for the novel-claim view: primary sentences (validator
 * verdicts) become highlighted segments; secondary sentences (the generator's
 * own extrapolation basis) are linked to whichever primary span they overlap
 * most, so each highlight can show both points of view.
 */
export function annotate(
  text: string,
  primary: readonly string[],
  secondarySentences: readonly string[] = [],
): Annotation {
  const matches = matchSentences(text, primary);
  const secondaryMatches = matchSentences(text, secondarySentences);
  const secondary = matches.map((m) => {
    if (!m) return null;
    let bestIndex: number | null = null;
    let bestOverlap = 0;
    for (let index = 0; index < secondaryMatches.length; index++) {
      const s = secondaryMatches[index];
      if (!s) continue;
      const overlap = Math.min(m.span.end, s.span.end) - Math.max(m.span.start, s.span.start);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestIndex = index;
      }
    }
    return bestIndex;
  });
  return {
    segments: buildSegments(text, matches),
    matches,
    unmatched: matches.map((m, i) => (m ? -1 : i)).filter((i) => i >= 0),
    secondary,
  };
}
