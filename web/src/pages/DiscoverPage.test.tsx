import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { createLocalRunStore } from '../history/localRunStore';
import { LangProvider } from '../i18n/lang';
import { createPublicHistory, createPublicRunStore } from '../public/browserHistory';
import { createLiveClient, loadRecordedClient } from '../public/clients';
import { PublicApp } from '../public/PublicApp';

/*
 * The Discover form's flows: a /discover?a=&b=&k= link fills it (and never
 * runs it), the bridge swaps the topics, Ctrl/⌘+Enter submits from any
 * field, and in the public Recorded mode a suggested topic brings its
 * recorded partner.
 */

function setup(path: string, lang?: 'tr') {
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  const user = userEvent.setup();
  const app = <App api={createMockApi({ latency: 0 })} runStore={runStore} initialPath={path} />;
  render(lang ? <LangProvider initial={lang}>{app}</LangProvider> : app);
  return { user, runStore };
}

const topicA = () => screen.findByRole('combobox', { name: 'Topic A' });
const topicB = () => screen.getByRole('combobox', { name: /Topic B/ });
const passages = () => screen.getByRole('spinbutton', { name: 'Passages per topic' });

describe('Discover: prefill from the URL', () => {
  it('fills topics and top-K from ?a=&b=&k=, says so, and runs nothing', async () => {
    const { user, runStore } = setup('/discover?a=graph%20neural%20networks&b=epidemic%20spread%20modeling&k=7');
    expect(await topicA()).toHaveValue('graph neural networks');
    expect(topicB()).toHaveValue('epidemic spread modeling');
    expect(passages()).toHaveValue('7');
    expect(screen.getByText('Filled in from the link. Nothing runs until you press Discover.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'graph neural networks × epidemic spread modeling' })).not.toBeInTheDocument();
    expect(await runStore.list()).toHaveLength(0);

    // What the visitor types afterwards stays: the link is applied once.
    await user.type(topicB(), ' in cities');
    expect(topicB()).toHaveValue('epidemic spread modeling in cities');
  });

  it('a link with Topic A alone clears Topic B, and an out-of-range k is ignored', async () => {
    setup('/discover?a=protein%20folding&k=99');
    expect(await topicA()).toHaveValue('protein folding');
    expect(topicB()).toHaveValue('');
    expect(passages()).toHaveValue('5');
  });

  it('shows the notice in Turkish', async () => {
    setup('/discover?a=protein%20folding', 'tr');
    expect(await screen.findByRole('combobox', { name: 'Konu A' })).toHaveValue('protein folding');
    expect(screen.getByText('Bağlantıdaki değerlerle dolduruldu. Keşfet’e basana kadar hiçbir şey çalışmaz.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Konuların yerini değiştir' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Konu başına pasaj' })).toBeInTheDocument();
  });
});

describe('Discover: faster flows', () => {
  it('swaps the topics with the bridge button', async () => {
    const { user } = setup('/discover');
    await user.type(await topicA(), 'drug discovery');
    await user.type(topicB(), 'climate adaptation');
    await user.click(screen.getByRole('button', { name: 'Swap topics' }));
    expect(await topicA()).toHaveValue('climate adaptation');
    expect(topicB()).toHaveValue('drug discovery');
  });

  it('submits with Ctrl+Enter from any field, through the same validation', async () => {
    const { user, runStore } = setup('/discover');
    await user.type(await topicA(), 'same');
    await user.type(topicB(), 'same');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(screen.getByRole('alert')).toHaveTextContent('Topic B must differ from Topic A.');

    await user.clear(await topicA());
    await user.type(await topicA(), 'drug discovery');
    await user.clear(topicB());
    await user.type(topicB(), 'climate adaptation');
    await user.click(passages());
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(await screen.findByRole('heading', { name: 'drug discovery × climate adaptation' })).toBeInTheDocument();
    expect(await runStore.list()).toHaveLength(1);
  });

  it('suggests recent topics on the next visit', async () => {
    const { user } = setup('/discover');
    await user.type(await topicA(), 'drug discovery');
    await user.type(topicB(), 'climate adaptation');
    await user.click(screen.getByRole('button', { name: 'Discover' }));
    await screen.findByRole('heading', { name: 'drug discovery × climate adaptation' });

    await user.clear(await topicA());
    await user.click(await topicA());
    const recent = screen.getByRole('group', { name: 'Your recent topics' });
    expect(within(recent).getByRole('option', { name: 'drug discovery' })).toBeInTheDocument();
  });
});

describe('Discover: Recorded mode (public build)', () => {
  it('offers only recorded topics, fills the recorded partner, and the run replays', async () => {
    const history = createPublicHistory({ getStorage: () => window.localStorage });
    const fetchImpl = vi.fn(() => Promise.reject(new Error('no network in Recorded mode')));
    const clients = {
      recorded: await loadRecordedClient(history, 0),
      live: createLiveClient(history, { baseUrl: 'https://api.librain.test', fetchImpl }),
      runStore: createPublicRunStore(history),
    };
    const user = userEvent.setup();
    render(<PublicApp clients={clients} initialPath="/discover" />);

    const a = await topicA();
    await user.type(a, 'corner kick');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'corner kick tactic generation and player positioning× learned physics simulators with graph networks',
    ]);
    // Only recorded topics: no recent topics or paper titles in this mode.
    expect(screen.queryByRole('group', { name: 'Your recent topics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Papers in the corpus' })).not.toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(a).toHaveValue('corner kick tactic generation and player positioning');
    expect(topicB()).toHaveValue('learned physics simulators with graph networks');

    // Topic B now offers exactly the recorded partner.
    await user.click(screen.getByRole('button', { name: 'Show suggestions for Topic B' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['learned physics simulators with graph networks']);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Discover' }));
    expect(
      await screen.findByRole('heading', { name: 'corner kick tactic generation and player positioning × learned physics simulators with graph networks' }),
    ).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
