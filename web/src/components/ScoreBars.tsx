import type { GlossaryTermKey } from '../explore/glossary';
import { useLang, useT } from '../i18n/lang';
import { text } from './ScoreBars.i18n';
import { formatScore } from '../lib/format';
import { riskBand } from '../lib/scoreItems';
import { InfoTip } from './InfoTip';
import styles from './ScoreBars.module.css';

export interface ScoreItem {
  key: string;
  label: string;
  value: number | null | undefined;
  hint?: string;
  /** The glossary entry behind the label's ⓘ. */
  info?: GlossaryTermKey;
}

/**
 * 0–1 meters: label and printed value on one line, the bar beneath. The
 * number is the data; the bar is a reading aid, so it is hidden from
 * assistive tech. The scale is stated once, above the list. Works at any
 * container width.
 */
export function ScoreBars({ items, label, columns = 1 }: { items: ScoreItem[]; label: string; columns?: 1 | 2 }) {
  const t = useT(text);
  const { lang } = useLang();
  return (
    <div className={styles.panel}>
      <p className={styles.scale}>{t.scale}</p>
      <ul role="list" className={styles.list} aria-label={label} data-columns={columns}>
        {items.map((item) => {
          const value = typeof item.value === 'number' ? Math.min(1, Math.max(0, item.value)) : null;
          return (
            <li key={item.key} className={styles.row}>
              <span className={styles.label}>
                {item.label}
                {item.info ? (
                  <>
                    {' '}
                    <InfoTip k={item.info} label={item.label} />
                  </>
                ) : null}
                {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
              </span>
              <span className={`${styles.number} num`}>{value !== null ? formatScore(value, 2, lang) : t.notScored}</span>
              <span className={styles.track} aria-hidden="true">
                {value !== null ? <span className={styles.fill} style={{ width: `${value * 100}%` }} /> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Claim risk: the highest per-sentence hallucination probability (0–1). Higher is worse. */
export function RiskMeter({ value, failed }: { value: number; failed?: boolean }) {
  const t = useT(text);
  const { lang } = useLang();
  const band = riskBand(value, lang);
  return (
    <div className={styles.risk} data-tone={failed ? 'high' : band.tone}>
      <div className={styles.riskHead}>
        <span className={styles.riskTitle}>
          {t.claimRisk} <InfoTip k="risk" label={t.claimRisk} />
        </span>
        <span className={`${styles.riskValue} num`}>{formatScore(value, 2, lang)}</span>
        <span className={styles.riskBand}>{failed ? t.unverified : band.label}</span>
      </div>
      <span className={styles.riskTrack} aria-hidden="true">
        <span className={styles.riskFill} style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
      </span>
      <p className={styles.riskHint}>{failed ? t.failedHint : t.hint}</p>
    </div>
  );
}
