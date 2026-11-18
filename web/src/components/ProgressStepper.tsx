import { useEffect, useState } from 'react';
import { buildSteps, type StageDef, type TimedProgress } from '../lib/stages';
import { Icon } from './Icon';
import styles from './ProgressStepper.module.css';

function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
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
  const now = useNow();
  const steps = buildSteps(stages, events, now);
  const latest = events.at(-1);
  const elapsed = Math.max(0, now - startedAt);

  return (
    <section className={styles.root} aria-busy="true" aria-label={title}>
      <div className={styles.head}>
        <div>
          <p className={styles.title}>{title}</p>
          <p className={styles.meta}>
            <span className="num">{seconds(elapsed)}</span> elapsed{expectation ? `. ${expectation}` : ''}
          </p>
        </div>
        {onCancel ? (
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
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
                  {step.status === 'done' ? ' (done)' : step.status === 'active' ? ' (in progress)' : ' (waiting)'}
                </span>
              </p>
              {step.message ? <p className={styles.message}>{step.message}</p> : null}
            </div>
            {step.durationMs !== null && step.status !== 'pending' ? (
              <span className={`${styles.time} num`}>{seconds(step.durationMs)}</span>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="visually-hidden" role="status" aria-live="polite">
        {latest ? latest.message : 'Starting'}
      </p>
    </section>
  );
}
