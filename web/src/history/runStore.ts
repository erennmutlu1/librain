/*
 * THE SEAM for run history. Every screen talks to `RunStore` through
 * <RunStoreProvider>; createDefaultRunStore picks the implementation:
 *
 *   live API  -> createHttpRunStore: GET/DELETE /api/runs. The API saves every
 *                successful run itself (id = correlationId), so save() only
 *                tells listeners to refresh.
 *   mock mode -> createLocalRunStore: the browser's localStorage, because no
 *                server exists to save anything.
 */
import type { LibrainApi, RunKind } from '../api/types';
import { createHttpRunStore } from './httpRunStore';
import { createLocalRunStore } from './localRunStore';
import type { RunDetail, RunListItem } from './types';

export interface RunStoreStatus {
  /** False when runs are only kept in memory for this tab. */
  persistent: boolean;
  /** Human-readable reason when not persistent or the last write failed. */
  problem?: string;
}

export interface RunStore {
  /** Where runs live: the API's database or this browser. */
  readonly location: 'server' | 'browser';
  /** Newest first. */
  list(filter?: { kind?: RunKind }): Promise<RunListItem[]>;
  /** Undefined when the run does not exist. */
  get(id: string): Promise<RunDetail | undefined>;
  /** Records a finished run (a no-op for the server store, which saves on its own). */
  save(run: RunDetail): Promise<void>;
  remove(id: string): Promise<void>;
  /** Deletes everything; only the browser store supports it. */
  clear?: () => Promise<void>;
  status(): RunStoreStatus;
  /** Called after any change, including from another tab. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createDefaultRunStore(api: LibrainApi): RunStore {
  return api.mode === 'live' ? createHttpRunStore(api) : createLocalRunStore();
}
