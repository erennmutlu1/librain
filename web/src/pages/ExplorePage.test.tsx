import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createHttpApi } from '../api/httpClient';
import { createMockApi } from '../api/mockClient';
import type { LibrainApi } from '../api/types';
import { BOOKMARKS_KEY } from '../explore/bookmarks';
import { QUIZ_KEY } from '../explore/quizScore';
import { createLocalRunStore } from '../history/localRunStore';

// The real recorded files, read directly so expectations do not go through the app's own model.
const rawRuns = import.meta.glob<{ id: string; request: { topicA: string; topicB: string } }>('../explore/data/*/runs/*.json', {
  import: 'default',
  eager: true,
});
const raw = (id: string) => Object.values(rawRuns).find((r) => r.id === id)!;
const titleOf = (id: string) => `${raw(id).request.topicA} × ${raw(id).request.topicB}`;

/** A client that records every call and fails it as if the API were offline. */
function offlineApi(mode: LibrainApi['mode']) {
  const calls: string[] = [];
  const fail = (name: string) => () => {
    calls.push(name);
    return Promise.reject(new TypeError('Failed to fetch'));
  };
  const names = [
    'health', 'listPapers', 'ingestPaper', 'ingestArxiv', 'deletePaper', 'query', 'queryStream', 'discover',
    'discoverStream', 'naiveRag', 'singleLlm', 'compare', 'listRuns', 'getRun', 'deleteRun',
  ] as const;
  const api = { mode, ...Object.fromEntries(names.map((n) => [n, fail(n)])) } as unknown as LibrainApi;
  return { api, calls };
}

function setup(path: string, api: LibrainApi = createMockApi({ latency: 0 })) {
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  const user = userEvent.setup();
  render(<App api={api} runStore={runStore} initialPath={path} />);
  return { user };
}

async function cards() {
  const list = await screen.findByRole('list', { name: 'Discoveries' });
  return within(list).getAllByRole('listitem');
}

const cardTitle = (li: HTMLElement) => within(li).getByRole('heading').textContent?.replace(/\s+/g, ' ').trim();
const cardFor = (items: HTMLElement[], id: string) => items.find((li) => cardTitle(li) === titleOf(id))!;

