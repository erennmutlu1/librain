import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AskResult } from '../components/AskResult';
import { BaselineResult } from '../components/BaselineResult';
import { CompareView, SystemsExplainer } from '../components/CompareView';
import { DiscoverResult } from '../components/DiscoverResult';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorNotice, SkeletonLines } from '../components/States';
import { useRunStore } from '../history/context';
import { runToMarkdown, runsToJson } from '../history/exporters';
import { RUN_KIND_LABEL, type RunDetail } from '../history/types';
import { compareStates } from '../lib/compare';
import { downloadText, slugify } from '../lib/download';
import { formatDateTime, formatScore } from '../lib/format';
import styles from './HistoryDetailPage.module.css';

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error'; error: unknown } | { status: 'ready'; run: RunDetail };

function RunBody({ run }: { run: RunDetail }) {
  switch (run.kind) {
    case 'query':
      return <AskResult request={run.request} result={run.response} />;
    case 'discover':
      return <DiscoverResult request={run.request} result={run.response} />;
    case 'compare':
      return (
        <div className={styles.compare}>
          <h2 className={styles.compareTitle}>{run.title}</h2>
          <SystemsExplainer />
          <CompareView {...compareStates(run.response)} />
        </div>
      );
    case 'naive-rag':
      return <BaselineResult kind="naive-rag" topicA={run.request.topicA} topicB={run.request.topicB} response={run.response} />;
    case 'single-llm':
      return <BaselineResult kind="single-llm" topicA={run.request.topicA} topicB={run.request.topicB} response={run.response} />;
  }
}

export default function HistoryDetailPage() {
  const { id = '' } = useParams();
  const store = useRunStore();
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    const fetchRun = () =>
      store.get(id).then(
        (run) => live && setLoad(run ? { status: 'ready', run } : { status: 'missing' }),
        (error: unknown) => live && setLoad({ status: 'error', error }),
      );
    void fetchRun();
    const unsubscribe = store.location === 'browser' ? store.subscribe(() => void fetchRun()) : () => undefined;
    return () => {
      live = false;
      unsubscribe();
    };
  }, [id, store]);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  const back = (
    <Link to="/history" className={styles.back}>
      <Icon name="back" size={14} /> All runs
    </Link>
  );

  if (load.status === 'loading') {
    return (
      <div className="page">
        {back}
        <SkeletonLines lines={6} />
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className="page">
        {back}
        <h1 className="page-title">Run {id}</h1>
        <div className={styles.spaced}>
          <ErrorNotice error={load.error} />
        </div>
      </div>
    );
  }

  if (load.status === 'missing') {
    return (
      <div className="page">
        {back}
        <h1 className="visually-hidden">Run not found</h1>
        <EmptyState
          title="This run is not in the history"
          action={
            <Link to="/history" className="btn">
              Back to history
            </Link>
          }
        >
          <p>It may have been deleted{store.location === 'browser' ? ', or saved in a different browser' : ''}.</p>
        </EmptyState>
      </div>
    );
  }

  const run = load.run;
  const base = `librain-${run.kind}-${slugify(run.title)}`;

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await store.remove(run.id);
      navigate('/history');
    } catch (e) {
      setDeleteError(e);
      setDeleting(false);
    }
  };

  return (
    <div className="page">
      {back}
      <header className={styles.header}>
        <p className={styles.meta}>
          <span className={styles.kind}>{RUN_KIND_LABEL[run.kind]}</span>
          <time dateTime={run.createdAt}>{formatDateTime(run.createdAt)}</time>
          {run.quality !== null ? <span>Quality {formatScore(run.quality)}</span> : null}
          {run.mock ? <span className="tag">mock data</span> : null}
        </p>
        <div className={styles.actions}>
          <button type="button" className="btn btn-sm" onClick={() => downloadText(`${base}.json`, runsToJson([run]), 'application/json')}>
            <Icon name="download" size={14} /> JSON
          </button>
          <button type="button" className="btn btn-sm" onClick={() => downloadText(`${base}.md`, runToMarkdown(run), 'text/markdown')}>
            <Icon name="download" size={14} /> Markdown
          </button>
          {confirming ? null : (
            <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => setConfirming(true)}>
              <Icon name="trash" size={14} /> Delete
            </button>
          )}
        </div>
      </header>
      {confirming ? (
        <div className={styles.confirm} role="group" aria-label="Delete this run" onKeyDown={(e) => e.key === 'Escape' && !deleting && setConfirming(false)}>
          <p>
            Delete this run from the {store.location === 'server' ? "API's run database" : 'history in this browser'}?
            This cannot be undone.
          </p>
          <div className="cluster">
            <button type="button" className="btn btn-sm btn-danger-solid" onClick={() => void remove()} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete run'}
            </button>
            <button ref={keepRef} type="button" className="btn btn-sm" onClick={() => setConfirming(false)} disabled={deleting}>
              Keep
            </button>
          </div>
          {deleteError ? <ErrorNotice error={deleteError} /> : null}
        </div>
      ) : null}
      <h1 className="visually-hidden">
        {RUN_KIND_LABEL[run.kind]} run: {run.title}
      </h1>
      <RunBody run={run} />
    </div>
  );
}
