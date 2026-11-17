import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AskResult } from '../components/AskResult';
import { CompareView, SystemsExplainer, type SystemState } from '../components/CompareView';
import { DiscoverResult } from '../components/DiscoverResult';
import { Icon } from '../components/Icon';
import { EmptyState, SkeletonLines } from '../components/States';
import { useRunStore } from '../history/context';
import { runToMarkdown, runsToJson } from '../history/exporters';
import { RUN_KIND_LABEL, type Outcome, type RunRecord } from '../history/types';
import { downloadText, slugify } from '../lib/download';
import { formatDateTime } from '../lib/format';
import styles from './HistoryDetailPage.module.css';

function toState<T>(outcome: Outcome<T>): SystemState<T> {
  return outcome.ok ? { status: 'success', data: outcome.value } : { status: 'error', error: new Error(outcome.error) };
}

export function HistoryDetailPage() {
  const { id = '' } = useParams();
  const store = useRunStore();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunRecord | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const load = () => store.get(id).then((r) => live && setRun(r ?? null));
    void load();
    const unsubscribe = store.subscribe(() => void load());
    return () => {
      live = false;
      unsubscribe();
    };
  }, [id, store]);

  const back = (
    <Link to="/history" className={styles.back}>
      <Icon name="back" size={14} /> All runs
    </Link>
  );

  if (run === undefined) {
    return (
      <div className="page">
        {back}
        <SkeletonLines lines={6} />
      </div>
    );
  }

  if (run === null) {
    return (
      <div className="page">
        {back}
        <EmptyState
          title="This run is not in your history"
          action={
            <Link to="/history" className="btn">
              Back to history
            </Link>
          }
        >
          <p>It may have been deleted, or saved in a different browser.</p>
        </EmptyState>
      </div>
    );
  }

  const base = `librain-${run.kind}-${slugify(run.label)}`;

  return (
    <div className="page">
      {back}
      <header className={styles.header}>
        <p className={styles.meta}>
          <span className={styles.kind}>{RUN_KIND_LABEL[run.kind]}</span>
          <time dateTime={run.createdAt}>{formatDateTime(run.createdAt)}</time>
          {run.mock ? <span className="tag">mock data</span> : null}
        </p>
        <div className={styles.actions}>
          <button type="button" className="btn btn-sm" onClick={() => downloadText(`${base}.json`, runsToJson([run]), 'application/json')}>
            <Icon name="download" size={14} /> JSON
          </button>
          <button type="button" className="btn btn-sm" onClick={() => downloadText(`${base}.md`, runToMarkdown(run), 'text/markdown')}>
            <Icon name="download" size={14} /> Markdown
          </button>
          <button
            type="button"
            className="btn btn-sm btn-quiet btn-danger"
            onClick={() => {
              void store.remove(run.id).then(() => navigate('/history'));
            }}
          >
            <Icon name="trash" size={14} /> Delete
          </button>
        </div>
      </header>
      <h1 className="visually-hidden">
        {RUN_KIND_LABEL[run.kind]} run: {run.label}
      </h1>

      {run.kind === 'ask' ? <AskResult request={run.request} result={run.result} /> : null}
      {run.kind === 'discover' ? <DiscoverResult request={run.request} result={run.result} /> : null}
      {run.kind === 'compare' ? (
        <div className={styles.compare}>
          <h2 className={styles.compareTitle}>{run.label}</h2>
          <SystemsExplainer />
          <CompareView
            request={run.request}
            librain={toState(run.result.librain)}
            naiveRag={toState(run.result.naiveRag)}
            singleLlm={toState(run.result.singleLlm)}
          />
        </div>
      ) : null}
    </div>
  );
}
