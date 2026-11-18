import { Link, useParams } from 'react-router';
import { DiscoverResultView } from '../components/DiscoverResult';
import { FeaturedFraming, FeaturedGallery, FeaturedLoadError } from '../components/FeaturedGallery';
import { Icon } from '../components/Icon';
import { EmptyState, SkeletonLines } from '../components/States';
import { featuredManifest, featuredPath } from '../featured/manifest';
import type { FeaturedRun } from '../featured/runs';
import { useFeaturedRuns } from '../featured/useFeatured';
import { formatUsd, topicLabel } from '../lib/format';
import { useLoadedPaperIndex } from '../lib/papers';
import styles from './FeaturedPage.module.css';

/*
 * /discover/featured      the gallery on its own (where "Back to featured" leads)
 * /discover/featured/:id  one recorded run, rendered with the Discover result view
 *
 * Neither calls the API: the runs ship with the app, and paper titles are only
 * shown if this tab already loaded the library.
 */

function RecordedBanner({ run }: { run: FeaturedRun }) {
  const { date, generator, judge } = featuredManifest;
  const cost = formatUsd(run.costUsd);
  return (
    <div className={`notice notice-info ${styles.banner}`}>
      <Icon name="doc" />
      <div className={styles.bannerBody}>
        <p className={styles.bannerTitle}>
          <strong>Recorded run, not generated now.</strong>
        </p>
        <p>
          {generator} wrote it on <time dateTime={date}>{date}</time>
          {judge ? `; ${judge} scored it and checked each sentence` : ''}.{cost ? ` It cost ${cost} then.` : ''} Showing
          it calls no API.
        </p>
        {run.whyFeatured ? (
          <p>
            <span className={styles.why}>Why it is featured:</span> {run.whyFeatured}
          </p>
        ) : null}
        <p className={styles.source}>
          Recorded output: <code className="mono">{run.source}</code>
        </p>
      </div>
    </div>
  );
}

function FeaturedRunView({ id }: { id: string }) {
  const { state, retry } = useFeaturedRuns();
  const papers = useLoadedPaperIndex();

  const back = (
    <Link to={featuredPath()} className={styles.back}>
      <Icon name="back" size={14} /> Back to featured
    </Link>
  );

  if (state.status === 'loading') {
    return (
      <div className="page" aria-busy="true">
        {back}
        <h1 className="visually-hidden">Loading featured discovery {id}</h1>
        <SkeletonLines lines={6} />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page">
        {back}
        <h1 className="page-title">Featured discovery {id}</h1>
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
        <h1 className="visually-hidden">Featured discovery not found</h1>
        <EmptyState
          title={`There is no featured discovery called “${id}”`}
          action={
            <Link to={featuredPath()} className="btn btn-primary">
              See the featured discoveries
            </Link>
          }
        >
          <p>
            The featured runs are {state.runs.map((r) => r.id).join(', ')}. The link may have a typo, or the run may
            have left the selection.
          </p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page">
      {back}
      <h1 className="visually-hidden">Featured discovery: {topicLabel(run.request.topicA, run.request.topicB)}</h1>
      <RecordedBanner run={run} />
      <div className={styles.framing}>
        <FeaturedFraming />
      </div>
      <DiscoverResultView request={run.request} result={run.response} papers={papers} />
    </div>
  );
}

export default function FeaturedPage() {
  const { id } = useParams();
  if (id !== undefined) return <FeaturedRunView id={id} />;
  return (
    <div className="page">
      <Link to="/discover" className={styles.back}>
        <Icon name="back" size={14} /> Discover
      </Link>
      <FeaturedGallery headingLevel={1} />
    </div>
  );
}
