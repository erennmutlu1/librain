export type ApiErrorKind = 'http' | 'network' | 'parse' | 'aborted' | 'stream';

/** Problem titles the public API answers with (fixed by the backend contract). */
export const PROVIDER_KEYS_REQUIRED = 'provider keys required';
export const READ_ONLY_DEPLOYMENT = 'read-only public deployment';
/** Recorded mode in the public build: the inputs match no recording, and none is substituted. */
export const NO_RECORDING = 'no recorded run';

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
  /** "anthropic" or "openai" when the problem names the provider that refused the request. */
  readonly provider: string | undefined;

  constructor(init: {
    kind: ApiErrorKind;
    status?: number;
    title: string;
    detail?: string | undefined;
    correlationId?: string | undefined;
    retryAfterSeconds?: number | undefined;
    provider?: string | undefined;
  }) {
    super(init.detail ? `${init.title}: ${init.detail}` : init.title);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status ?? 0;
    this.title = init.title;
    this.detail = init.detail;
    this.correlationId = init.correlationId;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.provider = init.provider;
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
    provider: typeof record.provider === 'string' ? record.provider : undefined,
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
    provider: typeof record.provider === 'string' ? record.provider : undefined,
  });
}

export interface ErrorDescription {
  title: string;
  detail?: string | undefined;
  correlationId?: string | undefined;
  /**
   * What the UI should offer: open the API-key setting, open the visitor's
   * provider keys, switch the public build to Live mode, or wait until a time.
   */
  action?: { kind: 'api-key' } | { kind: 'provider-keys' } | { kind: 'go-live' } | { kind: 'retry-at'; at: Date };
  /** "info" for an expected outcome that is not a failure; defaults to "error". */
  tone?: 'error' | 'info';
  /** False when sending the same request again cannot change the answer. */
  retryable?: boolean;
}

export interface DescribeOptions {
  /** The public build: the visitor's own provider keys, no X-Api-Key, a hosted API. */
  publicDemo?: boolean;
}

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', console: 'console.anthropic.com' },
  { id: 'openai', name: 'OpenAI', console: 'platform.openai.com' },
] as const;

/**
 * Which provider refused a live request made with the visitor's key. The API
 * passes the provider's own explanation through in the problem detail; a
 * `provider` extension is used when present, otherwise the text has to name
 * the provider and talk about the key, credit or access.
 */
function rejectingProvider(error: ApiError): (typeof PROVIDERS)[number] | undefined {
  const named = PROVIDERS.find((p) => p.id === error.provider?.toLowerCase());
  if (named) return named;
  const text = `${error.title} ${error.detail ?? ''}`;
  if (!/\b(api[ -]?key|key|credit|billing|quota|balance|auth\w*|unauthori[sz]ed|permission|forbidden|rejected|invalid)\b/i.test(text)) {
    return undefined;
  }
  return PROVIDERS.find((p) => new RegExp(p.name, 'i').test(text));
}

function clock(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** One plain-language description of what went wrong and what to do next. */
export function describeError(error: unknown, now: number = Date.now(), options: DescribeOptions = {}): ErrorDescription {
  if (error instanceof ApiError) {
    if (error.title === NO_RECORDING) {
      return {
        title: 'This is the recorded demo, and no recorded run matches these inputs.',
        detail:
          'Recorded mode only replays real runs; it never swaps in a different one. Pick one of the recorded runs, or switch to Live to run your own inputs with your own Anthropic and OpenAI keys.',
        action: { kind: 'go-live' },
        tone: 'info',
        retryable: false,
      };
    }
    if (error.kind === 'network') {
      return {
        title: "Can't reach the LIBRAIN API.",
        detail: options.publicDemo
          ? 'The public API may be down or starting up. Try again in a moment, or switch back to Recorded mode.'
          : 'Check that the API is running and reachable (see web/README.md), or use mock mode with VITE_USE_MOCKS=true.',
      };
    }
    if (error.kind === 'parse') {
      return { title: 'The API returned a response this page could not read.', detail: error.detail };
    }
    const keysRequired: ErrorDescription = {
      title: 'Live mode needs your own API keys.',
      detail: 'Live runs use your Anthropic and OpenAI keys, billed to your accounts. Add both keys, then try again.',
      action: { kind: 'provider-keys' },
    };
    if (error.status === 401 && error.title === PROVIDER_KEYS_REQUIRED) return keysRequired;
    if (error.status === 403 && error.title === READ_ONLY_DEPLOYMENT) {
      return {
        title: 'This public deployment is read-only.',
        detail:
          error.detail ??
          'Uploading or deleting papers and the server run history are turned off here. Your own runs are kept in this browser, under History.',
        retryable: false,
      };
    }
    const provider = options.publicDemo && (error.kind === 'http' || error.kind === 'stream') ? rejectingProvider(error) : undefined;
    // The API already words a provider failure it recognised (rejected key, no credit,
    // permission, rate limit) and names the provider: show its words as they are.
    if (provider && error.provider) {
      const aboutTheKey = !/rate limit/i.test(error.title);
      return {
        title: error.title,
        detail: aboutTheKey
          ? `${error.detail ?? ''} Check the key, its credit and its spending limit at ${provider.console}. Recorded mode needs no keys.`.trim()
          : (error.detail ?? 'Wait a minute and try again.'),
        correlationId: error.correlationId,
        ...(aboutTheKey ? { action: { kind: 'provider-keys' as const } } : {}),
      };
    }
    if (provider) {
      return {
        title: `${provider.name} rejected your key: ${error.detail ?? error.title}`,
        detail: `Check the key, its credit and its spending limit at ${provider.console}, then try again. Recorded mode needs no keys.`,
        correlationId: error.correlationId,
        action: { kind: 'provider-keys' },
      };
    }
    // The public site sends no X-Api-Key, so any other 401 there is about the visitor's keys too.
    if (error.status === 401 && options.publicDemo) return keysRequired;
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
