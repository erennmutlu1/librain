import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useApi } from '../api/context';
import { isAbortError } from '../api/errors';
import type { IngestResult, PaperSummary } from '../api/types';
import { CopyText } from '../components/CopyText';
import { Icon } from '../components/Icon';
import { ErrorNotice } from '../components/States';
import { useLang, useT } from '../i18n/lang';
import { formatBytes, formatCount, formatPercent } from '../lib/format';
import { ArxivPanel } from './ArxivPanel';
import { text } from './UploadPanel.i18n';
import styles from './LibraryPage.module.css';

const MAX_BYTES = 50_000_000; // matches the API's 50 MB upload cap
/** PaperEndpoints.SafePaperId: the file stem becomes the paper id. */
const SAFE_PAPER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'processing' }
  | { phase: 'done'; result: IngestResult }
  | { phase: 'error'; error: unknown };

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function UploadPanel({ papers, onIngested }: { papers: PaperSummary[] | null; onIngested: () => void }) {
  const api = useApi();
  const uid = useId();
  const t = useT(text);
  const { lang } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ phase: 'idle' });

  const problem = file
    ? !isPdf(file)
      ? t.notPdf
      : file.size === 0
        ? t.emptyFile
        : file.size > MAX_BYTES
          ? t.tooBig(formatBytes(file.size))
          : !SAFE_PAPER_ID.test(stem(file.name))
            ? t.badName
            : null
    : null;
  const existing = file && papers?.some((p) => p.paperId === stem(file.name));
  const busy = state.phase === 'uploading' || state.phase === 'processing';

  const choose = (f: File | null | undefined) => {
    if (!f) return;
    setFile(f);
    setState({ phase: 'idle' });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) choose(event.dataTransfer.files[0]);
  };

  const ingest = async () => {
    if (!file || problem) return;
    controller.current = new AbortController();
    setState({ phase: 'uploading', progress: 0 });
    try {
      const result = await api.ingestPaper(file, {
        signal: controller.current.signal,
        onProgress: (fraction) => setState(fraction >= 1 ? { phase: 'processing' } : { phase: 'uploading', progress: fraction }),
      });
      setState({ phase: 'done', result });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onIngested();
    } catch (error) {
      setState(isAbortError(error) ? { phase: 'idle' } : { phase: 'error', error });
    }
  };

  return (
    <section className={styles.upload} aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className={styles.panelTitle}>
        {t.addPaper}
      </h2>
      <h3 className={styles.subTitle}>{t.uploadPdf}</h3>

      <label
        className={styles.dropzone}
        data-dragging={dragging || undefined}
        data-disabled={busy || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          disabled={busy}
          onChange={(e: ChangeEvent<HTMLInputElement>) => choose(e.target.files?.[0])}
          aria-describedby={`${uid}-hint`}
        />
        <Icon name="upload" size={20} />
        <span className={styles.dropTitle}>{file ? file.name : t.dropTitle}</span>
        <span id={`${uid}-hint`} className={styles.dropHint}>
          {file ? t.willStore(formatBytes(file.size), stem(file.name)) : t.dropHint}
        </span>
      </label>

      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}
      {existing && !problem ? (
        <p className={styles.warn}>{t.existing(stem(file.name))}</p>
      ) : null}

      {state.phase === 'uploading' || state.phase === 'processing' ? (
        <div className={styles.progress} role="status" aria-live="polite">
          <div className={styles.progressHead}>
            <span>
              {state.phase === 'uploading' ? t.uploading(formatPercent(state.progress, lang)) : t.processing}
            </span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => controller.current?.abort()}>
              {t.cancel}
            </button>
          </div>
          <span
            className={styles.progressTrack}
            data-indeterminate={state.phase === 'processing' || undefined}
            aria-hidden="true"
          >
            <span style={{ width: state.phase === 'uploading' ? `${state.progress * 100}%` : undefined }} />
          </span>
        </div>
      ) : null}

      {state.phase === 'done' ? (
        <div className="notice notice-info" role="status">
          <Icon name="check" />
          <div className={styles.doneBody}>
            <p>
              <strong>{t.ingested(state.result.paperId)}</strong>
              {state.result.title && state.result.title !== state.result.paperId ? <> ({state.result.title})</> : null}
              {t.asChunks(formatCount(state.result.chunkCount, lang))}
            </p>
            <CopyText value={state.result.correlationId} label={t.correlationId} />
          </div>
        </div>
      ) : null}
      {state.phase === 'error' ? <ErrorNotice error={state.error} onRetry={ingest} /> : null}

      <div className={styles.uploadActions}>
        <button type="button" className="btn btn-primary" onClick={ingest} disabled={!file || !!problem || busy}>
          {busy ? t.ingesting : t.ingest}
        </button>
        {file && !busy ? (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            {t.clear}
          </button>
        ) : null}
      </div>

      <ArxivPanel existing={(id) => Boolean(papers?.some((p) => p.paperId === id))} onIngested={onIngested} />
    </section>
  );
}
