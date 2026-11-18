import type { NaiveRagResponse } from '../api/types';
import { auditClaimedCitations, chunkKey } from '../lib/citations';
import { formatCount, formatDuration } from '../lib/format';
import { useLang, useT } from '../i18n/lang';
import { text } from './BaselineParts.i18n';
import { Icon } from './Icon';
import { InfoTip } from './InfoTip';
import { PaperRef } from './PaperRef';
import styles from './CompareView.module.css';

/** Naive RAG's claimed citations, with fabricated ones (not among the retrieved passages) marked and linked to their papers. */
export function NaiveCitations({ data }: { data: NaiveRagResponse }) {
  const t = useT(text);
  const audit = auditClaimedCitations(data.claimedCitations, data.fabricatedCitationCount);
  if (audit.total === 0) return <p className="muted small">{t.noCitations}</p>;
  return (
    <div className={styles.citations}>
      <p className={styles.citeSummary}>
        {audit.fabricated.length > 0 ? (
          <>
            <Icon name="warning" size={14} />
            <strong className={styles.fabCount}>
              {t.fabricated(audit.fabricated.length, audit.total)}
            </strong>{' '}
            <InfoTip k="fabricated" />
          </>
        ) : (
          <>
            <Icon name="check" size={14} />
            {t.allIn(audit.total)}
          </>
        )}
      </p>
      {!audit.consistent ? (
        <p className={styles.inconsistent}>
          {t.inconsistent(audit.reportedFabricated, audit.fabricated.length)}
        </p>
      ) : null}
      <ul role="list" className={styles.citeList}>
        {data.claimedCitations.map((c, i) => (
          <li key={i} className={styles.cite} data-fabricated={!c.isResolved || undefined}>
            <PaperRef chunk={chunkKey(c.paperId, c.chunkIndex)} className={styles.citeKey} />
            <span className={styles.citeStatus}>
              {c.isResolved ? t.resolved : t.unresolved}
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
  const t = useT(text);
  const { lang } = useLang();
  const parts: string[] = [];
  if (retrieved !== undefined) parts.push(t.retrieved(formatCount(retrieved, lang)));
  if (ms !== undefined) parts.push(formatDuration(ms));
  if (input !== undefined && output !== undefined) parts.push(t.tokens(formatCount(input, lang), formatCount(output, lang)));
  if (parts.length === 0) return null;
  return <p className={styles.stats}>{parts.join(', ')}</p>;
}
