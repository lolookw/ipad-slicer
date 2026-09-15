import { defineConfig } from 'vitest/config';

// Mirror the production cross-origin isolation headers (public/_headers) locally,
// so SharedArrayBuffer behaves the same in dev and preview as on Cloudflare.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default defineConfig({
  build: {
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
  server: {
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
