import { useEffect, useState, type ReactNode } from 'react';
import { requestApiKey } from '../api/apiKey';
import { describeError } from '../api/errors';
import { CopyText } from './CopyText';
import { Icon } from './Icon';
import styles from './States.module.css';

/**
 * A failure in plain language: what happened, what to do, and the correlation
 * id when the API gave one. A 401 offers the API-key setting; a 429 says when
 * the request can be retried and holds the retry button until then.
 */
export function ErrorNotice({
  error,
  onRetry,
  retryLabel = 'Try again',
  correlationId: correlationOverride,
}: {
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  correlationId?: string | null;
}) {
  const { title, detail, correlationId, action } = describeError(error);
  const id = correlationOverride ?? correlationId;
  const retryAt = action?.kind === 'retry-at' ? action.at.getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (retryAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const waiting = retryAt !== null && now < retryAt;

  return (
    <div className="notice notice-error" role="alert">
      <Icon name="error" />
      <div className={styles.body}>
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
        {id ? <CopyText value={id} label="Correlation ID" /> : null}
        {action?.kind === 'api-key' || onRetry ? (
          <div className="cluster">
            {action?.kind === 'api-key' ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => requestApiKey(detail ?? title)}>
                Enter API key
              </button>
            ) : null}
            {onRetry ? (
              <button type="button" className="btn btn-sm" onClick={onRetry} disabled={waiting}>
                {retryLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {children ? <div className={styles.emptyBody}>{children}</div> : null}
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}

function useElapsed(since: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, now - since);
}

/**
 * Honest progress for a long, non-streaming call: what is running, how long it
 * has taken, what it usually takes, and a way out.
 */
export function RunningState({
  title,
  expectation,
  startedAt,
  onCancel,
  children,
}: {
  title: string;
  expectation: string;
  startedAt: number;
  onCancel?: () => void;
  children?: ReactNode;
}) {
  const elapsed = useElapsed(startedAt);
  return (
    <div className={styles.running} aria-busy="true">
      <div className={styles.runningHead} role="status">
        <span className={styles.pulse} aria-hidden="true" />
        <div>
          <p className={styles.runningTitle}>{title}</p>
          <p className={styles.runningMeta}>
            <span className="num">{(elapsed / 1000).toFixed(0)} s</span> elapsed. {expectation}
          </p>
        </div>
        {onCancel ? (
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Grey placeholder lines in the shape of the coming content. */
export function SkeletonLines({ lines = 4 }: { lines?: number }) {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ width: `${i === lines - 1 ? 55 : 92 - (i % 3) * 9}%` }} />
      ))}
    </div>
  );
}
