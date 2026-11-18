import { useSyncExternalStore } from 'react';

/*
 * The colour theme: follow the system, or a fixed light or dark choice.
 * <html data-theme> is the source of truth (index.html sets it from storage
 * before first paint), so the header toggle and the command palette always
 * agree on the current theme.
 */

export type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'librain.theme';

/** The order the toggle steps through. */
export const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

const listeners = new Set<() => void>();

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'system';
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function setTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this visit.
  }
  listeners.forEach((l) => l());
}

export function cycleTheme(): Theme {
  const next = NEXT_THEME[getTheme()];
  setTheme(next);
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => 'system' as Theme);
}
