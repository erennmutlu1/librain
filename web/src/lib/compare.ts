import type { CompareOutcome, CompareResponse, DiscoverResponse, NaiveRagResponse, SingleLlmResponse } from '../api/types';

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

export function outcomeState<T>(outcome: CompareOutcome<T>): SystemState<T> {
  if (outcome.result) return { status: 'success', data: outcome.result };
  return { status: 'error', error: new Error(outcome.error ?? 'No result was returned.'), correlationId: outcome.correlationId };
}

export function compareStates(response: CompareResponse): CompareStates {
  return {
    librain: outcomeState(response.librain),
    naiveRag: outcomeState(response.naiveRag),
    singleLlm: outcomeState(response.singleLlm),
  };
}
