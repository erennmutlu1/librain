import { useCallback, useId, useState, type FormEvent } from 'react';
import { useApi } from '../api/context';
import { describeError, isAbortError } from '../api/errors';
import type {
  CitationMode,
  CompareRequest,
  DiscoverResponse,
  MockScenario,
  NaiveRagResponse,
  Provider,
  SingleLlmResponse,
} from '../api/types';
import { CompareView, SystemsExplainer, type SystemState } from '../components/CompareView';
import { MockProvenance, RecordedRuns, Segmented } from '../components/FormBits';
import { EmptyState, RunningState } from '../components/States';
import { useRecordRun } from '../history/context';
import { newRunId } from '../history/runStore';
import type { Outcome } from '../history/types';
import { topicLabel } from '../lib/format';
import { getSession, useSessionState } from '../lib/sessionStore';
import styles from './pages.module.css';

const SESSION_KEY = 'compare.run';

interface CompareForm {
  topicA: string;
  topicB: string;
  topK: string;
  provider: Provider;
  citationMode: CitationMode;
}

interface CompareSession {
  request: CompareRequest;
  startedAt: number;
  librain: SystemState<DiscoverResponse>;
  naiveRag: SystemState<NaiveRagResponse>;
  singleLlm: SystemState<SingleLlmResponse>;
}

type SystemSlot = 'librain' | 'naiveRag' | 'singleLlm';

let activeController: AbortController | null = null;

function toRequest(form: CompareForm): CompareRequest | string {
  const topicA = form.topicA.trim();
  const topicB = form.topicB.trim();
  if (!topicA) return 'Enter at least Topic A.';
  if (topicB && topicA === topicB) return 'Topic B must differ from Topic A (the baselines reject identical topics).';
  const topK = Number(form.topK);
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) return 'Results per topic must be a whole number from 1 to 20.';
  const request: CompareRequest = { topicA, topK, provider: form.provider, citationMode: form.citationMode };
  if (topicB) request.topicB = topicB;
  return request;
}

function toOutcome<T>(state: SystemState<T>): Outcome<T> {
  if (state.status === 'success') return { ok: true, value: state.data };
  if (state.status === 'error') return { ok: false, error: describeError(state.error).title };
  return { ok: false, error: 'Did not finish.' };
}

