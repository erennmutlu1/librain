/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages has no SPA rewrites: a deep link such as /explore/F2 gets the
 * site's 404.html. Shipping index.html under that name too lets the app boot
 * there and BrowserRouter render the route. Any other static host ignores it.
 */
function spaFallback404(): Plugin {
  return {
    name: 'librain:spa-fallback-404',
    apply: 'build',
    // After Vite's own HTML plugin has emitted the final index.html.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (index?.type === 'asset') this.emitFile({ type: 'asset', fileName: '404.html', source: index.source });
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
    plugins: [react(), spaFallback404()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/health': { target, changeOrigin: true },
      },
      // Tests only: src/featured/featured.test.ts and src/explore/explore.test.ts
      // check that their data folders are still byte-for-byte copies of the
      // experiment outputs. The app itself never reads outside web/ (the Docker
      // image is built from web/ alone).
      ...(mode === 'test'
        ? { fs: { allow: ['.', '../experiments/featured-discoveries', '../experiments/new-areas-discoveries'] } }
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
