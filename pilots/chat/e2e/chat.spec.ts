import { expect, test, type Page } from '@playwright/test';

const TICK = 5000;   // api.mock.ts TICK_MS: someone posts, round-robin general → random → help

test.afterEach(async ({ page }) => {
  const found = await page.evaluate(() => {
    const d = window.__JASNO__;
    return d ? [...d.diagnostics({ severity: 'warn' }), ...d.diagnostics({ severity: 'error' })] : null;
  });
  // jasno dist ships the production runtime even with --condition development: no __JASNO__ to ask there.
  if (process.env.JASNO_E2E === 'preview') expect(found).toBeNull();
  else expect(found).toEqual([]);
});

const log = (page: Page) => page.getByRole('log', { name: 'Messages' });
const items = (page: Page) => log(page).getByRole('listitem');
const atBottom = (page: Page) => log(page).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 2);

test('open a room from the list with the keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Chat' })).toBeVisible();
  const general = page.getByRole('link', { name: '#general 30 unread' });
  await general.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: '#general' })).toBeFocused();
  await expect(page).toHaveTitle('#general · Chat');
  await expect(items(page)).toHaveCount(30);
  await expect(page.getByRole('link', { name: '#general', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('messages from others arrive on a timer; other rooms count them as unread', async ({ page }) => {
  await page.clock.install();
  await page.goto('/rooms/general');
  await page.clock.pauseAt(Date.now() + 1000);
  await expect(items(page)).toHaveCount(30);
  await expect(page.getByRole('link', { name: '#random 2 unread' })).toBeVisible();

  await page.clock.runFor(3 * TICK);   // one message each in general, random, help
  await expect(items(page)).toHaveCount(31);
  await expect(items(page).last()).toHaveText('Ada: Anyone around?');
  await expect(page.getByRole('link', { name: '#general', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '#random 3 unread' })).toBeVisible();
  await expect(page.getByRole('link', { name: '#help 3 unread' })).toBeVisible();

  await page.getByRole('link', { name: '#random 3 unread' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '#random' })).toBeFocused();
  await expect(items(page)).toHaveCount(3);
  await expect(page.getByRole('link', { name: '#random', exact: true })).toBeVisible();
});

test('the message list stays pinned to the bottom unless I scrolled up', async ({ page }) => {
  await page.clock.install();
  await page.goto('/rooms/general');
  await page.clock.pauseAt(Date.now() + 1000);
  await expect(items(page)).toHaveCount(30);
  expect(await atBottom(page)).toBe(true);

  await page.clock.runFor(TICK);   // general gets one
  await expect(items(page)).toHaveCount(31);
  expect(await atBottom(page)).toBe(true);

  await log(page).evaluate((el) => { el.scrollTop = 0; });
  await page.clock.runFor(3 * TICK);   // general gets another
  await expect(items(page)).toHaveCount(32);
  expect(await log(page).evaluate((el) => el.scrollTop)).toBe(0);
});

test('Enter sends: the message shows at once and is then confirmed', async ({ page }) => {
  await page.goto('/rooms/help');
  const box = page.getByRole('textbox', { name: 'Message' });
  await box.fill('hello from e2e');
  await box.press('Enter');
  await expect(items(page).last()).toHaveText('You: hello from e2e Sending…');
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');
  await expect(items(page).last()).toHaveText('You: hello from e2e');
  await expect(items(page)).toHaveCount(3);
});

test('a failed send is marked, toasts, and Retry sends it', async ({ page, context }) => {
  await page.goto('/rooms/help');
  await context.setOffline(true);
  const box = page.getByRole('textbox', { name: 'Message' });
  await box.fill('are you there?');
  await box.press('Enter');
  const row = items(page).last();
  await expect(row).toContainText('Not sent.');
  await expect(page.getByRole('list', { name: 'Notifications' })).toContainText('Message not sent');

  await context.setOffline(false);
  await row.getByRole('button', { name: 'Retry sending "are you there?"' }).focus();
  await page.keyboard.press('Enter');
  await expect(row).toBeFocused();
  await expect(row).toHaveText('You: are you there?');
  await expect(items(page)).toHaveCount(3);

  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByRole('list', { name: 'Notifications' })).toBeEmpty();
});
