import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { createLocalRunStore } from '../history/localRunStore';
import { LangProvider } from '../i18n/lang';

// The recorded files, read directly so expectations do not go through the app's model.
const rawRuns = import.meta.glob<{ id: string; request: { topicA: string; topicB: string; topK?: number } }>('../explore/data/*/runs/*.json', {
  import: 'default',
  eager: true,
});
const raw = (id: string) => Object.values(rawRuns).find((r) => r.id === id)!;

function setup(path: string, lang: 'en' | 'tr' = 'en') {
  const user = userEvent.setup();
  render(
    <LangProvider initial={lang}>
      <App api={createMockApi({ latency: 0 })} runStore={createLocalRunStore({ getStorage: () => window.localStorage })} initialPath={path} />
    </LangProvider>,
  );
  return { user };
}

/** Captures what downloadText hands the browser. */
function captureDownloads() {
  const files: { name: string; blob: Blob }[] = [];
  let last: Blob | null = null;
  Object.assign(URL, {
    createObjectURL: vi.fn((blob: Blob) => {
      last = blob;
      return 'blob:test';
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (last) files.push({ name: this.download, blob: last });
  });
  return files;
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Explore detail: new flows', () => {
  it('remixes the run: Discover prefilled with its recorded topics', async () => {
    setup('/explore/F4');
    const remix = await screen.findByRole('link', { name: 'Remix' });
    const { topicA, topicB, topK } = raw('F4').request;
    expect(remix).toHaveAttribute('href', `/discover?a=${encodeURIComponent(topicA)}&b=${encodeURIComponent(topicB)}&k=${topK ?? 5}`);
    expect(remix).toHaveAccessibleDescription(/Open Discover with this run’s topics/);
  });

  it('exports the discovery as Markdown and the recorded run as JSON', async () => {
    const files = captureDownloads();
    const { user } = setup('/explore/F4');
    const exports = await screen.findByRole('group', { name: 'Export' });
    await user.click(within(exports).getByRole('button', { name: 'Download Markdown' }));
    await user.click(within(exports).getByRole('button', { name: 'Download JSON' }));

    expect(files.map((f) => f.name)).toEqual([
      'librain-f4-corner-kick-tactic-generation-and-player-positio.md',
      'librain-f4-corner-kick-tactic-generation-and-player-positio.json',
    ]);
    const md = await files[0]!.blob.text();
    expect(md).toContain(`# ${raw('F4').request.topicA} × ${raw('F4').request.topicB}`);
    expect(md).toContain('- Source: `experiments/new-areas-discoveries/runs/F4.json`');
    expect(md).toContain('## Novel claim, sentence by sentence');
    expect(md).toContain('/explore/F4>');
    const json = JSON.parse(await files[1]!.blob.text()) as { id: string; request: { topicA: string } };
    expect(json.id).toBe('F4');
    expect(json.request.topicA).toBe(raw('F4').request.topicA);
  });

  it('has no translation notice in English', async () => {
    setup('/explore/F4');
    await screen.findByRole('link', { name: 'Remix' });
    expect(screen.queryByRole('button', { name: 'Show original' })).not.toBeInTheDocument();
  });
});

describe('Explore detail in Turkish', () => {
  it('says the text is translated, shows the English original on request, and keeps the choice across discoveries', async () => {
    const { user } = setup('/explore/F4', 'tr');
    expect(await screen.findByText('Bu keşif İngilizceden çevrildi. Makale pasajları özgün dilinde.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('korner vuruşu taktik üretimi');
    expect(screen.getByRole('region', { name: 'Neden umut verici' })).toBeInTheDocument();

    // Remix always uses the recorded English topics.
    expect(screen.getByRole('link', { name: 'Düzenleyip çalıştır' })).toHaveAttribute(
      'href',
      expect.stringContaining(`a=${encodeURIComponent(raw('F4').request.topicA)}`),
    );

    const toggle = screen.getByRole('button', { name: 'Özgün metni göster' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Özgün metni göster' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(raw('F4').request.topicA);
    expect(screen.getByText('Bu keşfin özgün İngilizce metnini okuyorsunuz.')).toBeInTheDocument();
    // The interface itself stays Turkish.
    expect(screen.getByRole('region', { name: 'Neden umut verici' })).toBeInTheDocument();

    const related = within(screen.getByRole('region', { name: 'İlgili fikirler' })).getAllByRole('link')[0]!;
    const nextId = related.getAttribute('href')!.split('/').pop()!;
    await user.click(related);
    expect(await screen.findByRole('heading', { level: 1, name: new RegExp(raw(nextId).request.topicA.slice(0, 20)) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Özgün metni göster' })).toHaveAttribute('aria-pressed', 'true');
  });
});
