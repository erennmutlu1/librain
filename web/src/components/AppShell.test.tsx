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
import { text as keysText } from './ProviderKeysMenu.i18n';

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
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Fikirler', 'Keşfet', 'Sor', 'Karşılaştır', 'Kütüphane', 'Geçmiş']);
    expect(within(nav).getByRole('link', { name: 'Fikirler' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Örnek veri')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Açık tema. Koyu temaya geç' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Hızlı arama/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menü' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Bağlantı ayarları/ })).toBeInTheDocument();

    const links = screen.getByRole('list', { name: 'Proje bağlantıları' });
    expect(within(links).getByRole('link', { name: /GitHub’da kaynak kod/ }).textContent).toBe('GitHub’da kaynak kod (yeni sekmede açılır)');
    expect(within(links).getByRole('link', { name: /Proje makalesi \(Zenodo\)/ })).toHaveAttribute('href', 'https://doi.org/10.5281/zenodo.20745782');
    expect(screen.getByRole('link', { name: /MIT lisansıyla/ })).toBeInTheDocument();
    expect(screen.getByText('Bir makale kütüphanesine soru sorun ve her cümlesi kontrol edilmiş yeni fikirler alın.')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Fikir istatistikleri · LIBRAIN'));
  });

  it('renders in English, and titles an idea by its id', async () => {
    renderApp('/explore/f4', 'en');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LIBRAIN home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Light theme. Switch to dark theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Quick search/ })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Idea F4 · LIBRAIN'));
  });

  it('puts the sections, search, language and theme behind one Menu button for phones, as a disclosure', async () => {
    const { user } = renderApp('/explore/stats', 'en');
    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('group', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-controls', panel.id);

    // The six sections, so the phone header needs no second row that scrolls sideways.
    const sections = within(panel).getByRole('navigation', { name: 'Sections' });
    expect(within(sections).getAllByRole('link').map((a) => a.textContent)).toEqual(['Explore', 'Discover', 'Ask', 'Compare', 'Library', 'History']);
    expect(within(sections).getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');

    await user.click(within(panel).getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(within(panel).getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();

    await user.click(within(within(panel).getByRole('group', { name: 'Language' })).getByRole('button', { name: 'Türkçe' }));
    expect(document.documentElement.lang).toBe('tr');
    expect(screen.getByRole('group', { name: 'Menü' })).toBeInTheDocument();

    // Escape closes it and gives focus back to its button.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Menü' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menü' })).toHaveFocus();

    // A tap outside closes it too.
    await user.click(screen.getByRole('button', { name: 'Menü' }));
    await user.click(document.body);
    expect(screen.queryByRole('group', { name: 'Menü' })).not.toBeInTheDocument();

    // Choosing a section closes it and goes there.
    await user.click(screen.getByRole('button', { name: 'Menü' }));
    await user.click(within(screen.getByRole('group', { name: 'Menü' })).getByRole('link', { name: 'Kütüphane' }));
    expect(screen.queryByRole('group', { name: 'Menü' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /Kütüphane/ })).toBeInTheDocument();

    // Search closes it and opens the palette.
    await user.click(screen.getByRole('button', { name: 'Menü' }));
    await user.click(within(screen.getByRole('group', { name: 'Menü' })).getByRole('button', { name: 'Ara' }));
    expect(screen.queryByRole('group', { name: 'Menü' })).not.toBeInTheDocument();
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });

  it('cycles the theme from the header, in step with the palette', async () => {
    const { user } = renderApp('/explore/stats', 'en');
    // Light by default; the header button switches to dark.
    expect(document.documentElement.dataset.theme).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Light theme. Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: /^Quick search/ }));
    await user.type(await screen.findByRole('combobox'), 'theme');
    await user.keyboard('{Enter}');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Light theme. Switch to dark theme' })).toBeInTheDocument();
  });

  it('translates the public build’s mode switch and keys button, with short tooltips', async () => {
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
    const recorded = within(group).getByRole('button', { name: 'Hazır' });
    expect(recorded).toHaveAttribute('aria-pressed', 'true');
    expect(recorded).toHaveAttribute('title', 'Deneylerden kaydedilmiş çalıştırmalar. Ücretsiz, API key gerekmez.');
    const live = within(group).getByRole('button', { name: /^Canlı/ });
    expect(live).toHaveAttribute('title', 'Kendi konularınız, kendi API key’lerinizle.');
    await user.click(live);
    // The panel's own wording belongs to ProviderKeysMenu.
    const panel = await screen.findByRole('dialog', { name: keysText.tr.title });
    expect(within(panel).getByRole('alert')).toHaveTextContent('Canlı mod kendi Anthropic ve OpenAI API key’lerinizle çalışır.');
    expect(within(panel).getByRole('button', { name: keysText.tr.saveLive })).toBeInTheDocument();
  });
});
