import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { createLocalRunStore } from '../history/localRunStore';
import { LangProvider } from '../i18n/lang';

/*
 * The Library screen's accessibility details: empty cells say nothing to a
 * screen reader, loading is announced, and the icon-only delete button has a
 * visible tooltip. LibraryHistory.test.tsx covers search, sort and export.
 */

function setup({ lang, latency = 0 }: { lang?: 'tr'; latency?: number } = {}) {
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  const app = <App api={createMockApi({ latency })} runStore={runStore} initialPath="/library" />;
  render(lang ? <LangProvider initial={lang}>{app}</LangProvider> : app);
}

describe('Library table', () => {
  it('leaves empty cells empty for screen readers (a muted mark for the eye only)', async () => {
    setup();
    const table = await screen.findByRole('table', { name: /^Papers in the library/ });
    // Mock mode lists cited papers whose authors and year are unknown.
    const marks = table.querySelectorAll('[aria-hidden="true"]');
    const dashes = [...marks].filter((el) => el.textContent === '–');
    expect(dashes.length).toBeGreaterThan(0);
    // No cell is read as a dash.
    expect(within(table).queryAllByRole('cell', { name: /^[–—-]$/ })).toHaveLength(0);
    expect(within(table).queryAllByText('—')).toHaveLength(0);
  });

  it('gives the icon-only delete button a visible tooltip as well as its name', async () => {
    setup();
    const button = await screen.findByRole('button', { name: 'Delete 04-graphcast' });
    expect(button).toHaveAttribute('title', 'Delete 04-graphcast');
  });
});

describe('Library loading', () => {
  it('announces loading in a status region, then clears it', async () => {
    setup({ latency: 1 });
    await screen.findByRole('heading', { level: 1, name: 'Library' });
    const status = screen.getAllByRole('status').find((el) => el.textContent === 'Loading papers…');
    expect(status).toBeDefined();
    expect(status).toHaveClass('visually-hidden');
    await screen.findByRole('table', { name: /^Papers in the library/ });
    expect(status).toBeEmptyDOMElement();
  });

  it('announces it in Turkish', async () => {
    setup({ lang: 'tr', latency: 1 });
    await screen.findByRole('heading', { level: 1, name: 'Kütüphane' });
    expect(screen.getAllByRole('status').some((el) => el.textContent === 'Makaleler yükleniyor…')).toBe(true);
  });
});
