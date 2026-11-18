import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/context';
import { RUN_KINDS, type RunKind } from '../api/types';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorNotice, SkeletonLines } from '../components/States';
import { useRunStore, useRuns } from '../history/context';
import { runsToJson, runsToMarkdown } from '../history/exporters';
import { RUN_KIND_LABEL, type RunDetail } from '../history/types';
import { downloadText } from '../lib/download';
import { formatDateTime, formatRelative, formatScore } from '../lib/format';
import styles from './HistoryPage.module.css';

type Filter = 'all' | RunKind;

function stamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

export default function HistoryPage() {
  const api = useApi();
  const uid = useId();
  const store = useRunStore();
  const [filter, setFilter] = useState<Filter>('all');
  const { runs, error, loading, status, refresh } = useRuns(filter === 'all' ? undefined : filter);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | 'seed' | 'json' | 'md'>(null);
  const [exportError, setExportError] = useState<unknown>(null);

  const seed = async () => {
    setBusy('seed');
    try {
      const { recordedRuns } = await import('../mocks/seed');
      for (const run of await recordedRuns(api)) await store.save(run);
    } finally {
      setBusy(null);
    }
  };

  /** Exports need full records; the list only has summaries. */
  const exportAs = async (format: 'json' | 'md') => {
    if (!runs) return;
    setBusy(format);
    setExportError(null);
    try {
      const details = (await Promise.all(runs.map((r) => store.get(r.id)))).filter((r): r is RunDetail => r !== undefined);
      if (format === 'json') downloadText(`librain-runs-${stamp()}.json`, runsToJson(details), 'application/json');
      else downloadText(`librain-runs-${stamp()}.md`, runsToMarkdown(details), 'text/markdown');
    } catch (e) {
      setExportError(e);
    } finally {
      setBusy(null);
    }
  };

  const server = store.location === 'server';

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">History</h1>
        <p className="page-lede">
          {server
            ? 'Every successful run the API has made, newest first, from its run database. That includes runs started outside this page, such as the experiments CLI. A run’s id is its correlation ID.'
            : 'Mock mode keeps runs in this browser, newest first (the last 100). Open one to see it again, or export them as JSON or Markdown.'}
        </p>
      </header>

      {!status.persistent ? (
        <div className={`notice notice-warning ${styles.banner}`} role="status">
          <Icon name="warning" />
          <div>
            <strong>Runs are not being saved.</strong> {status.problem ?? 'Browser storage is unavailable.'} History
            works for this tab only and is lost when it closes. Export anything you want to keep.
          </div>
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-kind`}>
            Show
          </label>
          <select id={`${uid}-kind`} className={`input ${styles.select}`} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">All runs</option>
            {RUN_KINDS.map((k) => (
              <option key={k} value={k}>
                {RUN_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        {runs && runs.length > 0 ? (
          <div className={styles.toolbarActions}>
            <button type="button" className="btn btn-sm" onClick={() => void exportAs('json')} disabled={busy !== null}>
              <Icon name="download" size={14} /> {busy === 'json' ? 'Exporting…' : 'JSON'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => void exportAs('md')} disabled={busy !== null}>
              <Icon name="download" size={14} /> {busy === 'md' ? 'Exporting…' : 'Markdown'}
            </button>
            {store.clear ? (
              confirming ? (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger-solid"
                    onClick={() => {
                      void store.clear?.();
                      setConfirming(false);
                    }}
                  >
                    Delete all {runs.length}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => setConfirming(true)}>
                  <Icon name="trash" size={14} /> Clear history
                </button>
              )
            ) : null}
          </div>
        ) : null}
      </div>

      {exportError ? <ErrorNotice error={exportError} /> : null}
      {error ? <ErrorNotice error={error} onRetry={refresh} /> : null}
      {runs === null && loading && !error ? <SkeletonLines lines={6} /> : null}

      {runs !== null && runs.length === 0 ? (
        <div className={styles.emptyWrap}>
          <EmptyState
            title={filter === 'all' ? 'No runs yet' : `No ${RUN_KIND_LABEL[filter]} runs yet`}
            action={
              <>
                <Link className="btn btn-primary" to="/discover">
                  Run a discovery
                </Link>
                <Link className="btn" to="/ask">
                  Ask a question
                </Link>
                {api.mode === 'mock' && filter === 'all' ? (
                  <button type="button" className="btn" onClick={() => void seed()} disabled={busy === 'seed'}>
                    {busy === 'seed' ? 'Loading…' : 'Load the recorded runs'}
                  </button>
                ) : null}
              </>
            }
          >
            <p>
              {server
                ? 'The API saves each successful Ask, Discover and Compare run automatically, with its full result.'
                : 'Each Ask, Discover and Compare run is saved here automatically, with its full result.'}
            </p>
          </EmptyState>
        </div>
      ) : null}

      {runs !== null && runs.length > 0 ? (
        <ol role="list" className={styles.list} aria-busy={loading || undefined}>
          {runs.map((run) => (
            <li key={run.id}>
              <Link to={`/history/${encodeURIComponent(run.id)}`} className={styles.row}>
                <span className={styles.kind} data-kind={run.kind}>
                  {RUN_KIND_LABEL[run.kind]}
                </span>
                <span className={styles.label}>{run.title || 'Untitled run'}</span>
                <span className={styles.meta}>
                  <time dateTime={run.createdAt} title={formatDateTime(run.createdAt)}>
                    {formatRelative(run.createdAt)}
                  </time>
                  {run.mock ? <span className="tag">mock</span> : null}
                </span>
                <span className={styles.quality}>
                  <span className={styles.qualityLabel}>Quality</span>
                  <span className="num">{formatScore(run.quality)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
