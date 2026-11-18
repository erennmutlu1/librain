import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../api/context';
import { createMockApi } from '../api/mockClient';
import { normalizeCompareResponse } from '../api/normalize';
import { LangProvider, type Lang } from '../i18n/lang';
import { compareStates } from '../lib/compare';
import { compareScenarios } from '../mocks/scenarios';
import { CompareView } from './CompareView';

function renderPair(id: string, lang: Lang = 'en') {
  const states = compareStates(normalizeCompareResponse(compareScenarios.find((s) => s.id === id)!.response));
  return render(
    <LangProvider initial={lang}>
      <ApiProvider api={createMockApi({ latency: 0 })}>
        <CompareView {...states} />
      </ApiProvider>
    </LangProvider>,
  );
}

describe('CompareView', () => {
  it('opens with “What this pair shows”, computed from the three results', () => {
    renderPair('pair-10');
    const takeaway = screen.getByRole('region', { name: 'What this pair shows' });
    const lines = within(takeaway).getAllByRole('listitem').map((li) => li.textContent);
    expect(lines).toEqual([
      'Highest scores: LIBRAIN for quality; Naive RAG for plausibility; Single LLM for novelty and coherence.',
      'All 4 of Naive RAG’s citations were among its retrieved passages.',
      'Claim risk is measured only for LIBRAIN (0.75). The baselines get no sentence-by-sentence check, so their risk is unknown, not lower.',
    ]);
  });

  it('counts fabricated and dropped citations, and says when scores tie', () => {
    renderPair('contract-compare');
    const lines = within(screen.getByRole('region', { name: 'What this pair shows' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(lines[0]).toBe('No system leads: the top score is shared on quality, novelty, plausibility and coherence.');
    expect(lines[1]).toBe('Naive RAG kept 1 fabricated citation out of 2. LIBRAIN’s citation check dropped 1 citation that pointed outside its retrieved passages.');
  });

  it('labels the scale once, names claim risk once, and explains “Not measured”', () => {
    renderPair('pair-10');
    const table = screen.getByRole('table', { name: /scores by system/i });
    expect(within(table).getByRole('columnheader', { name: 'Score, 0–1' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: /^Claim risk/ })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: /^Coherence/ })).toBeInTheDocument();
    expect(table).not.toHaveTextContent(/Hallucination risk|Aggregate risk|Structural coherence/);
    const notMeasured = within(table).getAllByRole('button', { name: 'About Not measured' });
    expect(notMeasured).toHaveLength(2);
    expect(notMeasured[0]).toHaveAccessibleDescription(/no sentence-by-sentence check.*Unknown is not the same as low/);
    // Request IDs sit under Technical details, not on the surface.
    expect(screen.getAllByText('Technical details').length).toBe(3);
    expect(screen.queryByText('Correlation ID')).not.toBeInTheDocument();
  });

  it('reads in Turkish with the decided names', () => {
    renderPair('pair-10', 'tr');
    const lines = within(screen.getByRole('region', { name: 'Bu çiftte ne görülüyor?' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(lines[0]).toBe('En yüksek puanlar: LIBRAIN (kalite); Basit RAG (akla yatkınlık); Tek model (özgünlük ve tutarlılık).');
    expect(lines[2]).toMatch(/^İddia riski yalnızca LIBRAIN için ölçülür \(0,75\)\. Referans sistemler cümle cümle denetlenmez/);
    expect(screen.getAllByText('Ölçülmedi')).toHaveLength(2);
  });
});
