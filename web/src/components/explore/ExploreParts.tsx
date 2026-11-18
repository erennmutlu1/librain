import { useId, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { useBookmarks } from '../../explore/bookmarks';
import { catStyle, type Category } from '../../explore/categories';
import { explorePath } from '../../explore/manifests';
import { pickSurprise, type Discovery, type ExploreData } from '../../explore/model';
import { formatRating, RATING_WEIGHTS, type NoveltyRange } from '../../explore/rating';
import { formatScore } from '../../lib/format';
import { riskBand } from '../../lib/scoreItems';
import { Icon, StatusIcon } from '../Icon';
import { SkeletonLines } from '../States';
import { Term } from './Term';
import styles from './ExploreParts.module.css';

/** The category's icon on a tile of its hue, then its name. */
export function CategoryTag({ category, short = false }: { category: Category; short?: boolean }) {
  return (
    <span className={styles.category} style={catStyle(category)}>
      <CategoryGlyph category={category} />
      <span>{short ? category.short : category.name}</span>
    </span>
  );
}

export function CategoryGlyph({ category, size = 14 }: { category: Category; size?: number }) {
  return (
    <span className={styles.glyph} style={catStyle(category)} aria-hidden="true">
      <Icon name={category.icon} size={size} />
    </span>
  );
}

export function PickBadge() {
  return (
    <span className={styles.pick}>
      <Icon name="star" size={12} filled />
      Editor’s pick
    </span>
  );
}

/**
 * "7.4 / 10" with five stars filled to rating ÷ 2. Read as one image:
 * "Rated 7.4 out of 10".
 */
export function Rating({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const stars = Math.min(5, Math.max(0, value / 2));
  const full = Math.floor(stars);
  const width = full * 17 + (stars - full) * 16;
  const star = (i: number) => (
    <path key={i} transform={`translate(${i * 17} 0)`} d="M8 .9l2.15 4.4 4.85.7-3.5 3.42.83 4.83L8 11.97l-4.33 2.28.83-4.83L1 6l4.85-.7z" />
  );
  return (
    <span className={styles.rating} data-size={size} role="img" aria-label={`Rated ${formatRating(value)} out of 10`}>
      <span className={styles.ratingNumber} aria-hidden="true">
        {formatRating(value)}
        <span className={styles.ratingOutOf}> / 10</span>
      </span>
      <svg className={styles.stars} viewBox="0 0 84 16" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={`${uid}-fill`}>
            <rect x="0" y="0" width={width} height="16" />
          </clipPath>
        </defs>
        <g className={styles.starsEmpty}>{[0, 1, 2, 3, 4].map(star)}</g>
        <g className={styles.starsFull} clipPath={`url(#${uid}-fill)`}>
          {[0, 1, 2, 3, 4].map(star)}
        </g>
      </svg>
    </span>
  );
}

export function RiskChip({ discovery }: { discovery: Discovery }) {
  const failed = discovery.response.claimValidation?.validationFailed === true;
  const band = riskBand(discovery.scores.risk);
  return (
    <span className={styles.chip} data-tone={failed ? 'high' : band.tone}>
      {band.tone === 'high' ? <StatusIcon status="risky" size={12} /> : null}
      Claim risk <b>{failed ? 'unverified' : formatScore(discovery.scores.risk)}</b>
      <span className="visually-hidden">({failed ? 'not checked' : band.label.toLowerCase()})</span>
    </span>
  );
}

export function TopicPair({ discovery }: { discovery: Discovery }) {
  const { topicA, topicB } = discovery.request;
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

export function BookmarkButton({ id, label, compact = false }: { id: string; label: string; compact?: boolean }) {
  const { saved, toggle } = useBookmarks();
  const on = saved.has(id);
  return (
    <button
      type="button"
      className={compact ? styles.bookmarkIcon : `btn ${styles.bookmark}`}
      aria-pressed={on}
      aria-label={compact ? `Save ${label}` : undefined}
      title={compact ? (on ? 'Saved' : 'Save') : undefined}
      onClick={() => toggle(id)}
    >
      <Icon name="bookmark" size={compact ? 16 : 14} filled={on} />
      {compact ? null : on ? 'Saved' : 'Save'}
    </button>
  );
}

/** A grid or list card for one run. The whole card is the link's hit area. */
export function DiscoveryCard({
  discovery,
  level = 3,
  view = 'grid',
}: {
  discovery: Discovery;
  level?: 2 | 3;
  view?: 'grid' | 'list';
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <li className={styles.card} data-view={view} style={catStyle(discovery.category)}>
      <div className={styles.cardMeta}>
        <CategoryTag category={discovery.category} />
        {discovery.pick ? <PickBadge /> : null}
      </div>
      <Heading className={styles.cardTitle}>
        <Link to={explorePath(discovery.id)} className={styles.cardLink}>
          <TopicPair discovery={discovery} />
        </Link>
      </Heading>
      <p className={styles.takeaway}>{discovery.takeaway}</p>
      <div className={styles.cardFoot}>
        <Rating value={discovery.rating} size="sm" />
        <span className={styles.cardChips}>
          <RiskChip discovery={discovery} />
          {discovery.riskyCount > 0 ? (
            <span className={`${styles.chip} ${styles.risky}`}>
              {discovery.riskyCount} risky {discovery.riskyCount === 1 ? 'sentence' : 'sentences'}
            </span>
          ) : null}
        </span>
        <span className={styles.cardSave}>
          <BookmarkButton id={discovery.id} label={`${discovery.id}: ${discovery.request.topicA}`} compact />
        </span>
      </div>
    </li>
  );
}

/** Explore's sections, and a way into a random high-rated idea from any of them. */
export function ExploreTabs({ data, currentId }: { data?: ExploreData; currentId?: string }) {
  const navigate = useNavigate();
  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab);
  return (
    <div className={styles.tabsRow}>
      <nav aria-label="Explore">
        <ul role="list" className={styles.tabs}>
          <li>
            <NavLink to="/explore" end className={tab}>
              <Icon name="grid" size={14} /> Discoveries
            </NavLink>
          </li>
          <li>
            <NavLink to="/explore/stats" className={tab}>
              <Icon name="chart" size={14} /> Statistics
            </NavLink>
          </li>
          <li>
            <NavLink to="/explore/quiz" className={tab}>
              <Icon name="question" size={14} /> Spot the risk
            </NavLink>
          </li>
        </ul>
      </nav>
      <button
        type="button"
        className={`btn btn-sm ${styles.surprise}`}
        disabled={!data}
        onClick={() => {
          const d = data ? pickSurprise(data.discoveries, currentId) : undefined;
          if (d) void navigate(explorePath(d.id));
        }}
      >
        <Icon name="shuffle" size={14} /> Surprise me
      </button>
    </div>
  );
}

/** The rating formula, opened from a "How ratings work" button. */
export function RatingExplainer({ range, discovery }: { range: NoveltyRange; discovery?: Discovery }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const w = RATING_WEIGHTS;
  const s = discovery?.scores;
  return (
    <div className={styles.explainer}>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="question" size={14} /> How ratings work
      </button>
      <div id={`${uid}-panel`} className={styles.explainerPanel} hidden={!open}>
        <p className={styles.formula}>
          rating = 10 × ({w.plausibility}·plausibility + {w.coherence}·coherence + {w.novelty}·novelty<sub>norm</sub> + {w.safety}·(1 − claim risk))
        </p>
        <p>
          novelty<sub>norm</sub> = (novelty − {range.min.toFixed(3)}) ÷ ({range.max.toFixed(3)} − {range.min.toFixed(3)}), so the least
          novel of the 46 ideas counts 0 and the most novel 1. Rounded to one decimal.
        </p>
        {s && discovery ? (
          <p className={styles.formulaExample}>
            This idea: 10 × ({w.plausibility}·{s.plausibility.toFixed(2)} + {w.coherence}·{s.coherence.toFixed(2)} + {w.novelty}·
            {s.noveltyNorm.toFixed(2)} + {w.safety}·{(1 - s.risk).toFixed(2)}) = <b>{formatRating(discovery.rating)}</b>
          </p>
        ) : null}
        <dl className={styles.inputs}>
          <div>
            <dt>
              <Term k="plausibility" />
            </dt>
            <dd>weighs most: a strong idea has to be believable.</dd>
          </div>
          <div>
            <dt>
              <Term k="coherence" />
            </dt>
            <dd>rewards an argument whose steps fit together.</dd>
          </div>
          <div>
            <dt>
              <Term k="novelty" />
            </dt>
            <dd>rewards distance from what the corpus already says.</dd>
          </div>
          <div>
            <dt>
              <Term k="risk" />
            </dt>
            <dd>docks ideas that state unsupported facts.</dd>
          </div>
        </dl>
        <p className={styles.explainerNote}>
          The weights rank these 46 recorded runs against each other. They are this page’s reading aid, not a score
          from the paper, and a high rating is still a candidate to test.
        </p>
      </div>
    </div>
  );
}

export function ExploreLoading({ label }: { label: string }) {
  return (
    <div aria-busy="true">
      <p role="status" className="visually-hidden">
        {label}
      </p>
      <SkeletonLines lines={6} />
    </div>
  );
}

export function ExploreLoadError({ onRetry, title }: { onRetry: () => void; title: string }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <div className={`notice notice-error ${styles.loadError}`} role="alert">
        <Icon name="error" />
        <div className={styles.loadErrorBody}>
          <strong>The recorded discoveries did not load.</strong>
          <p>They ship with the app, so this usually means the page is out of date after an update. Reload the page, or try again.</p>
          <div className="cluster">
            <button type="button" className="btn btn-sm" onClick={onRetry}>
              Try again
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** A short section with a heading, as the detail and stats pages use. */
export function Section({ id, title, children, note }: { id: string; title: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.sectionTitle}>
        {title}
      </h2>
      {note ? <div className={styles.sectionNote}>{note}</div> : null}
      {children}
    </section>
  );
}
