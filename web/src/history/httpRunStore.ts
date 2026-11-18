import { ApiError } from '../api/errors';
import type { LibrainApi } from '../api/types';
import type { RunStore } from './runStore';

/** History backed by the API's /api/runs (SQLite on the server). */
export function createHttpRunStore(api: LibrainApi, limit = 100): RunStore {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  return {
    location: 'server',
    list: (filter = {}) => api.listRuns(filter.kind ? { kind: filter.kind, limit } : { limit }),
    async get(id) {
      try {
        return await api.getRun(id);
      } catch (error) {
        // /api/runs/{id} is constrained to GUIDs, so a malformed id is a 404 too.
        if (error instanceof ApiError && error.status === 404) return undefined;
        throw error;
      }
    },
    async save() {
      // The API has already saved the run; just let open lists refresh.
      notify();
    },
    async remove(id) {
      await api.deleteRun(id);
      notify();
    },
    status: () => ({ persistent: true }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
