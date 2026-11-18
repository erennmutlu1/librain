import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useApi } from '../api/context';
import { OPENAI_MODELS, type DiscoverRequest, type DiscoverResponse, type MockScenario, type OpenAiModel, type Provider } from '../api/types';
import { DiscoverResult } from '../components/DiscoverResult';
import { FeaturedGallery } from '../components/FeaturedGallery';
import { MockProvenance, Segmented } from '../components/FormBits';
import { Icon } from '../components/Icon';
import { ProgressStepper } from '../components/ProgressStepper';
import { ErrorNotice } from '../components/States';
import { rememberTopics } from '../components/topicSuggestions';
import { useRecordRun } from '../history/context';
import { useT } from '../i18n/lang';
import { topicLabel } from '../lib/format';
import { submitOnModEnter } from '../lib/modEnter';
import { useSessionState } from '../lib/sessionStore';
import { DISCOVER_STAGES } from '../lib/stages';
import { useRequest, type RequestFn } from '../lib/useRequest';
import { usePublicDemo } from '../public/context';
import { RecordedIndex } from './RecordedIndex';
import { TopicFields } from './TopicFields';
import { text } from './DiscoverPage.i18n';
import { text as formText, type FormError } from './forms.i18n';
import { checkTopicForm, formErrorText, readTopicParams } from './topicForm';
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

/**
 * The API's own checks (see topicForm.ts). The public API runs Anthropic only
 * (it answers 400 to OpenAI), so the public build always sends that provider
 * and offers no choice.
 */
function toDiscoverRequest(form: DiscoverForm, anthropicOnly = false): DiscoverRequest | { error: FormError } {
  const checked = checkTopicForm(form);
  if ('error' in checked) return checked;
  const provider: Provider = anthropicOnly ? 'anthropic' : form.provider;
  const request: DiscoverRequest = { topicA: checked.topicA, topK: checked.topK, provider };
  if (checked.topicB) request.topicB = checked.topicB;
  if (provider === 'openai') request.model = form.model;
  return request;
}

export default function DiscoverPage() {
  const api = useApi();
  const uid = useId();
  const t = useT(text);
  const ft = useT(formText);
  const record = useRecordRun();
  const demo = usePublicDemo();
  const anthropicOnly = demo !== null;
  const [form, setForm] = useSessionState<DiscoverForm>('discover.form', EMPTY_FORM);
  const [formError, setFormError] = useState<FormError | null>(null);
  // Set when a /discover?a=&b=&k= link filled the form; cleared by the next run.
  const [prefilled, setPrefilled] = useSessionState('discover.prefilled', false);
  const [params, setParams] = useSearchParams();

  /*
   * Remix links and the command palette open /discover?a=<topic A>&b=<topic B>&k=<top-K>.
   * The values fill the form and leave the address, so a reload or a later
   * visit does not overwrite what the visitor typed since. Nothing runs (and
   * nothing is billed) until the visitor presses Discover.
   */
  useEffect(() => {
    const patch = readTopicParams(params);
    if (!patch) return;
    setForm((f) => ({ ...f, ...patch }));
    setPrefilled(true);
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const key of ['a', 'b', 'k']) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }, [params, setForm, setPrefilled, setParams]);

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
    if (loading) return;
    const request = toDiscoverRequest(form, anthropicOnly);
    if ('error' in request) {
      setFormError(request.error);
      return;
    }
    setFormError(null);
    setPrefilled(false);
    rememberTopics(request.topicA, request.topicB);
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
    setPrefilled(false);
    void run(r);
  };

  return (
    <div className="page">
      <header className={`page-header ${styles.hero}`}>
        <h1 className="page-title">{t.title}</h1>
        <p className="page-lede">{t.lede}</p>
      </header>

      <form
        className={styles.queryBar}
        onSubmit={submit}
        onKeyDown={submitOnModEnter}
        aria-describedby={formError ? `${uid}-err` : undefined}
        noValidate
      >
        {prefilled ? (
          <p className={styles.formNote} role="status">
            <Icon name="link" size={15} />
            <span>{t.prefilled}</span>
          </p>
        ) : null}
        <TopicFields
          source="discover"
          form={form}
          setForm={setForm}
          placeholders={{ a: t.placeholderA, b: t.placeholderB }}
          invalidA={formError === 'topicRequired' || formError === 'topicsSame'}
        />

        <div className={styles.actions}>
          {anthropicOnly ? (
            <p className={styles.kbd}>{demo?.mode === 'recorded' ? t.recordedTip : t.anthropicOnly}</p>
          ) : (
            <div className={styles.options}>
              <Segmented<Provider>
                legend={t.provider}
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
                    {t.openaiModel}
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
          )}
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
        <RecordedIndex scenarios={api.mock?.discover} onPick={pick} disabled={loading} collapsed={state.status === 'success'} />
      </form>

      <div className={styles.result}>
        {state.status === 'loading' ? (
          <ProgressStepper
            title={t.progressTitle}
            stages={DISCOVER_STAGES}
            events={state.progress}
            startedAt={state.startedAt}
            onCancel={cancel}
            expectation={t.expectation}
          />
        ) : null}

        {state.status === 'error' ? (
          <ErrorNotice
            error={state.error}
            onRetry={() => {
              const request = toDiscoverRequest(form, anthropicOnly);
              if (!('error' in request)) void run(request);
            }}
          />
        ) : null}

        {state.status === 'success' ? (
          <>
            {api.mock ? <MockProvenance match={api.mock.matchDiscover(state.data.request)} /> : null}
            <DiscoverResult request={state.data.request} result={state.data.result} />
          </>
        ) : null}

        {/* No result on screen: recorded runs that open without calling the API. */}
        {state.status === 'idle' || state.status === 'error' ? <FeaturedGallery /> : null}
      </div>
    </div>
  );
}
