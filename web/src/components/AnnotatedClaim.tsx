import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type {
  ClaimStatus,
  ClaimValidationEntry,
  ClaimValidationResult,
  ExtrapolationBasis,
  PaperSummary,
  SupportingEvidence,
} from '../api/types';
import { chunkKey, parseChunkKey } from '../lib/citations';
import { formatPercent } from '../lib/format';
import { displayTitle } from '../lib/papers';
import { annotate } from '../lib/sentences';
import { basisMeta, STATUS_META, STATUS_ORDER } from '../lib/vocabulary';
import { Icon, StatusIcon } from './Icon';
import { Passage } from './Passage';
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

export function StatusLegend({ counts }: { counts?: Record<ClaimStatus, number> }) {
  return (
    <ul className={styles.legend} role="list" aria-label="Sentence status legend">
      {STATUS_ORDER.map((status) => (
        <li key={status} className={styles.legendItem}>
          <StatusIcon status={status} />
          <span className={`${styles.legendSample} ${styles[status]}`} aria-hidden="true">
            Aa
          </span>
          <span>
            <span className={styles.legendLabel}>{STATUS_META[status].label}</span>
            {counts ? <span className={`${styles.legendCount} num`}> {counts[status]}</span> : null}
            <span className={styles.legendDesc}>{STATUS_META[status].description}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StatusBadge({ status }: { status: ClaimStatus }) {
  return (
    <span className={styles.badge} data-status={status}>
      <StatusIcon status={status} size={12} />
      {STATUS_META[status].label}
    </span>
  );
}

/**
 * The novel claim with every validator verdict painted onto its sentence.
 * Hover or focus a sentence to read the verdict in the margin note; click or
 * press Enter to pin it.
 */
export function AnnotatedClaim({ novelClaim, validation, basis, evidence, papers, compact = false }: Props) {
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
    return <p className="muted">The model did not separate out a novel claim for this run.</p>;
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
            <strong>Claim validation failed.</strong> The validator produced no usable verdicts, so none of the
            sentences below has been checked against the evidence. Aggregate risk is reported as 1.0. Treat the whole
            claim as unverified.
          </div>
        </div>
      ) : null}
      {!failed && claims.length === 0 ? (
        <div className="notice notice-info">
          <Icon name="info" />
          <div>No sentence-level verdicts were returned for this claim.</div>
        </div>
      ) : null}

      {hasVerdicts ? <StatusLegend counts={counts} /> : null}

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
                    {` (sentence ${n}: ${STATUS_META[claim.status].label}, ${formatPercent(claim.factualHallucinationProbability)} hallucination probability)`}
                  </span>
                </span>
              );
            })}
          </p>

          {hasVerdicts && annotation.unmatched.length > 0 ? (
            <div className={styles.unmatched}>
              <p className={styles.unmatchedTitle}>
                {annotation.unmatched.length === 1 ? 'One verdict' : `${annotation.unmatched.length} verdicts`} could not be
                placed in the text
              </p>
              <p className={styles.unmatchedHint}>
                The validator reworded these sentences too much to locate them in the novel claim.
              </p>
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
          <aside id={noteId} className={styles.note} aria-label="Sentence verdict">
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
  const { paperId } = parseChunkKey(chunk);
  const ev = evidenceByKey.get(chunk);
  const title = displayTitle(papers.get(paperId));
  const where = [ev?.section, ev?.pageNumber != null ? `p. ${ev.pageNumber}` : null].filter(Boolean).join(', ');
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
  const p = claim.factualHallucinationProbability;
  return (
    <div className={styles.noteInner} data-status={claim.status}>
      <div className={styles.noteHead}>
        <span className={styles.noteWhich}>
          {position !== null ? `Sentence ${position} of ${total}` : 'Unplaced verdict'}
          {isDefault && total > 1 ? <span className={styles.noteDefault}>highest risk</span> : null}
        </span>
        {isPinned ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onUnpin}>
            Unpin
          </button>
        ) : null}
      </div>

      <StatusBadge status={claim.status} />

      <div className={styles.prob}>
        <span className={`${styles.probValue} num`}>{formatPercent(p)}</span>
        <span className={styles.probLabel}>factual hallucination probability</span>
        <span className={styles.probTrack} aria-hidden="true">
          <span className={styles.probFill} style={{ width: `${p * 100}%` }} />
        </span>
      </div>

      <section className={styles.noteSection}>
        <p className={styles.noteTitle}>Validator</p>
        <p>{claim.rationale || 'No rationale given.'}</p>
      </section>

      <section className={styles.noteSection}>
        <p className={styles.noteTitle}>Supporting chunks</p>
        {claim.supportingChunks.length > 0 ? (
          <ul role="list" className={styles.chunks}>
            {claim.supportingChunks.map((c) => (
              <ChunkRef key={c} chunk={c} evidenceByKey={evidenceByKey} papers={papers} />
            ))}
          </ul>
        ) : (
          <p className="muted">No retrieved chunk supports this sentence.</p>
        )}
      </section>

      {basis ? (
        <section className={styles.noteSection}>
          <p className={styles.noteTitle}>Generator's own basis</p>
          <p>
            <span className="tag" title={basisMeta(basis.basisType).description}>
              {basisMeta(basis.basisType).label}
            </span>
            {basis.groundedInChunkId ? (
              <>
                {' '}
                from <code className={styles.chunkKey}>{basis.groundedInChunkId}</code>
              </>
            ) : null}
          </p>
          {basis.rationale ? <p className={styles.basisRationale}>{basis.rationale}</p> : null}
        </section>
      ) : null}

      {fuzzy ? (
        <p className={styles.fuzzy}>Matched approximately: the validator reworded this sentence.</p>
      ) : null}
    </div>
  );
}
