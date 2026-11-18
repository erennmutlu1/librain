import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePublicDemo } from '../api/config';
import { ApiError, NO_RECORDING, PROVIDER_KEYS_REQUIRED, READ_ONLY_DEPLOYMENT, describeError, errorFromBody } from '../api/errors';
import { createHttpApi } from '../api/httpClient';
import { createMockApi } from '../api/mockClient';
import {
  ANTHROPIC_KEY_HEADER,
  OPENAI_KEY_HEADER,
  clearProviderKeys,
  getProviderKeys,
  hasBothProviderKeys,
  providerKeyHeaders,
  rememberingProviderKeys,
  setProviderKeys,
} from '../api/providerKeys';
import type { DiscoverRequest, LibrainApi } from '../api/types';
import { RECORDED_IDEA_COUNT } from '../explore/ideaCount';
import { exploreRecordings, publicRecordings } from '../mocks/publicScenarios';
import { contract } from '../mocks/scenarios';
import { PUBLIC_HISTORY_KEY, PUBLIC_HISTORY_LIMIT, createPublicHistory, withBrowserHistory } from './browserHistory';
import { createLiveClient, needsProviderKeys } from './clients';

const STORAGE_KEY = 'librain.providerKeys.v1';
const KEYS = { anthropic: 'sk-ant-test-123', openai: 'sk-test-456' };

afterEach(() => {
  clearProviderKeys();
  window.sessionStorage.clear();
});

