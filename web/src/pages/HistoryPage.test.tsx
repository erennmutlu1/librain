import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { createLocalRunStore } from '../history/localRunStore';
import type { RunStore } from '../history/runStore';
import { LangProvider } from '../i18n/lang';

/*
 * The History screen's own behaviour: clearing (what it counts, where focus
 * goes), searching by the kind as shown, and saying when it is loading.
 * LibraryHistory.test.tsx covers the table, sorting and exports.
 */

function setup({ lang, runStore }: { lang?: 'tr'; runStore?: RunStore } = {}) {
  const store = runStore ?? createLocalRunStore({ getStorage: () => window.localStorage });
  const user = userEvent.setup();
  const app = <App api={createMockApi({ latency: 0 })} runStore={store} initialPath="/history" />;
  render(lang ? <LangProvider initial={lang}>{app}</LangProvider> : app);
  return { user, store };
}

async function seeded(lang?: 'tr') {
  const ctx = setup({ lang });
  await ctx.user.click(await screen.findByRole('button', { name: lang ? 'Kayıtlı çalıştırmaları yükle' : 'Load the recorded runs' }));
  const table = await screen.findByRole('table');
  return { ...ctx, table };
}

const rowHeaders = (table: HTMLElement) =>
  within(table)
    .getAllByRole('rowheader')
    .map((c) => c.textContent ?? '');

describe('History: clearing', () => {
  it('counts every saved run, says so when one kind is shown, and deletes them all', async () => {
    const { user, store } = await seeded();
    const total = (await store.list()).length;
    const compare = (await store.list({ kind: 'compare' })).length;
    expect(compare).toBeGreaterThan(0);
    expect(compare).toBeLessThan(total);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Show' }), 'compare');
    await waitFor(() => expect(rowHeaders(screen.getByRole('table'))).toHaveLength(compare));

    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    const confirm = await screen.findByRole('group', { name: 'Clear history' });
    // The table shows only Compare runs, but clearing deletes every kind: the button says how many, and that.
    await user.click(within(confirm).getByRole('button', { name: `Delete all ${total} runs of every kind` }));
    await waitFor(async () => expect(await store.list()).toHaveLength(0));
  });

  it('moves focus deliberately: to Keep, back to Clear, then to the heading once everything is deleted', async () => {
    const { user, store } = await seeded();
    const total = (await store.list()).length;

    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    const keep = await screen.findByRole('button', { name: 'Keep' });
    await waitFor(() => expect(keep).toHaveFocus());
    expect(screen.getByRole('button', { name: `Delete all ${total} runs` })).toBeInTheDocument();

    await user.click(keep);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear history' })).toHaveFocus());

    // Escape in the confirmation is Keep too.
    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep' })).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear history' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    await user.click(await screen.findByRole('button', { name: `Delete all ${total} runs` }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'History' })).toHaveFocus());
    expect(await screen.findByText('No runs yet')).toBeInTheDocument();
    expect(screen.getByText('History cleared.')).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe('History: search', () => {
  it('finds runs by the kind as the table shows it, not by the internal name', async () => {
    const { user, table, store } = await seeded();
    const asks = (await store.list({ kind: 'query' })).length;
    expect(asks).toBeGreaterThan(0);
    const search = screen.getByRole('searchbox', { name: 'Search runs by topic, question or id' });

    await user.type(search, 'ask');
    await waitFor(() => expect(rowHeaders(table)).toHaveLength(asks));
    expect(rowHeaders(table).every((name) => name.startsWith('Ask:'))).toBe(true);

    await user.clear(search);
    await user.type(search, 'query');
    expect(within(table).queryAllByRole('rowheader').filter((c) => c.textContent?.startsWith('Ask:'))).toHaveLength(0);
  });

  it('finds them by the Turkish kind name in Turkish', async () => {
    const { user, table, store } = await seeded('tr');
    const asks = (await store.list({ kind: 'query' })).length;
    await user.type(screen.getByRole('searchbox', { name: 'Çalıştırmaları konu, soru ya da kimliğe göre arayın' }), 'sor');
    await waitFor(() => expect(rowHeaders(table).length).toBeGreaterThanOrEqual(asks));
    expect(rowHeaders(table).filter((name) => name.startsWith('Sor:'))).toHaveLength(asks);
  });
});

describe('History: loading', () => {
  it('says it is loading in a status region while the list is on its way', async () => {
    const local = createLocalRunStore({ getStorage: () => window.localStorage });
    // A list that never arrives keeps the page in its loading state.
    const slow: RunStore = { ...local, list: () => new Promise(() => {}) };
    setup({ runStore: slow });
    await screen.findByRole('heading', { level: 1, name: 'History' });
    const status = screen.getAllByRole('status').find((el) => el.textContent === 'Loading…');
    expect(status).toBeDefined();
    expect(status).toHaveClass('visually-hidden');
  });

  it('says so in Turkish', async () => {
    const local = createLocalRunStore({ getStorage: () => window.localStorage });
    setup({ lang: 'tr', runStore: { ...local, list: () => new Promise(() => {}) } });
    await screen.findByRole('heading', { level: 1, name: 'Geçmiş' });
    expect(screen.getAllByRole('status').some((el) => el.textContent === 'Yükleniyor…')).toBe(true);
  });
});
