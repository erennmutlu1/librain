import { useId, useMemo } from 'react';
import type { DiscoverRequest, MockScenario } from '../api/types';
import { CategoryGlyph } from '../components/explore/ExploreParts';
import { CATEGORIES, categoryByPrefix, catStyle, type Category } from '../explore/categories';
import styles from './RecordedIndex.module.css';

/*
 * Discover's recorded runs as an index, not a heap of chips: grouped by the
 * area the run explores (the experiments' id letter, as on Explore), each run
 * showing its id and its topic pair on two lines. Runs from other experiments
 * (the baseline comparison, OpenAI runs, API snapshots) get a group named after
 * where they were recorded. Every button's accessible name is still the
 * scenario's label, so "F4 · topic a × topic b" names the F4 button.
 *
 * Like FormBits' RecordedRuns, it collapses once a result is on screen.
 */

type Scenario = MockScenario<DiscoverRequest>;

interface Group {
  key: string;
  title: string;
  category?: Category;
  runs: Scenario[];
}

const ID_LABEL = /^([A-Z]\d+) · (.+)$/;

function sourceGroup(source: string): { key: string; title: string } {
  if (source.startsWith('experiments/baseline-comparison')) return { key: 'baseline', title: 'Baseline comparison' };
  if (source.startsWith('experiments/discovery-openai')) return { key: 'openai', title: 'OpenAI runs' };
  if (source.startsWith('web/src/mocks/contract')) return { key: 'snapshot', title: 'API snapshots' };
  return { key: 'other', title: 'Other recordings' };
}

function groupRecordings(scenarios: readonly Scenario[]): Group[] {
  const byCategory = new Map<string, Group>();
  const others = new Map<string, Group>();
  for (const s of scenarios) {
    const m = /^explore-([A-Z])\d+$/i.exec(s.id);
    const category = m ? categoryByPrefix(m[1]!) : undefined;
    if (category) {
      const g = byCategory.get(category.prefix) ?? { key: category.prefix, title: category.name, category, runs: [] };
      g.runs.push(s);
      byCategory.set(category.prefix, g);
    } else {
      const { key, title } = sourceGroup(s.source);
      const g = others.get(key) ?? { key, title, runs: [] };
      g.runs.push(s);
      others.set(key, g);
    }
  }
  const ordered = CATEGORIES.map((c) => byCategory.get(c.prefix)).filter((g): g is Group => g !== undefined);
  return [...ordered, ...others.values()];
}

function RunLabel({ label }: { label: string }) {
  const m = ID_LABEL.exec(label);
  const id = m?.[1];
  const pair = m?.[2] ?? label;
  const cross = pair.indexOf(' × ');
  const topics =
    cross > 0 ? (
      <>
        <span className={styles.topic}>{pair.slice(0, cross)}</span> <span className={styles.cross}>×</span>{' '}
        <span className={styles.topic}>{pair.slice(cross + 3)}</span>
      </>
    ) : (
      <span className={styles.topic}>{pair}</span>
    );
  return (
    <>
      {id ? (
        <>
          <span className={styles.runId}>{id}</span> <span className="visually-hidden">·</span>{' '}
        </>
      ) : null}
      <span className={styles.pair}>{topics}</span>
    </>
  );
}

export function RecordedIndex({
  scenarios,
  onPick,
  disabled,
  collapsed = false,
}: {
  scenarios: readonly Scenario[] | undefined;
  onPick: (scenario: Scenario) => void;
  disabled?: boolean;
  collapsed?: boolean;
}) {
  const uid = useId();
  const groups = useMemo(() => groupRecordings(scenarios ?? []), [scenarios]);
  if (!scenarios || scenarios.length === 0) return null;
  const long = scenarios.length > 12;

  return (
    <details key={collapsed ? 'closed' : 'open'} className={styles.root} open={!collapsed}>
      <summary className={styles.summary}>
        <span className={styles.summaryLabel}>
          Recorded runs <span className="num">({scenarios.length})</span>
        </span>
        <span className={styles.summaryHint}>
          {groups.length > 1 ? `${groups.length} groups. ` : ''}Pick one to replay it.
        </span>
      </summary>
      <div className={styles.well} data-long={long || undefined}>
        {groups.map((g) => (
          <div
            key={g.key}
            role="group"
            className={styles.group}
            aria-labelledby={`${uid}-${g.key}`}
            style={g.category ? catStyle(g.category) : undefined}
          >
            <p id={`${uid}-${g.key}`} className={styles.groupTitle}>
              {g.category ? <CategoryGlyph category={g.category} size={12} /> : <span className={styles.plainGlyph} aria-hidden="true" />}
              <span>{g.title}</span>
              <span className={styles.groupCount}>{g.runs.length}</span>
            </p>
            <ul role="list" className={styles.runs}>
              {g.runs.map((s) => (
                <li key={s.id}>
                  <button type="button" className={styles.run} onClick={() => onPick(s)} disabled={disabled}>
                    <RunLabel label={s.label} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
