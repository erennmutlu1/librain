import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { glossary, type GlossaryTermKey } from '../explore/glossary';
import { LangProvider } from '../i18n/lang';
import { InfoTip } from './InfoTip';

describe('InfoTip', () => {
  it('is a labelled button whose description is the plain definition, closed at first', () => {
    render(<InfoTip k="risk" />);
    const button = screen.getByRole('button', { name: 'About Claim risk' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAccessibleDescription(/^The highest hallucination probability among the novel claim’s sentences/);
    expect(button).toHaveAccessibleDescription(/Example: Sentences at 0\.05, 0\.15 and 0\.70 give a claim risk of 0\.70/);
    expect(screen.getByText(/^The highest hallucination probability/)).not.toBeVisible();
  });

  it('opens and closes from the keyboard: Enter, Space and Escape', async () => {
    const user = userEvent.setup();
    render(
      <>
        <InfoTip k="novelty" />
        <button type="button">Next</button>
      </>,
    );
    const button = screen.getByRole('button', { name: 'About Novelty' });
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/closest passage in the paper library/)).toBeVisible();
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
    await user.keyboard(' ');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens with a tap and closes on a second tap or a tap elsewhere (no hover needed)', async () => {
    const user = userEvent.setup();
    render(
      <p>
        Claim risk <InfoTip k="risk" /> <span>elsewhere</span>
      </p>,
    );
    const button = screen.getByRole('button', { name: 'About Claim risk' });
    await user.pointer({ keys: '[TouchA]', target: button });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(screen.getByText('elsewhere'));
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveAttribute('title');
  });

  it('speaks Turkish inside a Turkish provider', () => {
    render(
      <LangProvider initial="tr">
        <InfoTip k="extrapolated" />
      </LangProvider>,
    );
    const button = screen.getByRole('button', { name: 'Varsayımsal hakkında' });
    expect(button).toHaveAccessibleDescription(/Uydurma olasılığı ≈ 0,1–0,3\. Örnek:/);
  });
});

describe('the shared glossary', () => {
  const keys = Object.keys(glossary('en')) as GlossaryTermKey[];

  it('defines every metric and verdict in both languages', () => {
    for (const key of ['novelty', 'plausibility', 'coherence', 'quality', 'risk', 'grounded', 'extrapolated', 'risky', 'hallucinationProbability', 'groundedness', 'relevance', 'completeness', 'confidence', 'notMeasured'] as const) {
      expect(keys).toContain(key);
    }
    for (const key of keys) {
      for (const lang of ['en', 'tr'] as const) {
        const entry = glossary(lang)[key];
        expect(entry.term, `${lang} ${key}`).not.toBe('');
        expect(entry.definition, `${lang} ${key}`).not.toBe('');
      }
    }
  });

  it('uses the decided terms only', () => {
    const en = JSON.stringify(glossary('en'));
    const tr = JSON.stringify(glossary('tr'));
    expect(en).not.toMatch(/corpus|chunk|Aggregate risk|Structural coherence/i);
    expect(tr).not.toMatch(/derlem|pasaj|Çıkarımsal|özgün iddia|hakem|üretici|Yapısal|halüsinasyon/i);
    expect(glossary('tr').extrapolated.term).toBe('Varsayımsal');
    expect(glossary('tr').risk.term).toBe('İddia riski');
    expect(glossary('en').coherence.term).toBe('Coherence');
  });

  it('states claim risk as the maximum, as LIBRAIN computes it', () => {
    expect(glossary('en').risk.definition).toMatch(/highest/);
    expect(glossary('en').quality.definition).toBe('The average of novelty, plausibility and coherence, from 0 to 1.');
  });
});
