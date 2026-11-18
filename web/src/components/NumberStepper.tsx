import { useId, useState, type KeyboardEvent } from 'react';
import { useLang, useT } from '../i18n/lang';
import { formatCount } from '../lib/format';
import { text } from './NumberStepper.i18n';
import styles from './NumberStepper.module.css';

/*
 * A whole-number field with − and + buttons: the ARIA spinbutton pattern on a
 * text input (inputMode numeric, so phones show digits). Arrow keys step,
 * Page Up/Down step by five, Home/End jump to the limits, typing works, and
 * leaving the field clamps the value into range (or restores the last valid
 * one when it is empty). The buttons stay out of the Tab order, as in the
 * pattern, since the arrow keys do the same from the field.
 *
 * The value is the field's text, as the forms store it, so a half-typed
 * value is never rewritten under the cursor.
 */

export interface NumberStepperProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step?: number;
  /** Shown under the field; defaults to "1 to 20". Pass null to hide it. */
  hint?: string | null;
  disabled?: boolean;
  id?: string;
  className?: string;
}

const PAGE = 5;

function toNumber(value: string): number | null {
  const v = value.trim();
  return /^\d+$/.test(v) ? Number(v) : null;
}

export function NumberStepper({ label, value, onChange, min, max, step = 1, hint, disabled, id, className }: NumberStepperProps) {
  const t = useT(text);
  const { lang } = useLang();
  const uid = useId();
  const inputId = id ?? `${uid}-n`;
  const parsed = toNumber(value);
  const inRange = (n: number | null): n is number => n !== null && n >= min && n <= max;
  // What an emptied field goes back to on blur.
  const [lastValid, setLastValid] = useState(() => (inRange(parsed) ? parsed : min));

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const base = parsed ?? lastValid;
  const emit = (next: string) => {
    const n = toNumber(next);
    if (inRange(n)) setLastValid(n);
    onChange(next);
  };
  const set = (n: number) => emit(String(clamp(n)));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const moves: Record<string, () => number> = {
      ArrowUp: () => base + step,
      ArrowDown: () => base - step,
      PageUp: () => base + PAGE * step,
      PageDown: () => base - PAGE * step,
      Home: () => min,
      End: () => max,
    };
    const move = moves[event.key];
    if (!move || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    set(move());
  };

  const hintText = hint === undefined ? t.range(formatCount(min, lang), formatCount(max, lang)) : hint;

  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.stepper} data-disabled={disabled || undefined}>
        <button
          type="button"
          className={styles.button}
          tabIndex={-1}
          aria-label={t.decrease(label)}
          aria-controls={inputId}
          disabled={disabled || base <= min}
          onClick={() => set(base - step)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <input
          id={inputId}
          className={`num ${styles.input}`}
          type="text"
          inputMode="numeric"
          role="spinbutton"
          autoComplete="off"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={parsed ?? undefined}
          aria-describedby={hintText ? `${uid}-hint` : undefined}
          value={value}
          disabled={disabled}
          // Digits only; anything else typed or pasted is dropped.
          onChange={(e) => emit(e.target.value.replace(/\D+/g, '').slice(0, String(max).length + 1))}
          onKeyDown={onKeyDown}
          onBlur={() => {
            const next = parsed === null ? lastValid : clamp(parsed);
            if (String(next) !== value) emit(String(next));
          }}
        />
        <button
          type="button"
          className={styles.button}
          tabIndex={-1}
          aria-label={t.increase(label)}
          aria-controls={inputId}
          disabled={disabled || base >= max}
          onClick={() => set(base + step)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M2.5 6h7M6 2.5v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {hintText ? (
        <span id={`${uid}-hint`} className="field-hint">
          {hintText}
        </span>
      ) : null}
    </div>
  );
}
