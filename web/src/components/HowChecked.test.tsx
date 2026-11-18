import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LangProvider } from '../i18n/lang';
import { HowChecked } from './HowChecked';

describe('HowChecked', () => {
  it('is a closed disclosure that opens to the verified steps', async () => {
    const user = userEvent.setup();
    render(<HowChecked />);
    const summary = screen.getByText('How a sentence is checked');
    const details = summary.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    await user.click(summary);
    expect(details).toHaveAttribute('open');

    const steps = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(steps).toHaveLength(7);
    expect(steps[0]).toMatch(/paper library \(55 papers today\).*each topic/);
    expect(steps[1]).toMatch(/may cite only those passages.*dropped before you see the result/);
    expect(steps[3]).toMatch(/validator \(Claude Haiku 4\.5 for the recorded runs\)/);
    expect(steps[4]).toMatch(/Grounded \(≈ 0\), Extrapolated \(≈ 0\.1–0\.3\) or Risky \(≈ 0\.6–1\.0\).*hallucination probability.*reason/);
    expect(steps[5]).toMatch(/Claim risk is the highest of those probabilities/);
    expect(steps[6]).toMatch(/If the check fails, claim risk is set to 1\.0/);
  });

  it('reads in Turkish with the decided terms', () => {
    render(
      <LangProvider initial="tr">
        <HowChecked />
      </LangProvider>,
    );
    expect(screen.getByText('Bir cümle nasıl denetlenir?')).toBeInTheDocument();
    const text = screen.getByRole('list').textContent ?? '';
    expect(text).toMatch(/Dayanaklı \(≈ 0\), Varsayımsal \(≈ 0,1–0,3\) ya da Riskli \(≈ 0,6–1,0\)/);
    expect(text).toMatch(/yeni iddia/);
    expect(text).toMatch(/İddia riski bu olasılıkların en yükseğidir/);
    expect(text).not.toMatch(/pasaj|derlem|özgün iddia|Çıkarımsal/);
  });
});
