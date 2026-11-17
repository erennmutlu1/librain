import { ApiError, errorFromBody } from './errors';
import {
  normalizeDiscoverResponse,
  normalizeHealth,
  normalizeIngest,
  normalizeNaiveRag,
  normalizePapers,
  normalizeQueryResponse,
  normalizeSingleLlm,
} from './normalize';
import type { IngestOptions, IngestResult, LibrainApi } from './types';

export interface HttpClientOptions {
  /** API origin. Empty means same origin (the Vite proxy in dev). */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Factory for upload requests; injectable so tests never open sockets. */
  createXhr?: () => XMLHttpRequest;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** The live client. Every call goes to the LIBRAIN API; nothing is cached. */
export function createHttpApi(options: HttpClientOptions = {}): LibrainApi {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const createXhr = options.createXhr ?? (() => new XMLHttpRequest());

  async function request<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal | undefined },
    normalize: (raw: unknown) => T,
  ): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: init.body === undefined ? { Accept: 'application/json' } : {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: init.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError({ kind: 'aborted', title: 'Request cancelled' });
      }
      throw new ApiError({
        kind: 'network',
        title: 'Network error',
        detail: error instanceof Error ? error.message : undefined,
      });
    }

    const body = await readBody(response);
    if (!response.ok) throw errorFromBody(response.status, response.statusText, body);
    return normalize(body);
  }

  function ingestPaper(file: File, opts: IngestOptions = {}): Promise<IngestResult> {
    return new Promise((resolve, reject) => {
      const xhr = createXhr();
      const form = new FormData();
      form.append('file', file, file.name);

      const onAbort = () => xhr.abort();
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      const cleanup = () => opts.signal?.removeEventListener('abort', onAbort);

      xhr.open('POST', `${baseUrl}/api/papers/ingest`);
      xhr.setRequestHeader('Accept', 'application/json');
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
        } else {
          reject(errorFromBody(xhr.status, xhr.statusText, body));
        }
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

  return {
    mode: 'live',
    health: (signal) => request('/health', { method: 'GET', signal }, normalizeHealth),
    listPapers: (signal) => request('/api/papers', { method: 'GET', signal }, normalizePapers),
    ingestPaper,
    query: (body, signal) => request('/api/query', { method: 'POST', body, signal }, normalizeQueryResponse),
    discover: (body, signal) => request('/api/discover', { method: 'POST', body, signal }, normalizeDiscoverResponse),
    naiveRag: (body, signal) => request('/api/naive-rag', { method: 'POST', body, signal }, normalizeNaiveRag),
    singleLlm: (body, signal) => request('/api/single-llm', { method: 'POST', body, signal }, normalizeSingleLlm),
  };
}
