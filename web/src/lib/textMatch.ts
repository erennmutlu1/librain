/*
 * Forgiving text matching for search boxes and suggestions: case, accents and
 * the Turkish dotted/dotless i do not matter, so "ozgun" finds "özgün",
 * "isik" finds "ışık" and "IMAGE" finds "image" in either language.
 */

/** Folds one character: lower case, no combining marks, ı → i. */
function foldChar(ch: string): string {
  return ch
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i');
}

/** The folded text, with whitespace runs collapsed to one space. */
export function fold(text: string): string {
  return foldWithMap(text).folded;
}

/**
 * The folded text and, for every folded character, the index of the original
 * character it came from, so a match can be highlighted in the original.
 */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let index = 0;
  let lastSpace = true; // drops leading whitespace
  for (const ch of text) {
    const isSpace = /\s/.test(ch);
    if (isSpace) {
      if (!lastSpace) {
        folded += ' ';
        map.push(index);
      }
    } else {
      for (const f of foldChar(ch)) {
        folded += f;
        map.push(index);
      }
    }
    lastSpace = isSpace;
    index += ch.length;
  }
  if (folded.endsWith(' ')) {
    folded = folded.slice(0, -1);
    map.pop();
  }
  return { folded, map };
}

/** Does `text` contain `query` (folded)? An empty query matches everything. */
export function includesFolded(text: string, query: string): boolean {
  const q = fold(query);
  return q === '' || fold(text).includes(q);
}

/** Two topics are the same when they fold to the same text. */
export function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return fold(a ?? '') === fold(b ?? '');
}

export interface MatchRange {
  start: number;
  end: number;
}

/** Where `query` first occurs in `text`, in `text`'s own indices; null when it does not. */
export function findMatch(text: string, query: string): MatchRange | null {
  const q = fold(query);
  if (!q) return null;
  const { folded, map } = foldWithMap(text);
  const at = folded.indexOf(q);
  if (at < 0) return null;
  const first = map[at] ?? 0;
  const lastIndex = map[at + q.length - 1] ?? first;
  // The last matched original character may be a surrogate pair.
  const lastChar = String.fromCodePoint(text.codePointAt(lastIndex) ?? 0);
  return { start: first, end: lastIndex + lastChar.length };
}

/**
 * How well `text` matches: 0 starts with the query, 1 a word starts with it,
 * 2 contains it, null no match. Lower ranks sort first.
 */
export function matchRank(text: string, query: string): 0 | 1 | 2 | null {
  const q = fold(query);
  if (!q) return 2;
  const f = fold(text);
  const at = f.indexOf(q);
  if (at < 0) return null;
  if (at === 0) return 0;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(f) ? 1 : 2;
}
