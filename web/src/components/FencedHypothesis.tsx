import { useMemo } from 'react';
import { useT } from '../i18n/lang';
import { matchSentences } from '../lib/sentences';
import { text } from './FencedHypothesis.i18n';
import styles from './FencedHypothesis.module.css';

/**
 * The full hypothesis, with the part the model fenced off as its novel claim
 * marked, so readers can see where cited synthesis ends and speculation
 * starts. The explanatory key only appears when the claim was found inside
 * the hypothesis (models do not always repeat it there).
 */
export function FencedHypothesis({
  hypothesis,
  novelClaim,
  className,
  withKey = false,
}: {
  hypothesis: string;
  novelClaim: string;
  className?: string;
  withKey?: boolean;
}) {
  const t = useT(text);
  const span = useMemo(() => {
    if (!novelClaim.trim()) return null;
    return matchSentences(hypothesis, [novelClaim])[0]?.span ?? null;
  }, [hypothesis, novelClaim]);

  if (!span) return <p className={className}>{hypothesis}</p>;
  return (
    <>
      <p className={className}>
        {hypothesis.slice(0, span.start)}
        <span className={styles.fence}>
          <span className="visually-hidden">{t.begins}</span>
          {hypothesis.slice(span.start, span.end)}
          <span className="visually-hidden">{t.ends}</span>
        </span>
        {hypothesis.slice(span.end)}
      </p>
      {withKey ? (
        <p className={styles.key}>
          <span className={styles.swatch} aria-hidden="true" /> {t.key}
        </p>
      ) : null}
    </>
  );
}
