import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { API_BASE_URL } from '../api/config';
import {
  clearProviderKeys,
  getProviderKeys,
  hasBothProviderKeys,
  onProviderKeysChange,
  onProviderKeysRequest,
  rememberingProviderKeys,
  setProviderKeys,
} from '../api/providerKeys';
import { usePublicDemo } from '../public/context';
import { Icon } from './Icon';
import styles from './SettingsMenu.module.css';

export const KEYS_DISCLAIMER =
  'Your keys are sent only with your own requests to the LIBRAIN API, which passes them to Anthropic and OpenAI for that request and does not store or log them. Usage is billed to your accounts. Use keys with a spending limit. LIBRAIN is open source (MIT) and provided as is, without warranty or responsibility for how you use it.';

const REPO_URL = 'https://github.com/erennmutlu1/librain';

/** A soft check only: providers change key formats, so a mismatch warns but never blocks saving. */
function formatHint(provider: 'anthropic' | 'openai', value: string): string | null {
  const key = value.trim();
  if (!key) return null;
  if (provider === 'anthropic') return key.startsWith('sk-ant-') ? null : 'Anthropic keys usually start with sk-ant-.';
  if (key.startsWith('sk-ant-')) return 'This looks like an Anthropic key. OpenAI keys start with sk-.';
  return key.startsWith('sk-') ? null : 'OpenAI keys usually start with sk-.';
}

function KeyField({
  provider,
  id,
  label,
  placeholder,
  value,
  onChange,
  inputRef,
  getKeyUrl,
  getKeyLabel,
}: {
  provider: 'anthropic' | 'openai';
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  getKeyUrl: string;
  getKeyLabel: string;
}) {
  const [show, setShow] = useState(false);
  const hint = formatHint(provider, value);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className={styles.keyRow}>
        <input
          ref={inputRef}
          id={id}
          className="input mono"
          type={show ? 'text' : 'password'}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-hint`}
        />
        <button
          type="button"
          className="btn btn-sm"
          aria-label={`${show ? 'Hide' : 'Show'} ${label}`}
          aria-controls={id}
          onClick={() => setShow((s) => !s)}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <span id={`${id}-hint`} className="field-hint">
        {hint ? <span className={styles.warn}>{hint} </span> : null}
        <a href={getKeyUrl} target="_blank" rel="noreferrer">
          {getKeyLabel}
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </span>
    </div>
  );
}

/**
 * Public build only: the visitor's own Anthropic and OpenAI keys for Live
 * mode. Same pattern as SettingsMenu: a non-modal popover that Escape or a
 * click outside closes, with focus back on its button. It opens on its own
 * when Live mode is chosen without both keys, or the API answers 401
 * "provider keys required".
 */
export function ProviderKeysMenu() {
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
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const anthropicInput = useRef<HTMLInputElement>(null);
  const openaiInput = useRef<HTMLInputElement>(null);

  useEffect(() => onProviderKeysChange(() => setComplete(hasBothProviderKeys())), []);

  useEffect(
    () =>
      onProviderKeysRequest((request) => {
        const keys = getProviderKeys();
        setReason(request.reason);
        setGoLive(Boolean(request.goLive));
        setSaved(null);
        setAnthropic(keys.anthropic ?? '');
        setOpenai(keys.openai ?? '');
        setRemember(rememberingProviderKeys());
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
    };
  }, [open]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const keys = { anthropic: anthropic.trim() || null, openai: openai.trim() || null };
    if (!keys.anthropic && !keys.openai) {
      clear();
      return;
    }
    const persisted = setProviderKeys(keys, remember);
    setReason(null);
    const where = !persisted
      ? 'Saved for this tab only: browser storage is unavailable.'
      : remember
        ? 'Saved on this device until you clear them.'
        : 'Saved for this tab only; they are forgotten when it closes.';
    if (!hasBothProviderKeys(keys)) {
      setSaved(`${where} Live mode needs both keys.`);
      return;
    }
    if (demo && goLive) {
      setGoLive(false);
      demo.switchTo('live');
      setSaved(`${where} Live mode is on.`);
      return;
    }
    setSaved(demo?.mode === 'recorded' ? `${where} Switch to Live to use them.` : where);
  };

  const clear = () => {
    clearProviderKeys();
    setAnthropic('');
    setOpenai('');
    setGoLive(false);
    if (demo?.mode === 'live') {
      demo.switchTo('recorded');
      setSaved('Cleared from this device. Back to Recorded mode.');
    } else {
      setSaved('Cleared from this device.');
    }
    anthropicInput.current?.focus();
  };

  const stored = getProviderKeys();
  const hasAny = Boolean(stored.anthropic || stored.openai);

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
          setGoLive(false);
          setSaved(null);
          setReason(null);
        }}
        title="Your API keys"
      >
        <Icon name="key" />
        <span className="visually-hidden">Your API keys{complete ? ' (both set)' : ''}</span>
        {complete ? <span className={styles.dot} aria-hidden="true" /> : null}
      </button>

      {open ? (
        <div ref={panel} id={`${uid}-panel`} className={styles.panel} role="dialog" aria-modal="false" aria-labelledby={`${uid}-title`}>
          <h2 id={`${uid}-title`} className={styles.title}>
            Your API keys
          </h2>
          {reason ? (
            <p className={styles.reason} role="alert">
              <Icon name="warning" size={14} /> {reason}
            </p>
          ) : null}
          <p className={styles.intro}>
            Recorded mode needs no keys. Live mode runs on the LIBRAIN API with your own Anthropic key (generation and
            checks) and OpenAI key (embeddings).
          </p>
          <form className={styles.form} onSubmit={save}>
            <KeyField
              provider="anthropic"
              id={`${uid}-anthropic`}
              label="Anthropic API key"
              placeholder="sk-ant-…"
              value={anthropic}
              onChange={setAnthropic}
              inputRef={anthropicInput}
              getKeyUrl="https://console.anthropic.com/settings/keys"
              getKeyLabel="Get a key at console.anthropic.com"
            />
            <KeyField
              provider="openai"
              id={`${uid}-openai`}
              label="OpenAI API key"
              placeholder="sk-…"
              value={openai}
              onChange={setOpenai}
              inputRef={openaiInput}
              getKeyUrl="https://platform.openai.com/api-keys"
              getKeyLabel="Get a key at platform.openai.com/api-keys"
            />
            <label className={styles.check}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} aria-describedby={`${uid}-remember`} />{' '}
              Remember on this device
            </label>
            <span id={`${uid}-remember`} className="field-hint">
              Off: kept for this tab only (sessionStorage). On: kept in this browser (localStorage) until you clear them.
            </span>
            <div className="cluster">
              <button type="submit" className="btn btn-primary btn-sm">
                {goLive ? 'Save and go Live' : 'Save keys'}
              </button>
              <button type="button" className="btn btn-sm" onClick={clear} disabled={!anthropic && !openai && !hasAny}>
                Clear
              </button>
            </div>
            <p className={styles.saved} role="status">
              {saved}
            </p>
          </form>
          <p className={styles.disclaimer}>{KEYS_DISCLAIMER}</p>
          <dl className={styles.facts}>
            <div>
              <dt>Keys are sent only to</dt>
              <dd>
                <code className="mono">{API_BASE_URL || 'this site’s own origin'}</code>
              </dd>
            </div>
            <div>
              <dt>Source code</dt>
              <dd>
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  github.com/erennmutlu1/librain
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
