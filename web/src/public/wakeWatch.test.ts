import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWAKE_FOR_MS, SLOW_AFTER_MS, createWakeWatch } from './wakeWatch';

interface Pending {
  url: string;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
}

/** A fake server whose every request waits until the test answers it. */
function server() {
  const pending: Pending[] = [];
  const fetchImpl = vi.fn(
    (input: RequestInfo | URL) =>
      new Promise<Response>((resolve, reject) => {
        pending.push({ url: String(input), resolve, reject });
      }),
  );
  const answer = (url: string, status = 200) => {
    const i = pending.findIndex((p) => p.url === url);
    pending.splice(i, 1)[0]!.resolve(new Response('{}', { status }));
  };
  return { fetchImpl, pending, answer };
}

const BASE = 'https://api.librain.test';
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createWakeWatch (free host waking up)', () => {
  it('says "waking" only after 4 s without an answer, probes /health once, and clears on the first answer', async () => {
    const { fetchImpl, pending, answer } = server();
    const watch = createWakeWatch(fetchImpl as unknown as typeof fetch, { healthUrl: `${BASE}/health` });
    const listener = vi.fn();
    watch.subscribe(listener);

    void watch.fetch(`${BASE}/api/papers`);
    vi.advanceTimersByTime(SLOW_AFTER_MS - 1);
    expect(watch.waking()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(watch.waking()).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(pending.map((p) => p.url)).toEqual([`${BASE}/api/papers`, `${BASE}/health`]);

    answer(`${BASE}/api/papers`);
    await settle();
    expect(watch.waking()).toBe(false);
  });

  it('never fails or cuts short the slow request: it answers whenever the server does', async () => {
    const { fetchImpl, answer } = server();
    const watch = createWakeWatch(fetchImpl as unknown as typeof fetch, { healthUrl: `${BASE}/health` });
    const response = watch.fetch(`${BASE}/api/discover/stream`, { method: 'POST' });
    let settled = false;
    void response.then(() => (settled = true), () => (settled = true));

    await vi.advanceTimersByTimeAsync(119_000);
    expect(settled).toBe(false);
    expect(watch.waking()).toBe(true);

    answer(`${BASE}/api/discover/stream`);
    await expect(response).resolves.toBeInstanceOf(Response);
    expect(watch.waking()).toBe(false);
  });

  it('clears when the /health probe answers, while a long Compare is still working', async () => {
    const { fetchImpl, pending, answer } = server();
    const watch = createWakeWatch(fetchImpl as unknown as typeof fetch, { healthUrl: `${BASE}/health` });
    void watch.fetch(`${BASE}/api/compare`, { method: 'POST' });
    vi.advanceTimersByTime(SLOW_AFTER_MS);
    expect(watch.waking()).toBe(true);

    answer(`${BASE}/health`);
    await settle();
    expect(watch.waking()).toBe(false);
    expect(pending.map((p) => p.url)).toEqual([`${BASE}/api/compare`]);
    // The compare keeps running; its later answer does not bring the notice back.
    vi.advanceTimersByTime(30_000);
    expect(watch.waking()).toBe(false);
  });

  it('stays quiet for slow work on a server that answered recently, and watches again after a quiet spell', async () => {
    const { fetchImpl, answer } = server();
    const watch = createWakeWatch(fetchImpl as unknown as typeof fetch, { healthUrl: `${BASE}/health` });
    void watch.fetch(`${BASE}/health`);
    answer(`${BASE}/health`);
    await settle();

    void watch.fetch(`${BASE}/api/compare`, { method: 'POST' });
    vi.advanceTimersByTime(30_000);
    expect(watch.waking()).toBe(false);
    answer(`${BASE}/api/compare`);
    await settle();

    vi.advanceTimersByTime(AWAKE_FOR_MS);
    void watch.fetch(`${BASE}/api/compare`, { method: 'POST' });
    vi.advanceTimersByTime(SLOW_AFTER_MS);
    expect(watch.waking()).toBe(true);
  });

  it('forgets a request that is cancelled or cannot reach the server', async () => {
    const { fetchImpl, pending } = server();
    const watch = createWakeWatch(fetchImpl as unknown as typeof fetch, { healthUrl: `${BASE}/health` });
    const response = watch.fetch(`${BASE}/api/query/stream`, { method: 'POST' });
    vi.advanceTimersByTime(SLOW_AFTER_MS);
    expect(watch.waking()).toBe(true);

    pending.find((p) => p.url.endsWith('/stream'))!.reject(new DOMException('aborted', 'AbortError'));
    await expect(response).rejects.toThrow('aborted');
    expect(watch.waking()).toBe(false);
  });
});
