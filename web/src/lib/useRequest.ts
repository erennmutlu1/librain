import { useCallback } from 'react';
import { isAbortError } from '../api/errors';
import type { ProgressEvent } from '../api/types';
import { getSession, setSession, useSessionState } from './sessionStore';
import type { TimedProgress } from './stages';

export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number; progress: TimedProgress[] }
  | { status: 'success'; data: T; elapsedMs?: number }
  | { status: 'error'; error: unknown };

const IDLE = { status: 'idle' } as const;
const controllers = new Map<string, AbortController>();
/** Every key that has ever run, i.e. every state that can hold a result. */
const ranKeys = new Set<string>();

export type RequestFn<A, T> = (args: A, signal: AbortSignal, onProgress: (event: ProgressEvent) => void) => Promise<T>;

/**
 * Runs an abortable request whose state lives in the session store under
 * `key`, so it survives navigation. Starting a new run cancels the previous
 * one; a cancelled run returns to idle rather than showing an error. Progress
 * events reported by `fn` are timestamped into the loading state.
 */
export function useRequest<A, T>(key: string, fn: RequestFn<A, T>) {
  const [state, setState] = useSessionState<RequestState<T>>(key, IDLE);

  const run = useCallback(
    async (args: A): Promise<T | undefined> => {
      ranKeys.add(key);
      controllers.get(key)?.abort();
      const controller = new AbortController();
      controllers.set(key, controller);
      const startedAt = Date.now();
      setState({ status: 'loading', startedAt, progress: [] });
      const onProgress = (event: ProgressEvent) => {
        if (controllers.get(key) !== controller) return;
        setSession<RequestState<T>>(key, (prev) =>
          prev?.status === 'loading' ? { ...prev, progress: [...prev.progress, { ...event, at: Date.now() }] } : (prev ?? IDLE),
        );
      };
      try {
        const data = await fn(args, controller.signal, onProgress);
        if (controllers.get(key) !== controller) return undefined; // superseded
        setState({ status: 'success', data, elapsedMs: Date.now() - startedAt });
        return data;
      } catch (error) {
        if (controllers.get(key) !== controller) return undefined;
        setState(isAbortError(error) ? IDLE : { status: 'error', error });
        return undefined;
      } finally {
        if (controllers.get(key) === controller) controllers.delete(key);
      }
    },
    [key, fn, setState],
  );

  const cancel = useCallback(() => {
    controllers.get(key)?.abort();
    controllers.delete(key);
    if (getSession<RequestState<T>>(key, IDLE).status === 'loading') setSession(key, IDLE);
  }, [key]);

  const reset = useCallback(() => {
    controllers.get(key)?.abort();
    controllers.delete(key);
    setState(IDLE);
  }, [key, setState]);

  return { state, run, cancel, reset };
}

/**
 * Cancels every request in flight and puts every result back to idle. The
 * public build calls it when the visitor switches between recorded and live
 * data, so no screen keeps showing an answer from the other source (or gets
 * one late). Forms are separate session keys and stay as typed.
 */
export function resetAllRequests(): void {
  controllers.forEach((controller) => controller.abort());
  controllers.clear();
  ranKeys.forEach((key) => setSession(key, IDLE));
}
