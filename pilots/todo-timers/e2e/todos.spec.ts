import { test, expect, type Page } from '@playwright/test';

let pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
});

test.afterEach(async ({ page }) => {
  // __JASNO__ exists only in dev builds; under JASNO_E2E=preview this checks page errors only.
  const devBuild = await page.evaluate(() => window.__JASNO__ !== undefined);
  expect(devBuild).toBe(process.env.JASNO_E2E !== 'preview');
  const diagnostics = await page.evaluate(() => [
    ...(window.__JASNO__?.diagnostics({ severity: 'warn' }) ?? []),
    ...(window.__JASNO__?.diagnostics({ severity: 'error' }) ?? []),
  ].map((d) => d.message));
  expect(diagnostics).toEqual([]);
  expect(pageErrors).toEqual([]);
});

const newTask = (page: Page) => page.getByRole('textbox', { name: 'New task' });
const titles = (page: Page) => page.getByRole('list', { name: 'Tasks' }).locator('.title');

// install() lets fake time flow at real speed; pausing makes every later fastForward() exact.
const T0 = new Date('2026-09-27T09:00:00Z').getTime();
async function openWithPausedClock(page: Page, url = '/'): Promise<void> {
  await page.clock.install({ time: T0 });
  await page.goto(url);
  await page.clock.pauseAt(T0 + 10_000);
}

async function add(page: Page, ...texts: string[]): Promise<void> {
  for (const text of texts) {
    await newTask(page).fill(text);
    await newTask(page).press('Enter');
    await expect(titles(page).filter({ hasText: text })).toHaveCount(1);
  }
}

