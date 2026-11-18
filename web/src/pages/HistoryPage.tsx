import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useApi } from '../api/context';
import { RUN_KINDS, type RunKind } from '../api/types';
import { DataTable, RowLink, type DataColumn } from '../components/DataTable';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorNotice, SkeletonLines } from '../components/States';
import { useRunStore, useRuns } from '../history/context';
import { runsToCsv, runsToJson, runsToMarkdown } from '../history/exporters';
import { kindText } from '../history/kinds.i18n';
import type { RunDetail, RunListItem } from '../history/types';
import { useLang, useT, type Lang } from '../i18n/lang';
import { downloadText, fileStamp } from '../lib/download';
import { formatCount, formatDateTime, formatRelative, formatScore } from '../lib/format';
import { PUBLIC_HISTORY_LIMIT } from '../public/browserHistory';
import { usePublicDemo } from '../public/context';
import { text } from './HistoryPage.i18n';
import pageStyles from './pages.module.css';
import styles from './HistoryPage.module.css';

type Filter = 'all' | RunKind;
type ExportFormat = 'csv' | 'json' | 'md';
type Text = (typeof text)['en'];

const runPath = (run: RunListItem) => `/history/${encodeURIComponent(run.id)}`;

/**
 * What the search box matches: the title (topics or question), the kind as the
 * table shows it (Ask, Sor, Discover, Keşfet…) and the id. Not the internal
 * kind name: "query" would make every Ask run match a search for that word.
 */
function runSearchText(run: RunListItem, kinds: Record<RunKind, string>): string {
  return `${run.title} ${kinds[run.kind]} ${run.id}`;
}

function runColumns(t: Text, kinds: Record<RunKind, string>, lang: Lang): DataColumn<RunListItem>[] {
  return [
    {
      id: 'kind',
      header: t.columns.kind,
      hideBelow: 'sm',
      width: '8.5rem',
      sortValue: (r) => kinds[r.kind],
      cell: (r) => (
        <span className={styles.kind} data-kind={r.kind}>
          {kinds[r.kind]}
        </span>
      ),
    },
    {
      id: 'run',
      header: t.columns.run,
      rowHeader: true,
      sortValue: (r) => r.title.toLowerCase(),
      cell: (r) => (
        <>
          <RowLink to={runPath(r)} className={styles.label}>
            {/* The kind leads the link's name, so a list of links still says what each run was. */}
            <span className="visually-hidden">{kinds[r.kind]}:</span> {r.title || t.untitled}
          </RowLink>
          {r.mock ? <span className={`tag ${styles.mockTag}`}>{t.mock}</span> : null}
          <span className={styles.narrowMeta}>
            <span className={styles.kind} data-kind={r.kind}>
              {kinds[r.kind]}
            </span>
            <time dateTime={r.createdAt}>{formatRelative(r.createdAt)}</time>
          </span>
        </>
      ),
    },
    {
      id: 'when',
      header: t.columns.when,
      hideBelow: 'sm',
      width: '9rem',
      firstDir: 'desc',
      className: styles.when,
      sortValue: (r) => Date.parse(r.createdAt),
      cell: (r) => (
        <time dateTime={r.createdAt} title={formatDateTime(r.createdAt)}>
          {formatRelative(r.createdAt)}
        </time>
      ),
    },
    {
      id: 'quality',
      header: t.columns.quality,
      numeric: true,
      width: '6rem',
      firstDir: 'desc',
      className: styles.quality,
      sortValue: (r) => r.quality,
      // No score (an Ask run): a muted mark for the eye, an empty cell for screen readers.
      cell: (r) =>
        r.quality === null || !Number.isFinite(r.quality) ? (
          <span className={styles.none} aria-hidden="true">
            –
          </span>
        ) : (
          formatScore(r.quality, 2, lang)
        ),
    },
  ];
}

