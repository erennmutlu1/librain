import { describe, expect, it, vi } from 'vitest';
import { normalizeDiscoverResponse } from '../api/normalize';
import { discoverScenarios } from '../mocks/scenarios';
import { createLocalRunStore, reviveRun, STORAGE_KEY } from './localRunStore';
import { runToMarkdown, runsToJson } from './exporters';
import type { DiscoverRun, RunRecord } from './types';

function discoverRun(id: string, createdAt: string, scenarioId = 'anthropic-pair-10'): DiscoverRun {
  const s = discoverScenarios.find((x) => x.id === scenarioId)!;
  return {
    id,
    kind: 'discover',
    createdAt,
    mock: true,
    label: s.label,
    quality: 0.5,
    request: s.request,
    result: normalizeDiscoverResponse(s.response),
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

describe('createLocalRunStore', () => {
  it('saves, lists newest first, gets and removes runs', async () => {
    const storage = new MemoryStorage();
    const store = createLocalRunStore({ getStorage: () => storage });
    await store.save(discoverRun('a', '2026-11-01T10:00:00Z'));
    await store.save(discoverRun('b', '2026-11-02T10:00:00Z'));

    expect((await store.list()).map((r) => r.id)).toEqual(['b', 'a']);
    expect((await store.get('a'))?.kind).toBe('discover');
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toHaveLength(2);

    await store.remove('b');
    expect((await store.list()).map((r) => r.id)).toEqual(['a']);
    expect(store.status().persistent).toBe(true);
  });

  it('round-trips a run through storage with its claim statuses intact', async () => {
    const storage = new MemoryStorage();
    await createLocalRunStore({ getStorage: () => storage }).save(discoverRun('a', '2026-11-01T10:00:00Z'));
    const fresh = createLocalRunStore({ getStorage: () => storage });
    const run = (await fresh.get('a')) as DiscoverRun;
    expect(run.result.claimValidation?.claims.map((c) => c.status)).toEqual(['extrapolated', 'risky']);
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
    await expect(store.clear()).resolves.toBeUndefined();
  });

  it('drops the oldest half and retries when the quota is exceeded', async () => {
    const storage = new MemoryStorage();
    const realSet = storage.setItem.bind(storage);
    const setItem = vi.fn((key: string, value: string) => {
      if ((JSON.parse(value) as unknown[]).length > 2) throw new DOMException('full', 'QuotaExceededError');
      realSet(key, value);
    });
    storage.setItem = setItem;
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
    const store = createLocalRunStore({ getStorage: () => storage });
    await expect(store.list()).resolves.toEqual([]);
  });

  it('notifies subscribers on change', async () => {
    const store = createLocalRunStore({ getStorage: () => new MemoryStorage() });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    await store.save(discoverRun('a', '2026-11-01T10:00:00Z'));
    await store.clear();
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

  it('revives compare runs with a failed system', () => {
    const run = reviveRun({
      id: 'x',
      createdAt: '2026-11-01T10:00:00Z',
      kind: 'compare',
      label: 'a × b',
      request: { topicA: 'a', topicB: 'b' },
      result: { librain: { ok: false, error: 'Upstream API error' }, naiveRag: { ok: true, value: { hypothesis: 'h', claimedCitations: [] } } },
    });
    expect(run?.kind).toBe('compare');
    if (run?.kind !== 'compare') return;
    expect(run.result.librain).toEqual({ ok: false, error: 'Upstream API error' });
    expect(run.result.naiveRag.ok).toBe(true);
    expect(run.result.singleLlm).toEqual({ ok: false, error: 'No result was saved.' });
  });
});

describe('exporters', () => {
  const run: RunRecord = discoverRun('a', '2026-11-01T10:00:00Z');

  it('exports JSON that revives to the same run', () => {
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
});
