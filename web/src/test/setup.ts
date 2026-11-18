import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetBookmarks } from '../explore/bookmarks';
import { resetLang } from '../i18n/lang';
import { resetSessionStore } from '../lib/sessionStore';

// findBy*/waitFor give up after 1 s by default. Lazy-loaded pages can take longer
// when the whole suite runs in parallel, which made page-level tests flaky.
configure({ asyncUtilTimeout: 5000 });

// Fail loudly if anything tries to reach the network during tests.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('Network access is disabled in tests; inject fetchImpl instead.'))),
  );
  // jsdom does not implement scrolling.
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  // A Turkish render must not leak into the next test's non-React helpers.
  resetLang();
  resetSessionStore();
  resetBookmarks();
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
});
