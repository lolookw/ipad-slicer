import { resolve } from 'node:path';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

// Mirror the production cross-origin isolation headers (public/_headers) locally,
// so SharedArrayBuffer behaves the same in dev and preview as on Cloudflare.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

// Solid's hot-reload transform pulls in a virtual `/@solid-refresh` module that Vitest cannot
// resolve, so it is disabled when running tests.
const isTest = Boolean(process.env.VITEST);

export default defineConfig({
  plugins: [solid({ hot: !isTest })],
  build: {
    target: 'es2022',
    rollupOptions: {
      // The app is the entry point; the spike harness stays reachable at /harness.html until slice 5b.
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        harness: resolve(import.meta.dirname, 'harness.html'),
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    projects: [
      {
        // Engine, worker and script logic: plain Node, no DOM.
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/{engine,worker,export,instrumentation,testing}/**/*.test.ts',
            'scripts/catalog/**/*.test.mjs',
          ],
        },
      },
      {
        // UI components and app logic need a DOM.
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/{ui,app,i18n,settings,catalog,viewer,slice,preview,pwa,storage,diagnostics}/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
