import { useT } from '../i18n/lang';
import { text } from './ContractSummary.i18n';
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
  const t = useT(text);
  if (claimed === undefined) {
    return (
      <div className={styles.root}>
        <p className={styles.title}>{t.title}</p>
        <p className={styles.text}>{t.legacy(kept)}</p>
      </div>
    );
  }
  const droppedCount = dropped ?? 0;
  const total = Math.max(claimed, kept + droppedCount);
  return (
    <div className={styles.root} data-dropped={droppedCount > 0 || undefined}>
      <p className={styles.title}>
        {t.heading(droppedCount)}
      </p>
      <div className={styles.boxes} aria-hidden="true">
        {Array.from({ length: Math.min(total, 24) }, (_, i) => (
          <span key={i} className={i < total - droppedCount ? styles.kept : styles.dropped} />
        ))}
      </div>
      <p className={styles.text}>
        {t.claimed(claimed)} {droppedCount > 0 ? t.removed(droppedCount) : t.allIn}
      </p>
    </div>
  );
}
