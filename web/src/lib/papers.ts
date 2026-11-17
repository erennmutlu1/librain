import { useCallback, useEffect, useMemo } from 'react';
import { useApi } from '../api/context';
import type { PaperSummary } from '../api/types';
import { getSession } from './sessionStore';
import { useRequest, type RequestState } from './useRequest';

const KEY = 'papers';

/** The library list, loaded once per tab and shared by every screen. */
export function usePapers() {
  const api = useApi();
  const fetchPapers = useCallback((_: void, signal: AbortSignal) => api.listPapers(signal), [api]);
  const request = useRequest<void, PaperSummary[]>(KEY, fetchPapers);
  const { run } = request;

  useEffect(() => {
    if (getSession<RequestState<PaperSummary[]>>(KEY, { status: 'idle' }).status === 'idle') void run();
  }, [run]);

  return request;
}

/** paperId -> summary, for showing titles next to citations. Empty until loaded. */
export function usePaperIndex(): Map<string, PaperSummary> {
  const { state } = usePapers();
  return useMemo(() => {
    const map = new Map<string, PaperSummary>();
    if (state.status === 'success') for (const p of state.data) map.set(p.paperId, p);
    return map;
  }, [state]);
}

/** A title worth showing: hides the backend's paperId fallback and empty titles. */
export function displayTitle(paper: PaperSummary | undefined): string | null {
  if (!paper?.title) return null;
  const title = paper.title.trim();
  return title && title !== paper.paperId ? title : null;
}
