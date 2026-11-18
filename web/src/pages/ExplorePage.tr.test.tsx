import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { createLocalRunStore } from '../history/localRunStore';
import { LangProvider } from '../i18n/lang';
import trD1 from '../i18n/discoveries/tr/D1.json';

function setup(path: string) {
  window.localStorage.setItem('librain.lang', 'tr');
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  const user = userEvent.setup();
  render(
    <LangProvider initial="tr">
      <App api={createMockApi({ latency: 0 })} runStore={runStore} initialPath={path} />
    </LangProvider>,
  );
  return { user };
}

describe('Explore in Turkish', () => {
  it('shows the Turkish heading, filters, translated notice and Turkish discovery text', async () => {
    const { user } = setup('/explore');
    expect(await screen.findByRole('heading', { level: 1, name: 'Fikirler' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Fikirler' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(70);
    expect(screen.getByText(/^10 alanda tüm fikirler; kayıt tarihi:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Köprüler 24 fikir' })).toBeInTheDocument();
    expect(screen.getByText(/Fikirler İngilizceden çevrildi; makale parçaları özgün dilinde/)).toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Fikirleri filtrele' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sırala' })).toHaveDisplayValue('En yüksek not');
    expect(screen.getByRole('status')).toHaveTextContent('Tüm 70 fikir');

    // Search works on the translated text.
    await user.type(screen.getByRole('searchbox', { name: 'Konularda ve iddialarda ara' }), 'PharmAgents');
    const titles = within(await screen.findByRole('list', { name: 'Fikirler' }))
      .getAllByRole('heading')
      .map((h) => h.textContent?.replace(/\s+/g, ' ').trim());
    expect(titles).toContain(`${trD1.topicA} × ${trD1.topicB}`);
  });

  it('translates the statistics page', async () => {
    setup('/explore/stats');
    expect(await screen.findByRole('heading', { level: 1, name: 'Fikir istatistikleri' })).toBeInTheDocument();
    expect(await screen.findByText('Ortalama not (/10)')).toBeInTheDocument();
    expect(screen.getByText('Not dağılımı')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Maliyet' })).toHaveTextContent('Üçüncü grup (alanlar arası köprüler): 24 çalıştırma için');
    expect(screen.getByText(/Birbirine yakın notları eşit sayın\./)).toBeInTheDocument();
  });

  it('translates the quiz', async () => {
    setup('/explore/quiz');
    expect(await screen.findByRole('heading', { level: 1, name: 'Riski bul' })).toBeInTheDocument();
    expect(await screen.findByText('Doğrulayıcı ne dedi?')).toBeInTheDocument();
  });
});
