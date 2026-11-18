import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { DiscoverRequest, MockScenario } from '../api/types';
import { LangProvider } from '../i18n/lang';
import { RecordedIndex } from './RecordedIndex';

const mk = (id: string, source: string): MockScenario<DiscoverRequest> =>
  ({ id, label: `${id} · a × b`, source, request: { topicA: 'a', topicB: 'b' }, response: {} }) as unknown as MockScenario<DiscoverRequest>;

const scenarios = [mk('explore-D1', 'x'), mk('explore-F1', 'x'), mk('base-1', 'experiments/baseline-comparison/a.json')];

function show(lang: 'en' | 'tr') {
  render(
    <MemoryRouter>
      <LangProvider initial={lang}>
        <RecordedIndex scenarios={scenarios} onPick={() => {}} />
      </LangProvider>
    </MemoryRouter>,
  );
}

describe('RecordedIndex count note', () => {
  it('explains the count in English', () => {
    show('en');
    expect(screen.getByText(/3 recorded runs = the 2 ideas \+ 1 from the baseline comparison/)).toBeInTheDocument();
  });
  it('explains the count in Turkish', () => {
    show('tr');
    expect(screen.getByText(/Kayıtlı çalıştırma sayısı: 3 = 2 fikir \+ referans sistem karşılaştırmasından 1 çalıştırma/)).toBeInTheDocument();
  });
});
