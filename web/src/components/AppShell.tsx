import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useApi } from '../api/context';
import { Icon } from './Icon';
import { SettingsMenu } from './SettingsMenu';
import styles from './AppShell.module.css';

const NAV = [
  { to: '/library', label: 'Library' },
  { to: '/ask', label: 'Ask' },
  { to: '/discover', label: 'Discover' },
  { to: '/compare', label: 'Compare' },
  { to: '/history', label: 'History' },
] as const;

type Theme = 'system' | 'light' | 'dark';
const THEME_KEY = 'librain.theme';

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme still applies for this visit.
  }
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const label: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };
  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={() => {
        const t = next[theme];
        setTheme(t);
        applyTheme(t);
      }}
      aria-label={`${label[theme]}. Switch to ${label[next[theme]].toLowerCase()}`}
      title={label[theme]}
    >
      <Icon name={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'auto'} />
    </button>
  );
}

function ApiStatus() {
  const api = useApi();
  const [state, setState] = useState<'checking' | 'up' | 'down'>('checking');

  useEffect(() => {
    if (api.mode === 'mock') return;
    const controller = new AbortController();
    api
      .health(controller.signal)
      .then(() => setState('up'))
      .catch(() => {
        if (!controller.signal.aborted) setState('down');
      });
    return () => controller.abort();
  }, [api]);

  if (api.mode === 'mock') {
    return (
      <span className={styles.status} data-tone="mock" title="Responses are recorded runs from the repository's experiments folder. Set VITE_USE_MOCKS=false to call the API.">
        <span className={styles.dot} aria-hidden="true" />
        Mock data
        <span className="visually-hidden">: responses are recorded runs, the API is not called</span>
      </span>
    );
  }
  return (
    <span className={styles.status} data-tone={state} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {state === 'checking' ? 'Checking API' : state === 'up' ? 'API connected' : 'API unreachable'}
    </span>
  );
}

export function AppShell() {
  const location = useLocation();

  // Move focus to the main region on navigation so keyboard and screen-reader
  // users start at the new page, not the old link.
  useEffect(() => {
    const main = document.getElementById('main');
    if (main && document.activeElement && document.activeElement !== document.body) main.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className={styles.app}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <NavLink to="/discover" className={styles.wordmark} aria-label="LIBRAIN home">
              <span className={styles.glyph} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              LIBRAIN
            </NavLink>
            <p className={styles.tagline}>
              Ask questions of a paper corpus and audit every generated hypothesis, sentence by sentence.
            </p>
          </div>
          <div className={styles.tools}>
            <ApiStatus />
            <SettingsMenu />
            <ThemeToggle />
          </div>
          <nav className={styles.nav} aria-label="Sections">
            <ul role="list">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
