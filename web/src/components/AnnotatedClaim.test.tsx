import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { normalizeDiscoverResponse } from '../api/normalize';
import type { ClaimValidationResult } from '../api/types';
import { contract, discoverScenarios } from '../mocks/scenarios';
import { LangProvider } from '../i18n/lang';
import { AnnotatedClaim } from './AnnotatedClaim';

function fixture(id: string) {
  return normalizeDiscoverResponse(discoverScenarios.find((s) => s.id === id)!.response);
}

function renderClaim(validation: ClaimValidationResult | null, novelClaim: string) {
  return render(
    <AnnotatedClaim novelClaim={novelClaim} validation={validation} basis={[]} evidence={[]} papers={new Map()} />,
  );
}

describe('AnnotatedClaim', () => {
  it('highlights each sentence with its status and shows the riskiest verdict by default', () => {
    const r = fixture('anthropic-pair-10');
    render(
      <AnnotatedClaim
        novelClaim={r.novelClaim}
        validation={r.claimValidation}
        basis={r.extrapolationBasis}
        evidence={r.supportingEvidence}
        papers={new Map()}
      />,
    );

    const sentences = screen.getAllByRole('button', { pressed: false });
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toHaveTextContent(/sentence 1: Extrapolated, 15% hallucination probability/);
    expect(sentences[1]).toHaveTextContent(/sentence 2: Risky, 75% hallucination probability/);

    const note = screen.getByRole('complementary', { name: 'Sentence verdict' });
    expect(within(note).getByText('Sentence 2 of 2')).toBeInTheDocument();
    expect(within(note).getByText('75%')).toBeInTheDocument();
    expect(within(note).getByText('No retrieved passage supports this sentence.')).toBeInTheDocument();
    // The generator's own basis is linked to the same sentence.
    expect(within(note).getByText('Speculation')).toBeInTheDocument();
  });

  it('updates the note on focus and pins with Enter', async () => {
    const user = userEvent.setup();
    const r = fixture('anthropic-pair-10');
    render(
      <AnnotatedClaim novelClaim={r.novelClaim} validation={r.claimValidation} basis={r.extrapolationBasis} evidence={r.supportingEvidence} papers={new Map()} />,
    );

    const [first] = screen.getAllByRole('button', { pressed: false });
    act(() => first!.focus());
    const note = screen.getByRole('complementary', { name: 'Sentence verdict' });
    expect(within(note).getByText('Sentence 1 of 2')).toBeInTheDocument();
    expect(within(note).getByText('04-graphcast:8')).toBeInTheDocument();
    // The cited passage leads to its paper on the Papers page.
    expect(within(note).getByRole('link', { name: /04-graphcast:8/ })).toHaveAttribute('href', '/library?q=04-graphcast');

    await user.keyboard('{Enter}');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    await user.tab();
    await user.tab({ shift: true });
    expect(within(note).getByText('Sentence 1 of 2')).toBeInTheDocument();
  });

  it('lists validator sentences it cannot place in the text', () => {
    renderClaim(
      {
        aggregateRisk: 0.3,
        claims: [
          { sentence: 'Present sentence.', status: 'grounded', supportingChunks: ['p:1'], factualHallucinationProbability: 0.05, rationale: 'ok' },
          { sentence: 'An unrelated statement about tectonic plates and volcanoes.', status: 'risky', supportingChunks: [], factualHallucinationProbability: 0.3, rationale: 'no' },
        ],
      },
      'Present sentence.',
    );
    expect(screen.getByText(/one verdict could not be placed/i)).toBeInTheDocument();
    expect(screen.getByText(/tectonic plates/)).toBeInTheDocument();
  });

  it('warns clearly when validation failed (snapshot derived: only validationFailed flipped to true)', () => {
    const snapshot = normalizeDiscoverResponse(contract.discover);
    const failed = { ...snapshot.claimValidation!, validationFailed: true };
    renderClaim(failed, snapshot.novelClaim);
    expect(screen.getByRole('alert')).toHaveTextContent(/claim validation failed/i);
    // Verdicts that came with a failed validation are not painted onto the text.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(snapshot.novelClaim)).toBeInTheDocument();
  });

  it('says when there are no verdicts at all', () => {
    renderClaim(null, 'Some claim.');
    expect(screen.getByText(/no sentence-level verdicts/i)).toBeInTheDocument();
  });

  it('renders in Turkish inside a Turkish language provider', () => {
    const r = fixture('anthropic-pair-10');
    render(
      <LangProvider initial="tr">
        <AnnotatedClaim novelClaim={r.novelClaim} validation={r.claimValidation} basis={r.extrapolationBasis} evidence={r.supportingEvidence} papers={new Map()} />
      </LangProvider>,
    );
    const sentences = screen.getAllByRole('button', { pressed: false });
    expect(sentences[0]).toHaveTextContent(/1\. cümle: Varsayımsal, uydurma olasılığı %15/);
    expect(sentences[1]).toHaveTextContent(/2\. cümle: Riskli, uydurma olasılığı %75/);
    const note = screen.getByRole('complementary', { name: 'Cümle kararı' });
    expect(within(note).getByText('2 cümleden 2.')).toBeInTheDocument();
    expect(within(note).getByText('Getirilen hiçbir parça bu cümleyi desteklemiyor.')).toBeInTheDocument();
    expect(within(note).getByText('Spekülasyon')).toBeInTheDocument();
  });

  it('explains every verdict with an ⓘ and folds “How a sentence is checked” under the legend', async () => {
    const user = userEvent.setup();
    const r = fixture('anthropic-pair-10');
    render(
      <AnnotatedClaim novelClaim={r.novelClaim} validation={r.claimValidation} basis={r.extrapolationBasis} evidence={r.supportingEvidence} papers={new Map()} />,
    );
    const legend = screen.getByRole('list', { name: 'Sentence status legend' });
    const risky = within(legend).getByRole('button', { name: 'About Risky' });
    expect(risky).toHaveAccessibleDescription(/no passage supports\. Hallucination probability ≈ 0\.6–1\.0/);
    await user.click(risky);
    expect(risky).toHaveAttribute('aria-expanded', 'true');

    const how = screen.getByText('How a sentence is checked');
    expect(how.closest('details')).not.toHaveAttribute('open');
    await user.click(how);
    expect(how.closest('details')).toHaveAttribute('open');
    expect(screen.getByText(/Claim risk is the highest of those probabilities/)).toBeVisible();
    expect(screen.getByText(/claim risk is set to 1\.0/)).toBeInTheDocument();
    // The margin note explains its probability too.
    expect(screen.getByRole('button', { name: 'About Hallucination probability' })).toBeInTheDocument();
  });
});
