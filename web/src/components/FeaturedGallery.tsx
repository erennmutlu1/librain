import { useId } from 'react';
import { Link } from 'react-router';
import { featuredManifest, featuredPath, type FeaturedManifest } from '../featured/manifest';
import type { FeaturedRun } from '../featured/runs';
import { useFeaturedRuns } from '../featured/useFeatured';
import { dateText, fmtNum, fmtUsd } from '../explore/fmt';
import { useLang, useT, type Lang } from '../i18n/lang';
import { riskBand } from '../lib/scoreItems';
import { StatusLegend } from './AnnotatedClaim';
import { Icon, StatusIcon } from './Icon';
import { SkeletonLines } from './States';
import { galleryText } from './FeaturedGallery.i18n';
import styles from './FeaturedGallery.module.css';

const score = (v: number | null | undefined, lang: Lang) => (typeof v === 'number' && Number.isFinite(v) ? fmtNum(v, 2, lang) : '—');


/** The honest framing shown beside every view of the featured runs. */
export function FeaturedFraming({ manifest = featuredManifest }: { manifest?: FeaturedManifest }) {
  const t = useT(galleryText);
  const corpus = manifest.corpusPapers ? t.corpusSized(manifest.corpusPapers) : t.corpusPlain;
  return (
    <p className={styles.framing}>
      <strong>{t.framingLead}</strong>
      {t.framing(corpus)}
    </p>
  );
}

/** The runs are a static chunk of the app; this only shows if that chunk failed to load. */
export function FeaturedLoadError({ onRetry }: { onRetry: () => void }) {
  const t = useT(galleryText);
  return (
    <div className="notice notice-error" role="alert">
      <Icon name="error" />
      <div className={styles.errorBody}>
        <strong>{t.loadErrorTitle}</strong>
        <p>{t.loadErrorBody}</p>
        <div className="cluster">
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            {t.tryAgain}
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
  const t = useT(galleryText);
  const { lang } = useLang();
  const Heading = level === 2 ? 'h2' : 'h3';
  const { evaluation, claimValidation: cv } = run.response;
  const failed = cv?.validationFailed === true;
  const cost = run.costUsd === null ? null : fmtUsd(run.costUsd, 2, lang);
  const { date, generator } = featuredManifest;

  return (
    <li className={styles.card}>
      <Heading className={styles.title}>
        <Link to={featuredPath(run.id)} className={styles.link}>
          <TopicPair topicA={run.request.topicA} topicB={run.request.topicB} />
        </Link>
      </Heading>
      <p className={styles.takeaway}>{run.takeaway}</p>
      <ul role="list" className={styles.chips} aria-label={t.scores}>
        <li className={styles.chip}>
          {t.quality} <b>{score(evaluation?.qualityScore, lang)}</b>
        </li>
        <li className={styles.chip}>
          {t.novelty} <b>{score(evaluation?.noveltyScore, lang)}</b>
        </li>
        <li className={styles.chip}>
          {t.plausibility} <b>{score(evaluation?.plausibilityScore, lang)}</b>
        </li>
        {cv ? (
          <li className={styles.chip} data-tone={failed ? 'high' : riskBand(cv.aggregateRisk).tone}>
            {t.claimRisk} <b>{failed ? t.unverified : score(cv.aggregateRisk, lang)}</b>
          </li>
        ) : null}
        {run.riskyCount > 0 ? (
          <li className={`${styles.chip} ${styles.risky}`}>
            <StatusIcon status="risky" size={12} />
            {t.risky(run.riskyCount)}
          </li>
        ) : null}
      </ul>
      {run.paperIds.length > 0 ? (
        <p className={styles.bridges}>
          {/* Plain ids here: the card is one link, and each idea's page links every paper. */}
          <span className={styles.bridgesLabel}>{t.bridges}</span> {run.paperIds.join(', ')}
        </p>
      ) : null}
      <p className={styles.footer}>
        {t.recordedRun} · <time dateTime={date}>{dateText(date, lang)}</time> · {generator}
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
  const t = useT(galleryText);
  const { lang } = useLang();
  const uid = useId();
  const { state, retry } = useFeaturedRuns();
  const Title = headingLevel === 1 ? 'h1' : 'h2';
  const cardLevel = headingLevel === 1 ? 2 : 3;

  return (
    <>
      <section className={styles.root} aria-labelledby={`${uid}-title`} aria-busy={state.status === 'loading' || undefined}>
        <header className={styles.intro}>
          <Title id={`${uid}-title`} className={headingLevel === 1 ? 'page-title' : styles.galleryTitle}>
            {t.title}
          </Title>
          <p className={styles.lede}>{t.lede}</p>
          <FeaturedFraming />
          {lang === 'tr' && state.status === 'ready' && state.runs.some((r) => r.translated) ? (
            <p className={styles.translatedNote}>
              <b>{t.translated}</b> {t.translatedNote}
            </p>
          ) : null}
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
      <p className={styles.exploreLink}>
        <Link to="/explore">{t.exploreBefore}</Link>
        {t.exploreAfter}
      </p>
    </>
  );
}
