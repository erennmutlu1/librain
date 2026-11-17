import { describe, expect, it, vi } from 'vitest';
import { ApiError, describeError } from './errors';
import { createHttpApi } from './httpClient';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('createHttpApi', () => {
  it('POSTs JSON to the discover endpoint and normalises the numeric status enum', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        correlationId: '00000000-0000-0000-0000-000000000001',
        hypothesis: 'H',
        supportingEvidence: [],
        novelClaim: 'N.',
        extrapolationBasis: [],
        claimValidation: { claims: [{ sentence: 'N.', status: 2, supportingChunks: [], factualHallucinationProbability: 0.8, rationale: 'r' }], aggregateRisk: 0.8 },
        reasoning: '',
        evaluation: { noveltyScore: 0.4, plausibilityScore: 0.5, structuralCoherenceScore: 0.6, qualityScore: 0.5 },
        claimedEvidenceCount: 3,
        droppedEvidenceCount: 1,
      }),
    );
    const api = createHttpApi({ baseUrl: 'http://api.test/', fetchImpl });
    const result = await api.discover({ topicA: 'a', topicB: 'b', topK: 5, provider: 'openai' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/discover');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ topicA: 'a', topicB: 'b', topK: 5, provider: 'openai' });
    expect(result.claimValidation?.claims[0]?.status).toBe('risky');
    expect(result.droppedEvidenceCount).toBe(1);
  });

  it('turns ProblemDetails into an ApiError with title, detail and correlation id', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(404, {
        title: 'No relevant sources found',
        detail: 'Vector search returned no chunks for this query.',
        status: 404,
        correlationId: 'abc',
      }),
    );
    const api = createHttpApi({ fetchImpl });
    const error = await api.query({ query: 'q' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 404, title: 'No relevant sources found', correlationId: 'abc' });
  });

  it('reports network failures in plain language', async () => {
    const api = createHttpApi({ fetchImpl: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) });
    const error = await api.listPapers().catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'network' });
    expect(describeError(error).title).toMatch(/can't reach the librain api/i);
  });

  it('maps an aborted request to kind "aborted"', async () => {
    const api = createHttpApi({
      fetchImpl: vi.fn(async () => Promise.reject(new DOMException('aborted', 'AbortError'))),
    });
    await expect(api.singleLlm({ topicA: 'a' })).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('accepts the { error } body shape used by the ingest endpoint', async () => {
    const api = createHttpApi({ fetchImpl: vi.fn(async () => jsonResponse(400, { error: 'file is required' })) });
    await expect(api.health()).rejects.toMatchObject({ status: 400, title: 'file is required' });
  });
});
