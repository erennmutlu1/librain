import styles from './ContractSummary.module.css';

/**
 * How much work LIBRAIN's citation contract did on this run: of the chunks the
 * model claimed as support, how many were dropped for not being in the
 * retrieved set (fabrications Naive-RAG would have kept).
 */
export function ContractSummary({
  claimed,
  dropped,
  kept,
}: {
  claimed: number | undefined;
  dropped: number | undefined;
  kept: number;
}) {
  if (claimed === undefined) {
    return (
      <div className={styles.root}>
        <p className={styles.title}>Citation contract</p>
        <p className={styles.text}>
          {kept} supporting {kept === 1 ? 'chunk' : 'chunks'} kept. This run predates the claimed/dropped counters, so
          the number dropped is not recorded.
        </p>
      </div>
    );
  }
  const droppedCount = dropped ?? 0;
  const total = Math.max(claimed, kept + droppedCount);
  return (
    <div className={styles.root} data-dropped={droppedCount > 0 || undefined}>
      <p className={styles.title}>
        Citation contract {droppedCount > 0 ? `dropped ${droppedCount}` : 'dropped none'}
      </p>
      <div className={styles.boxes} aria-hidden="true">
        {Array.from({ length: Math.min(total, 24) }, (_, i) => (
          <span key={i} className={i < total - droppedCount ? styles.kept : styles.dropped} />
        ))}
      </div>
      <p className={styles.text}>
        The model claimed {claimed} supporting {claimed === 1 ? 'chunk' : 'chunks'};{' '}
        {droppedCount > 0
          ? `${droppedCount} ${droppedCount === 1 ? 'was' : 'were'} not in the retrieved set and ${droppedCount === 1 ? 'was' : 'were'} removed before you saw them.`
          : 'every one was in the retrieved set.'}
      </p>
    </div>
  );
}
