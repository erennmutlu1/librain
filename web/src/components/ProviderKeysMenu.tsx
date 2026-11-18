import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { API_BASE_URL } from '../api/config';
import { ApiError, isAbortError } from '../api/errors';
import {
  clearProviderKeys,
  getProviderKeys,
  hasBothProviderKeys,
  onProviderKeysChange,
  onProviderKeysRequest,
  rememberingProviderKeys,
  setProviderKeys,
} from '../api/providerKeys';
import { useT } from '../i18n/lang';
import type { KeyCheckResult, KeyCheckStatus } from '../public/clients';
import { usePublicDemo } from '../public/context';
import { Icon, type IconName } from './Icon';
import { text } from './ProviderKeysMenu.i18n';
import styles from './SettingsMenu.module.css';
import own from './ProviderKeysMenu.module.css';

type Text = (typeof text)['en'];
type Provider = 'anthropic' | 'openai';

const REPO_URL = 'https://github.com/erennmutlu1/librain';

/**
 * The field's one-sentence hint: the key format. A soft check only (providers
 * change key formats), so a typed key that does not match turns it into a
 * warning but never blocks saving.
 */
function formatHint(provider: Provider, value: string, t: Text): { text: string; warn: boolean } {
  const key = value.trim();
  if (provider === 'anthropic') return { text: t.hint.anthropic, warn: key !== '' && !key.startsWith('sk-ant-') };
  if (key.startsWith('sk-ant-')) return { text: t.hint.looksAnthropic, warn: true };
  return { text: t.hint.openai, warn: key !== '' && !key.startsWith('sk-') };
}

/*
 * Password managers: these are API keys, not this site's login. A password
 * field's autocomplete="off" is ignored by browsers, and "new-password" makes
 * Chrome offer to generate one, so the fields keep "off", carry names that
 * are not credentials, and add the opt-out hints the common managers read
 * (1Password, LastPass, Bitwarden, Dashlane).
 */
const NOT_A_LOGIN = {
  autoComplete: 'off',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
} as const;

