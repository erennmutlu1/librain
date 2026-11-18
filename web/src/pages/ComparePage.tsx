import { useCallback, useId, useState, type FormEvent } from 'react';
import { useApi } from '../api/context';
import type { CompareRequest, CompareResponse, MockScenario } from '../api/types';
import { CompareView, SystemsExplainer } from '../components/CompareView';
import { CopyText } from '../components/CopyText';
import { PairTitle } from '../components/DiscoverResult';
import { MockProvenance, RecordedRuns } from '../components/FormBits';
import { EmptyState, ErrorNotice, RunningState } from '../components/States';
import { rememberTopics, type TopicForm } from '../components/topicSuggestions';
import { useRecordRun } from '../history/context';
import { useT } from '../i18n/lang';
import { ALL_LOADING, compareStates } from '../lib/compare';
import { formatDuration, topicLabel } from '../lib/format';
import { submitOnModEnter } from '../lib/modEnter';
import { useSessionState } from '../lib/sessionStore';
import { useRequest, type RequestFn } from '../lib/useRequest';
import { usePublicDemo } from '../public/context';
import { TopicFields } from './TopicFields';
import { text } from './ComparePage.i18n';
import { text as formText, type FormError } from './forms.i18n';
import { checkTopicForm, formErrorText } from './topicForm';
import styles from './pages.module.css';

interface CompareRunData {
  request: CompareRequest;
  result: CompareResponse;
}

function toRequest(form: TopicForm): CompareRequest | { error: FormError } {
  return checkTopicForm(form);
}

export default function ComparePage() {
  const api = useApi();
  const uid = useId();
  const t = useT(text);
  const ft = useT(formText);
  const record = useRecordRun();
  const recordedOnly = usePublicDemo()?.mode === 'recorded';
  const [form, setForm] = useSessionState<TopicForm>('compare.form', { topicA: '', topicB: '', topK: '5' });
  const [formError, setFormError] = useState<FormError | null>(null);

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
    if (loading) return;
    const request = toRequest(form);
    if ('error' in request) {
      setFormError(request.error);
      return;
    }
    setFormError(null);
    rememberTopics(request.topicA, request.topicB);
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
    if (!('error' in request)) void run(request);
  };

  return (
    <div className="page">
      <header className={`page-header ${styles.hero}`}>
        <h1 className="page-title">{t.title}</h1>
        <p className="page-lede">{t.lede}</p>
      </header>

      <section aria-label={t.explainer} className={styles.explainer}>
        <SystemsExplainer />
      </section>

      <form
        className={styles.queryBar}
        onSubmit={submit}
        onKeyDown={submitOnModEnter}
        aria-describedby={formError ? `${uid}-err` : undefined}
        noValidate
      >
        <TopicFields
          source="compare"
          form={form}
          setForm={setForm}
          placeholders={{ a: t.placeholderA, b: t.placeholderB }}
          invalidA={formError === 'topicRequired' || formError === 'topicsSame'}
        />
        <div className={styles.actions}>
          <p className={styles.kbd}>{recordedOnly ? t.recordedTip : t.serverModel}</p>
          <div className="cluster">
            <span className={`${styles.kbd} ${styles.kbdHint}`}>{ft.modEnter(t.modEnterAction)}</span>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t.submitting : t.submit}
            </button>
          </div>
        </div>
        {formError ? (
          <p id={`${uid}-err`} className={styles.formError} role="alert">
            {formErrorText(ft, formError)}
          </p>
        ) : null}
        <RecordedRuns scenarios={api.mock?.compare} onPick={pick} disabled={loading} collapsed={state.status === 'success'} />
      </form>

      <div className={styles.result}>
        {state.status === 'idle' ? (
          <EmptyState title={t.emptyTitle}>
            <p>{t.emptyBody}</p>
          </EmptyState>
        ) : null}
        {state.status === 'loading' ? (
          <>
            <RunningState title={t.runningTitle} expectation={t.runningExpectation} startedAt={state.startedAt} onCancel={cancel} />
            <CompareView {...ALL_LOADING} />
          </>
        ) : null}
        {state.status === 'error' ? <ErrorNotice error={state.error} onRetry={retry} /> : null}
        {state.status === 'success' ? (
          <>
            {api.mock ? <MockProvenance match={api.mock.matchCompare(state.data.request)} /> : null}
            <div className={styles.runMeta}>
              <h2 className={styles.runTitle}>
                <PairTitle label={topicLabel(state.data.result.topicA, state.data.result.topicB)} />
              </h2>
              <div className="cluster">
                <span className="tag">{t.perTopic(state.data.result.topK)}</span>
                {state.data.result.totalElapsedMs !== undefined ? (
                  <span className="tag">{t.inTotal(formatDuration(state.data.result.totalElapsedMs))}</span>
                ) : null}
                <CopyText value={state.data.result.correlationId} label={t.correlationId} />
              </div>
            </div>
            <CompareView {...compareStates(state.data.result)} />
          </>
        ) : null}
      </div>
    </div>
  );
}
