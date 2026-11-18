import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createHttpApi } from '../api/httpClient';
import { createMockApi } from '../api/mockClient';
import type { LibrainApi } from '../api/types';
import rawManifest from '../featured/data/featured.json';
import { createLocalRunStore } from '../history/localRunStore';
import { topicLabel } from '../lib/format';

// The real recorded files, read directly so the expectations do not go through the app's own mapping.
const rawRuns = import.meta.glob<{ id: string; request: { topicA: string; topicB: string } }>('../featured/data/runs/*.json', {
  import: 'default',
  eager: true,
});
const expectedTitles = rawManifest.featured.map((f) => {
  const run = rawRuns[`../featured/data/${f.file}`]!;
  return topicLabel(run.request.topicA, run.request.topicB);
});
const titleOf = (id: string) => expectedTitles[rawManifest.featured.findIndex((f) => f.id === id)]!;

/** A client that records every call and fails it as if the API were offline. */
function offlineApi(mode: LibrainApi['mode']) {
  const calls: string[] = [];
  const fail = (name: string) => () => {
    calls.push(name);
    return Promise.reject(new TypeError('Failed to fetch'));
  };
  const api: LibrainApi = {
    mode,
    health: fail('health'),
    listPapers: fail('listPapers'),
    ingestPaper: fail('ingestPaper'),
    ingestArxiv: fail('ingestArxiv'),
    deletePaper: fail('deletePaper'),
    query: fail('query'),
    queryStream: fail('queryStream'),
    discover: fail('discover'),
    discoverStream: fail('discoverStream'),
    naiveRag: fail('naiveRag'),
    singleLlm: fail('singleLlm'),
    compare: fail('compare'),
    listRuns: fail('listRuns'),
    getRun: fail('getRun'),
    deleteRun: fail('deleteRun'),
  };
  return { api, calls };
}

function setup(path: string, api: LibrainApi = createMockApi({ latency: 0 })) {
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  const user = userEvent.setup();
  render(<App api={api} runStore={runStore} initialPath={path} />);
  return { user, runStore };
}

async function gallery() {
  const region = await screen.findByRole('region', { name: 'Featured discoveries' });
  await within(region).findAllByRole('link');
  return region;
}

function card(region: HTMLElement, id: string): HTMLElement {
  return within(region).getByRole('link', { name: titleOf(id) }).closest('li')!;
}

describe('Featured discoveries', () => {
  it('shows all six recorded runs on Discover, in manifest order, with the framing and the legend', async () => {
    setup('/discover');
    const region = await gallery();

    expect(within(region).getAllByRole('link').map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual(expectedTitles);
    expect(within(region).getAllByRole('heading', { level: 3 })).toHaveLength(6);
    expect(region).toHaveTextContent(
      'Candidate hypotheses: the highlighted novel claim is the part the retrieved papers do not support, checked sentence by sentence. Novelty is measured against this 41-paper corpus.',
    );
    expect(within(region).getByRole('list', { name: 'Sentence status legend' })).toBeInTheDocument();
  });

  it('puts scores, bridges and provenance on each card, and flags D1 as the risky one', async () => {
    setup('/discover');
    const region = await gallery();

    const d1 = card(region, 'D1');
    expect(within(d1).getByText(rawManifest.featured.find((f) => f.id === 'D1')!.takeaway)).toBeInTheDocument();
    const chips = within(d1).getByRole('list', { name: 'Scores' });
    expect(within(chips).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Quality 0.58',
      'Novelty 0.33',
      'Plausibility 0.68',
      'Claim risk 0.72',
      '1 risky sentence',
    ]);
    expect(d1).toHaveTextContent('Bridges: self-rag, pharmagents, 2508.14111');
    expect(d1).toHaveTextContent('Recorded run · 2026-11-18 · Claude Sonnet 4.6 · $0.07');

    const d7 = card(region, 'D7');
    expect(d7).toHaveTextContent('Claim risk 0.25');
    expect(d7).not.toHaveTextContent(/risky sentence/);
    expect(d7).toHaveTextContent('Bridges: oc20, 2505.04651, 2508.14111');
    expect(within(region).getAllByText(/risky sentence/)).toHaveLength(1);
  });

  it('opens D1 with its annotated claim: exactly one RISKY sentence, passages and the recorded-run banner', async () => {
    const { user, runStore } = setup('/discover');
    const region = await gallery();
    await user.click(within(region).getByRole('link', { name: titleOf('D1') }));

    expect(await screen.findByText('Recorded run, not generated now.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: titleOf('D1') })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /\(sentence \d+: Risky/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /\(sentence \d+: Extrapolated/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /37\.94% ceiling.*sentence 2: Risky, 72% hallucination probability/ })).toBeInTheDocument();
    // Evidence with its passage text, and the generator's basis.
    expect(screen.getAllByText(/SELF-RAG concurrently processes multiple/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Extrapolation basis' })).toBeInTheDocument();
    expect(screen.getByText('experiments/featured-discoveries/runs/D1.json')).toBeInTheDocument();
    // A recording is not a new run.
    expect(await runStore.list()).toHaveLength(0);
  });

  it('makes no API call from the gallery or a featured run (injected client)', async () => {
    const { api, calls } = offlineApi('mock');
    const { user } = setup('/discover', api);
    const region = await gallery();
    await user.click(within(region).getByRole('link', { name: titleOf('D7') }));
    expect(await screen.findByText('Recorded run, not generated now.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to featured' }));
    await screen.findByRole('heading', { level: 1, name: 'Featured discoveries' });
    expect(calls).toEqual([]);
  });

  it('works in real mode with the API offline: only the header health check touches fetch', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const { user } = setup('/discover', createHttpApi({ fetchImpl, apiKey: () => null }));
    const region = await gallery();
    await user.click(within(region).getByRole('link', { name: titleOf('D1') }));
    expect(await screen.findByText('Recorded run, not generated now.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /\(sentence \d+: Risky/ })).toHaveLength(1);
    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
    expect(fetchImpl.mock.calls.map((call) => String((call as unknown[])[0]))).toEqual(['/health']);
  });

  it('serves a featured run at /discover/featured/:id and the gallery at /discover/featured', async () => {
    const { user } = setup('/discover/featured/N3');
    expect(await screen.findByRole('heading', { level: 2, name: titleOf('N3') })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: `Featured discovery: ${titleOf('N3')}` })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to featured' }));
    const region = await screen.findByRole('region', { name: 'Featured discoveries' });
    expect(within(region).getByRole('heading', { level: 1, name: 'Featured discoveries' })).toBeInTheDocument();
    expect(await within(region).findAllByRole('heading', { level: 2 })).toHaveLength(6);
  });

  it('shows a friendly not-found for an unknown id', async () => {
    const { user } = setup('/discover/featured/ZZ9');
    expect(await screen.findByText('There is no featured discovery called “ZZ9”')).toBeInTheDocument();
    expect(screen.getByText(/The featured runs are D7, C1, N3, A2, D5, D1\./)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'See the featured discoveries' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Featured discoveries' })).toBeInTheDocument();
  });

  it('keeps the gallery under a failed discovery, so recorded runs stay one click away', async () => {
    const { api } = offlineApi('live');
    const { user } = setup('/discover', api);
    await user.type(await screen.findByRole('combobox', { name: 'Topic A' }), 'drug discovery');
    await user.click(screen.getByRole('button', { name: 'Discover' }));
    expect(await screen.findByText(/Failed to fetch|could not reach|unreachable/i, { selector: 'strong, p' })).toBeInTheDocument();
    expect(await gallery()).toBeInTheDocument();
  });
});
