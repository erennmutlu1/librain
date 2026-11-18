import { pick, strings } from '../i18n/lang';
import type { CompareOutcome, CompareResponse, DiscoverResponse, DiscoveryEvaluation, NaiveRagResponse, SingleLlmResponse } from '../api/types';
import { auditClaimedCitations } from './citations';
import { DISCOVERY_KEYS } from './scoreItems';
import type { SystemKey } from './vocabulary';

/** One system's column on the Compare screen. */
export type SystemState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown; correlationId?: string | null };

export interface CompareStates {
  librain: SystemState<DiscoverResponse>;
  naiveRag: SystemState<NaiveRagResponse>;
  singleLlm: SystemState<SingleLlmResponse>;
}

export const ALL_LOADING: CompareStates = {
  librain: { status: 'loading' },
  naiveRag: { status: 'loading' },
  singleLlm: { status: 'loading' },
};

const text = strings({
  en: { noResult: 'No result was returned.' },
  tr: { noResult: 'Sonuç döndürülmedi.' },
});

export function outcomeState<T>(outcome: CompareOutcome<T>): SystemState<T> {
  if (outcome.result) return { status: 'success', data: outcome.result };
  return { status: 'error', error: new Error(outcome.error ?? pick(text).noResult), correlationId: outcome.correlationId };
}

export function compareStates(response: CompareResponse): CompareStates {
  return {
    librain: outcomeState(response.librain),
    naiveRag: outcomeState(response.naiveRag),
    singleLlm: outcomeState(response.singleLlm),
  };
}

// ---------- "What this pair shows" ----------

export type ScoreKey = (typeof DISCOVERY_KEYS)[number];
const SYSTEM_ORDER: readonly SystemKey[] = ['librain', 'naiveRag', 'singleLlm'];

/** The facts behind Compare's takeaway, computed from the three results (nothing hardcoded). */
export interface CompareTakeaway {
  /** Scores where one system is strictly highest, grouped by that system (systems in table order). */
  leads: { system: SystemKey; scores: ScoreKey[] }[];
  /** Scores where two or more systems share the highest value. */
  ties: ScoreKey[];
  /** Naive RAG's citations: how many point outside its retrieved passages. */
  naiveCitations: { fabricated: number; total: number } | null;
  /** LIBRAIN's citation check; null when the run predates the counters. */
  librainCitations: { claimed: number; dropped: number } | null;
  /** LIBRAIN's claim risk; the baselines have none (no sentence check). */
  librainRisk: { value: number; failed: boolean } | null;
  /** At least one baseline returned a result, so "baselines are not measured" is worth saying. */
  baselinesShown: boolean;
}

function evaluationOf(state: SystemState<{ evaluation: DiscoveryEvaluation | null }>): DiscoveryEvaluation | null {
  return state.status === 'success' ? state.data.evaluation : null;
}

/**
 * Reads the three results and says which system leads which score, what
 * happened to citations, and whose claim risk was measured. Null while any
 * system is still loading, or when none returned a result.
 */
export function compareTakeaway(states: CompareStates): CompareTakeaway | null {
  const all = [states.librain, states.naiveRag, states.singleLlm];
  if (all.some((s) => s.status === 'loading') || all.every((s) => s.status !== 'success')) return null;

  const evals: Record<SystemKey, DiscoveryEvaluation | null> = {
    librain: evaluationOf(states.librain),
    naiveRag: evaluationOf(states.naiveRag),
    singleLlm: evaluationOf(states.singleLlm),
  };

  const byLeader = new Map<SystemKey, ScoreKey[]>();
  const ties: ScoreKey[] = [];
  for (const key of DISCOVERY_KEYS) {
    const scored = SYSTEM_ORDER.flatMap((system) => {
      const v = evals[system]?.[key];
      return typeof v === 'number' && Number.isFinite(v) ? [{ system, v }] : [];
    });
    // A lead needs something to lead over.
    if (scored.length < 2) continue;
    const top = Math.max(...scored.map((s) => s.v));
    const at = scored.filter((s) => s.v === top);
    if (at.length > 1) ties.push(key);
    else byLeader.set(at[0]!.system, [...(byLeader.get(at[0]!.system) ?? []), key]);
  }
  const leads = SYSTEM_ORDER.filter((s) => byLeader.has(s)).map((system) => ({ system, scores: byLeader.get(system)! }));

  let naiveCitations: CompareTakeaway['naiveCitations'] = null;
  if (states.naiveRag.status === 'success') {
    const audit = auditClaimedCitations(states.naiveRag.data.claimedCitations, states.naiveRag.data.fabricatedCitationCount);
    naiveCitations = { fabricated: audit.fabricated.length, total: audit.total };
  }

  let librainCitations: CompareTakeaway['librainCitations'] = null;
  let librainRisk: CompareTakeaway['librainRisk'] = null;
  if (states.librain.status === 'success') {
    const d = states.librain.data;
    if (d.claimedEvidenceCount !== undefined) librainCitations = { claimed: d.claimedEvidenceCount, dropped: d.droppedEvidenceCount ?? 0 };
    if (d.claimValidation) librainRisk = { value: d.claimValidation.aggregateRisk, failed: d.claimValidation.validationFailed === true };
  }

  return {
    leads,
    ties,
    naiveCitations,
    librainCitations,
    librainRisk,
    baselinesShown: states.naiveRag.status === 'success' || states.singleLlm.status === 'success',
  };
}
