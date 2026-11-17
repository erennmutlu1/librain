export type ApiErrorKind = 'http' | 'network' | 'parse' | 'aborted';

/**
 * Every failure the client surfaces. HTTP failures carry the ASP.NET
 * ProblemDetails title/detail and, when the API includes it, the
 * correlation id so the run can be found in Application Insights.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  readonly correlationId: string | undefined;

  constructor(init: {
    kind: ApiErrorKind;
    status?: number;
    title: string;
    detail?: string;
    correlationId?: string;
  }) {
    super(init.detail ? `${init.title}: ${init.detail}` : init.title);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status ?? 0;
    this.title = init.title;
    this.detail = init.detail;
    this.correlationId = init.correlationId;
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof ApiError) return error.kind === 'aborted';
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Builds an ApiError from a non-2xx response body (ProblemDetails or `{ error }`). */
export function errorFromBody(status: number, statusText: string, body: unknown): ApiError {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const title =
    (typeof record.title === 'string' && record.title) ||
    (typeof record.error === 'string' && record.error) ||
    statusText ||
    `Request failed with status ${status}`;
  const detail = typeof record.detail === 'string' ? record.detail : undefined;
  const correlationId = typeof record.correlationId === 'string' ? record.correlationId : undefined;
  return new ApiError({ kind: 'http', status, title, detail, correlationId });
}

/** One plain-language sentence describing what went wrong and what to do. */
export function describeError(error: unknown): { title: string; detail?: string; correlationId?: string } {
  if (error instanceof ApiError) {
    if (error.kind === 'network') {
      return {
        title: "Can't reach the LIBRAIN API.",
        detail:
          'Check that the API is running (dotnet run --project LIBRAIN, port 5000) or switch on mock mode with VITE_USE_MOCKS=true.',
      };
    }
    if (error.kind === 'parse') {
      return { title: 'The API returned a response this page could not read.', detail: error.detail };
    }
    if (error.status === 502) {
      return {
        title: 'An upstream model call failed.',
        detail: error.detail ?? 'The API could not complete the pipeline. Try again in a moment.',
        correlationId: error.correlationId,
      };
    }
    return { title: error.title, detail: error.detail, correlationId: error.correlationId };
  }
  if (error instanceof Error) return { title: error.message };
  return { title: 'Something went wrong.' };
}
