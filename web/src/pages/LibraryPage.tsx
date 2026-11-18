import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useApi } from '../api/context';
import type { PaperSummary } from '../api/types';
import { DataTable, type CsvColumn, type DataColumn } from '../components/DataTable';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorNotice, SkeletonLines } from '../components/States';
import { useLang, useT, type Lang } from '../i18n/lang';
import { normalizeArxivId } from '../lib/arxiv';
import { fileStamp } from '../lib/download';
import { formatAuthors, formatCount, formatDate } from '../lib/format';
import { fromEarlierLibrary, paperAuthors, paperExternalUrl, paperInfo, TODAYS_LIBRARY_SIZE } from '../lib/paperCatalog';
import { displayTitle, usePapers } from '../lib/papers';
import { useSessionState } from '../lib/sessionStore';
import { usePublicDemo } from '../public/context';
import { UploadPanel } from './UploadPanel';
import { text } from './LibraryPage.i18n';
import pageStyles from './pages.module.css';
import styles from './LibraryPage.module.css';

/** The library the public API serves (experiments/new-areas-discoveries/featured.json). English; the screen shows the reader's language. */
export const PUBLIC_CORPUS_NOTE = 'The public paper library is read-only: 55 papers, 2,210 passages.';

/** Values the backend fills in from empty PDF metadata: not a title, not an author. */
const PLACEHOLDER_TITLES = new Set(['Manuscript - Arxiv']);
const PLACEHOLDER_AUTHORS = new Set(['Anonymous Submission']);

/**
 * A paper as the API or the recordings list it, completed from the static
 * catalogue (src/lib/paperCatalog.ts): the catalogue's cleaned title, authors
 * and year win for the ids it knows; the API's own values fill the rest.
 * Recorded mode lists bare ids, so this is where their titles come from.
 */
function withCatalogue(p: PaperSummary): PaperSummary {
  const info = paperInfo(p.paperId);
  const ownTitle = displayTitle(p);
  const ownAuthors = p.authors?.filter((a) => a.trim() && !PLACEHOLDER_AUTHORS.has(a.trim())) ?? [];
  return {
    ...p,
    title: info.title ?? (ownTitle && !PLACEHOLDER_TITLES.has(ownTitle) ? ownTitle : null),
    authors: paperAuthors(p.paperId) ?? (ownAuthors.length > 0 ? ownAuthors : null),
    year: info.year ?? p.year,
  };
}

type Text = (typeof text)['en'];

/** What the search box matches: id, title and every author. */
function paperSearchText(p: PaperSummary): string {
  return [p.paperId, p.title ?? '', ...(p.authors ?? [])].join(' ');
}

/** An empty cell: a muted dash for the eye, nothing for screen readers (which would read "dash"). */
const EMPTY_CELL = (
  <span className={styles.none} aria-hidden="true">
    –
  </span>
);

/** The catalogue's arXiv link, else one for an arXiv-style id. */
function arxivUrl(paperId: string): string | null {
  const known = paperExternalUrl(paperId);
  if (known) return known;
  const id = normalizeArxivId(paperId);
  return id ? `https://arxiv.org/abs/${id}` : null;
}

/** The inline "delete this paper?" row under a paper. No browser dialogs. */
function ConfirmDelete({
  paper,
  columns,
  onCancel,
  onDeleted,
}: {
  paper: PaperSummary;
  columns: number;
  onCancel: () => void;
  onDeleted: (paperId: string) => void;
}) {
  const api = useApi();
  const t = useT(text);
  const { lang } = useLang();
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
      <td colSpan={columns}>
        <div
          className={styles.confirm}
          role="group"
          aria-label={t.deleteLabel(paper.paperId)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !busy) onCancel();
          }}
        >
          <p>
            {t.confirmBefore}
            <strong>{displayTitle(paper) ?? paper.paperId}</strong>
            {t.confirmAfter(formatCount(paper.chunkCount, lang))}
          </p>
          <div className="cluster">
            <button type="button" className="btn btn-sm btn-danger-solid" onClick={remove} disabled={busy}>
              {busy ? t.deleting : t.deletePaper}
            </button>
            <button ref={keepRef} type="button" className="btn btn-sm" onClick={onCancel} disabled={busy}>
              {t.keep}
            </button>
          </div>
          {error ? <ErrorNotice error={error} /> : null}
        </div>
      </td>
    </tr>
  );
}

