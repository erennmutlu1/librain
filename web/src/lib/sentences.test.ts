import { describe, expect, it } from 'vitest';
import { normalizeDiscoverResponse } from '../api/normalize';
import { discoverScenarios } from '../mocks/scenarios';
import { annotate, buildSegments, matchSentences, normalizeText, segmentSentences } from './sentences';

const text = (t: string, span: { start: number; end: number } | undefined) => (span ? t.slice(span.start, span.end) : null);

describe('matchSentences', () => {
  it('matches verbatim sentences in order and includes trailing punctuation', () => {
    const claim = 'First idea holds. Second idea follows from it.';
    const [a, b] = matchSentences(claim, ['First idea holds.', 'Second idea follows from it.']);
    expect(text(claim, a?.span)).toBe('First idea holds.');
    expect(text(claim, b?.span)).toBe('Second idea follows from it.');
    expect(a?.method).toBe('exact');
  });

  it('ignores differences in quotes, dashes, whitespace and case', () => {
    const claim = 'Models like “GraphCast” — trained on ERA5 —  could   be "empirically grounded."';
    const [m] = matchSentences(claim, ['models like "GraphCast" - trained on ERA5 - could be “empirically grounded.”']);
    expect(m).not.toBeNull();
    expect(text(claim, m?.span)).toBe(claim);
  });

  it('ignores accents', () => {
    const claim = 'A naïve baseline underperforms.';
    expect(matchSentences(claim, ['A naive baseline underperforms.'])[0]).not.toBeNull();
  });

  it('locates clause fragments the validator split into separate sentences', () => {
    // Real case (discovery-openai pair-01): one novelClaim sentence, two validator "sentences".
    const claim =
      'This capability could lead to a paradigm shift in drug discovery processes, moving from traditional methods to AI-driven approaches that leverage LLMs for both prediction and synthesis.';
    const [a, b] = matchSentences(claim, [
      'This capability could lead to a paradigm shift in drug discovery processes.',
      'Moving from traditional methods to AI-driven approaches that leverage LLMs for both prediction and synthesis.',
    ]);
    expect(text(claim, a?.span)).toBe('This capability could lead to a paradigm shift in drug discovery processes,');
    expect(text(claim, b?.span)).toBe(
      'moving from traditional methods to AI-driven approaches that leverage LLMs for both prediction and synthesis.',
    );
  });

  it('assigns repeated sentences to distinct occurrences', () => {
    const claim = 'It may work. It may work.';
    const [a, b] = matchSentences(claim, ['It may work.', 'It may work.']);
    expect(a?.span.start).toBe(0);
    expect(b?.span.start).toBe(13);
  });

  it('falls back to fuzzy sentence matching for light rewording', () => {
    const claim = 'Agents could plan trials. The resulting pipeline would cut recruitment time substantially.';
    const [m] = matchSentences(claim, ['The resulting pipeline could substantially cut recruitment time.']);
    expect(m?.method).toBe('fuzzy');
    expect(text(claim, m?.span)).toBe('The resulting pipeline would cut recruitment time substantially.');
  });

  it('reports sentences that are not in the text', () => {
    const claim = 'Only this sentence exists.';
    expect(matchSentences(claim, ['Something entirely different about protein folding.'])).toEqual([null]);
  });

  it('never returns overlapping spans', () => {
    const claim = 'Alpha beta gamma. Delta epsilon.';
    const matches = matchSentences(claim, ['Alpha beta gamma.', 'beta gamma', 'Delta epsilon.']);
    expect(matches[1]).toBeNull();
    expect(text(claim, matches[2]?.span)).toBe('Delta epsilon.');
  });

  it('handles empty input', () => {
    expect(matchSentences('', ['x'])).toEqual([null]);
    expect(matchSentences('Some text.', [''])).toEqual([null]);
  });
});

describe('segmentSentences', () => {
  it('does not split on abbreviations or decimals', () => {
    const t = 'Scores rose to 0.5 in Fig. 2, e.g. for GNNs. A second sentence follows.';
    const spans = segmentSentences(t).map((s) => t.slice(s.start, s.end));
    expect(spans).toEqual(['Scores rose to 0.5 in Fig. 2, e.g. for GNNs.', 'A second sentence follows.']);
  });
});

describe('buildSegments', () => {
  it('covers the whole text, tagging matched spans', () => {
    const claim = 'One. Two. Three.';
    const segs = buildSegments(claim, matchSentences(claim, ['Three.', 'One.']));
    expect(segs.map((s) => s.text).join('')).toBe(claim);
    expect(segs.filter((s) => s.index !== null).map((s) => [s.text, s.index])).toEqual([
      ['One.', 1],
      ['Three.', 0],
    ]);
  });
});

describe('annotate', () => {
  it('links each verdict to the extrapolation-basis entry that overlaps it', () => {
    const claim = 'A is like B. Therefore C will follow.';
    const result = annotate(claim, ['Therefore C will follow.', 'A is like B.'], ['A is like B.', 'Therefore C will follow.']);
    expect(result.secondary).toEqual([1, 0]);
    expect(result.unmatched).toEqual([]);
  });

  it('places every validator sentence from the recorded fixtures', () => {
    for (const scenario of discoverScenarios) {
      const r = normalizeDiscoverResponse(scenario.response);
      const claims = r.claimValidation?.claims ?? [];
      const result = annotate(r.novelClaim, claims.map((c) => c.sentence));
      expect(result.unmatched, scenario.id).toEqual([]);
      expect(result.segments.map((s) => s.text).join(''), scenario.id).toBe(r.novelClaim);
    }
  });
});

describe('normalizeText', () => {
  it('folds typographic punctuation', () => {
    expect(normalizeText('  “Quoted” — it’s\n fine ')).toBe('"Quoted" - it\'s fine');
  });
});
