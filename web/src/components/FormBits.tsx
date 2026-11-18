import type { MockMatch, MockScenario } from '../api/types';
import { useT } from '../i18n/lang';
import { Icon } from './Icon';
import { text } from './FormBits.i18n';
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

/**
 * Mock mode only: one-click access to every recorded run for this screen.
 * Collapses into a disclosure once a result is showing, so the result keeps
 * the reader's attention.
 */
export function RecordedRuns<Req>({
  scenarios,
  onPick,
  disabled,
  collapsed = false,
}: {
  scenarios: readonly MockScenario<Req>[] | undefined;
  onPick: (scenario: MockScenario<Req>) => void;
  disabled?: boolean;
  collapsed?: boolean;
}) {
  const t = useT(text);
  if (!scenarios || scenarios.length === 0) return null;
  return (
    <details key={collapsed ? 'closed' : 'open'} className={styles.recorded} open={!collapsed}>
      <summary className={styles.recordedLabel}>
        {t.recordedRuns} <span className="num">({scenarios.length})</span>
      </summary>
      {/* The public Discover list has 50 runs: past a dozen it scrolls instead of pushing the page down. */}
      <ul role="list" className={styles.recordedList} data-long={scenarios.length > 12 || undefined}>
        {scenarios.map((s) => (
          <li key={s.id}>
            <button type="button" className={styles.recordedButton} onClick={() => onPick(s)} disabled={disabled}>
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Mock mode only: which recording answered, and anything altered in it. */
export function MockProvenance({ match }: { match: MockMatch | undefined }) {
  const t = useT(text);
  if (!match) return null;
  return (
    <div className={`notice ${match.matched ? '' : 'notice-info'} ${styles.provenance}`}>
      <Icon name="doc" />
      <div>
        {match.matched ? null : (
          <p>
            <strong>{t.noMatch}</strong> {t.showingInstead(match.label)}
          </p>
        )}
        <p>
          {t.recordedOutput} <code className="mono">{match.source}</code>
        </p>
        {match.note ? <p className="muted">{match.note}</p> : null}
      </div>
    </div>
  );
}
