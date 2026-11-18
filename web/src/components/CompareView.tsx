import { useId, type ReactNode } from 'react';
import type { DiscoveryEvaluation } from '../api/types';
import { auditClaimedCitations } from '../lib/citations';
import type { CompareStates, SystemState } from '../lib/compare';
import { formatScore } from '../lib/format';
import { usePaperIndex } from '../lib/papers';
import { DISCOVERY_AXES } from '../lib/scoreItems';
import { SYSTEMS, type SystemKey } from '../lib/vocabulary';
import { AnnotatedClaim } from './AnnotatedClaim';
import { NaiveCitations, RunStats } from './BaselineParts';
import { CopyText } from './CopyText';
import { FencedHypothesis } from './FencedHypothesis';
import { ErrorNotice, SkeletonLines } from './States';
import styles from './CompareView.module.css';

type Props = CompareStates;

export function SystemKeySwatch({ system }: { system: SystemKey }) {
  return <span className={styles.swatch} data-system={system} aria-hidden="true" />;
}

/** The three systems in one plain sentence each. */
export function SystemsExplainer() {
  return (
    <dl className={styles.explainer}>
      {(Object.keys(SYSTEMS) as SystemKey[]).map((key) => (
        <div key={key} className={styles.explainerItem} data-system={key}>
          <dt>
            <SystemKeySwatch system={key} />
            {SYSTEMS[key].name}
          </dt>
          <dd>{SYSTEMS[key].summary}</dd>
        </div>
      ))}
    </dl>
  );
}

function evaluationOf(state: SystemState<{ evaluation: DiscoveryEvaluation | null }>): DiscoveryEvaluation | null | undefined {
  if (state.status === 'success') return state.data.evaluation;
  return undefined;
}

function ScoreCell({ system, state, value, best }: { system: SystemKey; state: SystemState<unknown>; value: number | null | undefined; best: boolean }) {
  if (state.status === 'loading') {
    return (
      <td className={styles.cell}>
        <span className={styles.cellSkeleton} aria-hidden="true" />
        <span className="visually-hidden">Loading</span>
      </td>
    );
  }
  if (state.status === 'error') return <td className={`${styles.cell} muted`}>Failed</td>;
  if (typeof value !== 'number') return <td className={`${styles.cell} muted`}>Not scored</td>;
  return (
    <td className={styles.cell}>
      <span className={styles.cellInner} data-system={system}>
        <span className={`${styles.cellValue} num`} data-best={best || undefined}>
          {formatScore(value)}
          {best ? <span className="visually-hidden"> (highest)</span> : null}
        </span>
        <span className={styles.bar} aria-hidden="true">
          <span className={styles.barFill} data-system={system} style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
        </span>
      </span>
    </td>
  );
}

