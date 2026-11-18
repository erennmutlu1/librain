/*
 * The optional API key (server setting Security:ApiKey), kept in localStorage.
 * Every storage access is wrapped: when storage is unavailable the key lives
 * in memory for this tab only. A 401 from the API calls requestApiKey(), which
 * the header's Settings popover listens for.
 */

const KEY = 'librain.apiKey';
let memoryKey: string | null = null;
const changeListeners = new Set<() => void>();
const requestListeners = new Set<(reason: string) => void>();

export function getApiKey(): string | null {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored !== null) return stored;
  } catch {
    // fall through to memory
  }
  return memoryKey;
}

/** Saves (or with null/empty, clears) the key. Returns false if it could only be kept in memory. */
export function setApiKey(value: string | null): boolean {
  const key = value?.trim() ? value.trim() : null;
  memoryKey = key;
  let persisted = true;
  try {
    if (key === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, key);
  } catch {
    persisted = false;
  }
  changeListeners.forEach((l) => l());
  return persisted;
}

export function onApiKeyChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/** Asks the UI to open the API-key setting (called on 401). */
export function requestApiKey(reason: string): void {
  requestListeners.forEach((l) => l(reason));
}

export function onApiKeyRequest(listener: (reason: string) => void): () => void {
  requestListeners.add(listener);
  return () => requestListeners.delete(listener);
}
