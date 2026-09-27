import { expect, test } from '@playwright/test';

test.afterEach(async ({ page }) => {
  // Dev builds expose __JASNO__; the production build served by preview does not (the check is dev-only there).
  const problems = await page.evaluate(() => window.__JASNO__?.diagnostics({ severity: 'warn' }).map((d) => d.message) ?? null);
  if (process.env.JASNO_E2E !== 'preview') expect(problems, 'window.__JASNO__ exists in jasno dev').not.toBeNull();
  expect(problems ?? []).toEqual([]);
});

test('metrics load with sparklines; the failing widget recovers with Retry', async ({ page }) => {
  await page.goto('/');
  const cpu = page.getByRole('region', { name: 'CPU' });
  await expect(cpu).toContainText(/\d %/);
  await expect(cpu.locator('polyline')).toHaveAttribute('points', /\d/);

  const latency = page.getByRole('region', { name: 'p95 latency' });
  await expect(latency.getByRole('status')).toHaveText('Could not load p95 latency: Upstream timeout (504)');
  await expect(cpu).toContainText(/\d %/); // the other widgets are unaffected

  await latency.getByRole('button', { name: 'Retry p95 latency' }).focus();
  await page.keyboard.press('Enter');
  await expect(latency.getByRole('status')).toBeFocused();
  await expect(latency).toContainText(/\d+ ms/);
  await expect(latency.getByRole('button')).toHaveCount(0);
});

test('selecting a service with the keyboard drives the detail panel', async ({ page }) => {
  await page.goto('/');
  const billing = page.getByRole('button', { name: /^Billing/ });
  await billing.focus();
  await page.keyboard.press('Space');
  await expect(billing).toHaveAttribute('aria-pressed', 'true');
  await expect(billing).toBeFocused();
  await expect(page).toHaveURL(/\?service=billing$/);
  const detail = page.getByRole('region', { name: 'Billing' });
  await expect(detail).toContainText('us-east-1');

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Auth/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(billing).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('region', { name: 'Auth' })).toContainText('Identity');

  await page.goto('/?service=mailer'); // deep link
  await expect(page.getByRole('button', { name: /^Mailer/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Mailer' })).toContainText('down');
});

test('the settings route chooses the polling interval and remembers it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeFocused();
  await expect(page).toHaveTitle('Settings');
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');

  await expect(page.getByRole('radio', { name: '5 seconds' })).toBeChecked();
  await page.getByRole('radio', { name: '10 seconds' }).check();
  await expect(page.getByRole('status')).toHaveText('Metrics refresh every 10 seconds.');

  await page.reload();
  await expect(page.getByRole('radio', { name: '10 seconds' })).toBeChecked();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeFocused();
});

test('polling refreshes on the chosen interval and pauses while the tab is hidden', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('pollMs', '2000'));
  await page.goto('/');
  const line = page.getByRole('region', { name: 'CPU' }).locator('polyline');
  await page.clock.runFor(1500); // first load (the mock answers within 1.2 s)
  await expect(line).toHaveAttribute('points', /\d/);
  const first = await line.getAttribute('points');
  await page.clock.runFor(2000 + 1500); // one interval plus the slowest response
  await expect(line).not.toHaveAttribute('points', first!);

  const setHidden = (hidden: boolean) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  await page.clock.runFor(1500); // a request already in flight still lands
  const paused = await line.getAttribute('points');
  await page.clock.runFor(30_000);
  await expect(line).toHaveAttribute('points', paused!);

  await setHidden(false);
  await page.clock.runFor(2000 + 1500);
  await expect(line).not.toHaveAttribute('points', paused!);
});
