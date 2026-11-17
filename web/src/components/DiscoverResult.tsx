import { useId } from 'react';
import type { DiscoverRequest, DiscoverResponse } from '../api/types';
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

export function DiscoverResult({ request, result }: { request: DiscoverRequest; result: DiscoverResponse }) {
  const uid = useId();
  const papers = usePaperIndex();
  const cv = result.claimValidation;
  const provider = request.provider ?? 'anthropic';

  return (
    <article className={styles.root} aria-labelledby={`${uid}-title`}>
      <header className={styles.header}>
        <h2 id={`${uid}-title`} className={styles.title}>
          {topicLabel(request.topicA, request.topicB)}
        </h2>
        <div className={styles.meta}>
          <span className="tag">{provider === 'openai' ? `OpenAI${request.model ? ` ${request.model}` : ''}` : 'Anthropic'}</span>
          <span className="tag">top {request.topK ?? 5} per topic</span>
          <CopyText value={result.correlationId} label="Correlation ID" />
        </div>
      </header>

      <div className={styles.top}>
        <section className={styles.hypothesis} aria-labelledby={`${uid}-hyp`}>
          <h3 id={`${uid}-hyp`} className={styles.sectionTitle}>
            Hypothesis
          </h3>
          <FencedHypothesis className={styles.lead} hypothesis={result.hypothesis} novelClaim={result.novelClaim} />
          <p className={styles.fenceKey}>
            <span className={styles.fenceSwatch} aria-hidden="true" /> The indented italic part is the model's novel
            claim, examined sentence by sentence below.
          </p>
        </section>

        <aside className={styles.scores} aria-labelledby={`${uid}-scores`}>
          <h3 id={`${uid}-scores`} className={styles.sectionTitle}>
            Scores
          </h3>
          {result.evaluation ? (
            <ScoreBars label="Discovery scores" items={discoveryScoreItems(result.evaluation)} />
          ) : (
            <p className="muted small">This run was not scored.</p>
          )}
          {cv ? <RiskMeter value={cv.aggregateRisk} failed={cv.validationFailed === true} /> : null}
          <ContractSummary
            claimed={result.claimedEvidenceCount}
            dropped={result.droppedEvidenceCount}
            kept={result.supportingEvidence.length}
          />
        </aside>
      </div>

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
