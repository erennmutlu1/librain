import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useApi } from '../api/context';
import { isAbortError } from '../api/errors';
import type { IngestResult, PaperSummary } from '../api/types';
import { CopyText } from '../components/CopyText';
import { Icon } from '../components/Icon';
import { ErrorNotice } from '../components/States';
import { formatBytes } from '../lib/format';
import { ArxivPanel } from './ArxivPanel';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ phase: 'idle' });

  const problem = file
    ? !isPdf(file)
      ? 'This is not a PDF. LIBRAIN can only ingest PDF files.'
      : file.size === 0
        ? 'This file is empty.'
        : file.size > MAX_BYTES
          ? `This file is ${formatBytes(file.size)}; the API accepts up to 50 MB.`
          : !SAFE_PAPER_ID.test(stem(file.name))
            ? "The file name (without .pdf) becomes the paper ID, so it may only use letters, digits, '.', '_' or '-' (up to 128)."
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
        Add a paper
      </h2>
      <h3 className={styles.subTitle}>Upload a PDF</h3>

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
        <span className={styles.dropTitle}>{file ? file.name : 'Drop a PDF here or choose a file'}</span>
        <span id={`${uid}-hint`} className={styles.dropHint}>
          {file
            ? `${formatBytes(file.size)}. It will be stored as paper “${stem(file.name)}”.`
            : 'The file name, without .pdf, becomes the paper ID. Up to 50 MB.'}
        </span>
      </label>

      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}
      {existing && !problem ? (
        <p className={styles.warn}>
          A paper with the ID “{stem(file.name)}” is already in the library. Ingesting it again re-processes that ID.
        </p>
      ) : null}

      {state.phase === 'uploading' || state.phase === 'processing' ? (
        <div className={styles.progress} role="status" aria-live="polite">
          <div className={styles.progressHead}>
            <span>
              {state.phase === 'uploading'
                ? `Uploading ${Math.round(state.progress * 100)}%`
                : 'Extracting text, chunking and embedding…'}
            </span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => controller.current?.abort()}>
              Cancel
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
              <strong>Ingested “{state.result.paperId}”</strong>
              {state.result.title && state.result.title !== state.result.paperId ? <> ({state.result.title})</> : null} as{' '}
              {state.result.chunkCount} chunks. It is searchable now.
            </p>
            <CopyText value={state.result.correlationId} label="Correlation ID" />
          </div>
        </div>
      ) : null}
      {state.phase === 'error' ? <ErrorNotice error={state.error} onRetry={ingest} /> : null}

      <div className={styles.uploadActions}>
        <button type="button" className="btn btn-primary" onClick={ingest} disabled={!file || !!problem || busy}>
          {busy ? 'Ingesting…' : 'Ingest PDF'}
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
            Clear
          </button>
        ) : null}
      </div>

      <ArxivPanel existing={(id) => Boolean(papers?.some((p) => p.paperId === id))} onIngested={onIngested} />
    </section>
  );
}
