import { useId } from 'react';
import type { NaiveRagResponse, SingleLlmResponse } from '../api/types';
import { topicLabel } from '../lib/format';
import { discoveryScoreItems } from '../lib/scoreItems';
import { SYSTEMS } from '../lib/vocabulary';
import { NaiveCitations, RunStats } from './BaselineParts';
import { CopyText } from './CopyText';
import { ScoreBars } from './ScoreBars';
import styles from './DiscoverResult.module.css';

/** A single baseline run (POST /api/naive-rag or /api/single-llm), as saved in /api/runs. */
export function BaselineResult(
  props:
    | { kind: 'naive-rag'; topicA: string; topicB?: string | undefined; response: NaiveRagResponse }
    | { kind: 'single-llm'; topicA: string; topicB?: string | undefined; response: SingleLlmResponse },
) {
  const uid = useId();
  const system = props.kind === 'naive-rag' ? SYSTEMS.naiveRag : SYSTEMS.singleLlm;
  const r = props.response;
  return (
    <article className={styles.root} aria-labelledby={`${uid}-title`}>
      <header className={styles.header}>
        <h2 id={`${uid}-title`} className={styles.title}>
          {topicLabel(props.topicA, props.topicB)}
        </h2>
        <div className={styles.meta}>
          <span className="tag">{system.name} baseline</span>
          <CopyText value={r.correlationId} label="Correlation ID" />
        </div>
        <p className={styles.sectionNote}>{system.summary}</p>
      </header>
      <div className={styles.top}>
        <section aria-labelledby={`${uid}-hyp`}>
          <h3 id={`${uid}-hyp`} className={styles.sectionTitle}>
            Hypothesis
          </h3>
          <p className={styles.lead}>{r.hypothesis}</p>
          {props.kind === 'naive-rag' ? (
            <div style={{ marginTop: 'var(--s5)' }}>
              <h3 className={styles.sectionTitle}>Claimed citations</h3>
              <NaiveCitations data={props.response} />
            </div>
          ) : null}
          <RunStats
            retrieved={props.kind === 'naive-rag' ? props.response.retrievedChunkCount : undefined}
            ms={r.totalElapsedMs}
            input={r.inputTokens}
            output={r.outputTokens}
          />
        </section>
        <aside className={styles.scores} aria-labelledby={`${uid}-scores`}>
          <h3 id={`${uid}-scores`} className={styles.sectionTitle}>
            Scores
          </h3>
          {r.evaluation ? (
            <ScoreBars label="Baseline scores" items={discoveryScoreItems(r.evaluation)} />
          ) : (
            <p className="muted small">This run was not scored.</p>
          )}
        </aside>
      </div>
    </article>
  );
}