test('add, rename, cancel and delete with the keyboard only', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Todo timers' })).toBeVisible();
  await add(page, 'milk', 'bread');
  await expect(newTask(page)).toBeFocused();
  await expect(newTask(page)).toHaveValue('');
  await expect(page.getByRole('status')).toHaveText('Added “bread”');

  // Enter saves and returns focus to the renamed title.
  await page.getByRole('button', { name: 'Rename milk' }).focus();
  await page.keyboard.press('Enter');
  const edit = page.getByRole('textbox', { name: 'New name for milk' });
  await expect(edit).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('oat milk');
  await page.keyboard.press('Enter');
  await expect(titles(page)).toHaveText(['oat milk', 'bread']);
  await expect(page.getByRole('button', { name: 'Rename oat milk' })).toBeFocused();

  // Escape cancels.
  await page.keyboard.press('Space');
  await page.keyboard.type('nope');
  await page.keyboard.press('Escape');
  await expect(titles(page)).toHaveText(['oat milk', 'bread']);
  await expect(page.getByRole('button', { name: 'Rename oat milk' })).toBeFocused();

  // An empty name keeps the old one.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await expect(titles(page)).toHaveText(['oat milk', 'bread']);

  // Space ticks the checkbox; delete hands focus to the neighbour, then to the add field.
  await page.getByRole('checkbox', { name: 'Done: bread' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'Done: bread' })).toBeChecked();
  await page.getByRole('button', { name: 'Delete oat milk' }).focus();
  await page.keyboard.press('Enter');
  await expect(titles(page)).toHaveText(['bread']);
  await expect(page.getByRole('checkbox', { name: 'Done: bread' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete bread' }).focus();
  await page.keyboard.press('Space');
  await expect(titles(page)).toHaveCount(0);
  await expect(newTask(page)).toBeFocused();
  await expect(page.getByText('No tasks yet.')).toBeVisible();
});

test('timer time is derived from the clock; totals add up', async ({ page }) => {
  await openWithPausedClock(page);
  await add(page, 'write', 'review');
  const rowTime = (name: string) => page.getByRole('listitem').filter({ hasText: name }).locator('.time');

  await page.getByRole('button', { name: 'Start timer for write' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Stop timer for write' })).toBeFocused();
  // Jumps 65 s but fires the 1 s interval only once: a tick counter would show 0:00:01.
  await page.clock.fastForward(65_000);
  await expect(rowTime('write')).toHaveText('0:01:05');

  await page.getByRole('button', { name: 'Stop timer for write' }).click();
  await page.getByRole('button', { name: 'Start timer for review' }).click();
  await page.clock.fastForward('02:00');
  await expect(rowTime('write')).toHaveText('0:01:05');
  await expect(rowTime('review')).toHaveText('0:02:00');
  await expect(page.locator('.total')).toHaveText('Total time: 0:03:05');

  // Marking a running task done stops its clock.
  await page.getByRole('checkbox', { name: 'Done: review' }).check();
  await page.clock.fastForward('01:00');
  await expect(rowTime('review')).toHaveText('0:02:00');
  await expect(page.getByRole('button', { name: 'Start timer for review' })).toBeVisible();
});

test('filters live in the URL and a running timer survives being filtered out', async ({ page }) => {
  await openWithPausedClock(page);
  await add(page, 'a', 'b');
  await page.getByRole('checkbox', { name: 'Done: b' }).check();
  await page.getByRole('button', { name: 'Start timer for a' }).click();
  await page.evaluate(() => { (window as { marker?: number }).marker = 1; }); // proves no full reload below

  const nav = page.getByRole('navigation', { name: 'Filter tasks' });
  await nav.getByRole('link', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\?filter=done$/);
  await expect(nav.getByRole('link', { name: 'Done' })).toHaveAttribute('aria-current', 'page');
  await expect(titles(page)).toHaveText(['b']);

  await page.clock.fastForward(30_000);
  await nav.getByRole('link', { name: 'Active' }).press('Enter');
  await expect(page).toHaveURL(/\?filter=active$/);
  await expect(titles(page)).toHaveText(['a']);
  await expect(page.getByRole('listitem').filter({ hasText: 'a' }).locator('.time')).toHaveText('0:00:30');
  await expect(page.getByRole('button', { name: 'Stop timer for a' })).toBeVisible();

  await nav.getByRole('link', { name: 'All' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(titles(page)).toHaveText(['a', 'b']);
  await page.goBack();
  await expect(titles(page)).toHaveText(['a']);
  expect(await page.evaluate(() => (window as { marker?: number }).marker)).toBe(1);

  // A deep link applies the filter; completing a task under Active hands focus to the next row.
  await page.goto('/?filter=active');
  await add(page, 'c');
  await expect(titles(page)).toHaveText(['a', 'c']);
  await page.getByRole('checkbox', { name: 'Done: a' }).focus();
  await page.keyboard.press('Space');
  await expect(titles(page)).toHaveText(['c']);
  await expect(page.getByRole('checkbox', { name: 'Done: c' })).toBeFocused();
});

test('tasks and running timers persist across reloads', async ({ page }) => {
  await openWithPausedClock(page);
  await add(page, 'persist me');
  await page.getByRole('button', { name: 'Start timer for persist me' }).click();
  await page.clock.fastForward(10_000);
  await page.reload();
  await page.clock.pauseAt(T0 + 30_000); // started at T0 + 10 s
  await expect(titles(page)).toHaveText(['persist me']);
  await expect(page.locator('.todos .time')).toHaveText('0:00:20');
  await expect(page.getByRole('button', { name: 'Stop timer for persist me' })).toBeVisible();
});

test('invalid stored data is dropped on load', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('todo-timers', JSON.stringify([
    { id: '1', text: 'kept', done: true, elapsedMs: 61_000, startedAt: null },
    { id: '1', text: 'duplicate id', done: false, elapsedMs: 0, startedAt: null },
    { id: '2', text: 'bad time', done: false, elapsedMs: 'lots', startedAt: null },
    { text: 'no id', done: false, elapsedMs: 0, startedAt: null },
    'junk',
  ])));
  await page.goto('/');
  await expect(titles(page)).toHaveText(['kept']);
  await expect(page.getByRole('checkbox', { name: 'Done: kept' })).toBeChecked();
  await expect(page.locator('.total')).toHaveText('Total time: 0:01:01');
});

test('unparseable stored data starts an empty list', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('todo-timers', '{oops'));
  await page.goto('/');
  await expect(page.getByText('No tasks yet.')).toBeVisible();
});
