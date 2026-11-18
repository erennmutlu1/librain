import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANTHROPIC_KEY_HEADER, OPENAI_KEY_HEADER, clearProviderKeys, setProviderKeys } from '../api/providerKeys';
import { PUBLIC_CORPUS_NOTE } from '../pages/LibraryPage';
import { contract } from '../mocks/scenarios';
import { createPublicHistory, createPublicRunStore } from './browserHistory';
import { createLiveClient, createPublicClients, loadRecordedClient } from './clients';
import type { DemoMode } from './context';
import { PublicApp } from './PublicApp';
import { SLOW_AFTER_MS, createWakeWatch } from './wakeWatch';

/*
 * The public build (VITE_PUBLIC_DEMO=true) rendered as main.tsx renders it,
 * with the live client pointed at a fake server. The global fetch stays
 * stubbed to throw (test/setup.ts), so any request that bypassed the
 * injected client would fail the test.
 */

const BASE = 'https://api.librain.test';
const KEYS = { anthropic: 'sk-ant-visitor-key', openai: 'sk-visitor-key' };
const F4 = 'F4 · corner kick tactic generation and player positioning × learned physics simulators with graph networks';
const F4_TITLE = 'corner kick tactic generation and player positioning × learned physics simulators with graph networks';

type Handler = (init: RequestInit) => Response | Promise<Response>;

function sse(text: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function problem(status: number, title: string, detail?: string): Response {
  return new Response(JSON.stringify({ title, detail, status }), { status, headers: { 'Content-Type': 'application/problem+json' } });
}

/** A fake LIBRAIN API at BASE: `"METHOD /path"` -> handler. Anything else is a 404. */
function fakeServer(routes: Record<string, Handler> = {}) {
  const all: Record<string, Handler> = {
    'GET /health': () => new Response('{"status":"ok"}', { status: 200 }),
    'GET /api/papers': () => new Response(JSON.stringify(contract.papers), { status: 200 }),
    'POST /api/discover/stream': () => sse(contract.discoverStream),
    ...routes,
  };
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
    const handler = all[`${init.method ?? 'GET'} ${path}`];
    return handler ? handler(init) : problem(404, 'not found');
  });
}

type Call = [string, RequestInit];

async function setup({ path = '/discover', mode = 'recorded', fetchImpl = fakeServer() }: { path?: string; mode?: DemoMode; fetchImpl?: ReturnType<typeof fakeServer> } = {}) {
  const history = createPublicHistory({ getStorage: () => window.localStorage });
  const clients = {
    recorded: await loadRecordedClient(history, 0),
    live: createLiveClient(history, { baseUrl: BASE, fetchImpl }),
    runStore: createPublicRunStore(history),
  };
  const user = userEvent.setup();
  render(<PublicApp clients={clients} initialPath={path} initialMode={mode} />);
  const calls = () => fetchImpl.mock.calls as unknown as Call[];
  return { user, fetchImpl, calls };
}

const modeButton = (name: 'Recorded' | 'Live') =>
  within(screen.getByRole('group', { name: 'Data source' })).getByRole('button', { name: new RegExp(`^${name}`) });

afterEach(() => {
  clearProviderKeys();
  window.sessionStorage.clear();
});

