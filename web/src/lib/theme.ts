import { useSyncExternalStore } from 'react';

/*
 * The colour theme: light by default, dark when the visitor picks it (the
 * choice is remembered). The OS preference is deliberately not followed: the
 * light theme is the designed default. <html data-theme="dark"> is the source
 * of truth (index.html sets it from storage before first paint), so the header
 * toggle and the command palette always agree on the current theme.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'librain.theme';

/** The order the toggle steps through. */
export const NEXT_THEME: Record<Theme, Theme> = { light: 'dark', dark: 'light' };

const listeners = new Set<() => void>();

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  // The browser chrome (mobile address bar) follows the page background.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0e0f11' : '#ffffff');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
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
  return useSyncExternalStore(subscribe, getTheme, () => 'light' as Theme);
}
