import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { getApiKey, onApiKeyRequest, setApiKey } from '../api/apiKey';
import { API_BASE_URL } from '../api/config';
import { useApi } from '../api/context';
import { useT } from '../i18n/lang';
import { Icon } from './Icon';
import { text } from './SettingsMenu.i18n';
import styles from './SettingsMenu.module.css';

/**
 * Header popover for connection settings: the optional API key (sent as
 * X-Api-Key) and where requests go. Opens on its own when the API answers 401.
 * Non-modal: Escape or a click outside closes it and focus returns to the
 * button.
 */
export function SettingsMenu() {
  const t = useT(text);
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
    setSaved(value.trim() ? (persisted ? t.saved : t.savedTabOnly) : t.cleared);
  };

  const clear = () => {
    setValue('');
    setApiKey(null);
    setSaved(t.cleared);
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
        title={t.trigger}
      >
        <Icon name="key" />
        <span className="visually-hidden">
          {t.trigger}
          {hasKey ? t.keySet : ''}
        </span>
        {hasKey ? <span className={styles.dot} aria-hidden="true" /> : null}
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
          <form className={styles.form} onSubmit={save}>
            <div className="field">
              <label className="field-label" htmlFor={`${uid}-key`}>
                {t.keyLabel}
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
                {t.keyHint}
              </span>
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> {t.showKey}
            </label>
            <div className="cluster">
              <button type="submit" className="btn btn-primary btn-sm">
                {t.save}
              </button>
              <button type="button" className="btn btn-sm" onClick={clear} disabled={!value && !hasKey}>
                {t.clear}
              </button>
            </div>
            <p className={styles.saved} role="status">
              {saved}
            </p>
          </form>
          <dl className={styles.facts}>
            <div>
              <dt>{t.data}</dt>
              <dd>{api.mode === 'mock' ? t.mock : t.live}</dd>
            </div>
            <div>
              <dt>{t.address}</dt>
              <dd>
                <code className="mono">{API_BASE_URL || t.sameOrigin}</code>
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
