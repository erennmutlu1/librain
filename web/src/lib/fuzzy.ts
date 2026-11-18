/*
 * Fuzzy-ish matching for the command palette: forgiving enough for "expl st"
 * or "kesfet", strict enough that a typed topic does not match every long
 * takeaway by scattered letters.
 */

/** Lower case without accents, so "Keşfet", "KEŞFET" and "kesfet" compare equal (Turkish ı and İ included). */
export function fold(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
}

const SUBSEQUENCE_MAX_TARGET = 48;

/** Letters of `token` in order inside `target`, close together; returns the span length or -1. */
function subsequenceSpan(token: string, target: string): number {
  let best = -1;
  for (let start = target.indexOf(token[0]!); start >= 0; start = target.indexOf(token[0]!, start + 1)) {
    let at = start;
    let ok = true;
    for (let i = 1; i < token.length; i++) {
      at = target.indexOf(token[i]!, at + 1);
      if (at < 0) {
        ok = false;
        break;
      }
    }
    if (!ok) break;
    const span = at - start + 1;
    if (best < 0 || span < best) best = span;
  }
  return best;
}

function tokenScore(token: string, label: string, extra: string): number {
  if (label.startsWith(token)) return 100;
  if (label.includes(` ${token}`) || label.includes(`-${token}`)) return 80;
  if (label.includes(token)) return 60;
  if (extra.includes(` ${token}`) || extra.startsWith(token)) return 40;
  if (extra.includes(token)) return 25;
  if (token.length >= 2 && label.length <= SUBSEQUENCE_MAX_TARGET) {
    const span = subsequenceSpan(token, label);
    if (span > 0 && span <= token.length * 3) return 15 - Math.min(10, span - token.length);
  }
  return 0;
}

/**
 * How well `query` matches an item: 0 for no match, higher is better. Every
 * word of the query must match the label (best) or the extra text (keywords,
 * takeaway). Scattered-letter matches only count on short labels.
 */
export function matchScore(query: string, label: string, extra = ''): number {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;
  const l = fold(label);
  const e = fold(extra);
  let total = 0;
  for (const token of tokens) {
    const s = tokenScore(token, l, e);
    if (s === 0) return 0;
    total += s;
  }
  return total;
}
