import { useCallback, useEffect, useState } from 'react';
import type { ExploreData } from './model';

export type ExploreState = { status: 'loading' } | { status: 'ready'; data: ExploreData } | { status: 'error'; error: unknown };

let pending: Promise<ExploreData> | null = null;
let loaded: ExploreData | null = null;

/**
 * Loads the bundled runs once per page. This fetches a static chunk of the
 * app, never the API; a failed load (say, a deploy replaced the chunk) can be
 * retried.
 */
export function loadExploreData(): Promise<ExploreData> {
  pending ??= import('./runs').then(
    (m) => (loaded = m.exploreData),
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

export function useExploreData(): { state: ExploreState; retry: () => void } {
  const [state, setState] = useState<ExploreState>(() => (loaded ? { status: 'ready', data: loaded } : { status: 'loading' }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (loaded) return;
    let live = true;
    loadExploreData().then(
      (data) => live && setState({ status: 'ready', data }),
      (error: unknown) => live && setState({ status: 'error', error }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((a) => a + 1);
  }, []);

  return { state, retry };
}
