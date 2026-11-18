import { useCallback, useEffect, useState } from 'react';
import type { FeaturedRun } from './runs';

export type FeaturedState =
  | { status: 'loading' }
  | { status: 'ready'; runs: FeaturedRun[] }
  | { status: 'error'; error: unknown };

let pending: Promise<FeaturedRun[]> | null = null;
let loaded: FeaturedRun[] | null = null;

/**
 * Loads the bundled featured runs once per page. This fetches a static chunk
 * of the app, never the API; a failed load (say, a deploy replaced the chunk)
 * can be retried.
 */
export function loadFeaturedRuns(): Promise<FeaturedRun[]> {
  pending ??= import('./runs').then(
    (m) => (loaded = m.featuredRuns),
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

export function useFeaturedRuns(): { state: FeaturedState; retry: () => void } {
  const [state, setState] = useState<FeaturedState>(() => (loaded ? { status: 'ready', runs: loaded } : { status: 'loading' }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (loaded) return;
    let live = true;
    loadFeaturedRuns().then(
      (runs) => live && setState({ status: 'ready', runs }),
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
