import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { clearProviderKeys, setProviderKeys } from '../api/providerKeys';
import type { DemoMode } from '../public/context';
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
    expect(screen.getByRole('spinbutton', { name: 'Konu başına parça' })).toBeInTheDocument();
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

describe('Discover: errors sit under the field at fault, which takes focus', () => {
  it('a missing Topic A: focus, aria-invalid and the message under it', async () => {
    const { user } = setup('/discover');
    const a = await topicA();
    await user.click(screen.getByRole('button', { name: 'Discover' }));
    expect(a).toHaveFocus();
    expect(a).toHaveAttribute('aria-invalid', 'true');
    expect(a).toHaveAccessibleDescription(/Enter at least Topic A\.$/);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter at least Topic A.');
    // The message lives in Topic A's field group, after its hint.
    expect(a.closest('.field')).toContainElement(screen.getByRole('alert'));
    expect(topicB()).not.toHaveAttribute('aria-invalid');
  });

  it('Topic B repeating Topic A: the message goes under Topic B, which takes focus', async () => {
    const { user } = setup('/discover');
    await user.type(await topicA(), 'same');
    await user.type(topicB(), 'same');
    await user.click(screen.getByRole('button', { name: 'Discover' }));
    expect(topicB()).toHaveFocus();
    expect(topicB()).toHaveAttribute('aria-invalid', 'true');
    expect(topicB()).toHaveAccessibleDescription(/Topic B must differ from Topic A\.$/);
    expect(await topicA()).not.toHaveAttribute('aria-invalid');
  });

  it('a passage count out of range: the stepper is invalid, described by the message, and focused', async () => {
    const { user, runStore } = setup('/discover');
    await user.type(await topicA(), 'drug discovery');
    await user.clear(passages());
    await user.type(passages(), '25');
    // Ctrl+Enter submits before leaving the field would clamp the value.
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(passages()).toHaveFocus();
    expect(passages()).toHaveAttribute('aria-invalid', 'true');
    expect(passages()).toHaveAccessibleDescription('1 to 20 Passages per topic must be a whole number from 1 to 20.');
    expect(await runStore.list()).toHaveLength(0);
  });

  it('a topic over the limit is not cut short: the length message shows under it', async () => {
    const { user } = setup('/discover');
    const a = await topicA();
    await user.click(a);
    await user.paste('x'.repeat(501));
    expect(a).toHaveValue('x'.repeat(501));
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(a).toHaveAccessibleDescription(/Topics can be at most 500 characters\.$/);
    expect(a).toHaveAttribute('aria-invalid', 'true');
  });

  it('gives the examples as hints under the fields, not as placeholders', async () => {
    setup('/discover');
    const a = await topicA();
    expect(a).not.toHaveAttribute('placeholder');
    expect(a).toHaveAccessibleDescription('For example: weather foundation models');
    expect(topicB()).toHaveAccessibleDescription('For example: renewable energy planning');
  });

  it('says it in Turkish', async () => {
    const { user } = setup('/discover', 'tr');
    const a = await screen.findByRole('combobox', { name: 'Konu A' });
    expect(a).toHaveAccessibleDescription('Örneğin: hava durumu temel modelleri');
    await user.click(screen.getByRole('button', { name: 'Keşfet' }));
    expect(a).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('En azından Konu A’yı girin.');
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
    await user.type(a, 'corner kick tactic');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'corner kick tactic generation and player positioning× learned physics simulators with graph networks',
    ]);
    // Only recorded topics: no recent topics or paper titles in this mode.
    expect(screen.queryByRole('group', { name: 'Your recent topics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Papers in the library' })).not.toBeInTheDocument();

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

async function setupPublic(path: string, { lang, mode }: { lang?: 'tr'; mode?: DemoMode } = {}) {
  const history = createPublicHistory({ getStorage: () => window.localStorage });
  const fetchImpl = vi.fn(() => Promise.reject(new Error('no network in this test')));
  const clients = {
    recorded: await loadRecordedClient(history, 0),
    live: createLiveClient(history, { baseUrl: 'https://api.librain.test', fetchImpl }),
    runStore: createPublicRunStore(history),
  };
  const user = userEvent.setup();
  const app = <PublicApp clients={clients} initialPath={path} initialMode={mode} />;
  render(lang ? <LangProvider initial={lang}>{app}</LangProvider> : app);
  return { user, fetchImpl, runStore: clients.runStore };
}

afterEach(() => clearProviderKeys());

describe('New idea: no recording in Recorded mode', () => {
  it('says so quietly while typing, and right under the submit row (focused) on submit', async () => {
    const { user, fetchImpl } = await setupPublic('/discover');
    expect(await screen.findByRole('heading', { level: 1, name: 'New idea' })).toBeInTheDocument();
    const hint = 'No recording for these topics — pick a suggestion, open Ideas, or switch to Live.';
    expect(screen.queryByText(hint)).not.toBeInTheDocument();

    await user.type(await topicA(), 'weather forecasting');
    await user.type(topicB(), 'protein folding');
    expect(topicB()).toHaveValue('protein folding');
    expect(screen.getByText(hint)).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Discover' });
    await user.click(submit);
    const title = await screen.findByText('No recording matches these topics.');
    const notice = title.closest('[role="status"]') as HTMLElement;
    expect(notice).toHaveFocus();
    // Directly under the submit row, not below the list of recorded runs.
    expect(notice.previousElementSibling).toContainElement(submit);
    expect(within(notice).getByRole('button', { name: 'Switch to Live' })).toBeInTheDocument();
    expect(within(notice).getByRole('link', { name: 'Open Ideas' })).toHaveAttribute('href', '/explore');
    // The quiet hint steps back while the notice says it.
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'weather forecasting × protein folding' })).not.toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();

    // A repeated submit focuses it again; changing the topics clears it.
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{Control>}{Enter}{/Control}');
    await user.click(submit);
    expect(screen.getByText('No recording matches these topics.').closest('[role="status"]')).toHaveFocus();
    await user.type(topicB(), ' in cells');
    expect(screen.queryByText('No recording matches these topics.')).not.toBeInTheDocument();
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('shows no hint once the topics match a recording', async () => {
    const { user } = await setupPublic('/discover');
    await user.type(await topicA(), 'corner kick');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(topicB()).toHaveValue('learned physics simulators with graph networks');
    expect(screen.queryByText(/^No recording for these topics/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Recorded mode replays a run only for its exact topics/)).toBeInTheDocument();
  });

  it('says it in Turkish', async () => {
    const { user } = await setupPublic('/discover', { lang: 'tr' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Yeni fikir' })).toBeInTheDocument();
    await user.type(await screen.findByRole('combobox', { name: 'Konu A' }), 'hava tahmini');
    expect(screen.getByText('Bu konular için hazır çalıştırma yok. Bir öneri seçin, Fikirler’i açın ya da Canlı moda geçin.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keşfet' }));
    const notice = screen.getByText('Bu konularla eşleşen hazır çalıştırma yok.').closest('[role="status"]');
    expect(notice).toHaveFocus();
    expect(within(notice as HTMLElement).getByRole('button', { name: 'Canlı moda geç' })).toBeInTheDocument();
    expect(within(notice as HTMLElement).getByRole('link', { name: 'Fikirler’i aç' })).toBeInTheDocument();
  });
});

describe('New idea: the cost before a Live run', () => {
  it('states the cost next to the submit button in Live mode', async () => {
    setProviderKeys({ anthropic: 'sk-ant-test', openai: 'sk-test' }, false);
    await setupPublic('/discover', { mode: 'live' });
    await topicA();
    expect(screen.getByText('About US$0.07 per new idea, billed to your Anthropic and OpenAI accounts.')).toBeInTheDocument();
  });
});
