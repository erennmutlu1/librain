import { getApiKey, requestApiKey } from './apiKey';
import { ApiError, errorFromBody, errorFromStreamEvent } from './errors';
import {
  normalizeCompareResponse,
  normalizeDiscoverResponse,
  normalizeHealth,
  normalizeIngest,
  normalizeNaiveRag,
  normalizePapers,
  normalizeProgress,
  normalizeQueryResponse,
  normalizeRunDetail,
  normalizeRunSummaries,
  normalizeSingleLlm,
} from './normalize';
import { readSse } from './sse';
import type { IngestOptions, IngestResult, LibrainApi, ProgressListener } from './types';

export interface HttpClientOptions {
  /** API origin. Empty means same origin (the Vite proxy in dev). */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Factory for upload requests; injectable so tests never open sockets. */
  createXhr?: () => XMLHttpRequest;
  /** Supplies X-Api-Key; defaults to the key saved in Settings. */
  apiKey?: () => string | null;
  /** Called on 401; defaults to opening the API-key setting. */
  onUnauthorized?: (error: ApiError) => void;
  /**
   * Extra headers per request path, added after X-Api-Key. The public build
   * uses it for the visitor's provider keys, which only go to /api paths.
   */
  requestHeaders?: (path: string) => Record<string, string>;
}

