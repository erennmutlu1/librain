import type { Lang } from '../i18n/lang';
import { formatCount } from './format';

/*
 * The size of today's public paper library, the one place every screen that
 * names it reads from: the home page, Papers (its counts sentence and the
 * read-only note), "How a sentence is checked".
 *
 * Changed on 18 Nov 2026 from 55 papers / 2,210 passages to 67 / 2,470,
 * when batch 4 added 12 arXiv papers on music, law and wildlife
 * conservation before its runs (experiments/new-domains-discoveries:
 * README.md and papers-added.json). The public API lists the same 67
 * (GET /api/papers), and src/lib/paperCatalog.data.json marks exactly these
 * as current; paperCatalog.test.ts keeps the two in step.
 *
 * Only today's numbers belong here. What a recorded run was made on stays
 * as it was recorded: the batch manifests' corpus strings ("55 papers,
 * 2,210 chunks …") and the featured gallery's 41 papers describe the
 * library of their day.
 */
export const LIBRARY = { papers: 67, passages: 2470 } as const;

/** The two numbers with the language's grouping: "2,470" in English, "2.470" in Turkish. */
export function libraryCounts(lang: Lang): { papers: string; passages: string } {
  return { papers: formatCount(LIBRARY.papers, lang), passages: formatCount(LIBRARY.passages, lang) };
}
