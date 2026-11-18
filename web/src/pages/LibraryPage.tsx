import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApi } from '../api/context';
import type { PaperSummary } from '../api/types';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorNotice, SkeletonLines } from '../components/States';
import { formatAuthors, formatCount, formatDate } from '../lib/format';
import { displayTitle, usePapers } from '../lib/papers';
import { useSessionState } from '../lib/sessionStore';
import { usePublicDemo } from '../public/context';
import { UploadPanel } from './UploadPanel';
import pageStyles from './pages.module.css';
import styles from './LibraryPage.module.css';

type SortKey = 'paper' | 'authors' | 'year' | 'chunkCount' | 'firstIngestedAt';
interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

const COLUMNS = 6;

/** The corpus the public API serves (experiments/new-areas-discoveries/featured.json). */
export const PUBLIC_CORPUS_NOTE = 'The public corpus is read-only: 55 papers, 2,210 chunks.';

/** Missing values sort after present ones, whichever the direction of the column. */
function nullsLast<T>(x: T | null, y: T | null, cmp: (p: T, q: T) => number): number {
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return cmp(x, y);
}

const byText = (p: string, q: string) => p.localeCompare(q);

function compare(a: PaperSummary, b: PaperSummary, key: SortKey): number {
  switch (key) {
    case 'chunkCount':
      return a.chunkCount - b.chunkCount;
    case 'year':
      return nullsLast(a.year, b.year, (p, q) => p - q);
    case 'firstIngestedAt':
      return nullsLast(a.firstIngestedAt, b.firstIngestedAt, byText);
    case 'authors':
      return nullsLast(a.authors?.[0] ?? null, b.authors?.[0] ?? null, byText);
    case 'paper':
      return (displayTitle(a) ?? a.paperId).toLowerCase().localeCompare((displayTitle(b) ?? b.paperId).toLowerCase());
  }
}

