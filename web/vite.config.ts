/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages has no SPA rewrites. Two things make every link work there:
 *  - a copy of index.html at each known route (and each recorded run's detail page),
 *    so /explore/F4 is served with HTTP 200 and link previews and crawlers see a page;
 *  - 404.html as the same file, so any other path (a history entry, a typo) still
 *    boots the app and BrowserRouter renders the route or its not-found screen.
 * Any other static host ignores the extra files.
 */
const STATIC_ROUTES = ['library', 'ask', 'discover', 'discover/featured', 'explore', 'explore/stats', 'explore/quiz', 'compare', 'history'];

// The recorded runs are part of the bundle, so their ids come from the module graph:
// src/explore/data/<batch>/runs/<id>.json and src/featured/data/runs/<id>.json.
const EXPLORE_RUN = /\/src\/explore\/data\/[^/]+\/runs\/([^/]+)\.json$/;
const FEATURED_RUN = /\/src\/featured\/data\/runs\/([^/]+)\.json$/;

function routesFor(moduleIds: Iterable<string>): string[] {
  const explore = new Set<string>();
  const featured = new Set<string>();
  for (const id of moduleIds) {
    const e = EXPLORE_RUN.exec(id)?.[1];
    if (e) explore.add(e);
    const f = FEATURED_RUN.exec(id)?.[1];
    if (f) featured.add(f);
  }
  return [
    ...STATIC_ROUTES,
    ...[...explore].flatMap((id) => [`explore/${encodeURIComponent(id)}`, `explore/${encodeURIComponent(id)}/full`]),
    ...[...featured].map((id) => `discover/featured/${encodeURIComponent(id)}`),
  ];
}

function spaFallback(): Plugin {
  return {
    name: 'librain:spa-fallback',
    apply: 'build',
    // After Vite's own HTML plugin has emitted the final index.html.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (index?.type !== 'asset') return;
      this.emitFile({ type: 'asset', fileName: '404.html', source: index.source });
      for (const route of routesFor(this.getModuleIds())) {
        this.emitFile({ type: 'asset', fileName: `${route}/index.html`, source: index.source });
      }
    },
  };
}

// Real mode talks to the LIBRAIN API through this dev-server proxy, so the
// browser only ever sees same-origin requests and the API needs no CORS policy
// during development. Override the target with VITE_API_PROXY_TARGET.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:5000';

  return {
    plugins: [react(), spaFallback()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/health': { target, changeOrigin: true },
      },
      // Tests only: src/featured/featured.test.ts, src/explore/explore.test.ts and src/mocks/publicScenarios.test.ts
      // check that their data folders are still byte-for-byte copies of the
      // experiment outputs. The app itself never reads outside web/ (the Docker
      // image is built from web/ alone).
      ...(mode === 'test'
        ? { fs: { allow: ['.', '../experiments/featured-discoveries', '../experiments/new-areas-discoveries', '../experiments/ask-examples'] } }
        : {}),
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // Page-level render tests can exceed vitest's 5 s default on a cold first run
      // (fresh npm ci, CI runners); a flake there would hide real failures.
      testTimeout: 15000,
      css: { modules: { classNameStrategy: 'non-scoped' } },
      // Tests never touch the network: the API client is exercised with an
      // injected fetch and the mock client.
      env: { VITE_USE_MOCKS: 'true' },
    },
  };
});
