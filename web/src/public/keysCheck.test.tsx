import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { ANTHROPIC_KEY_HEADER, OPENAI_KEY_HEADER, clearProviderKeys } from '../api/providerKeys';
import { LangProvider } from '../i18n/lang';
import { createPublicHistory, createPublicRunStore } from './browserHistory';
import { checkProviderKeys, createLiveClient, loadRecordedClient, type KeyCheckResult, type PublicClients } from './clients';
import { PublicApp } from './PublicApp';
import { createWakeWatch } from './wakeWatch';

/*
 * "Check my keys": POST /api/keys/check with the filled key headers. The
 * global fetch stays stubbed to fail (test/setup.ts); every call goes through
 * an injected fake.
 */

const BASE = 'https://api.librain.test';
const KEYS = { anthropic: 'sk-ant-visitor-key-123', openai: 'sk-visitor-key-456' };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const result = (anthropic: KeyCheckResult['anthropic'], openai: KeyCheckResult['openai']): KeyCheckResult => ({ anthropic, openai });

type Call = [string, RequestInit];

afterEach(() => {
  clearProviderKeys();
  window.sessionStorage.clear();
});

describe('checkProviderKeys', () => {
  it('posts only the filled key headers to the API base URL, with no body', async () => {
    const fetchImpl = vi.fn(async () => json(200, result({ status: 'valid', detail: null }, { status: 'not_provided', detail: null })));
    const answer = await checkProviderKeys({ anthropic: KEYS.anthropic, openai: null }, { baseUrl: `${BASE}/`, fetchImpl });
    expect(answer).toEqual(result({ status: 'valid', detail: null }, { status: 'not_provided', detail: null }));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as Call;
    expect(url).toBe(`${BASE}/api/keys/check`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ Accept: 'application/json', [ANTHROPIC_KEY_HEADER]: KEYS.anthropic });
    expect(init.headers).not.toHaveProperty(OPENAI_KEY_HEADER);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never echoes a key back, even when a provider message quotes it', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, result({ status: 'invalid', detail: `invalid x-api-key ${KEYS.anthropic}` }, { status: 'valid', detail: null })),
    );
    const answer = await checkProviderKeys(KEYS, { baseUrl: BASE, fetchImpl });
    expect(answer.anthropic).toEqual({ status: 'invalid', detail: 'invalid x-api-key [your key]' });
  });

  it('turns the server’s own limits and failures into ApiErrors', async () => {
    const limited = vi.fn(async () => json(429, { title: 'Too Many Requests', status: 429 }, { 'Retry-After': '30' }));
    await expect(checkProviderKeys(KEYS, { baseUrl: BASE, fetchImpl: limited })).rejects.toMatchObject({ status: 429, retryAfterSeconds: 30 });

    const noKey = vi.fn(async () => json(400, { title: 'no key', status: 400 }));
    await expect(checkProviderKeys(KEYS, { baseUrl: BASE, fetchImpl: noKey })).rejects.toMatchObject({ status: 400 });

    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(checkProviderKeys(KEYS, { baseUrl: BASE, fetchImpl: offline })).rejects.toMatchObject({ kind: 'network' });

    const odd = vi.fn(async () => json(200, { anthropic: { status: 'maybe' } }));
    await expect(checkProviderKeys(KEYS, { baseUrl: BASE, fetchImpl: odd })).rejects.toMatchObject({ kind: 'parse' });
  });

  it('sends nothing when no key is filled', async () => {
    const fetchImpl = vi.fn();
    await expect(checkProviderKeys({ anthropic: '', openai: null }, { baseUrl: BASE, fetchImpl })).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('"Check my keys" in the keys panel', () => {
  async function setup(fetchImpl: ReturnType<typeof vi.fn>, options: { lang?: 'en' | 'tr'; slowAfterMs?: number } = {}) {
    const history = createPublicHistory({ getStorage: () => window.localStorage });
    const wake = createWakeWatch(fetchImpl as unknown as typeof fetch, { healthUrl: `${BASE}/health`, slowAfterMs: options.slowAfterMs ?? 60_000 });
    const clients: PublicClients = {
      recorded: await loadRecordedClient(history, 0),
      live: createLiveClient(history, { baseUrl: BASE, fetchImpl: wake.fetch }),
      runStore: createPublicRunStore(history),
      wake,
      checkKeys: (keys, signal) => checkProviderKeys(keys, { baseUrl: BASE, fetchImpl: wake.fetch, signal }),
    };
    const user = userEvent.setup();
    render(
      <LangProvider initial={options.lang ?? 'en'}>
        <PublicApp clients={clients} initialPath="/explore/stats" />
      </LangProvider>,
    );
    return { user };
  }

  async function openPanel(user: ReturnType<typeof userEvent.setup>, name = /^Your API keys/) {
    await user.click(screen.getByRole('button', { name }));
    return screen.getByRole('dialog');
  }

  it('shows each provider’s answer, says it is free and does not check credit, and never shows the keys', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/api/keys/check')
        ? json(200, result({ status: 'valid', detail: null }, { status: 'invalid', detail: `Incorrect API key provided: ${KEYS.openai}` }))
        : json(404, { title: 'not found' }),
    );
    const { user } = await setup(fetchImpl);
    const panel = await openPanel(user);
    const check = within(panel).getByRole('button', { name: 'Check my keys' });
    expect(check).toBeDisabled();
    expect(check).toHaveAccessibleDescription(/not whether your account has credit/);

    await user.type(within(panel).getByLabelText('Anthropic API key'), KEYS.anthropic);
    await user.type(within(panel).getByLabelText('OpenAI API key'), KEYS.openai);
    await user.click(check);

    const list = await within(panel).findByRole('list', { name: 'Key check' });
    const [anthropic, openai] = within(list).getAllByRole('listitem');
    expect(anthropic).toHaveTextContent('Anthropic: Accepted');
    expect(openai).toHaveTextContent('OpenAI: Rejected');
    expect(openai).toHaveTextContent('Incorrect API key provided: [your key]');
    expect(document.body.textContent).not.toContain(KEYS.openai);
    expect(document.body.textContent).not.toContain(KEYS.anthropic);

    // Checking is not saving.
    expect(window.sessionStorage.getItem('librain.providerKeys.v1')).toBeNull();
    // Editing a key clears the now stale answer.
    await user.type(within(panel).getByLabelText('OpenAI API key'), 'x');
    expect(within(panel).queryByRole('list', { name: 'Key check' })).not.toBeInTheDocument();
  });

  it('reports a key it did not get, a rate-limited provider and one it could not reach', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).not.toHaveProperty(OPENAI_KEY_HEADER);
      return json(200, result({ status: 'rate_limited', detail: 'Too many requests' }, { status: 'not_provided', detail: null }));
    });
    const { user } = await setup(fetchImpl);
    const panel = await openPanel(user);
    await user.type(within(panel).getByLabelText('Anthropic API key'), KEYS.anthropic);
    await user.click(within(panel).getByRole('button', { name: 'Check my keys' }));
    const list = await within(panel).findByRole('list', { name: 'Key check' });
    expect(list).toHaveTextContent('Anthropic: Rate limited, so it may still be valid.');
    expect(list).toHaveTextContent('OpenAI: Not entered');

    fetchImpl.mockImplementation(async () => json(200, result({ status: 'unreachable', detail: null }, { status: 'not_provided', detail: null })));
    await user.click(within(panel).getByRole('button', { name: 'Check my keys' }));
    expect(await within(panel).findByText(/Could not reach the provider/)).toBeInTheDocument();
  });

  it('explains the server’s own rate limit and an unreachable API', async () => {
    const fetchImpl = vi.fn(async () => json(429, { title: 'Too Many Requests', status: 429 }, { 'Retry-After': '20' }));
    const { user } = await setup(fetchImpl);
    const panel = await openPanel(user);
    await user.type(within(panel).getByLabelText('Anthropic API key'), KEYS.anthropic);
    await user.click(within(panel).getByRole('button', { name: 'Check my keys' }));
    expect(await within(panel).findByText('Too many checks. Try again in 20 s.')).toBeInTheDocument();

    fetchImpl.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await user.click(within(panel).getByRole('button', { name: 'Check my keys' }));
    expect(await within(panel).findByText(/Could not reach the LIBRAIN API/)).toBeInTheDocument();
  });

  it('says the free server is waking when the check waits, in Recorded mode too', async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetchImpl = vi.fn((input: RequestInfo | URL) =>
      String(input).endsWith('/api/keys/check')
        ? new Promise<Response>((resolve) => {
            answer = resolve;
          })
        : new Promise<Response>(() => undefined),
    );
    const { user } = await setup(fetchImpl, { slowAfterMs: 20 });
    const panel = await openPanel(user);
    await user.type(within(panel).getByLabelText('Anthropic API key'), KEYS.anthropic);
    await user.click(within(panel).getByRole('button', { name: 'Check my keys' }));
    expect(within(panel).getByRole('button', { name: 'Checking…' })).toHaveAttribute('aria-disabled', 'true');
    expect(await within(panel).findByText(/Waking up the free server/)).toBeInTheDocument();
    // The page-wide notice is for Live mode only.
    expect(screen.getAllByText(/Waking up the free server/)).toHaveLength(1);

    answer(json(200, result({ status: 'valid', detail: null }, { status: 'not_provided', detail: null })));
    expect(await within(panel).findByText(/Accepted/)).toBeInTheDocument();
    expect(within(panel).queryByText(/Waking up the free server/)).not.toBeInTheDocument();
  });

  it('speaks Turkish', async () => {
    const fetchImpl = vi.fn(async () => json(200, result({ status: 'valid', detail: null }, { status: 'invalid', detail: null })));
    const { user } = await setup(fetchImpl, { lang: 'tr' });
    const panel = await openPanel(user, /^API anahtarlarınız/);
    expect(within(panel).getByRole('heading', { name: 'API anahtarlarınız' })).toBeInTheDocument();
    await user.type(within(panel).getByLabelText('Anthropic API anahtarı'), KEYS.anthropic);
    await user.click(within(panel).getByRole('button', { name: 'Anahtarlarımı denetle' }));
    const list = await within(panel).findByRole('list', { name: 'Anahtar denetimi' });
    expect(list).toHaveTextContent('Anthropic: Kabul edildi');
    expect(list).toHaveTextContent('OpenAI: Reddedildi');
    expect(within(panel).getByText(/kredi olup olmadığını değil/)).toBeInTheDocument();
  });
});
