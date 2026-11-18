import { describe, expect, it, vi } from 'vitest';
import { contract } from '../mocks/scenarios';
import { ApiError, describeError, parseRetryAfter } from './errors';
import { createHttpApi, type HttpClientOptions } from './httpClient';
import type { ProgressEvent } from './types';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', ...headers },
  });
}

function sseResponse(text: string, chunkSize = 17): Response {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.subarray(i, i + chunkSize));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function client(fetchImpl: HttpClientOptions['fetchImpl'], extra: Partial<HttpClientOptions> = {}) {
  return createHttpApi({ fetchImpl, apiKey: () => null, onUnauthorized: () => undefined, ...extra });
}

function callOf(fetchImpl: ReturnType<typeof vi.fn>, n = 0): [string, RequestInit] {
  return fetchImpl.mock.calls[n] as unknown as [string, RequestInit];
}

describe('createHttpApi: requests', () => {
  it('POSTs JSON to /api/discover and maps the numeric status enum', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, contract.discover));
    const api = client(fetchImpl, { baseUrl: 'http://api.test/' });
    const result = await api.discover({ topicA: 'a', topicB: 'b', topK: 5, provider: 'openai', model: 'gpt-4o-mini' });

    const [url, init] = callOf(fetchImpl);
    expect(url).toBe('http://api.test/api/discover');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ topicA: 'a', topicB: 'b', topK: 5, provider: 'openai', model: 'gpt-4o-mini' });
    expect(result.claimValidation?.claims[0]?.status).toBe('extrapolated');
  });

  it('sends X-Api-Key when a key is set, and omits it otherwise', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, contract.papers));
    await client(fetchImpl, { apiKey: () => 'sekret' }).listPapers();
    await client(fetchImpl).listPapers();
    expect((callOf(fetchImpl, 0)[1].headers as Record<string, string>)['X-Api-Key']).toBe('sekret');
    expect((callOf(fetchImpl, 1)[1].headers as Record<string, string>)['X-Api-Key']).toBeUndefined();
  });

  it('calls /api/compare once and returns all three outcomes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, contract.compare));
    const r = await client(fetchImpl).compare({ topicA: 'weather forecasting', topicB: 'protein folding', topK: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(callOf(fetchImpl)[0]).toBe('/api/compare');
    expect(r.naiveRag.result?.fabricatedCitationCount).toBe(1);
  });

  it('ingests by arXiv id and deletes a paper (204, no body)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, contract.arxiv))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = client(fetchImpl);
    const r = await api.ingestArxiv('arXiv:2005.11401v2');
    expect(JSON.parse(callOf(fetchImpl, 0)[1].body as string)).toEqual({ arxivId: 'arXiv:2005.11401v2' });
    expect(r.title).toBe('Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks');
    await expect(api.deletePaper('2005.11401')).resolves.toBeUndefined();
    expect(callOf(fetchImpl, 1)).toEqual(['/api/papers/2005.11401', expect.objectContaining({ method: 'DELETE' })]);
  });

  it('builds the /api/runs query string', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, contract.runs));
    await client(fetchImpl).listRuns({ kind: 'compare', limit: 20 });
    expect(callOf(fetchImpl)[0]).toBe('/api/runs?kind=compare&limit=20');
  });
});

