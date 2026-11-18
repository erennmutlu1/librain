import { useCallback, useId, useState, type FormEvent } from 'react';
import { useApi } from '../api/context';
import {
  MAX_TOPIC_CHARS,
  OPENAI_MODELS,
  type DiscoverRequest,
  type DiscoverResponse,
  type MockScenario,
  type OpenAiModel,
  type Provider,
} from '../api/types';
import { StatusLegend } from '../components/AnnotatedClaim';
import { DiscoverResult } from '../components/DiscoverResult';
import { MockProvenance, RecordedRuns, Segmented } from '../components/FormBits';
import { ProgressStepper } from '../components/ProgressStepper';
import { EmptyState, ErrorNotice } from '../components/States';
import { useRecordRun } from '../history/context';
import { topicLabel } from '../lib/format';
import { useSessionState } from '../lib/sessionStore';
import { DISCOVER_STAGES } from '../lib/stages';
import { useRequest, type RequestFn } from '../lib/useRequest';
import styles from './pages.module.css';

interface DiscoverForm {
  topicA: string;
  topicB: string;
  topK: string;
  provider: Provider;
  model: OpenAiModel;
}

const EMPTY_FORM: DiscoverForm = { topicA: '', topicB: '', topK: '5', provider: 'anthropic', model: 'gpt-4o' };

interface DiscoverRunData {
  request: DiscoverRequest;
  result: DiscoverResponse;
}

/** The same checks, in the same order, as DiscoveryEndpoints.Validate. */
function toDiscoverRequest(form: DiscoverForm): DiscoverRequest | string {
  const topicA = form.topicA.trim();
  const topicB = form.topicB.trim();
  if (!topicA) return 'Enter at least Topic A.';
  if (topicA.length > MAX_TOPIC_CHARS || topicB.length > MAX_TOPIC_CHARS) return `Topics can be at most ${MAX_TOPIC_CHARS} characters.`;
  if (topicB && topicA === topicB) return 'Topic B must differ from Topic A.';
  const topK = Number(form.topK);
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) return 'Passages per topic must be a whole number from 1 to 20.';
  const request: DiscoverRequest = { topicA, topK, provider: form.provider };
  if (topicB) request.topicB = topicB;
  if (form.provider === 'openai') request.model = form.model;
  return request;
}

export default function DiscoverPage() {
  const api = useApi();
  const uid = useId();
  const record = useRecordRun();
  const [form, setForm] = useSessionState<DiscoverForm>('discover.form', EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const discover = useCallback<RequestFn<DiscoverRequest, DiscoverRunData>>(
    async (request, signal, onProgress) => {
      const result = await api.discoverStream(request, onProgress, signal);
      record({
        id: result.correlationId,
        kind: 'discover',
        title: topicLabel(request.topicA, request.topicB),
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
  const { state, run, cancel } = useRequest<DiscoverRequest, DiscoverRunData>('discover.run', discover);
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
      model: r.model ?? 'gpt-4o',
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
              maxLength={MAX_TOPIC_CHARS}
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
              maxLength={MAX_TOPIC_CHARS}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-k`}>
              Passages per topic
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
              1 to 20
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
                <select id={`${uid}-m`} className="input" value={form.model} onChange={(e) => set('model', e.target.value as OpenAiModel)}>
                  {OPENAI_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
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
        <RecordedRuns scenarios={api.mock?.discover} onPick={pick} disabled={loading} collapsed={state.status === 'success'} />
      </form>

      <div className={styles.result}>
        {state.status === 'idle' ? (
          <EmptyState title="No discovery yet">
            <p>
              Run one and the novel claim comes back marked up sentence by sentence. Each verdict comes from an
              independent validator that reads the same retrieved passages:
            </p>
            <div className={styles.legendSlot}>
              <StatusLegend />
            </div>
          </EmptyState>
        ) : null}

        {state.status === 'loading' ? (
          <ProgressStepper
            title="Running discovery"
            stages={DISCOVER_STAGES}
            events={state.progress}
            startedAt={state.startedAt}
            onCancel={cancel}
            expectation="Usually 15–30 s."
          />
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
