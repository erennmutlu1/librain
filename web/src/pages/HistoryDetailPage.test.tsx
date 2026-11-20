import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import type { DiscoverRun } from '../api/types';
import { createLocalRunStore } from '../history/localRunStore';
import { LangProvider } from '../i18n/lang';

const RUN: DiscoverRun = {
  id: 'run-1',
  kind: 'discover',
  title: 'tidal energy × coral reefs',
  createdAt: '2026-11-18T10:00:00Z',
  quality: 0.66,
  request: { topicA: 'tidal energy', topicB: 'coral reefs', topK: 7, provider: 'anthropic' },
  response: {
    correlationId: 'c0ffee00-0000-4000-8000-000000000002',
    hypothesis: 'Tidal turbines can be placed to shade reefs during heat waves.',
    novelClaim: 'Shading cuts bleaching by a third.',
    supportingEvidence: [{ paperId: 'reef', chunkIndex: 1, section: 'Results', pageNumber: 2, supportType: 'direct', content: 'Shade lowers reef temperature.' }],
    extrapolationBasis: [],
    claimValidation: {
      claims: [{ sentence: 'Shading cuts bleaching by a third.', status: 'risky', supportingChunks: [], factualHallucinationProbability: 0.7, rationale: 'No number in the evidence.' }],
      aggregateRisk: 0.7,
    },
    reasoning: 'Shade and flow both matter.',
    evaluation: { noveltyScore: 0.5, plausibilityScore: 0.6, structuralCoherenceScore: 0.7, qualityScore: 0.66 },
  },
};

async function setup(lang: 'en' | 'tr' = 'en') {
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  await runStore.save(RUN);
  const user = userEvent.setup();
  render(
    <LangProvider initial={lang}>
      <App api={createMockApi({ latency: 0 })} runStore={runStore} initialPath={`/history/${RUN.id}`} />
    </LangProvider>,
  );
  return { user };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('History detail', () => {
  it('offers the run’s topics for a new idea: the Discover form prefilled, nothing run', async () => {
    await setup();
    const remix = await screen.findByRole('link', { name: 'Use these topics' });
    expect(remix).toHaveAttribute('href', '/discover?a=tidal%20energy&b=coral%20reefs&k=7');
    expect(remix).toHaveAttribute('title', 'Fills the Discover form with these topics. Nothing runs until you press Discover.');
  });

  it('keeps the request ID inside a closed Technical details disclosure', async () => {
    await setup();
    await screen.findByRole('link', { name: 'Use these topics' });
    expect(screen.queryByText(/correlation/i)).not.toBeInTheDocument();
    const value = screen.getByText(RUN.response.correlationId);
    const details = value.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getByText('Technical details')).toBeInTheDocument();
    expect(within(details).getByText('Request ID')).toBeInTheDocument();
  });

  it('exports a discovery with the shared Markdown, once, from the page header', async () => {
    let blob: Blob | null = null;
    Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => ((blob = b), 'blob:test')), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { user } = await setup();
    await screen.findByRole('link', { name: 'Use these topics' });
    // The result view's own buttons are off here: one export group on the page.
    expect(screen.getAllByRole('group', { name: 'Export' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
    const md = await blob!.text();
    expect(md).toContain('# tidal energy × coral reefs');
    expect(md).toContain('1. **Risky** (hallucination probability 70%): Shading cuts bleaching by a third.');
    expect(md).toContain('1. `reef`, page 2, Results: `reef:1` (direct)');
  });

  it('speaks Turkish', async () => {
    await setup('tr');
    expect(await screen.findByRole('link', { name: 'Bu konuları kullan' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tüm çalıştırmalar/ })).toBeInTheDocument();
    expect(screen.getByText('Kalite 0,66')).toBeInTheDocument();
    const exports = screen.getByRole('group', { name: 'Dışa aktar' });
    expect(within(exports).getByRole('button', { name: 'Markdown olarak indir' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Hipotez' })).toBeInTheDocument();
  });
});
