/*
 * The public API runs on a free host that sleeps after 15 minutes without
 * traffic and takes up to a minute to wake: the first request simply hangs
 * until the server is up. That wait is normal, so it is never an error and no
 * request is cut short for it (the client sets no timeout). This watch only
 * lets the UI say what is happening.
 *
 * It wraps the live client's fetch. A request that has had no response after
 * SLOW_AFTER_MS, while the server is not known to be awake, marks the watch as
 * "waking" and starts one GET /health probe. Any response from the API (to
 * that request, the probe or anything else) shows the server is up and clears
 * it. "Known to be awake" means it answered within AWAKE_FOR_MS, so a long
 * Discovery or Compare on an awake server never shows the notice.
 */

export const SLOW_AFTER_MS = 4_000;
/** Shorter than the host's 15 idle minutes, which count from the last request, not the last answer. */
export const AWAKE_FOR_MS = 10 * 60_000;

export interface WakeWatch {
  /** Use as the live client's fetch. */
  readonly fetch: typeof fetch;
  /** True while a request waits on a server that may be waking up. */
  waking(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createWakeWatch(
  baseFetch: typeof fetch = (input, init) => fetch(input, init),
  options: { healthUrl?: string; slowAfterMs?: number; awakeForMs?: number } = {},
): WakeWatch {
  const healthUrl = options.healthUrl ?? '/health';
  const slowAfterMs = options.slowAfterMs ?? SLOW_AFTER_MS;
  const awakeForMs = options.awakeForMs ?? AWAKE_FOR_MS;

  let answeredAt: number | null = null;
  let probing = false;
  const slow = new Set<object>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const awake = () => answeredAt !== null && Date.now() - answeredAt < awakeForMs;

  function answered() {
    answeredAt = Date.now();
    if (slow.size > 0) {
      slow.clear();
      notify();
    }
  }

  function forget(request: object) {
    if (slow.delete(request)) notify();
  }

  // One cheap request that answers as soon as the server is up, even while a
  // long non-streaming call (Compare) is still working.
  function probe() {
    if (probing) return;
    probing = true;
    baseFetch(healthUrl, { method: 'GET', headers: { Accept: 'application/json' } }).then(answered, () => undefined).finally(() => {
      probing = false;
    });
  }

  const watched: typeof fetch = (input, init) => {
    const request = {};
    const timer = awake()
      ? null
      : setTimeout(() => {
          slow.add(request);
          notify();
          probe();
        }, slowAfterMs);
    const response = baseFetch(input, init);
    response.then(
      () => {
        if (timer) clearTimeout(timer);
        answered();
      },
      () => {
        // Aborted or unreachable: this request no longer waits on anything.
        if (timer) clearTimeout(timer);
        forget(request);
      },
    );
    return response;
  };

  return {
    fetch: watched,
    waking: () => slow.size > 0,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
