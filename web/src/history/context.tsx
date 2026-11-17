import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { RunStore, RunStoreStatus } from './runStore';
import type { RunRecord } from './types';

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

/** Live list of saved runs (null while loading) plus the store's status. */
// eslint-disable-next-line react-refresh/only-export-components
export function useRuns(): { runs: RunRecord[] | null; status: RunStoreStatus; refresh: () => void } {
  const store = useRunStore();
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [status, setStatus] = useState<RunStoreStatus>(() => store.status());

  const refresh = useCallback(() => {
    void store.list().then((list) => {
      setRuns(list);
      setStatus(store.status());
    });
  }, [store]);

  useEffect(() => {
    refresh();
    return store.subscribe(refresh);
  }, [store, refresh]);

  return { runs, status, refresh };
}

/** Saves a run and swallows storage failures (the store reports them via status). */
// eslint-disable-next-line react-refresh/only-export-components
export function useRecordRun(): (run: RunRecord) => void {
  const store = useRunStore();
  return useCallback(
    (run: RunRecord) => {
      void store.save(run).catch(() => undefined);
    },
    [store],
  );
}
