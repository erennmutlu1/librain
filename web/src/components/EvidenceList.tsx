import type { PaperSummary, SupportingEvidence } from '../api/types';
import { chunkKey } from '../lib/citations';
import { displayTitle } from '../lib/papers';
import { Passage } from './Passage';
import styles from './EvidenceList.module.css';

export function EvidenceList({ evidence, papers }: { evidence: readonly SupportingEvidence[]; papers: Map<string, PaperSummary> }) {
  if (evidence.length === 0) {
    return <p className="muted small">No supporting evidence survived the citation contract.</p>;
  }
  return (
    <ul role="list" className={styles.list}>
      {evidence.map((e) => {
        const title = displayTitle(papers.get(e.paperId));
        return (
          <li key={chunkKey(e.paperId, e.chunkIndex)} className={styles.item}>
            <div className={styles.top}>
              <code className={styles.key}>{chunkKey(e.paperId, e.chunkIndex)}</code>
              <span className="tag" title={e.supportType === 'direct' ? 'Directly supports the hypothesis' : 'Supports by analogy from another domain'}>
                {e.supportType}
              </span>
            </div>
            {title ? <p className={styles.title}>{title}</p> : null}
            <p className={styles.where}>
              {[e.section, e.pageNumber !== null ? `page ${e.pageNumber}` : null].filter(Boolean).join(', ') || 'Section not recorded'}
            </p>
            {e.content ? <Passage text={e.content} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
