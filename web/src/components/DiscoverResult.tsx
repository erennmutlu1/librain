import { useId } from 'react';
import type { DiscoverRequest, DiscoverResponse, PaperSummary } from '../api/types';
import { topicLabel } from '../lib/format';
import { usePaperIndex } from '../lib/papers';
import { discoveryScoreItems } from '../lib/scoreItems';
import { basisMeta } from '../lib/vocabulary';
import { AnnotatedClaim } from './AnnotatedClaim';
import { ContractSummary } from './ContractSummary';
import { CopyText } from './CopyText';
import { EvidenceList } from './EvidenceList';
import { FencedHypothesis } from './FencedHypothesis';
import { RiskMeter, ScoreBars } from './ScoreBars';
import styles from './DiscoverResult.module.css';

interface Props {
  request: DiscoverRequest;
  result: DiscoverResponse;
}

/** "topic a × topic b" with the × set apart; the heading's text is unchanged. */
export function PairTitle({ label }: { label: string }) {
  const at = label.indexOf(' × ');
  if (at < 0) return <>{label}</>;
  return (
    <>
      <span className={styles.titleTopic}>{label.slice(0, at)}</span> <span className={styles.titleCross}>×</span>{' '}
      <span className={styles.titleTopic}>{label.slice(at + 3)}</span>
    </>
  );
}

/** A Discover result, with paper titles from the library list (loaded on first use). */
export function DiscoverResult({ request, result }: Props) {
  const papers = usePaperIndex();
  return <DiscoverResultView request={request} result={result} papers={papers} />;
}

/** The same view with the paper index supplied, so rendering it never calls the API. */
export function DiscoverResultView({ request, result, papers }: Props & { papers: Map<string, PaperSummary> }) {
  const uid = useId();
  const cv = result.claimValidation;
  const provider = request.provider ?? 'anthropic';

  return (
    <article className={styles.root} aria-labelledby={`${uid}-title`}>
      <header className={styles.header}>
        <h2 id={`${uid}-title`} className={styles.title}>
          <PairTitle label={topicLabel(request.topicA, request.topicB)} />
        </h2>
        <div className={styles.meta}>
          <span className="tag">{provider === 'openai' ? `OpenAI${request.model ? ` ${request.model}` : ''}` : 'Anthropic'}</span>
          <span className="tag">top {request.topK ?? 5} per topic</span>
          <CopyText value={result.correlationId} label="Correlation ID" />
        </div>
      </header>

      <section className={styles.hypothesis} aria-labelledby={`${uid}-hyp`}>
        <h3 id={`${uid}-hyp`} className={styles.sectionTitle}>
          Hypothesis
        </h3>
        <FencedHypothesis className={styles.lead} hypothesis={result.hypothesis} novelClaim={result.novelClaim} withKey />
      </section>

      {/* One scorecard strip under the hypothesis: no empty column beside short hypotheses. */}
      <section className={styles.scorecard} aria-labelledby={`${uid}-scores`}>
        <h3 id={`${uid}-scores`} className="visually-hidden">
          Scores
        </h3>
        <div className={styles.cardScores}>
          {result.evaluation ? (
            <ScoreBars label="Discovery scores" items={discoveryScoreItems(result.evaluation)} columns={2} />
          ) : (
            <p className="muted small">This run was not scored.</p>
          )}
        </div>
        {cv ? (
          <div className={styles.cardCell}>
            <RiskMeter value={cv.aggregateRisk} failed={cv.validationFailed === true} />
          </div>
        ) : null}
        <div className={styles.cardCell}>
          <ContractSummary
            claimed={result.claimedEvidenceCount}
            dropped={result.droppedEvidenceCount}
            kept={result.supportingEvidence.length}
          />
        </div>
      </section>

      <section className={styles.claim} aria-labelledby={`${uid}-claim`}>
        <h3 id={`${uid}-claim`} className={styles.sectionTitle}>
          Novel claim, checked sentence by sentence
        </h3>
        <AnnotatedClaim
          novelClaim={result.novelClaim}
          validation={cv}
          basis={result.extrapolationBasis}
          evidence={result.supportingEvidence}
          papers={papers}
        />
      </section>

      <div className={styles.lower}>
        <section aria-labelledby={`${uid}-evidence`}>
          <h3 id={`${uid}-evidence`} className={styles.sectionTitle}>
            Supporting evidence <span className="muted num">({result.supportingEvidence.length})</span>
          </h3>
          <EvidenceList evidence={result.supportingEvidence} papers={papers} />
        </section>

        <section aria-labelledby={`${uid}-basis`}>
          <h3 id={`${uid}-basis`} className={styles.sectionTitle}>
            Extrapolation basis
          </h3>
          <p className={styles.sectionNote}>How the generator says it arrived at each novel-claim sentence.</p>
          {result.extrapolationBasis.length === 0 ? (
            <p className="muted small">The generator did not annotate its sentences.</p>
          ) : (
            <ol className={styles.basisList}>
              {result.extrapolationBasis.map((b, i) => (
                <li key={i} className={styles.basisItem}>
                  <p className={styles.basisSentence}>{b.claimSentence}</p>
                  <p className={styles.basisMeta}>
                    <span className="tag" title={basisMeta(b.basisType).description}>
                      {basisMeta(b.basisType).label}
                    </span>
                    {b.groundedInChunkId ? (
                      <span>
                        from <code className="mono">{b.groundedInChunkId}</code>
                      </span>
                    ) : (
                      <span className="muted">no source chunk</span>
                    )}
                  </p>
                  {b.rationale ? <p className={styles.basisRationale}>{b.rationale}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {result.reasoning ? (
        <section aria-labelledby={`${uid}-reasoning`} className={styles.reasoning}>
          <h3 id={`${uid}-reasoning`} className={styles.sectionTitle}>
            Model's reasoning
          </h3>
          <p className="prose">{result.reasoning}</p>
        </section>
      ) : null}
    </article>
  );
}
