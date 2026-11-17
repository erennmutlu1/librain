import { useId } from 'react';
import type { MockMatch, MockScenario } from '../api/types';
import { Icon } from './Icon';
import styles from './FormBits.module.css';

export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
  name,
}: {
  legend: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  name: string;
}) {
  return (
    <fieldset className={styles.segmented}>
      <legend className="field-label">{legend}</legend>
      <div className={styles.segments}>
        {options.map((o) => (
          <label key={o.value} className={styles.segment}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Mock mode only: one-click access to every recorded run for this screen. */
export function RecordedRuns<Req>({
  scenarios,
  onPick,
  disabled,
}: {
  scenarios: readonly MockScenario<Req>[] | undefined;
  onPick: (scenario: MockScenario<Req>) => void;
  disabled?: boolean;
}) {
  const uid = useId();
  if (!scenarios || scenarios.length === 0) return null;
  return (
    <div className={styles.recorded} role="group" aria-labelledby={`${uid}-l`}>
      <p id={`${uid}-l`} className={styles.recordedLabel}>
        Recorded runs
      </p>
      <ul role="list" className={styles.recordedList}>
        {scenarios.map((s) => (
          <li key={s.id}>
            <button type="button" className={styles.recordedButton} onClick={() => onPick(s)} disabled={disabled}>
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mock mode only: which recording answered, and anything altered in it. */
export function MockProvenance({ match }: { match: MockMatch | undefined }) {
  if (!match) return null;
  return (
    <div className={`notice ${match.matched ? '' : 'notice-info'} ${styles.provenance}`}>
      <Icon name="doc" />
      <div>
        {match.matched ? null : (
          <p>
            <strong>No recording matches these inputs.</strong> Mock mode is showing the recorded run for “{match.label}”
            instead.
          </p>
        )}
        <p>
          Recorded output: <code className="mono">{match.source}</code>
        </p>
        {match.note ? <p className="muted">{match.note}</p> : null}
      </div>
    </div>
  );
}
