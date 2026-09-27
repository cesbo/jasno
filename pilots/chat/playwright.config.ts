import { defineConfig, devices } from '@playwright/test';

const preview = process.env.JASNO_E2E === 'preview';
const url = preview ? 'http://127.0.0.1:4306' : 'http://127.0.0.1:5306';

export default defineConfig({
  testDir: 'e2e',
  webServer: { command: preview ? 'npm run preview' : 'npm run dev', url, reuseExistingServer: !process.env.CI },
  use: { baseURL: url },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