const API_KEY_HEADER = 'X-Api-Key';

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** The live client. Every call goes to the LIBRAIN API; nothing is cached. */
export function createHttpApi(options: HttpClientOptions = {}): LibrainApi {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const createXhr = options.createXhr ?? (() => new XMLHttpRequest());
  const apiKey = options.apiKey ?? getApiKey;
  const onUnauthorized = options.onUnauthorized ?? ((e: ApiError) => requestApiKey(e.detail ?? e.title));
  const requestHeaders: (path: string) => Record<string, string> = options.requestHeaders ?? (() => ({}));

  function headers(path: string, extra: Record<string, string>): Record<string, string> {
    const key = apiKey();
    return { ...(key ? { ...extra, [API_KEY_HEADER]: key } : extra), ...requestHeaders(path) };
  }

  function fail(error: ApiError): never {
    if (error.status === 401) onUnauthorized(error);
    throw error;
  }

  async function send(
    path: string,
    init: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown; accept?: string; signal?: AbortSignal | undefined },
  ): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: headers(
          path,
          init.body === undefined
            ? { Accept: init.accept ?? 'application/json' }
            : { Accept: init.accept ?? 'application/json', 'Content-Type': 'application/json' },
        ),
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: init.signal,
      });
    } catch (error) {
      if (isAbort(error)) throw new ApiError({ kind: 'aborted', title: 'Request cancelled' });
      throw new ApiError({ kind: 'network', title: 'Network error', detail: error instanceof Error ? error.message : undefined });
    }
    if (!response.ok) {
      const body = await readBody(response).catch(() => null);
      fail(errorFromBody(response.status, response.statusText, body, response.headers.get('Retry-After')));
    }
    return response;
  }

  async function request<T>(
    path: string,
    init: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown; signal?: AbortSignal | undefined },
    normalize: (raw: unknown) => T,
  ): Promise<T> {
    const response = await send(path, init);
    let body: unknown;
    try {
      body = await readBody(response);
    } catch (error) {
      if (isAbort(error)) throw new ApiError({ kind: 'aborted', title: 'Request cancelled' });
      throw new ApiError({ kind: 'network', title: 'Network error', detail: 'The response was cut off.' });
    }
    return normalize(body);
  }

  async function noContent(path: string, signal?: AbortSignal): Promise<void> {
    await send(path, { method: 'DELETE', signal });
  }

  /**
   * POSTs to a /stream endpoint and reads `progress` events until exactly one
   * `result` or `error`. Validation failures arrive as an ordinary 400 problem
   * before any stream starts, and go through the same error path as above.
   */
  async function stream<T>(
    path: string,
    body: unknown,
    normalize: (raw: unknown) => T,
    onProgress: ProgressListener,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await send(path, { method: 'POST', body, accept: 'text/event-stream', signal });
    if (!response.body) throw new ApiError({ kind: 'parse', title: 'Unexpected response', detail: 'The stream had no body.' });

    let result: { value: T } | null = null;
    let failure: ApiError | null = null;
    try {
      await readSse(
        response.body,
        (message) => {
          let data: unknown;
          try {
            data = JSON.parse(message.data) as unknown;
          } catch {
            failure ??= new ApiError({ kind: 'parse', title: 'Unexpected response', detail: `Unreadable ${message.event} event.` });
            return;
          }
          if (message.event === 'progress') onProgress(normalizeProgress(data));
          else if (message.event === 'result' && !result && !failure) result = { value: normalize(data) };
          else if (message.event === 'error' && !result) failure = errorFromStreamEvent(data);
        },
        signal,
      );
    } catch (error) {
      if (isAbort(error) || signal?.aborted) throw new ApiError({ kind: 'aborted', title: 'Request cancelled' });
      if (error instanceof ApiError) throw error;
      throw new ApiError({ kind: 'network', title: 'Network error', detail: 'The progress stream was interrupted.' });
    }
    if (failure) throw failure;
    if (!result) throw new ApiError({ kind: 'stream', title: 'The stream ended without a result', detail: 'Try again; the run may still appear in History.' });
    return (result as { value: T }).value;
  }

  function upload(path: string, file: File, opts: IngestOptions): Promise<IngestResult> {
    return new Promise((resolve, reject) => {
      const xhr = createXhr();
      const form = new FormData();
      form.append('file', file, file.name);

      const onAbort = () => xhr.abort();
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      const cleanup = () => opts.signal?.removeEventListener('abort', onAbort);

      xhr.open('POST', `${baseUrl}${path}`);
      xhr.setRequestHeader('Accept', 'application/json');
      const key = apiKey();
      if (key) xhr.setRequestHeader(API_KEY_HEADER, key);
      for (const [name, value] of Object.entries(requestHeaders(path))) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) opts.onProgress?.(event.loaded / event.total);
      };
      xhr.onload = () => {
        cleanup();
        let body: unknown;
        try {
          body = xhr.responseText ? (JSON.parse(xhr.responseText) as unknown) : null;
        } catch {
          body = xhr.responseText;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(normalizeIngest(body));
          } catch (error) {
            reject(error);
          }
          return;
        }
        const error = errorFromBody(xhr.status, xhr.statusText, body, xhr.getResponseHeader('Retry-After'));
        if (error.status === 401) onUnauthorized(error);
        reject(error);
      };
      xhr.onerror = () => {
        cleanup();
        reject(new ApiError({ kind: 'network', title: 'Network error', detail: 'The upload could not reach the API.' }));
      };
      xhr.onabort = () => {
        cleanup();
        reject(new ApiError({ kind: 'aborted', title: 'Upload cancelled' }));
      };
      xhr.send(form);
    });
  }

  const enc = encodeURIComponent;

  return {
    mode: 'live',
    health: (signal) => request('/health', { method: 'GET', signal }, normalizeHealth),

    listPapers: (signal) => request('/api/papers', { method: 'GET', signal }, normalizePapers),
    ingestPaper: (file, opts = {}) => upload('/api/papers/ingest', file, opts),
    ingestArxiv: (arxivId, signal) => request('/api/papers/arxiv', { method: 'POST', body: { arxivId }, signal }, normalizeIngest),
    deletePaper: (paperId, signal) => noContent(`/api/papers/${enc(paperId)}`, signal),

    query: (body, signal) => request('/api/query', { method: 'POST', body, signal }, normalizeQueryResponse),
    queryStream: (body, onProgress, signal) => stream('/api/query/stream', body, normalizeQueryResponse, onProgress, signal),
    discover: (body, signal) => request('/api/discover', { method: 'POST', body, signal }, normalizeDiscoverResponse),
    discoverStream: (body, onProgress, signal) =>
      stream('/api/discover/stream', body, normalizeDiscoverResponse, onProgress, signal),
    naiveRag: (body, signal) => request('/api/naive-rag', { method: 'POST', body, signal }, normalizeNaiveRag),
    singleLlm: (body, signal) => request('/api/single-llm', { method: 'POST', body, signal }, normalizeSingleLlm),
    compare: (body, signal) => request('/api/compare', { method: 'POST', body, signal }, normalizeCompareResponse),

    listRuns: (filter = {}, signal) => {
      const params = new URLSearchParams();
      if (filter.kind) params.set('kind', filter.kind);
      if (filter.limit) params.set('limit', String(filter.limit));
      const qs = params.toString();
      return request(`/api/runs${qs ? `?${qs}` : ''}`, { method: 'GET', signal }, normalizeRunSummaries);
    },
    getRun: (id, signal) => request(`/api/runs/${enc(id)}`, { method: 'GET', signal }, normalizeRunDetail),
    deleteRun: (id, signal) => noContent(`/api/runs/${enc(id)}`, signal),
  };
}
