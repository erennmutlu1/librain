import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useApi } from '../api/context';
import type { LibrainApi } from '../api/types';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { useT } from '../i18n/lang';
import { isApplePlatform, isEditableTarget, isPaletteShortcut, paletteShortcut } from '../lib/shortcut';
import { cycleTheme, useTheme } from '../lib/theme';
import { usePublicDemo } from '../public/context';
import { text } from './AppShell.i18n';
import { LibrainLogo } from './brand/LibrainLogo';
import { Icon } from './Icon';
import { ProviderKeysMenu } from './ProviderKeysMenu';
import { SettingsMenu } from './SettingsMenu';
import styles from './AppShell.module.css';

// Its own chunk: most visits never open it.
const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));

const NAV = [
  { to: '/explore', key: 'explore' },
  { to: '/discover', key: 'discover' },
  { to: '/ask', key: 'ask' },
  { to: '/compare', key: 'compare' },
  { to: '/library', key: 'library' },
  { to: '/history', key: 'history' },
] as const;

const REPO_URL = 'https://github.com/erennmutlu1/librain';

/** Footer links: where the code, the paper and the write-up live. All open in a new tab, so a run in progress survives. */
const PROJECT_LINKS = [
  { href: REPO_URL, key: 'source' },
  { href: 'https://doi.org/10.5281/zenodo.20745782', key: 'paper' },
  { href: `${REPO_URL}/blob/main/docs/LIBRAIN-discoveries-explained.pdf`, key: 'explained' },
  { href: 'https://erenmutlu.me', key: null },
] as const;

function ThemeToggle() {
  const t = useT(text);
  const theme = useTheme();
  return (
    <button type="button" className={styles.iconButton} onClick={() => cycleTheme()} aria-label={t.themeButton[theme]} title={t.theme[theme]}>
      <Icon name={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'auto'} />
    </button>
  );
}

/**
 * Phones only (the stylesheet hides it elsewhere): the six sections, search,
 * language and theme behind one Menu button, so the header is a single row
 * and nothing scrolls sideways. A disclosure, not a modal: Tab walks into it;
 * Escape, a tap outside, a section or search closes it.
 */
function MoreMenu({ onSearch }: { onSearch: () => void }) {
  const t = useT(text);
  const theme = useTheme();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div className={styles.more}>
      <button
        ref={button}
        type="button"
        className={styles.iconButton}
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        aria-label={t.more.button}
        title={t.more.button}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={open ? 'close' : 'menu'} />
      </button>
      {open ? (
        <div ref={panel} id={`${uid}-panel`} className={styles.morePanel} role="group" aria-label={t.more.button}>
          <nav aria-label={t.sections}>
            <ul role="list" className={styles.menuLinks}>
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) => (isActive ? `${styles.menuLink} ${styles.menuLinkActive}` : styles.menuLink)}
                    onClick={() => setOpen(false)}
                  >
                    {t.nav[item.key]}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <button
            type="button"
            className={`btn btn-sm ${styles.menuSearch}`}
            aria-haspopup="dialog"
            onClick={() => {
              setOpen(false);
              onSearch();
            }}
          >
            <Icon name="search" />
            {t.palette.button}
          </button>
          <div className={styles.moreRow}>
            <span className={styles.moreLabel} aria-hidden="true">
              {t.more.language}
            </span>
            <LanguageSwitch />
          </div>
          <div className={styles.moreRow}>
            <span className={styles.moreLabel} aria-hidden="true">
              {t.more.theme}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => cycleTheme()}>
              <Icon name={theme === 'light' ? 'moon' : 'sun'} />
              {t.themeAction[theme]}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Which ends of a horizontal scroller have more to show. */
function useScrollEdges(ref: RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const start = max > 1 && el.scrollLeft > 1;
      const end = max > 1 && el.scrollLeft < max - 1;
      setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // The items too: a language switch changes their widths but not the row's.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(el);
    for (const child of el.children) observer?.observe(child);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref]);

  return edges;
}

/**
 * The six sections. Where they do not fit (phones, long Turkish names) the
 * row scrolls sideways; a solid edge with a chevron, not a fade, says there is
 * more, and the current section is scrolled into view.
 */
function SectionNav() {
  const t = useT(text);
  const { pathname } = useLocation();
  const list = useRef<HTMLUListElement>(null);
  const edges = useScrollEdges(list);

  useEffect(() => {
    const ul = list.current;
    const current = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !current || ul.scrollWidth <= ul.clientWidth) return;
    const room = 32;
    const start = current.offsetLeft;
    const end = start + current.offsetWidth;
    if (start < ul.scrollLeft + room) ul.scrollLeft = Math.max(0, start - room);
    else if (end > ul.scrollLeft + ul.clientWidth - room) ul.scrollLeft = end - ul.clientWidth + room;
  }, [pathname]);

  const scrollBy = (direction: 1 | -1) => {
    const ul = list.current;
    if (!ul) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    ul.scrollBy?.({ left: direction * ul.clientWidth * 0.6, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <nav className={styles.nav} aria-label={t.sections}>
      <ul ref={list} role="list">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
              {t.nav[item.key]}
            </NavLink>
          </li>
        ))}
      </ul>
      {/* Pointer-only helpers: Tab already scrolls each link into view, so they stay out of the tab order and the tree. */}
      {edges.start ? (
        <button type="button" className={styles.edge} data-side="start" tabIndex={-1} aria-hidden="true" onClick={() => scrollBy(-1)}>
          <Icon name="back" size={14} />
        </button>
      ) : null}
      {edges.end ? (
        <button type="button" className={styles.edge} data-side="end" tabIndex={-1} aria-hidden="true" onClick={() => scrollBy(1)}>
          <Icon name="back" size={14} />
        </button>
      ) : null}
    </nav>
  );
}

