import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { createLocalRunStore } from '../history/localRunStore';
import trD1 from '../i18n/discoveries/tr/D1.json';
import { LangProvider } from '../i18n/lang';

function setup(path: string) {
  window.localStorage.setItem('librain.lang', 'tr');
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  render(
    <LangProvider initial="tr">
      <App api={createMockApi({ latency: 0 })} runStore={runStore} initialPath={path} />
    </LangProvider>,
  );
}

describe('Featured discoveries in Turkish', () => {
  it('shows the gallery with Turkish text and translated runs', async () => {
    setup('/discover/featured');
    const title = await screen.findByRole('heading', { level: 1, name: 'Öne çıkan keşifler' });
    const region = title.closest('section')!;
    const links = await within(region).findAllByRole('link');
    expect(links).toHaveLength(6);
    expect(await within(region).findByText(`${trD1.topicA}`, { exact: false })).toBeInTheDocument();
    expect(region).toHaveTextContent('Aday hipotezler:');
    expect(within(region).getAllByRole('list', { name: 'Puanlar' })).toHaveLength(6);
  });

  it('opens one run with the Turkish banner', async () => {
    setup('/discover/featured/D1');
    expect(await screen.findByText('Kayıtlı çalıştırma, şimdi üretilmedi.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Öne çıkanlara dön' })).toBeInTheDocument();
  });
});
