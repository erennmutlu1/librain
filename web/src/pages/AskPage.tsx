import { useCallback, useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useApi } from '../api/context';
import { MAX_QUERY_CHARS, type MockScenario, type QueryRequest, type QueryResponse } from '../api/types';
import { AskResult } from '../components/AskResult';
import { MockProvenance, RecordedRuns } from '../components/FormBits';
import { ProgressStepper } from '../components/ProgressStepper';
import { EmptyState, ErrorNotice } from '../components/States';
import { useRecordRun } from '../history/context';
import { useSessionState } from '../lib/sessionStore';
import { QUERY_STAGES } from '../lib/stages';
import { useRequest, type RequestFn } from '../lib/useRequest';
import styles from './pages.module.css';

interface AskForm {
  query: string;
  topK: string;
}

interface AskRunData {
  request: QueryRequest;
  result: QueryResponse;
}

function toRequest(form: AskForm): QueryRequest | string {
  const query = form.query.trim();
  if (!query) return 'Type a question first.';
  if (query.length > MAX_QUERY_CHARS) return `Questions can be at most ${MAX_QUERY_CHARS} characters.`;
  const topK = Number(form.topK);
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) return 'Passages to retrieve must be a whole number from 1 to 20.';
  return { query, topK };
}

export default function AskPage() {
  const api = useApi();
  const uid = useId();
  const record = useRecordRun();
  const [form, setForm] = useSessionState<AskForm>('ask.form', { query: '', topK: '5' });
  const [formError, setFormError] = useState<string | null>(null);

  const ask = useCallback<RequestFn<QueryRequest, AskRunData>>(
    async (request, signal, onProgress) => {
      const result = await api.queryStream(request, onProgress, signal);
      record({
        id: result.correlationId,
        kind: 'query',
        title: request.query,
        createdAt: new Date().toISOString(),
        quality: result.evaluation?.qualityScore ?? null,
        mock: api.mode === 'mock',
        request,
        response: result,
      });
      return { request, result };
    },
    [api, record],
  );
  const { state, run, cancel } = useRequest<QueryRequest, AskRunData>('ask.run', ask);
  const loading = state.status === 'loading';

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const request = toRequest(form);
    if (typeof request === 'string') {
      setFormError(request);
      return;
    }
    setFormError(null);
    void run(request);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !loading) submit();
  };

  const pick = (scenario: MockScenario<QueryRequest>) => {
    setForm({ query: scenario.request.query, topK: String(scenario.request.topK ?? 5) });
    setFormError(null);
    void run(scenario.request);
  };

  const remaining = MAX_QUERY_CHARS - form.query.length;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Ask</h1>
        <p className="page-lede">
          Ask a question about the library. LIBRAIN answers only from the passages it retrieves, cites them by number,
          and an evaluator scores how well the answer holds up.
        </p>
      </header>

      <form className={styles.queryBar} onSubmit={submit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-q`}>
            Question
          </label>
          <textarea
            id={`${uid}-q`}
            className="input"
            rows={3}
            value={form.query}
            maxLength={MAX_QUERY_CHARS}
            onChange={(e) => setForm((f) => ({ ...f, query: e.target.value }))}
            onKeyDown={onKeyDown}
            placeholder="How does retrieval-augmented generation mitigate hallucination?"
            aria-invalid={formError ? true : undefined}
            aria-describedby={formError ? `${uid}-err` : `${uid}-kbd`}
          />
          {remaining < 200 ? (
            <span className="field-hint" aria-live="polite">
              {remaining} characters left
            </span>
          ) : null}
        </div>
        <div className={styles.actions}>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-k`}>
              Passages to retrieve
            </label>
            <input
              id={`${uid}-k`}
              className={`input num ${styles.small}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={form.topK}
              onChange={(e) => setForm((f) => ({ ...f, topK: e.target.value }))}
            />
          </div>
          <div className="cluster">
            <span id={`${uid}-kbd`} className={styles.kbd}>
              Ctrl or ⌘ + Enter to ask
            </span>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Asking…' : 'Ask'}
            </button>
          </div>
        </div>
        {formError ? (
          <p id={`${uid}-err`} className={styles.formError} role="alert">
            {formError}
          </p>
        ) : null}
        <RecordedRuns scenarios={api.mock?.ask} onPick={pick} disabled={loading} />
      </form>

      <div className={styles.result}>
        {state.status === 'idle' ? (
          <EmptyState title="Nothing asked yet">
            <p>
              Answers come back with numbered source chips. Select one to read the cited passage and see which paper,
              section and page it comes from. The evaluator's scores, critique and any unsupported claims sit beside the
              answer.
            </p>
          </EmptyState>
        ) : null}
        {state.status === 'loading' ? (
          <ProgressStepper
            title="Answering"
            stages={QUERY_STAGES}
            events={state.progress}
            startedAt={state.startedAt}
            onCancel={cancel}
            expectation="Usually about 15 s."
          />
        ) : null}
        {state.status === 'error' ? <ErrorNotice error={state.error} onRetry={() => submit()} /> : null}
        {state.status === 'success' ? (
          <>
            {api.mock ? <MockProvenance match={api.mock.matchAsk(state.data.request)} /> : null}
            <AskResult request={state.data.request} result={state.data.result} />
          </>
        ) : null}
      </div>
    </div>
  );
}
