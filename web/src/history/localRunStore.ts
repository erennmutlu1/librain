import { normalizeRunDetail } from '../api/normalize';
import type { RunStore, RunStoreStatus } from './runStore';
import { toListItem, type RunDetail } from './types';

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

/**
 * Rebuilds a stored record through the same normaliser as GET /api/runs/{id},
 * so runs saved by an older version of this UI still render. Returns null for
 * anything unrecognisable rather than throwing.
 */
export function reviveRun(raw: unknown): RunDetail | null {
  try {
    return normalizeRunDetail(raw);
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
 * Run history in localStorage, used in mock mode. Every storage access is
 * wrapped: if storage is blocked, missing or full, the store keeps working in
 * memory for this tab and reports `persistent: false` so the UI can say so.
 */
export function createLocalRunStore(options: LocalRunStoreOptions = {}): RunStore {
  const getStorage = options.getStorage ?? defaultStorage;
  const key = options.key ?? STORAGE_KEY;
  const limit = options.limit ?? MAX_RUNS;

  let memory: RunDetail[] = [];
  let status: RunStoreStatus = { persistent: true };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  function describe(error: unknown): string {
    if (isQuotaError(error)) return 'Browser storage is full.';
    return 'Browser storage is unavailable (private mode or blocked site data).';
  }

  function storage(): Storage | null {
    try {
      return getStorage();
    } catch (error) {
      status = { persistent: false, problem: describe(error) };
      return null;
    }
  }

  function readAll(): RunDetail[] {
    const s = storage();
    if (!s) return memory;
    try {
      const raw = s.getItem(key);
      if (raw === null) return memory;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return memory;
      memory = parsed.map(reviveRun).filter((run): run is RunDetail => run !== null);
      return memory;
    } catch (error) {
      if (error instanceof SyntaxError) return memory; // corrupt entry: keep the session going
      status = { persistent: false, problem: describe(error) };
      return memory;
    }
  }

  function writeAll(runs: RunDetail[]): void {
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
          toWrite = toWrite.slice(0, Math.ceil(toWrite.length / 2)); // drop the oldest half
          continue;
        }
        status = { persistent: false, problem: describe(error) };
        return;
      }
    }
    status = { persistent: false, problem: 'Browser storage is full.' };
  }

  const sorted = (runs: RunDetail[]) => [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
    location: 'browser',
    async list(filter = {}) {
      return sorted(readAll())
        .filter((r) => !filter.kind || r.kind === filter.kind)
        .map(toListItem);
    },
    async get(id) {
      return readAll().find((run) => run.id === id);
    },
    async save(run) {
      writeAll(sorted([run, ...readAll().filter((r) => r.id !== run.id)]).slice(0, limit));
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
