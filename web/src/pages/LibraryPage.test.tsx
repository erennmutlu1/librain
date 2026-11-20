import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { createLocalRunStore } from '../history/localRunStore';
import { LangProvider } from '../i18n/lang';
import { libraryCounts } from '../lib/library';
import { fromEarlierLibrary, inTodaysLibrary } from '../lib/paperCatalog';
import { publicRecordings } from '../mocks/publicScenarios';
import { createPublicHistory, createPublicRunStore } from '../public/browserHistory';
import { createLiveClient, loadRecordedClient } from '../public/clients';
import { PublicApp } from '../public/PublicApp';

/*
 * The Library screen's accessibility details: empty cells say nothing to a
 * screen reader, loading is announced, and the icon-only delete button has a
 * visible tooltip. LibraryHistory.test.tsx covers search, sort and export.
 */

function setup({ lang, latency = 0 }: { lang?: 'tr'; latency?: number } = {}) {
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  const app = <App api={createMockApi({ latency })} runStore={runStore} initialPath="/library" />;
  render(lang ? <LangProvider initial={lang}>{app}</LangProvider> : app);
}

describe('Library table', () => {
  it('leaves empty cells empty for screen readers (a muted mark for the eye only)', async () => {
    setup();
    const table = await screen.findByRole('table', { name: /^Papers in the library/ });
    // Mock mode lists cited papers whose authors and year are unknown.
    const marks = table.querySelectorAll('[aria-hidden="true"]');
    const dashes = [...marks].filter((el) => el.textContent === '–');
    expect(dashes.length).toBeGreaterThan(0);
    // No cell is read as a dash.
    expect(within(table).queryAllByRole('cell', { name: /^[–—-]$/ })).toHaveLength(0);
    expect(within(table).queryAllByText('—')).toHaveLength(0);
  });

  it('gives the icon-only delete button a visible tooltip as well as its name', async () => {
    setup();
    const button = await screen.findByRole('button', { name: 'Delete 04-graphcast' });
    expect(button).toHaveAttribute('title', 'Delete 04-graphcast');
  });
});

describe('Library loading', () => {
  it('announces loading in a status region, then clears it', async () => {
    setup({ latency: 1 });
    await screen.findByRole('heading', { level: 1, name: 'Library' });
    const status = screen.getAllByRole('status').find((el) => el.textContent === 'Loading papers…');
    expect(status).toBeDefined();
    expect(status).toHaveClass('visually-hidden');
    await screen.findByRole('table', { name: /^Papers in the library/ });
    expect(status).toBeEmptyDOMElement();
  });

  it('announces it in Turkish', async () => {
    setup({ lang: 'tr', latency: 1 });
    await screen.findByRole('heading', { level: 1, name: 'Kütüphane' });
    expect(screen.getAllByRole('status').some((el) => el.textContent === 'Makaleler yükleniyor…')).toBe(true);
  });
});

/** The public build in Recorded mode: the Papers page lists the ids the recorded runs cite. */
async function setupRecorded(path: string, lang?: 'tr') {
  const history = createPublicHistory({ getStorage: () => window.localStorage });
  const fetchImpl = vi.fn(() => Promise.reject(new Error('no network in Recorded mode')));
  const clients = {
    recorded: await loadRecordedClient(history, 0),
    live: createLiveClient(history, { baseUrl: 'https://api.librain.test', fetchImpl }),
    runStore: createPublicRunStore(history),
  };
  const app = <PublicApp clients={clients} initialPath={path} />;
  render(lang ? <LangProvider initial={lang}>{app}</LangProvider> : app);
  return { fetchImpl };
}

/** What Recorded mode lists: every paper id the recorded runs cite, some from the earlier 13-paper library. */
const citedIds = (publicRecordings.library() as { paperId: string }[]).map((p) => p.paperId);
const olderIds = citedIds.filter(fromEarlierLibrary);

describe('Papers in Recorded mode (public build)', () => {
  it('shows titles, authors, years and arXiv links from the catalogue, not bare ids', async () => {
    const { fetchImpl } = await setupRecorded('/library');
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /^Papers in the library/ });
    const selfRag = within(table).getByRole('rowheader', { name: /self-rag/ });
    expect(selfRag).toHaveTextContent('Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection');
    const row = selfRag.closest('tr')!;
    expect(within(row).getByRole('link', { name: 'self-rag on arXiv (opens in a new tab)' })).toHaveAttribute('href', 'https://arxiv.org/abs/2310.11511');
    expect(row).toHaveTextContent('Akari Asai');
    expect(row).toHaveTextContent('2023');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('explains the counts in one sentence', async () => {
    // Every cited id is either in today's library or in the earlier one, so the two parts add up.
    expect(citedIds.every((id) => inTodaysLibrary(id) !== fromEarlierLibrary(id))).toBe(true);
    expect(olderIds).toHaveLength(6);
    await setupRecorded('/library');
    await screen.findByRole('table', { name: /^Papers in the library/ });
    const today = libraryCounts('en').papers;
    expect(
      screen.getByText(
        `Today’s library has ${today} papers; the recorded runs cite ${citedIds.length} paper IDs: ${citedIds.length - olderIds.length} from today’s library and ${olderIds.length} from an earlier, smaller library (13 papers) used to compare LIBRAIN with simpler systems.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(`${citedIds.length} papers`)).toBeInTheDocument();
  });

  it('prefills the search from ?q= (the link other screens use for a paper)', async () => {
    await setupRecorded('/library?q=04-graphcast');
    const table = await screen.findByRole('table', { name: /^Papers in the library/ });
    expect(screen.getByRole('searchbox', { name: 'Search papers by ID, title or author' })).toHaveValue('04-graphcast');
    const rows = within(table).getAllByRole('rowheader');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('GraphCast: Learning skillful medium-range global weather forecasting');
    // Not in today's library: tagged, and still linked to arXiv.
    expect(within(rows[0]!).getByText('earlier library')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: '04-graphcast on arXiv (opens in a new tab)' })).toHaveAttribute(
      'href',
      'https://arxiv.org/abs/2212.12794',
    );
    expect(screen.getByText(`1 of ${citedIds.length} papers`)).toBeInTheDocument();
  });

  it('says it in Turkish', async () => {
    await setupRecorded('/library?q=gat', 'tr');
    expect(await screen.findByRole('heading', { level: 1, name: 'Kütüphane' })).toBeInTheDocument();
    await screen.findByRole('table', { name: /^Kütüphanedeki makaleler/ });
    expect(screen.getByRole('searchbox', { name: 'Makaleleri kimlik, başlık ya da yazara göre arayın' })).toHaveValue('gat');
    const tr = libraryCounts('tr');
    expect(
      screen.getByText(
        `Bugünkü makale kütüphanesinde ${tr.papers} makale var; hazır çalıştırmalar ${citedIds.length} makale kimliğine atıf yapıyor: bugünkü kütüphaneden ${citedIds.length - olderIds.length} makale ve LIBRAIN’i daha basit sistemlerle karşılaştırmak için kullanılan daha eski, küçük bir kütüphaneden (13 makale) ${olderIds.length} kimlik.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(`Herkese açık makale kütüphanesi salt okunurdur: ${tr.papers} makale, ${tr.passages} parça.`)).toBeInTheDocument();
    expect(screen.getByText(/^Hazır mod, hazır çalıştırmaların atıf yaptığı/)).toBeInTheDocument();
  });
});
