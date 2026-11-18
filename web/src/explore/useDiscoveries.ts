import { useCallback, useEffect, useState } from 'react';
import { useLang, type Lang } from '../i18n/lang';
import type { ExploreData } from './model';

export type ExploreState = { status: 'loading' } | { status: 'ready'; data: ExploreData } | { status: 'error'; error: unknown };

const pending: Partial<Record<Lang, Promise<ExploreData>>> = {};
const loaded: Partial<Record<Lang, ExploreData>> = {};

/**
 * Loads the bundled runs once per page and language: English is the recorded
 * text, Turkish lays the translations over it (runsTr.ts). This fetches a
 * static chunk of the app, never the API; a failed load (say, a deploy
 * replaced the chunk) can be retried.
 */
export function loadExploreData(lang: Lang = 'en'): Promise<ExploreData> {
  pending[lang] ??= (lang === 'tr' ? import('./runsTr') : import('./runs')).then(
    (m) => (loaded[lang] = m.exploreData),
    (error: unknown) => {
      delete pending[lang];
      throw error;
    },
  );
  return pending[lang];
}

/**
 * The runs in the interface language, or in `override` (the detail page's
 * "show the original" switch passes 'en').
 */
export function useExploreData(override?: Lang): { state: ExploreState; retry: () => void } {
  const { lang: uiLang } = useLang();
  const lang = override ?? uiLang;
  const [state, setState] = useState<ExploreState>(() => {
    const data = loaded[lang];
    return data ? { status: 'ready', data } : { status: 'loading' };
  });
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState(lang);

  // Switching language: show the other data at once if it is loaded, else load it.
  if (shown !== lang) {
    setShown(lang);
    const data = loaded[lang];
    setState(data ? { status: 'ready', data } : { status: 'loading' });
  }

  useEffect(() => {
    if (loaded[lang]) return;
    let live = true;
    loadExploreData(lang).then(
      (data) => live && setState({ status: 'ready', data }),
      (error: unknown) => live && setState({ status: 'error', error }),
    );
    return () => {
      live = false;
    };
  }, [attempt, lang]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((a) => a + 1);
  }, []);

  return { state, retry };
}
