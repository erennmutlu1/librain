import { useCallback, useId, useState, type FormEvent } from 'react';
import { useApi } from '../api/context';
import type { DiscoverRequest, DiscoverResponse, MockScenario, Provider } from '../api/types';
import { StatusLegend } from '../components/AnnotatedClaim';
import { DiscoverResult } from '../components/DiscoverResult';
import { MockProvenance, RecordedRuns, Segmented } from '../components/FormBits';
import { EmptyState, ErrorNotice, RunningState, SkeletonLines } from '../components/States';
import { useRecordRun } from '../history/context';
import { newRunId } from '../history/runStore';
import { topicLabel } from '../lib/format';
import { useSessionState } from '../lib/sessionStore';
import { useRequest } from '../lib/useRequest';
import styles from './pages.module.css';

interface DiscoverForm {
  topicA: string;
  topicB: string;
  topK: string;
  provider: Provider;
  model: string;
}

const EMPTY_FORM: DiscoverForm = { topicA: '', topicB: '', topK: '5', provider: 'anthropic', model: '' };

interface DiscoverRun {
  request: DiscoverRequest;
  result: DiscoverResponse;
}

function toDiscoverRequest(form: DiscoverForm): DiscoverRequest | string {
  const topicA = form.topicA.trim();
  if (!topicA) return 'Enter at least Topic A.';
  const topK = Number(form.topK);
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) return 'Results per topic must be a whole number from 1 to 20.';
  const request: DiscoverRequest = { topicA, topK, provider: form.provider };
  if (form.topicB.trim()) request.topicB = form.topicB.trim();
  if (form.provider === 'openai' && form.model.trim()) request.model = form.model.trim();
  return request;
}

export function DiscoverPage() {
  const api = useApi();
  const uid = useId();
  const record = useRecordRun();
  const [form, setForm] = useSessionState<DiscoverForm>('discover.form', EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const discover = useCallback(
    async (request: DiscoverRequest, signal: AbortSignal): Promise<DiscoverRun> => {
      const result = await api.discover(request, signal);
      record({
        id: newRunId(),
        kind: 'discover',
        createdAt: new Date().toISOString(),
        mock: api.mode === 'mock',
        label: topicLabel(request.topicA, request.topicB),
        quality: result.evaluation?.qualityScore ?? null,
        request,
        result,
      });
      return { request, result };
    },
    [api, record],
  );
  const { state, run, cancel } = useRequest<DiscoverRequest, DiscoverRun>('discover.run', discover);
  const loading = state.status === 'loading';

  const set = <K extends keyof DiscoverForm>(key: K, value: DiscoverForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const request = toDiscoverRequest(form);
    if (typeof request === 'string') {
      setFormError(request);
      return;
    }
    setFormError(null);
    void run(request);
  };

  const pick = (scenario: MockScenario<DiscoverRequest>) => {
    const r = scenario.request;
    setForm({
      topicA: r.topicA,
      topicB: r.topicB ?? '',
      topK: String(r.topK ?? 5),
      provider: r.provider ?? 'anthropic',
      model: r.model ?? '',
    });
    setFormError(null);
    void run(r);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Discover</h1>
        <p className="page-lede">
          Give LIBRAIN one or two topics. It retrieves evidence for each, proposes a hypothesis that goes beyond the
          papers, and has a second model check every sentence of the speculative part.
        </p>
      </header>

      <form className={styles.queryBar} onSubmit={submit} aria-describedby={formError ? `${uid}-err` : undefined} noValidate>
        <div className={`${styles.fields} ${styles.fieldsTopics}`}>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-a`}>
              Topic A
            </label>
            <input
              id={`${uid}-a`}
              className="input"
              value={form.topicA}
              onChange={(e) => set('topicA', e.target.value)}
              placeholder="e.g. weather foundation models"
              required
              aria-invalid={formError?.includes('Topic A') || undefined}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-b`}>
              Topic B <span className="muted">(optional)</span>
            </label>
            <input
              id={`${uid}-b`}
              className="input"
              value={form.topicB}
              onChange={(e) => set('topicB', e.target.value)}
              placeholder="e.g. renewable energy planning"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-k`}>
              Per topic
            </label>
            <input
              id={`${uid}-k`}
              className="input num"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={form.topK}
              onChange={(e) => set('topK', e.target.value)}
              aria-describedby={`${uid}-k-hint`}
            />
            <span id={`${uid}-k-hint`} className="field-hint">
              1 to 20 chunks
            </span>
          </div>
        </div>

        <div className={styles.actions}>
          <div className={styles.options}>
            <Segmented<Provider>
              legend="Model provider"
              name={`${uid}-provider`}
              value={form.provider}
              onChange={(v) => set('provider', v)}
              options={[
                { value: 'anthropic', label: 'Anthropic' },
                { value: 'openai', label: 'OpenAI' },
              ]}
            />
            {form.provider === 'openai' ? (
              <div className="field">
                <label className="field-label" htmlFor={`${uid}-m`}>
                  OpenAI model
                </label>
                <input
                  id={`${uid}-m`}
                  className="input"
                  value={form.model}
                  onChange={(e) => set('model', e.target.value)}
                  placeholder="gpt-4o"
                  autoComplete="off"
                />
              </div>
            ) : null}
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Discovering…' : 'Discover'}
          </button>
        </div>
        {formError ? (
          <p id={`${uid}-err`} className={styles.formError} role="alert">
            {formError}
          </p>
        ) : null}
        <RecordedRuns scenarios={api.mock?.discover} onPick={pick} disabled={loading} />
      </form>

      <div className={styles.result}>
        {state.status === 'idle' ? (
          <EmptyState title="No discovery yet">
            <p>
              Run one and the novel claim comes back marked up sentence by sentence. Each verdict comes from an
              independent validator that reads the same retrieved chunks:
            </p>
            <div style={{ marginTop: 'var(--s4)' }}>
              <StatusLegend />
            </div>
          </EmptyState>
        ) : null}

        {state.status === 'loading' ? (
          <RunningState
            title="Running discovery"
            expectation="Retrieval, generation, claim validation and scoring usually take 15–30 s."
            startedAt={state.startedAt}
            onCancel={cancel}
          >
            <SkeletonLines lines={5} />
          </RunningState>
        ) : null}

        {state.status === 'error' ? (
          <ErrorNotice
            error={state.error}
            onRetry={() => {
              const request = toDiscoverRequest(form);
              if (typeof request !== 'string') void run(request);
            }}
          />
        ) : null}

        {state.status === 'success' ? (
          <>
            {api.mock ? <MockProvenance match={api.mock.matchDiscover(state.data.request)} /> : null}
            <DiscoverResult request={state.data.request} result={state.data.result} />
          </>
        ) : null}
      </div>
    </div>
  );
}
