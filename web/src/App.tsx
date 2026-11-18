import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, useLocation, useRoutes, type RouteObject } from 'react-router';
import { ApiProvider } from './api/context';
import type { LibrainApi } from './api/types';
import { AppShell } from './components/AppShell';
import { SkeletonLines } from './components/States';
import { RunStoreProvider } from './history/context';
import type { RunStore } from './history/runStore';
import { NotFoundPage } from './pages/NotFoundPage';

// Each screen is its own chunk, loaded on first visit.
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const AskPage = lazy(() => import('./pages/AskPage'));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const HistoryDetailPage = lazy(() => import('./pages/HistoryDetailPage'));
const FeaturedPage = lazy(() => import('./pages/FeaturedPage'));

const TITLES: Record<string, string> = {
  '/library': 'Library',
  '/ask': 'Ask',
  '/discover': 'Discover',
  '/discover/featured': 'Featured discoveries',
  '/compare': 'Compare',
  '/history': 'History',
};

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const section =
      TITLES[pathname] ??
      (pathname.startsWith('/history/') ? 'Run' : pathname.startsWith('/discover/featured/') ? 'Featured discovery' : null);
    document.title = section ? `${section} · LIBRAIN` : 'LIBRAIN';
  }, [pathname]);
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
  return (
    <Suspense
      fallback={
        <div className="page" aria-busy="true" aria-label="Loading">
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
      { index: true, element: <Navigate to="/discover" replace /> },
      { path: 'library', element: <Screen><LibraryPage /></Screen> },
      { path: 'ask', element: <Screen><AskPage /></Screen> },
      { path: 'discover', element: <Screen><DiscoverPage /></Screen> },
      { path: 'discover/featured', element: <Screen><FeaturedPage /></Screen> },
      { path: 'discover/featured/:id', element: <Screen><FeaturedPage /></Screen> },
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
