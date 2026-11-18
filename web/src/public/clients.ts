/*
 * The two clients the public build switches between, and the History they
 * share. See PublicApp.tsx for how the switch works.
 */
import { ApiError, PROVIDER_KEYS_REQUIRED, errorFromBody } from '../api/errors';
import { createHttpApi } from '../api/httpClient';
import { providerKeyHeaders, requestProviderKeys, type ProviderKeys } from '../api/providerKeys';
import type { LibrainApi } from '../api/types';
import type { RunStore } from '../history/runStore';
import { pick } from '../i18n/lang';
import { createPublicHistory, createPublicRunStore, withBrowserHistory } from './browserHistory';
import { text } from './public.i18n';
import { createWakeWatch, type WakeWatch } from './wakeWatch';

export interface PublicClients {
  /** The recorded-data client; a promise while its chunk (the 46 runs) loads. */
  recorded: LibrainApi | Promise<LibrainApi>;
  live: LibrainApi;
  runStore: RunStore;
  /** Whether a live request is waiting on the free host waking up; absent in tests that do not need it. */
  wake?: WakeWatch;
  /** "Check my keys" in the keys panel; absent in tests that do not need it (the button is then hidden). */
  checkKeys?: CheckKeys;
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

export function createLiveClient(history: RunStore, options: PublicClientOptions = {}): LibrainApi {
  const http = createHttpApi({
    baseUrl: options.baseUrl ?? '',
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    // The owner's X-Api-Key has no place on the public site.
    apiKey: () => null,
    requestHeaders: (path) => (needsProviderKeys(path) ? providerKeyHeaders() : {}),
    onUnauthorized: (error) =>
      requestProviderKeys({ reason: error.title === PROVIDER_KEYS_REQUIRED ? pick(text).bothKeys : (error.detail ?? error.title) }),
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
    // Through the wake watch, so a check that waits on the sleeping host says so.
    checkKeys: (keys, signal) => checkProviderKeys(keys, { baseUrl: options.baseUrl ?? '', fetchImpl: wake.fetch, signal }),
  };
}

// ---------- "Check my keys" ----------

/** One provider's answer from POST /api/keys/check. */
export type KeyCheckStatus = 'valid' | 'invalid' | 'rate_limited' | 'unreachable' | 'not_provided';

export interface KeyCheck {
  status: KeyCheckStatus;
  detail: string | null;
}

export interface KeyCheckResult {
  anthropic: KeyCheck;
  openai: KeyCheck;
}

export type CheckKeys = (keys: ProviderKeys, signal?: AbortSignal) => Promise<KeyCheckResult>;

const KEY_CHECK_STATUSES: readonly KeyCheckStatus[] = ['valid', 'invalid', 'rate_limited', 'unreachable', 'not_provided'];

/** Never show a key back, even if a provider's message quotes it. */
function redact(detail: string, keys: ProviderKeys): string {
  let out = detail;
  for (const key of [keys.anthropic, keys.openai]) {
    if (key && key.length >= 8) out = out.split(key).join('[your key]');
  }
  return out;
}

function parseKeyCheck(body: unknown, keys: ProviderKeys): KeyCheckResult {
  const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const one = (raw: unknown): KeyCheck => {
    if (!record(raw) || !KEY_CHECK_STATUSES.includes(raw.status as KeyCheckStatus)) {
      throw new ApiError({ kind: 'parse', title: 'Unexpected response', detail: 'The key check answered in an unknown format.' });
    }
    const detail = typeof raw.detail === 'string' && raw.detail.trim() ? redact(raw.detail.trim(), keys) : null;
    return { status: raw.status as KeyCheckStatus, detail };
  };
  if (!record(body)) throw new ApiError({ kind: 'parse', title: 'Unexpected response', detail: 'The key check answered in an unknown format.' });
  return { anthropic: one(body.anthropic), openai: one(body.openai) };
}

/**
 * Asks the public API whether Anthropic and OpenAI accept the given keys:
 * POST /api/keys/check with whichever key headers are filled, no body. The
 * server lists each provider's models, which costs nothing and says nothing
 * about the credit balance. Keys travel only in those headers, to `baseUrl`.
 */
export async function checkProviderKeys(
  keys: ProviderKeys,
  options: { baseUrl?: string; fetchImpl?: typeof fetch; signal?: AbortSignal | undefined } = {},
): Promise<KeyCheckResult> {
  const keyHeaders = providerKeyHeaders(keys);
  if (Object.keys(keyHeaders).length === 0) {
    throw new ApiError({ kind: 'http', status: 400, title: 'no key', detail: pick(text).noKeyToCheck });
  }
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const url = `${(options.baseUrl ?? '').replace(/\/+$/, '')}/api/keys/check`;
  let response: Response;
  try {
    response = await doFetch(url, { method: 'POST', headers: { Accept: 'application/json', ...keyHeaders }, signal: options.signal });
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new ApiError({ kind: 'aborted', title: 'Request cancelled' });
    }
    throw new ApiError({ kind: 'network', title: 'Network error' });
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // An empty or non-JSON body: the status alone decides below.
  }
  if (!response.ok) throw errorFromBody(response.status, response.statusText, body, response.headers.get('Retry-After'));
  return parseKeyCheck(body, keys);
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