/** The "Why it's promising" bullet led by a glossary term. */
function point(region: HTMLElement, term: string) {
  return within(region)
    .getAllByRole('listitem')
    .find((li) => within(li).queryByRole('button', { name: term }))!;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Explore', () => {
  it('lists all 46 ideas, best rated first, with category, rating, risk and editor’s picks', async () => {
    setup('/explore');
    const items = await cards();
    expect(items).toHaveLength(46);
    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 2, name: 'Discovery of the day' })).toBeInTheDocument();

    // S3 and W5 share the top rating (7.8); W5 is an editor's pick with the lowest claim risk.
    const w5 = items.find((li) => within(li).queryByText(/Turn screenshot-to-code benchmarks/))!;
    expect(within(w5).getByRole('img', { name: 'Rated 7.8 out of 10' })).toBeInTheDocument();
    expect(w5).toHaveTextContent('AI × web development');
    expect(w5).toHaveTextContent('Editor’s pick');
    expect(w5).toHaveTextContent('Claim risk 0.05');
    expect(cardTitle(items[0]!)).toBe(`${raw('S3').request.topicA} × ${raw('S3').request.topicB}`);
    expect(screen.getAllByText('Editor’s pick').length).toBeGreaterThanOrEqual(14);
  });

  it('filters by category chip, with counts on every chip', async () => {
    const { user } = setup('/explore');
    await cards();
    const chips = screen.getByRole('group', { name: 'Category' });
    expect(within(chips).getByRole('button', { name: 'All 46' })).toHaveAttribute('aria-pressed', 'true');
    const football = within(chips).getByRole('button', { name: 'AI × football, 5 ideas' });
    await user.click(football);
    expect(football).toHaveAttribute('aria-pressed', 'true');
    const items = await cards();
    expect(items).toHaveLength(5);
    expect(items.every((li) => li.textContent?.includes('AI × football'))).toBe(true);
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Showing 5 of 46 ideas.');
  });

  it('sorts by novelty, plausibility and lowest risk', async () => {
    const { user } = setup('/explore');
    await cards();
    const sort = screen.getByRole('combobox', { name: 'Sort by' });
    await user.selectOptions(sort, 'risk');
    expect(cardTitle((await cards())[0]!)).toBe(`${raw('W5').request.topicA} × ${raw('W5').request.topicB}`);
    expect(cardTitle((await cards()).at(-1)!)).toBe(`${raw('P1').request.topicA} × ${raw('P1').request.topicB}`);
    await user.selectOptions(sort, 'novelty');
    expect(cardTitle((await cards())[1]!)).toBe(`${raw('F2').request.topicA} × ${raw('F2').request.topicB}`);
  });

  it('searches topics and claims, and offers a way back when nothing matches', async () => {
    const { user } = setup('/explore');
    await cards();
    const search = screen.getByRole('searchbox', { name: 'Search topics and claims' });
    await user.type(search, 'corner kick');
    let items = await cards();
    expect(items).toHaveLength(1);
    expect(cardTitle(items[0]!)).toBe(`${raw('F4').request.topicA} × ${raw('F4').request.topicB}`);
    // The category counts follow the search.
    expect(screen.getByRole('button', { name: 'AI × football, 1 idea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drug discovery × agents, 0 ideas' })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'zzzz-no-such-topic');
    expect(await screen.findByText('No ideas match these filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all 46' }));
    items = await cards();
    expect(items).toHaveLength(46);
  });

  it('saves bookmarks and shows them under Saved, even when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { user } = setup('/explore');
    const items = await cards();
    const d1 = cardFor(items, 'D1');
    const save = within(d1).getByRole('button', { name: /^Save D1/ });
    await user.click(save);
    expect(save).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /^Saved 1/ }));
    const saved = await cards();
    expect(saved).toHaveLength(1);
    expect(cardTitle(saved[0]!)).toBe(titleOf('D1'));
    expect(screen.getByText(/kept for this visit only/)).toBeInTheDocument();
  });

  it('keeps bookmarks in localStorage when it works', async () => {
    const { user } = setup('/explore');
    const items = await cards();
    const w5 = items.find((li) => li.textContent?.includes('Turn screenshot-to-code'))!;
    await user.click(within(w5).getByRole('button', { name: /^Save W5/ }));
    expect(JSON.parse(window.localStorage.getItem(BOOKMARKS_KEY)!)).toEqual(['W5']);
  });

  it('opens a random idea rated 6 or more from Surprise me', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { user } = setup('/explore');
    await cards();
    await user.click(screen.getByRole('button', { name: 'Surprise me' }));
    await screen.findByRole('region', { name: 'Why it’s promising' });
    const img = screen.getAllByRole('img', { name: /^Rated \d\.\d out of 10$/ })[0]!;
    expect(Number(/Rated (\d\.\d)/.exec(img.getAttribute('aria-label')!)![1])).toBeGreaterThanOrEqual(6);
    expect(screen.getByRole('heading', { level: 2, name: 'Why it’s promising' })).toBeInTheDocument();
  });
});

