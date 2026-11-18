import { useId, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useLang, useT } from '../i18n/lang';
import { formatCount } from '../lib/format';
import { Icon } from './Icon';
import { text } from './NumberStepper.i18n';
import styles from './NumberStepper.module.css';

/*
 * A whole-number field with − and + buttons: the ARIA spinbutton pattern on a
 * text input (inputMode numeric, so phones show digits). Arrow keys step,
 * Page Up/Down step by five, Home/End jump to the limits, typing works, and
 * leaving the field clamps the value into range (or restores the last valid
 * one when it is empty). The buttons stay out of the Tab order, as in the
 * pattern, since the arrow keys do the same from the field, and they never
 * take focus: a button that disables itself at a limit would otherwise drop
 * focus to the page.
 *
 * The value is the field's text, as the forms store it, so a half-typed
 * value is never rewritten under the cursor. While it is out of range the
 * field is aria-invalid and has no aria-valuenow (a value above max is not a
 * valid spinbutton state); screen readers then read the typed text.
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
  /** A form-level error for this field, shown under the hint and announced. */
  error?: string | null;
  /** Marks the field invalid (an error shown elsewhere). `error` implies it. */
  invalid?: boolean;
  /** Extra ids for aria-describedby, after the hint and the error. */
  describedBy?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

const PAGE = 5;

function toNumber(value: string): number | null {
  const v = value.trim();
  return /^\d+$/.test(v) ? Number(v) : null;
}

/** Keeps focus where it is (the field) when a − or + button is pressed. */
const keepFocus = (event: MouseEvent) => event.preventDefault();

export function NumberStepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  error,
  invalid,
  describedBy,
  disabled,
  id,
  className,
}: NumberStepperProps) {
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
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-err`;
  // Typed digits outside the range are invalid as they stand (blur will clamp them).
  const outOfRange = parsed !== null && !inRange(parsed);
  const isInvalid = Boolean(error) || Boolean(invalid) || outOfRange;
  const describedByIds = [hintText ? hintId : null, error ? errorId : null, describedBy].filter(Boolean).join(' ') || undefined;

  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.stepper} data-disabled={disabled || undefined} data-invalid={isInvalid || undefined}>
        <button
          type="button"
          className={styles.button}
          tabIndex={-1}
          aria-label={t.decrease(label)}
          aria-controls={inputId}
          disabled={disabled || base <= min}
          onMouseDown={keepFocus}
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
          aria-valuenow={inRange(parsed) ? parsed : undefined}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describedByIds}
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
          onMouseDown={keepFocus}
          onClick={() => set(base + step)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M2.5 6h7M6 2.5v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {hintText ? (
        <span id={hintId} className="field-hint">
          {hintText}
        </span>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          <Icon name="error" size={14} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
