import { describe, expect, it } from 'vitest';
import { normalizeNaiveRag } from '../api/normalize';
import { compareScenarios } from '../mocks/scenarios';
import { auditClaimedCitations, chunkKey, parseChunkKey, parseCitationMarkers, parseFreeTextCitations } from './citations';

describe('auditClaimedCitations (fabricated-citation detection)', () => {
  it('flags citations the backend could not resolve as fabricated', () => {
    const audit = auditClaimedCitations(
      [
        { paperId: 'graphcast', chunkIndex: 8, isResolved: true },
        { paperId: 'made-up-2024', chunkIndex: 3, isResolved: false },
        { paperId: 'aurora', chunkIndex: 20, isResolved: true },
      ],
      1,
    );
    expect(audit.total).toBe(3);
    expect(audit.fabricated).toEqual([{ paperId: 'made-up-2024', chunkIndex: 3, isResolved: false }]);
    expect(audit.resolved).toHaveLength(2);
    expect(audit.fabricatedKeys).toEqual(['made-up-2024:3']);
    expect(audit.consistent).toBe(true);
  });

  it('counts repeated fabricated keys per citation but lists the key once', () => {
    const audit = auditClaimedCitations([
      { paperId: '2504.05496', chunkIndex: 9, isResolved: false },
      { paperId: '2504.05496', chunkIndex: 9, isResolved: false },
    ]);
    expect(audit.fabricated).toHaveLength(2);
    expect(audit.fabricatedKeys).toEqual(['2504.05496:9']);
  });

  it('flags a disagreement between the API count and the per-citation flags', () => {
    const audit = auditClaimedCitations([{ paperId: 'x', chunkIndex: 1, isResolved: false }], 0);
    expect(audit.consistent).toBe(false);
    expect(audit.reportedFabricated).toBe(0);
  });

  it('handles an empty list', () => {
    const audit = auditClaimedCitations([], null);
    expect(audit).toMatchObject({ total: 0, fabricated: [], consistent: true, reportedFabricated: null });
  });

  it('agrees with the recorded free-text Naive-RAG run (2 of 5 fabricated)', () => {
    const scenario = compareScenarios.find((s) => s.id === 'pair-01-free-text')!;
    const r = normalizeNaiveRag(scenario.naiveRag);
    const audit = auditClaimedCitations(r.claimedCitations, r.fabricatedCitationCount);
    expect(audit.total).toBe(5);
    expect(audit.fabricated).toHaveLength(2);
    expect(audit.consistent).toBe(true);
  });

  it('finds no fabrications in the recorded structured baseline runs', () => {
    for (const s of compareScenarios.filter((x) => x.request.citationMode === 'structured')) {
      const r = normalizeNaiveRag(s.naiveRag);
      expect(auditClaimedCitations(r.claimedCitations, r.fabricatedCitationCount).fabricated, s.id).toHaveLength(0);
    }
  });
});

describe('parseCitationMarkers', () => {
  it('splits text and [n] markers, expanding lists and ranges', () => {
    const parts = parseCitationMarkers('A [1]. B [2, 4]. C [5–7][9].');
    expect(parts.filter((p) => p.kind === 'cite').map((p) => (p.kind === 'cite' ? p.indices : []))).toEqual([
      [1],
      [2, 4],
      [5, 6, 7],
      [9],
    ]);
    expect(parts.map((p) => (p.kind === 'text' ? p.text : p.raw)).join('')).toBe('A [1]. B [2, 4]. C [5–7][9].');
  });

  it('leaves non-numeric brackets as text', () => {
    expect(parseCitationMarkers('see [graphcast:8] here')).toEqual([{ kind: 'text', text: 'see [graphcast:8] here' }]);
  });
});

describe('parseFreeTextCitations', () => {
  it('mirrors the backend parser', () => {
    expect(parseFreeTextCitations('X [2005.11401:4]. Y [graphcast, pangu-weather:2]. Z [3].')).toEqual([
      { paperId: '2005.11401', chunkIndex: 4 },
      { paperId: 'graphcast', chunkIndex: null },
      { paperId: 'pangu-weather', chunkIndex: 2 },
    ]);
  });
});

describe('chunk keys', () => {
  it('round-trips', () => {
    expect(chunkKey('07-centaur', 102)).toBe('07-centaur:102');
    expect(parseChunkKey('07-centaur:102')).toEqual({ paperId: '07-centaur', chunkIndex: 102 });
    expect(parseChunkKey('graphcast')).toEqual({ paperId: 'graphcast', chunkIndex: null });
  });
});