describe('Explore detail', () => {
  it('renders evidence bullets computed from the data: real paper names and real percentiles (F2)', async () => {
    setup('/explore/F2');
    const promising = await screen.findByRole('region', { name: 'Why it’s promising' });
    expect(promising).toHaveTextContent(
      'Candidate hypothesis: the evidence supports its starting points; the novel part still needs a real test.',
    );
    expect(promising).toHaveTextContent(
      'Backed by 4 passages from 2 papers: Actions Speak Louder Than Goals: Valuing Player Actions in Soccer; gat.',
    );
    expect(point(promising, 'Novelty')).toHaveTextContent('0.49 — top 5% of all 46 ideas');
    expect(point(promising, 'Plausibility')).toHaveTextContent('0.68 — higher than 67% of all 46 ideas');
    expect(point(promising, 'Coherence')).toHaveTextContent('0.82 — top 3% of all 46 ideas');
    expect(promising).toHaveTextContent('No sentence stated as unsupported fact (1 checked).');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(raw('F2').request.topicA);
    expect(screen.getByRole('img', { name: 'Rated 7.6 out of 10' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveTextContent('Recorded run · 2026-11-18 · $0.06');
    expect(screen.getByRole('region', { name: 'The evidence' }).querySelectorAll('blockquote').length).toBe(3);
    expect(screen.getByRole('region', { name: 'How the generator reasoned' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Related ideas' })).getAllByRole('link')).toHaveLength(3);
  });

  it('flags D1’s risky sentence and shows it with the existing verdict component', async () => {
    setup('/explore/D1');
    const promising = await screen.findByRole('region', { name: 'Why it’s promising' });
    expect(within(promising).getByRole('link', { name: '1 sentence flagged risky — see below.' })).toHaveAttribute('href', '#unproven');
    expect(promising).toHaveTextContent('Backed by 7 passages from 3 papers: self-rag; pharmagents; 2508.14111.');
    const unproven = screen.getByRole('region', { name: 'What’s still unproven' });
    expect(within(unproven).getByRole('button', { name: /37\.94% ceiling.*sentence 2: Risky, 72% hallucination probability/ })).toBeInTheDocument();
    expect(within(unproven).getByText(/conflates current performance with an immutable limit/)).toBeInTheDocument();
  });

  it('never calls an idea proven', async () => {
    setup('/explore/W5');
    await screen.findByRole('region', { name: 'Why it’s promising' });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bproven\b|\bproofs?\b/i);
  });

  it('shows the formula and this idea’s numbers under "How ratings work"', async () => {
    const { user } = setup('/explore/W5');
    await screen.findByRole('region', { name: 'Why it’s promising' });
    await user.click(screen.getByRole('button', { name: 'How ratings work' }));
    expect(screen.getByText(/rating = 10 × \(0\.35·plausibility \+ 0\.25·coherence \+ 0\.25·novelty/)).toBeVisible();
    expect(screen.getByText(/This idea: 10 × \(0\.35·0\.72 \+ 0\.25·0\.78 \+ 0\.25·0\.76 \+ 0\.15·0\.95\) =/)).toHaveTextContent('= 7.8');
  });

  it('gives glossary terms a plain-language description', async () => {
    setup('/explore/W5');
    const promising = await screen.findByRole('region', { name: 'Why it’s promising' });
    const term = within(promising).getByRole('button', { name: 'Plausibility' });
    expect(term).toHaveAccessibleDescription(/judge model’s 0 to 1 estimate/);
  });

  it('opens the full Discover result view and comes back', async () => {
    const { user } = setup('/explore/P3');
    await screen.findByRole('region', { name: 'Why it’s promising' });
    await user.click(screen.getByRole('link', { name: 'Open full result' }));
    expect(await screen.findByText('Recorded run, not generated now.')).toBeInTheDocument();
    expect(screen.getByText('experiments/new-areas-discoveries/runs/P3.json')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Extrapolation basis' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to the summary of P3' }));
    expect(await screen.findByRole('region', { name: 'Why it’s promising' })).toBeInTheDocument();
  });

  it('answers an unknown id with a not-found', async () => {
    setup('/explore/ZZ9');
    expect(await screen.findByText('There is no recorded discovery called “ZZ9”')).toBeInTheDocument();
  });
});

describe('Explore statistics', () => {
  it('reports the totals and links every scatter dot to its idea', async () => {
    setup('/explore/stats');
    expect(await screen.findByRole('heading', { level: 1, name: 'Explore statistics' })).toBeInTheDocument();
    const glance = await screen.findByRole('list', { name: 'At a glance' });
    expect(glance).toHaveTextContent('$3.05');
    expect(glance).toHaveTextContent('46');
    expect(screen.getByRole('img', { name: /^Histogram of ratings/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Average rating by category: Drug discovery × agents/ })).toBeInTheDocument();
    const scatter = screen.getByRole('group', { name: 'Scatter plot: one link per idea' });
    const dots = within(scatter).getAllByRole('link');
    expect(dots).toHaveLength(46);
    expect(within(scatter).getByRole('link', { name: /^D1, Drug discovery × agents: .*rated 5\.1 out of 10\.$/ })).toHaveAttribute('href', '/explore/D1');
    const held = screen.getByRole('region', { name: 'How the runs held up' });
    expect(held).toHaveTextContent('Completed46/46');
    expect(held).toHaveTextContent('No risky sentence42/46');
    expect(held).toHaveTextContent('Editor’s picks14/46');
    expect(held).toHaveTextContent('the citation contract dropped 0 of them, and 0 fabricated citations');
    expect(screen.getByRole('region', { name: 'An area left out' })).toHaveTextContent('How people will live without money or work');
  });
});

describe('Spot the risk', () => {
  it('reveals the validator’s RISKY verdict and rationale for D1’s sentence, and keeps score', async () => {
    const { user } = setup('/explore/quiz?q=D1.2');
    expect(await screen.findByText(/push overall drug candidate success rates beyond the 37\.94% ceiling/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Risky' }));
    const result = await screen.findByRole('heading', { level: 3, name: /^Right\. The validator said Risky/ });
    expect(result).toHaveFocus();
    expect(screen.getByText(/72% chance this sentence states something the evidence does not support/)).toBeInTheDocument();
    expect(screen.getByText(/conflates current performance with an immutable limit/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open D1: the whole idea' })).toHaveAttribute('href', '/explore/D1');
    expect(JSON.parse(window.localStorage.getItem(QUIZ_KEY)!)).toEqual({ answered: 1, correct: 1, streak: 1, best: 1 });
  });

  it('says so when the guess is wrong, and works with storage blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { user } = setup('/explore/quiz?q=D1.2');
    await screen.findByText(/37\.94% ceiling/);
    await user.click(screen.getByRole('button', { name: 'Extrapolated' }));
    expect(await screen.findByRole('heading', { level: 3, name: /^Not quite\. The validator said Risky/ })).toBeInTheDocument();
    expect(screen.getByText(/the score lasts for this visit/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next sentence/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Sentence 2 of 14' })).toBeInTheDocument();
  });
});

describe('Explore makes no API call', () => {
  it('through an injected client, across every Explore screen', async () => {
    const { api, calls } = offlineApi('mock');
    const { user } = setup('/explore', api);
    await cards();
    await user.click(screen.getByRole('link', { name: titleOf('D1') }));
    await screen.findByRole('region', { name: 'Why it’s promising' });
    await user.click(screen.getByRole('link', { name: 'Open full result' }));
    await screen.findByText('Recorded run, not generated now.');
    await user.click(screen.getByRole('link', { name: 'Statistics' }));
    await screen.findByRole('list', { name: 'At a glance' });
    await user.click(screen.getByRole('link', { name: 'Spot the risk' }));
    await screen.findByRole('heading', { level: 2, name: /^Sentence 1 of/ });
    expect(calls).toEqual([]);
  });

  it('in real mode with the API offline: only the header health check touches fetch', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const { user } = setup('/explore/D4', createHttpApi({ fetchImpl, apiKey: () => null }));
    await screen.findByRole('region', { name: 'Why it’s promising' });
    await user.click(screen.getByRole('link', { name: 'Open full result' }));
    await screen.findByText('Recorded run, not generated now.');
    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
    expect(fetchImpl.mock.calls.map((call) => String((call as unknown[])[0]))).toEqual(['/health']);
  });
});
