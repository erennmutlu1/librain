import { useCallback } from 'react';
import { isAbortError } from '../api/errors';
import { getSession, setSession, useSessionState } from './sessionStore';

export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown };

const IDLE = { status: 'idle' } as const;
const controllers = new Map<string, AbortController>();

/**
 * Runs an abortable request whose state lives in the session store under
 * `key`. Starting a new run cancels the previous one. A cancelled run returns
 * to idle rather than showing an error.
 */
export function useRequest<A, T>(key: string, fn: (args: A, signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useSessionState<RequestState<T>>(key, IDLE);

  const run = useCallback(
    async (args: A): Promise<T | undefined> => {
      controllers.get(key)?.abort();
      const controller = new AbortController();
      controllers.set(key, controller);
      setState({ status: 'loading', startedAt: Date.now() });
      try {
        const data = await fn(args, controller.signal);
        if (controllers.get(key) !== controller) return undefined; // superseded
        setState({ status: 'success', data });
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

  /** Shows a saved result without making a request (used for "load recorded run"). */
  const show = useCallback((data: T) => setState({ status: 'success', data }), [setState]);

  return { state, run, cancel, reset, show };
}
