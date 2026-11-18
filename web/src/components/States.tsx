import { useEffect, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { useLang, useT } from '../i18n/lang';
import { requestApiKey } from '../api/apiKey';
import { describeError } from '../api/errors';
import { requestProviderKeys } from '../api/providerKeys';
import { usePublicDemo } from '../public/context';
import { Icon } from './Icon';
import { RequestId } from './TechDetails';
import { text } from './States.i18n';
import styles from './States.module.css';

/**
 * A failure in plain language: what happened, what to do, and the request
 * ID (under Technical details) when the API gave one. A 401 offers the API-key setting (the visitor's
 * own provider keys on the public site); a 429 says when the request can be
 * retried and holds the retry button until then. Outcomes that are not
 * failures, such as the public demo having no recording for the inputs, show
 * as information and offer the recorded ideas or Live mode instead of a retry.
 */
export function ErrorNotice({
  error,
  onRetry,
  retryLabel,
  correlationId: correlationOverride,
}: {
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  correlationId?: string | null;
}) {
  const t = useT(text);
  const { lang } = useLang();
  const demo = usePublicDemo();
  const inRouter = useInRouterContext();
  const { title, detail, correlationId, action, tone = 'error', retryable = true } = describeError(error, undefined, {
    publicDemo: demo !== null,
    lang,
  });
  const id = correlationOverride ?? correlationId;
  const retryAt = action?.kind === 'retry-at' ? action.at.getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (retryAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const waiting = retryAt !== null && now < retryAt;
  const goLive = action?.kind === 'go-live' && demo?.mode === 'recorded' ? demo : null;
  const canRetry = Boolean(onRetry) && retryable;

  return (
    <div className={`notice ${tone === 'info' ? 'notice-info' : 'notice-error'}`} role={tone === 'info' ? 'status' : 'alert'}>
      <Icon name={tone === 'info' ? 'info' : 'error'} />
      <div className={styles.body}>
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
        <RequestId value={id} />
        {action?.kind === 'api-key' || action?.kind === 'provider-keys' || goLive || canRetry ? (
          <div className="cluster">
            {action?.kind === 'api-key' ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => requestApiKey(detail ?? title)}>
                {t.enterApiKey}
              </button>
            ) : null}
            {action?.kind === 'provider-keys' ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => requestProviderKeys({ reason: title })}>
                {t.enterKeys}
              </button>
            ) : null}
            {goLive && inRouter ? (
              <Link to="/explore" className="btn btn-sm">
                {t.openIdeas}
              </Link>
            ) : null}
            {goLive ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => goLive.switchTo('live')}>
                {t.switchLive}
              </button>
            ) : null}
            {canRetry ? (
              <button type="button" className="btn btn-sm" onClick={onRetry} disabled={waiting}>
                {retryLabel ?? t.retry}
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
  const t = useT(text);
  const elapsed = useElapsed(startedAt);
  return (
    <div className={styles.running} aria-busy="true">
      <div className={styles.runningHead} role="status">
        <span className={styles.pulse} aria-hidden="true" />
        <div>
          <p className={styles.runningTitle}>{title}</p>
          <p className={styles.runningMeta}>
            <span className="num">{(elapsed / 1000).toFixed(0)} {t.sec}</span> {t.elapsed}. {expectation}
          </p>
        </div>
        {onCancel ? (
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            {t.cancel}
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
