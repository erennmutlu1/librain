import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import styles from './CopyText.module.css';

async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** A small, copyable identifier such as a correlation ID. */
export function CopyText({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!value) return null;

  const onCopy = async () => {
    const ok = await copy(value);
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1800);
  };

  return (
    <span className={styles.root}>
      <span className={styles.label}>{label}</span>
      <code className={styles.value}>{value}</code>
      <button type="button" className={styles.button} onClick={onCopy} aria-label={`Copy ${label.toLowerCase()}`}>
        <Icon name={state === 'copied' ? 'check' : 'copy'} size={14} />
      </button>
      <span role="status" className="visually-hidden">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : ''}
      </span>
    </span>
  );
}