describe('createHttpApi: problems', () => {
  it('turns problem+json into an ApiError with title, detail and correlation id', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(502, { title: 'Upstream API error', detail: 'The discovery pipeline failed: HttpRequestException', status: 502, correlationId: 'abc' }),
    );
    const error = await client(fetchImpl).discover({ topicA: 'x' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'http', status: 502, correlationId: 'abc' });
    expect(describeError(error)).toMatchObject({ title: 'An upstream model call failed.', correlationId: 'abc' });
  });

  it('reads the captured 400 problem', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, contract.problem400));
    await expect(client(fetchImpl).discover({ topicA: '' })).rejects.toMatchObject({ status: 400, title: 'topicA is required' });
  });

  it('on 401 asks for an API key and explains it', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { title: 'API key required', detail: 'Send the configured key in the X-Api-Key header.', status: 401 }),
    );
    const error = await client(fetchImpl, { onUnauthorized }).listPapers().catch((e: unknown) => e);
    expect(onUnauthorized).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(describeError(error)).toMatchObject({ title: 'The API needs a key.', action: { kind: 'api-key' } });
  });

  it('on 429 reads Retry-After and says when to try again', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(429, { title: 'rate limit reached', detail: 'At most 20 paid requests per hour are allowed from one client.', status: 429 }, { 'Retry-After': '1500' }),
    );
    const error = await client(fetchImpl).compare({ topicA: 'x' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 1500 });
    const now = Date.UTC(2026, 10, 18, 9, 0, 0);
    const d = describeError(error, now);
    expect(d.title).toBe('Rate limit reached.');
    expect(d.detail).toContain('try again in about 25 min');
    expect(d.action).toEqual({ kind: 'retry-at', at: new Date(now + 1500 * 1000) });
  });

  it('describes a 429 without Retry-After (cross-origin responses hide it)', () => {
    const d = describeError(new ApiError({ kind: 'http', status: 429, title: 'rate limit reached' }));
    expect(d.detail).toContain('resets within the hour');
    expect(d.action).toBeUndefined();
  });

  it('parses both Retry-After forms', () => {
    expect(parseRetryAfter('120')).toBe(120);
    expect(parseRetryAfter('Wed, 18 Nov 2026 09:10:00 GMT', Date.UTC(2026, 10, 18, 9, 0, 0))).toBe(600);
    expect(parseRetryAfter('soon')).toBeUndefined();
  });

  it('reports network failures in plain language', async () => {
    const error = await client(vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))).listPapers().catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'network' });
    expect(describeError(error).title).toMatch(/can't reach the librain api/i);
  });

  it('maps an aborted request to kind "aborted"', async () => {
    const api = client(vi.fn(async () => Promise.reject(new DOMException('aborted', 'AbortError'))));
    await expect(api.singleLlm({ topicA: 'a' })).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('accepts the { error } body shape', async () => {
    const api = client(vi.fn(async () => jsonResponse(400, { error: 'file is required' })));
    await expect(api.health()).rejects.toMatchObject({ status: 400, title: 'file is required' });
  });
});

describe('createHttpApi: streams', () => {
  it('reports each progress event and returns the result from the captured stream', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(contract.discoverStream, 7));
    const progress: ProgressEvent[] = [];
    const r = await client(fetchImpl).discoverStream({ topicA: 'weather forecasting', topicB: 'protein folding', topK: 2 }, (p) => progress.push(p));

    const [url, init] = callOf(fetchImpl);
    expect(url).toBe('/api/discover/stream');
    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream');
    expect(progress.map((p) => p.stage)).toEqual(['retrieving', 'retrieved', 'generating', 'validated', 'scoring']);
    expect(progress[1]?.count).toBe(3);
    expect(r.droppedEvidenceCount).toBe(1);
  });

  it('turns an error event into an ApiError carrying its correlation id', async () => {
    const text =
      'event: progress\ndata: {"stage":"retrieving","message":"Searching the corpus","count":null}\n\n' +
      'event: error\ndata: {"title":"Upstream API error","detail":"The query pipeline failed: HttpRequestException","correlationId":"err-42"}\n\n';
    const error = await client(vi.fn(async () => sseResponse(text))).queryStream({ query: 'q' }, () => undefined).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'stream', title: 'Upstream API error', correlationId: 'err-42' });
    expect(describeError(error)).toMatchObject({ title: 'An upstream model call failed.', correlationId: 'err-42' });
  });

  it('surfaces "No relevant sources found" from the stream as its own title', async () => {
    const text = 'event: error\ndata: {"title":"No relevant sources found","detail":"Vector search returned no chunks for this query.","correlationId":"x"}\n\n';
    await expect(client(vi.fn(async () => sseResponse(text))).queryStream({ query: 'q' }, () => undefined)).rejects.toMatchObject({
      title: 'No relevant sources found',
    });
  });

  it('fails clearly when the stream ends without a result', async () => {
    const text = 'event: progress\ndata: {"stage":"retrieving","message":"m","count":null}\n\n';
    await expect(client(vi.fn(async () => sseResponse(text))).discoverStream({ topicA: 'a' }, () => undefined)).rejects.toMatchObject({
      kind: 'stream',
      title: 'The stream ended without a result',
    });
  });

  it('validation errors arrive as a plain 400 before any stream', async () => {
    await expect(
      client(vi.fn(async () => jsonResponse(400, contract.problem400))).discoverStream({ topicA: '' }, () => undefined),
    ).rejects.toMatchObject({ status: 400, title: 'topicA is required' });
  });

  it('cancels mid-stream when aborted', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode('event: progress\ndata: {"stage":"retrieving","message":"m","count":null}\n\n'));
      },
    });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
    const run = client(fetchImpl).discoverStream({ topicA: 'a' }, () => controller.abort(), controller.signal);
    await expect(run).rejects.toMatchObject({ kind: 'aborted' });
  });
});
