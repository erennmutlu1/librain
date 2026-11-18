import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createHttpApi } from './api/httpClient';
import { createMockApi } from './api/mockClient';
import { text as contractText } from './components/ContractSummary.i18n';
import type { LibrainApi } from './api/types';
import { createLocalRunStore } from './history/localRunStore';
import { LangProvider } from './i18n/lang';
import { LIBRARY } from './lib/library';
import { contract } from './mocks/scenarios';

function setup(path: string, api: LibrainApi = createMockApi({ latency: 0 })) {
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  const user = userEvent.setup();
  render(<App api={api} runStore={runStore} initialPath={path} />);
  return { user, runStore };
}

describe('App (mock mode, no network)', () => {
  it('shows the shell with the mock badge and six sections', async () => {
    setup('/library');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Ideas', '/explore'],
      ['New idea', '/discover'],
      ['Ask', '/ask'],
      ['Compare', '/compare'],
      ['Papers', '/library'],
      ['History', '/history'],
    ]);
    expect(within(nav).getByRole('link', { name: 'Papers' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Mock data')).toBeInTheDocument();
    // The captured papers list plus ids cited by the recordings (never invented titles).
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getAllByText('2005.11401').length).toBeGreaterThan(0);
    expect(screen.getAllByText('04-graphcast').length).toBeGreaterThan(0);
  });

  it('validates an arXiv id with the API rules and ingests it', async () => {
    const { user } = setup('/library');
    const field = await screen.findByRole('textbox', { name: 'arXiv id or link' });
    await user.type(field, 'hep-th/9901001');
    await user.tab();
    expect(screen.getByText(/Not an arXiv id/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ingest' })).toBeDisabled();

    await user.clear(field);
    await user.type(field, 'https://arxiv.org/abs/2005.11401v2');
    expect(screen.getByText(/Will ingest arXiv 2005.11401/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ingest' }));
    expect((await screen.findAllByText(/Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks/)).length).toBeGreaterThan(0);
  });

  it('deletes a paper after an inline confirm (no browser dialog)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { user } = setup('/library');
    await user.click(await screen.findByRole('button', { name: 'Delete 04-graphcast' }));
    const group = screen.getByRole('group', { name: 'Delete 04-graphcast' });
    expect(within(group).getByRole('button', { name: 'Keep' })).toHaveFocus();
    await user.click(within(group).getByRole('button', { name: 'Delete paper' }));
    expect(await screen.findByText('Deleted 04-graphcast.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete 04-graphcast' })).not.toBeInTheDocument());
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('runs a recorded discovery through the stream, renders the annotated claim and saves it', async () => {
    const { user, runStore } = setup('/discover');
    await user.click(await screen.findByRole('button', { name: 'Drug discovery × climate adaptation' }));

    expect(await screen.findByRole('heading', { name: 'drug discovery × climate adaptation' })).toBeInTheDocument();
    expect(screen.getByText(/sentence 2: Risky/)).toBeInTheDocument();
    expect(screen.getByText(/predates the claimed\/dropped counters/)).toBeInTheDocument();
    expect(screen.getByText('experiments/baseline-comparison/results/librain/pair-10.json')).toBeInTheDocument();

    const runs = await runStore.list();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ kind: 'discover', mock: true, title: 'drug discovery × climate adaptation' });
  });

  it('replays the captured discover stream and shows passage text from the API', async () => {
    const { user } = setup('/discover');
    await user.click(await screen.findByRole('button', { name: /API snapshot/ }));
    // The summary's wording belongs to ContractSummary; the count is what this checks.
    expect(await screen.findByText(contractText.en.heading(1))).toBeInTheDocument();
    expect(screen.getAllByText('Message passing over a multi-mesh.').length).toBeGreaterThan(0);
  });

  it('validates the form before calling the API', async () => {
    const { user, runStore } = setup('/discover');
    await user.click(await screen.findByRole('button', { name: 'Discover' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter at least Topic A.');
    await user.type(screen.getByRole('combobox', { name: 'Topic A' }), 'same');
    await user.type(screen.getByRole('combobox', { name: /Topic B/ }), 'same');
    await user.click(screen.getByRole('button', { name: 'Discover' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Topic B must differ from Topic A.');
    expect(await runStore.list()).toHaveLength(0);
  });

  it('opens a citation side panel with the cited passage on Ask', async () => {
    const { user } = setup('/ask');
    await user.click(await screen.findByRole('button', { name: 'Why does GraphCast forecast well?' }));
    const chip = await screen.findByRole('button', { name: /^Source 1: graphcast/ });
    await user.click(chip);

    const panel = screen.getByRole('dialog', { name: 'Source 1' });
    expect(within(panel).getByText('Intro')).toBeInTheDocument();
    expect(within(panel).getByText('graphcast:1')).toBeInTheDocument();
    expect(within(panel).getByText('GraphCast forecasts weather with graph neural networks.')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
  });

  it('compares the three systems in one call and marks the fabricated Naive-RAG citation', async () => {
    const { user, runStore } = setup('/compare');
    await user.click(await screen.findByRole('button', { name: /1 fabricated citation/ }));

    expect(await screen.findByText('1 of 2 citations fabricated')).toBeInTheDocument();
    expect(screen.getByText('pangu-weather:4')).toBeInTheDocument();
    expect(screen.getAllByText('Fabricated: not in the retrieved set')).toHaveLength(1);
    expect(screen.getByRole('table', { name: /scores by system/i })).toBeInTheDocument();
    expect((await runStore.list())[0]?.kind).toBe('compare');
  });

  it('loads the recorded runs into History and re-renders one', async () => {
    const { user } = setup('/history');
    await user.click(await screen.findByRole('button', { name: 'Load the recorded runs' }));
    const link = await screen.findByRole('link', { name: /Why does GraphCast forecast well\?/ });
    expect(screen.getAllByRole('link', { name: /Naive[- ]RAG/ }).length).toBeGreaterThan(0);
    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'Why does GraphCast forecast well?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Markdown/ })).toBeInTheDocument();
  });

  it('deletes a run from its detail page after an inline confirm', async () => {
    const { user, runStore } = setup('/discover');
    await user.click(await screen.findByRole('button', { name: 'Drug discovery × climate adaptation' }));
    await screen.findByRole('heading', { name: 'drug discovery × climate adaptation' });
    await user.click(screen.getByRole('link', { name: 'History' }));
    await user.click(await screen.findByRole('link', { name: /drug discovery × climate adaptation/i }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete run' }));
    expect(await screen.findByText('No runs yet')).toBeInTheDocument();
    expect(await runStore.list()).toHaveLength(0);
  });

  it('still works when localStorage is unavailable', async () => {
    const runStore = createLocalRunStore({
      getStorage: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    const user = userEvent.setup();
    render(<App api={createMockApi({ latency: 0 })} runStore={runStore} initialPath="/discover" />);
    await user.click(await screen.findByRole('button', { name: 'Drug discovery × climate adaptation' }));
    await screen.findByRole('heading', { name: 'drug discovery × climate adaptation' });
    await user.click(screen.getByRole('link', { name: 'History' }));
    expect(await screen.findByText('Runs are not being saved.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /drug discovery × climate adaptation/i })).toBeInTheDocument();
  });
});

describe('App routes and titles', () => {
  it('opens on the home page, and the logo leads back to it', async () => {
    const { user } = setup('/');
    expect(await screen.findByRole('heading', { level: 1, name: `Research ideas from ${LIBRARY.papers} papers, with every sentence checked` })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('LIBRAIN · Research ideas, every sentence checked'));
    const logo = screen.getByRole('link', { name: 'LIBRAIN home' });
    expect(logo).toHaveAttribute('href', '/');
    // No section is current on the home page.
    expect(within(screen.getByRole('navigation', { name: 'Sections' })).queryByRole('link', { current: 'page' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Try your own topics' }));
    expect(await screen.findByRole('combobox', { name: 'Topic A' })).toBeInTheDocument();
    await user.click(logo);
    expect(await screen.findByRole('heading', { level: 1, name: `Research ideas from ${LIBRARY.papers} papers, with every sentence checked` })).toBeInTheDocument();
  });

  it.each([
    ['/explore', 'Ideas · LIBRAIN'],
    ['/explore/stats', 'Idea statistics · LIBRAIN'],
    ['/explore/quiz', 'Spot the risk · LIBRAIN'],
    ['/explore/d1', 'Idea D1 · LIBRAIN'],
    ['/explore/D1/full', 'Idea D1 · LIBRAIN'],
    ['/discover', 'New idea · LIBRAIN'],
    ['/discover/', 'New idea · LIBRAIN'],
    ['/discover/featured', 'Featured ideas · LIBRAIN'],
    ['/discover/featured/pair-10', 'Featured idea · LIBRAIN'],
    ['/ask', 'Ask · LIBRAIN'],
    ['/compare', 'Compare · LIBRAIN'],
    ['/library', 'Papers · LIBRAIN'],
    ['/history', 'History · LIBRAIN'],
    ['/history/abc', 'Run · LIBRAIN'],
    ['/no/such/page', 'Page not found · LIBRAIN'],
  ])('titles %s as "%s"', async (path, title) => {
    setup(path);
    await waitFor(() => expect(document.title).toBe(title));
  });

  it('titles in Turkish', async () => {
    const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
    const { unmount } = render(
      <LangProvider initial="tr">
        <App api={createMockApi({ latency: 0 })} runStore={runStore} initialPath="/explore/D1" />
      </LangProvider>,
    );
    await waitFor(() => expect(document.title).toBe('Fikir D1 · LIBRAIN'));
    unmount();
    render(
      <LangProvider initial="tr">
        <App api={createMockApi({ latency: 0 })} runStore={runStore} initialPath="/" />
      </LangProvider>,
    );
    await waitFor(() => expect(document.title).toBe('LIBRAIN · Her cümlesi kontrol edilmiş araştırma fikirleri'));
  });

  it('offers the home page and the ideas from an unknown address', async () => {
    setup('/no/such/page');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'See the ideas' })).toHaveAttribute('href', '/explore');
  });
});

describe('App (live client against a fake server)', () => {
  it('on 401 opens the API-key setting, then retries with X-Api-Key', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/health') return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      const key = (init?.headers as Record<string, string> | undefined)?.['X-Api-Key'];
      if (key !== 'right-key') {
        return new Response(JSON.stringify({ title: 'API key required', detail: 'Send the configured key in the X-Api-Key header.', status: 401 }), {
          status: 401,
          headers: { 'Content-Type': 'application/problem+json' },
        });
      }
      return new Response(JSON.stringify(contract.papers), { status: 200 });
    });
    const api = createHttpApi({ fetchImpl });
    const { user } = setup('/library', api);

    const dialog = await screen.findByRole('dialog', { name: 'Connection' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Send the configured key in the X-Api-Key header.');
    expect(screen.getByText('The API needs a key.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('API key'), 'right-key');
    await user.click(within(dialog).getByRole('button', { name: 'Save key' }));
    expect(within(dialog).getByRole('status')).toHaveTextContent('Saved.');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    const last = fetchImpl.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect((last[1].headers as Record<string, string>)['X-Api-Key']).toBe('right-key');
  });

  it('shows when a rate-limited request can be retried', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/health') return new Response('{"status":"ok"}', { status: 200 });
      if (String(input) === '/api/papers') return new Response('[]', { status: 200 });
      return new Response(JSON.stringify({ title: 'rate limit reached', detail: 'At most 20 paid requests per hour are allowed from one client.', status: 429 }), {
        status: 429,
        headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '600' },
      });
    });
    const { user } = setup('/compare', createHttpApi({ fetchImpl, apiKey: () => null }));
    await user.type(await screen.findByRole('combobox', { name: 'Topic A' }), 'drug discovery');
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByText('Rate limit reached.')).toBeInTheDocument();
    expect(screen.getByText(/try again in about 10 min/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });
});
