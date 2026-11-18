import { useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  BookmarkButton,
  CategoryTag,
  DiscoveryCard,
  ExploreLoadError,
  ExploreLoading,
  ExploreTabs,
  PickBadge,
  Rating,
  RatingExplainer,
  TopicPair,
} from '../components/explore/ExploreParts';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/States';
import { useBookmarks } from '../explore/bookmarks';
import { CATEGORIES, catStyle } from '../explore/categories';
import { explorePath, RECORDED_DATE } from '../explore/manifests';
import {
  categoryCounts,
  discoveryOfTheDay,
  exploreList,
  isSortKey,
  SORTS,
  type Discovery,
  type ExploreData,
  type SortKey,
} from '../explore/model';
import { useExploreData } from '../explore/useDiscoveries';
import { featuredPath } from '../featured/manifest';
import { formatDate } from '../lib/format';
import styles from './ExplorePage.module.css';

/*
 * /explore: every recorded discovery, rated, filterable and searchable.
 * Filters live in the URL (?q=, ?cat=, ?sort=, ?saved=1, ?view=list), so a
 * filtered view can be shared and the back button works. No API call: the
 * runs ship with the app.
 */

function DayHero({ discovery, today }: { discovery: Discovery; today: Date }) {
  const uid = useId();
  return (
    <section className={styles.hero} aria-labelledby={`${uid}-h`} style={catStyle(discovery.category)}>
      <div className={styles.heroHead}>
        <h2 id={`${uid}-h`} className={styles.heroLabel}>
          Discovery of the day
        </h2>
        <span className={styles.heroDate}>
          <time dateTime={today.toISOString().slice(0, 10)}>{formatDate(today.toISOString())}</time> · a new editor’s pick each day
        </span>
      </div>
      <div className={styles.heroBody}>
        <div className={styles.heroMeta}>
          <CategoryTag category={discovery.category} />
          <PickBadge />
        </div>
        <h3 className={styles.heroTitle}>
          <Link to={explorePath(discovery.id)} className={styles.heroLink}>
            <TopicPair discovery={discovery} />
          </Link>
        </h3>
        <div className={styles.heroRating}>
          <Rating value={discovery.rating} size="lg" />
        </div>
        <p className={styles.heroTakeaway}>{discovery.takeaway}</p>
        {discovery.pick?.whyFeatured ? (
          <p className={styles.heroWhy}>
            <span className={styles.heroWhyLabel}>Why it was picked:</span> {discovery.pick.whyFeatured}
          </p>
        ) : null}
        <div className={`cluster ${styles.heroActions}`}>
          <Link to={explorePath(discovery.id)} className="btn btn-primary">
            See the evidence <Icon name="arrow" size={14} />
          </Link>
          <BookmarkButton id={discovery.id} label={discovery.request.topicA} />
        </div>
      </div>
    </section>
  );
}

