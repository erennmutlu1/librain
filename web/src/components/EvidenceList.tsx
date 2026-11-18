import type { PaperSummary, SupportingEvidence } from '../api/types';
import { chunkKey } from '../lib/citations';
import { paperTitleFor } from '../lib/papers';
import { PaperRef } from './PaperRef';
import { Passage } from './Passage';
import { useT } from '../i18n/lang';
import { text } from './EvidenceList.i18n';
import styles from './EvidenceList.module.css';

export function EvidenceList({ evidence, papers }: { evidence: readonly SupportingEvidence[]; papers: Map<string, PaperSummary> }) {
  const t = useT(text);
  if (evidence.length === 0) {
    return <p className="muted small">{t.none}</p>;
  }
  return (
    <ul role="list" className={styles.list}>
      {evidence.map((e) => {
        const key = chunkKey(e.paperId, e.chunkIndex);
        const title = paperTitleFor(e.paperId, papers);
        return (
          <li key={key} className={styles.item}>
            <div className={styles.top}>
              <PaperRef chunk={key} />
              <span className="tag" title={e.supportType === 'direct' ? t.direct : t.other}>
                {t.supportTypes[e.supportType] ?? e.supportType}
              </span>
            </div>
            {title ? <p className={styles.title}>{title}</p> : null}
            <p className={styles.where}>
              {[e.section, e.pageNumber !== null ? t.page(e.pageNumber) : null].filter(Boolean).join(', ') || t.notRecorded}
            </p>
            {e.content ? <Passage text={e.content} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
