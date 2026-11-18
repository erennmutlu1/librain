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
    await user.click(screen.getByRole('button', { name: 'API anahtarlarınız' }));
    const field = screen.getByLabelText('Anthropic API anahtarı');
    expect(field).toHaveAccessibleDescription('Anthropic anahtarları genellikle sk-ant- ile başlar.');
    expect(screen.getByRole('link', { name: /console.anthropic.com adresinden anahtar alın/ })).toBeInTheDocument();
  });
});
