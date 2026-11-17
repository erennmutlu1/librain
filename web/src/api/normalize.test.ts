import { describe, expect, it } from 'vitest';
import { discoverScenarios, compareScenarios } from '../mocks/scenarios';
import { ApiError } from './errors';
import {
  normalizeClaimValidation,
  normalizeDiscoverResponse,
  normalizeNaiveRag,
  normalizePapers,
  normalizeQueryResponse,
  normalizeSingleLlm,
  parseClaimStatus,
} from './normalize';

describe('parseClaimStatus', () => {
  it('maps the numeric enum the API actually sends', () => {
    expect(parseClaimStatus(0)).toBe('grounded');
    expect(parseClaimStatus(1)).toBe('extrapolated');
    expect(parseClaimStatus(2)).toBe('risky');
  });

  it('accepts string forms in any case', () => {
    expect(parseClaimStatus('Grounded')).toBe('grounded');
    expect(parseClaimStatus('RISKY')).toBe('risky');
    expect(parseClaimStatus(' extrapolated ')).toBe('extrapolated');
    expect(parseClaimStatus('2')).toBe('risky');
  });

  it('defaults unknown values to extrapolated, like the backend parser', () => {
    expect(parseClaimStatus(7)).toBe('extrapolated');
    expect(parseClaimStatus('maybe')).toBe('extrapolated');
    expect(parseClaimStatus(null)).toBe('extrapolated');
    expect(parseClaimStatus(undefined)).toBe('extrapolated');
  });
});

describe('normalizeClaimValidation', () => {
  it('keeps validationFailed when present and leaves it undefined when absent', () => {
    expect(normalizeClaimValidation({ claims: [], aggregateRisk: 1, validationFailed: true })).toEqual({
      claims: [],
      aggregateRisk: 1,
      validationFailed: true,
    });
    expect(normalizeClaimValidation({ claims: [], aggregateRisk: 0.2 })?.validationFailed).toBeUndefined();
  });

  it('clamps probabilities and tolerates missing fields', () => {
    const r = normalizeClaimValidation({
      claims: [{ sentence: 'S', status: 'Risky', factualHallucinationProbability: 1.7 }, 'junk'],
      aggregateRisk: -3,
    });
    expect(r).toEqual({
      claims: [{ sentence: 'S', status: 'risky', supportingChunks: [], factualHallucinationProbability: 1, rationale: '' }],
      aggregateRisk: 0,
    });
  });

  it('returns null for a missing block', () => {
    expect(normalizeClaimValidation(undefined)).toBeNull();
  });
});

describe('normalizeDiscoverResponse', () => {
  it('reads every recorded discovery fixture', () => {
    for (const s of discoverScenarios) {
      const r = normalizeDiscoverResponse(s.response);
      expect(r.correlationId, s.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(r.hypothesis.length, s.id).toBeGreaterThan(0);
      expect(r.evaluation, s.id).not.toBeNull();
    }
  });

  it('maps the numeric statuses in a real run (baseline pair-10 has a RISKY sentence)', () => {
    const r = normalizeDiscoverResponse(discoverScenarios.find((s) => s.id === 'anthropic-pair-10')!.response);
    expect(r.claimValidation?.claims.map((c) => c.status)).toEqual(['extrapolated', 'risky']);
  });

  it('leaves claimed/dropped counts undefined for runs that predate them', () => {
    const old = normalizeDiscoverResponse(discoverScenarios.find((s) => s.id === 'anthropic-pair-10')!.response);
    expect(old.claimedEvidenceCount).toBeUndefined();
    expect(old.droppedEvidenceCount).toBeUndefined();
    const newer = normalizeDiscoverResponse(discoverScenarios.find((s) => s.id === 'openai-pair-03')!.response);
    expect(newer.claimedEvidenceCount).toBe(4);
    expect(newer.droppedEvidenceCount).toBe(1);
  });

  it('degrades gracefully on a sparse payload', () => {
    const r = normalizeDiscoverResponse({ hypothesis: 'H' });
    expect(r).toMatchObject({
      hypothesis: 'H',
      novelClaim: '',
      supportingEvidence: [],
      extrapolationBasis: [],
      claimValidation: null,
      evaluation: null,
    });
  });

  it('rejects a non-object', () => {
    expect(() => normalizeDiscoverResponse('oops')).toThrow(ApiError);
  });
});

describe('normalizeQueryResponse', () => {
  it('keeps optional citation content only when non-empty', () => {
    const r = normalizeQueryResponse({
      correlationId: 'c',
      hypothesis: 'h [1]',
      citations: [
        { index: 1, paperId: 'p', chunkIndex: 0, section: null, pageNumber: 1, content: 'passage' },
        { index: 2, paperId: 'p', chunkIndex: 1, section: 'S', pageNumber: null, content: '' },
        { paperId: 'no-index' },
      ],
      synthesisConfidence: null,
    });
    expect(r.citations).toEqual([
      { index: 1, paperId: 'p', chunkIndex: 0, section: null, pageNumber: 1, content: 'passage' },
      { index: 2, paperId: 'p', chunkIndex: 1, section: 'S', pageNumber: null },
    ]);
    expect(r.evaluation).toBeNull();
    expect(r.synthesisConfidence).toBeNull();
  });
});

describe('baseline normalisers', () => {
  it('maps free-text chunkIndex -1 to null and missing isResolved to resolved', () => {
    const r = normalizeNaiveRag({
      correlationId: 'c',
      hypothesis: 'h',
      claimedCitations: [
        { paperId: 'graphcast', chunkIndex: -1, isResolved: true },
        { paperId: 'aurora', chunkIndex: 3 },
      ],
    });
    expect(r.claimedCitations).toEqual([
      { paperId: 'graphcast', chunkIndex: null, isResolved: true },
      { paperId: 'aurora', chunkIndex: 3, isResolved: true },
    ]);
    expect(r.fabricatedCitationCount).toBe(0);
    expect(r.evaluation).toBeNull();
    expect(r.totalElapsedMs).toBeUndefined();
  });

  it('reads the recorded baseline fixtures with their run stats', () => {
    const s = compareScenarios.find((x) => x.id === 'pair-10')!;
    const naive = normalizeNaiveRag(s.naiveRag);
    expect(naive.retrievedChunkCount).toBe(10);
    expect(naive.inputTokens).toBe(10804);
    const single = normalizeSingleLlm(s.singleLlm);
    expect(single.evaluation?.qualityScore).toBeCloseTo(0.527, 3);
    expect(single.totalElapsedMs).toBe(7752);
  });
});

describe('normalizePapers', () => {
  it('drops malformed rows and keeps nullable fields as null', () => {
    expect(normalizePapers([{ paperId: 'a', chunkCount: 3 }, { title: 'no id' }])).toEqual([
      { paperId: 'a', title: null, chunkCount: 3, firstIngestedAt: null },
    ]);
  });

  it('rejects a non-array', () => {
    expect(() => normalizePapers({})).toThrow(ApiError);
  });
});
