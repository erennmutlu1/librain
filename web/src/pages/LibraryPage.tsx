import { useId, useMemo, useState } from 'react';
import type { PaperSummary } from '../api/types';
import { EmptyState, ErrorNotice, SkeletonLines } from '../components/States';
import { formatCount, formatDate } from '../lib/format';
import { displayTitle, usePapers } from '../lib/papers';
import { useSessionState } from '../lib/sessionStore';
import { UploadPanel } from './UploadPanel';
import styles from './LibraryPage.module.css';

type SortKey = 'paper' | 'chunkCount' | 'firstIngestedAt';
interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

function compare(a: PaperSummary, b: PaperSummary, key: SortKey): number {
  if (key === 'chunkCount') return a.chunkCount - b.chunkCount;
  if (key === 'firstIngestedAt') return (a.firstIngestedAt ?? '').localeCompare(b.firstIngestedAt ?? '');
  const ta = (displayTitle(a) ?? a.paperId).toLowerCase();
  const tb = (displayTitle(b) ?? b.paperId).toLowerCase();
  return ta.localeCompare(tb);
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th scope="col" className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={styles.sortButton} onClick={() => onSort(sortKey)}>
        {label}
        <span className={styles.sortMark} aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  );
}

export function LibraryPage() {
  const uid = useId();
  const { state, run } = usePapers();
  const [filter, setFilter] = useSessionState('library.filter', '');
  const [sort, setSort] = useState<Sort>({ key: 'paper', dir: 'asc' });

  const papers = state.status === 'success' ? state.data : null;
  const totalChunks = papers?.reduce((sum, p) => sum + p.chunkCount, 0) ?? 0;
  const maxChunks = papers?.reduce((max, p) => Math.max(max, p.chunkCount), 0) ?? 0;

  const visible = useMemo(() => {
    if (!papers) return [];
    const q = filter.trim().toLowerCase();
    const list = q
      ? papers.filter((p) => p.paperId.toLowerCase().includes(q) || (p.title ?? '').toLowerCase().includes(q))
      : [...papers];
    list.sort((a, b) => compare(a, b, sort.key) * (sort.dir === 'asc' ? 1 : -1));
    return list;
  }, [papers, filter, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'paper' ? 'asc' : 'desc' }));

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Library</h1>
        <p className="page-lede">
          {papers
            ? papers.length === 0
              ? 'No papers yet.'
              : `${formatCount(papers.length)} papers, ${formatCount(totalChunks)} chunks in the vector store. Ask, Discover and Compare all search this collection.`
            : 'The papers LIBRAIN can search. Ask, Discover and Compare all draw their evidence from here.'}
        </p>
      </header>

      <div className={styles.layout}>
        <UploadPanel papers={papers} onIngested={() => void run()} />

        <section className={styles.listSection} aria-labelledby={`${uid}-h`}>
          <div className={styles.listHead}>
            <h2 id={`${uid}-h`} className={styles.panelTitle}>
              Papers
            </h2>
            {papers && papers.length > 0 ? (
              <div className={styles.filter}>
                <label htmlFor={`${uid}-f`} className="visually-hidden">
                  Filter papers by ID or title
                </label>
                <input
                  id={`${uid}-f`}
                  className="input"
                  type="search"
                  placeholder="Filter by ID or title"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          {state.status === 'loading' || state.status === 'idle' ? (
            <div aria-busy="true" aria-label="Loading papers">
              <SkeletonLines lines={8} />
            </div>
          ) : null}
          {state.status === 'error' ? <ErrorNotice error={state.error} onRetry={() => void run()} /> : null}

          {papers && papers.length === 0 ? (
            <EmptyState title="The library is empty">
              <p>Upload a PDF to start. Every paper you add becomes searchable from Ask, Discover and Compare.</p>
            </EmptyState>
          ) : null}

          {papers && papers.length > 0 && visible.length === 0 ? (
            <EmptyState
              title={`No papers match “${filter.trim()}”`}
              action={
                <button type="button" className="btn" onClick={() => setFilter('')}>
                  Clear filter
                </button>
              }
            />
          ) : null}

          {visible.length > 0 ? (
            <table className={styles.table}>
              <caption className="visually-hidden">
                Papers in the library{filter.trim() ? `, filtered by “${filter.trim()}”` : ''}
              </caption>
              <thead>
                <tr>
                  <SortHeader label="Paper" sortKey="paper" sort={sort} onSort={onSort} />
                  <SortHeader label="Chunks" sortKey="chunkCount" sort={sort} onSort={onSort} className={styles.numCol} />
                  <SortHeader label="Added" sortKey="firstIngestedAt" sort={sort} onSort={onSort} className={styles.dateCol} />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const title = displayTitle(p);
                  return (
                    <tr key={p.paperId}>
                      <td>
                        {title ? <span className={styles.title}>{title}</span> : null}
                        <code className={title ? styles.id : styles.idOnly}>{p.paperId}</code>
                      </td>
                      <td className={styles.numCol}>
                        <span className="num">{formatCount(p.chunkCount)}</span>
                        <span className={styles.chunkBar} aria-hidden="true">
                          <span style={{ width: `${maxChunks ? (p.chunkCount / maxChunks) * 100 : 0}%` }} />
                        </span>
                      </td>
                      <td className={styles.dateCol}>{formatDate(p.firstIngestedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
          {papers && papers.length > 0 ? (
            <p className={styles.footnote}>Authors and year are stored with each chunk but the API does not return them yet.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
