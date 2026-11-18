/*
 * The two clients the public build switches between, and the History they
 * share. See PublicApp.tsx for how the switch works.
 */
import { PROVIDER_KEYS_REQUIRED } from '../api/errors';
import { createHttpApi } from '../api/httpClient';
import { providerKeyHeaders, requestProviderKeys } from '../api/providerKeys';
import type { LibrainApi } from '../api/types';
import type { RunStore } from '../history/runStore';
import { createPublicHistory, createPublicRunStore, withBrowserHistory } from './browserHistory';
import { createWakeWatch, type WakeWatch } from './wakeWatch';

export interface PublicClients {
  /** The recorded-data client; a promise while its chunk (the 46 runs) loads. */
  recorded: LibrainApi | Promise<LibrainApi>;
  live: LibrainApi;
  runStore: RunStore;
  /** Whether a live request is waiting on the free host waking up; absent in tests that do not need it. */
  wake?: WakeWatch;
}

export interface PublicClientOptions {
  /** VITE_API_BASE_URL: the only origin that ever receives the visitor's keys. */
  baseUrl?: string;
  /** Tests inject a fake server. */
  fetchImpl?: typeof fetch;
  /** Multiplier for the recorded client's artificial delays; 0 in tests. */
  latency?: number;
  /** Storage for the browser history; tests inject one that throws. */
  getStorage?: () => Storage;
}

/**
 * The endpoints that call a model and so need the visitor's keys. GET
 * /api/papers and /health are open, and ingest, delete and /api/runs are
 * refused on the public API, so the keys never travel with those.
 */
const KEYED_PATHS = ['/api/query', '/api/discover', '/api/compare', '/api/naive-rag', '/api/single-llm'];

export function needsProviderKeys(path: string): boolean {
  return KEYED_PATHS.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}

export const LIVE_NEEDS_KEYS = 'Live mode runs on your own Anthropic and OpenAI keys. Add both to switch.';

export function createLiveClient(history: RunStore, options: PublicClientOptions = {}): LibrainApi {
  const http = createHttpApi({
    baseUrl: options.baseUrl ?? '',
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    // The owner's X-Api-Key has no place on the public site.
    apiKey: () => null,
    requestHeaders: (path) => (needsProviderKeys(path) ? providerKeyHeaders() : {}),
    onUnauthorized: (error) =>
      requestProviderKeys({ reason: error.title === PROVIDER_KEYS_REQUIRED ? 'Live mode needs both of your keys.' : (error.detail ?? error.title) }),
  });
  return withBrowserHistory(http, history, { record: true });
}

export async function loadRecordedClient(history: RunStore, latency?: number): Promise<LibrainApi> {
  const [{ createMockApi }, { publicRecordings }] = await Promise.all([import('../api/mockClient'), import('../mocks/publicScenarios')]);
  return withBrowserHistory(createMockApi({ recordings: publicRecordings, ...(latency === undefined ? {} : { latency }) }), history, {
    record: false,
  });
}

export function createPublicClients(options: PublicClientOptions = {}): PublicClients {
  const history = createPublicHistory(options.getStorage ? { getStorage: options.getStorage } : {});
  const wake = createWakeWatch(options.fetchImpl, { healthUrl: `${(options.baseUrl ?? '').replace(/\/+$/, '')}/health` });
  return {
    recorded: loadRecordedClient(history, options.latency),
    live: createLiveClient(history, { ...options, fetchImpl: wake.fetch }),
    runStore: createPublicRunStore(history),
    wake,
  };
}

/**
 * Stands in for the recorded client while its chunk loads, so the shell and
 * the first screen render at once instead of waiting for the recorded data.
 * Calls made meanwhile wait for it; the recorded-runs pickers appear when it
 * arrives (App re-renders with the real client).
 */
export function pendingClient(load: Promise<LibrainApi>): LibrainApi {
  return {
    mode: 'mock',
    health: async (signal) => (await load).health(signal),
    listPapers: async (signal) => (await load).listPapers(signal),
    ingestPaper: async (file, options) => (await load).ingestPaper(file, options),
    ingestArxiv: async (id, signal) => (await load).ingestArxiv(id, signal),
    deletePaper: async (id, signal) => (await load).deletePaper(id, signal),
    query: async (request, signal) => (await load).query(request, signal),
    queryStream: async (request, onProgress, signal) => (await load).queryStream(request, onProgress, signal),
    discover: async (request, signal) => (await load).discover(request, signal),
    discoverStream: async (request, onProgress, signal) => (await load).discoverStream(request, onProgress, signal),
    naiveRag: async (request, signal) => (await load).naiveRag(request, signal),
    singleLlm: async (request, signal) => (await load).singleLlm(request, signal),
    compare: async (request, signal) => (await load).compare(request, signal),
    listRuns: async (filter, signal) => (await load).listRuns(filter, signal),
    getRun: async (id, signal) => (await load).getRun(id, signal),
    deleteRun: async (id, signal) => (await load).deleteRun(id, signal),
  };
}
