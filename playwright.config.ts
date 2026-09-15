import { defineConfig, devices } from '@playwright/test';

const PORT = 4175;
const baseURL = `http://127.0.0.1:${PORT}`;

// WebKit is Safari's engine; the iPad descriptor adds touch and the tablet viewport.
// Isolation headers must come from a real server (scripts/serve-dist.mjs), never from
// route interception, which does not make the page cross-origin isolated.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL, trace: 'off' },
  projects: [
    {
      name: 'ipad-webkit',
      use: { ...devices['iPad Pro 11'], defaultBrowserType: 'webkit' },
    },
    {
      name: 'ipad-webkit-landscape',
      use: { ...devices['iPad Pro 11 landscape'], defaultBrowserType: 'webkit' },
    },
  ],
  webServer: {
    command: `node scripts/serve-dist.mjs ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