function SortHeader({ label, sortKey, sort, onSort, className }: { label: string; sortKey: SortKey; sort: Sort; onSort: (key: SortKey) => void; className?: string | undefined }) {
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

/** The inline "delete this paper?" row under a paper. No browser dialogs. */
function ConfirmDelete({
  paper,
  onCancel,
  onDeleted,
}: {
  paper: PaperSummary;
  onCancel: () => void;
  onDeleted: (paperId: string) => void;
}) {
  const api = useApi();
  const keepRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => keepRef.current?.focus(), []);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deletePaper(paper.paperId);
      onDeleted(paper.paperId);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <tr className={styles.confirmRow}>
      <td colSpan={COLUMNS}>
        <div
          className={styles.confirm}
          role="group"
          aria-label={`Delete ${paper.paperId}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !busy) onCancel();
          }}
        >
          <p>
            Delete <strong>{displayTitle(paper) ?? paper.paperId}</strong> and its {formatCount(paper.chunkCount)} chunks from
            the vector store? Saved runs that cite it are kept.
          </p>
          <div className="cluster">
            <button type="button" className="btn btn-sm btn-danger-solid" onClick={remove} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete paper'}
            </button>
            <button ref={keepRef} type="button" className="btn btn-sm" onClick={onCancel} disabled={busy}>
              Keep
            </button>
          </div>
          {error ? <ErrorNotice error={error} /> : null}
        </div>
      </td>
    </tr>
  );
}

export default function LibraryPage() {
  const api = useApi();
  const uid = useId();
  const demo = usePublicDemo();
  // The public API refuses ingest and delete (403), so the public build does not offer them at all.
  const readOnly = demo !== null;
  const recordedOnly = demo?.mode === 'recorded';
  const { state, run } = usePapers();
  const [filter, setFilter] = useSessionState('library.filter', '');
  const [sort, setSort] = useState<Sort>({ key: 'paper', dir: 'asc' });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const statusRef = useRef<HTMLParagraphElement>(null);

  const papers = state.status === 'success' ? state.data : null;
  const totalChunks = papers?.reduce((sum, p) => sum + p.chunkCount, 0) ?? 0;
  const maxChunks = papers?.reduce((max, p) => Math.max(max, p.chunkCount), 0) ?? 0;

  const visible = useMemo(() => {
    if (!papers) return [];
    const q = filter.trim().toLowerCase();
    const list = q
      ? papers.filter(
          (p) =>
            p.paperId.toLowerCase().includes(q) ||
            (p.title ?? '').toLowerCase().includes(q) ||
            (p.authors ?? []).some((a) => a.toLowerCase().includes(q)),
        )
      : [...papers];
    list.sort((a, b) => compare(a, b, sort.key) * (sort.dir === 'asc' ? 1 : -1));
    return list;
  }, [papers, filter, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'paper' || key === 'authors' ? 'asc' : 'desc' }));

  const cancelDelete = (paperId: string) => {
    setConfirming(null);
    triggers.current.get(paperId)?.focus();
  };

  const onDeleted = (paperId: string) => {
    setConfirming(null);
    setDeleted(paperId);
    void run();
    requestAnimationFrame(() => statusRef.current?.focus());
  };

  return (
    <div className="page">
      <header className={`page-header ${pageStyles.hero}`}>
        <h1 className="page-title">Library</h1>
        <p className="page-lede">
          {papers
            ? papers.length === 0
              ? 'No papers yet.'
              : recordedOnly
                ? `The recorded runs cite ${formatCount(papers.length)} papers, some of them from the earlier, smaller corpora the runs were made on. Switch to Live to list today's corpus.`
                : `${formatCount(papers.length)} papers, ${formatCount(totalChunks)} chunks in the vector store. Ask, Discover and Compare all search this collection.`
            : 'The papers LIBRAIN can search. Ask, Discover and Compare all draw their evidence from here.'}
        </p>
      </header>

      {readOnly ? (
        <div className={`notice notice-info ${styles.readOnly}`}>
          <Icon name="info" />
          <p>{PUBLIC_CORPUS_NOTE}</p>
        </div>
      ) : null}

      <div className={readOnly ? undefined : styles.layout}>
        {readOnly ? null : <UploadPanel papers={papers} onIngested={() => void run()} />}

        <section className={styles.listSection} aria-labelledby={`${uid}-h`}>
          <div className={styles.listHead}>
            <h2 id={`${uid}-h`} className={styles.panelTitle}>
              Papers
            </h2>
            {papers && papers.length > 0 ? (
              <div className={styles.filter}>
                <label htmlFor={`${uid}-f`} className="visually-hidden">
                  Filter papers by ID, title or author
                </label>
                <input
                  id={`${uid}-f`}
                  className="input"
                  type="search"
                  placeholder="Filter by ID, title or author"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          {api.mode === 'mock' && papers && papers.length > 0 ? (
            <p className={styles.footnote}>
              {demo
                ? 'Recorded mode: every paper id the recorded runs cite. Titles are unknown for those, and chunk counts are lower bounds (highest cited chunk index plus one). Switch to Live to list the whole corpus.'
                : "Mock mode: the API snapshot's paper plus every paper id the recorded runs cite. Titles are unknown for those, and chunk counts are lower bounds (highest cited chunk index plus one)."}
            </p>
          ) : null}

          <p ref={statusRef} tabIndex={-1} className={styles.status} role="status">
            {deleted ? `Deleted ${deleted}.` : ''}
          </p>

          {state.status === 'loading' || state.status === 'idle' ? (
            <div aria-busy="true" aria-label="Loading papers">
              <SkeletonLines lines={8} />
            </div>
          ) : null}
          {state.status === 'error' ? <ErrorNotice error={state.error} onRetry={() => void run()} /> : null}

          {papers && papers.length === 0 ? (
            <EmptyState title="The library is empty">
              {readOnly ? null : (
                <p>Upload a PDF or ingest an arXiv paper to start. Every paper you add becomes searchable from Ask, Discover and Compare.</p>
              )}
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
                  <SortHeader label="Authors" sortKey="authors" sort={sort} onSort={onSort} className={styles.authorsCol} />
                  <SortHeader label="Year" sortKey="year" sort={sort} onSort={onSort} className={styles.yearCol} />
                  <SortHeader label="Chunks" sortKey="chunkCount" sort={sort} onSort={onSort} className={styles.numCol} />
                  <SortHeader label="Added" sortKey="firstIngestedAt" sort={sort} onSort={onSort} className={styles.dateCol} />
                  {readOnly ? null : (
                    <th scope="col" className={styles.actionCol}>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const title = displayTitle(p);
                  const authors = formatAuthors(p.authors);
                  const narrowMeta = [authors, p.year].filter(Boolean).join(', ');
                  return (
                    <Fragment key={p.paperId}>
                      <tr data-confirming={confirming === p.paperId || undefined}>
                        <td>
                          {title ? <span className={styles.title}>{title}</span> : null}
                          <code className={title ? styles.id : styles.idOnly}>{p.paperId}</code>
                          {narrowMeta ? <span className={styles.narrowMeta}>{narrowMeta}</span> : null}
                        </td>
                        <td className={styles.authorsCol}>
                          {authors ? <span title={p.authors?.join(', ')}>{authors}</span> : <span className="muted">—</span>}
                        </td>
                        <td className={`${styles.yearCol} num`}>{p.year ?? <span className="muted">—</span>}</td>
                        <td className={styles.numCol}>
                          <span className="num">{formatCount(p.chunkCount)}</span>
                          <span className={styles.chunkBar} aria-hidden="true">
                            <span style={{ width: `${maxChunks ? (p.chunkCount / maxChunks) * 100 : 0}%` }} />
                          </span>
                        </td>
                        <td className={styles.dateCol}>{formatDate(p.firstIngestedAt)}</td>
                        {readOnly ? null : (
                          <td className={styles.actionCol}>
                            <button
                              ref={(el) => {
                                if (el) triggers.current.set(p.paperId, el);
                                else triggers.current.delete(p.paperId);
                              }}
                              type="button"
                              className={styles.rowAction}
                              aria-expanded={confirming === p.paperId}
                              onClick={() => {
                                setDeleted(null);
                                setConfirming((c) => (c === p.paperId ? null : p.paperId));
                              }}
                            >
                              <Icon name="trash" size={15} />
                              <span className="visually-hidden">Delete {p.paperId}</span>
                            </button>
                          </td>
                        )}
                      </tr>
                      {!readOnly && confirming === p.paperId ? (
                        <ConfirmDelete paper={p} onCancel={() => cancelDelete(p.paperId)} onDeleted={onDeleted} />
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : null}
          {papers && papers.length > 0 && papers.every((p) => !p.authors && p.year === null) ? (
            <p className={styles.footnote}>
              Authors and year are filled in for papers ingested from arXiv; uploaded PDFs rarely carry them.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
