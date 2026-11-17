import { useEffect, useMemo } from 'react';
import { createBrowserRouter, createMemoryRouter, Navigate, RouterProvider, useLocation, type RouteObject } from 'react-router';
import { ApiProvider } from './api/context';
import type { LibrainApi } from './api/types';
import { AppShell } from './components/AppShell';
import { RunStoreProvider } from './history/context';
import type { RunStore } from './history/runStore';
import { AskPage } from './pages/AskPage';
import { ComparePage } from './pages/ComparePage';
import { DiscoverPage } from './pages/DiscoverPage';
import { HistoryDetailPage } from './pages/HistoryDetailPage';
import { HistoryPage } from './pages/HistoryPage';
import { LibraryPage } from './pages/LibraryPage';
import { NotFoundPage } from './pages/NotFoundPage';

const TITLES: Record<string, string> = {
  '/library': 'Library',
  '/ask': 'Ask',
  '/discover': 'Discover',
  '/compare': 'Compare',
  '/history': 'History',
};

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const section = TITLES[pathname] ?? (pathname.startsWith('/history/') ? 'Run' : null);
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

const routes: RouteObject[] = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/discover" replace /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'ask', element: <AskPage /> },
      { path: 'discover', element: <DiscoverPage /> },
      { path: 'compare', element: <ComparePage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'history/:id', element: <HistoryDetailPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

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
  const router = useMemo(
    () => (initialPath ? createMemoryRouter(routes, { initialEntries: [initialPath] }) : createBrowserRouter(routes)),
    [initialPath],
  );
  return (
    <ApiProvider api={api}>
      <RunStoreProvider store={runStore}>
        <RouterProvider router={router} />
      </RunStoreProvider>
    </ApiProvider>
  );
}