export function ComparePage() {
  const api = useApi();
  const uid = useId();
  const record = useRecordRun();
  const [form, setForm] = useSessionState<CompareForm>('compare.form', {
    topicA: '',
    topicB: '',
    topK: '5',
    provider: 'anthropic',
    citationMode: 'structured',
  });
  const [session, setSession] = useSessionState<CompareSession | null>(SESSION_KEY, null);
  const [formError, setFormError] = useState<string | null>(null);

  const loading =
    session !== null &&
    (session.librain.status === 'loading' || session.naiveRag.status === 'loading' || session.singleLlm.status === 'loading');

  const run = useCallback(
    async (request: CompareRequest) => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const startedAt = Date.now();
      setSession({ request, startedAt, librain: { status: 'loading' }, naiveRag: { status: 'loading' }, singleLlm: { status: 'loading' } });

      const settle = <T,>(slot: SystemSlot, promise: Promise<T>) =>
        promise.then(
          (data) => setSession((prev) => (prev && prev.startedAt === startedAt ? { ...prev, [slot]: { status: 'success', data } } : prev)),
          (error: unknown) =>
            setSession((prev) =>
              prev && prev.startedAt === startedAt
                ? { ...prev, [slot]: { status: 'error', error: isAbortError(error) ? new Error('Cancelled.') : error } }
                : prev,
            ),
        );

      const { topicA, topicB, topK, provider, citationMode } = request;
      const pair = topicB ? { topicA, topicB } : { topicA };
      await Promise.all([
        settle('librain', api.discover({ ...pair, topK, provider }, controller.signal)),
        settle('naiveRag', api.naiveRag({ ...pair, topK, citationMode }, controller.signal)),
        settle('singleLlm', api.singleLlm(pair, controller.signal)),
      ]);
      if (activeController === controller) activeController = null;
      if (controller.signal.aborted) return;

      const final = getSession<CompareSession | null>(SESSION_KEY, null);
      if (final && final.startedAt === startedAt) {
        const librain = toOutcome(final.librain);
        record({
          id: newRunId(),
          kind: 'compare',
          createdAt: new Date(startedAt).toISOString(),
          mock: api.mode === 'mock',
          label: topicLabel(request.topicA, request.topicB),
          quality: librain.ok ? (librain.value.evaluation?.qualityScore ?? null) : null,
          request,
          result: { librain, naiveRag: toOutcome(final.naiveRag), singleLlm: toOutcome(final.singleLlm) },
        });
      }
    },
    [api, record, setSession],
  );

  const cancel = () => activeController?.abort();

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
    setForm({
      topicA: r.topicA,
      topicB: r.topicB ?? '',
      topK: String(r.topK ?? 5),
      provider: r.provider ?? 'anthropic',
      citationMode: r.citationMode ?? 'structured',
    });
    setFormError(null);
    void run(r);
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

      <section aria-label="What differs between the systems" style={{ marginBottom: 'var(--s6)' }}>
        <SystemsExplainer />
      </section>

      <form className={styles.queryBar} onSubmit={submit} noValidate>
        <div className={`${styles.fields} ${styles.fieldsTopics}`}>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-a`}>
              Topic A
            </label>
            <input id={`${uid}-a`} className="input" value={form.topicA} onChange={(e) => set('topicA', e.target.value)} placeholder="e.g. drug discovery" autoComplete="off" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-b`}>
              Topic B <span className="muted">(optional)</span>
            </label>
            <input id={`${uid}-b`} className="input" value={form.topicB} onChange={(e) => set('topicB', e.target.value)} placeholder="e.g. climate adaptation" autoComplete="off" />
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
            />
          </div>
        </div>
        <div className={styles.actions}>
          <div className={styles.options}>
            <Segmented<Provider>
              legend="LIBRAIN provider"
              name={`${uid}-provider`}
              value={form.provider}
              onChange={(v) => set('provider', v)}
              options={[
                { value: 'anthropic', label: 'Anthropic' },
                { value: 'openai', label: 'OpenAI' },
              ]}
            />
            <Segmented<CitationMode>
              legend="Naive-RAG citations"
              name={`${uid}-mode`}
              value={form.citationMode}
              onChange={(v) => set('citationMode', v)}
              options={[
                { value: 'structured', label: 'Structured' },
                { value: 'free-text', label: 'Free text' },
              ]}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Comparing…' : 'Compare'}
          </button>
        </div>
        {formError ? (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        ) : null}
        <RecordedRuns scenarios={api.mock?.compare} onPick={pick} disabled={loading} />
      </form>

      <div className={styles.result}>
        {session === null ? (
          <EmptyState title="Nothing compared yet">
            <p>
              The three runs start together and fill in as each finishes. Scores line up in one table; Naive-RAG
              citations that point outside the retrieved evidence are marked as fabricated.
            </p>
          </EmptyState>
        ) : (
          <>
            {loading ? (
              <RunningState
                title={`Comparing ${topicLabel(session.request.topicA, session.request.topicB)}`}
                expectation="Each system makes its own model calls; expect up to 30 s for LIBRAIN."
                startedAt={session.startedAt}
                onCancel={cancel}
              />
            ) : null}
            {api.mock && !loading ? <MockProvenance match={api.mock.matchCompare(session.request)} /> : null}
            <CompareView request={session.request} librain={session.librain} naiveRag={session.naiveRag} singleLlm={session.singleLlm} />
          </>
        )}
      </div>
    </div>
  );
}
