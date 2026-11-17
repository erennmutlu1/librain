import { useMemo } from 'react';
import { matchSentences } from '../lib/sentences';
import styles from './FencedHypothesis.module.css';

/**
 * The full hypothesis, with the part the model fenced off as its novel claim
 * marked, so readers can see where cited synthesis ends and speculation starts.
 */
export function FencedHypothesis({ hypothesis, novelClaim, className }: { hypothesis: string; novelClaim: string; className?: string }) {
  const span = useMemo(() => {
    if (!novelClaim.trim()) return null;
    return matchSentences(hypothesis, [novelClaim])[0]?.span ?? null;
  }, [hypothesis, novelClaim]);

  if (!span) return <p className={className}>{hypothesis}</p>;
  return (
    <p className={className}>
      {hypothesis.slice(0, span.start)}
      <span className={styles.fence}>
        <span className="visually-hidden">Novel claim begins: </span>
        {hypothesis.slice(span.start, span.end)}
        <span className="visually-hidden"> (novel claim ends)</span>
      </span>
      {hypothesis.slice(span.end)}
    </p>
  );
}