function Toolbar({
  q,
  sort,
  view,
  onChange,
}: {
  q: string;
  sort: SortKey;
  view: 'grid' | 'list';
  onChange: (patch: Record<string, string | null>) => void;
}) {
  const uid = useId();
  return (
    <div className={styles.toolbar} role="search" aria-label="Filter discoveries">
      <div className={`field ${styles.search}`}>
        <label className="field-label" htmlFor={`${uid}-q`}>
          Search topics and claims
        </label>
        <div className={styles.searchBox}>
          <Icon name="search" size={16} />
          <input
            id={`${uid}-q`}
            type="search"
            className="input"
            value={q}
            placeholder="e.g. injury, PharmAgents, graph"
            autoComplete="off"
            onChange={(e) => onChange({ q: e.target.value || null })}
          />
        </div>
      </div>
      <div className={`field ${styles.sort}`}>
        <label className="field-label" htmlFor={`${uid}-sort`}>
          Sort by
        </label>
        <select id={`${uid}-sort`} className="input" value={sort} onChange={(e) => onChange({ sort: e.target.value === 'rating' ? null : e.target.value })}>
          {(Object.keys(SORTS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORTS[k].label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.view} role="group" aria-label="Layout">
        <button type="button" className={styles.viewButton} aria-pressed={view === 'grid'} onClick={() => onChange({ view: null })}>
          <Icon name="grid" size={14} /> Grid
        </button>
        <button type="button" className={styles.viewButton} aria-pressed={view === 'list'} onClick={() => onChange({ view: 'list' })}>
          <Icon name="list" size={14} /> List
        </button>
      </div>
    </div>
  );
}

function ExploreBody({ data }: { data: ExploreData }) {
  const [params, setParams] = useSearchParams();
  const { saved, persistent } = useBookmarks();
  const [today] = useState(() => new Date());

  const q = params.get('q') ?? '';
  const sortParam = params.get('sort');
  const sort: SortKey = isSortKey(sortParam) ? sortParam : 'rating';
  const catParam = params.get('cat')?.toUpperCase() ?? '';
  const category = CATEGORIES.some((c) => c.prefix === catParam) ? catParam : undefined;
  const savedOnly = params.get('saved') === '1';
  const view = params.get('view') === 'list' ? 'list' : 'grid';

  const update = (patch: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const list = useMemo(
    () => exploreList(data.discoveries, { q, sort, category, savedOnly, saved }),
    [data, q, sort, category, savedOnly, saved],
  );
  const counts = useMemo(() => categoryCounts(data.discoveries, { q, savedOnly, saved }), [data, q, savedOnly, saved]);
  const allCount = [...counts.values()].reduce((a, b) => a + b, 0);
  const day = discoveryOfTheDay(data.picks, today);
  const filtered = q !== '' || category !== undefined || savedOnly;

  return (
    <>
      {day && !filtered ? <DayHero discovery={day} today={today} /> : null}

      <Toolbar q={q} sort={sort} view={view} onChange={update} />

      <div className={styles.chips} role="group" aria-label="Category">
        <button type="button" className={styles.chip} aria-pressed={category === undefined} onClick={() => update({ cat: null })}>
          All <span className={styles.count}>{allCount}</span>
        </button>
        {CATEGORIES.map((c) => {
          const n = counts.get(c.prefix) ?? 0;
          return (
            <button
              key={c.prefix}
              type="button"
              className={styles.chip}
              style={catStyle(c)}
              aria-pressed={category === c.prefix}
              title={c.name}
              onClick={() => update({ cat: category === c.prefix ? null : c.prefix })}
            >
              <span className={styles.chipGlyph} aria-hidden="true">
                <Icon name={c.icon} size={12} />
              </span>
              {c.short} <span className={styles.count}>{n}</span>{' '}
              <span className="visually-hidden">{n === 1 ? 'idea' : 'ideas'}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`${styles.chip} ${styles.savedChip}`}
          aria-pressed={savedOnly}
          onClick={() => update({ saved: savedOnly ? null : '1' })}
        >
          <Icon name="bookmark" size={12} filled={savedOnly} /> Saved <span className={styles.count}>{saved.size}</span>
        </button>
      </div>

      <h2 id="explore-results" className="visually-hidden">
        Discoveries
      </h2>
      <div className={styles.summary}>
        <p role="status" className={styles.status}>
          {list.length === data.discoveries.length
            ? `All ${list.length} ideas, ${SORTS[sort].label.toLowerCase()} first.`
            : `Showing ${list.length} of ${data.discoveries.length} ideas.`}
          {savedOnly && !persistent ? ' Saved ideas are kept for this visit only: this browser is not allowing storage.' : ''}
        </p>
        <RatingExplainer range={data.noveltyRange} />
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={savedOnly && saved.size === 0 ? 'Nothing saved yet' : 'No ideas match these filters'}
          action={
            <button type="button" className="btn" onClick={() => update({ q: null, cat: null, saved: null })}>
              Show all {data.discoveries.length}
            </button>
          }
        >
          <p>
            {savedOnly && saved.size === 0
              ? 'Use the bookmark on any idea to keep it here.'
              : 'Try fewer words, another category, or clear the filters.'}
          </p>
        </EmptyState>
      ) : (
        <ul role="list" className={styles.grid} data-view={view} aria-labelledby="explore-results">
          {list.map((d) => (
            <DiscoveryCard key={d.id} discovery={d} view={view} />
          ))}
        </ul>
      )}

      <aside className={styles.more} aria-label="More recorded runs">
        <p>
          Six of these ideas also open from <Link to={featuredPath()}>Featured discoveries</Link> on Discover. Runs you make
          yourself are saved in <Link to="/history">History</Link>.
        </p>
      </aside>
    </>
  );
}

export default function ExplorePage() {
  const { state, retry } = useExploreData();
  const date = formatDate(RECORDED_DATE);
  return (
    <div className="page">
      {state.status === 'error' ? (
        <ExploreLoadError title="Explore discoveries" onRetry={retry} />
      ) : (
        <>
          <header className="page-header">
            <h1 className="page-title">Explore discoveries</h1>
            <p className="page-lede">
              Every Discovery run recorded on <time dateTime={RECORDED_DATE}>{date}</time>, across nine areas. Each is a
              candidate hypothesis: rated out of 10, checked sentence by sentence, and linked to the passages behind it.
            </p>
          </header>
          <ExploreTabs data={state.status === 'ready' ? state.data : undefined} />
          {state.status === 'ready' ? <ExploreBody data={state.data} /> : <ExploreLoading label="Loading discoveries" />}
        </>
      )}
    </div>
  );
}
