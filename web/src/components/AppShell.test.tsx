import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { createLocalRunStore } from '../history/localRunStore';
import { LangProvider } from '../i18n/lang';
import { createPublicHistory, createPublicRunStore } from '../public/browserHistory';
import { createLiveClient, loadRecordedClient } from '../public/clients';
import { PublicApp } from '../public/PublicApp';

function renderApp(path: string, lang: 'en' | 'tr') {
  const user = userEvent.setup();
  render(
    <LangProvider initial={lang}>
      <App api={createMockApi({ latency: 0 })} runStore={createLocalRunStore({ getStorage: () => window.localStorage })} initialPath={path} />
    </LangProvider>,
  );
  return { user };
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('app shell', () => {
  it('renders in Turkish: navigation, tools, footer and the document title', async () => {
    renderApp('/explore/stats', 'tr');
    expect(screen.getByRole('link', { name: 'İçeriğe geç' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('link', { name: 'LIBRAIN ana sayfa' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Bölümler' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Kütüphane', 'Sor', 'Keşfet', 'İncele', 'Karşılaştır', 'Geçmiş']);
    expect(screen.getByText('Örnek veri')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sistem teması. Açık temaya geç' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ara ve istediğiniz yere gidin/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Bağlantı ayarları/ })).toBeInTheDocument();

    const links = screen.getByRole('list', { name: 'Proje bağlantıları' });
    expect(within(links).getByRole('link', { name: /GitHub’da kaynak kod/ }).textContent).toBe('GitHub’da kaynak kod (yeni sekmede açılır)');
    expect(screen.getByRole('link', { name: /MIT lisansıyla/ })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Keşif istatistikleri · LIBRAIN'));
  });

  it('keeps English as it was, and titles a discovery by its id', async () => {
    renderApp('/explore/f4', 'en');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System theme. Switch to light theme' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Discovery F4 · LIBRAIN'));
  });

  it('cycles the theme from the header, in step with the palette', async () => {
    const { user } = renderApp('/explore/stats', 'en');
    await user.click(screen.getByRole('button', { name: 'System theme. Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByRole('button', { name: /^Search and jump/ }));
    await user.type(await screen.findByRole('combobox'), 'theme');
    await user.keyboard('{Enter}');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Dark theme. Switch to system theme' })).toBeInTheDocument();
  });

  it('translates the public build’s mode switch and keys button', async () => {
    const history = createPublicHistory({ getStorage: () => window.localStorage });
    const clients = {
      recorded: await loadRecordedClient(history, 0),
      live: createLiveClient(history, { baseUrl: 'https://api.librain.test', fetchImpl: () => Promise.reject(new TypeError('offline')) }),
      runStore: createPublicRunStore(history),
    };
    const user = userEvent.setup();
    render(
      <LangProvider initial="tr">
        <PublicApp clients={clients} initialPath="/explore/stats" />
      </LangProvider>,
    );
    const group = screen.getByRole('group', { name: 'Veri kaynağı' });
    expect(within(group).getByRole('button', { name: 'Kayıtlı' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(group).getByRole('button', { name: /^Canlı/ }));
    const panel = await screen.findByRole('dialog', { name: 'API anahtarlarınız' });
    expect(within(panel).getByRole('alert')).toHaveTextContent('Canlı mod kendi Anthropic ve OpenAI anahtarlarınızla çalışır.');
    expect(within(panel).getByRole('button', { name: 'Kaydet ve Canlı’ya geç' })).toBeInTheDocument();
  });
});
