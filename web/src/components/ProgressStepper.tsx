import { useEffect, useState } from 'react';
import { useLang, useT } from '../i18n/lang';
import { formatScore } from '../lib/format';
import { buildSteps, progressMessage, type StageDef, type TimedProgress } from '../lib/stages';
import { Icon } from './Icon';
import { text } from './ProgressStepper.i18n';
import styles from './ProgressStepper.module.css';

function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}


/**
 * Live view of a streaming run: each pipeline stage with the server's own
 * message ("Found 12 distinct passages"), how long it took, total elapsed time
 * and a way to cancel. The latest message is announced politely to screen
 * readers.
 */
export function ProgressStepper({
  title,
  stages,
  events,
  startedAt,
  onCancel,
  expectation,
}: {
  title: string;
  stages: readonly StageDef[];
  events: readonly TimedProgress[];
  startedAt: number;
  onCancel?: () => void;
  expectation?: string;
}) {
  const t = useT(text);
  const { lang } = useLang();
  const now = useNow();
  const steps = buildSteps(stages, events, now, false, lang);
  const seconds = (ms: number) => `${ms < 10_000 ? formatScore(ms / 1000, 1, lang) : Math.round(ms / 1000)} ${t.sec}`;
  const latest = events.at(-1);
  const elapsed = Math.max(0, now - startedAt);

  return (
    <section className={styles.root} aria-busy="true" aria-label={title}>
      <div className={styles.head}>
        <div>
          <p className={styles.title}>{title}</p>
          <p className={styles.meta}>
            <span className="num">{seconds(elapsed)}</span> {t.elapsed}{expectation ? `. ${expectation}` : ''}
          </p>
        </div>
        {onCancel ? (
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            {t.cancel}
          </button>
        ) : null}
      </div>

      <ol className={styles.steps}>
        {steps.map((step, i) => (
          <li key={step.key} className={styles.step} data-status={step.status} aria-current={step.status === 'active' ? 'step' : undefined}>
            <span className={styles.marker} aria-hidden="true">
              {step.status === 'done' ? <Icon name="check" size={12} /> : i + 1}
            </span>
            <div className={styles.body}>
              <p className={styles.label}>
                {step.label}
                <span className="visually-hidden">
                  {step.status === 'done' ? t.done : step.status === 'active' ? t.active : t.waiting}
                </span>
              </p>
              {step.message ? <p className={styles.message}>{progressMessage(step.message, lang)}</p> : null}
            </div>
            {step.durationMs !== null && step.status !== 'pending' ? (
              <span className={`${styles.time} num`}>{seconds(step.durationMs)}</span>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="visually-hidden" role="status" aria-live="polite">
        {latest ? progressMessage(latest.message, lang) : t.starting}
      </p>
    </section>
  );
}
