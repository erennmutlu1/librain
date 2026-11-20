import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createHttpApi } from '../api/httpClient';
import { createMockApi } from '../api/mockClient';
import type { LibrainApi } from '../api/types';
import { BOOKMARKS_KEY } from '../explore/bookmarks';
import { ROUND_EXTRAPOLATED } from '../explore/model';
import { formatRating, normalizeNovelty, noveltyRange, rating } from '../explore/rating';
import { QUIZ_KEY } from '../explore/quizScore';
import { createLocalRunStore } from '../history/localRunStore';

interface RawRun {
  id: string;
  costUsd: number;
  request: { topicA: string; topicB: string };
  response: {
    evaluation: { noveltyScore: number; plausibilityScore: number; structuralCoherenceScore: number };
    claimValidation: { aggregateRisk: number; claims: { status: number }[] };
  };
}

// The real recorded files, read directly so expectations do not go through the app's own model.
const rawRuns = import.meta.glob<RawRun>('../explore/data/*/runs/*.json', {
  import: 'default',
  eager: true,
});
const rawManifests = import.meta.glob<{ featured: unknown[] }>('../explore/data/*/featured.json', { import: 'default', eager: true });
const allRaw = Object.values(rawRuns);
const raw = (id: string) => allRaw.find((r) => r.id === id)!;
const titleOf = (id: string) => `${raw(id).request.topicA} × ${raw(id).request.topicB}`;

