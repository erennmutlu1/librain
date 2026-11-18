import type { ClaimedCitation } from '../api/types';

/** "paperId:chunkIndex", the chunk key format used across the backend. */
export function chunkKey(paperId: string, chunkIndex: number | null): string {
  return chunkIndex === null ? paperId : `${paperId}:${chunkIndex}`;
}

export function parseChunkKey(key: string): { paperId: string; chunkIndex: number | null } {
  const at = key.lastIndexOf(':');
  if (at > 0) {
    const n = Number(key.slice(at + 1));
    if (Number.isInteger(n)) return { paperId: key.slice(0, at), chunkIndex: n };
  }
  return { paperId: key, chunkIndex: null };
}

// ---------- Inline [n] markers in a synthesis answer ----------

export type AnswerPart = { kind: 'text'; text: string } | { kind: 'cite'; indices: number[]; raw: string };

const MARKER = /\[(\s*\d+(?:\s*[,;–—-]\s*\d+)*\s*)\]/g;
const MAX_RANGE = 25;

function expand(inner: string): number[] {
  const out: number[] = [];
  for (const piece of inner.split(/[,;]/)) {
    const range = piece.split(/[–—-]/).map((s) => Number(s.trim()));
    const [from, to] = range;
    if (range.length === 2 && from !== undefined && to !== undefined && to >= from && to - from <= MAX_RANGE) {
      for (let n = from; n <= to; n++) out.push(n);
    } else {
      for (const n of range) if (Number.isInteger(n)) out.push(n);
    }
  }
  return [...new Set(out)];
}

/**
 * Splits an answer into text and citation markers. "[1]", "[1, 3]" and
 * "[2-4]" become citation parts; anything else stays as text. The synthesis
 * prompt asks the model to "cite by source number", so markers are a
 * convention, not a guarantee: callers must also handle answers with none.
 */
export function parseCitationMarkers(text: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ kind: 'text', text: text.slice(last, at) });
    parts.push({ kind: 'cite', indices: expand(m[1] ?? ''), raw: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

export type CitePart = Extract<AnswerPart, { kind: 'cite' }>;
export type AnswerRun = { kind: 'text'; text: string } | { kind: 'cluster'; lead: string; cites: CitePart[]; trail: string };

const TRAILING_PUNCTUATION = /^[.,;:!?)\]”’"']+/;

/**
 * Groups adjacent citation markers with the word before them and any
 * punctuation after them, so a line never breaks between "forecasting", its
 * chips and the full stop.
 */
export function groupForWrapping(parts: readonly AnswerPart[]): AnswerRun[] {
  const out: AnswerRun[] = [];
  let i = 0;
  while (i < parts.length) {
    const part = parts[i]!;
    if (part.kind === 'text') {
      out.push({ kind: 'text', text: part.text });
      i++;
      continue;
    }
    const cites: CitePart[] = [];
    while (i < parts.length && parts[i]!.kind === 'cite') cites.push(parts[i++] as CitePart);

    let lead = '';
    const prev = out.at(-1);
    if (prev?.kind === 'text') {
      const m = /\S+\s?$/.exec(prev.text);
      if (m) {
        lead = m[0];
        prev.text = prev.text.slice(0, prev.text.length - lead.length);
      }
    }
    let trail = '';
    const next = parts[i];
    if (next?.kind === 'text') {
      trail = TRAILING_PUNCTUATION.exec(next.text)?.[0] ?? '';
      if (trail) {
        out.push({ kind: 'cluster', lead, cites, trail });
        out.push({ kind: 'text', text: next.text.slice(trail.length) });
        i++;
        continue;
      }
    }
    out.push({ kind: 'cluster', lead, cites, trail });
  }
  return out.filter((r) => r.kind === 'cluster' || r.text !== '');
}

// ---------- Naive-RAG fabricated citations ----------

export interface CitationAudit {
  total: number;
  resolved: ClaimedCitation[];
  /** Citations the model claimed that are not in the retrieved set. */
  fabricated: ClaimedCitation[];
  /** Distinct fabricated chunk keys (a fabricated key may be cited repeatedly). */
  fabricatedKeys: string[];
  /** The API's own fabricatedCitationCount, when given. */
  reportedFabricated: number | null;
  /** False when the API's count disagrees with the per-citation flags. */
  consistent: boolean;
}

/**
 * Classifies Naive-RAG claimed citations. A citation is fabricated when the
 * backend resolved it against the retrieved chunks and found no match
 * (isResolved === false). The API also reports a count; we keep both and flag
 * a disagreement instead of silently trusting either.
 */
export function auditClaimedCitations(
  claimed: readonly ClaimedCitation[],
  reportedFabricated?: number | null,
): CitationAudit {
  const resolved = claimed.filter((c) => c.isResolved);
  const fabricated = claimed.filter((c) => !c.isResolved);
  const fabricatedKeys = [...new Set(fabricated.map((c) => chunkKey(c.paperId, c.chunkIndex)))];
  const reported = typeof reportedFabricated === 'number' ? reportedFabricated : null;
  return {
    total: claimed.length,
    resolved,
    fabricated,
    fabricatedKeys,
    reportedFabricated: reported,
    consistent: reported === null || reported === fabricated.length,
  };
}

/**
 * Port of NaiveRagCitations.ParseFreeTextCitations: extracts "[paper]" and
 * "[paper:chunk]" tokens from prose. Tokens without a letter or a dot (bare
 * "[3]" list markers) are ignored.
 */
export function parseFreeTextCitations(text: string): { paperId: string; chunkIndex: number | null }[] {
  const out: { paperId: string; chunkIndex: number | null }[] = [];
  for (const m of text.matchAll(/\[([^[\]]+)\]/g)) {
    for (const raw of (m[1] ?? '').split(',')) {
      const token = raw.trim();
      if (!token) continue;
      let paperId = token;
      let chunkIndex: number | null = null;
      const colon = token.lastIndexOf(':');
      if (colon > 0 && colon < token.length - 1) {
        const n = Number(token.slice(colon + 1).trim());
        if (Number.isInteger(n)) {
          paperId = token.slice(0, colon).trim();
          chunkIndex = n;
        }
      }
      if (!/\p{L}/u.test(paperId) && !paperId.includes('.')) continue;
      out.push({ paperId, chunkIndex });
    }
  }
  return out;
}
