import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { createMockApi } from './api/mockClient';
import type { LibrainApi } from './api/types';
import { createLocalRunStore } from './history/localRunStore';

function setup(path: string, api: LibrainApi = createMockApi({ latency: 0 })) {
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  const user = userEvent.setup();
  render(<App api={api} runStore={runStore} initialPath={path} />);
  return { user, runStore };
}

describe('App (mock mode, no network)', () => {
  it('shows the shell with the mock badge and five sections', async () => {
    setup('/library');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Library', 'Ask', 'Discover', 'Compare', 'History']);
    expect(screen.getByText('Mock data')).toBeInTheDocument();
    expect(await screen.findByText('GraphCast: Learning skillful medium-range global weather forecasting')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /arxiv/i })).toBeDisabled();
  });

  it('runs a recorded discovery, renders the annotated claim and saves it to history', async () => {
    const { user, runStore } = setup('/discover');
    await user.click(screen.getByRole('button', { name: 'Drug discovery × climate adaptation' }));

    expect(await screen.findByRole('heading', { name: 'drug discovery × climate adaptation' })).toBeInTheDocument();
    expect(screen.getByText(/sentence 2: Risky/)).toBeInTheDocument();
    expect(screen.getByText(/predates the claimed\/dropped counters/)).toBeInTheDocument();
    expect(screen.getByText('experiments/baseline-comparison/results/librain/pair-10.json')).toBeInTheDocument();

    const runs = await runStore.list();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ kind: 'discover', mock: true, label: 'drug discovery × climate adaptation' });
  });

  it('shows the citation contract when evidence was dropped', async () => {
    const { user } = setup('/discover');
    await user.click(screen.getByRole('button', { name: /agentic AI × clinical trial design/i }));
    expect(await screen.findByText('Citation contract dropped 1')).toBeInTheDocument();
  });

  it('shows the validator-failure warning', async () => {
    const { user } = setup('/discover');
    await user.click(screen.getByRole('button', { name: /validator failure/ }));
    expect(await screen.findByText('Claim validation failed.')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
  });

  it('validates the form before calling the API', async () => {
    const { user, runStore } = setup('/discover');
    await user.click(screen.getByRole('button', { name: 'Discover' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter at least Topic A.');
    expect(await runStore.list()).toHaveLength(0);
  });

  it('opens a citation side panel from an inline chip on Ask', async () => {
    const { user } = setup('/ask');
    await user.click(screen.getByRole('button', { name: /How does retrieval-augmented generation/ }));
    const chip = await screen.findByRole('button', { name: /^Source 3: Retrieval-Augmented Generation/ });
    await user.click(chip);

    const panel = screen.getByRole('dialog', { name: 'Source 3' });
    expect(within(panel).getByText('4.3 Jeopardy Question Generation')).toBeInTheDocument();
    expect(within(panel).getByText('2005.11401:14')).toBeInTheDocument();
    expect(within(panel).getByText(/42.7% of cases/)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
  });

  it('compares three systems and marks fabricated Naive-RAG citations', async () => {
    const { user, runStore } = setup('/compare');
    await user.click(screen.getByRole('button', { name: /free-text citations/ }));

    expect(await screen.findByText('2 of 5 citations fabricated')).toBeInTheDocument();
    expect(screen.getAllByText('Fabricated: not in the retrieved set')).toHaveLength(2);
    expect(screen.getByRole('table', { name: /scores by system/i })).toBeInTheDocument();

    const runs = await runStore.list();
    expect(runs[0]?.kind).toBe('compare');
  });

  it('lists saved runs in History and re-renders one', async () => {
    const { user } = setup('/history');
    await user.click(await screen.findByRole('button', { name: 'Load the recorded runs' }));
    const link = await screen.findByRole('link', { name: /Retrieval-augmented generation × de novo molecular design/i });
    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'retrieval-augmented generation × de novo molecular design' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Markdown/ })).toBeInTheDocument();
  });

  it('still works when localStorage is unavailable', async () => {
    const api = createMockApi({ latency: 0 });
    const runStore = createLocalRunStore({
      getStorage: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    const user = userEvent.setup();
    render(<App api={api} runStore={runStore} initialPath="/discover" />);
    await user.click(screen.getByRole('button', { name: 'Drug discovery × climate adaptation' }));
    await screen.findByRole('heading', { name: 'drug discovery × climate adaptation' });
    await user.click(screen.getByRole('link', { name: 'History' }));
    expect(await screen.findByText('Runs are not being saved.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /drug discovery × climate adaptation/i })).toBeInTheDocument();
  });
});
