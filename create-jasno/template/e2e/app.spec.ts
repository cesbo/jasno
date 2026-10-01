import { expect, test } from '@playwright/test';
import type {} from '@jasno/core'; // types for window.__JASNO__

// Every test fails on a page error or a jasno dev warning (FOCUS_LOST, VIEW_NO_HEADING, KEY_ACTIVATES_NEW_FOCUS, ...).
// The production build (JASNO_E2E=preview) has no window.__JASNO__, so there only page errors count.
const preview = process.env['JASNO_E2E'] === 'preview';
const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
});
test.afterEach(async ({ page }) => {
  const warnings = await page.evaluate(() => window.__JASNO__?.diagnostics().map((d) => d.message) ?? null);
  if (!preview) expect(warnings, 'window.__JASNO__ exists under jasno dev').not.toBeNull();
  expect([...errors, ...(warnings ?? [])]).toEqual([]);
});

test('the home page shows its heading and title', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(page).toHaveTitle('Home');
});

test('a nav link moves focus to the new page heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await page.getByRole('link', { name: 'About' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeFocused();
});

test('an unknown URL shows the not-found page', async ({ page }) => {
  await page.goto('/nope');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});