export default function HistoryPage() {
  const api = useApi();
  const uid = useId();
  const t = useT(text);
  const kinds = useT(kindText);
  const { lang } = useLang();
  const navigate = useNavigate();
  const store = useRunStore();
  const demo = usePublicDemo();
  const [filter, setFilter] = useState<Filter>('all');
  const { runs, error, loading, status, refresh } = useRuns(filter === 'all' ? undefined : filter);
  /** The clear confirmation, with how many runs it deletes: every saved run, whatever the kind filter shows. */
  const [confirming, setConfirming] = useState<{ total: number | null } | null>(null);
  const [cleared, setCleared] = useState(false);
  const [busy, setBusy] = useState<null | 'seed' | ExportFormat>(null);
  const [exportError, setExportError] = useState<unknown>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  // Where focus goes once the clear controls have re-rendered.
  const focusNext = useRef<'keep' | 'clear' | null>(null);

  const columns = useMemo(() => runColumns(t, kinds, lang), [t, kinds, lang]);
  const searchText = useCallback((run: RunListItem) => runSearchText(run, kinds), [kinds]);
  const formatN = (n: number) => formatCount(n, lang);

  // Swapping Clear for Delete/Keep (and back) would otherwise drop focus to the page.
  useEffect(() => {
    const target = focusNext.current === 'keep' ? keepRef.current : focusNext.current === 'clear' ? clearRef.current : null;
    focusNext.current = null;
    target?.focus();
  }, [confirming]);

  const askToClear = async () => {
    setCleared(false);
    // The table may show one kind; clearing deletes every kind, so count them all.
    let total: number | null;
    try {
      total = (await store.list()).length;
    } catch {
      // No count rather than the shown kind's count, which would understate what goes.
      total = null;
    }
    focusNext.current = 'keep';
    setConfirming({ total });
  };

  const keep = () => {
    focusNext.current = 'clear';
    setConfirming(null);
  };

  const clearAll = async () => {
    await store.clear?.();
    setConfirming(null);
    setCleared(true);
    // The table (and the button that had focus) is gone; the page heading is the next sensible place.
    headingRef.current?.focus();
  };

  const seed = async () => {
    setBusy('seed');
    try {
      const { recordedRuns } = await import('../mocks/seed');
      for (const run of await recordedRuns(api)) await store.save(run);
    } finally {
      setBusy(null);
    }
  };

  /** Every saved run, whatever the kind filter shows. The list has summaries only, so this loads each full record. */
  const exportAll = async (format: ExportFormat) => {
    setBusy(format);
    setExportError(null);
    try {
      const all = await store.list();
      const details = (await Promise.all(all.map((r) => store.get(r.id)))).filter((r): r is RunDetail => r !== undefined);
      const name = `librain-runs-${fileStamp()}`;
      if (format === 'json') downloadText(`${name}.json`, runsToJson(details), 'application/json');
      else if (format === 'md') downloadText(`${name}.md`, runsToMarkdown(details, lang), 'text/markdown');
      // The byte-order mark makes Excel read the file as UTF-8 (Turkish letters, ×, curly quotes).
      else downloadText(`${name}.csv`, `\uFEFF${runsToCsv(details, lang)}`, 'text/csv');
    } catch (e) {
      setExportError(e);
    } finally {
      setBusy(null);
    }
  };

  const server = store.location === 'server';

  const kindSelect = (
    <div className={styles.kindFilter}>
      <label className="visually-hidden" htmlFor={`${uid}-kind`}>
        {t.show}
      </label>
      <select
        id={`${uid}-kind`}
        className={`input ${styles.select}`}
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value as Filter);
          setCleared(false);
        }}
      >
        <option value="all">{t.allRuns}</option>
        {RUN_KINDS.map((k) => (
          <option key={k} value={k}>
            {kinds[k]}
          </option>
        ))}
      </select>
    </div>
  );

  const exportButtons = (
    <>
      <div role="group" aria-label={t.exportAll} className={styles.exportGroup}>
        <span className={styles.exportLabel} aria-hidden="true">
          <Icon name="download" size={14} />
        </span>
        {(
          [
            ['csv', 'CSV'],
            ['json', 'JSON'],
            ['md', 'Markdown'],
          ] as const
        ).map(([format, label]) => (
          <button
            key={format}
            type="button"
            className="btn btn-sm"
            onClick={() => void exportAll(format)}
            disabled={busy !== null}
            title={t.exportAll}
          >
            {busy === format ? t.exporting : label}
          </button>
        ))}
      </div>
      {store.clear ? (
        confirming ? (
          <div
            role="group"
            aria-label={t.clear}
            className={styles.confirm}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                keep();
              }
            }}
          >
            <button type="button" className="btn btn-sm btn-danger-solid" onClick={() => void clearAll()}>
              {t.deleteAll(confirming.total, formatN(confirming.total ?? 0), filter !== 'all')}
            </button>
            <button ref={keepRef} type="button" className="btn btn-sm" onClick={keep}>
              {t.keep}
            </button>
          </div>
        ) : (
          <button ref={clearRef} type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => void askToClear()}>
            <Icon name="trash" size={14} /> {t.clear}
          </button>
        )
      ) : null}
    </>
  );

  return (
    <div className="page">
      <header className={`page-header ${pageStyles.hero}`}>
        <h1 ref={headingRef} className={`page-title ${styles.heading}`} tabIndex={-1}>
          {t.title}
        </h1>
        <p className="page-lede">{demo ? t.ledeDemo(PUBLIC_HISTORY_LIMIT) : server ? t.ledeServer : t.ledeBrowser}</p>
        {demo ? (
          <p className={styles.browserOnly}>
            <Icon name="info" size={14} /> {t.browserOnly}
          </p>
        ) : null}
      </header>

      {!status.persistent ? (
        <div className={`notice notice-warning ${styles.banner}`} role="status">
          <Icon name="warning" />
          <div>
            <strong>{t.notSaved}</strong> {status.problem ?? t.storageUnavailable} {t.notSavedBody}
          </div>
        </div>
      ) : null}

      {/* One polite region for the page's own news: loading, and the result of clearing. */}
      <p className="visually-hidden" role="status">
        {loading && !error ? t.loading : cleared && runs?.length === 0 ? t.cleared : ''}
      </p>

      {exportError ? <ErrorNotice error={exportError} /> : null}
      {error ? <ErrorNotice error={error} onRetry={refresh} /> : null}
      {runs === null && loading && !error ? <SkeletonLines lines={6} /> : null}

      {runs !== null && runs.length === 0 ? (
        <div className={styles.emptyWrap}>
          {filter !== 'all' ? <div className={styles.toolbar}>{kindSelect}</div> : null}
          <EmptyState
            title={filter === 'all' ? t.emptyAll : t.emptyKind(kinds[filter])}
            action={
              <>
                <Link className="btn btn-primary" to="/discover">
                  {t.runDiscovery}
                </Link>
                <Link className="btn" to="/ask">
                  {t.askQuestion}
                </Link>
                <Link className="btn" to="/explore">
                  {t.exploreRecorded}
                </Link>
                {api.mode === 'mock' && !demo && filter === 'all' ? (
                  <button type="button" className="btn" onClick={() => void seed()} disabled={busy === 'seed'}>
                    {busy === 'seed' ? t.loading : t.loadRecorded}
                  </button>
                ) : null}
              </>
            }
          >
            <p>{demo ? t.emptyDemo : server ? t.emptyServer : t.emptyBrowser}</p>
          </EmptyState>
        </div>
      ) : null}

      {runs !== null && runs.length > 0 ? (
        <DataTable
          rows={runs}
          columns={columns}
          rowKey={(r) => r.id}
          caption={t.caption}
          searchLabel={t.searchLabel}
          searchPlaceholder={t.searchPlaceholder}
          searchText={searchText}
          initialSort={{ column: 'when', dir: 'desc' }}
          countLabel={(shown, total) => t.count(shown, total, formatN)}
          filters={kindSelect}
          actions={exportButtons}
          onRowClick={(r) => void navigate(runPath(r))}
          busy={loading}
        />
      ) : null}
    </div>
  );
}
