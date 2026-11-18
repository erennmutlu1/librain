import { useId, type ReactNode } from 'react';
import type { DiscoveryEvaluation } from '../api/types';
import { locale, useLang, useT, type Lang } from '../i18n/lang';
import { auditClaimedCitations } from '../lib/citations';
import { compareTakeaway, type CompareStates, type ScoreKey, type SystemState } from '../lib/compare';
import { formatScore } from '../lib/format';
import { usePaperIndex } from '../lib/papers';
import { discoveryAxes } from '../lib/scoreItems';
import { SYSTEMS, systemMeta, type SystemKey } from '../lib/vocabulary';
import { AnnotatedClaim } from './AnnotatedClaim';
import { NaiveCitations, RunStats } from './BaselineParts';
import { FencedHypothesis } from './FencedHypothesis';
import { InfoTip } from './InfoTip';
import { ErrorNotice, SkeletonLines } from './States';
import { RequestId } from './TechDetails';
import { text } from './CompareView.i18n';
import styles from './CompareView.module.css';

type Props = CompareStates;

export function SystemKeySwatch({ system }: { system: SystemKey }) {
  return <span className={styles.swatch} data-system={system} aria-hidden="true" />;
}

/** The three systems in one plain sentence each. */
export function SystemsExplainer() {
  const { lang } = useLang();
  return (
    <dl className={styles.explainer}>
      {(Object.keys(SYSTEMS) as SystemKey[]).map((key) => (
        <div key={key} className={styles.explainerItem} data-system={key}>
          <dt>
            <SystemKeySwatch system={key} />
            {systemMeta(key, lang).name}
          </dt>
          <dd>{systemMeta(key, lang).summary}</dd>
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
  const t = useT(text);
  const { lang } = useLang();
  if (state.status === 'loading') {
    return (
      <td className={styles.cell}>
        <span className={styles.cellSkeleton} aria-hidden="true" />
        <span className="visually-hidden">{t.loading}</span>
      </td>
    );
  }
  if (state.status === 'error') return <td className={`${styles.cell} muted`}>{t.failed}</td>;
  if (typeof value !== 'number') return <td className={`${styles.cell} muted`}>{t.notScored}</td>;
  return (
    <td className={styles.cell}>
      <span className={styles.cellInner} data-system={system}>
        <span className={`${styles.cellValue} num`} data-best={best || undefined}>
          {formatScore(value, 2, lang)}
          {best ? <span className="visually-hidden">{t.highest}</span> : null}
        </span>
        <span className={styles.bar} aria-hidden="true">
          <span className={styles.barFill} data-system={system} style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
        </span>
      </span>
    </td>
  );
}

function ScoreTable({ librain, naiveRag, singleLlm }: Props) {
  const t = useT(text);
  const { lang } = useLang();
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
    if (s.status === 'error') return <span className="muted">{t.failed}</span>;
    if (key === 'librain' && librain.status === 'success') {
      const d = librain.data;
      return d.claimedEvidenceCount !== undefined ? (
        <span>
          {t.keptDropped(d.supportingEvidence.length, d.droppedEvidenceCount ?? 0).kept}
          <strong>{t.keptDropped(d.supportingEvidence.length, d.droppedEvidenceCount ?? 0).dropped}</strong>
        </span>
      ) : (
        <span>{t.kept(d.supportingEvidence.length)}</span>
      );
    }
    if (key === 'naiveRag' && naiveRag.status === 'success') {
      const audit = auditClaimedCitations(naiveRag.data.claimedCitations, naiveRag.data.fabricatedCitationCount);
      return (
        <span>
          {t.claimed(audit.total)}{' '}
          <strong className={audit.fabricated.length > 0 ? styles.fabCount : undefined}>{t.fabricated(audit.fabricated.length)}</strong>
        </span>
      );
    }
    return <span className="muted">{t.noRetrieval}</span>;
  };

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">{t.caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.axisHead}>
              <span className={styles.scale}>{t.axis}</span>
            </th>
            {systems.map((key) => (
              <th key={key} scope="col" className={styles.sysHead}>
                <SystemKeySwatch system={key} />
                {systemMeta(key, lang).name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {discoveryAxes(lang).map((axis) => {
            const values = systems.map((key) => evals[key]?.[axis.key]);
            const numeric = values.filter((v): v is number => typeof v === 'number');
            // Only a unique maximum is marked; a tie is not a win.
            const top = numeric.length > 1 ? Math.max(...numeric) : null;
            const max = top !== null && numeric.filter((v) => v === top).length === 1 ? top : null;
            return (
              <tr key={axis.key}>
                <th scope="row" className={styles.axis}>
                  {axis.label} <InfoTip k={axis.info} label={axis.label} />
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
              {t.risk} <InfoTip k="risk" label={t.risk} />
              <span className={styles.axisHint}>{t.riskHint}</span>
            </th>
            <td className={styles.cell}>
              {librain.status === 'success' && librain.data.claimValidation ? (
                <span className="num">
                  {formatScore(librain.data.claimValidation.aggregateRisk, 2, lang)}
                  {librain.data.claimValidation.validationFailed ? t.validationFailed : ''}
                </span>
              ) : librain.status === 'loading' ? (
                <span className={styles.cellSkeleton} aria-hidden="true" />
              ) : (
                <span className="muted">—</span>
              )}
            </td>
            {(['naiveRag', 'singleLlm'] as const).map((key) => (
              <td key={key} className={`${styles.cell} ${styles.textCell} muted`}>
                {states[key].status === 'loading' ? (
                  <span className={styles.cellSkeleton} aria-hidden="true" />
                ) : (
                  <>
                    {t.notMeasured} <InfoTip k="notMeasured" label={t.notMeasured} />
                  </>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={styles.axis}>
              {t.citations} <InfoTip k="fabricated" />
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
  const { lang } = useLang();
  const uid = useId();
  return (
    <section className={styles.column} data-system={system} aria-labelledby={`${uid}-h`} aria-busy={state.status === 'loading'}>
      <h2 id={`${uid}-h`} className={styles.columnTitle}>
        <SystemKeySwatch system={system} />
        {systemMeta(system, lang).name}
      </h2>
      {state.status === 'loading' ? <SkeletonLines lines={6} /> : null}
      {state.status === 'error' ? <ErrorNotice error={state.error} correlationId={state.correlationId ?? null} /> : null}
      {state.status === 'success' ? (
        <>
          {children}
          <RequestId value={state.data.correlationId} />
        </>
      ) : null}
    </section>
  );
}

/** "a, b and c" in the interface language. */
function list(items: string[], lang: Lang): string {
  return new Intl.ListFormat(locale(lang), { style: 'long', type: 'conjunction' }).format(items);
}

/**
 * "What this pair shows": two or three plain lines computed from the three
 * results (which system leads which score, what happened to citations, and
 * whose claim risk was measured). Nothing in it is written in advance.
 */
export function CompareTakeaway(states: Props) {
  const t = useT(text);
  const { lang } = useLang();
  const uid = useId();
  const facts = compareTakeaway(states);
  if (!facts) return null;
  const axes = discoveryAxes(lang);
  const scoreName = (key: ScoreKey) => (axes.find((a) => a.key === key)?.label ?? key).toLocaleLowerCase(locale(lang));
  const names = (keys: ScoreKey[]) => list(keys.map(scoreName), lang);

  const lines: string[] = [];
  if (facts.leads.length > 0) {
    lines.push(t.leads(facts.leads.map((l) => ({ name: systemMeta(l.system, lang).name, scores: names(l.scores) }))) + (facts.ties.length > 0 ? ` ${t.ties(names(facts.ties))}` : ''));
  } else if (facts.ties.length > 0) {
    lines.push(t.allTied(names(facts.ties)));
  }
  const citations = [
    facts.naiveCitations ? t.naiveCitations(facts.naiveCitations.fabricated, facts.naiveCitations.total) : null,
    facts.librainCitations ? t.librainCitations(facts.librainCitations.dropped) : null,
  ].filter((x): x is string => x !== null);
  if (citations.length > 0) lines.push(citations.join(' '));
  if (facts.librainRisk) {
    lines.push(
      facts.librainRisk.failed
        ? t.riskFailed
        : t.riskOnlyLibrain(formatScore(facts.librainRisk.value, 2, lang), facts.baselinesShown),
    );
  }
  if (lines.length === 0) return null;

  return (
    <section className={styles.takeaway} aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className={styles.takeawayTitle}>
        {t.takeawayTitle}
      </h2>
      <ul className={styles.takeawayList}>
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

export function CompareView({ librain, naiveRag, singleLlm }: Props) {
  const t = useT(text);
  const papers = usePaperIndex();
  return (
    <div className={styles.root}>
      <CompareTakeaway librain={librain} naiveRag={naiveRag} singleLlm={singleLlm} />
      <ScoreTable librain={librain} naiveRag={naiveRag} singleLlm={singleLlm} />

      <div className={styles.columns}>
        <Column system="librain" state={librain}>
          {librain.status === 'success' ? (
              <>
                <FencedHypothesis className={styles.hypothesis} hypothesis={librain.data.hypothesis} novelClaim={librain.data.novelClaim} />
                <div className={styles.block}>
                  <p className={styles.blockTitle}>{t.claimChecked}</p>
                  <AnnotatedClaim
                    compact
                    novelClaim={librain.data.novelClaim}
                    validation={librain.data.claimValidation}
                    basis={librain.data.extrapolationBasis}
                    evidence={librain.data.supportingEvidence}
                    papers={papers}
                  />
                </div>
                <p className={styles.stats}>{t.supportingKept(librain.data.supportingEvidence.length)}</p>
              </>
            ) : null}
        </Column>

        <Column system="naiveRag" state={naiveRag}>
          {naiveRag.status === 'success' ? (
              <>
                <p className={styles.hypothesis}>{naiveRag.data.hypothesis}</p>
                <div className={styles.block}>
                  <p className={styles.blockTitle}>{t.claimedCitations}</p>
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
                <p className={styles.note}>{t.noRetrievalNote}</p>
                <RunStats ms={singleLlm.data.totalElapsedMs} input={singleLlm.data.inputTokens} output={singleLlm.data.outputTokens} />
              </>
            ) : null}
        </Column>
      </div>
    </div>
  );
}