function paperColumns(
  t: Text,
  lang: Lang,
  maxChunks: number,
  deleteButton: ((p: PaperSummary) => ReactNode) | null,
): DataColumn<PaperSummary>[] {
  const columns: DataColumn<PaperSummary>[] = [
    {
      id: 'paper',
      header: t.columns.paper,
      rowHeader: true,
      sortValue: (p) => (displayTitle(p) ?? p.paperId).toLowerCase(),
      cell: (p) => {
        const title = displayTitle(p);
        const narrowMeta = [formatAuthors(p.authors), p.year].filter(Boolean).join(', ');
        const arxiv = arxivUrl(p.paperId);
        return (
          <>
            {title ? <span className={styles.title}>{title}</span> : null}
            <span className={styles.idLine}>
              <code className={title ? styles.id : styles.idOnly}>{p.paperId}</code>
              {fromEarlierLibrary(p.paperId) ? (
                <span className="tag" title={t.earlierTitle}>
                  {t.earlier}
                </span>
              ) : null}
              {arxiv ? (
                <a className={styles.arxivLink} href={arxiv} target="_blank" rel="noopener noreferrer" aria-label={t.onArxiv(p.paperId)}>
                  arXiv <Icon name="external" size={11} />
                </a>
              ) : null}
            </span>
            {narrowMeta ? <span className={styles.narrowMeta}>{narrowMeta}</span> : null}
          </>
        );
      },
    },
    {
      id: 'authors',
      header: t.columns.authors,
      hideBelow: 'md',
      width: '12rem',
      className: styles.muted,
      sortValue: (p) => p.authors?.[0] ?? null,
      cell: (p) => {
        const authors = formatAuthors(p.authors);
        return authors ? <span title={p.authors?.join(', ')}>{authors}</span> : EMPTY_CELL;
      },
    },
    {
      id: 'year',
      header: t.columns.year,
      hideBelow: 'md',
      numeric: true,
      width: '4.5rem',
      className: styles.muted,
      firstDir: 'desc',
      sortValue: (p) => p.year,
      cell: (p) => (p.year === null ? EMPTY_CELL : String(p.year)),
    },
    {
      id: 'chunks',
      header: t.columns.chunks,
      numeric: true,
      width: '6.5rem',
      firstDir: 'desc',
      sortValue: (p) => p.chunkCount,
      cell: (p) => (
        <>
          <span>{formatCount(p.chunkCount, lang)}</span>
          <span className={styles.chunkBar} aria-hidden="true">
            <span style={{ width: `${maxChunks ? (p.chunkCount / maxChunks) * 100 : 0}%` }} />
          </span>
        </>
      ),
    },
    {
      id: 'added',
      header: t.columns.added,
      hideBelow: 'lg',
      width: '8rem',
      className: styles.date,
      firstDir: 'desc',
      sortValue: (p) => p.firstIngestedAt,
      cell: (p) => {
        // formatDate gives "—" for a missing or broken date; that is an empty cell too.
        const date = formatDate(p.firstIngestedAt);
        return date === '—' ? EMPTY_CELL : date;
      },
    },
  ];
  if (deleteButton) {
    columns.push({ id: 'actions', header: t.columns.actions, headerHidden: true, width: '3rem', className: styles.actionCol, cell: deleteButton });
  }
  return columns;
}

function paperCsv(t: Text): CsvColumn<PaperSummary>[] {
  return [
    { header: t.csv.paperId, value: (p) => p.paperId },
    { header: t.csv.title, value: (p) => displayTitle(p) },
    { header: t.csv.authors, value: (p) => p.authors?.join('; ') },
    { header: t.csv.year, value: (p) => p.year },
    { header: t.csv.chunks, value: (p) => p.chunkCount },
    { header: t.csv.added, value: (p) => p.firstIngestedAt },
    { header: t.csv.arxiv, value: (p) => arxivUrl(p.paperId) },
  ];
}

