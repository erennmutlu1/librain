/*
 * The visitor's own Anthropic and OpenAI keys (public build, Live mode only).
 *
 * By default they live in sessionStorage, so they go away with the tab; the
 * "Remember on this device" choice moves them to localStorage instead. Only
 * one of the two ever holds them, so unticking "remember" really forgets them
 * on this device. Every storage access is wrapped: when storage is blocked the
 * keys live in memory for this tab.
 *
 * Nothing here logs the keys or puts them in a URL. The live client reads them
 * per request (providerKeyHeaders) and sends them only to the LIBRAIN API.
 */

export interface ProviderKeys {
  anthropic: string | null;
  openai: string | null;
}

/** The headers the public API reads the visitor's keys from. */
export const ANTHROPIC_KEY_HEADER = 'X-Anthropic-Key';
export const OPENAI_KEY_HEADER = 'X-OpenAI-Key';

const STORAGE_KEY = 'librain.providerKeys.v1';
const EMPTY: ProviderKeys = { anthropic: null, openai: null };

let memory: ProviderKeys = EMPTY;
const changeListeners = new Set<() => void>();
const requestListeners = new Set<(request: ProviderKeysRequest) => void>();

type Area = 'session' | 'local';

function storage(area: Area): Storage {
  return area === 'session' ? window.sessionStorage : window.localStorage;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function read(area: Area): ProviderKeys | null {
  try {
    const raw = storage(area).getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<Record<keyof ProviderKeys, unknown>> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      anthropic: typeof parsed.anthropic === 'string' ? clean(parsed.anthropic) : null,
      openai: typeof parsed.openai === 'string' ? clean(parsed.openai) : null,
    };
  } catch {
    return null;
  }
}

function remove(area: Area): void {
  try {
    storage(area).removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored there, or storage is blocked: either way nothing to forget.
  }
}

export function getProviderKeys(): ProviderKeys {
  return read('session') ?? read('local') ?? memory;
}

export function hasBothProviderKeys(keys: ProviderKeys = getProviderKeys()): boolean {
  return Boolean(keys.anthropic && keys.openai);
}

/** True when the keys are kept in localStorage ("Remember on this device"). */
export function rememberingProviderKeys(): boolean {
  return read('local') !== null;
}

/**
 * Saves the keys in sessionStorage, or in localStorage when `remember` is on,
 * and removes them from the other. Returns false when they could only be kept
 * in memory for this tab.
 */
export function setProviderKeys(keys: ProviderKeys, remember: boolean): boolean {
  const next: ProviderKeys = { anthropic: clean(keys.anthropic), openai: clean(keys.openai) };
  if (!next.anthropic && !next.openai) {
    clearProviderKeys();
    return true;
  }
  memory = next;
  const target: Area = remember ? 'local' : 'session';
  remove(remember ? 'session' : 'local');
  let persisted = true;
  try {
    storage(target).setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    persisted = false;
  }
  changeListeners.forEach((l) => l());
  return persisted;
}

export function clearProviderKeys(): void {
  memory = EMPTY;
  remove('session');
  remove('local');
  changeListeners.forEach((l) => l());
}

/** Headers for one live request to the LIBRAIN API; empty when no key is set. */
export function providerKeyHeaders(keys: ProviderKeys = getProviderKeys()): Record<string, string> {
  const headers: Record<string, string> = {};
  if (keys.anthropic) headers[ANTHROPIC_KEY_HEADER] = keys.anthropic;
  if (keys.openai) headers[OPENAI_KEY_HEADER] = keys.openai;
  return headers;
}

export function onProviderKeysChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export interface ProviderKeysRequest {
  reason: string;
  /** Switch to Live mode once both keys are saved (the visitor asked for Live). */
  goLive?: boolean;
}

/** Asks the UI to open the keys panel (a 401 "provider keys required", or Live without keys). */
export function requestProviderKeys(request: ProviderKeysRequest): void {
  requestListeners.forEach((l) => l(request));
}

export function onProviderKeysRequest(listener: (request: ProviderKeysRequest) => void): () => void {
  requestListeners.add(listener);
  return () => requestListeners.delete(listener);
}
