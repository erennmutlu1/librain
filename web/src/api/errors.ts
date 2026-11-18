import { currentLang, locale, pick, type Lang } from '../i18n/lang';
import { text } from './errors.i18n';

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
    pick(text).requestFailed(status);
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
    title: typeof record.title === 'string' ? record.title : pick(text).streamFailed,
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
  /** The interface language; defaults to the current one. */
  lang?: Lang;
}

/** Translates the backend's own English wording when it is a sentence we know; otherwise leaves it. */
export function localizeServerText(value: string, lang?: Lang): string;
export function localizeServerText(value: string | undefined, lang?: Lang): string | undefined;
export function localizeServerText(value: string | undefined, lang: Lang = currentLang()): string | undefined {
  if (value === undefined || lang === 'en') return value;
  for (const { pattern, render } of pick(text, lang).server) {
    const m = pattern.exec(value);
    if (m) return render(m);
  }
  return value;
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

function clock(date: Date, lang: Lang): string {
  return date.toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' });
}

/** One plain-language description of what went wrong and what to do next. */
export function describeError(error: unknown, now: number = Date.now(), options: DescribeOptions = {}): ErrorDescription {
  const lang = options.lang ?? currentLang();
  const t = pick(text, lang);
  if (error instanceof ApiError) {
    if (error.title === NO_RECORDING) {
      return {
        title: t.noRecordingTitle,
        detail: t.noRecordingDetail,
        action: { kind: 'go-live' },
        tone: 'info',
        retryable: false,
      };
    }
    if (error.kind === 'network') {
      return {
        title: t.networkTitle,
        detail: options.publicDemo ? t.networkDetailPublic : t.networkDetailLocal,
      };
    }
    if (error.kind === 'parse') {
      return { title: t.parseTitle, detail: error.detail };
    }
    const keysRequired: ErrorDescription = {
      title: t.keysTitle,
      detail: t.keysDetail,
      action: { kind: 'provider-keys' },
    };
    if (error.status === 401 && error.title === PROVIDER_KEYS_REQUIRED) return keysRequired;
    if (error.status === 403 && error.title === READ_ONLY_DEPLOYMENT) {
      return {
        title: t.readOnlyTitle,
        detail: localizeServerText(error.detail, lang) ?? t.readOnlyDetail,
        retryable: false,
      };
    }
    const provider = options.publicDemo && (error.kind === 'http' || error.kind === 'stream') ? rejectingProvider(error) : undefined;
    // The API already words a provider failure it recognised (rejected key, no credit,
    // permission, rate limit) and names the provider: show its words as they are.
    if (provider && error.provider) {
      const aboutTheKey = !/rate limit/i.test(error.title);
      return {
        title: localizeServerText(error.title, lang),
        detail: aboutTheKey
          ? `${localizeServerText(error.detail, lang) ?? ''} ${t.providerAdvice(provider.console)}`.trim()
          : (localizeServerText(error.detail, lang) ?? t.waitAMinute),
        correlationId: error.correlationId,
        ...(aboutTheKey ? { action: { kind: 'provider-keys' as const } } : {}),
      };
    }
    if (provider) {
      return {
        title: t.rejectedYourKey(provider.name, localizeServerText(error.detail ?? error.title, lang)),
        detail: t.providerAdviceShort(provider.console),
        correlationId: error.correlationId,
        action: { kind: 'provider-keys' },
      };
    }
    // The public site sends no X-Api-Key, so any other 401 there is about the visitor's keys too.
    if (error.status === 401 && options.publicDemo) return keysRequired;
    if (error.status === 401) {
      return {
        title: t.apiKeyTitle,
        detail: t.apiKeyDetail,
        action: { kind: 'api-key' },
      };
    }
    if (error.status === 429) {
      if (error.retryAfterSeconds !== undefined) {
        const at = new Date(now + error.retryAfterSeconds * 1000);
        const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
        return {
          title: t.rateTitle,
          detail: t.rateRetry(localizeServerText(error.detail, lang) ?? t.rateDefault, minutes, clock(at, lang)),
          action: { kind: 'retry-at', at },
        };
      }
      return {
        title: t.rateTitle,
        detail: t.rateWithin(localizeServerText(error.detail, lang) ?? t.rateDefault),
      };
    }
    if (error.status === 502 || error.kind === 'stream') {
      return {
        title: error.title === 'Upstream API error' ? t.upstreamTitle : (localizeServerText(error.title, lang) ?? error.title),
        detail: localizeServerText(error.detail, lang) ?? t.upstreamDetail,
        correlationId: error.correlationId,
      };
    }
    return { title: localizeServerText(error.title, lang), detail: localizeServerText(error.detail, lang), correlationId: error.correlationId };
  }
  if (error instanceof Error) return { title: localizeServerText(error.message, lang) };
  return { title: t.generic };
}
