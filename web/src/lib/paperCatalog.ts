/*
 * What the app knows about a paper from its library id alone: title, authors,
 * year and a link. Used wherever a passage or citation names its paper, so an
 * id like "self-rag" or "2310.10553" can show a title and lead somewhere.
 *
 * Contract (other screens rely on it):
 *   paperInfo(id)  -> PaperInfo, never throws; unknown ids come back with nulls.
 *   paperHref(id)  -> the in-app Papers page filtered to that id.
 *   paperExternalUrl(id) -> arXiv (or the paper's own page) when known, else null.
 *
 * The data is a static catalogue, ./paperCatalog.data.json, built without
 * inventing anything: today's 55 papers as the public API lists them
 * (GET /api/papers), then repository sources where the API only has a
 * placeholder (the API snapshot of an arXiv ingest, the reference list of
 * docs/paper-source/architecture.html, and the papers' own title pages and
 * arXiv stamps as the recorded passages quote them), else null. Each entry's
 * `source` says where it came from. Entries with `current: false` are ids
 * from the earlier, 13-paper library the baseline comparison ran on.
 * The experiment manifests' arXiv titles remain a fallback.
 */
import { PAPER_TITLES } from '../explore/manifests';
import catalogue from './paperCatalog.data.json';

export interface PaperInfo {
  id: string;
  title: string | null;
  /** Comma-separated, as the paper lists them ("et al." when the source shortened the list). */
  authors: string | null;
  year: number | null;
  /** arXiv id when the paper is on arXiv. */
  arxivId: string | null;
}

interface CatalogueEntry {
  title: string | null;
  authors: string[] | null;
  year: number | null;
  arxivId: string | null;
  current: boolean;
  source: string;
}

const CATALOGUE: Readonly<Record<string, CatalogueEntry>> = catalogue;

const ARXIV_ID = /^\d{4}\.\d{4,5}(v\d+)?$/;

function entry(id: string): CatalogueEntry | undefined {
  return Object.prototype.hasOwnProperty.call(CATALOGUE, id) ? CATALOGUE[id] : undefined;
}

export function paperInfo(id: string): PaperInfo {
  const known = entry(id);
  const arxivId = known?.arxivId ?? (ARXIV_ID.test(id) ? id : null);
  return {
    id,
    title: known?.title ?? PAPER_TITLES.get(id) ?? null,
    authors: known?.authors?.length ? known.authors.join(', ') : null,
    year: known?.year ?? null,
    arxivId,
  };
}

/** The catalogue's author list for a paper, or null. */
export function paperAuthors(id: string): string[] | null {
  const authors = entry(id)?.authors;
  return authors && authors.length > 0 ? [...authors] : null;
}

/** How many papers today's library holds (the public API's list). */
export const TODAYS_LIBRARY_SIZE = Object.values(CATALOGUE).filter((e) => e.current).length;

/** True for ids in today's library; false for ids only earlier libraries had, and for unknown ids. */
export function inTodaysLibrary(id: string): boolean {
  return entry(id)?.current ?? false;
}

/** True when the catalogue knows the id from an earlier library only. */
export function fromEarlierLibrary(id: string): boolean {
  return entry(id)?.current === false;
}

export function paperHref(id: string): string {
  return `/library?q=${encodeURIComponent(id)}`;
}

export function paperExternalUrl(id: string): string | null {
  const { arxivId } = paperInfo(id);
  return arxivId ? `https://arxiv.org/abs/${arxivId}` : null;
}
