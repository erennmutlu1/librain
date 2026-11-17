import type {
  CompareRequest,
  DiscoverRequest,
  DiscoverResponse,
  NaiveRagResponse,
  QueryRequest,
  QueryResponse,
  SingleLlmResponse,
} from '../api/types';

/** A settled call: the value, or the error message the UI showed. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

export interface CompareResult {
  librain: Outcome<DiscoverResponse>;
  naiveRag: Outcome<NaiveRagResponse>;
  singleLlm: Outcome<SingleLlmResponse>;
}

interface RunBase {
  id: string;
  /** ISO timestamp. */
  createdAt: string;
  /** True when the run was answered from fixtures rather than the API. */
  mock: boolean;
  /** Question or topic pair, for lists. */
  label: string;
  /** Headline quality score (LIBRAIN's for Compare), or null when unscored. */
  quality: number | null;
}

export type AskRun = RunBase & { kind: 'ask'; request: QueryRequest; result: QueryResponse };
export type DiscoverRun = RunBase & { kind: 'discover'; request: DiscoverRequest; result: DiscoverResponse };
export type CompareRun = RunBase & { kind: 'compare'; request: CompareRequest; result: CompareResult };

export type RunRecord = AskRun | DiscoverRun | CompareRun;
export type RunKind = RunRecord['kind'];

export const RUN_KIND_LABEL: Record<RunKind, string> = {
  ask: 'Ask',
  discover: 'Discover',
  compare: 'Compare',
};