describe('public build: Recorded mode', () => {
  it('renders at once while the recorded runs load, then offers them (as main.tsx starts it)', async () => {
    const fetchImpl = fakeServer();
    const clients = createPublicClients({ baseUrl: BASE, fetchImpl, latency: 0 });
    expect(clients.recorded).toBeInstanceOf(Promise);
    const user = userEvent.setup();
    render(<PublicApp clients={clients} initialPath="/discover" />);
    expect(screen.getByRole('group', { name: 'Data source' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: F4 }));
    expect(await screen.findByRole('heading', { name: F4_TITLE })).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is the default: a recorded run plays with no keys and no network', async () => {
    const { user, fetchImpl } = await setup();
    expect(modeButton('Recorded')).toHaveAttribute('aria-pressed', 'true');
    expect(modeButton('Live')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Mock data')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: F4 }));
    expect(await screen.findByRole('heading', { name: F4_TITLE })).toBeInTheDocument();
    expect(screen.getByText('experiments/new-areas-discoveries/runs/F4.json')).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never substitutes a recording for inputs that match none, and says why', async () => {
    const { user } = await setup();
    await user.type(await screen.findByRole('textbox', { name: 'Topic A' }), 'weather forecasting');
    await user.type(screen.getByRole('textbox', { name: /Topic B/ }), 'protein folding');
    await user.click(screen.getByRole('button', { name: 'Discover' }));

    const notice = await screen.findByText('This is the recorded demo, and no recorded run matches these inputs.');
    expect(notice.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Switch to Live' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Recorded output:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'weather forecasting × protein folding' })).not.toBeInTheDocument();
  });

  it('keeps API snapshots and OpenAI runs out of the pickers, and offers no provider choice', async () => {
    await setup();
    await screen.findByRole('button', { name: F4 });
    expect(screen.queryByRole('button', { name: /API snapshot/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /OpenAI/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drug discovery × climate adaptation' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Model provider' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('offers only the two real Compare pairs', async () => {
    const { user } = await setup({ path: '/compare' });
    const list = (await screen.findByText(/Recorded runs/)).closest('details')!;
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Drug discovery × climate adaptation',
      'Large language models × drug-target interaction prediction',
    ]);
    await user.click(within(list).getAllByRole('button')[0]!);
    expect(await screen.findByText(/pair-10\.json/)).toBeInTheDocument();
  });

  it('explains that Ask has no recorded runs and points to Live', async () => {
    await setup({ path: '/ask' });
    expect(await screen.findByText('Ask has no recorded runs.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Question' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Why does GraphCast forecast well?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to Live' })).toBeInTheDocument();
  });
});

describe('public build: keys and the mode switch', () => {
  it('opens the keys panel when Live is chosen without keys, and goes Live once both are saved (sessionStorage by default)', async () => {
    const { user } = await setup();
    await user.click(modeButton('Live'));

    const panel = await screen.findByRole('dialog', { name: 'Your API keys' });
    expect(within(panel).getByRole('alert')).toHaveTextContent('Live mode runs on your own Anthropic and OpenAI keys');
    expect(modeButton('Recorded')).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel).getByText(/Your keys are sent only with your own requests to the LIBRAIN API/)).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /github.com\/erennmutlu1\/librain/ })).toHaveAttribute('href', 'https://github.com/erennmutlu1/librain');
    expect(within(panel).getByRole('link', { name: /console.anthropic.com/ })).toHaveAttribute('href', expect.stringContaining('console.anthropic.com'));
    expect(within(panel).getByRole('link', { name: /platform.openai.com\/api-keys/ })).toHaveAttribute('href', 'https://platform.openai.com/api-keys');

    const anthropic = within(panel).getByLabelText('Anthropic API key');
    expect(anthropic).toHaveFocus();
    expect(anthropic).toHaveAttribute('type', 'password');
    await user.click(within(panel).getByRole('button', { name: 'Show Anthropic API key' }));
    expect(anthropic).toHaveAttribute('type', 'text');
    await user.click(within(panel).getByRole('button', { name: 'Hide Anthropic API key' }));
    expect(anthropic).toHaveAttribute('type', 'password');
    expect(within(panel).getByRole('checkbox', { name: 'Remember on this device' })).not.toBeChecked();

    await user.type(anthropic, KEYS.anthropic);
    await user.type(within(panel).getByLabelText('OpenAI API key'), KEYS.openai);
    await user.click(within(panel).getByRole('button', { name: 'Save and go Live' }));

    expect(modeButton('Live')).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel).getByRole('status')).toHaveTextContent('Live mode is on.');
    expect(JSON.parse(window.sessionStorage.getItem('librain.providerKeys.v1')!)).toEqual(KEYS);
    expect(window.localStorage.getItem('librain.providerKeys.v1')).toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Your API keys/ })).toHaveFocus();
  });

  it('keeps the keys in localStorage only when "Remember on this device" is ticked', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Your API keys' }));
    const panel = screen.getByRole('dialog', { name: 'Your API keys' });
    await user.type(within(panel).getByLabelText('Anthropic API key'), KEYS.anthropic);
    await user.type(within(panel).getByLabelText('OpenAI API key'), KEYS.openai);
    await user.click(within(panel).getByRole('checkbox', { name: 'Remember on this device' }));
    await user.click(within(panel).getByRole('button', { name: 'Save keys' }));

    expect(JSON.parse(window.localStorage.getItem('librain.providerKeys.v1')!)).toEqual(KEYS);
    expect(window.sessionStorage.getItem('librain.providerKeys.v1')).toBeNull();
    expect(within(panel).getByRole('status')).toHaveTextContent('Saved on this device until you clear them. Switch to Live to use them.');
    // Saving alone never changes the mode.
    expect(modeButton('Recorded')).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(panel).getByRole('button', { name: 'Clear' }));
    expect(window.localStorage.getItem('librain.providerKeys.v1')).toBeNull();
    expect(within(panel).getByLabelText('Anthropic API key')).toHaveValue('');
  });

  it('sends the keys only in Live mode, only to the API base URL, and clears results when the mode changes', async () => {
    setProviderKeys(KEYS, false);
    const { user, fetchImpl, calls } = await setup();

    await user.click(await screen.findByRole('button', { name: F4 }));
    expect(await screen.findByRole('heading', { name: F4_TITLE })).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();

    await user.click(modeButton('Live'));
    expect(modeButton('Live')).toHaveAttribute('aria-pressed', 'true');
    // The recorded result is gone, the typed topics are not.
    expect(screen.queryByRole('heading', { name: F4_TITLE })).not.toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Topic A' })).toHaveValue('corner kick tactic generation and player positioning');

    await user.click(screen.getByRole('button', { name: 'Discover' }));
    expect(await screen.findByRole('heading', { name: F4_TITLE })).toBeInTheDocument();
    expect(screen.queryByText(/Recorded output:/)).not.toBeInTheDocument();

    const discover = calls().find(([url]) => url.endsWith('/api/discover/stream'))!;
    expect(discover[0]).toBe(`${BASE}/api/discover/stream`);
    expect(discover[1].headers).toMatchObject({ [ANTHROPIC_KEY_HEADER]: KEYS.anthropic, [OPENAI_KEY_HEADER]: KEYS.openai });
    expect(JSON.parse(discover[1].body as string)).toMatchObject({ provider: 'anthropic', topK: 5 });
    expect(JSON.parse(discover[1].body as string)).not.toHaveProperty('model');
    const health = calls().find(([url]) => url.endsWith('/health'))!;
    expect(health[1].headers).not.toHaveProperty(ANTHROPIC_KEY_HEADER);
    for (const [url] of calls()) expect(url.startsWith(`${BASE}/`)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();

    const before = calls().length;
    await user.click(modeButton('Recorded'));
    expect(screen.queryByRole('heading', { name: F4_TITLE })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: F4 }));
    expect(await screen.findByRole('heading', { name: F4_TITLE })).toBeInTheDocument();
    expect(calls()).toHaveLength(before);
  });

  it('opens the keys panel when the API answers 401 "provider keys required"', async () => {
    setProviderKeys(KEYS, false);
    const fetchImpl = fakeServer({
      'POST /api/discover/stream': () => problem(401, 'provider keys required', 'Send X-Anthropic-Key and X-OpenAI-Key.'),
    });
    const { user } = await setup({ mode: 'live', fetchImpl });
    await user.type(await screen.findByRole('textbox', { name: 'Topic A' }), 'graph neural networks');
    await user.click(screen.getByRole('button', { name: 'Discover' }));

    const panel = await screen.findByRole('dialog', { name: 'Your API keys' });
    expect(within(panel).getByRole('alert')).toHaveTextContent('Live mode needs both of your keys.');
    expect(screen.getByText('Live mode needs your own API keys.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter your keys' })).toBeInTheDocument();
  });

  it('shows the provider’s own rejection of a key', async () => {
    setProviderKeys(KEYS, false);
    const fetchImpl = fakeServer({
      'POST /api/discover/stream': () => problem(502, 'Upstream API error', 'Anthropic returned 401: invalid x-api-key'),
    });
    const { user } = await setup({ mode: 'live', fetchImpl });
    await user.type(await screen.findByRole('textbox', { name: 'Topic A' }), 'graph neural networks');
    await user.click(screen.getByRole('button', { name: 'Discover' }));
    expect(await screen.findByText('Anthropic rejected your key: Anthropic returned 401: invalid x-api-key')).toBeInTheDocument();
  });
});

