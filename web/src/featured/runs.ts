/*
 * The six featured runs, in manifest order. Loaded on demand (useFeatured.ts)
 * because the passage text makes them about 58 kB gzipped, which the Discover
 * form should not wait for. Nothing here calls the API: the data is bundled.
 */
import { normalizeDiscoverRequest, normalizeDiscoverResponse } from '../api/normalize';
import type { DiscoverRequest, DiscoverResponse } from '../api/types';
import { FEATURED_SOURCE_DIR, featuredManifest, type FeaturedEntry } from './manifest';

export interface FeaturedRun extends FeaturedEntry {
  /** Repository path of the recorded run, e.g. experiments/featured-discoveries/runs/D1.json. */
  source: string;
  request: DiscoverRequest;
  response: DiscoverResponse;
  /** What the run cost, from the token counts the API logged; null when not recorded. */
  costUsd: number | null;
  /** Distinct papers behind the supporting evidence, in the order they are first cited. */
  paperIds: string[];
  /** Novel-claim sentences the validator marked RISKY (0 when validation failed). */
  riskyCount: number;
  /** Sentences the validator returned a verdict for. */
  sentenceCount: number;
  /** The prose is a Turkish translation of the recorded run (src/i18n/discoveries). */
  translated: boolean;
}

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One recorded file ({id, request, status, costUsd, response}) into a featured run. */
export function buildFeaturedRun(entry: FeaturedEntry, raw: unknown, translated = false): FeaturedRun {
  const r = isRecord(raw) ? raw : {};
  if (r.id !== entry.id) throw new Error(`${entry.file} records run ${String(r.id)}, but the manifest lists ${entry.id}.`);
  const response = normalizeDiscoverResponse(r.response);
  // The recordings were made through the Anthropic path (see the manifest's model).
  const request: DiscoverRequest = { provider: 'anthropic', ...normalizeDiscoverRequest(r.request) };
  const cv = response.claimValidation;
  const verdicts = cv && cv.validationFailed !== true ? cv.claims : [];
  return {
    ...entry,
    source: `${FEATURED_SOURCE_DIR}/${entry.file}`,
    request,
    response,
    costUsd: typeof r.costUsd === 'number' && Number.isFinite(r.costUsd) ? r.costUsd : null,
    paperIds: [...new Set(response.supportingEvidence.map((e) => e.paperId))],
    riskyCount: verdicts.filter((c) => c.status === 'risky').length,
    sentenceCount: verdicts.length,
    translated,
  };
}

const files = import.meta.glob<unknown>('./data/runs/*.json', { eager: true, import: 'default' });

export const featuredRuns: FeaturedRun[] = featuredManifest.entries.map((entry) => {
  const raw = files[`./data/${entry.file}`];
  if (raw === undefined) throw new Error(`Featured run ${entry.id} is missing: expected src/featured/data/${entry.file}.`);
  return buildFeaturedRun(entry, raw);
});
