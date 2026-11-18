import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, matchRoutes, MemoryRouter, useLocation, useRoutes, type RouteObject } from 'react-router';
import { ApiProvider } from './api/context';
import type { LibrainApi } from './api/types';
import { AppShell } from './components/AppShell';
import { SkeletonLines } from './components/States';
import { RunStoreProvider } from './history/context';
import type { RunStore } from './history/runStore';
import { useT } from './i18n/lang';
import { NotFoundPage } from './pages/NotFoundPage';
import { text } from './App.i18n';

// Each screen is its own chunk, loaded on first visit.
const HomePage = lazy(() => import('./pages/HomePage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const AskPage = lazy(() => import('./pages/AskPage'));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const HistoryDetailPage = lazy(() => import('./pages/HistoryDetailPage'));
const FeaturedPage = lazy(() => import('./pages/FeaturedPage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const ExploreDetailPage = lazy(() => import('./pages/ExploreDetailPage'));
const ExploreStatsPage = lazy(() => import('./pages/ExploreStatsPage'));
const ExploreQuizPage = lazy(() => import('./pages/ExploreQuizPage'));

type Titles = (typeof text)['en'];
type SectionKey = keyof Titles['sections'];

/** Route path (as written in `routes`) to the section its title names. */
const SECTION_BY_PATH: Record<string, SectionKey> = {
  library: 'library',
  ask: 'ask',
  discover: 'discover',
  'discover/featured': 'featured',
  explore: 'explore',
  'explore/stats': 'stats',
  'explore/quiz': 'quiz',
  compare: 'compare',
  history: 'history',
  'history/:id': 'run',
};

/**
 * The title for a path, read from the route it matches, so "/discover" and
 * "/discover/" agree and any path that falls through to the not-found screen
 * says so.
 */
function documentTitle(pathname: string, t: Titles): string {
  const match = matchRoutes(routes, pathname)?.at(-1);
  if (match?.route.index) return t.home;
  const path = match?.route.path ?? '*';
  const id = (match?.params.id ?? '').toUpperCase();
  const section =
    path === 'explore/:id' || path === 'explore/:id/full'
      ? t.idea(id)
      : path === 'discover/featured/:id'
        ? t.featuredOne
        : t.sections[SECTION_BY_PATH[path] ?? 'notFound'];
  return `${section} · LIBRAIN`;
}

function DocumentTitle() {
  const { pathname } = useLocation();
  const t = useT(text);
  useEffect(() => {
    document.title = documentTitle(pathname, t);
  }, [pathname, t]);
  return null;
}

function Shell() {
  return (
    <>
      <DocumentTitle />
      <AppShell />
    </>
  );
}

function Screen({ children }: { children: ReactNode }) {
  const t = useT(text);
  return (
    <Suspense
      fallback={
        <div className="page" aria-busy="true" aria-label={t.loading}>
          <SkeletonLines lines={5} />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const routes: RouteObject[] = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Screen><HomePage /></Screen> },
      { path: 'library', element: <Screen><LibraryPage /></Screen> },
      { path: 'ask', element: <Screen><AskPage /></Screen> },
      { path: 'discover', element: <Screen><DiscoverPage /></Screen> },
      { path: 'discover/featured', element: <Screen><FeaturedPage /></Screen> },
      { path: 'discover/featured/:id', element: <Screen><FeaturedPage /></Screen> },
      { path: 'explore', element: <Screen><ExplorePage /></Screen> },
      { path: 'explore/stats', element: <Screen><ExploreStatsPage /></Screen> },
      { path: 'explore/quiz', element: <Screen><ExploreQuizPage /></Screen> },
      { path: 'explore/:id', element: <Screen><ExploreDetailPage /></Screen> },
      { path: 'explore/:id/full', element: <Screen><ExploreDetailPage full /></Screen> },
      { path: 'compare', element: <Screen><ComparePage /></Screen> },
      { path: 'history', element: <Screen><HistoryPage /></Screen> },
      { path: 'history/:id', element: <Screen><HistoryDetailPage /></Screen> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

function Routes() {
  return useRoutes(routes);
}

/**
 * Declarative routing (BrowserRouter + useRoutes): the app needs no loaders or
 * actions, and this keeps the router's data layer out of the initial bundle.
 */
export function App({
  api,
  runStore,
  initialPath,
}: {
  api: LibrainApi;
  runStore: RunStore;
  /** Tests render with an in-memory router starting here. */
  initialPath?: string;
}) {
  return (
    <ApiProvider api={api}>
      <RunStoreProvider store={runStore}>
        {initialPath ? (
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes />
          </MemoryRouter>
        ) : (
          <BrowserRouter>
            <Routes />
          </BrowserRouter>
        )}
      </RunStoreProvider>
    </ApiProvider>
  );
}
