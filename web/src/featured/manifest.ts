/*
 * Featured discoveries: six Discovery runs recorded against the real API and
 * picked by hand (experiments/featured-discoveries/README.md says how).
 *
 * ./data holds byte-for-byte copies of experiments/featured-discoveries/
 * featured.json and the six runs it names (featured.test.ts compares them).
 * They are copied rather than imported from the repo root because the web
 * Docker image is built from web/ alone.
 *
 * This module is the small manifest only. The runs, which carry the full
 * passage text, load on demand from ./runs (see useFeatured.ts).
 */
import rawManifest from './data/featured.json';

/** The repository folder that ./data mirrors. */
export const FEATURED_SOURCE_DIR = 'experiments/featured-discoveries';

export interface FeaturedEntry {
  /** Run id from the experiment, such as "D1". Also the URL segment. */
  id: string;
  /** One or two plain sentences on what the hypothesis proposes. */
  takeaway: string;
  whyFeatured: string;
  /** Path relative to the manifest, such as "runs/D1.json". */
  file: string;
}

export interface FeaturedManifest {
  /** As recorded, e.g. "claude-sonnet-4-6 (generation), claude-haiku-4-5 (judge, claim validator)". */
  model: string;
  /** Display name of the generating model, e.g. "Claude Sonnet 4.6". */
  generator: string;
  /** Display name of the judge and claim validator, when the manifest names one. */
  judge: string | null;
  corpus: string;
  /** Number of papers in the corpus, read from `corpus` ("41 papers, …"). */
  corpusPapers: number | null;
  /** ISO date the runs were recorded. */
  date: string;
  topK: number | null;
  entries: FeaturedEntry[];
}

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** "claude-sonnet-4-6 (generation), claude-haiku-4-5 (…)" -> ["Claude Sonnet 4.6", "Claude Haiku 4.5"]. */
export function modelDisplayNames(model: string): string[] {
  return [...model.matchAll(/claude-([a-z]+)-(\d+)-(\d+)/gi)].map(
    ([, family = '', major, minor]) => `Claude ${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}.${minor}`,
  );
}

export function parseManifest(raw: unknown): FeaturedManifest {
  const r = isRecord(raw) ? raw : {};
  const model = str(r.model);
  const [generator, judge] = modelDisplayNames(model);
  const corpus = str(r.corpus);
  const papers = /(\d[\d,]*)\s+papers/i.exec(corpus)?.[1];
  const entries = (Array.isArray(r.featured) ? r.featured : [])
    .filter(isRecord)
    .map((e) => ({ id: str(e.id), takeaway: str(e.takeaway), whyFeatured: str(e.whyFeatured), file: str(e.file) }))
    .filter((e) => e.id !== '' && e.file !== '');
  return {
    model,
    generator: generator ?? model,
    judge: judge ?? null,
    corpus,
    corpusPapers: papers ? Number(papers.replace(/,/g, '')) : null,
    date: str(r.date),
    topK: typeof r.topK === 'number' ? r.topK : null,
    entries,
  };
}

export const featuredManifest: FeaturedManifest = parseManifest(rawManifest);

/** Where a featured run lives in the app. */
export function featuredPath(id?: string): string {
  return id ? `/discover/featured/${encodeURIComponent(id)}` : '/discover/featured';
}
