/*
 * History on the public site: the visitor's own live runs, in this browser
 * only. The public API keeps no run history for visitors (/api/runs answers
 * 403), so the live client is wrapped to save each successful Ask, Discover
 * and Compare result to localStorage, and every client's listRuns, getRun and
 * deleteRun read that store instead of the API. The records keep the
 * /api/runs shapes, so History, its detail page and the exporters work as is.
 */
import { ApiError } from '../api/errors';
import type { CompareRequest, DiscoverRequest, LibrainApi, QueryRequest, RunDetail, RunSummary } from '../api/types';
import { createLocalRunStore, type LocalRunStoreOptions } from '../history/localRunStore';
import type { RunStore } from '../history/runStore';
import { pick } from '../i18n/lang';
import { topicLabel } from '../lib/format';
import { text } from './public.i18n';

export const PUBLIC_HISTORY_KEY = 'librain.public.runs.v1';
export const PUBLIC_HISTORY_LIMIT = 50;

/**
 * Newest first, at most 50. If storage is blocked or full the store keeps the
 * runs in memory for this tab and History says so; runs never fail because
 * of it.
 */
export function createPublicHistory(options: Pick<LocalRunStoreOptions, 'getStorage'> = {}): RunStore {
  return createLocalRunStore({ ...options, key: PUBLIC_HISTORY_KEY, limit: PUBLIC_HISTORY_LIMIT });
}

/**
 * The RunStore the screens use in the public build. Saving happens in the
 * wrapped live client, so the screens' own save() calls (which also fire for
 * recorded runs) only refresh open lists.
 */
export function createPublicRunStore(history: RunStore): RunStore {
  return { ...history, save: async () => undefined };
}

const now = () => new Date().toISOString();

function summary(run: Omit<RunSummary, 'createdAt'>): RunSummary {
  return { ...run, createdAt: now() };
}

/**
 * Wraps a client so History reads `history`. With `record`, each successful
 * discover, query and compare is saved there first; recorded runs are not
 * saved, because they are always one click away in Recorded mode.
 */
export function withBrowserHistory(api: LibrainApi, history: RunStore, options: { record: boolean }): LibrainApi {
  const save = (run: RunDetail) => {
    if (!options.record) return;
    // History is a convenience: it must never turn a finished (and paid-for) run into an error.
    try {
      void history.save(run).catch(() => undefined);
    } catch {
      // keep going without history
    }
  };

  const discovered = (request: DiscoverRequest) => (response: Awaited<ReturnType<LibrainApi['discover']>>) => {
    save({
      ...summary({
        id: response.correlationId,
        kind: 'discover',
        title: topicLabel(request.topicA, request.topicB),
        quality: response.evaluation?.qualityScore ?? null,
      }),
      kind: 'discover',
      request,
      response,
    });
    return response;
  };

  const answered = (request: QueryRequest) => (response: Awaited<ReturnType<LibrainApi['query']>>) => {
    save({
      ...summary({ id: response.correlationId, kind: 'query', title: request.query, quality: response.evaluation?.qualityScore ?? null }),
      kind: 'query',
      request,
      response,
    });
    return response;
  };

  const compared = (request: CompareRequest) => (response: Awaited<ReturnType<LibrainApi['compare']>>) => {
    save({
      ...summary({
        id: response.correlationId,
        kind: 'compare',
        title: topicLabel(response.topicA || request.topicA, response.topicB ?? request.topicB),
        quality: response.librain.result?.evaluation?.qualityScore ?? null,
      }),
      kind: 'compare',
      request,
      response,
    });
    return response;
  };

  return {
    ...api,
    discover: (request, signal) => api.discover(request, signal).then(discovered(request)),
    discoverStream: (request, onProgress, signal) => api.discoverStream(request, onProgress, signal).then(discovered(request)),
    query: (request, signal) => api.query(request, signal).then(answered(request)),
    queryStream: (request, onProgress, signal) => api.queryStream(request, onProgress, signal).then(answered(request)),
    compare: (request, signal) => api.compare(request, signal).then(compared(request)),

    async listRuns(filter = {}) {
      const runs = await history.list(filter.kind ? { kind: filter.kind } : {});
      return runs.slice(0, filter.limit ?? PUBLIC_HISTORY_LIMIT);
    },
    async getRun(id) {
      const run = await history.get(id);
      if (!run) throw new ApiError({ kind: 'http', status: 404, title: 'run not found', detail: pick(text).noRun(id) });
      return run;
    },
    async deleteRun(id) {
      await history.remove(id);
    },
  };
}
