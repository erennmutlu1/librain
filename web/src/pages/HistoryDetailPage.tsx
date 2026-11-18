import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AskResult } from '../components/AskResult';
import { BaselineResult } from '../components/BaselineResult';
import { CompareView, SystemsExplainer } from '../components/CompareView';
import { DiscoverResult } from '../components/DiscoverResult';
import { Icon } from '../components/Icon';
import { ExportButtons } from '../components/ExportButtons';
import { EmptyState, ErrorNotice, SkeletonLines } from '../components/States';
import { useRunStore } from '../history/context';
import { runToMarkdown, runsToJson } from '../history/exporters';
import type { RunDetail } from '../history/types';
import { useLang, useT } from '../i18n/lang';
import { compareStates } from '../lib/compare';
import { downloadText, slugify } from '../lib/download';
import { discoveryToMarkdown } from '../lib/exportDiscovery';
import { formatDateTime, formatScore } from '../lib/format';
import { discoverPath } from '../lib/remix';
import { text } from './HistoryDetailPage.i18n';
import styles from './HistoryDetailPage.module.css';

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error'; error: unknown } | { status: 'ready'; run: RunDetail };

function RunBody({ run }: { run: RunDetail }) {
  switch (run.kind) {
    case 'query':
      return <AskResult request={run.request} result={run.response} />;
    case 'discover':
      // The page header has the downloads.
      return <DiscoverResult request={run.request} result={run.response} exportable={false} />;
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

/** Discover prefilled with a run's topics, for the kinds that have them. */
function remixPath(run: RunDetail): string | null {
  switch (run.kind) {
    case 'discover':
    case 'naive-rag':
      return discoverPath(run.request);
    case 'compare':
      return discoverPath({ ...run.request, topK: run.request.topK ?? run.response.topK });
    case 'single-llm':
      return discoverPath({ topicA: run.request.topicA, topicB: run.request.topicB ?? null });
    case 'query':
      return null;
  }
}

export default function HistoryDetailPage() {
  const t = useT(text);
  const { lang } = useLang();
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
      <Icon name="back" size={14} /> {t.back}
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
        <h1 className="page-title">{t.run(id)}</h1>
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
        <h1 className="visually-hidden">{t.notFound}</h1>
        <EmptyState
          title={t.notInHistory}
          action={
            <Link to="/history" className="btn">
              {t.backToHistory}
            </Link>
          }
        >
          <p>{store.location === 'browser' ? t.maybeDeletedBrowser : t.maybeDeleted}</p>
        </EmptyState>
      </div>
    );
  }

  const run = load.run;
  const base = `librain-${run.kind}-${slugify(run.title)}`;
  const remix = remixPath(run);
  const markdown = () =>
    run.kind === 'discover'
      ? discoveryToMarkdown({ request: run.request, response: run.response }, lang)
      : runToMarkdown(run);

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
          <span className={styles.kind}>{t.kind[run.kind]}</span>
          <time dateTime={run.createdAt}>{formatDateTime(run.createdAt)}</time>
          {run.quality !== null ? <span>{t.quality(formatScore(run.quality, 2, lang))}</span> : null}
          {run.mock ? <span className="tag">{t.mock}</span> : null}
        </p>
        <div className={styles.actions}>
          {remix ? (
            <Link to={remix} className="btn btn-sm" title={t.remixHint}>
              <Icon name="shuffle" size={14} /> {t.remix}
            </Link>
          ) : null}
          <ExportButtons
            onMarkdown={() => downloadText(`${base}.md`, markdown(), 'text/markdown')}
            onJson={() => downloadText(`${base}.json`, runsToJson([run]), 'application/json')}
          />
          {confirming ? null : (
            <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => setConfirming(true)}>
              <Icon name="trash" size={14} /> {t.delete}
            </button>
          )}
        </div>
      </header>
      {confirming ? (
        <div className={styles.confirm} role="group" aria-label={t.deleteGroup} onKeyDown={(e) => e.key === 'Escape' && !deleting && setConfirming(false)}>
          <p>{store.location === 'server' ? t.confirmServer : t.confirmBrowser}</p>
          <div className="cluster">
            <button type="button" className="btn btn-sm btn-danger-solid" onClick={() => void remove()} disabled={deleting}>
              {deleting ? t.deleting : t.deleteRun}
            </button>
            <button ref={keepRef} type="button" className="btn btn-sm" onClick={() => setConfirming(false)} disabled={deleting}>
              {t.keep}
            </button>
          </div>
          {deleteError ? <ErrorNotice error={deleteError} /> : null}
        </div>
      ) : null}
      <h1 className="visually-hidden">{t.heading(t.kind[run.kind], run.title)}</h1>
      <RunBody run={run} />
    </div>
  );
}
