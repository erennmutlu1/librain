import { useEffect, useId, useRef } from 'react';
import type { PaperSummary, SynthesisCitation } from '../api/types';
import { chunkKey } from '../lib/citations';
import { displayTitle } from '../lib/papers';
import { Icon } from './Icon';
import styles from './CitationPanel.module.css';

/**
 * Non-modal side panel for one citation. Opens with focus on its heading,
 * closes on Escape or the close button, and hands focus back to the caller.
 */
export function CitationPanel({
  citation,
  paper,
  onClose,
}: {
  citation: SynthesisCitation;
  paper: PaperSummary | undefined;
  onClose: () => void;
}) {
  const uid = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const title = displayTitle(paper);

  useEffect(() => {
    headingRef.current?.focus();
  }, [citation]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className={styles.panel} role="dialog" aria-modal="false" aria-labelledby={`${uid}-title`}>
      <div className={styles.head}>
        <span className={styles.number} aria-hidden="true">
          {citation.index}
        </span>
        <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1} className={styles.title}>
          Source {citation.index}
        </h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close source panel">
          <Icon name="close" />
        </button>
      </div>

      <div className={styles.body}>
        <div>
          <p className={styles.paperTitle}>{title ?? citation.paperId}</p>
          {title ? <p className={styles.paperId}>{citation.paperId}</p> : null}
        </div>

        <dl className={styles.facts}>
          <div>
            <dt>Section</dt>
            <dd>{citation.section ?? 'Not recorded'}</dd>
          </div>
          <div>
            <dt>Page</dt>
            <dd className="num">{citation.pageNumber ?? 'Not recorded'}</dd>
          </div>
          <div>
            <dt>Chunk</dt>
            <dd>
              <code className="mono">{chunkKey(citation.paperId, citation.chunkIndex)}</code>
            </dd>
          </div>
        </dl>

        <div>
          <p className={styles.excerptLabel}>Passage</p>
          {citation.content ? (
            <blockquote className={styles.excerpt}>{citation.content}</blockquote>
          ) : (
            <p className={styles.noExcerpt}>
              No passage text came back for this citation (runs recorded before the API returned passages have none).
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