describe('VITE_PUBLIC_DEMO', () => {
  it('is on only for exactly "true" (main.tsx tests the same literal)', () => {
    expect(resolvePublicDemo('true')).toBe(true);
    for (const off of [undefined, '', 'false', '0', 'TRUE', ' true', 'yes']) expect(resolvePublicDemo(off)).toBe(false);
  });

  it('is read from import.meta.env, and unset in tests (the owner build)', async () => {
    expect((await import('../api/config')).PUBLIC_DEMO).toBe(false);
    vi.stubEnv('VITE_PUBLIC_DEMO', 'true');
    vi.resetModules();
    try {
      expect((await import('../api/config')).PUBLIC_DEMO).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe('provider keys', () => {
  it('are kept in sessionStorage by default, never in localStorage', () => {
    expect(setProviderKeys(KEYS, false)).toBe(true);
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)!)).toEqual(KEYS);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getProviderKeys()).toEqual(KEYS);
    expect(rememberingProviderKeys()).toBe(false);
  });

  it('move to localStorage only with "remember", and back out of it when unticked', () => {
    setProviderKeys(KEYS, true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(KEYS);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(rememberingProviderKeys()).toBe(true);

    setProviderKeys(KEYS, false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('trims, and clearing removes them from both storages', () => {
    setProviderKeys({ anthropic: `  ${KEYS.anthropic}\n`, openai: ` ${KEYS.openai} ` }, true);
    expect(getProviderKeys()).toEqual(KEYS);
    clearProviderKeys();
    expect(getProviderKeys()).toEqual({ anthropic: null, openai: null });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('fall back to memory for the tab when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    try {
      expect(setProviderKeys(KEYS, false)).toBe(false);
      expect(getProviderKeys()).toEqual(KEYS);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('become the two headers, and only both together count as complete', () => {
    expect(providerKeyHeaders(KEYS)).toEqual({ [ANTHROPIC_KEY_HEADER]: KEYS.anthropic, [OPENAI_KEY_HEADER]: KEYS.openai });
    expect(providerKeyHeaders({ anthropic: null, openai: null })).toEqual({});
    expect(hasBothProviderKeys({ anthropic: KEYS.anthropic, openai: null })).toBe(false);
    expect(hasBothProviderKeys(KEYS)).toBe(true);
  });
});

describe('the live client (public build)', () => {
  const BASE = 'https://api.librain.test';

  it('sends the keys to the model endpoints on the API base URL only, never to /health or GET /api/papers', async () => {
    setProviderKeys(KEYS, false);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/health')
        ? new Response('{"status":"ok"}', { status: 200 })
        : String(input).endsWith('/api/papers')
          ? new Response(JSON.stringify(contract.papers), { status: 200 })
          : new Response(JSON.stringify(contract.compare), { status: 200 }),
    );
    const live = createLiveClient(createPublicHistory(), { baseUrl: BASE, fetchImpl });
    await live.health();
    await live.listPapers();
    await live.compare({ topicA: 'a', topicB: 'b', topK: 5 });

    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url]) => url)).toEqual([`${BASE}/health`, `${BASE}/api/papers`, `${BASE}/api/compare`]);
    const headers = calls.map(([, init]) => init.headers as Record<string, string>);
    expect(headers[0]).not.toHaveProperty(ANTHROPIC_KEY_HEADER);
    expect(headers[1]).not.toHaveProperty(OPENAI_KEY_HEADER);
    expect(headers[2]).toMatchObject({ [ANTHROPIC_KEY_HEADER]: KEYS.anthropic, [OPENAI_KEY_HEADER]: KEYS.openai });
    // No X-Api-Key on the public site, and never a key in a URL.
    for (const h of headers) expect(h).not.toHaveProperty('X-Api-Key');
    for (const [url] of calls) expect(url).not.toContain(KEYS.anthropic);
  });

  it('knows which paths call a model', () => {
    for (const p of ['/api/query', '/api/query/stream', '/api/discover/stream', '/api/compare', '/api/naive-rag', '/api/single-llm']) {
      expect(needsProviderKeys(p)).toBe(true);
    }
    for (const p of ['/health', '/api/papers', '/api/papers/ingest', '/api/runs', '/api/fabrication-probe', '/api/discoverx']) {
      expect(needsProviderKeys(p)).toBe(false);
    }
  });

  it('sends the keys with an upload too, if one is ever made (the public API refuses it)', async () => {
    setProviderKeys(KEYS, false);
    const set: Record<string, string> = {};
    const xhr = {
      upload: {},
      open: vi.fn(),
      setRequestHeader: (name: string, value: string) => (set[name] = value),
      send() {
        Object.assign(this, { status: 403, responseText: JSON.stringify({ title: READ_ONLY_DEPLOYMENT }) });
        (this as unknown as { onload: () => void }).onload();
      },
      getResponseHeader: () => null,
    };
    const api = createHttpApi({ createXhr: () => xhr as unknown as XMLHttpRequest, apiKey: () => null, requestHeaders: () => providerKeyHeaders() });
    await expect(api.ingestPaper(new File(['%PDF'], 'x.pdf'))).rejects.toMatchObject({ status: 403, title: READ_ONLY_DEPLOYMENT });
    expect(set[ANTHROPIC_KEY_HEADER]).toBe(KEYS.anthropic);
  });
});

describe('describeError for the public contract', () => {
  const pub = { publicDemo: true };

  it('turns "provider keys required" into a request for the visitor’s keys', () => {
    const d = describeError(errorFromBody(401, 'Unauthorized', { title: PROVIDER_KEYS_REQUIRED, status: 401 }));
    expect(d).toMatchObject({ title: 'Live mode needs your own API keys.', action: { kind: 'provider-keys' } });
  });

  it('explains the read-only deployment and offers no retry', () => {
    const d = describeError(errorFromBody(403, 'Forbidden', { title: READ_ONLY_DEPLOYMENT, status: 403 }), Date.now(), pub);
    expect(d).toMatchObject({ title: 'This public deployment is read-only.', retryable: false });
  });

  it('names the provider that rejected the key, with its own explanation', () => {
    const anthropic = errorFromBody(502, 'Bad Gateway', {
      title: 'Upstream API error',
      detail: 'Anthropic returned 401: invalid x-api-key',
      correlationId: 'c-1',
    });
    expect(describeError(anthropic, Date.now(), pub)).toMatchObject({
      title: 'Anthropic rejected your key: Anthropic returned 401: invalid x-api-key',
      correlationId: 'c-1',
      action: { kind: 'provider-keys' },
    });

    // The API's own wording, with the provider named (LIBRAIN/Endpoints/UpstreamErrors.cs).
    const openai = errorFromBody(402, 'Payment Required', {
      title: 'OpenAI account has no credit',
      detail: 'Your OpenAI account has no credit left for this request. Add credit or use another key.',
      provider: 'openai',
    });
    expect(describeError(openai, Date.now(), pub)).toMatchObject({ title: 'OpenAI account has no credit', action: { kind: 'provider-keys' } });
    expect(describeError(openai, Date.now(), pub).detail).toContain('platform.openai.com');

    const limited = errorFromBody(429, 'Too Many Requests', {
      title: 'Anthropic rate limit reached',
      detail: 'Your Anthropic account hit its rate limit. Wait a minute and try again.',
      provider: 'anthropic',
    });
    const d = describeError(limited, Date.now(), pub);
    expect(d.title).toBe('Anthropic rate limit reached');
    expect(d.action).toBeUndefined();                       // not a key problem

    // A provider's own 401 is not masked by the generic "needs keys" message.
    const passthrough = errorFromBody(401, 'Unauthorized', { title: 'Unauthorized', detail: 'Anthropic: invalid x-api-key' });
    expect(describeError(passthrough, Date.now(), pub).title).toBe('Anthropic rejected your key: Anthropic: invalid x-api-key');
  });

  it('leaves the owner build’s wording alone', () => {
    const anthropic = errorFromBody(502, 'Bad Gateway', { title: 'Upstream API error', detail: 'Anthropic returned 401: invalid x-api-key' });
    expect(describeError(anthropic).title).toBe('An upstream model call failed.');
    expect(describeError(errorFromBody(401, 'Unauthorized', { title: 'API key required' })).action).toEqual({ kind: 'api-key' });
  });

  it('presents "no recorded run" as information with Live as the way on', () => {
    const d = describeError(new ApiError({ kind: 'http', status: 404, title: NO_RECORDING }), Date.now(), pub);
    expect(d).toMatchObject({ tone: 'info', retryable: false, action: { kind: 'go-live' } });
  });
});

describe('Recorded mode on the public site (strict recordings)', () => {
  const api = () => createMockApi({ latency: 0, recordings: publicRecordings });
  const f4 = exploreRecordings.find((r) => r.id === 'explore-F4')!;

  it('offers every committed run and the real Anthropic pairs, and no API snapshot or OpenAI run', () => {
    expect(exploreRecordings).toHaveLength(RECORDED_IDEA_COUNT);
    const catalog = api().mock!;
    const baseline = catalog.discover.filter((s) => s.id.startsWith('anthropic-pair-'));
    expect(baseline).toHaveLength(4);
    expect(catalog.discover).toHaveLength(exploreRecordings.length + baseline.length);
    expect(catalog.discover.map((s) => s.id)).not.toContainEqual(expect.stringMatching(/^(contract-|openai-)/));
    expect(catalog.compare.map((s) => s.id)).toEqual(['pair-10', 'pair-01']);
    // The five real questions from experiments/ask-examples, never the API contract snapshot.
    expect(catalog.ask.map((s) => s.id)).toEqual(['ask-1', 'ask-2', 'ask-3', 'ask-4', 'ask-5']);
    expect(catalog.ask[0]?.source).toBe('experiments/ask-examples/ask-1.json');
    expect(f4.label).toBe('F4 · corner kick tactic generation and player positioning × learned physics simulators with graph networks');
    expect(f4.source).toBe('experiments/new-areas-discoveries/runs/F4.json');
    expect(exploreRecordings[0]?.source).toBe('experiments/featured-discoveries/runs/A1.json');
    // Batch 3 follows batches 1 and 2, and batch 4 comes last, each in id order.
    const batch4 = exploreRecordings.filter((r) => r.source.startsWith('experiments/new-domains-discoveries/'));
    expect(batch4.length).toBeGreaterThan(0);
    expect(exploreRecordings.slice(-batch4.length)).toEqual(batch4);
    const batch4Ids = batch4.map((r) => r.id);
    expect(batch4Ids).toEqual([...batch4Ids].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
    expect(exploreRecordings.slice(-batch4.length - 24, -batch4.length).map((r) => r.id)).toEqual(
      [...Array.from({ length: 23 }, (_, i) => i + 1), 25].map((n) => `explore-X${String(n).padStart(2, '0')}`),
    );
    expect(exploreRecordings.find((r) => r.id === 'explore-X17')?.source).toBe('experiments/cross-field-discoveries/runs/X17.json');
    expect(exploreRecordings.find((r) => r.id === 'explore-E5')?.source).toBe('experiments/new-domains-discoveries/runs/E5.json');
  });

  it('serves a recording only for its own topics, either order, any case', async () => {
    const swapped: DiscoverRequest = { topicA: f4.request.topicB!.toUpperCase(), topicB: f4.request.topicA, topK: 5, provider: 'anthropic' };
    const result = await api().discoverStream(swapped, () => undefined);
    expect(result.correlationId).toBe((f4.response as { correlationId: string }).correlationId);
    expect(api().mock!.matchDiscover(swapped)).toMatchObject({ matched: true, source: f4.source });
  });

  it('never substitutes another recording: unknown topics, the snapshot topics and another topK all fail with NO_RECORDING', async () => {
    const client = api();
    const misses: DiscoverRequest[] = [
      { topicA: 'quantum gravity', topicB: 'sourdough baking', topK: 5, provider: 'anthropic' },
      { topicA: 'weather forecasting', topicB: 'protein folding', topK: 2, provider: 'anthropic' },
      { ...f4.request, topK: 3 },
    ];
    for (const request of misses) {
      await expect(client.discoverStream(request, () => undefined)).rejects.toMatchObject({ title: NO_RECORDING, status: 404 });
      await expect(client.discover(request)).rejects.toMatchObject({ title: NO_RECORDING });
      expect(client.mock!.matchDiscover(request)).toEqual({ matched: false, label: '', source: '' });
    }
    await expect(client.compare({ topicA: 'weather forecasting', topicB: 'protein folding', topK: 2 })).rejects.toMatchObject({ title: NO_RECORDING });
    await expect(client.queryStream({ query: 'Why does GraphCast forecast well?', topK: 2 }, () => undefined)).rejects.toMatchObject({
      title: NO_RECORDING,
    });
  });

  it('serves the two real Compare pairs', async () => {
    const r = await api().compare({ topicA: 'climate adaptation', topicB: 'drug discovery', topK: 5 });
    expect(r.correlationId).toBe('assembled-pair-10');
  });

  it('still validates like the API before matching', async () => {
    await expect(api().discoverStream({ topicA: 'same', topicB: 'same' }, () => undefined)).rejects.toMatchObject({ status: 400 });
  });

  it('lists only papers the recordings cite, with nothing invented', async () => {
    const papers = await api().listPapers();
    expect(papers.length).toBeGreaterThan(0);
    // The API snapshot's papers list (2005.11401 with its arXiv title) is not merged in.
    expect(papers.every((p) => p.title === null && p.authors === null && p.firstIngestedAt === null)).toBe(true);
  });
});

describe('History in the browser (public build)', () => {
  function liveDiscover(fetchImpl = vi.fn(async () => new Response(JSON.stringify(contract.discover), { status: 200 }))) {
    return fetchImpl;
  }

  it('saves each successful live run and reads it back with the /api/runs shapes; /api/runs is never called', async () => {
    const fetchImpl = liveDiscover();
    const history = createPublicHistory();
    const live = createLiveClient(history, { baseUrl: 'https://api.librain.test', fetchImpl });
    const result = await live.discover({ topicA: 'weather forecasting', topicB: 'protein folding', topK: 2, provider: 'anthropic' });

    const list = await live.listRuns();
    expect(list).toEqual([
      expect.objectContaining({ id: result.correlationId, kind: 'discover', title: 'weather forecasting × protein folding' }),
    ]);
    const run = await live.getRun(result.correlationId);
    expect(run.kind === 'discover' && run.response.claimValidation?.claims.length).toBeGreaterThan(0);
    expect(JSON.parse(window.localStorage.getItem(PUBLIC_HISTORY_KEY)!)).toHaveLength(1);

    await live.deleteRun(result.correlationId);
    expect(await live.listRuns()).toEqual([]);
    await expect(live.getRun(result.correlationId)).rejects.toMatchObject({ status: 404 });
    expect((fetchImpl.mock.calls as unknown as [string][]).map(([url]) => url)).toEqual(['https://api.librain.test/api/discover']);
  });

  it(`keeps the newest ${PUBLIC_HISTORY_LIMIT}`, async () => {
    const history = createPublicHistory();
    let n = 0;
    const fake = {
      compare: async () => ({ ...(contract.compare as object), correlationId: `run-${++n}` }),
    } as unknown as LibrainApi;
    const api = withBrowserHistory(fake, history, { record: true });
    vi.useFakeTimers();
    try {
      for (let i = 0; i < PUBLIC_HISTORY_LIMIT + 5; i++) {
        vi.setSystemTime(new Date(Date.UTC(2026, 10, 18, 12, 0, i)));
        await api.compare({ topicA: 'a', topicB: 'b' });
        await Promise.resolve();
      }
    } finally {
      vi.useRealTimers();
    }
    const runs = await api.listRuns({ limit: 100 });
    expect(runs).toHaveLength(PUBLIC_HISTORY_LIMIT);
    expect(runs[0]?.id).toBe(`run-${PUBLIC_HISTORY_LIMIT + 5}`);
    expect(runs.at(-1)?.id).toBe('run-6');
  });

  it('keeps going without history when storage throws', async () => {
    const history = createPublicHistory({
      getStorage: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    const live = createLiveClient(history, { fetchImpl: liveDiscover() });
    await expect(live.discover({ topicA: 'weather forecasting', topicB: 'protein folding' })).resolves.toMatchObject({ hypothesis: expect.any(String) });
  });

  it('does not save recorded runs', async () => {
    const history = createPublicHistory();
    const recorded = withBrowserHistory(createMockApi({ latency: 0, recordings: publicRecordings }), history, { record: false });
    await recorded.compare({ topicA: 'drug discovery', topicB: 'climate adaptation', topK: 5 });
    expect(await recorded.listRuns()).toEqual([]);
    expect(await history.list()).toEqual([]);
  });
});
