import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CategoryBars, NoveltyScatter, RatingHistogram } from '../components/explore/ExploreCharts';
import { ExploreLoadError, ExploreLoading, ExploreTabs, RatingExplainer, Section } from '../components/explore/ExploreParts';
import { Term } from '../components/explore/Term';
import { Icon } from '../components/Icon';
import { CATEGORIES } from '../explore/categories';
import { DROPPED_AREAS, explorePath } from '../explore/manifests';
import { categoryStats, exploreTotals, ratingHistogram, type ExploreData } from '../explore/model';
import { formatRating } from '../explore/rating';
import { useExploreData } from '../explore/useDiscoveries';
import styles from './ExploreStatsPage.module.css';

/* /explore/stats: what the 46 recorded runs add up to, computed from the files. */

function Rate({ label, value, of, note }: { label: ReactNode; value: number; of: number; note?: ReactNode }) {
  const pct = of > 0 ? value / of : 0;
  return (
    <li className={styles.rate}>
      <span className={styles.rateLabel}>{label}</span>
      <span className={`${styles.rateValue} num`}>
        {value}
        <span className={styles.rateOf}>/{of}</span>
      </span>
      <span className={styles.rateTrack} aria-hidden="true">
        <span className={styles.rateFill} style={{ width: `${pct * 100}%` }} />
      </span>
      {note ? <span className={styles.rateNote}>{note}</span> : null}
    </li>
  );
}

function StatsBody({ data }: { data: ExploreData }) {
  const all = data.discoveries;
  const t = exploreTotals(all);
  const bins = ratingHistogram(all);
  const cats = categoryStats(all, CATEGORIES);
  const avg = all.reduce((s, d) => s + d.ratingExact, 0) / all.length;
  const sentenceTotal = t.sentences.grounded + t.sentences.extrapolated + t.sentences.risky;
  const usd = (v: number, digits = 2) => `$${v.toFixed(digits)}`;

  return (
    <div className={styles.body}>
      <ul role="list" className={styles.tiles} aria-label="At a glance">
        <li className={styles.tile}>
          <span className={styles.tileLabel}>Ideas</span>
          <span className={styles.tileValue}>{t.runs}</span>
          <span className={styles.tileNote}>in {cats.length} categories</span>
        </li>
        <li className={styles.tile}>
          <span className={styles.tileLabel}>Average rating</span>
          <span className={styles.tileValue}>
            {formatRating(avg)}
            <span className={styles.tileUnit}> / 10</span>
          </span>
          <span className={styles.tileNote}>
            range {formatRating(Math.min(...all.map((d) => d.rating)))} to {formatRating(Math.max(...all.map((d) => d.rating)))}
          </span>
        </li>
        <li className={styles.tile}>
          <span className={styles.tileLabel}>Total cost</span>
          <span className={styles.tileValue}>{usd(t.cost.total)}</span>
          <span className={styles.tileNote}>{usd(t.cost.mean, 3)} per run on average</span>
        </li>
        <li className={styles.tile}>
          <span className={styles.tileLabel}>Editor’s picks</span>
          <span className={styles.tileValue}>{t.picks}</span>
          <span className={styles.tileNote}>chosen by reading every result</span>
        </li>
      </ul>

      <Section id="ratings" title="How the ideas rate" note={<RatingExplainer range={data.noveltyRange} />}>
        <div className={styles.charts}>
          <RatingHistogram bins={bins} />
          <CategoryBars stats={cats} />
        </div>
      </Section>

      <Section
        id="map"
        title="Novel and plausible?"
        note={
          <p>
            <Term k="novelty" /> is measured against the paper corpus; <Term k="plausibility" /> is a judge model’s
            estimate. The two pull against each other: the most novel ideas are rarely the most plausible.
          </p>
        }
      >
        <NoveltyScatter discoveries={all} />
      </Section>

      <Section id="held-up" title="How the runs held up" note={<p>Counts over all {t.runs} recorded runs.</p>}>
        <ul role="list" className={styles.rates}>
          <Rate label="Completed" value={t.completed} of={t.runs} note="Every run returned a full result." />
          <Rate
            label="Claim checks that succeeded"
            value={t.checksSucceeded}
            of={t.runs}
            note={`The validator returned a verdict for every novel-claim sentence: ${sentenceTotal} in all.`}
          />
          <Rate
            label={
              <>
                <Term k="plausibility" /> of 0.6 or more
              </>
            }
            value={t.plausibleAt06}
            of={t.runs}
          />
          <Rate
            label="No risky sentence"
            value={t.noRisky}
            of={t.runs}
            note={
              <>
                {t.sentences.risky} <Term k="risky">risky</Term>, {t.sentences.extrapolated}{' '}
                <Term k="extrapolated">extrapolated</Term> and {t.sentences.grounded} <Term k="grounded">grounded</Term>{' '}
                sentences. <Link to="/explore/quiz">Can you spot the risky ones?</Link>
              </>
            }
          />
          <Rate label="Editor’s picks" value={t.picks} of={t.runs} />
        </ul>
        <div className={styles.contract}>
          <Icon name="check" size={16} />
          <p>
            <strong>Citations:</strong> the models claimed {t.claimed} supporting passages; the citation contract dropped{' '}
            <b className="num">{t.dropped}</b> of them, and <b className="num">0</b> fabricated citations reached the output,
            because the contract keeps only passages that retrieval returned.
          </p>
        </div>
      </Section>

      <Section id="cost" title="What it cost">
        <div className={styles.cost}>
          <p className={styles.costLead}>
            <span className={`${styles.costTotal} num`}>{usd(t.cost.total)}</span> for all {t.runs} runs, from the token counts
            the API logged.
          </p>
          <ul role="list" className={styles.costList}>
            <li>
              Per run: <b className="num">{usd(t.cost.mean, 3)}</b> on average, from <b className="num">{usd(t.cost.min, 3)}</b> to{' '}
              <b className="num">{usd(t.cost.max, 3)}</b>.
            </li>
            {t.cost.byBatch.map((b) => (
              <li key={b.batch}>
                {b.batch === 1 ? 'First batch' : 'Second batch (new areas)'}: <b className="num">{usd(b.total)}</b> for {b.runs} runs.
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {DROPPED_AREAS.length > 0 ? (
        <Section id="dropped" title="An area left out">
          {DROPPED_AREAS.map((a) => (
            <div key={a.area} className={styles.dropped}>
              <p className={styles.droppedArea}>“{a.area}”</p>
              <p className={styles.droppedReason}>{a.reason}</p>
            </div>
          ))}
        </Section>
      ) : null}

      <p className={styles.back}>
        <Link to={explorePath()}>
          <Icon name="back" size={14} /> Back to all discoveries
        </Link>
      </p>
    </div>
  );
}

export default function ExploreStatsPage() {
  const { state, retry } = useExploreData();
  if (state.status === 'error') {
    return (
      <div className="page">
        <ExploreLoadError title="Explore statistics" onRetry={retry} />
      </div>
    );
  }
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Explore statistics</h1>
        <p className="page-lede">What the recorded discoveries add up to. Every number on this page is computed from the recorded run files.</p>
      </header>
      <ExploreTabs data={state.status === 'ready' ? state.data : undefined} />
      {state.status === 'ready' ? <StatsBody data={state.data} /> : <ExploreLoading label="Loading statistics" />}
    </div>
  );
}
