import {
  normalizeDiscoverResponse,
  normalizeNaiveRag,
  normalizeQueryResponse,
  normalizeSingleLlm,
} from '../api/normalize';
import type { RunStore, RunStoreStatus } from './runStore';
import type { Outcome, RunRecord } from './types';

export const STORAGE_KEY = 'librain.runs.v1';
export const MAX_RUNS = 100;

export interface LocalRunStoreOptions {
  /** Returns the Storage to use. May throw (e.g. SecurityError when blocked). */
  getStorage?: () => Storage;
  key?: string;
  limit?: number;
}

function defaultStorage(): Storage {
  return window.localStorage;
}

function reviveOutcome<T>(raw: unknown, normalize: (value: unknown) => T): Outcome<T> {
  const r = raw as { ok?: unknown; value?: unknown; error?: unknown } | null;
  if (r && r.ok === true) {
    try {
      return { ok: true, value: normalize(r.value) };
    } catch {
      return { ok: false, error: 'Saved result could not be read.' };
    }
  }
  return { ok: false, error: typeof r?.error === 'string' ? r.error : 'No result was saved.' };
}

/**
 * Rebuilds a stored record through the same normalisers the API client uses,
 * so runs saved by an older version of this UI still render. Returns null for
 * anything unrecognisable rather than throwing.
 */
export function reviveRun(raw: unknown): RunRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.createdAt !== 'string') return null;
  const base = {
    id: r.id,
    createdAt: r.createdAt,
    mock: r.mock === true,
    label: typeof r.label === 'string' ? r.label : '',
    quality: typeof r.quality === 'number' ? r.quality : null,
  };
  try {
    switch (r.kind) {
      case 'ask':
        return { ...base, kind: 'ask', request: r.request as never, result: normalizeQueryResponse(r.result) };
      case 'discover':
        return { ...base, kind: 'discover', request: r.request as never, result: normalizeDiscoverResponse(r.result) };
      case 'compare': {
        const res = (r.result ?? {}) as Record<string, unknown>;
        return {
          ...base,
          kind: 'compare',
          request: r.request as never,
          result: {
            librain: reviveOutcome(res.librain, normalizeDiscoverResponse),
            naiveRag: reviveOutcome(res.naiveRag, normalizeNaiveRag),
            singleLlm: reviveOutcome(res.singleLlm, normalizeSingleLlm),
          },
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22)
  );
}

/**
 * Run history in localStorage. Every storage access is wrapped: if storage is
 * blocked, missing or full, the store keeps working in memory for this tab and
 * reports `persistent: false` so the UI can say so.
 */
export function createLocalRunStore(options: LocalRunStoreOptions = {}): RunStore {
  const getStorage = options.getStorage ?? defaultStorage;
  const key = options.key ?? STORAGE_KEY;
  const limit = options.limit ?? MAX_RUNS;

  let memory: RunRecord[] = [];
  let status: RunStoreStatus = { persistent: true };
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((l) => l());

  function storage(): Storage | null {
    try {
      return getStorage();
    } catch (error) {
      status = { persistent: false, problem: describe(error) };
      return null;
    }
  }

  function describe(error: unknown): string {
    if (isQuotaError(error)) return 'Browser storage is full.';
    return 'Browser storage is unavailable (private mode or blocked site data).';
  }

  function readAll(): RunRecord[] {
    const s = storage();
    if (!s) return memory;
    try {
      const raw = s.getItem(key);
      if (raw === null) {
        // Nothing stored yet: keep what this tab has in memory (it may be empty).
        return memory;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return memory;
      memory = parsed.map(reviveRun).filter((run): run is RunRecord => run !== null);
      return memory;
    } catch (error) {
      if (error instanceof SyntaxError) {
        // Corrupt entry: ignore it rather than lose the session.
        return memory;
      }
      status = { persistent: false, problem: describe(error) };
      return memory;
    }
  }

  function writeAll(runs: RunRecord[]): void {
    memory = runs;
    const s = storage();
    if (!s) return;
    let toWrite = runs;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        s.setItem(key, JSON.stringify(toWrite));
        memory = toWrite;
        status = { persistent: true };
        return;
      } catch (error) {
        if (isQuotaError(error) && toWrite.length > 1) {
          // Drop the oldest half and retry.
          toWrite = toWrite.slice(0, Math.ceil(toWrite.length / 2));
          continue;
        }
        status = { persistent: false, problem: describe(error) };
        return;
      }
    }
    status = { persistent: false, problem: 'Browser storage is full.' };
  }

  function sorted(runs: RunRecord[]): RunRecord[] {
    return [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  if (typeof window !== 'undefined') {
    try {
      window.addEventListener('storage', (event) => {
        if (event.key === key) notify();
      });
    } catch {
      // No cross-tab sync; single-tab behaviour is unaffected.
    }
  }

  return {
    async list() {
      return sorted(readAll());
    },
    async get(id) {
      return readAll().find((run) => run.id === id);
    },
    async save(run) {
      const runs = sorted([run, ...readAll().filter((r) => r.id !== run.id)]).slice(0, limit);
      writeAll(runs);
      notify();
    },
    async remove(id) {
      writeAll(readAll().filter((r) => r.id !== id));
      notify();
    },
    async clear() {
      memory = [];
      const s = storage();
      if (s) {
        try {
          s.removeItem(key);
        } catch (error) {
          status = { persistent: false, problem: describe(error) };
        }
      }
      notify();
    },
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
