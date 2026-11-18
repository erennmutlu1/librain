import type { ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { useT } from '../i18n/lang';
import { parseChunkKey } from '../lib/citations';
import { paperExternalUrl, paperHref, paperInfo } from '../lib/paperCatalog';
import { Icon } from './Icon';
import { text } from './PaperRef.i18n';
import styles from './PaperRef.module.css';

/** An in-app link that still renders (as a plain link) outside a router, e.g. in a unit test. */
function AppLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const inRouter = useInRouterContext();
  return inRouter ? (
    <Link to={to} className={className}>
      {children}
    </Link>
  ) : (
    <a href={to} className={className}>
      {children}
    </a>
  );
}

/**
 * A citation as written ("self-rag:1", "pharmagents"), linked to that paper on
 * the Papers page, plus the paper on arXiv (new tab) when the catalogue knows
 * it. The id stays visible as text, because it is the citation itself.
 */
export function PaperRef({ chunk, className }: { chunk: string; className?: string }) {
  const t = useT(text);
  const { paperId } = parseChunkKey(chunk);
  const external = paperExternalUrl(paperId);
  const onArxiv = paperInfo(paperId).arxivId !== null;
  return (
    <span className={`${styles.root}${className ? ` ${className}` : ''}`}>
      <AppLink to={paperHref(paperId)} className={styles.id}>
        <code className={styles.code}>{chunk}</code>{' '}
        <span className="visually-hidden">{t.inPapers}</span>
      </AppLink>
      {external ? (
        <a href={external} target="_blank" rel="noopener noreferrer" className={styles.external}>
          {onArxiv ? t.arxiv : t.paperPage}
          <Icon name="external" size={12} />{' '}
          <span className="visually-hidden">{t.newTab}</span>
        </a>
      ) : null}
    </span>
  );
}
