import type { NaiveRagResponse } from '../api/types';
import { auditClaimedCitations, chunkKey } from '../lib/citations';
import { formatCount, formatDuration } from '../lib/format';
import { Icon } from './Icon';
import styles from './CompareView.module.css';

/** Naive-RAG's claimed citations, with fabricated ones (not in the retrieved set) marked. */
export function NaiveCitations({ data }: { data: NaiveRagResponse }) {
  const audit = auditClaimedCitations(data.claimedCitations, data.fabricatedCitationCount);
  if (audit.total === 0) return <p className="muted small">The model claimed no citations.</p>;
  return (
    <div className={styles.citations}>
      <p className={styles.citeSummary}>
        {audit.fabricated.length > 0 ? (
          <>
            <Icon name="warning" size={14} />
            <strong className={styles.fabCount}>
              {audit.fabricated.length} of {audit.total} citations fabricated
            </strong>
          </>
        ) : (
          <>
            <Icon name="check" size={14} />
            All {audit.total} citations are in the retrieved set
          </>
        )}
      </p>
      {!audit.consistent ? (
        <p className={styles.inconsistent}>
          The API reported {audit.reportedFabricated} fabricated, but {audit.fabricated.length} citations are marked
          unresolved.
        </p>
      ) : null}
      <ul role="list" className={styles.citeList}>
        {data.claimedCitations.map((c, i) => (
          <li key={i} className={styles.cite} data-fabricated={!c.isResolved || undefined}>
            <code className={styles.citeKey}>{chunkKey(c.paperId, c.chunkIndex)}</code>
            <span className={styles.citeStatus}>
              {c.isResolved ? 'In retrieved set' : 'Fabricated: not in the retrieved set'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RunStats({
  ms,
  input,
  output,
  retrieved,
}: {
  ms?: number | undefined;
  input?: number | undefined;
  output?: number | undefined;
  retrieved?: number | undefined;
}) {
  const parts: string[] = [];
  if (retrieved !== undefined) parts.push(`${formatCount(retrieved)} chunks retrieved`);
  if (ms !== undefined) parts.push(formatDuration(ms));
  if (input !== undefined && output !== undefined) parts.push(`${formatCount(input)} in / ${formatCount(output)} out tokens`);
  if (parts.length === 0) return null;
  return <p className={styles.stats}>{parts.join(', ')}</p>;
}
