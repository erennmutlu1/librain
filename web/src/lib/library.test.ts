import { describe, expect, it } from 'vitest';
import { EXPLORE_MANIFESTS } from '../explore/manifests';
import { LIBRARY, libraryCounts } from './library';
import { TODAYS_LIBRARY_SIZE } from './paperCatalog';

describe('library size', () => {
  it('is the library the newest batch was recorded on, and the catalogue’s current papers', () => {
    // e.g. "67 papers, 2,470 chunks (55 + 12 added from arXiv for these areas)"
    const newest = EXPLORE_MANIFESTS.at(-1)!.corpus;
    const [, papers, chunks] = /^([\d,]+) papers, ([\d,]+) chunks/.exec(newest) ?? [];
    expect(LIBRARY).toEqual({ papers: Number(papers?.replace(/,/g, '')), passages: Number(chunks?.replace(/,/g, '')) });
    expect(TODAYS_LIBRARY_SIZE).toBe(LIBRARY.papers);
  });

  it('groups the passage count the way each language does', () => {
    expect(libraryCounts('en').passages).toMatch(/^\d,\d{3}$/);
    expect(libraryCounts('tr').passages).toMatch(/^\d\.\d{3}$/);
    expect(libraryCounts('tr').papers).toBe(String(LIBRARY.papers));
  });
});
