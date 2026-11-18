import { describe, expect, it } from 'vitest';
import { EXPLORE_MANIFESTS } from '../explore/manifests';
import { LIBRARY } from './library';
import catalogue from './paperCatalog.data.json';
import { fromEarlierLibrary, inTodaysLibrary, paperAuthors, paperExternalUrl, paperHref, paperInfo, TODAYS_LIBRARY_SIZE } from './paperCatalog';

describe('paperCatalog', () => {
  it('resolves a paper the public API lists with its metadata', () => {
    expect(paperInfo('2310.10553')).toEqual({
      id: '2310.10553',
      title: 'TacticAI: an AI assistant for football tactics',
      authors: expect.stringMatching(/^Zhe Wang, Petar Veličković, /),
      year: 2023,
      arxivId: '2310.10553',
    });
    expect(paperExternalUrl('2310.10553')).toBe('https://arxiv.org/abs/2310.10553');
  });

  it('fills placeholder API titles from the repository, never from the id', () => {
    // The API lists "self-rag" with its id as the title; the paper's own title page gives the real one.
    expect(paperInfo('self-rag')).toMatchObject({
      title: 'Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection',
      year: 2023,
      arxivId: '2310.11511',
    });
    expect(paperExternalUrl('self-rag')).toBe('https://arxiv.org/abs/2310.11511');
    expect(paperInfo('2005.11401')).toMatchObject({ title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', year: 2020 });
    // The API says "Manuscript - Arxiv" for biomedgpt; the real title comes from its own title page.
    expect(paperInfo('biomedgpt')).toMatchObject({
      title: 'BiomedGPT: A generalist vision–language foundation model for diverse biomedical tasks',
      arxivId: '2305.17100',
    });
    // "Anonymous Submission" is not an author.
    expect(paperInfo('whisper').authors).toBeNull();
  });

  it('knows the ids of the earlier, 13-paper library', () => {
    expect(paperInfo('04-graphcast')).toMatchObject({
      title: 'GraphCast: Learning skillful medium-range global weather forecasting',
      arxivId: '2212.12794',
    });
    expect(paperInfo('02-biomed-fm')).toMatchObject({ title: 'Foundation Model in Biomedicine', year: 2025, arxivId: '2503.02104' });
    expect(paperInfo('03-pharmagents').arxivId).toBe('2503.22164');
    expect(fromEarlierLibrary('02-biomed-fm')).toBe(true);
    expect(inTodaysLibrary('02-biomed-fm')).toBe(false);
    expect(inTodaysLibrary('graphcast')).toBe(true);
  });

  it('gives unknown ids nulls, and an arXiv-style id its arXiv link', () => {
    expect(paperInfo('alphafold')).toEqual({ id: 'alphafold', title: null, authors: null, year: null, arxivId: null });
    expect(paperExternalUrl('alphafold')).toBeNull();
    expect(paperAuthors('alphafold')).toBeNull();
    expect(fromEarlierLibrary('alphafold')).toBe(false);
    expect(paperInfo('2401.00001').arxivId).toBe('2401.00001');
    expect(paperInfo('constructor').title).toBeNull();
  });

  it('links to the Papers page filtered to the id', () => {
    expect(paperHref('04-graphcast')).toBe('/library?q=04-graphcast');
    expect(paperHref('a b')).toBe('/library?q=a%20b');
  });

  it('holds today’s papers (as many as src/lib/library.ts says), and no title that is only the id', () => {
    expect(TODAYS_LIBRARY_SIZE).toBe(LIBRARY.papers);
    for (const [id, e] of Object.entries(catalogue)) {
      expect(e.title, id).not.toBe(id);
      expect(e.title, id).not.toBe('Manuscript - Arxiv');
      expect(e.source, id).not.toBe('');
    }
  });

  it('lists the papers batch 4 added as today’s, with the titles its manifest records', () => {
    const added = EXPLORE_MANIFESTS.find((m) => m.batch === 4)!.newPapers;
    expect(added.length).toBeGreaterThan(0);
    for (const p of added) {
      expect(inTodaysLibrary(p.arxivId), p.arxivId).toBe(true);
      // From the catalogue itself, not the manifest fallback paperInfo also uses.
      const known = (catalogue as Record<string, { title: string | null; year: number | null; arxivId: string | null }>)[p.arxivId];
      expect(known, p.arxivId).toMatchObject({ title: p.title, arxivId: p.arxivId });
      expect(known?.year, p.arxivId).not.toBeNull();
    }
    expect(paperInfo('2112.06725').authors).toBe('Dan Stowell');
  });
});
