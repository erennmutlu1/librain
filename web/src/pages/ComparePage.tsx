import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
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
import { checkTopicForm, formErrorText, topicErrorField, topicFieldId, type TopicFormField } from './topicForm';
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
  // A code, not a message, so it follows a language switch; and the field it belongs under.
  const [formError, setFormError] = useState<{ code: FormError; field: TopicFormField } | null>(null);

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

  // Each failed submit (a new object, even for the same error) takes focus to the field at fault.
  useEffect(() => {
    if (formError) document.getElementById(topicFieldId(uid, formError.field))?.focus();
  }, [formError, uid]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    const request = toRequest(form);
    if ('error' in request) {
      setFormError({ code: request.error, field: topicErrorField(request.error, form) ?? 'a' });
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
        noValidate
      >
        <TopicFields
          source="compare"
          form={form}
          setForm={setForm}
          idPrefix={uid}
          hints={{ a: t.hintA, b: t.hintB }}
          error={formError ? { field: formError.field, message: formErrorText(ft, formError.code) } : null}
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
