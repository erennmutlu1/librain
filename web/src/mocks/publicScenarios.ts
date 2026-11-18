/*
 * What Recorded mode serves on the public site. Real runs only, and nothing
 * is ever substituted for inputs that match no recording (`fallback: null`):
 *
 *   Discover  the 46 committed Discovery runs (src/explore/data, copies of
 *             experiments/{featured,new-areas}-discoveries) plus the real
 *             Anthropic baseline-experiment runs. The OpenAI recordings are
 *             left out because the public Live mode is Anthropic only.
 *   Compare   the two real baseline-experiment pairs (pair-10, pair-01).
 *   Ask       none: the only Ask recording is an API contract snapshot.
 *
 * The contract-* snapshots (real API, fake LLM, placeholder text) appear
 * nowhere here: not in a picker, a fallback or the derived library.
 *
 * Loaded on demand with the mock client, so the owner's builds never pull
 * the 46 runs in through it.
 */
import type { DiscoverRequest } from '../api/types';
import { EXPLORE_MANIFESTS } from '../explore/manifests';
import { formatUsd, topicLabel } from '../lib/format';
import { compareScenarios, discoverScenarios, libraryFrom, type DiscoverRecording, type RecordingSet } from './scenarios';

const files = import.meta.glob<unknown>('../explore/data/*/runs/*.json', { eager: true, import: 'default' });

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One committed run file: `{ id, request: { topicA, topicB, topK }, status, costUsd, response }`. */
function toRecording(path: string, raw: unknown): DiscoverRecording | null {
  const where = /\/data\/([^/]+)\/runs\/([^/]+)\.json$/.exec(path);
  if (!where || !isRecord(raw) || !isRecord(raw.request) || raw.status !== 200 || !isRecord(raw.response)) return null;
  const [, folder = '', fileId = ''] = where;
  const id = typeof raw.id === 'string' ? raw.id : fileId;
  const { topicA, topicB, topK } = raw.request;
  if (typeof topicA !== 'string' || !topicA.trim()) return null;

  const request: DiscoverRequest = { topicA, topK: typeof topK === 'number' ? topK : 5, provider: 'anthropic' };
  if (typeof topicB === 'string' && topicB.trim()) request.topicB = topicB;

  const sourceDir = `experiments/${folder}`;
  const manifest = EXPLORE_MANIFESTS.find((m) => m.sourceDir === sourceDir);
  const cost = formatUsd(typeof raw.costUsd === 'number' ? raw.costUsd : null);
  const recorded = [manifest?.date ? `Recorded ${manifest.date}` : 'Recorded', manifest?.generator ? `with ${manifest.generator}` : null]
    .filter(Boolean)
    .join(' ');

  return {
    id: `explore-${id}`,
    label: `${id} · ${topicLabel(request.topicA, request.topicB)}`,
    request,
    source: `${sourceDir}/runs/${fileId}.json`,
    note: `${recorded}${cost ? `; the run cost ${cost}` : ''}. The progress steps are rebuilt from the recorded result.`,
    response: raw.response,
  };
}

/** Repository order: batch 1 (A, C, D, N) and then batch 2 (F, J, P, S, W), each by id. */
export const exploreRecordings: DiscoverRecording[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
  .map(([path, raw]) => toRecording(path, raw))
  .filter((r): r is DiscoverRecording => r !== null);

const isSnapshot = (id: string) => id.startsWith('contract-');

const discover: DiscoverRecording[] = [
  ...exploreRecordings,
  ...discoverScenarios.filter((s) => !isSnapshot(s.id) && (s.request.provider ?? 'anthropic') === 'anthropic'),
];
const compare = compareScenarios.filter((s) => s.id === 'pair-10' || s.id === 'pair-01');

export const publicRecordings: RecordingSet = {
  ask: [],
  discover,
  compare,
  fallback: null,
  strict: true,
  // Only papers these runs cite; the snapshot's papers list is a contract capture, not the corpus.
  library: () => libraryFrom({ ask: [], discover, compare }),
  runs: [],
};
