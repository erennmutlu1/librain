/*
 * The experiment manifests behind Explore, which are small: editor's picks
 * with their takeaways, the areas of batches 2 to 4, the dropped area and
 * the arXiv titles of the papers batches 2 and 4 added. The recorded runs themselves,
 * which carry the passage text, load on demand from ./runs (see
 * useDiscoveries.ts).
 *
 * ./data holds byte-for-byte copies of experiments/featured-discoveries,
 * experiments/new-areas-discoveries, experiments/cross-field-discoveries and
 * experiments/new-domains-discoveries (explore.test.ts compares them). They are copied because the web Docker
 * image is built from web/ alone.
 */
import { modelDisplayNames } from '../featured/manifest';
import rawBatch3 from './data/cross-field-discoveries/featured.json';
import rawBatch1 from './data/featured-discoveries/featured.json';
import rawBatch2 from './data/new-areas-discoveries/featured.json';
import rawBatch4 from './data/new-domains-discoveries/featured.json';

export interface ExplorePick {
  id: string;
  takeaway: string;
  whyFeatured: string;
}

/** The recorded batches, in the order they were run. */
export type ExploreBatch = 1 | 2 | 3 | 4;

export interface ExploreManifest {
  batch: ExploreBatch;
  /** Repository folder the copy mirrors, e.g. experiments/featured-discoveries. */
  sourceDir: string;
  /** Display name of the generating model, e.g. "Claude Sonnet 4.6". */
  generator: string;
  judge: string | null;
  corpus: string;
  date: string;
  picks: ExplorePick[];
  areas: { prefix: string; name: string }[];
  droppedAreas: { area: string; reason: string }[];
  newPapers: { arxivId: string; title: string }[];
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const records = (v: unknown) => (Array.isArray(v) ? v.filter(isRecord) : []);

export function parseExploreManifest(raw: unknown, batch: ExploreBatch, sourceDir: string): ExploreManifest {
  const r = isRecord(raw) ? raw : {};
  const model = str(r.model);
  const [generator, judge] = modelDisplayNames(model);
  return {
    batch,
    sourceDir,
    generator: generator ?? model,
    judge: judge ?? null,
    corpus: str(r.corpus),
    date: str(r.date),
    picks: records(r.featured)
      .map((e) => ({ id: str(e.id), takeaway: str(e.takeaway), whyFeatured: str(e.whyFeatured) }))
      .filter((e) => e.id !== ''),
    areas: records(r.areas).map((a) => ({ prefix: str(a.prefix), name: str(a.name) })),
    droppedAreas: records(r.droppedAreas).map((a) => ({ area: str(a.area), reason: str(a.reason) })),
    newPapers: records(r.newPapers)
      .map((p) => ({ arxivId: str(p.arxivId), title: str(p.title) }))
      .filter((p) => p.arxivId !== '' && p.title !== ''),
  };
}

export const EXPLORE_MANIFESTS: readonly ExploreManifest[] = [
  parseExploreManifest(rawBatch1, 1, 'experiments/featured-discoveries'),
  parseExploreManifest(rawBatch2, 2, 'experiments/new-areas-discoveries'),
  parseExploreManifest(rawBatch3, 3, 'experiments/cross-field-discoveries'),
  parseExploreManifest(rawBatch4, 4, 'experiments/new-domains-discoveries'),
];

function batchOfRunFile(path: string): number {
  const folder = /([^/]+)\/runs\/[^/]+\.json$/.exec(path)?.[1];
  return EXPLORE_MANIFESTS.find((m) => m.sourceDir.split('/').pop() === folder)?.batch ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Repository order for run-file paths (…/<experiment folder>/runs/<id>.json):
 * by batch, then by id (X2 before X10). The folder names do not sort by batch.
 */
export function compareRunFiles(a: string, b: string): number {
  return batchOfRunFile(a) - batchOfRunFile(b) || a.localeCompare(b, 'en', { numeric: true });
}

/** Every editor's pick, batch 1 first, each batch in its manifest's order. */
export const EDITORS_PICKS: readonly ExplorePick[] = EXPLORE_MANIFESTS.flatMap((m) => m.picks);

/** The date the runs were recorded (every batch shares it). */
export const RECORDED_DATE = EXPLORE_MANIFESTS[0]?.date ?? '';

/** arXiv id -> title, for the papers the manifests name. */
export const PAPER_TITLES: ReadonlyMap<string, string> = new Map(
  EXPLORE_MANIFESTS.flatMap((m) => m.newPapers.map((p) => [p.arxivId, p.title] as const)),
);

/** A paper's display name: its arXiv title when a manifest records one, otherwise its corpus id. */
export function paperName(paperId: string): string {
  return PAPER_TITLES.get(paperId) ?? paperId;
}

export const DROPPED_AREAS = EXPLORE_MANIFESTS.flatMap((m) => m.droppedAreas);

/** Where Explore lives. */
export function explorePath(id?: string, suffix?: 'full'): string {
  if (!id) return '/explore';
  return `/explore/${encodeURIComponent(id)}${suffix ? `/${suffix}` : ''}`;
}
