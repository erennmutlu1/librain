import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type {
  ClaimStatus,
  ClaimValidationEntry,
  ClaimValidationResult,
  ExtrapolationBasis,
  PaperSummary,
  SupportingEvidence,
} from '../api/types';
import { useLang, useT } from '../i18n/lang';
import { chunkKey, parseChunkKey } from '../lib/citations';
import { formatPercent } from '../lib/format';
import { displayTitle } from '../lib/papers';
import { annotate } from '../lib/sentences';
import { basisMeta, STATUS_ORDER, statusMeta } from '../lib/vocabulary';
import { Icon, StatusIcon } from './Icon';
import { Passage } from './Passage';
import { text } from './AnnotatedClaim.i18n';
import styles from './AnnotatedClaim.module.css';

interface Props {
  novelClaim: string;
  validation: ClaimValidationResult | null;
  basis: readonly ExtrapolationBasis[];
  evidence: readonly SupportingEvidence[];
  papers: Map<string, PaperSummary>;
  /** Puts the margin note under the text (narrow columns). */
  compact?: boolean;
}

function defaultIndex(claims: readonly ClaimValidationEntry[]): number | null {
  if (claims.length === 0) return null;
  let best = 0;
  claims.forEach((c, i) => {
    if (c.factualHallucinationProbability > claims[best]!.factualHallucinationProbability) best = i;
  });
  return best;
}

