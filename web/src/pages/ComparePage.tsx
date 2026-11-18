import { useCallback, useId, useState, type FormEvent } from 'react';
import { useApi } from '../api/context';
import { MAX_TOPIC_CHARS, type CompareRequest, type CompareResponse, type MockScenario } from '../api/types';
import { CompareView, SystemsExplainer } from '../components/CompareView';
import { MockProvenance, RecordedRuns } from '../components/FormBits';
import { CopyText } from '../components/CopyText';
import { EmptyState, ErrorNotice, RunningState } from '../components/States';
import { useRecordRun } from '../history/context';
import { ALL_LOADING, compareStates } from '../lib/compare';
import { formatDuration, topicLabel } from '../lib/format';
import { useSessionState } from '../lib/sessionStore';
import { useRequest, type RequestFn } from '../lib/useRequest';
import styles from './pages.module.css';

interface CompareForm {
  topicA: string;
  topicB: string;
  topK: string;
}

interface CompareRunData {
  request: CompareRequest;
  result: CompareResponse;
}

function toRequest(form: CompareForm): CompareRequest | string {
  const topicA = form.topicA.trim();
  const topicB = form.topicB.trim();
  if (!topicA) return 'Enter at least Topic A.';
  if (topicA.length > MAX_TOPIC_CHARS || topicB.length > MAX_TOPIC_CHARS) return `Topics can be at most ${MAX_TOPIC_CHARS} characters.`;
  if (topicB && topicA === topicB) return 'Topic B must differ from Topic A.';
  const topK = Number(form.topK);
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) return 'Passages per topic must be a whole number from 1 to 20.';
  return topicB ? { topicA, topicB, topK } : { topicA, topK };
}

export default function ComparePage() {
  const api = useApi();
  const uid = useId();
  const record = useRecordRun();
  const [form, setForm] = useSessionState<CompareForm>('compare.form', { topicA: '', topicB: '', topK: '5' });
  const [formError, setFormError] = useState<string | null>(null);

  // One call: the API runs the three systems concurrently and returns them together.
  const compare = useCallback<RequestFn<CompareRequest, CompareRunData>>(
    async (request, signal) => {
      const result = await api.compare(request, signal);
      record({
        id: result.correlationId,
        kind: 'compare',
        title: topicLabel(result.topicA || request.topicA, result.topicB ?? request.topicB),
        createdAt: new Date().toISOString(),
        quality: result.librain.result?.evaluation?.qualityScore ?? null,
        mock: api.mode === 'mock',
        request,
        response: result,
      });
      return { request, result };
    },
    [api, record],
  );
  const { state, run, cancel } = useRequest<CompareRequest, CompareRunData>('compare.run', compare);
  const loading = state.status === 'loading';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const request = toRequest(form);
    if (typeof request === 'string') {
      setFormError(request);
      return;
    }
    setFormError(null);
    void run(request);
  };

  const pick = (scenario: MockScenario<CompareRequest>) => {
    const r = scenario.request;
    setForm({ topicA: r.topicA, topicB: r.topicB ?? '', topK: String(r.topK ?? 5) });
    setFormError(null);
    void run(r);
  };

  const retry = () => {
    const request = toRequest(form);
    if (typeof request !== 'string') void run(request);
  };

  const set = <K extends keyof CompareForm>(key: K, value: CompareForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Compare</h1>
        <p className="page-lede">
          Run one topic pair through LIBRAIN and the two baselines from the companion paper. All three are scored by the
          same evaluator, so differences come from the pipeline, not the judge.
        </p>
      </header>

      <section aria-label="What differs between the systems" className={styles.explainer}>
        <SystemsExplainer />
      </section>

      <form className={styles.queryBar} onSubmit={submit} noValidate>
        <div className={`${styles.fields} ${styles.fieldsTopics}`}>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-a`}>
              Topic A
            </label>
            <input id={`${uid}-a`} className="input" value={form.topicA} maxLength={MAX_TOPIC_CHARS} onChange={(e) => set('topicA', e.target.value)} placeholder="e.g. drug discovery" autoComplete="off" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-b`}>
              Topic B <span className="muted">(optional)</span>
            </label>
            <input id={`${uid}-b`} className="input" value={form.topicB} maxLength={MAX_TOPIC_CHARS} onChange={(e) => set('topicB', e.target.value)} placeholder="e.g. climate adaptation" autoComplete="off" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-k`}>
              Passages per topic
            </label>
            <input id={`${uid}-k`} className="input num" type="number" inputMode="numeric" min={1} max={20} value={form.topK} onChange={(e) => set('topK', e.target.value)} />
          </div>
        </div>
        <div className={styles.actions}>
          <p className={styles.kbd}>LIBRAIN runs with the server's default model; the baselines use the same evaluator.</p>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Comparing…' : 'Compare'}
          </button>
        </div>
        {formError ? (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        ) : null}
        <RecordedRuns scenarios={api.mock?.compare} onPick={pick} disabled={loading} collapsed={state.status === 'success'} />
      </form>

      <div className={styles.result}>
        {state.status === 'idle' ? (
          <EmptyState title="Nothing compared yet">
            <p>
              The three systems run at the same time on the server. Scores line up in one table; Naive-RAG citations
              that point outside the retrieved evidence are marked as fabricated. If one system fails, the other two
              still show.
            </p>
          </EmptyState>
        ) : null}
        {state.status === 'loading' ? (
          <>
            <RunningState
              title="Comparing three systems"
              expectation="All three run concurrently; LIBRAIN usually takes the longest, 15–30 s."
              startedAt={state.startedAt}
              onCancel={cancel}
            />
            <CompareView {...ALL_LOADING} />
          </>
        ) : null}
        {state.status === 'error' ? <ErrorNotice error={state.error} onRetry={retry} /> : null}
        {state.status === 'success' ? (
          <>
            {api.mock ? <MockProvenance match={api.mock.matchCompare(state.data.request)} /> : null}
            <div className={styles.runMeta}>
              <h2 className={styles.runTitle}>{topicLabel(state.data.result.topicA, state.data.result.topicB)}</h2>
              <div className="cluster">
                <span className="tag">top {state.data.result.topK} per topic</span>
                {state.data.result.totalElapsedMs !== undefined ? (
                  <span className="tag">{formatDuration(state.data.result.totalElapsedMs)} in total</span>
                ) : null}
                <CopyText value={state.data.result.correlationId} label="Correlation ID" />
              </div>
            </div>
            <CompareView {...compareStates(state.data.result)} />
          </>
        ) : null}
      </div>
    </div>
  );
}
