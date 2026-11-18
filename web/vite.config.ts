/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Real mode talks to the LIBRAIN API through this dev-server proxy, so the
// browser only ever sees same-origin requests and the API needs no CORS policy
// during development. Override the target with VITE_API_PROXY_TARGET.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/health': { target, changeOrigin: true },
      },
      // Tests only: src/featured/featured.test.ts checks that src/featured/data
      // is still a byte-for-byte copy of the experiment outputs. The app itself
      // never reads outside web/ (the Docker image is built from web/ alone).
      ...(mode === 'test' ? { fs: { allow: ['.', '../experiments/featured-discoveries'] } } : {}),
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: { modules: { classNameStrategy: 'non-scoped' } },
      // Tests never touch the network: the API client is exercised with an
      // injected fetch and the mock client.
      env: { VITE_USE_MOCKS: 'true' },
    },
  };
});
