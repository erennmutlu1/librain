import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { runToMarkdown, runsToCsv } from '../history/exporters';
import { createLocalRunStore } from '../history/localRunStore';
import { LangProvider } from '../i18n/lang';
import { downloadCsv, downloadText } from '../lib/download';
import { text as libraryText } from './LibraryPage.i18n';
import { PUBLIC_CORPUS_NOTE } from './LibraryPage';

vi.mock('../lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/download')>()),
  downloadCsv: vi.fn(),
  downloadText: vi.fn(),
}));

function setup(path: string, lang?: 'tr') {
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  const user = userEvent.setup();
  const app = <App api={createMockApi({ latency: 0 })} runStore={runStore} initialPath={path} />;
  render(lang ? <LangProvider initial={lang}>{app}</LangProvider> : app);
  return { user, runStore };
}

const rowHeaders = (table: HTMLElement) =>
  within(table)
    .getAllByRole('rowheader')
    .map((c) => c.textContent);

describe('Library table', () => {
  it('searches, sorts, links arXiv papers and exports what it shows as CSV', async () => {
    const { user } = setup('/library');
    const table = await screen.findByRole('table', { name: 'Papers in the library, sorted by Paper, ascending' });
    const total = rowHeaders(table).length;
    expect(screen.getByText(`${total} papers`)).toBeInTheDocument();

    const arxiv = screen.getByRole('link', { name: '2005.11401 on arXiv (opens in a new tab)' });
    expect(arxiv).toHaveAttribute('href', 'https://arxiv.org/abs/2005.11401');

    await user.type(screen.getByRole('searchbox', { name: 'Search papers by ID, title or author' }), 'lewis');
    expect(rowHeaders(table)).toHaveLength(1);
    expect(screen.getByText(`1 of ${total} papers`)).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search papers by ID, title or author' }));

    const chunks = within(table).getByRole('columnheader', { name: 'Chunks' });
    await user.click(within(chunks).getByRole('button'));
    expect(chunks).toHaveAttribute('aria-sort', 'descending');

    await user.click(screen.getByRole('button', { name: `Export the ${total} rows shown as CSV` }));
    const [filename, header, rows] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(filename).toMatch(/^librain-papers-.*\.csv$/);
    expect(header).toEqual(['Paper ID', 'Title', 'Authors', 'Year', 'Chunks', 'Added (UTC)', 'arXiv link']);
    expect(rows).toHaveLength(total);
    expect(rows).toContainEqual(expect.arrayContaining(['2005.11401', 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks']));
  });

  it('keeps the exported public-corpus note in step with the English string table', () => {
    expect(libraryText.en.corpusNote).toBe(PUBLIC_CORPUS_NOTE);
  });

  it('speaks Turkish', async () => {
    setup('/library', 'tr');
    expect(await screen.findByRole('heading', { level: 1, name: 'Kütüphane' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /^Kütüphanedeki makaleler/ });
    expect(within(table).getByRole('columnheader', { name: 'Parça' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Makaleleri kimlik, başlık ya da yazara göre arayın' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Makale ekle' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'arXiv kimliği ya da bağlantısı' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '04-graphcast makalesini sil' })).toBeInTheDocument();
  });
});

describe('History table', () => {
  it('lists runs newest first with kind, title link, time and quality; filters, sorts and exports all', async () => {
    const { user, runStore } = setup('/history');
    await user.click(await screen.findByRole('button', { name: 'Load the recorded runs' }));
    const table = await screen.findByRole('table', { name: 'Saved runs, sorted by When, descending' });
    const total = rowHeaders(table).length;
    expect(total).toBeGreaterThan(3);
    expect(screen.getByText(`${total} runs`)).toBeInTheDocument();

    // Each title links to its run, and the link names the kind.
    expect(within(table).getByRole('link', { name: 'Ask: Why does GraphCast forecast well?' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/history\//),
    );

    await user.type(screen.getByRole('searchbox', { name: 'Search runs by topic, question or id' }), 'graphcast');
    expect(rowHeaders(table).every((t) => /graphcast/i.test(t ?? ''))).toBe(true);
    await user.clear(screen.getByRole('searchbox', { name: 'Search runs by topic, question or id' }));

    const quality = within(table).getByRole('columnheader', { name: 'Quality' });
    await user.click(within(quality).getByRole('button'));
    expect(quality).toHaveAttribute('aria-sort', 'descending');

    // The kind filter narrows the table; export still takes every run.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Show' }), 'compare');
    await waitFor(() => expect(rowHeaders(screen.getByRole('table')).length).toBeLessThan(total));

    const group = screen.getByRole('group', { name: 'Export all runs' });
    await user.click(within(group).getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalled());
    const [filename, csv, mime] = vi.mocked(downloadText).mock.calls.at(-1)!;
    expect(filename).toMatch(/^librain-runs-.*\.csv$/);
    expect(mime).toBe('text/csv');
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toMatch(/^Run id,Kind,Run at \(UTC\),Title,Question,Topic A,Topic B,Passages per topic,/);
    expect(lines).toHaveLength((await runStore.list()).length + 1);

    await user.click(within(group).getByRole('button', { name: 'JSON' }));
    await waitFor(() => expect(vi.mocked(downloadText).mock.calls.at(-1)![2]).toBe('application/json'));
  });

  it('opens a run when its row is clicked', async () => {
    const { user } = setup('/history');
    await user.click(await screen.findByRole('button', { name: 'Load the recorded runs' }));
    const table = await screen.findByRole('table');
    const link = within(table).getByRole('link', { name: 'Ask: Why does GraphCast forecast well?' });
    await user.click(link.closest('tr')!.querySelector('td:last-child')!);
    expect(await screen.findByRole('heading', { name: 'Why does GraphCast forecast well?' })).toBeInTheDocument();
  });

  it('speaks Turkish, down to the CSV headers and Markdown headings', async () => {
    const { user, runStore } = setup('/history', 'tr');
    expect(await screen.findByRole('heading', { level: 1, name: 'Geçmiş' })).toBeInTheDocument();
    expect(await screen.findByText('Henüz çalıştırma yok')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Kayıtlı çalıştırmaları yükle' }));
    const table = await screen.findByRole('table', { name: 'Kaydedilmiş çalıştırmalar, Zaman sütununa göre azalan sıralı' });
    expect(within(table).getByRole('link', { name: 'Sor: Why does GraphCast forecast well?' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Tüm çalıştırmaları dışa aktar' })).toBeInTheDocument();

    const runs = await Promise.all((await runStore.list()).map((r) => runStore.get(r.id)));
    const details = runs.filter((r) => r !== undefined);
    expect(runsToCsv(details, 'tr').split('\r\n')[0]).toMatch(/^Çalıştırma kimliği,Tür,Çalıştırma zamanı \(UTC\),Başlık,Soru,Konu A,Konu B,/);
    const discover = details.find((r) => r.kind === 'discover')!;
    expect(runToMarkdown(discover, 'tr')).toContain('## Hipotez');
    expect(runToMarkdown(discover, 'en')).toContain('## Hypothesis');
  });
});
