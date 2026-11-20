import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { PaperSummary, SupportingEvidence } from '../api/types';
import { PAPER_TITLES } from '../explore/manifests';
import { LangProvider } from '../i18n/lang';
import { paperInfo } from '../lib/paperCatalog';
import { paperTitleFor } from '../lib/papers';
import { EvidenceList } from './EvidenceList';
import { PaperRef } from './PaperRef';

// A paper the catalogue knows by its arXiv id (from the experiment manifests).
const [ARXIV_ID] = [...PAPER_TITLES.keys()];

function evidence(paperId: string, chunkIndex: number): SupportingEvidence {
  return { paperId, chunkIndex, section: 'Method', pageNumber: 3, supportType: 'direct', content: 'A passage.' };
}

describe('PaperRef', () => {
  it('links the citation to its paper on the Papers page, keeping the id as written', () => {
    render(
      <MemoryRouter>
        <PaperRef chunk="not-in-the-catalogue:1" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'not-in-the-catalogue:1 (show this paper in the Library)' });
    expect(link).toHaveAttribute('href', '/library?q=not-in-the-catalogue');
    expect(screen.getByText('not-in-the-catalogue:1').tagName).toBe('CODE');
    // Unknown to the catalogue: no external link.
    expect(screen.queryByRole('link', { name: /arXiv/ })).not.toBeInTheDocument();
  });

  it('adds a labelled arXiv link that opens in a new tab when the paper is on arXiv', () => {
    expect(ARXIV_ID).toBeTruthy();
    render(<PaperRef chunk={`${ARXIV_ID}:4`} />);
    expect(screen.getByRole('link', { name: new RegExp(`${ARXIV_ID!.replace('.', '\\.')}:4`) })).toHaveAttribute(
      'href',
      `/library?q=${encodeURIComponent(ARXIV_ID!)}`,
    );
    const external = screen.getByRole('link', { name: 'arXiv (opens in a new tab)' });
    expect(external).toHaveAttribute('href', `https://arxiv.org/abs/${ARXIV_ID}`);
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('labels the links in Turkish', () => {
    render(
      <LangProvider initial="tr">
        <PaperRef chunk={`${ARXIV_ID}:4`} />
      </LangProvider>,
    );
    expect(screen.getByRole('link', { name: 'arXiv (yeni sekmede açılır)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kütüphane sayfasında göster/ })).toBeInTheDocument();
  });

  it('links a catalogued paper with a corpus id (self-rag) to arXiv too', () => {
    render(<PaperRef chunk="self-rag:1" />);
    const arxiv = paperInfo('self-rag').arxivId;
    if (arxiv) expect(screen.getByRole('link', { name: 'arXiv (opens in a new tab)' })).toHaveAttribute('href', `https://arxiv.org/abs/${arxiv}`);
    expect(screen.getByRole('link', { name: /self-rag:1/ })).toHaveAttribute('href', '/library?q=self-rag');
  });
});

describe('evidence traceable to papers', () => {
  it('shows the catalogue title when the library list has none, and links every passage', () => {
    const title = paperInfo(ARXIV_ID!).title;
    expect(title).toBeTruthy();
    expect(paperTitleFor(ARXIV_ID!, new Map())).toBe(title);

    render(<EvidenceList evidence={[evidence(ARXIV_ID!, 2), evidence('pharmagents', 0)]} papers={new Map()} />);
    const [first, second] = screen.getAllByRole('listitem');
    expect(within(first!).getByText(title!)).toBeInTheDocument();
    expect(within(first!).getByRole('link', { name: 'arXiv (opens in a new tab)' })).toBeInTheDocument();
    expect(within(second!).getByRole('link', { name: /pharmagents:0/ })).toHaveAttribute('href', '/library?q=pharmagents');
  });

  it('prefers the loaded library title', () => {
    const paper: PaperSummary = { paperId: 'pharmagents', title: 'PharmAgents', chunkCount: 1, firstIngestedAt: null, authors: null, year: null };
    expect(paperTitleFor('pharmagents', new Map([['pharmagents', paper]]))).toBe('PharmAgents');
  });
});
