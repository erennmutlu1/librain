export type ApiErrorKind = 'http' | 'network' | 'parse' | 'aborted' | 'stream';

/**
 * Every failure the client surfaces. HTTP failures carry the problem+json
 * title/detail and, when the API includes it, the correlation id so the run
 * can be found in the logs and in /api/runs.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  readonly correlationId: string | undefined;
  /** Seconds until a 429 may be retried, from the Retry-After header. */
  readonly retryAfterSeconds: number | undefined;

  constructor(init: {
    kind: ApiErrorKind;
    status?: number;
    title: string;
    detail?: string | undefined;
    correlationId?: string | undefined;
    retryAfterSeconds?: number | undefined;
  }) {
    super(init.detail ? `${init.title}: ${init.detail}` : init.title);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status ?? 0;
    this.title = init.title;
    this.detail = init.detail;
    this.correlationId = init.correlationId;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof ApiError) return error.kind === 'aborted';
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Retry-After as seconds: either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.round((at - now) / 1000));
}

/** Builds an ApiError from a non-2xx response body (problem+json or `{ error }`). */
export function errorFromBody(status: number, statusText: string, body: unknown, retryAfter?: string | null): ApiError {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const title =
    (typeof record.title === 'string' && record.title) ||
    (typeof record.error === 'string' && record.error) ||
    statusText ||
    `Request failed with status ${status}`;
  const detail = typeof record.detail === 'string' ? record.detail : undefined;
  const correlationId = typeof record.correlationId === 'string' ? record.correlationId : undefined;
  return new ApiError({
    kind: 'http',
    status,
    title,
    detail,
    correlationId,
    retryAfterSeconds: status === 429 ? parseRetryAfter(retryAfter) : undefined,
  });
}

/** An `event: error` from a stream endpoint: {title, detail, correlationId}. */
export function errorFromStreamEvent(data: unknown): ApiError {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return new ApiError({
    kind: 'stream',
    status: 0,
    title: typeof record.title === 'string' ? record.title : 'The pipeline failed',
    detail: typeof record.detail === 'string' ? record.detail : undefined,
    correlationId: typeof record.correlationId === 'string' ? record.correlationId : undefined,
  });
}

export interface ErrorDescription {
  title: string;
  detail?: string | undefined;
  correlationId?: string | undefined;
  /** What the UI should offer: open the API-key setting, or wait until a time. */
  action?: { kind: 'api-key' } | { kind: 'retry-at'; at: Date };
}

function clock(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** One plain-language description of what went wrong and what to do next. */
export function describeError(error: unknown, now: number = Date.now()): ErrorDescription {
  if (error instanceof ApiError) {
    if (error.kind === 'network') {
      return {
        title: "Can't reach the LIBRAIN API.",
        detail:
          'Check that the API is running and reachable (see web/README.md), or use mock mode with VITE_USE_MOCKS=true.',
      };
    }
    if (error.kind === 'parse') {
      return { title: 'The API returned a response this page could not read.', detail: error.detail };
    }
    if (error.status === 401) {
      return {
        title: 'The API needs a key.',
        detail: 'This server requires an X-Api-Key header. Enter the key in Settings and try again.',
        action: { kind: 'api-key' },
      };
    }
    if (error.status === 429) {
      if (error.retryAfterSeconds !== undefined) {
        const at = new Date(now + error.retryAfterSeconds * 1000);
        const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
        return {
          title: 'Rate limit reached.',
          detail: `${error.detail ?? 'This client has used its hourly allowance of paid requests.'} You can try again in about ${minutes} min (around ${clock(at)}).`,
          action: { kind: 'retry-at', at },
        };
      }
      return {
        title: 'Rate limit reached.',
        detail: `${error.detail ?? 'This client has used its hourly allowance of paid requests.'} The limit resets within the hour.`,
      };
    }
    if (error.status === 502 || error.kind === 'stream') {
      return {
        title: error.title === 'Upstream API error' ? 'An upstream model call failed.' : error.title,
        detail: error.detail ?? 'The API could not complete the pipeline. Try again in a moment.',
        correlationId: error.correlationId,
      };
    }
    return { title: error.title, detail: error.detail, correlationId: error.correlationId };
  }
  if (error instanceof Error) return { title: error.message };
  return { title: 'Something went wrong.' };
}
