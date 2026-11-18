import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CategoryBars, NoveltyScatter, RatingHistogram } from '../components/explore/ExploreCharts';
import { ExploreLoadError, ExploreLoading, ExploreTabs, RatingExplainer, Section, TranslatedNote } from '../components/explore/ExploreParts';
import { Term } from '../components/explore/Term';
import { Icon } from '../components/Icon';
import { CATEGORIES } from '../explore/categories';
import { fmtInt, fmtUsd } from '../explore/fmt';
import { explorePath } from '../explore/manifests';
import { categoryStats, exploreTotals, ratingHistogram, type ExploreData } from '../explore/model';
import { formatRating } from '../explore/rating';
import { useExploreData } from '../explore/useDiscoveries';
import { useLang, useT, type Lang } from '../i18n/lang';
import { statsText } from './ExploreStatsPage.i18n';
import styles from './ExploreStatsPage.module.css';

/** Text parts where every odd entry is a number to show bold. */
function Bold({ parts }: { parts: readonly string[] }) {
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <b key={i} className="num">{p}</b> : p))}
    </>
  );
}

/* /explore/stats: what the 46 recorded runs add up to, computed from the files. */

function Rate({ label, value, of, note, lang }: { label: ReactNode; value: number; of: number; note?: ReactNode; lang: Lang }) {
  const pct = of > 0 ? value / of : 0;
  return (
    <li className={styles.rate}>
      <span className={styles.rateLabel}>{label}</span>
      <span className={`${styles.rateValue} num`}>
        {fmtInt(value, lang)}
        <span className={styles.rateOf}>/{fmtInt(of, lang)}</span>
      </span>
      <span className={styles.rateTrack} aria-hidden="true">
        <span className={styles.rateFill} style={{ width: `${pct * 100}%` }} />
      </span>
      {note ? <span className={styles.rateNote}>{note}</span> : null}
    </li>
  );
}

