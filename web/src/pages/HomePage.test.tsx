import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import rawD1 from '../explore/data/featured-discoveries/runs/D1.json';
import { RECORDED_IDEA_COUNT } from '../explore/ideaCount';
import trD1 from '../i18n/discoveries/tr/D1.json';
import { LangProvider, type Lang } from '../i18n/lang';
import { LIBRARY } from '../lib/library';
import { PublicDemoContext, type PublicDemo } from '../public/context';
import HomePage from './HomePage';

function renderHome(lang: Lang = 'en', demo: PublicDemo | null = null) {
  const user = userEvent.setup();
  render(
    <LangProvider initial={lang}>
      <PublicDemoContext.Provider value={demo}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </PublicDemoContext.Provider>
    </LangProvider>,
  );
  return { user };
}

const claims = rawD1.response.claimValidation.claims;
const riskyIndex = claims.findIndex((c) => c.status === 2);

describe('home page', () => {
  it('says what LIBRAIN is and routes to the ideas and to a new idea', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: `Research ideas from ${LIBRARY.papers} papers, with every sentence checked` })).toBeInTheDocument();
    expect(screen.getByText(/^LIBRAIN answers questions with the exact passages it used/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `See ${RECORDED_IDEA_COUNT} checked ideas` })).toHaveAttribute('href', '/explore');
    expect(screen.getByRole('link', { name: 'Try your own topics' })).toHaveAttribute('href', '/discover');
    expect(screen.getByText('Free to browse. No account, no key.')).toBeInTheDocument();
    // Plain HTML structure: one h1, then sections with h2 headings.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const name of ['Example: the checker catches a bold number', 'How it works', 'Ready-made or live', 'What’s inside', 'About the project']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('shows the recorded idea D1 with its verdicts and the reason for the risky sentence, without the network', () => {
    renderHome();
    const example = screen.getByRole('region', { name: 'Example: the checker catches a bold number' });
    expect(example).toHaveTextContent('Topics: Self-RAG (an AI that critiques its own answers) + PharmAgents (AI agents for drug discovery)');
    const sentences = within(example).getAllByRole('listitem');
    expect(sentences).toHaveLength(claims.length);
    // Read from the recorded run: an extrapolated sentence at 25% and a risky one at 72%.
    expect(sentences[0]).toHaveTextContent(claims[0]!.sentence);
    expect(sentences[0]).toHaveTextContent('Sentence 1: Extrapolated');
    expect(sentences[0]).toHaveTextContent('Hallucination probability: 25%');
    expect(sentences[riskyIndex]).toHaveTextContent(claims[riskyIndex]!.sentence);
    expect(sentences[riskyIndex]).toHaveTextContent(`Sentence ${riskyIndex + 1}: Risky`);
    expect(sentences[riskyIndex]).toHaveTextContent('Hallucination probability: 72%');
    expect(within(example).getByText(`The checker’s reason for sentence ${riskyIndex + 1}`)).toBeInTheDocument();
    expect(within(example).getByText(claims[riskyIndex]!.rationale)).toBeInTheDocument();
    expect(within(example).getByRole('link', { name: 'Open this idea with its sources' })).toHaveAttribute('href', '/explore/D1');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('explains the steps, the verdicts, both modes and the limits', () => {
    renderHome();
    const how = screen.getByRole('region', { name: 'How it works' });
    expect(within(how).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Pick two topics, or ask a question',
      'LIBRAIN finds passages and suggests an idea',
      'A second AI checks every sentence',
      'What the marks mean',
    ]);
    const legend = within(how).getByRole('list', { name: 'What the marks mean' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'GroundedBacked by a passage in the papers.',
      'ExtrapolatedA reasoned guess that goes beyond the papers, and says so.',
      'RiskyStates a specific fact the papers do not back up.',
    ]);

    const modes = screen.getByRole('region', { name: 'Ready-made or live' });
    expect(within(modes).getByText('One idea costs about US$0.07 on your accounts')).toBeInTheDocument();
    expect(within(modes).getByText('Your keys go only with your request and are never stored')).toBeInTheDocument();
    expect(within(modes).getByText(/^This is a research demo, not a finished product/)).toBeInTheDocument();
    // The owner's build has no data-source switch to offer.
    expect(within(modes).queryByRole('button')).not.toBeInTheDocument();

    const inside = screen.getByRole('region', { name: 'What’s inside' });
    expect(within(inside).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Ideas', '/explore'],
      ['New idea', '/discover'],
      ['Ask', '/ask'],
      ['Compare', '/compare'],
      ['Papers', '/library'],
      ['History', '/history'],
    ]);

    const about = screen.getByRole('region', { name: 'About the project' });
    expect(within(about).getByRole('link', { name: /Companion paper on Zenodo/ })).toHaveAttribute('href', 'https://doi.org/10.5281/zenodo.20745782');
    expect(within(about).getByRole('link', { name: /Source code on GitHub/ })).toHaveAttribute('href', 'https://github.com/erennmutlu1/librain');
    expect(within(about).getByRole('link', { name: /MIT licence/ })).toHaveAttribute('href', 'https://github.com/erennmutlu1/librain/blob/main/LICENSE');
    expect(within(about).getByRole('link', { name: /Made by Eren Mutlu/ })).toHaveAttribute('href', 'https://erenmutlu.me');
    expect(within(about).getByText(/0 of 30 ratings/)).toBeInTheDocument();
  });

  it('speaks Turkish, with the translated example and its reason', () => {
    renderHome('tr');
    expect(screen.getByRole('heading', { level: 1, name: `${LIBRARY.papers} makaleden araştırma fikirleri, her cümlesi kontrol edilmiş` })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Kontrol edilmiş ${RECORDED_IDEA_COUNT} fikri görün` })).toHaveAttribute('href', '/explore');
    expect(screen.getByRole('link', { name: 'Kendi konularınızı deneyin' })).toHaveAttribute('href', '/discover');
    expect(screen.getByText('Göz atmak ücretsiz. Hesap ya da API key gerekmez.')).toBeInTheDocument();

    const example = screen.getByRole('region', { name: 'Örnek: denetleyici iddialı bir sayıyı yakalıyor' });
    const sentences = within(example).getAllByRole('listitem');
    expect(sentences[0]).toHaveTextContent('Cümle 1: Varsayımsal');
    expect(sentences[0]).toHaveTextContent('Uydurma olasılığı: %25');
    expect(sentences[riskyIndex]).toHaveTextContent(trD1.claims[riskyIndex]!.sentence);
    expect(sentences[riskyIndex]).toHaveTextContent(`Cümle ${riskyIndex + 1}: Riskli`);
    expect(sentences[riskyIndex]).toHaveTextContent('Uydurma olasılığı: %72');
    expect(within(example).getByText(trD1.claims[riskyIndex]!.rationale)).toBeInTheDocument();
    expect(within(example).queryByText(claims[riskyIndex]!.rationale)).not.toBeInTheDocument();
    expect(within(example).getByRole('link', { name: 'Bu fikri kaynaklarıyla açın' })).toHaveAttribute('href', '/explore/D1');

    expect(screen.getByRole('heading', { level: 2, name: 'Hazır mı, canlı mı?' })).toBeInTheDocument();
    expect(screen.getByText('API key’leriniz yalnızca isteğinizle gönderilir, saklanmaz')).toBeInTheDocument();
    expect(screen.getByText('Dayanaklı')).toBeInTheDocument();
    expect(screen.getAllByText('Varsayımsal').length).toBeGreaterThan(0);
    expect(screen.queryByText(/anahtar/i)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('offers the switch to Live in the public build', async () => {
    const switchTo = vi.fn();
    const { user } = renderHome('en', { mode: 'recorded', switchTo, waking: false, serverWaking: false });
    const modes = screen.getByRole('region', { name: 'Ready-made or live' });
    expect(within(modes).getByText('Switch any time with Recorded | Live at the top of the page.')).toBeInTheDocument();
    await user.click(within(modes).getByRole('button', { name: 'Switch to Live' }));
    expect(switchTo).toHaveBeenCalledWith('live');
  });
});
