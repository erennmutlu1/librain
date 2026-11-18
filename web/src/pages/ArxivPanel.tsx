import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useApi } from '../api/context';
import { isAbortError } from '../api/errors';
import type { IngestResult } from '../api/types';
import { RequestId } from '../components/TechDetails';
import { Icon } from '../components/Icon';
import { ErrorNotice } from '../components/States';
import { useLang, useT } from '../i18n/lang';
import { normalizeArxivId } from '../lib/arxiv';
import { formatCount } from '../lib/format';
import { text } from './ArxivPanel.i18n';
import styles from './LibraryPage.module.css';

type State = { phase: 'idle' } | { phase: 'working'; id: string; startedAt: number } | { phase: 'done'; result: IngestResult } | { phase: 'error'; error: unknown };

function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [since]);
  return since === null ? 0 : Math.max(0, now - since);
}

/** Ingest by arXiv id: POST /api/papers/arxiv. The id is checked here with the API's own rules first. */
export function ArxivPanel({ existing, onIngested }: { existing: (id: string) => boolean; onIngested: () => void }) {
  const api = useApi();
  const uid = useId();
  const t = useT(text);
  const { lang } = useLang();
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<State>({ phase: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const elapsed = useElapsed(state.phase === 'working' ? state.startedAt : null);

  const id = normalizeArxivId(value);
  const invalid = touched && value.trim() !== '' && id === null;
  const busy = state.phase === 'working';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!id || busy) return;
    controller.current = new AbortController();
    setState({ phase: 'working', id, startedAt: Date.now() });
    try {
      const result = await api.ingestArxiv(value.trim(), controller.current.signal);
      setState({ phase: 'done', result });
      setValue('');
      setTouched(false);
      onIngested();
    } catch (error) {
      setState(isAbortError(error) ? { phase: 'idle' } : { phase: 'error', error });
    }
  };

  const hint = invalid ? t.invalid : id ? t.willIngest(id, existing(id)) : t.example;

  return (
    <form className={styles.arxiv} onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className={styles.subTitle}>
        {t.heading}
      </h3>
      <div className="field">
        <label className="field-label" htmlFor={`${uid}-id`}>
          {t.label}
        </label>
        <div className={styles.arxivRow}>
          <input
            id={`${uid}-id`}
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="2005.11401"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            aria-invalid={invalid || undefined}
            aria-describedby={`${uid}-hint`}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !id}>
            {busy ? t.ingesting : t.ingest}
          </button>
        </div>
        <p id={`${uid}-hint`} className={invalid ? styles.problem : 'field-hint'}>
          {hint}
        </p>
        {api.mode === 'mock' ? (
          <p className="field-hint">{t.mockNote}</p>
        ) : null}
      </div>

      {state.phase === 'working' ? (
        <div className={styles.progress} role="status">
          <div className={styles.progressHead}>
            <span>
              {t.fetching(state.id)} <span className="num muted">{t.seconds(formatCount(Math.round(elapsed / 1000), lang))}</span>
            </span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => controller.current?.abort()}>
              {t.cancel}
            </button>
          </div>
          <span className={styles.progressTrack} data-indeterminate aria-hidden="true">
            <span />
          </span>
        </div>
      ) : null}

      {state.phase === 'done' ? (
        <div className="notice notice-info" role="status">
          <Icon name="check" />
          <div className={styles.doneBody}>
            <p>
              <strong>{t.ingested(state.result.paperId)}</strong>
              {state.result.title && state.result.title !== state.result.paperId ? <>: {state.result.title}</> : null}
              {t.asChunks(formatCount(state.result.chunkCount, lang))}
            </p>
            <RequestId value={state.result.correlationId} />
          </div>
        </div>
      ) : null}
      {state.phase === 'error' ? <ErrorNotice error={state.error} /> : null}
    </form>
  );
}
