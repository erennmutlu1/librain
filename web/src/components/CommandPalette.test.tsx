import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { createLocalRunStore } from '../history/localRunStore';
import { RECORDED_IDEA_COUNT } from '../explore/ideaCount';
import { LangProvider } from '../i18n/lang';
import { fold, matchScore } from '../lib/fuzzy';
import { discoverPath } from '../lib/remix';
import { CommandPalette } from './CommandPalette';

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

/** The palette on its own, with a probe that shows where it navigated. */
function renderPalette(lang: 'en' | 'tr' = 'en') {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <LangProvider initial={lang}>
      <MemoryRouter initialEntries={['/start']}>
        <CommandPalette onClose={onClose} />
        <Where />
      </MemoryRouter>
    </LangProvider>,
  );
  const input = screen.getByRole('combobox');
  return { user, onClose, input, where: () => screen.getByTestId('where').textContent };
}

const activeOption = (input: HTMLElement) => document.getElementById(input.getAttribute('aria-activedescendant') ?? '');

function renderApp(path = '/library') {
  const user = userEvent.setup();
  render(<App api={createMockApi({ latency: 0 })} runStore={createLocalRunStore({ getStorage: () => window.localStorage })} initialPath={path} />);
  return { user };
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('command palette', () => {
  it('is a modal dialog with a combobox that owns a grouped listbox', async () => {
    const { input } = renderPalette();
    const dialog = screen.getByRole('dialog', { name: 'Quick search' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleName('Search sections, actions and ideas');
    const listbox = screen.getByRole('listbox', { name: 'Results' });
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(within(listbox).getByRole('group', { name: 'Go to' })).toBeInTheDocument();
    expect(within(listbox).getByRole('group', { name: 'Actions' })).toBeInTheDocument();
    // Editor's picks arrive once the recorded runs (a lazy chunk) have loaded.
    expect(await within(listbox).findByRole('group', { name: 'Editor’s picks' })).toBeInTheDocument();
    // The header's sections in its order, each sub-page after its section, and Home first.
    const go = within(listbox).getByRole('group', { name: 'Go to' });
    expect(within(go).getAllByRole('option').map((o) => o.querySelector('span > span')?.textContent)).toEqual([
      'Home',
      'Ideas',
      'Featured ideas',
      'Idea statistics',
      'Spot the risk',
      'New idea',
      'Ask',
      'Compare',
      'Papers',
      'History',
    ]);
    expect(activeOption(input)).toHaveAttribute('aria-selected', 'true');
  });

  it('filters fuzzily and Enter opens the active match', async () => {
    const { user, input, onClose, where } = renderPalette();
    await user.type(input, 'idea stat');
    const first = within(screen.getByRole('listbox')).getAllByRole('option')[0]!;
    expect(first).toHaveAccessibleName(/^Idea statistics/);
    expect(activeOption(input)).toBe(first);
    await user.keyboard('{Enter}');
    expect(where()).toBe('/explore/stats');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves the active option with the arrow keys, wrapping at the ends', async () => {
    const { user, input } = renderPalette();
    const options = () => within(screen.getByRole('listbox')).getAllByRole('option');
    expect(activeOption(input)).toBe(options()[0]);
    await user.keyboard('{ArrowDown}');
    expect(activeOption(input)).toBe(options()[1]);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(activeOption(input)).toBe(options().at(-1));
    expect(input).toHaveFocus();
  });

  it('goes home', async () => {
    const { user, input, where } = renderPalette();
    await user.type(input, 'home');
    await user.keyboard('{Enter}');
    expect(where()).toBe('/');
  });

  it('finds the recorded ideas by id and opens one', async () => {
    const { user, input, where } = renderPalette();
    await user.type(input, 'F4');
    const option = await screen.findByRole('option', { name: /^F4 · corner kick tactic generation/ });
    expect(within(screen.getByRole('listbox')).getByRole('group', { name: 'Ideas' })).toContainElement(option);
    await user.click(option);
    expect(where()).toBe('/explore/F4');
  });

  it('finds later batches’ ideas too, and counts them all in the Ideas hint', async () => {
    const { user, input, where } = renderPalette();
    await user.type(input, 'checked sentence');
    expect(screen.getByRole('option', { name: new RegExp(`All ${RECORDED_IDEA_COUNT} recorded ideas, checked sentence by sentence`) })).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'X17');
    const option = await screen.findByRole('option', { name: /^X17 · COVID-19 forecasting on a spatio-temporal graph/ });
    expect(option).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'E5');
    const e5 = await screen.findByRole('option', { name: /^E5 · animal movement tracking with bio-logging devices and drones/ });
    await user.click(e5);
    expect(where()).toBe('/explore/E5');
  });

  it('offers any typed text as a new idea, with the topic encoded in the link', async () => {
    const { user, input, where } = renderPalette();
    await user.type(input, 'tidal energy & coral reefs');
    const option = screen.getByRole('option', { name: /^New idea: tidal energy & coral reefs/ });
    expect(within(screen.getByRole('listbox')).getByRole('group', { name: 'New idea' })).toContainElement(option);
    // The last option: ArrowUp from the first wraps to it.
    await user.keyboard('{ArrowUp}');
    expect(activeOption(input)).toBe(option);
    await user.keyboard('{Enter}');
    expect(where()).toBe('/discover?a=tidal%20energy%20%26%20coral%20reefs');
  });

  it('runs actions: switch the language and cycle the theme', async () => {
    const { user, input } = renderPalette();
    await user.type(input, 'theme');
    await user.click(screen.getByRole('option', { name: /^Switch to the dark theme/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.clear(input);
    await user.type(input, 'turkish');
    await user.click(screen.getByRole('option', { name: /^Switch to Turkish/ }));
    expect(document.documentElement.lang).toBe('tr');
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Bölüm, eylem ve fikir arayın');
    expect(screen.getByRole('dialog', { name: 'Hızlı arama' })).toBeInTheDocument();
  });

  it('Escape closes it', async () => {
    const { user, onClose } = renderPalette();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog', async () => {
    const { user, input } = renderPalette();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('speaks Turkish and matches without Turkish letters', async () => {
    const { user, input } = renderPalette('tr');
    expect(input).toHaveAttribute('placeholder', 'Arayın ya da yeni fikir için bir konu yazın…');
    expect(screen.getByRole('group', { name: 'Git' })).toBeInTheDocument();
    await user.type(input, 'makaleler');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[0]).toHaveAccessibleName(/^Makaleler/);
    await user.clear(input);
    await user.type(input, 'karsilastir');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[0]).toHaveAccessibleName(/^Karşılaştır/);
    expect(screen.getByRole('option', { name: /^Yeni fikir: karsilastir/ })).toBeInTheDocument();
  });
});

describe('command palette in the app shell', () => {
  it('opens with Ctrl+K, closes with Escape and gives focus back', async () => {
    const { user } = renderApp();
    const button = screen.getByRole('button', { name: /^Quick search/ });
    button.focus();
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Quick search' });
    expect(within(dialog).getByRole('combobox')).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quick search' })).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it('opens from the header button and navigates on Enter', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: /^Quick search/ }));
    await user.type(await screen.findByRole('combobox'), 'spot the risk');
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog', { name: 'Quick search' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: /^Sentence 1 of/ })).toBeInTheDocument();
  });

  it('opens with "/" but never while typing in a text field', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: /^Connection settings/ }));
    const field = screen.getByLabelText('API key');
    await user.type(field, 'a/b');
    expect(field).toHaveValue('a/b');
    expect(screen.queryByRole('dialog', { name: 'Quick search' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.keyboard('/');
    expect(await screen.findByRole('dialog', { name: 'Quick search' })).toBeInTheDocument();
  });
});

describe('palette helpers', () => {
  it('folds case and Turkish letters', () => {
    expect(fold('KEŞFET İncele Işık')).toBe('kesfet incele isik');
  });

  it('scores label prefixes above words, words above loose letters, and rejects scattered matches on long text', () => {
    const prefix = matchScore('exp', 'Explore statistics');
    const word = matchScore('stat', 'Explore statistics');
    const loose = matchScore('xpst', 'Explore statistics');
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(loose);
    expect(loose).toBeGreaterThan(0);
    expect(matchScore('zzz', 'Explore statistics')).toBe(0);
    expect(matchScore('gnn', 'A1 · a very long discovery label about large language models and graphs')).toBe(0);
    expect(matchScore('', 'anything')).toBeGreaterThan(0);
  });

  it('builds the Discover prefill link with encoded topics', () => {
    expect(discoverPath({ topicA: 'a & b', topicB: 'c/d?', topK: 8 })).toBe('/discover?a=a%20%26%20b&b=c%2Fd%3F&k=8');
    expect(discoverPath({ topicA: '  only a  ' })).toBe('/discover?a=only%20a');
  });
});