function StatsBody({ data }: { data: ExploreData }) {
  const t = useT(statsText);
  const { lang } = useLang();
  const all = data.discoveries;
  const tot = exploreTotals(all);
  const bins = ratingHistogram(all);
  const cats = categoryStats(all, CATEGORIES);
  const avg = all.reduce((s, d) => s + d.ratingExact, 0) / all.length;
  const sentenceTotal = tot.sentences.grounded + tot.sentences.extrapolated + tot.sentences.risky;
  const usd = (v: number, digits = 2) => fmtUsd(v, digits, lang);
  const counts = t.sentenceCounts(tot.sentences.risky, tot.sentences.extrapolated, tot.sentences.grounded);
  const droppedAreas = data.droppedAreas;

  return (
    <div className={styles.body}>
      <ul role="list" className={styles.tiles} aria-label={t.glance}>
        <li className={styles.tile}>
          <span className={styles.tileLabel}>{t.tileIdeas}</span>
          <span className={styles.tileValue}>{fmtInt(tot.runs, lang)}</span>
          <span className={styles.tileNote}>{t.tileCategories(cats.length)}</span>
        </li>
        <li className={styles.tile} data-key>
          <span className={styles.tileLabel}>{t.tileAverage}</span>
          <span className={styles.tileValue}>
            {formatRating(avg, lang)}
            <span className={styles.tileUnit}> / 10</span>
          </span>
          <span className={styles.tileNote}>
            {t.tileRange(formatRating(Math.min(...all.map((d) => d.rating)), lang), formatRating(Math.max(...all.map((d) => d.rating)), lang))}
          </span>
        </li>
        <li className={styles.tile}>
          <span className={styles.tileLabel}>{t.tileCost}</span>
          <span className={styles.tileValue}>{usd(tot.cost.total)}</span>
          <span className={styles.tileNote}>{t.tilePerRun(usd(tot.cost.mean, 3))}</span>
        </li>
        <li className={styles.tile}>
          <span className={styles.tileLabel}>{t.tilePicks}</span>
          <span className={styles.tileValue}>{fmtInt(tot.picks, lang)}</span>
          <span className={styles.tileNote}>{t.tilePicksNote}</span>
        </li>
      </ul>

      <Section id="ratings" title={t.ratingsTitle} note={<RatingExplainer range={data.noveltyRange} />}>
        <div className={styles.charts}>
          <RatingHistogram bins={bins} />
          <CategoryBars stats={cats} />
        </div>
      </Section>

      <Section
        id="map"
        title={t.mapTitle}
        note={
          <p>
            <Term k="novelty" />
            {t.mapBefore}
            <Term k="plausibility" />
            {t.mapAfter}
          </p>
        }
      >
        <NoveltyScatter discoveries={all} />
      </Section>

      <Section id="held-up" title={t.heldTitle} note={<p>{t.heldNote(tot.runs)}</p>}>
        <ul role="list" className={styles.rates}>
          <Rate label={t.completed} value={tot.completed} of={tot.runs} note={t.completedNote} lang={lang} />
          <Rate label={t.checks} value={tot.checksSucceeded} of={tot.runs} note={t.checksNote(sentenceTotal)} lang={lang} />
          <Rate
            label={
              <>
                <Term k="plausibility" />
                {t.plausibleAfter}
              </>
            }
            value={tot.plausibleAt06}
            of={tot.runs}
            lang={lang}
          />
          <Rate
            label={t.noRisky}
            value={tot.noRisky}
            of={tot.runs}
            lang={lang}
            note={
              <>
                {counts.a}
                <Term k="risky">{t.risky}</Term>
                {counts.b}
                <Term k="extrapolated">{t.extrapolated}</Term>
                {counts.c}
                <Term k="grounded">{t.grounded}</Term>
                {counts.d}
                <Link to="/explore/quiz">{t.spotThem}</Link>
              </>
            }
          />
          <Rate label={t.picks} value={tot.picks} of={tot.runs} lang={lang} />
        </ul>
        <div className={styles.contract}>
          <Icon name="check" size={16} />
          <p>
            <strong>{t.citationsLead}</strong>
            <Bold parts={t.citations(fmtInt(tot.claimed, lang), fmtInt(tot.dropped, lang), fmtInt(0, lang))} />
          </p>
        </div>
      </Section>

      <Section id="cost" title={t.costTitle}>
        <div className={styles.cost}>
          <p className={styles.costLead}>
            <span className={`${styles.costTotal} num`}>{usd(tot.cost.total)}</span>
            {t.costLead(tot.runs)}
          </p>
          <ul role="list" className={styles.costList}>
            <li>
              <Bold parts={t.perRun(usd(tot.cost.mean, 3), usd(tot.cost.min, 3), usd(tot.cost.max, 3))} />
            </li>
            {tot.cost.byBatch.map((b) => (
              <li key={b.batch}>
                <Bold parts={t.batchLine(b.batch === 1 ? t.batch1 : t.batch2, usd(b.total), b.runs)} />
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {droppedAreas.length > 0 ? (
        <Section id="dropped" title={t.droppedTitle}>
          {droppedAreas.map((a) => (
            <div key={a.area} className={styles.dropped}>
              <p className={styles.droppedArea}>“{a.area}”</p>
              <p className={styles.droppedReason}>{a.reason}</p>
            </div>
          ))}
        </Section>
      ) : null}

      <p className={styles.back}>
        <Link to={explorePath()}>
          <Icon name="back" size={14} /> {t.back}
        </Link>
      </p>
    </div>
  );
}

export default function ExploreStatsPage() {
  const t = useT(statsText);
  const { state, retry } = useExploreData();
  if (state.status === 'error') {
    return (
      <div className="page">
        <ExploreLoadError title={t.title} onRetry={retry} />
      </div>
    );
  }
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">{t.title}</h1>
        <p className="page-lede">{t.lede}</p>
      </header>
      <ExploreTabs data={state.status === 'ready' ? state.data : undefined} />
      <TranslatedNote data={state.status === 'ready' ? state.data : undefined} />
      {state.status === 'ready' ? <StatsBody data={state.data} /> : <ExploreLoading label={t.loading} />}
    </div>
  );
}
