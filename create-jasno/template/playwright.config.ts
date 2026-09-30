import { defineConfig, devices } from '@playwright/test';

// npm run e2e: against npm run dev. JASNO_E2E=preview npm run e2e: against npm run dist + npm run preview, the
// production build as a static host serves it.
const preview = process.env['JASNO_E2E'] === 'preview';
const url = preview ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: url },
  webServer: { command: preview ? 'npm run preview' : 'npm run dev', url, reuseExistingServer: !process.env['CI'] },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
