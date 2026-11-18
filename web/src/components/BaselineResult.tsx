import { useId } from 'react';
import { useLang, useT } from '../i18n/lang';
import type { NaiveRagResponse, SingleLlmResponse } from '../api/types';
import { topicLabel } from '../lib/format';
import { discoveryScoreItems } from '../lib/scoreItems';
import { systemMeta } from '../lib/vocabulary';
import { text } from './BaselineResult.i18n';
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
  const t = useT(text);
  const { lang } = useLang();
  const uid = useId();
  const system = systemMeta(props.kind === 'naive-rag' ? 'naiveRag' : 'singleLlm', lang);
  const r = props.response;
  return (
    <article className={styles.root} aria-labelledby={`${uid}-title`}>
      <header className={styles.header}>
        <h2 id={`${uid}-title`} className={styles.title}>
          {topicLabel(props.topicA, props.topicB)}
        </h2>
        <div className={styles.meta}>
          <span className="tag">{t.baseline(system.name)}</span>
          <CopyText value={r.correlationId} label={t.correlationId} />
        </div>
        <p className={styles.sectionNote}>{system.summary}</p>
      </header>
      <div className={styles.top}>
        <section aria-labelledby={`${uid}-hyp`}>
          <h3 id={`${uid}-hyp`} className={styles.sectionTitle}>
            {t.hypothesis}
          </h3>
          <p className={styles.lead}>{r.hypothesis}</p>
          {props.kind === 'naive-rag' ? (
            <div style={{ marginTop: 'var(--s5)' }}>
              <h3 className={styles.sectionTitle}>{t.claimed}</h3>
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
            {t.scores}
          </h3>
          {r.evaluation ? (
            <ScoreBars label={t.scoresLabel} items={discoveryScoreItems(r.evaluation, lang)} />
          ) : (
            <p className="muted small">{t.notScored}</p>
          )}
        </aside>
      </div>
    </article>
  );
}