describe('public build: Library and History', () => {
  it('Library hides upload, arXiv and delete in both modes and says the corpus is read-only', async () => {
    setProviderKeys(KEYS, false);
    const { user, calls } = await setup({ path: '/library' });
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText(PUBLIC_CORPUS_NOTE)).toBeInTheDocument();
    expect(PUBLIC_CORPUS_NOTE).toBe('The public corpus is read-only: 55 papers, 2,210 chunks.');
    expect(screen.queryByRole('textbox', { name: 'arXiv id or link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ingest' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Choose a PDF|Drop a PDF/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();

    await user.click(modeButton('Live'));
    expect(await screen.findByText('Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks')).toBeInTheDocument();
    expect(screen.getByText(PUBLIC_CORPUS_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ingest' })).not.toBeInTheDocument();
    const papers = calls().find(([url]) => url === `${BASE}/api/papers`)!;
    expect(papers[1].headers).not.toHaveProperty(OPENAI_KEY_HEADER);
  });

  it('History lists live runs from this browser only, in both modes, and never calls /api/runs', async () => {
    setProviderKeys(KEYS, false);
    const { user, calls } = await setup({ mode: 'live' });
    await user.type(await screen.findByRole('textbox', { name: 'Topic A' }), 'weather forecasting');
    await user.type(screen.getByRole('textbox', { name: /Topic B/ }), 'protein folding');
    await user.click(screen.getByRole('button', { name: 'Discover' }));
    await screen.findByRole('heading', { name: 'weather forecasting × protein folding' });

    await user.click(screen.getByRole('link', { name: 'History' }));
    expect(await screen.findByRole('link', { name: /weather forecasting × protein folding/ })).toBeInTheDocument();
    expect(screen.getByText(/History is kept only in this browser/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load the recorded runs' })).not.toBeInTheDocument();

    await user.click(modeButton('Recorded'));
    expect(await screen.findByRole('link', { name: /weather forecasting × protein folding/ })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /weather forecasting × protein folding/ }));
    expect(await screen.findByRole('heading', { name: 'weather forecasting × protein folding' })).toBeInTheDocument();

    expect(calls().some(([url]) => url.includes('/api/runs'))).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('librain.public.runs.v1')!)).toHaveLength(1);
  });

  it('History in Recorded mode never shows the API snapshot’s runs', async () => {
    await setup({ path: '/history' });
    expect(await screen.findByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load the recorded runs' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: /Why does GraphCast forecast well/ })).not.toBeInTheDocument());
  });
});

describe('public build: the free server waking up', () => {
  it('shows a calm notice when a live request waits 4 s, and clears it when the API answers', async () => {
    setProviderKeys(KEYS, false);
    // The asleep host: every request hangs until the test answers it.
    const waiting = new Map<string, ((response: Response) => void)[]>();
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((resolve) => {
          const path = String(input).slice(BASE.length);
          waiting.set(path, [...(waiting.get(path) ?? []), resolve]);
        }),
    );
    const history = createPublicHistory();
    const wake = createWakeWatch(fetchImpl as unknown as typeof fetch, { healthUrl: `${BASE}/health` });
    const clients = {
      recorded: await loadRecordedClient(history, 0),
      live: createLiveClient(history, { baseUrl: BASE, fetchImpl: wake.fetch }),
      runStore: createPublicRunStore(history),
      wake,
    };
    render(<PublicApp clients={clients} initialPath="/library" />);
    expect(await screen.findByRole('table')).toBeInTheDocument();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      act(() => {
        fireEvent.click(modeButton('Live'));
      });
      expect([...waiting.keys()].sort()).toEqual(['/api/papers', '/health']);

      act(() => {
        vi.advanceTimersByTime(SLOW_AFTER_MS - 1);
      });
      expect(screen.queryByText(/Waking up the free server/)).not.toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      const notice = screen.getByText('Waking up the free server. The first request after a quiet spell can take up to a minute.');
      expect(notice.closest('[role="status"]')).not.toBeNull();
      // Waiting is not a failure.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }

    await act(async () => {
      waiting.get('/api/papers')![0]!(new Response(JSON.stringify(contract.papers), { status: 200 }));
    });
    await waitFor(() => expect(screen.queryByText(/Waking up the free server/)).not.toBeInTheDocument());
    expect(await screen.findByText('Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks')).toBeInTheDocument();
  });
});
