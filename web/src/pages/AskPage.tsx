import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useApi } from '../api/context';
import { MAX_QUERY_CHARS, type MockScenario, type QueryRequest, type QueryResponse } from '../api/types';
import { AskResult } from '../components/AskResult';
import { InlineFormNotice, MockProvenance, RecordedRuns } from '../components/FormBits';
import { Icon } from '../components/Icon';
import { NumberStepper } from '../components/NumberStepper';
import { ProgressStepper } from '../components/ProgressStepper';
import { EmptyState, ErrorNotice } from '../components/States';
import { recentQuestions, rememberQuestion } from '../components/topicSuggestions';
import { useRecordRun } from '../history/context';
import { useLang, useT } from '../i18n/lang';
import { formatCount } from '../lib/format';
import { submitOnModEnter } from '../lib/modEnter';
import { useSessionState } from '../lib/sessionStore';
import { QUERY_STAGES } from '../lib/stages';
import { useRequest, type RequestFn } from '../lib/useRequest';
import { usePublicDemo } from '../public/context';
import { text } from './AskPage.i18n';
import { text as formText, type FormError } from './forms.i18n';
import { formErrorText, TOPK_MAX, TOPK_MIN } from './topicForm';
import styles from './pages.module.css';

interface AskForm {
  query: string;
  topK: string;
}

interface AskRunData {
  request: QueryRequest;
  result: QueryResponse;
}

function toRequest(form: AskForm): QueryRequest | { error: FormError } {
  const query = form.query.trim();
  if (!query) return { error: 'queryRequired' };
  if (query.length > MAX_QUERY_CHARS) return { error: 'queryTooLong' };
  const topK = Number(form.topK);
  if (!Number.isInteger(topK) || topK < TOPK_MIN || topK > TOPK_MAX) return { error: 'queryTopKRange' };
  return { query, topK };
}

