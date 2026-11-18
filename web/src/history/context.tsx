import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { RunKind } from '../api/types';
import type { RunStore, RunStoreStatus } from './runStore';
import type { RunDetail, RunListItem } from './types';

const RunStoreContext = createContext<RunStore | null>(null);

export function RunStoreProvider({ store, children }: { store: RunStore; children: ReactNode }) {
  return <RunStoreContext.Provider value={store}>{children}</RunStoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRunStore(): RunStore {
  const store = useContext(RunStoreContext);
  if (!store) throw new Error('useRunStore must be used inside <RunStoreProvider>.');
  return store;
}

export interface RunsState {
  /** Null while the first load is in flight. */
  runs: RunListItem[] | null;
  error: unknown;
  loading: boolean;
  status: RunStoreStatus;
  refresh: () => void;
}

/** Live list of saved runs for one kind (or all), refreshed on every store change. */
// eslint-disable-next-line react-refresh/only-export-components
export function useRuns(kind?: RunKind): RunsState {
  const store = useRunStore();
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStoreStatus>(() => store.status());
  const key = kind ?? 'all';

  // State is only set when the request settles, never synchronously in the effect.
  const load = useCallback(() => {
    let live = true;
    store.list(kind ? { kind } : {}).then(
      (list) => {
        if (!live) return;
        setRuns(list);
        setError(null);
        setLoadedKey(key);
        setStatus(store.status());
      },
      (e: unknown) => {
        if (!live) return;
        setError(e);
        setLoadedKey(key);
      },
    );
    return () => {
      live = false;
    };
  }, [store, kind, key]);

  useEffect(() => {
    let cancel = load();
    const unsubscribe = store.subscribe(() => {
      cancel();
      cancel = load();
    });
    return () => {
      cancel();
      unsubscribe();
    };
  }, [store, load]);

  const refresh = useCallback(() => {
    setLoadedKey(null);
    load();
  }, [load]);

  return { runs, error, loading: loadedKey !== key, status, refresh };
}

/** Records a finished run; storage failures are reported through the store's status. */
// eslint-disable-next-line react-refresh/only-export-components
export function useRecordRun(): (run: RunDetail) => void {
  const store = useRunStore();
  return useCallback(
    (run: RunDetail) => {
      void store.save(run).catch(() => undefined);
    },
    [store],
  );
}
