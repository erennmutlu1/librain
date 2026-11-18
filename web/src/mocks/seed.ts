import { normalizeCompareResponse, normalizeDiscoverResponse } from '../api/normalize';
import type { LibrainApi, RunDetail } from '../api/types';
import { topicLabel } from '../lib/format';
import { compareScenarios, discoverScenarios } from './scenarios';

/**
 * Mock mode's "Load the recorded runs": the API's own run history at snapshot
 * time (runs.json and its records, served by the mock /api/runs), plus every
 * committed experiment recording. Loaded on demand so real-mode bundles never
 * include the fixtures.
 */
export async function recordedRuns(api: LibrainApi): Promise<RunDetail[]> {
  const captured = await api.listRuns();
  const fromApi = (await Promise.all(captured.map((s) => api.getRun(s.id)))).map((r) => ({ ...r, mock: true }));

  const base = Date.now();
  let minutes = 0;
  const loadedAt = () => new Date(base - ++minutes * 60_000).toISOString();

  const discover: RunDetail[] = discoverScenarios
    .filter((s) => !s.id.startsWith('contract-'))
    .map((s) => {
      const response = normalizeDiscoverResponse(s.response);
      return {
        id: response.correlationId,
        kind: 'discover' as const,
        title: topicLabel(s.request.topicA, s.request.topicB),
        createdAt: loadedAt(),
        quality: response.evaluation?.qualityScore ?? null,
        mock: true,
        request: s.request,
        response,
      };
    });

  const compare: RunDetail[] = compareScenarios
    .filter((s) => !s.id.startsWith('contract-'))
    .map((s) => {
      const response = normalizeCompareResponse(s.response);
      return {
        id: response.correlationId,
        kind: 'compare' as const,
        title: topicLabel(s.request.topicA, s.request.topicB),
        createdAt: loadedAt(),
        quality: response.librain.result?.evaluation?.qualityScore ?? null,
        mock: true,
        request: s.request,
        response,
      };
    });

  return [...fromApi, ...discover, ...compare];
}
