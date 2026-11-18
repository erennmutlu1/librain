import { useId } from 'react';
import type { DiscoverRequest, DiscoverResponse, PaperSummary } from '../api/types';
import { useLang, useT } from '../i18n/lang';
import { downloadDiscovery, type DiscoveryExport } from '../lib/exportDiscovery';
import { topicLabel } from '../lib/format';
import { paperTitleFor, usePaperIndex } from '../lib/papers';
import { discoveryScoreItems } from '../lib/scoreItems';
import { basisMeta } from '../lib/vocabulary';
import { AnnotatedClaim } from './AnnotatedClaim';
import { ContractSummary } from './ContractSummary';
import { text } from './DiscoverResult.i18n';
import { EvidenceList } from './EvidenceList';
import { ExportButtons } from './ExportButtons';
import { FencedHypothesis } from './FencedHypothesis';
import { InfoTip } from './InfoTip';
import { PaperRef } from './PaperRef';
import { RiskMeter, ScoreBars } from './ScoreBars';
import { RequestId } from './TechDetails';
import styles from './DiscoverResult.module.css';

interface Props {
  request: DiscoverRequest;
  result: DiscoverResponse;
  /** Offer Markdown and JSON downloads of the run (off where the page has its own). */
  exportable?: boolean;
  /** Where the run came from, for the exported files. */
  exportMeta?: Pick<DiscoveryExport, 'id' | 'source' | 'url' | 'recordedOn' | 'translated'>;
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

/** A Discover result, with paper titles from the library list (loaded on first use) and export buttons. */
export function DiscoverResult({ exportable = true, ...props }: Props) {
  const papers = usePaperIndex();
  return <DiscoverResultView {...props} exportable={exportable} papers={papers} />;
}

/** The same view with the paper index supplied, so rendering it never calls the API. */
export function DiscoverResultView({
  request,
  result,
  papers,
  exportable = false,
  exportMeta,
}: Props & { papers: Map<string, PaperSummary> }) {
  const uid = useId();
  const t = useT(text);
  const { lang } = useLang();
  const cv = result.claimValidation;
  const provider = request.provider ?? 'anthropic';

  const download = (format: 'markdown' | 'json') =>
    downloadDiscovery({ request, response: result, ...exportMeta, paperTitle: (id) => paperTitleFor(id, papers) }, format, lang);

  return (
    <article className={styles.root} aria-labelledby={`${uid}-title`}>
      <header className={styles.header}>
        <h2 id={`${uid}-title`} className={styles.title}>
          <PairTitle label={topicLabel(request.topicA, request.topicB)} />
        </h2>
        <div className={styles.meta}>
          <span className="tag">{provider === 'openai' ? `OpenAI${request.model ? ` ${request.model}` : ''}` : 'Anthropic'}</span>
          <span className="tag">{t.topK(request.topK ?? 5)}</span>
          <RequestId value={result.correlationId} />
          {exportable ? <ExportButtons className={styles.export} onMarkdown={() => download('markdown')} onJson={() => download('json')} /> : null}
        </div>
      </header>

      <section className={styles.hypothesis} aria-labelledby={`${uid}-hyp`}>
        <h3 id={`${uid}-hyp`} className={styles.sectionTitle}>
          {t.hypothesis}
        </h3>
        <FencedHypothesis className={styles.lead} hypothesis={result.hypothesis} novelClaim={result.novelClaim} withKey />
      </section>

      {/* One scorecard strip under the hypothesis: no empty column beside short hypotheses. */}
      <section className={styles.scorecard} aria-labelledby={`${uid}-scores`}>
        <h3 id={`${uid}-scores`} className="visually-hidden">
          {t.scores}
        </h3>
        <div className={styles.cardScores}>
          {result.evaluation ? (
            <ScoreBars label={t.discoveryScores} items={discoveryScoreItems(result.evaluation, lang)} columns={2} />
          ) : (
            <p className="muted small">{t.notScored}</p>
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
          {t.claim}
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
            {t.evidence} <span className="muted num">({result.supportingEvidence.length})</span>
          </h3>
          <EvidenceList evidence={result.supportingEvidence} papers={papers} />
        </section>

        <section aria-labelledby={`${uid}-basis`}>
          <h3 id={`${uid}-basis`} className={styles.sectionTitle}>
            {t.basis}
          </h3>
          <p className={styles.sectionNote}>
            {t.basisNote} <InfoTip k="basis" />
          </p>
          {result.extrapolationBasis.length === 0 ? (
            <p className="muted small">{t.noBasis}</p>
          ) : (
            <ol className={styles.basisList}>
              {result.extrapolationBasis.map((b, i) => (
                <li key={i} className={styles.basisItem}>
                  <p className={styles.basisSentence}>{b.claimSentence}</p>
                  <p className={styles.basisMeta}>
                    <span className="tag" title={basisMeta(b.basisType, lang).description}>
                      {basisMeta(b.basisType, lang).label}
                    </span>
                    {b.groundedInChunkId ? (
                      <span>
                        {t.from} <PaperRef chunk={b.groundedInChunkId} />
                      </span>
                    ) : (
                      <span className="muted">{t.noSource}</span>
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
            {t.reasoning}
          </h3>
          <p className="prose">{result.reasoning}</p>
        </section>
      ) : null}
    </article>
  );
}
