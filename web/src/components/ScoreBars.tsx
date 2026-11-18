import { formatScore } from '../lib/format';
import styles from './ScoreBars.module.css';

export interface ScoreItem {
  key: string;
  label: string;
  value: number | null | undefined;
  hint?: string;
}

/**
 * 0–1 meters: label and printed value on one line, the bar beneath. The
 * number is the data; the bar is a reading aid, so it is hidden from
 * assistive tech. Works at any container width.
 */
export function ScoreBars({ items, label, columns = 1 }: { items: ScoreItem[]; label: string; columns?: 1 | 2 }) {
  return (
    <ul role="list" className={styles.list} aria-label={label} data-columns={columns}>
      {items.map((item) => {
        const value = typeof item.value === 'number' ? Math.min(1, Math.max(0, item.value)) : null;
        return (
          <li key={item.key} className={styles.row}>
            <span className={styles.label}>
              {item.label}
              {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
            </span>
            <span className={`${styles.number} num`}>{value !== null ? formatScore(value) : 'Not scored'}</span>
            <span className={styles.track} aria-hidden="true">
              {value !== null ? <span className={styles.fill} style={{ width: `${value * 100}%` }} /> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function riskBand(value: number): { label: string; tone: 'low' | 'mid' | 'high' } {
  if (value < 0.34) return { label: 'Low', tone: 'low' };
  if (value < 0.67) return { label: 'Moderate', tone: 'mid' };
  return { label: 'High', tone: 'high' };
}

/** Aggregate hallucination risk: the maximum per-sentence probability. Higher is worse. */
export function RiskMeter({ value, failed }: { value: number; failed?: boolean }) {
  const band = riskBand(value);
  return (
    <div className={styles.risk} data-tone={failed ? 'high' : band.tone}>
      <div className={styles.riskHead}>
        <span className={styles.riskTitle}>Aggregate risk</span>
        <span className={`${styles.riskValue} num`}>{formatScore(value)}</span>
        <span className={styles.riskBand}>{failed ? 'Unverified' : band.label}</span>
      </div>
      <span className={styles.riskTrack} aria-hidden="true">
        <span className={styles.riskFill} style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
      </span>
      <p className={styles.riskHint}>
        {failed
          ? 'The validator returned no usable verdicts, so treat the whole claim as unverified.'
          : 'Highest hallucination probability among the novel-claim sentences.'}
      </p>
    </div>
  );
}
