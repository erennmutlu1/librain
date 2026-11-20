import { describe, expect, it, vi } from 'vitest';
import { normalizeDiscoverResponse, normalizeRunDetail } from '../api/normalize';
import type { DiscoverRun } from '../api/types';
import { contract, discoverScenarios } from '../mocks/scenarios';
import { runToMarkdown, runsToJson } from './exporters';
import { createLocalRunStore, reviveRun, STORAGE_KEY } from './localRunStore';

function discoverRun(id: string, createdAt: string, scenarioId = 'anthropic-pair-10'): DiscoverRun {
  const s = discoverScenarios.find((x) => x.id === scenarioId)!;
  return {
    id,
    kind: 'discover',
    title: s.label,
    createdAt,
    quality: 0.5,
    mock: true,
    request: s.request,
    response: normalizeDiscoverResponse(s.response),
  };
}

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe('createLocalRunStore (mock-mode history)', () => {
  it('saves, lists newest first as summaries, gets and removes runs', async () => {
    const storage = new MemoryStorage();
    const store = createLocalRunStore({ getStorage: () => storage });
    await store.save(discoverRun('a', '2026-11-01T10:00:00Z'));
    await store.save(discoverRun('b', '2026-11-02T10:00:00Z'));

    const list = await store.list();
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);
    expect(list[0]).toEqual({ id: 'b', kind: 'discover', title: 'Drug discovery × climate adaptation', createdAt: '2026-11-02T10:00:00Z', quality: 0.5, mock: true });
    expect((await store.get('a'))?.kind).toBe('discover');
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toHaveLength(2);

    await store.remove('b');
    expect((await store.list()).map((r) => r.id)).toEqual(['a']);
    expect(store.status().persistent).toBe(true);
    expect(store.location).toBe('browser');
  });

  it('filters by kind', async () => {
    const store = createLocalRunStore({ getStorage: () => new MemoryStorage() });
    await store.save(discoverRun('a', '2026-11-01T10:00:00Z'));
    await store.save(normalizeRunDetail({ ...(contract.runRecord as object), id: 'q', kind: 'query', request: { query: 'x' }, response: contract.query }));
    expect((await store.list({ kind: 'query' })).map((r) => r.id)).toEqual(['q']);
    expect((await store.list({ kind: 'discover' })).map((r) => r.id)).toEqual(['a']);
  });

  it('round-trips a run through storage with its claim statuses intact', async () => {
    const storage = new MemoryStorage();
    await createLocalRunStore({ getStorage: () => storage }).save(discoverRun('a', '2026-11-01T10:00:00Z'));
    const run = (await createLocalRunStore({ getStorage: () => storage }).get('a')) as DiscoverRun;
    expect(run.response.claimValidation?.claims.map((c) => c.status)).toEqual(['extrapolated', 'risky']);
  });

  it('keeps at most `limit` runs, dropping the oldest', async () => {
    const store = createLocalRunStore({ getStorage: () => new MemoryStorage(), limit: 2 });
    await store.save(discoverRun('a', '2026-11-01T10:00:00Z'));
    await store.save(discoverRun('b', '2026-11-02T10:00:00Z'));
    await store.save(discoverRun('c', '2026-11-03T10:00:00Z'));
    expect((await store.list()).map((r) => r.id)).toEqual(['c', 'b']);
  });

  it('keeps working in memory when accessing localStorage throws', async () => {
    const store = createLocalRunStore({
      getStorage: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    await store.save(discoverRun('a', '2026-11-01T10:00:00Z'));
    expect((await store.list()).map((r) => r.id)).toEqual(['a']);
    expect(store.status()).toMatchObject({ persistent: false });
    expect(store.status().problem).toMatch(/unavailable/i);
  });

  it('keeps working when getItem and setItem throw', async () => {
    const broken = new MemoryStorage();
    broken.getItem = () => {
      throw new Error('blocked');
    };
    broken.setItem = () => {
      throw new Error('blocked');
    };
    const store = createLocalRunStore({ getStorage: () => broken });
    await expect(store.save(discoverRun('a', '2026-11-01T10:00:00Z'))).resolves.toBeUndefined();
    expect((await store.list()).map((r) => r.id)).toEqual(['a']);
    expect(store.status().persistent).toBe(false);
    await expect(store.clear!()).resolves.toBeUndefined();
  });

  it('drops the oldest half and retries when the quota is exceeded', async () => {
    const storage = new MemoryStorage();
    const realSet = storage.setItem.bind(storage);
    storage.setItem = vi.fn((key: string, value: string) => {
      if ((JSON.parse(value) as unknown[]).length > 2) throw new DOMException('full', 'QuotaExceededError');
      realSet(key, value);
    });
    const store = createLocalRunStore({ getStorage: () => storage });
    await store.save(discoverRun('a', '2026-11-01T10:00:00Z'));
    await store.save(discoverRun('b', '2026-11-02T10:00:00Z'));
    await store.save(discoverRun('c', '2026-11-03T10:00:00Z'));
    expect((await store.list()).map((r) => r.id)).toEqual(['c', 'b']);
    expect(store.status().persistent).toBe(true);
  });

  it('ignores a corrupt stored value instead of crashing', async () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    await expect(createLocalRunStore({ getStorage: () => storage }).list()).resolves.toEqual([]);
  });

  it('notifies subscribers on change', async () => {
    const store = createLocalRunStore({ getStorage: () => new MemoryStorage() });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    await store.save(discoverRun('a', '2026-11-01T10:00:00Z'));
    await store.clear!();
    off();
    await store.save(discoverRun('b', '2026-11-01T10:00:00Z'));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('reviveRun', () => {
  it('rejects unrecognisable records', () => {
    expect(reviveRun(null)).toBeNull();
    expect(reviveRun({ id: 'x' })).toBeNull();
    expect(reviveRun({ id: 'x', createdAt: 'now', kind: 'mystery' })).toBeNull();
  });

  it('reads the first UI pass format (kind "ask", label/result, {ok,value} outcomes)', () => {
    const ask = reviveRun({ id: 'x', createdAt: '2026-11-01T10:00:00Z', kind: 'ask', label: 'Q?', quality: 0.7, request: { query: 'Q?' }, result: contract.query });
    expect(ask).toMatchObject({ kind: 'query', title: 'Q?' });

    const compare = reviveRun({
      id: 'y',
      createdAt: '2026-11-01T10:00:00Z',
      kind: 'compare',
      label: 'a × b',
      request: { topicA: 'a', topicB: 'b' },
      result: {
        librain: { ok: false, error: 'Upstream API error' },
        naiveRag: { ok: true, value: { correlationId: 'n', hypothesis: 'h', claimedCitations: [] } },
      },
    });
    expect(compare?.kind).toBe('compare');
    if (compare?.kind !== 'compare') return;
    expect(compare.response.librain).toEqual({ result: null, error: 'Upstream API error', correlationId: null });
    expect(compare.response.naiveRag.result?.hypothesis).toBe('h');
    expect(compare.response.singleLlm.error).toBe('No result was returned.');
  });
});

describe('exporters', () => {
  const run = discoverRun('a', '2026-11-01T10:00:00Z');

  it('exports JSON in the /api/runs record shape, which revives to the same run', () => {
    const parsed = JSON.parse(runsToJson([run])) as { format: string; runs: unknown[] };
    expect(parsed.format).toBe('librain-web-runs');
    expect(reviveRun(parsed.runs[0])).toEqual(run);
  });

  it('exports Markdown with the sentence verdicts', () => {
    const md = runToMarkdown(run);
    expect(md).toMatch(/^# Discover: Drug discovery × climate adaptation/);
    expect(md).toContain('| 2 | Risky | 75% |');
    expect(md).toContain('were not recorded for this run');
  });

  it('exports a compare run with a failed system and its request id', () => {
    const compare = normalizeRunDetail({
      id: 'c',
      kind: 'compare',
      title: 'weather forecasting × protein folding',
      createdAt: '2026-11-01T10:00:00Z',
      quality: null,
      request: {},
      // Derived from the real compare snapshot: only LIBRAIN's outcome is replaced with a failure.
      response: { ...(contract.compare as object), librain: { result: null, error: 'LIBRAIN failed: HttpRequestException', correlationId: 'lib-123' } },
    });
    const md = runToMarkdown(compare);
    expect(md).toContain('_Failed: LIBRAIN failed: HttpRequestException_ (request ID `lib-123`)');
    expect(md).toContain('**FABRICATED**');
  });
});