export function StatusLegend({ counts, compact = false }: { counts?: Record<ClaimStatus, number>; compact?: boolean }) {
  const t = useT(text);
  const { lang } = useLang();
  return (
    <ul className={styles.legend} role="list" aria-label={t.legend} data-compact={compact || undefined}>
      {STATUS_ORDER.map((status) => (
        <li key={status} className={styles.legendItem}>
          <StatusIcon status={status} />
          <span className={`${styles.legendSample} ${styles[status]}`} aria-hidden="true">
            Aa
          </span>
          <span>
            <span className={styles.legendLabel}>{statusMeta(status, lang).label}</span>
            {counts ? <span className={`${styles.legendCount} num`}> {counts[status]}</span> : null}
            {compact ? null : <span className={styles.legendDesc}>{statusMeta(status, lang).description}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StatusBadge({ status }: { status: ClaimStatus }) {
  const { lang } = useLang();
  return (
    <span className={styles.badge} data-status={status}>
      <StatusIcon status={status} size={12} />
      {statusMeta(status, lang).label}
    </span>
  );
}

/**
 * The novel claim with every validator verdict painted onto its sentence.
 * Hover or focus a sentence to read the verdict in the margin note; click or
 * press Enter to pin it.
 */
export function AnnotatedClaim({ novelClaim, validation, basis, evidence, papers, compact = false }: Props) {
  const t = useT(text);
  const { lang } = useLang();
  const uid = useId();
  const noteId = `${uid}-note`;
  const claims = useMemo(() => validation?.claims ?? [], [validation]);
  const failed = validation?.validationFailed === true;

  const annotation = useMemo(
    () => annotate(novelClaim, claims.map((c) => c.sentence), basis.map((b) => b.claimSentence)),
    [novelClaim, claims, basis],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const interacting = hovered ?? focused ?? pinned;
  const shown = interacting ?? defaultIndex(claims);

  const counts = useMemo(() => {
    const c: Record<ClaimStatus, number> = { grounded: 0, extrapolated: 0, risky: 0 };
    for (const claim of claims) c[claim.status]++;
    return c;
  }, [claims]);

  const evidenceByKey = useMemo(() => {
    const map = new Map<string, SupportingEvidence>();
    for (const e of evidence) map.set(chunkKey(e.paperId, e.chunkIndex), e);
    return map;
  }, [evidence]);

  const togglePin = (i: number) => setPinned((p) => (p === i ? null : i));
  const onKey = (i: number) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      togglePin(i);
    } else if (event.key === 'Escape') {
      setPinned(null);
    }
  };

  if (!novelClaim.trim()) {
    return <p className="muted">{t.noClaim}</p>;
  }

  const ordinal = new Map<number, number>();
  annotation.segments.forEach((s) => {
    if (s.index !== null && !ordinal.has(s.index)) ordinal.set(s.index, ordinal.size + 1);
  });

  const hasVerdicts = claims.length > 0 && !failed;

  return (
    <div className={styles.root} data-compact={compact || undefined}>
      {failed ? (
        <div className="notice notice-warning" role="alert">
          <Icon name="warning" />
          <div>
            <strong>{t.failedTitle}</strong> {t.failedBody}
          </div>
        </div>
      ) : null}
      {!failed && claims.length === 0 ? (
        <div className="notice notice-info">
          <Icon name="info" />
          <div>{t.noVerdicts}</div>
        </div>
      ) : null}

      {hasVerdicts ? <StatusLegend counts={counts} compact={compact} /> : null}

      <div className={styles.layout}>
        <div className={styles.textCol}>
          <p
            className={styles.text}
            data-interacting={interacting !== null || undefined}
            data-unverified={failed || undefined}
          >
            {!hasVerdicts
              ? novelClaim
              : annotation.segments.map((segment, si) => {
              if (segment.index === null) return <span key={si}>{segment.text}</span>;
              const i = segment.index;
              const claim = claims[i]!;
              const n = ordinal.get(i) ?? i + 1;
              return (
                <span
                  key={si}
                  role="button"
                  tabIndex={0}
                  aria-pressed={pinned === i}
                  aria-controls={noteId}
                  className={`${styles.sentence} ${styles[claim.status]}`}
                  data-active={shown === i || undefined}
                  style={{ '--i': n - 1 } as CSSProperties}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setFocused(i)}
                  onBlur={() => setFocused(null)}
                  onClick={() => togglePin(i)}
                  onKeyDown={onKey(i)}
                >
                  <span className={styles.marker} aria-hidden="true">
                    {n}
                  </span>
                  {segment.text}
                  <span className="visually-hidden">
                    {t.sentenceSr(n, statusMeta(claim.status, lang).label, formatPercent(claim.factualHallucinationProbability, lang))}
                  </span>
                </span>
              );
            })}
          </p>

          {hasVerdicts && annotation.unmatched.length > 0 ? (
            <div className={styles.unmatched}>
              <p className={styles.unmatchedTitle}>
                {t.unmatchedTitle(annotation.unmatched.length)}
              </p>
              <p className={styles.unmatchedHint}>{t.unmatchedHint}</p>
              <ul role="list" className={styles.unmatchedList}>
                {annotation.unmatched.map((i) => {
                  const claim = claims[i]!;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        className={styles.unmatchedItem}
                        aria-pressed={pinned === i}
                        aria-controls={noteId}
                        data-active={shown === i || undefined}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setFocused(i)}
                        onBlur={() => setFocused(null)}
                        onClick={() => togglePin(i)}
                      >
                        <StatusBadge status={claim.status} />
                        <span className={styles.unmatchedText}>“{claim.sentence}”</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        {hasVerdicts && shown !== null && claims[shown] ? (
          <aside id={noteId} className={styles.note} aria-label={t.verdictLabel}>
            <ClaimNote
              claim={claims[shown]}
              position={ordinal.get(shown) ?? null}
              total={claims.length}
              isDefault={interacting === null}
              isPinned={pinned === shown}
              onUnpin={() => setPinned(null)}
              fuzzy={annotation.matches[shown]?.method === 'fuzzy'}
              basis={annotation.secondary[shown] !== null ? basis[annotation.secondary[shown]!] : undefined}
              evidenceByKey={evidenceByKey}
              papers={papers}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function ChunkRef({
  chunk,
  evidenceByKey,
  papers,
}: {
  chunk: string;
  evidenceByKey: Map<string, SupportingEvidence>;
  papers: Map<string, PaperSummary>;
}) {
  const t = useT(text);
  const { paperId } = parseChunkKey(chunk);
  const ev = evidenceByKey.get(chunk);
  const title = displayTitle(papers.get(paperId));
  const where = [ev?.section, ev?.pageNumber != null ? t.page(ev.pageNumber) : null].filter(Boolean).join(', ');
  return (
    <li className={styles.chunk}>
      <code className={styles.chunkKey}>{chunk}</code>
      {title ? <span className={styles.chunkTitle}>{title}</span> : null}
      {where ? <span className={styles.chunkWhere}>{where}</span> : null}
      {ev?.content ? <Passage text={ev.content} compact /> : null}
    </li>
  );
}

function ClaimNote({
  claim,
  position,
  total,
  isDefault,
  isPinned,
  onUnpin,
  fuzzy,
  basis,
  evidenceByKey,
  papers,
}: {
  claim: ClaimValidationEntry;
  position: number | null;
  total: number;
  isDefault: boolean;
  isPinned: boolean;
  onUnpin: () => void;
  fuzzy: boolean;
  basis: ExtrapolationBasis | undefined;
  evidenceByKey: Map<string, SupportingEvidence>;
  papers: Map<string, PaperSummary>;
}) {
  const t = useT(text);
  const { lang } = useLang();
  const p = claim.factualHallucinationProbability;
  return (
    <div className={styles.noteInner} data-status={claim.status}>
      <div className={styles.noteHead}>
        <span className={styles.noteWhich}>
          {position !== null ? t.sentenceOf(position, total) : t.unplaced}
          {isDefault && total > 1 ? <span className={styles.noteDefault}>{t.highest}</span> : null}
        </span>
        {isPinned ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onUnpin}>
            {t.unpin}
          </button>
        ) : null}
      </div>

      <StatusBadge status={claim.status} />

      <div className={styles.prob}>
        <span className={`${styles.probValue} num`}>{formatPercent(p, lang)}</span>
        <span className={styles.probLabel}>{t.probLabel}</span>
        <span className={styles.probTrack} aria-hidden="true">
          <span className={styles.probFill} style={{ width: `${p * 100}%` }} />
        </span>
      </div>

      <section className={styles.noteSection}>
        <p className={styles.noteTitle}>{t.validator}</p>
        <p>{claim.rationale || t.noRationale}</p>
      </section>

      <section className={styles.noteSection}>
        <p className={styles.noteTitle}>{t.supportingChunks}</p>
        {claim.supportingChunks.length > 0 ? (
          <ul role="list" className={styles.chunks}>
            {claim.supportingChunks.map((c) => (
              <ChunkRef key={c} chunk={c} evidenceByKey={evidenceByKey} papers={papers} />
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noChunks}</p>
        )}
      </section>

      {basis ? (
        <section className={styles.noteSection}>
          <p className={styles.noteTitle}>{t.ownBasis}</p>
          <p>
            <span className="tag" title={basisMeta(basis.basisType, lang).description}>
              {basisMeta(basis.basisType, lang).label}
            </span>
            {basis.groundedInChunkId ? (
              <>
                {' '}
                {t.from} <code className={styles.chunkKey}>{basis.groundedInChunkId}</code>
              </>
            ) : null}
          </p>
          {basis.rationale ? <p className={styles.basisRationale}>{basis.rationale}</p> : null}
        </section>
      ) : null}

      {fuzzy ? (
        <p className={styles.fuzzy}>{t.fuzzy}</p>
      ) : null}
    </div>
  );
}