function ScoreTable({ librain, naiveRag, singleLlm }: Props) {
  const evals: Record<SystemKey, DiscoveryEvaluation | null | undefined> = {
    librain: evaluationOf(librain),
    naiveRag: evaluationOf(naiveRag),
    singleLlm: evaluationOf(singleLlm),
  };
  const states: Record<SystemKey, SystemState<unknown>> = { librain, naiveRag, singleLlm };
  const systems = Object.keys(SYSTEMS) as SystemKey[];

  const citations = (key: SystemKey): ReactNode => {
    const s = states[key];
    if (s.status === 'loading') return <span className={styles.cellSkeleton} aria-hidden="true" />;
    if (s.status === 'error') return <span className="muted">Failed</span>;
    if (key === 'librain' && librain.status === 'success') {
      const d = librain.data;
      return d.claimedEvidenceCount !== undefined ? (
        <span>
          {d.supportingEvidence.length} kept, <strong>{d.droppedEvidenceCount ?? 0} dropped</strong>
        </span>
      ) : (
        <span>{d.supportingEvidence.length} kept</span>
      );
    }
    if (key === 'naiveRag' && naiveRag.status === 'success') {
      const audit = auditClaimedCitations(naiveRag.data.claimedCitations, naiveRag.data.fabricatedCitationCount);
      return (
        <span>
          {audit.total} claimed,{' '}
          <strong className={audit.fabricated.length > 0 ? styles.fabCount : undefined}>{audit.fabricated.length} fabricated</strong>
        </span>
      );
    }
    return <span className="muted">None (no retrieval)</span>;
  };

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">Scores by system, 0 to 1, higher is better</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.axisHead}>
              <span className="visually-hidden">Axis</span>
            </th>
            {systems.map((key) => (
              <th key={key} scope="col" className={styles.sysHead}>
                <SystemKeySwatch system={key} />
                {SYSTEMS[key].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DISCOVERY_AXES.map((axis) => {
            const values = systems.map((key) => evals[key]?.[axis.key]);
            const numeric = values.filter((v): v is number => typeof v === 'number');
            // Only a unique maximum is marked; a tie is not a win.
            const top = numeric.length > 1 ? Math.max(...numeric) : null;
            const max = top !== null && numeric.filter((v) => v === top).length === 1 ? top : null;
            return (
              <tr key={axis.key}>
                <th scope="row" className={styles.axis}>
                  {axis.label}
                  <span className={styles.axisHint}>{axis.hint}</span>
                </th>
                {systems.map((key, i) => (
                  <ScoreCell key={key} system={key} state={states[key]} value={values[i]} best={max !== null && values[i] === max} />
                ))}
              </tr>
            );
          })}
          <tr>
            <th scope="row" className={styles.axis}>
              Hallucination risk
              <span className={styles.axisHint}>Max per-sentence probability; lower is better</span>
            </th>
            <td className={styles.cell}>
              {librain.status === 'success' && librain.data.claimValidation ? (
                <span className="num">
                  {formatScore(librain.data.claimValidation.aggregateRisk)}
                  {librain.data.claimValidation.validationFailed ? ' (validation failed)' : ''}
                </span>
              ) : librain.status === 'loading' ? (
                <span className={styles.cellSkeleton} aria-hidden="true" />
              ) : (
                <span className="muted">—</span>
              )}
            </td>
            <td className={`${styles.cell} muted`}>Not measured</td>
            <td className={`${styles.cell} muted`}>Not measured</td>
          </tr>
          <tr>
            <th scope="row" className={styles.axis}>
              Citations
            </th>
            {systems.map((key) => (
              <td key={key} className={`${styles.cell} ${styles.textCell}`}>
                {citations(key)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Column({ system, state, children }: { system: SystemKey; state: SystemState<{ correlationId: string }>; children: ReactNode }) {
  const uid = useId();
  return (
    <section className={styles.column} data-system={system} aria-labelledby={`${uid}-h`} aria-busy={state.status === 'loading'}>
      <h2 id={`${uid}-h`} className={styles.columnTitle}>
        <SystemKeySwatch system={system} />
        {SYSTEMS[system].name}
      </h2>
      {state.status === 'loading' ? <SkeletonLines lines={6} /> : null}
      {state.status === 'error' ? <ErrorNotice error={state.error} correlationId={state.correlationId ?? null} /> : null}
      {state.status === 'success' ? (
        <>
          {children}
          <CopyText value={state.data.correlationId} label="Correlation ID" />
        </>
      ) : null}
    </section>
  );
}

export function CompareView({ librain, naiveRag, singleLlm }: Props) {
  const papers = usePaperIndex();
  return (
    <div className={styles.root}>
      <ScoreTable librain={librain} naiveRag={naiveRag} singleLlm={singleLlm} />

      <div className={styles.columns}>
        <Column system="librain" state={librain}>
          {librain.status === 'success' ? (
              <>
                <FencedHypothesis className={styles.hypothesis} hypothesis={librain.data.hypothesis} novelClaim={librain.data.novelClaim} />
                <div className={styles.block}>
                  <p className={styles.blockTitle}>Novel claim, checked</p>
                  <AnnotatedClaim
                    compact
                    novelClaim={librain.data.novelClaim}
                    validation={librain.data.claimValidation}
                    basis={librain.data.extrapolationBasis}
                    evidence={librain.data.supportingEvidence}
                    papers={papers}
                  />
                </div>
                <p className={styles.stats}>{librain.data.supportingEvidence.length} supporting chunks kept</p>
              </>
            ) : null}
        </Column>

        <Column system="naiveRag" state={naiveRag}>
          {naiveRag.status === 'success' ? (
              <>
                <p className={styles.hypothesis}>{naiveRag.data.hypothesis}</p>
                <div className={styles.block}>
                  <p className={styles.blockTitle}>Claimed citations</p>
                  <NaiveCitations data={naiveRag.data} />
                </div>
                <RunStats
                  retrieved={naiveRag.data.retrievedChunkCount}
                  ms={naiveRag.data.totalElapsedMs}
                  input={naiveRag.data.inputTokens}
                  output={naiveRag.data.outputTokens}
                />
              </>
            ) : null}
        </Column>

        <Column system="singleLlm" state={singleLlm}>
          {singleLlm.status === 'success' ? (
              <>
                <p className={styles.hypothesis}>{singleLlm.data.hypothesis}</p>
                <p className={styles.note}>No retrieval, so there is nothing to cite and nothing to check against.</p>
                <RunStats ms={singleLlm.data.totalElapsedMs} input={singleLlm.data.inputTokens} output={singleLlm.data.outputTokens} />
              </>
            ) : null}
        </Column>
      </div>
    </div>
  );
}
