/*
 * The interface language: English or Turkish.
 *
 * Contract for every screen and component:
 *   - Strings live next to the code in a sibling `<Name>.i18n.ts` that exports
 *     `{ en: {...}, tr: {...} }` with identical keys (the `tr` object is typed
 *     from `en`, so a missing key is a type error). Functions are fine for
 *     strings with values: `found: (n: number) => \`${n} papers\``.
 *   - In a component: `const t = useT(strings)`, then `t.title`, `t.found(3)`.
 *   - Outside React (error mapping, exporters): `pick(strings)` reads the
 *     current language.
 *   - Numbers and dates: `locale()` gives the BCP 47 tag for Intl.
 *
 * The choice is remembered in localStorage and sets <html lang>. The first
 * visit follows the browser: Turkish if the browser prefers it, else English.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'tr';
export const LANGS: readonly Lang[] = ['en', 'tr'];

/** A pair of string tables; `tr` must mirror `en`. */
export type Strings<T> = { en: T; tr: T };

/** Builds a table so `tr` is checked against `en`'s keys and value types. */
export function strings<T>(table: { en: T; tr: NoInfer<T> }): Strings<T> {
  return table;
}

const STORAGE_KEY = 'librain.lang';

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'tr';
}

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

/** Saved choice, else the browser's preference, else English. */
export function detectLang(): Lang {
  const saved = storedLang();
  if (saved) return saved;
  const prefs = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  for (const p of prefs) {
    const base = (p ?? '').toLowerCase().split('-')[0];
    if (base === 'tr') return 'tr';
    if (base === 'en') return 'en';
  }
  return 'en';
}

// Mirror of the provider's state for code that runs outside React.
let current: Lang | null = null;

export function currentLang(): Lang {
  return (current ??= detectLang());
}

/** Tests only: forget the language, so the next test starts in English (or its own provider's). */
export function resetLang(lang: Lang = 'en') {
  current = lang;
  applyDocumentLang(lang);
}

/** The current language's half of a table, for non-React code. */
export function pick<T>(table: Strings<T>, lang: Lang = currentLang()): T {
  return table[lang];
}

/** BCP 47 locale for Intl number and date formatting. */
export function locale(lang: Lang = currentLang()): string {
  return lang === 'tr' ? 'tr-TR' : 'en-GB';
}

function syncCurrent(lang: Lang): Lang {
  current = lang;
  return lang;
}

function applyDocumentLang(lang: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

// Without a provider (unit tests of single components) everything renders in English.
const LangContext = createContext<LangContextValue>({ lang: 'en', setLang: () => {} });

export function LangProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  // Set the module mirror before the children render, so non-React helpers
  // (format, errors) already speak the provider's language on the first render.
  const [lang, setLangState] = useState<Lang>(() => syncCurrent(initial ?? currentLang()));

  useEffect(() => {
    current = lang;
    applyDocumentLang(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    current = next;
    applyDocumentLang(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
    setLangState(next);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return createElement(LangContext.Provider, { value }, children);
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}

/** The current language's half of a string table. */
export function useT<T>(table: Strings<T>): T {
  return table[useContext(LangContext).lang];
}
