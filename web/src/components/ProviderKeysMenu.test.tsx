import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { clearProviderKeys } from '../api/providerKeys';
import { LangProvider } from '../i18n/lang';
import { ProviderKeysMenu } from './ProviderKeysMenu';

/*
 * The key fields themselves. PublicApp.test.tsx and keysCheck.test.tsx cover
 * the panel's flows (saving, Live mode, checking the keys).
 */

afterEach(() => clearProviderKeys());

async function openPanel() {
  const user = userEvent.setup();
  render(<ProviderKeysMenu />);
  await user.click(screen.getByRole('button', { name: 'Your API keys' }));
  return { user, panel: screen.getByRole('dialog', { name: 'Your API keys' }) };
}

describe('ProviderKeysMenu fields', () => {
  it('tells password managers these are not a login', async () => {
    const { panel } = await openPanel();
    for (const label of ['Anthropic API key', 'OpenAI API key']) {
      const field = within(panel).getByLabelText(label);
      expect(field).toHaveAttribute('type', 'password');
      expect(field).toHaveAttribute('autocomplete', 'off');
      expect(field).toHaveAttribute('data-1p-ignore');
      expect(field).toHaveAttribute('data-lpignore', 'true');
      expect(field.getAttribute('name')).toMatch(/-api-key$/);
    }
  });

  it('masks a shown key again when the keys are saved', async () => {
    const { user, panel } = await openPanel();
    const anthropic = within(panel).getByLabelText('Anthropic API key');
    await user.click(within(panel).getByRole('button', { name: 'Show Anthropic API key' }));
    expect(anthropic).toHaveAttribute('type', 'text');
    await user.type(anthropic, 'sk-ant-test');
    await user.click(within(panel).getByRole('button', { name: 'Save keys' }));
    expect(anthropic).toHaveAttribute('type', 'password');
    expect(within(panel).getByRole('button', { name: 'Show Anthropic API key' })).toBeInTheDocument();
  });

  it('masks it again when the panel closes and reopens', async () => {
    const { user, panel } = await openPanel();
    await user.click(within(panel).getByRole('button', { name: 'Show OpenAI API key' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Your API keys' }));
    expect(screen.getByLabelText('OpenAI API key')).toHaveAttribute('type', 'password');
  });

  it('keeps the hint to one plain sentence, with the get-a-key link outside it', async () => {
    const { user, panel } = await openPanel();
    const anthropic = within(panel).getByLabelText('Anthropic API key');
    expect(anthropic).toHaveAccessibleDescription('Anthropic keys usually start with sk-ant-.');
    const link = within(panel).getByRole('link', { name: /^Get a key at console\.anthropic\.com\s*\(opens in a new tab\)$/ });
    expect(document.getElementById(anthropic.getAttribute('aria-describedby')!)).not.toContainElement(link);

    // A key in the wrong format keeps the same sentence, now as a warning.
    const openai = within(panel).getByLabelText('OpenAI API key');
    await user.type(openai, 'sk-ant-oops');
    expect(openai).toHaveAccessibleDescription('This looks like an Anthropic key. OpenAI keys start with sk-.');
  });

  it('speaks Turkish', async () => {
    const user = userEvent.setup();
    render(
      <LangProvider initial="tr">
        <ProviderKeysMenu />
      </LangProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'API key’ler' }));
    const panel = screen.getByRole('dialog', { name: 'API key’ler' });
    const field = within(panel).getByLabelText('Anthropic API key');
    expect(field).toHaveAccessibleDescription('Anthropic API key’leri genellikle sk-ant- ile başlar.');
    expect(within(panel).getByLabelText('OpenAI API key')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /console.anthropic.com adresinden API key alın/ })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'API key’leri kaydet' })).toBeInTheDocument();
    expect(
      within(panel).getByText(
        'Yeni fikir başına yaklaşık 0,07, soru başına yaklaşık 0,03 ABD doları; ücret Anthropic ve OpenAI hesaplarınıza yansır. Karşılaştır üç sistemi çalıştırır ve yeni bir fikirden daha pahalıdır.',
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/^Hazır mod API key gerektirmez\./)).toBeInTheDocument();
    // Owner's terminology: "API key", never "anahtar".
    expect(panel.textContent).not.toMatch(/anahtar/i);
  });
});

describe('ProviderKeysMenu cost', () => {
  it('states the cost first, right under the title and before any key field', async () => {
    const { panel } = await openPanel();
    const cost = within(panel).getByText(
      'About US$0.07 per new idea and US$0.03 per question, billed to your Anthropic and OpenAI accounts. Compare runs three systems and costs more than a new idea.',
    );
    const heading = within(panel).getByRole('heading', { name: 'Your API keys' });
    expect(heading.nextElementSibling).toBe(cost);
    const firstField = within(panel).getByLabelText('Anthropic API key');
    expect(cost.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('on a touch screen, focuses the panel rather than a field, so no keyboard covers the price', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query === '(pointer: coarse)', media: query }) as MediaQueryList) as typeof window.matchMedia;
    try {
      const { panel } = await openPanel();
      expect(panel).toHaveFocus();
    } finally {
      window.matchMedia = original;
    }
  });

  it('keeps Save tied to the form, although it sits outside it to stay pinned', async () => {
    const { user, panel } = await openPanel();
    const save = within(panel).getByRole('button', { name: 'Save keys' }) as HTMLButtonElement;
    // The form owner makes Save the form's default button, so Enter in a field still saves (checked in Chrome).
    expect(save.form).toBe(within(panel).getByLabelText('Anthropic API key').closest('form'));
    await user.type(within(panel).getByLabelText('Anthropic API key'), 'sk-ant-test');
    await user.click(save);
    expect(within(panel).getByRole('status')).toHaveTextContent(/saved/i);
  });
});
