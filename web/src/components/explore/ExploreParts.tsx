import { useId, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { useBookmarks } from '../../explore/bookmarks';
import { catStyle, categoryName, type Category } from '../../explore/categories';
import { fmtNum } from '../../explore/fmt';
import { explorePath } from '../../explore/manifests';
import { pickSurprise, type Discovery, type ExploreData } from '../../explore/model';
import { formatRating, RATING_WEIGHTS, type NoveltyRange } from '../../explore/rating';
import { useLang, useT } from '../../i18n/lang';
import { riskBand } from '../../lib/scoreItems';
import { Icon, StatusIcon } from '../Icon';
import { SkeletonLines } from '../States';
import { Term } from './Term';
import { partsText } from './ExploreParts.i18n';
import styles from './ExploreParts.module.css';

/** The category's icon on a tile of its hue, then its name. */
export function CategoryTag({ category, short = false }: { category: Category; short?: boolean }) {
  const { lang } = useLang();
  return (
    <span className={styles.category} style={catStyle(category)}>
      <CategoryGlyph category={category} />
      <span>{categoryName(category, short, lang)}</span>
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
  const t = useT(partsText);
  return (
    <span className={styles.pick}>
      <Icon name="star" size={12} filled />
      {t.editorsPick}
    </span>
  );
}

/**
 * "7.4 / 10" with five stars filled to rating ÷ 2. Read as one image:
 * "Rated 7.4 out of 10".
 */
export function Rating({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const t = useT(partsText);
  const { lang } = useLang();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const stars = Math.min(5, Math.max(0, value / 2));
  const full = Math.floor(stars);
  const width = full * 17 + (stars - full) * 16;
  const star = (i: number) => (
    <path key={i} transform={`translate(${i * 17} 0)`} d="M8 .9l2.15 4.4 4.85.7-3.5 3.42.83 4.83L8 11.97l-4.33 2.28.83-4.83L1 6l4.85-.7z" />
  );
  return (
    <span className={styles.rating} data-size={size} role="img" aria-label={t.rated(formatRating(value, lang))}>
      <span className={styles.ratingNumber} aria-hidden="true">
        {formatRating(value, lang)}
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
  const t = useT(partsText);
  const { lang } = useLang();
  const failed = discovery.response.claimValidation?.validationFailed === true;
  const band = riskBand(discovery.scores.risk);
  return (
    <span className={styles.chip} data-tone={failed ? 'high' : band.tone}>
      {band.tone === 'high' ? <StatusIcon status="risky" size={12} /> : null}
      {t.claimRisk} <b>{failed ? t.unverified : fmtNum(discovery.scores.risk, 2, lang)}</b>
      <span className="visually-hidden">({failed ? t.notChecked : t.riskBand[band.tone]})</span>
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
  const t = useT(partsText);
  const { saved, toggle } = useBookmarks();
  const on = saved.has(id);
  return (
    <button
      type="button"
      className={compact ? styles.bookmarkIcon : `btn ${styles.bookmark}`}
      aria-pressed={on}
      aria-label={compact ? t.saveItem(label) : undefined}
      title={compact ? (on ? t.saved : t.save) : undefined}
      onClick={() => toggle(id)}
    >
      <Icon name="bookmark" size={compact ? 16 : 14} filled={on} />
      {compact ? null : on ? t.saved : t.save}
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
  const t = useT(partsText);
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
              {t.riskySentences(discovery.riskyCount)}
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
  const t = useT(partsText);
  const navigate = useNavigate();
  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab);
  return (
    <div className={styles.tabsRow}>
      <nav aria-label={t.tabsLabel}>
        <ul role="list" className={styles.tabs}>
          <li>
            <NavLink to="/explore" end className={tab}>
              <Icon name="grid" size={14} /> {t.tabDiscoveries}
            </NavLink>
          </li>
          <li>
            <NavLink to="/explore/stats" className={tab}>
              <Icon name="chart" size={14} /> {t.tabStatistics}
            </NavLink>
          </li>
          <li>
            <NavLink to="/explore/quiz" className={tab}>
              <Icon name="question" size={14} /> {t.tabQuiz}
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
        <Icon name="shuffle" size={14} /> {t.surprise}
      </button>
    </div>
  );
}

/** The rating formula, opened from a "How ratings work" button. */
export function RatingExplainer({
  range,
  discovery,
  align = 'start',
}: {
  range: NoveltyRange;
  discovery?: Discovery;
  /** Which edge the button and panel line up with. */
  align?: 'start' | 'end';
}) {
  const t = useT(partsText);
  const { lang } = useLang();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const w = RATING_WEIGHTS;
  const s = discovery?.scores;
  return (
    <div className={styles.explainer} data-align={align}>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="question" size={14} /> {t.howRatingsWork}
      </button>
      <div id={`${uid}-panel`} className={styles.explainerPanel} hidden={!open}>
        <p className={styles.formula}>
          {t.formulaRating} = 10 × ({fmtNum(w.plausibility, 2, lang)}·{t.formulaPlausibility} + {fmtNum(w.coherence, 2, lang)}·
          {t.formulaCoherence} + {fmtNum(w.novelty, 2, lang)}·{t.formulaNovelty}
          <sub>norm</sub> + {fmtNum(w.safety, 2, lang)}·(1 − {t.formulaRisk}))
        </p>
        <p>
          {t.formulaNovelty}
          <sub>norm</sub> {t.normExplain(fmtNum(range.min, 3, lang), fmtNum(range.max, 3, lang))}
        </p>
        {s && discovery ? (
          <p className={styles.formulaExample}>
            {t.thisIdea} 10 × ({fmtNum(w.plausibility, 2, lang)}·{fmtNum(s.plausibility, 2, lang)} + {fmtNum(w.coherence, 2, lang)}·
            {fmtNum(s.coherence, 2, lang)} + {fmtNum(w.novelty, 2, lang)}·{fmtNum(s.noveltyNorm, 2, lang)} +{' '}
            {fmtNum(w.safety, 2, lang)}·{fmtNum(1 - s.risk, 2, lang)}) = <b>{formatRating(discovery.rating, lang)}</b>
          </p>
        ) : null}
        <dl className={styles.inputs}>
          <div>
            <dt>
              <Term k="plausibility" />
            </dt>
            <dd>{t.plausibilityNote}</dd>
          </div>
          <div>
            <dt>
              <Term k="coherence" />
            </dt>
            <dd>{t.coherenceNote}</dd>
          </div>
          <div>
            <dt>
              <Term k="novelty" />
            </dt>
            <dd>{t.noveltyNote}</dd>
          </div>
          <div>
            <dt>
              <Term k="risk" />
            </dt>
            <dd>{t.riskNote}</dd>
          </div>
        </dl>
        <p className={styles.explainerNote}>{t.weightsNote}</p>
      </div>
    </div>
  );
}

/** Shown once on a page of translated discoveries; renders nothing in English. */
export function TranslatedNote({ data }: { data?: ExploreData }) {
  const t = useT(partsText);
  const { lang } = useLang();
  if (lang !== 'tr' || !data?.discoveries.some((d) => d.translated)) return null;
  return (
    <p className={styles.translatedNote}>
      <Icon name="doc" size={14} /> <span className={styles.translatedMark}>{t.translatedMark}</span> {t.translatedNote}
    </p>
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
  const t = useT(partsText);
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <div className={`notice notice-error ${styles.loadError}`} role="alert">
        <Icon name="error" />
        <div className={styles.loadErrorBody}>
          <strong>{t.loadErrorTitle}</strong>
          <p>{t.loadErrorBody}</p>
          <div className="cluster">
            <button type="button" className="btn btn-sm" onClick={onRetry}>
              {t.tryAgain}
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
