import { useId } from 'react';
import { Link } from 'react-router';
import { featuredManifest, featuredPath, type FeaturedManifest } from '../featured/manifest';
import type { FeaturedRun } from '../featured/runs';
import { useFeaturedRuns } from '../featured/useFeatured';
import { formatScore, formatUsd } from '../lib/format';
import { riskBand } from '../lib/scoreItems';
import { StatusLegend } from './AnnotatedClaim';
import { Icon, StatusIcon } from './Icon';
import { SkeletonLines } from './States';
import styles from './FeaturedGallery.module.css';

/** The honest framing shown beside every view of the featured runs. */
export function FeaturedFraming({ manifest = featuredManifest }: { manifest?: FeaturedManifest }) {
  const corpus = manifest.corpusPapers ? `this ${manifest.corpusPapers}-paper corpus` : 'this corpus';
  return (
    <p className={styles.framing}>
      <strong>Candidate hypotheses:</strong> the highlighted novel claim is the part the retrieved papers do not
      support, checked sentence by sentence. Novelty is measured against {corpus}.
    </p>
  );
}

/** The runs are a static chunk of the app; this only shows if that chunk failed to load. */
export function FeaturedLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="notice notice-error" role="alert">
      <Icon name="error" />
      <div className={styles.errorBody}>
        <strong>The featured runs did not load.</strong>
        <p>They ship with the app, so this usually means the page is out of date after an update. Reload the page, or try again.</p>
        <div className="cluster">
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

function TopicPair({ topicA, topicB }: { topicA: string; topicB?: string | undefined }) {
  return (
    <>
      <span className={styles.topic}>{topicA}</span>{' '}
      {topicB ? (
        <span className={styles.topic}>
          <span className={styles.cross}>×</span> {topicB}
        </span>
      ) : null}
    </>
  );
}

function FeaturedCard({ run, level }: { run: FeaturedRun; level: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3';
  const { evaluation, claimValidation: cv } = run.response;
  const failed = cv?.validationFailed === true;
  const cost = formatUsd(run.costUsd);
  const { date, generator } = featuredManifest;

  return (
    <li className={styles.card}>
      <Heading className={styles.title}>
        <Link to={featuredPath(run.id)} className={styles.link}>
          <TopicPair topicA={run.request.topicA} topicB={run.request.topicB} />
        </Link>
      </Heading>
      <p className={styles.takeaway}>{run.takeaway}</p>
      <ul role="list" className={styles.chips} aria-label="Scores">
        <li className={styles.chip}>
          Quality <b>{formatScore(evaluation?.qualityScore)}</b>
        </li>
        <li className={styles.chip}>
          Novelty <b>{formatScore(evaluation?.noveltyScore)}</b>
        </li>
        <li className={styles.chip}>
          Plausibility <b>{formatScore(evaluation?.plausibilityScore)}</b>
        </li>
        {cv ? (
          <li className={styles.chip} data-tone={failed ? 'high' : riskBand(cv.aggregateRisk).tone}>
            Claim risk <b>{failed ? 'unverified' : formatScore(cv.aggregateRisk)}</b>
          </li>
        ) : null}
        {run.riskyCount > 0 ? (
          <li className={`${styles.chip} ${styles.risky}`}>
            <StatusIcon status="risky" size={12} />
            {run.riskyCount} risky {run.riskyCount === 1 ? 'sentence' : 'sentences'}
          </li>
        ) : null}
      </ul>
      {run.paperIds.length > 0 ? (
        <p className={styles.bridges}>
          <span className={styles.bridgesLabel}>Bridges:</span> {run.paperIds.join(', ')}
        </p>
      ) : null}
      <p className={styles.footer}>
        Recorded run · <time dateTime={date}>{date}</time> · {generator}
        {cost ? ` · ${cost}` : null}
      </p>
    </li>
  );
}

/**
 * The featured discoveries: recorded runs bundled with the app, so the gallery
 * and every run it opens work in mock and real mode with the API offline.
 * `headingLevel` is the gallery title's level; cards sit one level below.
 */
export function FeaturedGallery({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const uid = useId();
  const { state, retry } = useFeaturedRuns();
  const Title = headingLevel === 1 ? 'h1' : 'h2';
  const cardLevel = headingLevel === 1 ? 2 : 3;

  return (
    <section className={styles.root} aria-labelledby={`${uid}-title`} aria-busy={state.status === 'loading' || undefined}>
      <header className={styles.intro}>
        <Title id={`${uid}-title`} className={headingLevel === 1 ? 'page-title' : styles.galleryTitle}>
          Featured discoveries
        </Title>
        <p className={styles.lede}>
          Recorded runs, chosen by reading every result rather than by score alone. Open one to read its full audit.
        </p>
        <FeaturedFraming />
        <div className={styles.legend}>
          <StatusLegend />
        </div>
      </header>

      {state.status === 'error' ? (
        <FeaturedLoadError onRetry={retry} />
      ) : (
        <ul role="list" className={styles.grid}>
          {state.status === 'ready'
            ? state.runs.map((run) => <FeaturedCard key={run.id} run={run} level={cardLevel} />)
            : featuredManifest.entries.map((entry) => (
                <li key={entry.id} className={`${styles.card} ${styles.placeholder}`} aria-hidden="true">
                  <SkeletonLines lines={5} />
                </li>
              ))}
        </ul>
      )}
    </section>
  );
}
