import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/context';
import { Segmented } from '../components/FormBits';
import { Icon } from '../components/Icon';
import { EmptyState, SkeletonLines } from '../components/States';
import { useRunStore, useRuns } from '../history/context';
import { runsToJson, runsToMarkdown } from '../history/exporters';
import { newRunId } from '../history/runStore';
import { RUN_KIND_LABEL, type RunKind, type RunRecord } from '../history/types';
import { downloadText } from '../lib/download';
import { formatDateTime, formatRelative, formatScore, topicLabel } from '../lib/format';
import styles from './HistoryPage.module.css';

type Filter = 'all' | RunKind;

function stamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

/** Mock mode: replays every recorded run through the mock client and saves them. */
function useSeedFromRecordings() {
  const api = useApi();
  const store = useRunStore();
  const [busy, setBusy] = useState(false);
  const seed = async () => {
    const mock = api.mock;
    if (!mock) return;
    setBusy(true);
    const base = Date.now();
    const at = (offset: number) => new Date(base - offset * 60_000).toISOString();
    const runs: RunRecord[] = [];
    try {
      let offset = 0;
      for (const s of mock.discover) {
        const result = await api.discover(s.request);
        runs.push({ id: newRunId(), kind: 'discover', createdAt: at(++offset * 7), mock: true, label: topicLabel(s.request.topicA, s.request.topicB), quality: result.evaluation?.qualityScore ?? null, request: s.request, result });
      }
      for (const s of mock.ask) {
        const result = await api.query(s.request);
        runs.push({ id: newRunId(), kind: 'ask', createdAt: at(++offset * 7), mock: true, label: s.request.query, quality: result.evaluation?.qualityScore ?? null, request: s.request, result });
      }
      for (const s of mock.compare) {
        const r = s.request;
        const pair = r.topicB ? { topicA: r.topicA, topicB: r.topicB } : { topicA: r.topicA };
        const [librain, naiveRag, singleLlm] = await Promise.all([
          api.discover({ ...pair, topK: r.topK, provider: r.provider }),
          api.naiveRag({ ...pair, topK: r.topK, citationMode: r.citationMode }),
          api.singleLlm(pair),
        ]);
        runs.push({
          id: newRunId(),
          kind: 'compare',
          createdAt: at(++offset * 7),
          mock: true,
          label: topicLabel(r.topicA, r.topicB),
          quality: librain.evaluation?.qualityScore ?? null,
          request: r,
          result: { librain: { ok: true, value: librain }, naiveRag: { ok: true, value: naiveRag }, singleLlm: { ok: true, value: singleLlm } },
        });
      }
      for (const run of runs) await store.save(run);
    } finally {
      setBusy(false);
    }
  };
  return { seed, busy, available: Boolean(api.mock) };
}

export function HistoryPage() {
  const store = useRunStore();
  const { runs, status } = useRuns();
  const [filter, setFilter] = useState<Filter>('all');
  const [confirming, setConfirming] = useState(false);
  const { seed, busy, available } = useSeedFromRecordings();

  const visible = useMemo(() => (runs ?? []).filter((r) => filter === 'all' || r.kind === filter), [runs, filter]);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">History</h1>
        <p className="page-lede">
          Every run made in this browser, newest first (the last 100 are kept). Open one to see it again, or export
          them as JSON or Markdown.
        </p>
      </header>

      {!status.persistent ? (
        <div className="notice notice-warning" role="status" style={{ marginBottom: 'var(--s5)' }}>
          <Icon name="warning" />
          <div>
            <strong>Runs are not being saved.</strong> {status.problem ?? 'Browser storage is unavailable.'} History
            works for this tab only and is lost when it closes. Export anything you want to keep.
          </div>
        </div>
      ) : null}

      {runs === null ? <SkeletonLines lines={6} /> : null}

      {runs !== null && runs.length === 0 ? (
        <EmptyState
          title="No runs yet"
          action={
            <>
              <Link className="btn btn-primary" to="/discover">
                Run a discovery
              </Link>
              <Link className="btn" to="/ask">
                Ask a question
              </Link>
              {available ? (
                <button type="button" className="btn" onClick={() => void seed()} disabled={busy}>
                  {busy ? 'Loading…' : 'Load the recorded runs'}
                </button>
              ) : null}
            </>
          }
        >
          <p>Each Ask, Discover and Compare run is saved here automatically, with its full result.</p>
        </EmptyState>
      ) : null}

      {runs !== null && runs.length > 0 ? (
        <>
          <div className={styles.toolbar}>
            <Segmented<Filter>
              legend="Show"
              name="history-filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'ask', label: 'Ask' },
                { value: 'discover', label: 'Discover' },
                { value: 'compare', label: 'Compare' },
              ]}
            />
            <div className={styles.toolbarActions}>
              <button type="button" className="btn btn-sm" onClick={() => downloadText(`librain-runs-${stamp()}.json`, runsToJson(visible), 'application/json')}>
                <Icon name="download" size={14} /> JSON
              </button>
              <button type="button" className="btn btn-sm" onClick={() => downloadText(`librain-runs-${stamp()}.md`, runsToMarkdown(visible), 'text/markdown')}>
                <Icon name="download" size={14} /> Markdown
              </button>
              {confirming ? (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      void store.clear();
                      setConfirming(false);
                    }}
                  >
                    Delete all {runs.length}
                  </button>
                  <button type="button" className="btn btn-sm btn-quiet" onClick={() => setConfirming(false)}>
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => setConfirming(true)}>
                  <Icon name="trash" size={14} /> Clear history
                </button>
              )}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="muted" style={{ marginTop: 'var(--s5)' }}>
              No {RUN_KIND_LABEL[filter as RunKind]} runs yet.
            </p>
          ) : (
            <ol role="list" className={styles.list}>
              {visible.map((run) => (
                <li key={run.id}>
                  <Link to={`/history/${run.id}`} className={styles.row}>
                    <span className={styles.kind} data-kind={run.kind}>
                      {RUN_KIND_LABEL[run.kind]}
                    </span>
                    <span className={styles.label}>{run.label || 'Untitled run'}</span>
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
          )}
        </>
      ) : null}
    </div>
  );
}
