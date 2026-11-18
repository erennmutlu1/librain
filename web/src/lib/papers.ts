import { useCallback, useEffect, useMemo } from 'react';
import { useApi } from '../api/context';
import type { PaperSummary } from '../api/types';
import { paperInfo } from './paperCatalog';
import { getSession, useSessionState } from './sessionStore';
import { useRequest, type RequestState } from './useRequest';

const KEY = 'papers';
const IDLE: RequestState<PaperSummary[]> = { status: 'idle' };

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

function indexPapers(state: RequestState<PaperSummary[]>): Map<string, PaperSummary> {
  const map = new Map<string, PaperSummary>();
  if (state.status === 'success') for (const p of state.data) map.set(p.paperId, p);
  return map;
}

/** paperId -> summary, for showing titles next to citations. Empty until loaded. */
export function usePaperIndex(): Map<string, PaperSummary> {
  const { state } = usePapers();
  return useMemo(() => indexPapers(state), [state]);
}

/**
 * The same index from a library list this tab has already loaded, without
 * ever requesting one. For views that must not call the API (featured runs).
 */
export function useLoadedPaperIndex(): Map<string, PaperSummary> {
  const [state] = useSessionState<RequestState<PaperSummary[]>>(KEY, IDLE);
  return useMemo(() => indexPapers(state), [state]);
}

/** A title worth showing: hides the backend's paperId fallback and empty titles. */
export function displayTitle(paper: PaperSummary | undefined): string | null {
  if (!paper?.title) return null;
  const title = paper.title.trim();
  return title && title !== paper.paperId ? title : null;
}

/**
 * The best title for a paper id: the library list's title when this tab has
 * loaded one, else the static catalogue's (paperCatalog), else null.
 */
export function paperTitleFor(paperId: string, papers?: Map<string, PaperSummary>): string | null {
  const known = paperInfo(paperId).title?.trim();
  return displayTitle(papers?.get(paperId)) ?? (known && known !== paperId ? known : null);
}