export default function LibraryPage() {
  const api = useApi();
  const uid = useId();
  const t = useT(text);
  const { lang } = useLang();
  const demo = usePublicDemo();
  // The public API refuses ingest and delete (403), so the public build does not offer them at all.
  const readOnly = demo !== null;
  const recordedOnly = demo?.mode === 'recorded';
  const { state, run } = usePapers();
  const [filter, setFilter] = useSessionState('library.filter', '');
  const [params, setParams] = useSearchParams();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const statusRef = useRef<HTMLParagraphElement>(null);

  /*
   * Citations elsewhere link to /library?q=<paper id>. The id fills the
   * search box and leaves the address, so a later visit keeps what the
   * visitor typed since.
   */
  useEffect(() => {
    const q = params.get('q');
    if (q === null) return;
    setFilter(q.trim());
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [params, setFilter, setParams]);

  const loaded = state.status === 'success' ? state.data : null;
  const papers = useMemo(() => loaded?.map(withCatalogue) ?? null, [loaded]);
  const olderIds = papers?.filter((p) => fromEarlierLibrary(p.paperId)).length ?? 0;
  const loading = state.status === 'loading' || state.status === 'idle';
  const totalChunks = papers?.reduce((sum, p) => sum + p.chunkCount, 0) ?? 0;
  const maxChunks = papers?.reduce((max, p) => Math.max(max, p.chunkCount), 0) ?? 0;

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

  const deleteButton = useCallback(
    (p: PaperSummary) => (
      <button
        ref={(el) => {
          if (el) triggers.current.set(p.paperId, el);
          else triggers.current.delete(p.paperId);
        }}
        type="button"
        className={styles.rowAction}
        // A visible tooltip for the icon; the visually hidden text below is its accessible name.
        title={t.deleteLabel(p.paperId)}
        aria-expanded={confirming === p.paperId}
        onClick={() => {
          setDeleted(null);
          setConfirming((c) => (c === p.paperId ? null : p.paperId));
        }}
      >
        <Icon name="trash" size={15} />
        <span className="visually-hidden">{t.deleteLabel(p.paperId)}</span>
      </button>
    ),
    [confirming, t],
  );

  const columns = useMemo(() => paperColumns(t, lang, maxChunks, readOnly ? null : deleteButton), [t, lang, maxChunks, readOnly, deleteButton]);
  const csvColumns = useMemo(() => paperCsv(t), [t]);
  const formatN = (n: number) => formatCount(n, lang);

  return (
    <div className="page">
      <header className={`page-header ${pageStyles.hero}`}>
        <h1 className="page-title">{t.title}</h1>
        <p className="page-lede">
          {papers
            ? papers.length === 0
              ? t.ledeEmpty
              : recordedOnly
                ? t.ledeRecorded(formatN(TODAYS_LIBRARY_SIZE), formatN(papers.length), formatN(papers.length - olderIds), formatN(olderIds))
                : t.ledeLive(formatN(papers.length), formatN(totalChunks))
            : t.ledeIdle}
        </p>
      </header>

      {readOnly ? (
        <div className={`notice notice-info ${styles.readOnly}`}>
          <Icon name="info" />
          <p>{t.corpusNote}</p>
        </div>
      ) : null}

      <div className={readOnly ? undefined : styles.layout}>
        {readOnly ? null : <UploadPanel papers={papers} onIngested={() => void run()} />}

        <section className={styles.listSection} aria-labelledby={`${uid}-h`}>
          <div className={styles.listHead}>
            <h2 id={`${uid}-h`} className={styles.panelTitle}>
              {t.papers}
            </h2>
          </div>

          {api.mode === 'mock' && papers && papers.length > 0 ? (
            <p className={styles.footnote}>{demo ? t.footnoteRecorded : t.footnoteMock}</p>
          ) : null}

          <p ref={statusRef} tabIndex={-1} className={styles.status} role="status">
            {deleted ? t.deleted(deleted) : ''}
          </p>

          {/* Always present, so the change to "Loading papers…" is announced. */}
          <p className="visually-hidden" role="status">
            {loading ? t.loading : ''}
          </p>
          {loading ? <SkeletonLines lines={8} /> : null}
          {state.status === 'error' ? <ErrorNotice error={state.error} onRetry={() => void run()} /> : null}

          {papers && papers.length === 0 ? (
            <EmptyState title={t.emptyTitle}>{readOnly ? null : <p>{t.emptyBody}</p>}</EmptyState>
          ) : null}

          {papers && papers.length > 0 ? (
            <DataTable
              rows={papers}
              columns={columns}
              rowKey={(p) => p.paperId}
              caption={t.caption}
              searchLabel={t.searchLabel}
              searchPlaceholder={t.searchPlaceholder}
              searchText={paperSearchText}
              query={filter}
              onQueryChange={setFilter}
              initialSort={{ column: 'paper', dir: 'asc' }}
              countLabel={(shown, total) => t.count(shown, total, formatN)}
              csv={{ filename: `librain-papers-${fileStamp()}.csv`, columns: csvColumns }}
              rowData={(p) => ({ 'data-confirming': confirming === p.paperId || undefined })}
              afterRow={(p, count) =>
                !readOnly && confirming === p.paperId ? (
                  <ConfirmDelete paper={p} columns={count} onCancel={() => cancelDelete(p.paperId)} onDeleted={onDeleted} />
                ) : null
              }
            />
          ) : null}
          {papers && papers.length > 0 && papers.every((p) => !p.authors && p.year === null) ? (
            <p className={styles.footnote}>{t.footnoteAuthors}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