/** Opens the command palette; shows the shortcut where the header has room for it. */
function PaletteButton({ onOpen }: { onOpen: () => void }) {
  const t = useT(text);
  const shortcut = paletteShortcut();
  return (
    <button
      type="button"
      className={styles.paletteButton}
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      aria-label={t.palette.label(shortcut)}
      title={t.palette.label(shortcut)}
    >
      <Icon name="search" />
      <span className={styles.paletteLabel} aria-hidden="true">
        {t.palette.button}
      </span>
      <kbd className={styles.paletteKbd} aria-hidden="true">
        {shortcut}
      </kbd>
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
  const t = useT(text);
  const api = useApi();
  const state = useHealth(api);

  if (api.mode === 'mock') {
    return (
      <span className={styles.status} data-tone="mock" title={t.mock.title}>
        <span className={styles.dot} aria-hidden="true" />
        {t.mock.badge}
        <span className="visually-hidden">{t.mock.hidden}</span>
      </span>
    );
  }
  return (
    <span className={styles.status} data-tone={state} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {t.status[state]}
    </span>
  );
}

/**
 * Public build: which data the screens show. Recorded replays real runs from
 * the repository; Live calls the API with the visitor's own keys.
 */
function ModeSwitch() {
  const t = useT(text);
  const demo = usePublicDemo();
  const api = useApi();
  const health = useHealth(api);
  if (!demo) return null;
  const live = demo.mode === 'live';
  return (
    <div className={styles.modeSwitch} role="group" aria-label={t.mode.group}>
      <button
        type="button"
        className={styles.mode}
        data-mode="recorded"
        aria-pressed={!live}
        onClick={() => demo.switchTo('recorded')}
        title={t.mode.recordedTitle}
      >
        {t.mode.recorded}
      </button>
      <button
        type="button"
        className={styles.mode}
        data-mode="live"
        aria-pressed={live}
        onClick={() => demo.switchTo('live')}
        title={live ? t.mode.liveNow(t.health[health]) : t.mode.liveTitle}
      >
        {live ? <span className={styles.dot} data-tone={health} aria-hidden="true" /> : null}
        {t.mode.live}
        {live ? <span className="visually-hidden"> ({t.health[health]})</span> : null}
      </button>
    </div>
  );
}

function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const t = useT(text);
  return (
    <a href={href} className={className} target="_blank" rel="noreferrer">
      {children}
      <span className="visually-hidden">{t.newTab}</span>
    </a>
  );
}

function SiteFooter({ publicBuild }: { publicBuild: boolean }) {
  const t = useT(text);
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.about}>
          <LibrainLogo variant="wordmark" height={20} />
          <p className={styles.aboutLine}>{t.footer.about}</p>
          {publicBuild ? <p className={styles.aboutNote}>{t.footer.recordedNote}</p> : null}
        </div>
        <ul role="list" className={styles.links} aria-label={t.footer.links}>
          {PROJECT_LINKS.map((link) => (
            <li key={link.href}>
              <ExternalLink href={link.href} className={styles.footerLink}>
                {link.key ? t.footer[link.key] : 'erenmutlu.me'}
                <Icon name="external" size={12} />
              </ExternalLink>
            </li>
          ))}
        </ul>
        <p className={styles.legal}>
          {t.footer.legalBefore}
          <ExternalLink href={`${REPO_URL}/blob/main/LICENSE`}>{t.footer.licence}</ExternalLink>
          {t.footer.legalAfter}
        </p>
      </div>
    </footer>
  );
}

/**
 * The palette's open state and its shortcuts: ⌘K / Ctrl+K anywhere, and "/"
 * when focus is not in a text field (so typing a slash is never taken).
 */
function usePalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const apple = isApplePlatform();
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const editable = isEditableTarget(event.target);
      const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !editable;
      // On a Mac, Ctrl+K in a text field deletes to the end of the line; only ⌘K is ours there.
      const shortcut = isPaletteShortcut(event) && !(apple && editable && event.ctrlKey && !event.metaKey);
      if (shortcut || slash) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  return { open, show, hide };
}

export function AppShell() {
  const t = useT(text);
  const location = useLocation();
  const demo = usePublicDemo();
  const palette = usePalette();

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
        {t.skip}
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.home} aria-label={t.home}>
            <LibrainLogo variant="wordmark" height={28} decorative />
          </Link>
          <SectionNav />
          <PaletteButton onOpen={palette.show} />
          <div className={styles.tools}>
            {demo ? <ModeSwitch /> : <ApiStatus />}
            {demo ? <ProviderKeysMenu /> : <SettingsMenu />}
            <div className={styles.inlineTools}>
              <LanguageSwitch />
              <ThemeToggle />
            </div>
            <MoreMenu onSearch={palette.show} />
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
                <span>{t.wake}</span>
              </p>
            ) : null}
          </div>
        ) : null}
        {/* A new key per mode remounts the screen, so it starts clean on the other data source. */}
        <Outlet key={demo?.mode} />
      </main>
      <SiteFooter publicBuild={demo !== null} />
      {palette.open ? (
        <Suspense fallback={null}>
          <CommandPalette onClose={palette.hide} />
        </Suspense>
      ) : null}
    </div>
  );
}
