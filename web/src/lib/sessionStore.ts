import { useCallback, useSyncExternalStore } from 'react';

/*
 * In-memory, per-tab state that outlives component mounts. Each screen keeps
 * its form and last result here, so switching tabs does not lose a 20-second
 * discovery run, and a request that finishes while the user is elsewhere still
 * lands where they left it.
 */

const values = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

export function getSession<T>(key: string, initial: T): T {
  return values.has(key) ? (values.get(key) as T) : initial;
}

export function setSession<T>(key: string, next: T | ((previous: T | undefined) => T)): void {
  const previous = values.get(key) as T | undefined;
  const value = typeof next === 'function' ? (next as (p: T | undefined) => T)(previous) : next;
  if (Object.is(previous, value) && values.has(key)) return;
  values.set(key, value);
  listeners.get(key)?.forEach((l) => l());
}

function subscribe(key: string, listener: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => set.delete(listener);
}

export function useSessionState<T>(key: string, initial: T): [T, (next: T | ((previous: T) => T)) => void] {
  const sub = useCallback((listener: () => void) => subscribe(key, listener), [key]);
  const value = useSyncExternalStore(
    sub,
    () => getSession(key, initial),
    () => getSession(key, initial),
  );
  const set = useCallback(
    (next: T | ((previous: T) => T)) =>
      setSession<T>(key, (prev) =>
        typeof next === 'function' ? (next as (p: T) => T)(prev === undefined ? initial : prev) : next,
      ),
    // `initial` is only a fallback for the first read; it is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, set];
}

/** Test helper. */
export function resetSessionStore(): void {
  values.clear();
  listeners.forEach((set) => set.forEach((l) => l()));
}
