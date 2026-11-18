import { useCallback, useEffect, useState } from 'react';
import { useLang, type Lang } from '../i18n/lang';
import type { FeaturedRun } from './runs';

export type FeaturedState =
  | { status: 'loading' }
  | { status: 'ready'; runs: FeaturedRun[] }
  | { status: 'error'; error: unknown };

const pending: Partial<Record<Lang, Promise<FeaturedRun[]>>> = {};
const loaded: Partial<Record<Lang, FeaturedRun[]>> = {};

/**
 * Loads the bundled featured runs once per page and language: English is the
 * recorded text, Turkish lays the translations over it (runsTr.ts). This
 * fetches a static chunk of the app, never the API; a failed load (say, a
 * deploy replaced the chunk) can be retried.
 */
export function loadFeaturedRuns(lang: Lang = 'en'): Promise<FeaturedRun[]> {
  pending[lang] ??= (lang === 'tr' ? import('./runsTr').then((m) => m.featuredRunsTr) : import('./runs').then((m) => m.featuredRuns)).then(
    (runs) => (loaded[lang] = runs),
    (error: unknown) => {
      delete pending[lang];
      throw error;
    },
  );
  return pending[lang];
}

export function useFeaturedRuns(): { state: FeaturedState; retry: () => void } {
  const { lang } = useLang();
  const [state, setState] = useState<FeaturedState>(() => {
    const runs = loaded[lang];
    return runs ? { status: 'ready', runs } : { status: 'loading' };
  });
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState(lang);

  // Switching language: show the other runs at once if they are loaded, else load them.
  if (shown !== lang) {
    setShown(lang);
    const runs = loaded[lang];
    setState(runs ? { status: 'ready', runs } : { status: 'loading' });
  }

  useEffect(() => {
    if (loaded[lang]) return;
    let live = true;
    loadFeaturedRuns(lang).then(
      (runs) => live && setState({ status: 'ready', runs }),
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
