import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { normalizeDiscoverResponse } from '../api/normalize';
import type { ClaimValidationResult } from '../api/types';
import { discoverScenarios } from '../mocks/scenarios';
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
    expect(within(note).getByText('No retrieved chunk supports this sentence.')).toBeInTheDocument();
    // The generator's own basis is linked to the same sentence.
    expect(within(note).getByText('Speculation')).toBeInTheDocument();
  });

  it('updates the note on focus and pins with Enter', async () => {
    const user = userEvent.setup();
    const r = fixture('anthropic-pair-10');
    render(
      <AnnotatedClaim novelClaim={r.novelClaim} validation={r.claimValidation} basis={r.extrapolationBasis} evidence={r.supportingEvidence} papers={new Map()} />,
    );

    await user.tab();
    const note = screen.getByRole('complementary', { name: 'Sentence verdict' });
    expect(within(note).getByText('Sentence 1 of 2')).toBeInTheDocument();
    expect(within(note).getByText('04-graphcast:8')).toBeInTheDocument();

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

  it('warns clearly when validation failed', () => {
    renderClaim({ claims: [], aggregateRisk: 1, validationFailed: true }, 'Some claim. Another one.');
    expect(screen.getByRole('alert')).toHaveTextContent(/claim validation failed/i);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Some claim. Another one.')).toBeInTheDocument();
  });

  it('says when there are no verdicts at all', () => {
    renderClaim(null, 'Some claim.');
    expect(screen.getByText(/no sentence-level verdicts/i)).toBeInTheDocument();
  });
});
