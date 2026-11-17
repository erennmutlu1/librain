/*
 * THE SEAM for run history.
 *
 * The backend has no run store yet, so runs live in the browser
 * (createLocalRunStore). Every screen talks to the `RunStore` interface only,
 * through <RunStoreProvider>. When the API grows `/api/runs`, add a
 * createHttpRunStore() implementing the same interface (list -> GET
 * /api/runs, get -> GET /api/runs/{id}, save -> POST, remove -> DELETE) and
 * change `createDefaultRunStore` below. No component needs to change.
 */
import type { RunRecord } from './types';
import { createLocalRunStore } from './localRunStore';

export interface RunStoreStatus {
  /** False when runs are only kept in memory for this tab. */
  persistent: boolean;
  /** Human-readable reason when not persistent or the last write failed. */
  problem?: string;
}

export interface RunStore {
  /** Newest first. */
  list(): Promise<RunRecord[]>;
  get(id: string): Promise<RunRecord | undefined>;
  save(run: RunRecord): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  status(): RunStoreStatus;
  /** Called after any change, including from another tab. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createDefaultRunStore(): RunStore {
  return createLocalRunStore();
}

export function newRunId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `run_${Date.now().toString(36)}_${random}`;
}