export default function AskPage() {
  const api = useApi();
  const uid = useId();
  const t = useT(text);
  const ft = useT(formText);
  const { lang } = useLang();
  const record = useRecordRun();
  const demo = usePublicDemo();
  // The only Ask recording is an API contract snapshot (placeholder text), which the public site never shows.
  const noRecordings = demo?.mode === 'recorded';
  /*
   * Recorded mode, after a submit: nothing can replay, so the message sits
   * right under the submit row and takes focus. `tick` moves focus again on a
   * repeated submit; `query` hides it once the question changes.
   */
  const [noRecording, setNoRecording] = useState<{ query: string; tick: number } | null>(null);
  const [form, setForm] = useSessionState<AskForm>('ask.form', { query: '', topK: '5' });
  const [formError, setFormError] = useState<FormError | null>(null);
  const [errorTick, setErrorTick] = useState(0);
  const topKError = formError === 'queryTopKRange';

  // A failed submit takes focus to the field at fault: the question, or the passage count.
  useEffect(() => {
    if (!formError || errorTick === 0) return;
    document.getElementById(formError === 'queryTopKRange' ? `${uid}-k` : `${uid}-q`)?.focus();
  }, [formError, errorTick, uid]);
  const [recent, setRecent] = useState(() => recentQuestions());

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
    if (loading) return;
    const request = toRequest(form);
    if ('error' in request) {
      // A new value each time, so a repeated error still moves focus (effect below).
      setFormError(request.error);
      setErrorTick((n) => n + 1);
      return;
    }
    setFormError(null);
    if (noRecordings) {
      setNoRecording((n) => ({ query: form.query, tick: (n?.tick ?? 0) + 1 }));
      return;
    }
    setNoRecording(null);
    rememberQuestion(request.query);
    setRecent(recentQuestions());
    void run(request);
  };

  const pick = (scenario: MockScenario<QueryRequest>) => {
    setForm({ query: scenario.request.query, topK: String(scenario.request.topK ?? 5) });
    setFormError(null);
    void run(scenario.request);
  };

  const remaining = MAX_QUERY_CHARS - form.query.length;
  const showNoRecording = noRecordings && noRecording !== null && noRecording.query === form.query;
  const hint = noRecordings && form.query.trim() && !showNoRecording ? t.noRecordingHint : '';
  // Recent questions other than the one already in the field.
  const otherRecent = noRecordings ? [] : recent.filter((q) => q !== form.query.trim());

  return (
    <div className="page">
      <header className={`page-header ${styles.hero}`}>
        <h1 className="page-title">{t.title}</h1>
        <p className="page-lede">{t.lede}</p>
      </header>

      {noRecordings ? (
        <div className={`notice notice-info ${styles.modeNotice}`} role="status">
          <Icon name="info" />
          <div>
            <strong>{t.noRecordingsTitle}</strong>
            <p>{t.noRecordingsBody}</p>
            <div className="cluster">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => demo.switchTo('live')}>
                {t.switchLive}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <form className={styles.queryBar} onSubmit={submit} onKeyDown={submitOnModEnter} noValidate>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-q`}>
            {t.question}
          </label>
          <textarea
            id={`${uid}-q`}
            className="input"
            rows={3}
            value={form.query}
            maxLength={MAX_QUERY_CHARS}
            onChange={(e) => setForm((f) => ({ ...f, query: e.target.value }))}
            placeholder={t.placeholder}
            aria-invalid={(formError !== null && !topKError) || undefined}
            aria-describedby={formError && !topKError ? `${uid}-err` : noRecordings ? `${uid}-hint` : `${uid}-kbd`}
          />
          {formError && !topKError ? (
            <p id={`${uid}-err`} className={styles.formError} role="alert">
              {formErrorText(ft, formError)}
            </p>
          ) : null}
          {noRecordings ? (
            // Polite: the text changes only when the field goes from empty to filled and back.
            <span id={`${uid}-hint`} className={`field-hint ${styles.unmatchedHint}`} aria-live="polite">
              {hint}
            </span>
          ) : null}
          {remaining < 200 ? (
            <span className="field-hint" aria-live="polite">
              {t.charsLeft(formatCount(remaining, lang))}
            </span>
          ) : null}
        </div>
        {otherRecent.length > 0 ? (
          <details className={styles.recent}>
            <summary className={styles.kbd}>
              {t.recent} <span className="num">({otherRecent.length})</span>
            </summary>
            <ul role="list" className={styles.recentList}>
              {otherRecent.map((q) => (
                <li key={q}>
                  {/* Fills the field; asking is still the visitor's call. */}
                  <button
                    type="button"
                    className={styles.recentButton}
                    disabled={loading}
                    onClick={() => {
                      setForm((f) => ({ ...f, query: q }));
                      setFormError(null);
                      document.getElementById(`${uid}-q`)?.focus();
                    }}
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className={styles.actions}>
          <NumberStepper
            id={`${uid}-k`}
            error={topKError ? formErrorText(ft, formError) : null}
            label={ft.passagesToRetrieve}
            value={form.topK}
            onChange={(v) => setForm((f) => ({ ...f, topK: v }))}
            min={TOPK_MIN}
            max={TOPK_MAX}
          />
          <div className="cluster">
            <span id={`${uid}-kbd`} className={styles.kbd}>
              {ft.modEnter(t.modEnterAction)}
            </span>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t.submitting : t.submit}
            </button>
          </div>
        </div>
        {demo?.mode === 'live' ? (
          <p className={`${styles.kbd} ${styles.liveNote}`}>
            <strong className={styles.cost}>{t.liveCost}</strong>
          </p>
        ) : null}
        {showNoRecording && noRecording && demo ? (
          <InlineFormNotice
            title={t.noRecordingTitle}
            focusKey={noRecording.tick}
            actions={
              <button type="button" className="btn btn-sm btn-primary" onClick={() => demo.switchTo('live')}>
                {t.switchLive}
              </button>
            }
          >
            {t.noRecordingBody}
          </InlineFormNotice>
        ) : null}
        <RecordedRuns scenarios={api.mock?.ask} onPick={pick} disabled={loading} collapsed={state.status === 'success'} />
      </form>

      <div className={styles.result}>
        {state.status === 'idle' ? (
          <EmptyState title={t.emptyTitle}>
            <p>{t.emptyBody}</p>
          </EmptyState>
        ) : null}
        {state.status === 'loading' ? (
          <ProgressStepper
            title={t.progressTitle}
            stages={QUERY_STAGES}
            events={state.progress}
            startedAt={state.startedAt}
            onCancel={cancel}
            expectation={t.expectation}
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
