import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useApi } from '../api/context';
import type { LibrainApi } from '../api/types';
import { usePublicDemo } from '../public/context';
import { LibrainLogo } from './brand/LibrainLogo';
import { Icon } from './Icon';
import { ProviderKeysMenu } from './ProviderKeysMenu';
import { SettingsMenu } from './SettingsMenu';
import styles from './AppShell.module.css';

const NAV = [
  { to: '/library', label: 'Library' },
  { to: '/ask', label: 'Ask' },
  { to: '/discover', label: 'Discover' },
  { to: '/explore', label: 'Explore' },
  { to: '/compare', label: 'Compare' },
  { to: '/history', label: 'History' },
] as const;

const REPO_URL = 'https://github.com/erennmutlu1/librain';

/** Footer links: where the code, the paper and the write-up live. All open in a new tab, so a run in progress survives. */
const PROJECT_LINKS = [
  { href: REPO_URL, label: 'Source code on GitHub' },
  { href: 'https://doi.org/10.5281/zenodo.20745782', label: 'Companion paper (Zenodo)' },
  { href: `${REPO_URL}/blob/main/docs/LIBRAIN-discoveries-explained.pdf`, label: 'Discoveries explained (PDF)' },
  { href: 'https://erenmutlu.me', label: 'erenmutlu.me' },
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

type Health = 'checking' | 'up' | 'down';

/** GET /health for the live client; the mock client is never checked. */
function useHealth(api: LibrainApi): Health {
  const [state, setState] = useState<Health>('checking');

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

  return state;
}

function ApiStatus() {
  const api = useApi();
  const state = useHealth(api);

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

const HEALTH_LABEL: Record<Health, string> = { checking: 'checking the API', up: 'API connected', down: 'API unreachable' };

/**
 * Public build: which data the screens show. Recorded replays real runs from
 * the repository; Live calls the API with the visitor's own keys.
 */
function ModeSwitch() {
  const demo = usePublicDemo();
  const api = useApi();
  const health = useHealth(api);
  if (!demo) return null;
  const live = demo.mode === 'live';
  return (
    <div className={styles.modeSwitch} role="group" aria-label="Data source">
      <button
        type="button"
        className={styles.mode}
        data-mode="recorded"
        aria-pressed={!live}
        onClick={() => demo.switchTo('recorded')}
        title="Real runs recorded in the repository. No keys, nothing billed."
      >
        Recorded
      </button>
      <button
        type="button"
        className={styles.mode}
        data-mode="live"
        aria-pressed={live}
        onClick={() => demo.switchTo('live')}
        title={live ? `Live: ${HEALTH_LABEL[health]}` : 'Run your own inputs on the API with your own keys, billed to your accounts.'}
      >
        {live ? <span className={styles.dot} data-tone={health} aria-hidden="true" /> : null}
        Live
        {live ? <span className="visually-hidden"> ({HEALTH_LABEL[health]})</span> : null}
      </button>
    </div>
  );
}

function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} className={className} target="_blank" rel="noreferrer">
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

function SiteFooter({ publicBuild }: { publicBuild: boolean }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.about}>
          <LibrainLogo variant="wordmark" height={20} />
          <p className={styles.aboutLine}>Ask questions of a paper corpus and audit every generated hypothesis, sentence by sentence.</p>
          {publicBuild ? (
            <p className={styles.aboutNote}>The recorded runs are real outputs from the repository’s experiments folder.</p>
          ) : null}
        </div>
        <ul role="list" className={styles.links} aria-label="Project links">
          {PROJECT_LINKS.map((link) => (
            <li key={link.href}>
              <ExternalLink href={link.href} className={styles.footerLink}>
                {link.label}
                <Icon name="external" size={12} />
              </ExternalLink>
            </li>
          ))}
        </ul>
        <p className={styles.legal}>
          Open source under the{' '}
          <ExternalLink href={`${REPO_URL}/blob/main/LICENSE`}>MIT licence</ExternalLink>, provided as is.
        </p>
      </div>
    </footer>
  );
}

export function AppShell() {
  const location = useLocation();
  const demo = usePublicDemo();

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
        <div className={styles.headerInner} data-public={demo ? '' : undefined}>
          <NavLink to="/discover" className={styles.home} aria-label="LIBRAIN home">
            <LibrainLogo variant="wordmark" height={28} decorative />
          </NavLink>
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
          <div className={styles.tools}>
            {demo ? <ModeSwitch /> : <ApiStatus />}
            {demo ? <ProviderKeysMenu /> : <SettingsMenu />}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={styles.main}>
        {/* Always mounted, so screen readers announce the text when it appears. */}
        {demo ? (
          <div className={styles.wake} role="status">
            {demo.waking ? (
              <p className="notice notice-info">
                <Icon name="info" />
                <span>Waking up the free server. The first request after a quiet spell can take up to a minute.</span>
              </p>
            ) : null}
          </div>
        ) : null}
        {/* A new key per mode remounts the screen, so it starts clean on the other data source. */}
        <Outlet key={demo?.mode} />
      </main>
      <SiteFooter publicBuild={demo !== null} />
    </div>
  );
}
