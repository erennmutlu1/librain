import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearProviderKeys, setProviderKeys } from '../api/providerKeys';
import { LangProvider } from '../i18n/lang';
import { createPublicHistory, createPublicRunStore } from '../public/browserHistory';
import { createLiveClient, loadRecordedClient } from '../public/clients';
import type { DemoMode } from '../public/context';
import { PublicApp } from '../public/PublicApp';

/*
 * Ask in the public build. Recorded mode has no Ask recordings, so the form
 * says so: quietly while typing, and right under the submit row (focused)
 * when the visitor presses Ask. Live mode states what a question costs.
 */

async function setup({ lang, mode }: { lang?: 'tr'; mode?: DemoMode } = {}) {
  const history = createPublicHistory({ getStorage: () => window.localStorage });
  const fetchImpl = vi.fn(() => Promise.reject(new Error('no network in this test')));
  const clients = {
    recorded: await loadRecordedClient(history, 0),
    live: createLiveClient(history, { baseUrl: 'https://api.librain.test', fetchImpl }),
    runStore: createPublicRunStore(history),
  };
  const user = userEvent.setup();
  const app = <PublicApp clients={clients} initialPath="/ask" initialMode={mode} />;
  render(lang ? <LangProvider initial={lang}>{app}</LangProvider> : app);
  return { user, fetchImpl, runStore: clients.runStore };
}

afterEach(() => {
  clearProviderKeys();
  window.sessionStorage.clear();
});

describe('Ask: no recording in Recorded mode', () => {
  it('says so quietly while typing, and right under the submit row (focused) on submit', async () => {
    const { user, fetchImpl, runStore } = await setup();
    const field = await screen.findByRole('textbox', { name: 'Question' });
    const hint = 'No recording for this question — switch to Live to ask it.';
    expect(screen.queryByText(hint)).not.toBeInTheDocument();

    await user.type(field, 'Why does GraphCast forecast well?');
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(field).toHaveAccessibleDescription(hint);

    const submit = screen.getByRole('button', { name: 'Ask' });
    await user.click(submit);
    const notice = screen.getByText('No recording for this question.').closest('[role="status"]') as HTMLElement;
    expect(notice).toHaveFocus();
    expect(notice.previousElementSibling).toContainElement(submit);
    expect(within(notice).getByRole('button', { name: 'Switch to Live' })).toBeInTheDocument();
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await runStore.list()).toHaveLength(0);

    // Changing the question clears it; the quiet hint comes back.
    await user.type(field, ' Explain.');
    expect(screen.queryByText('No recording for this question.')).not.toBeInTheDocument();
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('still checks the question first', async () => {
    const { user } = await setup();
    await screen.findByRole('textbox', { name: 'Question' });
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Type a question first.');
    expect(screen.queryByText('No recording for this question.')).not.toBeInTheDocument();
  });

  it('says it in Turkish', async () => {
    const { user } = await setup({ lang: 'tr' });
    const field = await screen.findByRole('textbox', { name: 'Soru' });
    expect(field).toHaveAttribute('placeholder', 'Erişim destekli üretim (RAG) halüsinasyonu nasıl azaltır?');
    expect(screen.getByText(/^Hazır mod yalnızca gerçek çalıştırmaları yeniden gösterir ve Sor için/)).toBeInTheDocument();
    expect(screen.queryByText(/[Dd]erlem/)).not.toBeInTheDocument();
    await user.type(field, 'GraphCast neden iyi tahmin yapar?');
    expect(screen.getByText('Bu soru için hazır çalıştırma yok. Sormak için Canlı moda geçin.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sor' }));
    const notice = screen.getByText('Bu soru için hazır çalıştırma yok.').closest('[role="status"]') as HTMLElement;
    expect(notice).toHaveFocus();
    expect(within(notice).getByRole('button', { name: 'Canlı moda geç' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Getirilecek parça' })).toBeInTheDocument();
  });
});

describe('Ask: the cost before a Live run', () => {
  it('states who is billed and how it compares with a new idea', async () => {
    setProviderKeys({ anthropic: 'sk-ant-test', openai: 'sk-test' }, false);
    await setup({ mode: 'live' });
    await screen.findByRole('textbox', { name: 'Question' });
    expect(screen.getByText('Billed to your Anthropic and OpenAI accounts. A question costs less than a new idea (about US$0.07).')).toBeInTheDocument();
    expect(screen.queryByText('Ask has no recorded runs.')).not.toBeInTheDocument();
  });
});
