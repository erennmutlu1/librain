import { useCallback, useSyncExternalStore } from 'react';

/*
 * Saved discoveries, kept in localStorage. Every storage access is guarded:
 * when storage is blocked or throws (private mode, a full quota, a sandboxed
 * frame), bookmarks keep working in memory for the visit.
 */

export const BOOKMARKS_KEY = 'librain.explore.saved';

type Listener = () => void;

let memory: string[] | null = null;
let persistent = true;
const listeners = new Set<Listener>();
const EMPTY: ReadonlySet<string> = new Set();
let snapshot: ReadonlySet<string> = EMPTY;

function readStorage(): string[] {
  try {
    const raw = window.localStorage.getItem(BOOKMARKS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    persistent = true;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    persistent = false;
    return [];
  }
}

function current(): string[] {
  memory ??= readStorage();
  return memory;
}

function write(ids: string[]) {
  memory = ids;
  snapshot = new Set(ids);
  try {
    window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids));
    persistent = true;
  } catch {
    persistent = false;
  }
  for (const l of listeners) l();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ReadonlySet<string> {
  const ids = current();
  if (snapshot.size !== ids.length || ids.some((id) => !snapshot.has(id))) snapshot = new Set(ids);
  return snapshot;
}

export function isBookmarked(id: string): boolean {
  return current().includes(id);
}

export function toggleBookmark(id: string): boolean {
  const ids = current();
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  write(next);
  return next.includes(id);
}

/** Whether bookmarks are being saved to storage (false: memory only, for this visit). */
export function bookmarksPersistent(): boolean {
  current();
  return persistent;
}

/** Tests: forget the in-memory copy so the next read goes to storage again. */
export function resetBookmarks() {
  memory = null;
  snapshot = EMPTY;
  persistent = true;
}

export function useBookmarks() {
  const saved = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const toggle = useCallback((id: string) => toggleBookmark(id), []);
  return { saved, toggle, persistent: bookmarksPersistent() };
}
