import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { getApiKey, onApiKeyRequest, setApiKey } from '../api/apiKey';
import { API_BASE_URL } from '../api/config';
import { useApi } from '../api/context';
import { Icon } from './Icon';
import styles from './SettingsMenu.module.css';

/**
 * Header popover for connection settings: the optional API key (sent as
 * X-Api-Key) and where requests go. Opens on its own when the API answers 401.
 * Non-modal: Escape or a click outside closes it and focus returns to the
 * button.
 */
export function SettingsMenu() {
  const api = useApi();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [value, setValue] = useState(() => getApiKey() ?? '');
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      onApiKeyRequest((why) => {
        setReason(why);
        setSaved(null);
        setValue(getApiKey() ?? '');
        setOpen(true);
      }),
    [],
  );

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
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
    const persisted = setApiKey(value);
    setReason(null);
    setSaved(
      value.trim()
        ? persisted
          ? 'Saved. Every request now sends it as X-Api-Key.'
          : 'Saved for this tab only: browser storage is unavailable.'
        : 'Cleared. Requests are sent without a key.',
    );
  };

  const clear = () => {
    setValue('');
    setApiKey(null);
    setSaved('Cleared. Requests are sent without a key.');
    input.current?.focus();
  };

  const hasKey = Boolean(getApiKey());

  return (
    <div className={styles.root}>
      <button
        ref={button}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        onClick={() => {
          setOpen((o) => !o);
          setSaved(null);
        }}
        title="Connection settings"
      >
        <Icon name="key" />
        <span className="visually-hidden">Connection settings{hasKey ? ' (API key set)' : ''}</span>
        {hasKey ? <span className={styles.dot} aria-hidden="true" /> : null}
      </button>

      {open ? (
        <div ref={panel} id={`${uid}-panel`} className={styles.panel} role="dialog" aria-modal="false" aria-labelledby={`${uid}-title`}>
          <h2 id={`${uid}-title`} className={styles.title}>
            Connection
          </h2>
          {reason ? (
            <p className={styles.reason} role="alert">
              <Icon name="warning" size={14} /> {reason}
            </p>
          ) : null}
          <form className={styles.form} onSubmit={save}>
            <div className="field">
              <label className="field-label" htmlFor={`${uid}-key`}>
                API key
              </label>
              <input
                ref={input}
                id={`${uid}-key`}
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-describedby={`${uid}-hint`}
              />
              <span id={`${uid}-hint`} className="field-hint">
                Only needed when the server sets Security:ApiKey. Stored in this browser and sent as X-Api-Key.
              </span>
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show key
            </label>
            <div className="cluster">
              <button type="submit" className="btn btn-primary btn-sm">
                Save key
              </button>
              <button type="button" className="btn btn-sm" onClick={clear} disabled={!value && !hasKey}>
                Clear
              </button>
            </div>
            <p className={styles.saved} role="status">
              {saved}
            </p>
          </form>
          <dl className={styles.facts}>
            <div>
              <dt>Data</dt>
              <dd>{api.mode === 'mock' ? 'Mock mode: recorded runs, the API is never called' : 'Live API'}</dd>
            </div>
            <div>
              <dt>API address</dt>
              <dd>
                <code className="mono">{API_BASE_URL || 'same origin (dev proxy)'}</code>
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
