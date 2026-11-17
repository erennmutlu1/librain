import { createContext, useContext, type ReactNode } from 'react';
import type { LibrainApi } from './types';

const ApiContext = createContext<LibrainApi | null>(null);

export function ApiProvider({ api, children }: { api: LibrainApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApi(): LibrainApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>.');
  return api;
}