function KeyField({
  provider,
  id,
  placeholder,
  value,
  onChange,
  inputRef,
  getKeyUrl,
  shown,
  onShownChange,
}: {
  provider: Provider;
  id: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  getKeyUrl: string;
  /** Whether the key shows as text; the panel hides it again on save and clear. */
  shown: boolean;
  onShownChange: (shown: boolean) => void;
}) {
  const t = useT(text);
  const field = t[provider];
  const hint = formatHint(provider, value, t);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {field.label}
      </label>
      <div className={styles.keyRow}>
        <input
          ref={inputRef}
          id={id}
          name={`${provider}-api-key`}
          className={`input mono ${own.keyInput}`}
          type={shown ? 'text' : 'password'}
          {...NOT_A_LOGIN}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-hint`}
        />
        <button type="button" className="btn btn-sm" aria-label={shown ? field.hide : field.show} aria-controls={id} onClick={() => onShownChange(!shown)}>
          {shown ? t.hide : t.show}
        </button>
      </div>
      <span id={`${id}-hint`} className={`field-hint ${hint.warn ? own.warn : ''}`}>
        {hint.warn ? <Icon name="warning" size={13} /> : null}
        {hint.text}
      </span>
      <a className={own.getKey} href={getKeyUrl} target="_blank" rel="noreferrer">
        {field.getKey}
        <Icon name="external" size={12} />
        <span className="visually-hidden">{t.newTab}</span>
      </a>
    </div>
  );
}

const MASKED: Record<Provider, boolean> = { anthropic: false, openai: false };

type Check = { status: 'idle' } | { status: 'checking' } | { status: 'done'; result: KeyCheckResult } | { status: 'error'; message: string };

const CHECK_ICON: Record<KeyCheckStatus, IconName> = {
  valid: 'check',
  invalid: 'close',
  rate_limited: 'warning',
  unreachable: 'warning',
  not_provided: 'info',
};

function checkErrorMessage(error: unknown, t: Text): string {
  if (error instanceof ApiError) {
    if (error.kind === 'network') return t.check.network;
    if (error.status === 429) return t.check.tooMany(error.retryAfterSeconds);
    if (error.status === 400) return t.check.noKey;
  }
  return t.check.failed;
}

/** Per-provider answers: an icon and a word for each, never colour alone. Keys are never shown. */
function CheckResults({ check, waking, t }: { check: Check; waking: boolean; t: Text }) {
  if (check.status === 'checking') {
    return (
      <p className={styles.checkNote}>
        {t.check.checking}
        {waking ? ` ${t.check.waking}` : ''}
      </p>
    );
  }
  if (check.status === 'error') {
    return (
      <p className={styles.checkError}>
        <Icon name="error" size={14} /> {check.message}
      </p>
    );
  }
  if (check.status !== 'done') return null;
  return (
    <ul role="list" className={styles.checkList} aria-label={t.check.results}>
      {(['anthropic', 'openai'] as const).map((p) => {
        const { status, detail } = check.result[p];
        return (
          <li key={p} className={styles.checkItem} data-status={status}>
            <Icon name={CHECK_ICON[status]} size={14} />
            <span>
              <strong>{p === 'anthropic' ? 'Anthropic' : 'OpenAI'}:</strong> {t.check.status[status]}
              {detail && status !== 'valid' && status !== 'not_provided' ? <span className={styles.checkDetail}> {detail}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Public build only: the visitor's own Anthropic and OpenAI keys for Live
 * mode. Same pattern as SettingsMenu: a non-modal popover that Escape or a
 * click outside closes, with focus back on its button. It opens on its own
 * when Live mode is chosen without both keys, the API answers 401 "provider
 * keys required", or the command palette asks for it.
 *
 * "Check my keys" asks the API whether each provider accepts the keys typed
 * in the fields (saved or not), by listing models: free, and silent about
 * the credit balance.
 */
export function ProviderKeysMenu() {
  const t = useT(text);
  const demo = usePublicDemo();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [goLive, setGoLive] = useState(false);
  const [anthropic, setAnthropic] = useState(() => getProviderKeys().anthropic ?? '');
  const [openai, setOpenai] = useState(() => getProviderKeys().openai ?? '');
  const [remember, setRemember] = useState(rememberingProviderKeys);
  const [saved, setSaved] = useState<string | null>(null);
  const [complete, setComplete] = useState(() => hasBothProviderKeys());
  const [check, setCheck] = useState<Check>({ status: 'idle' });
  // Lives here, not in each field, so saving, clearing and closing can mask the keys again.
  const [shown, setShown] = useState<Record<Provider, boolean>>(MASKED);
  const hideKeys = () => setShown(MASKED);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const anthropicInput = useRef<HTMLInputElement>(null);
  const openaiInput = useRef<HTMLInputElement>(null);
  const checking = useRef<AbortController | null>(null);

  const stopCheck = () => {
    checking.current?.abort();
    checking.current = null;
  };

  useEffect(() => onProviderKeysChange(() => setComplete(hasBothProviderKeys())), []);

  useEffect(
    () =>
      onProviderKeysRequest((request) => {
        const keys = getProviderKeys();
        setReason(request.reason ?? null);
        setGoLive(Boolean(request.goLive));
        setSaved(null);
        setAnthropic(keys.anthropic ?? '');
        setOpenai(keys.openai ?? '');
        setRemember(rememberingProviderKeys());
        setCheck({ status: 'idle' });
        setShown(MASKED);
        setOpen(true);
      }),
    [],
  );

  useEffect(() => {
    if (!open) return;
    // Start where something is missing.
    (anthropicInput.current?.value && !openaiInput.current?.value ? openaiInput : anthropicInput).current?.focus();
    const close = () => {
      setOpen(false);
      setGoLive(false);
      setShown(MASKED);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        button.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      // A check still running is for a panel no longer shown.
      checking.current?.abort();
      checking.current = null;
    };
  }, [open]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    // A key shown to check it is masked again once it is saved.
    hideKeys();
    const keys = { anthropic: anthropic.trim() || null, openai: openai.trim() || null };
    if (!keys.anthropic && !keys.openai) {
      clear();
      return;
    }
    const persisted = setProviderKeys(keys, remember);
    setReason(null);
    const where = !persisted ? t.saved.memoryOnly : remember ? t.saved.device : t.saved.tab;
    if (!hasBothProviderKeys(keys)) {
      setSaved(`${where} ${t.saved.needBoth}`);
      return;
    }
    if (demo && goLive) {
      setGoLive(false);
      demo.switchTo('live');
      setSaved(`${where} ${t.saved.liveOn}`);
      return;
    }
    setSaved(demo?.mode === 'recorded' ? `${where} ${t.saved.switchToUse}` : where);
  };

  const clear = () => {
    stopCheck();
    hideKeys();
    clearProviderKeys();
    setAnthropic('');
    setOpenai('');
    setGoLive(false);
    setCheck({ status: 'idle' });
    if (demo?.mode === 'live') {
      demo.switchTo('recorded');
      setSaved(t.saved.clearedBack);
    } else {
      setSaved(t.saved.cleared);
    }
    anthropicInput.current?.focus();
  };

  const runCheck = async () => {
    const checkKeys = demo?.checkKeys;
    if (!checkKeys) return;
    stopCheck();
    const controller = new AbortController();
    checking.current = controller;
    setCheck({ status: 'checking' });
    try {
      const result = await checkKeys({ anthropic: anthropic.trim() || null, openai: openai.trim() || null }, controller.signal);
      if (!controller.signal.aborted) setCheck({ status: 'done', result });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      setCheck({ status: 'error', message: checkErrorMessage(error, t) });
    } finally {
      if (checking.current === controller) checking.current = null;
    }
  };

  /** Editing a key makes an earlier check's answer stale. */
  const keyEdited = () => {
    if (check.status === 'idle') return;
    stopCheck();
    setCheck({ status: 'idle' });
  };

  const stored = getProviderKeys();
  const hasAny = Boolean(stored.anthropic || stored.openai);
  const typed = Boolean(anthropic.trim() || openai.trim());

  return (
    <div className={styles.publicRoot}>
      <button
        ref={button}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        onClick={() => {
          setOpen((o) => !o);
          setShown(MASKED);
          setGoLive(false);
          setSaved(null);
          setReason(null);
          setCheck({ status: 'idle' });
        }}
        title={t.title}
      >
        <Icon name="key" />
        <span className="visually-hidden">
          {t.title}
          {complete ? t.bothSet : ''}
        </span>
        {complete ? <span className={styles.dot} aria-hidden="true" /> : null}
      </button>

      {open ? (
        <div ref={panel} id={`${uid}-panel`} className={styles.panel} role="dialog" aria-modal="false" aria-labelledby={`${uid}-title`}>
          <h2 id={`${uid}-title`} className={styles.title}>
            {t.title}
          </h2>
          {reason ? (
            <p className={styles.reason} role="alert">
              <Icon name="warning" size={14} /> {reason}
            </p>
          ) : null}
          <p className={styles.intro}>{t.intro}</p>
          <form className={styles.form} onSubmit={save}>
            <KeyField
              provider="anthropic"
              id={`${uid}-anthropic`}
              placeholder="sk-ant-…"
              value={anthropic}
              onChange={(value) => {
                setAnthropic(value);
                keyEdited();
              }}
              inputRef={anthropicInput}
              getKeyUrl="https://console.anthropic.com/settings/keys"
              shown={shown.anthropic}
              onShownChange={(v) => setShown((s) => ({ ...s, anthropic: v }))}
            />
            <KeyField
              provider="openai"
              id={`${uid}-openai`}
              placeholder="sk-…"
              value={openai}
              onChange={(value) => {
                setOpenai(value);
                keyEdited();
              }}
              inputRef={openaiInput}
              getKeyUrl="https://platform.openai.com/api-keys"
              shown={shown.openai}
              onShownChange={(v) => setShown((s) => ({ ...s, openai: v }))}
            />
            <label className={styles.check}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} aria-describedby={`${uid}-remember`} />{' '}
              {t.remember}
            </label>
            <span id={`${uid}-remember`} className="field-hint">
              {t.rememberHint}
            </span>
            <div className="cluster">
              <button type="submit" className="btn btn-primary btn-sm">
                {goLive ? t.saveLive : t.save}
              </button>
              <button type="button" className="btn btn-sm" onClick={clear} disabled={!anthropic && !openai && !hasAny}>
                {t.clear}
              </button>
            </div>
            <p className={styles.saved} role="status">
              {saved}
            </p>
          </form>
          {demo?.checkKeys ? (
            <div className={styles.keyCheck}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  if (check.status !== 'checking') void runCheck();
                }}
                disabled={!typed}
                // Stays focusable while checking, so focus is not dropped mid-check.
                aria-disabled={check.status === 'checking' || undefined}
                aria-describedby={`${uid}-check-note`}
              >
                <Icon name="check" size={14} />
                {check.status === 'checking' ? t.check.checking : t.check.button}
              </button>
              <p id={`${uid}-check-note`} className="field-hint">
                {t.check.note}
              </p>
              {/* A live region without role="status", so the save message stays the panel's one status. */}
              <div aria-live="polite" className={styles.checkResults}>
                <CheckResults check={check} waking={demo.serverWaking} t={t} />
              </div>
            </div>
          ) : null}
          <p className={styles.disclaimer}>{t.disclaimer}</p>
          <dl className={styles.facts}>
            <div>
              <dt>{t.facts.sentTo}</dt>
              <dd>
                <code className="mono">{API_BASE_URL || t.facts.sameOrigin}</code>
              </dd>
            </div>
            <div>
              <dt>{t.facts.source}</dt>
              <dd>
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  github.com/erennmutlu1/librain
                  <span className="visually-hidden">{t.newTab}</span>
                </a>
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