// Counts and ratings worked out from those files, so a new batch changes them without an edit here.
const RUNS = allRaw.length;
const AREAS = new Set(allRaw.map((r) => r.id.charAt(0))).size;
const PICKS = Object.values(rawManifests).reduce((n, m) => n + m.featured.length, 0);
const range = noveltyRange(allRaw.map((r) => r.response.evaluation.noveltyScore));
const ratingOf = (id: string) => {
  const r = raw(id).response;
  const inputs = {
    plausibility: r.evaluation.plausibilityScore,
    coherence: r.evaluation.structuralCoherenceScore,
    novelty: r.evaluation.noveltyScore,
    aggregateRisk: r.claimValidation.aggregateRisk,
  };
  return formatRating(rating(inputs, range), 'en');
};
/** Verdicts as recorded: 0 grounded, 1 extrapolated, 2 risky. */
const verdicts = (status: number) => allRaw.flatMap((r) => r.response.claimValidation.claims).filter((c) => c.status === status).length;
/** "top N%" and "higher than N%" as the evidence bullets word them. */
const topPct = (values: number[], x: number) => Math.ceil((100 * values.filter((v) => v >= x).length) / values.length);
const belowPct = (values: number[], x: number) => Math.floor((100 * values.filter((v) => v < x).length) / values.length);

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
  const list = await screen.findByRole('list', { name: 'Ideas' });
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
  it('lists every idea, best rated first, with category, rating, risk and editor’s picks', async () => {
    setup('/explore');
    const items = await cards();
    expect(items).toHaveLength(RUNS);
    expect(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { name: 'Explore' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Idea of the day' })).toBeInTheDocument();

    // E5 (batch 4) rates highest, the only idea above 7.8; W5 follows, an editor's pick with the lowest claim risk.
    expect(cardTitle(items[0]!)).toBe(titleOf('E5'));
    const e5 = items[0]!;
    expect(within(e5).getByRole('img', { name: `Rated ${ratingOf('E5')} out of 10` })).toBeInTheDocument();
    expect(e5).toHaveTextContent('AI × wildlife and nature conservation');
    expect(e5).toHaveTextContent('Editor’s pick');
    const w5 = items.find((li) => within(li).queryByText(/Turn screenshot-to-code benchmarks/))!;
    expect(items[1]).toBe(w5);
    expect(within(w5).getByRole('img', { name: `Rated ${ratingOf('W5')} out of 10` })).toBeInTheDocument();
    expect(w5).toHaveTextContent('AI × web development');
    expect(w5).toHaveTextContent('Editor’s pick');
    expect(w5).toHaveTextContent('Claim risk 0.05');
    expect(screen.getAllByText('Editor’s pick').length).toBeGreaterThanOrEqual(PICKS);
    // Batch 3: the cross-field bridges, with their own category.
    const x17 = cardFor(items, 'X17');
    expect(x17).toHaveTextContent('Cross-field bridges');
    expect(within(x17).getByRole('img', { name: `Rated ${ratingOf('X17')} out of 10` })).toBeInTheDocument();
    expect(x17).toHaveTextContent('Editor’s pick');
    expect(screen.getByText(new RegExp(`, across ${AREAS} areas\\.`))).toBeInTheDocument();
  });

  it('filters by category chip, with counts on every chip', async () => {
    const { user } = setup('/explore');
    await cards();
    const chips = screen.getByRole('group', { name: 'Category' });
    expect(within(chips).getByRole('button', { name: `All ${RUNS}` })).toHaveAttribute('aria-pressed', 'true');
    expect(within(chips).getByRole('button', { name: 'Bridges 24 ideas' })).toBeInTheDocument();
    const wildlife = allRaw.filter((r) => r.id.startsWith('E')).length;
    expect(within(chips).getByRole('button', { name: `Wildlife ${wildlife} ideas` })).toBeInTheDocument();
    const football = within(chips).getByRole('button', { name: 'Football 5 ideas' });
    await user.click(football);
    expect(football).toHaveAttribute('aria-pressed', 'true');
    const items = await cards();
    expect(items).toHaveLength(5);
    expect(items.every((li) => li.textContent?.includes('AI × football'))).toBe(true);
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(`Showing 5 of ${RUNS} ideas.`);
  });

  it('sorts by novelty, plausibility and lowest risk', async () => {
    const { user } = setup('/explore');
    await cards();
    const sort = screen.getByRole('combobox', { name: 'Sort by' });
    await user.selectOptions(sort, 'risk');
    expect(cardTitle((await cards())[0]!)).toBe(`${raw('W5').request.topicA} × ${raw('W5').request.topicB}`);
    expect(cardTitle((await cards()).at(-1)!)).toBe(titleOf('M2'));
    await user.selectOptions(sort, 'novelty');
    expect((await cards()).slice(0, 2).map(cardTitle)).toEqual([titleOf('E5'), titleOf('S3')]);
  });

  it('searches topics and claims, and offers a way back when nothing matches', async () => {
    const { user } = setup('/explore');
    await cards();
    const search = screen.getByRole('searchbox', { name: 'Search topics and claims' });
    await user.type(search, 'corner kick');
    let items = await cards();
    expect(items.map(cardTitle)).toEqual([titleOf('X10'), titleOf('F4')]);
    // The category counts follow the search.
    expect(screen.getByRole('button', { name: 'Football 1 idea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bridges 1 idea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drug & materials 0 ideas' })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'zzzz-no-such-topic');
    expect(await screen.findByText('No ideas match these filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Show all ${RUNS}` }));
    items = await cards();
    expect(items).toHaveLength(RUNS);
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
    // The detail page loads the run data chunk (88 runs); on a busy CI runner that can exceed findBy's 5 s default.
    await screen.findByRole('region', { name: 'Why it’s promising' }, { timeout: 15000 });
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
    const scores = allRaw.map((r) => r.response.evaluation);
    const f2 = raw('F2').response.evaluation;
    const novelty = topPct(scores.map((e) => e.noveltyScore), f2.noveltyScore);
    const plausibility = belowPct(scores.map((e) => e.plausibilityScore), f2.plausibilityScore);
    const coherence = topPct(scores.map((e) => e.structuralCoherenceScore), f2.structuralCoherenceScore);
    expect(point(promising, 'Novelty')).toHaveTextContent(`0.49 — top ${novelty}% of all ${RUNS} ideas`);
    expect(point(promising, 'Plausibility')).toHaveTextContent(`0.68 — higher than ${plausibility}% of all ${RUNS} ideas`);
    expect(point(promising, 'Coherence')).toHaveTextContent(`0.82 — top ${coherence}% of all ${RUNS} ideas`);
    expect(promising).toHaveTextContent('No sentence stated as unsupported fact (1 checked).');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(raw('F2').request.topicA);
    expect(screen.getByRole('img', { name: `Rated ${ratingOf('F2')} out of 10` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveTextContent('Recorded run · 2026-11-18 · $0.06');
    expect(screen.getByRole('region', { name: 'The evidence' }).querySelectorAll('blockquote').length).toBe(3);
    expect(screen.getByRole('region', { name: 'How the hypothesis was reasoned' })).toBeInTheDocument();
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
    const norm = normalizeNovelty(raw('W5').response.evaluation.noveltyScore, range).toFixed(2).replace('.', '\\.');
    expect(screen.getByText(new RegExp(`This idea: 10 × \\(0\\.35·0\\.72 \\+ 0\\.25·0\\.78 \\+ 0\\.25·${norm} \\+ 0\\.15·0\\.95\\) =`))).toHaveTextContent(
      `= ${ratingOf('W5')}`,
    );
    expect(screen.getByText(new RegExp(`so the least novel of the ${RUNS} ideas counts 0`))).toBeVisible();
    // A rating comes from one run: the re-run finding, with the experiment one click away.
    const noise = screen.getByText(/re-run four times each: they rated 6\.5–7\.2 and 5\.6–6\.2, against 7\.6 and 7\.7/);
    expect(noise).toHaveTextContent('Treat close ratings as ties.');
    expect(within(noise).getByRole('link', { name: 'See the re-run experiment on GitHub (opens in a new tab)' })).toHaveAttribute(
      'href',
      'https://github.com/erennmutlu1/librain/tree/main/experiments/cross-field-discoveries',
    );
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
    expect(await screen.findByText('There is no recorded idea called “ZZ9”')).toBeInTheDocument();
  });
});

describe('Idea statistics', () => {
  it('reports the totals and links every scatter dot to its idea', async () => {
    setup('/explore/stats');
    expect(await screen.findByRole('heading', { level: 1, name: 'Idea statistics' })).toBeInTheDocument();
    const glance = await screen.findByRole('list', { name: 'At a glance' });
    const cost = (runs: RawRun[]) => `$${runs.reduce((s, r) => s + r.costUsd, 0).toFixed(2)}`;
    expect(glance).toHaveTextContent(cost(allRaw));
    expect(glance).toHaveTextContent(String(RUNS));
    expect(glance).toHaveTextContent(`in ${AREAS} categories`);
    expect(screen.getByRole('img', { name: /^Histogram of ratings/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Average rating by category: Drug & materials discovery × agents/ })).toBeInTheDocument();
    const scatter = screen.getByRole('group', { name: 'Scatter plot: one link per idea' });
    const dots = within(scatter).getAllByRole('link');
    expect(dots).toHaveLength(RUNS);
    const dot = (id: string, category: string) => new RegExp(`^${id}, ${category}: .*rating ${ratingOf(id).replace('.', '\\.')} out of 10\\.$`);
    expect(within(scatter).getByRole('link', { name: dot('D1', 'Drug & materials discovery × agents') })).toHaveAttribute('href', '/explore/D1');
    expect(within(scatter).getByRole('link', { name: dot('X17', 'Cross-field bridges') })).toHaveAttribute('href', '/explore/X17');
    expect(within(scatter).getByRole('link', { name: dot('E5', 'AI × wildlife and nature conservation') })).toHaveAttribute('href', '/explore/E5');
    const held = screen.getByRole('region', { name: 'How the runs held up' });
    const noRisky = allRaw.filter((r) => !r.response.claimValidation.claims.some((c) => c.status === 2)).length;
    expect(held).toHaveTextContent(`Completed${RUNS}/${RUNS}`);
    expect(held).toHaveTextContent(`No risky sentence${noRisky}/${RUNS}`);
    expect(held).toHaveTextContent(`Editor’s picks${PICKS}/${RUNS}`);
    const costs = screen.getByRole('region', { name: 'What it cost' });
    expect(costs).toHaveTextContent('Third batch (cross-field bridges): $1.60 for 24 runs.');
    const batch4 = Object.entries(rawRuns)
      .filter(([path]) => path.includes('/new-domains-discoveries/'))
      .map(([, r]) => r);
    expect(costs).toHaveTextContent(`Fourth batch (music, law and wildlife): ${cost(batch4)} for ${batch4.length} runs.`);
    await userEvent.setup().click(screen.getByRole('button', { name: 'How ratings work' }));
    expect(screen.getByText(/Treat close ratings as ties\./)).toBeVisible();
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
    // A round: every grounded and risky sentence, plus a sample of extrapolated ones.
    const round = verdicts(0) + verdicts(2) + ROUND_EXTRAPOLATED;
    expect(await screen.findByRole('heading', { level: 2, name: `Sentence 2 of ${round}` })).toBeInTheDocument();
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
