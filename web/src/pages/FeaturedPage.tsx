import { Link, useParams } from 'react-router';
import { DiscoverResultView } from '../components/DiscoverResult';
import { FeaturedFraming, FeaturedGallery, FeaturedLoadError } from '../components/FeaturedGallery';
import { Icon } from '../components/Icon';
import { EmptyState, SkeletonLines } from '../components/States';
import { featuredManifest, featuredPath } from '../featured/manifest';
import type { FeaturedRun } from '../featured/runs';
import { useFeaturedRuns } from '../featured/useFeatured';
import { dateText, fmtUsd } from '../explore/fmt';
import { useLang, useT } from '../i18n/lang';
import { topicLabel } from '../lib/format';
import { useLoadedPaperIndex } from '../lib/papers';
import { featuredPageText } from './FeaturedPage.i18n';
import styles from './FeaturedPage.module.css';

/*
 * /discover/featured      the gallery on its own (where "Back to featured" leads)
 * /discover/featured/:id  one recorded run, rendered with the Discover result view
 *
 * Neither calls the API: the runs ship with the app, and paper titles are only
 * shown if this tab already loaded the library.
 */

function RecordedBanner({ run }: { run: FeaturedRun }) {
  const t = useT(featuredPageText);
  const { lang } = useLang();
  const { date, generator, judge } = featuredManifest;
  const cost = run.costUsd === null ? null : fmtUsd(run.costUsd, 2, lang);
  return (
    <div className={`notice notice-info ${styles.banner}`}>
      <Icon name="doc" />
      <div className={styles.bannerBody}>
        <p className={styles.bannerTitle}>
          <strong>{t.recordedTitle}</strong>
        </p>
        <p>
          {t.wrote(generator)}
          <time dateTime={date}>{dateText(date, lang)}</time>
          {t.judged(judge)}.{cost ? t.cost(cost) : ''}
          {t.noApi}
        </p>
        {run.whyFeatured ? (
          <p>
            <span className={styles.why}>{t.why}</span> {run.whyFeatured}
          </p>
        ) : null}
        {run.translated ? (
          <p>
            <span className={styles.why}>{t.translated}:</span> {t.translatedNote}
          </p>
        ) : null}
        <p className={styles.source}>
          {t.source} <code className="mono">{run.source}</code>
        </p>
      </div>
    </div>
  );
}

function FeaturedRunView({ id }: { id: string }) {
  const t = useT(featuredPageText);
  const { state, retry } = useFeaturedRuns();
  const papers = useLoadedPaperIndex();

  const back = (
    <Link to={featuredPath()} className={styles.back}>
      <Icon name="back" size={14} /> {t.back}
    </Link>
  );

  if (state.status === 'loading') {
    return (
      <div className="page" aria-busy="true">
        {back}
        <h1 className="visually-hidden">{t.loadingHeading(id)}</h1>
        <SkeletonLines lines={6} />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page">
        {back}
        <h1 className="page-title">{t.errorHeading(id)}</h1>
        <div className={styles.spaced}>
          <FeaturedLoadError onRetry={retry} />
        </div>
      </div>
    );
  }

  const run = state.runs.find((r) => r.id === id);
  if (!run) {
    return (
      <div className="page">
        {back}
        <h1 className="visually-hidden">{t.notFoundHeading}</h1>
        <EmptyState
          title={t.notFoundTitle(id)}
          action={
            <Link to={featuredPath()} className="btn btn-primary">
              {t.seeFeatured}
            </Link>
          }
        >
          <p>{t.notFoundBody(state.runs.map((r) => r.id).join(', '))}</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page">
      {back}
      <h1 className="visually-hidden">{t.pageHeading(topicLabel(run.request.topicA, run.request.topicB))}</h1>
      <RecordedBanner run={run} />
      <div className={styles.framing}>
        <FeaturedFraming />
      </div>
      <DiscoverResultView request={run.request} result={run.response} papers={papers} />
    </div>
  );
}

export default function FeaturedPage() {
  const t = useT(featuredPageText);
  const { id } = useParams();
  if (id !== undefined) return <FeaturedRunView id={id} />;
  return (
    <div className="page">
      <Link to="/discover" className={styles.back}>
        <Icon name="back" size={14} /> {t.discover}
      </Link>
      <FeaturedGallery headingLevel={1} />
    </div>
  );
}
