import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window { kanbanMock?: { failRate: number; minDelay: number; maxDelay: number } }
}

async function openBoard(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeVisible();
  await expect(page.getByText('Write the spec').first()).toBeVisible();
  await page.evaluate(() => Object.assign(window.kanbanMock!, { failRate: 0, minDelay: 100, maxDelay: 300 }));
}

// jasno dist ships jasno's production runtime even with --condition development (that condition only picks
// the mock API), so the preview build has no window.__JASNO__; the dev server must have it.
const preview = process.env['JASNO_E2E'] === 'preview';

test.afterEach(async ({ page }) => {
  const problems = await page.evaluate(() => window.__JASNO__ &&
    [...window.__JASNO__.diagnostics({ severity: 'warn' }), ...window.__JASNO__.diagnostics({ severity: 'error' })]);
  if (problems === undefined) expect(preview, 'window.__JASNO__ is missing on the dev server').toBe(true);
  else expect(problems).toEqual([]);
});

test.describe('inline edit', () => {
  test('Enter saves, focuses the title and does not reopen the editor', async ({ page }) => {
    await openBoard(page);
    await page.getByRole('button', { name: 'Edit Write the spec' }).click();
    const input = page.getByRole('textbox', { name: 'Title' });
    await expect(input).toBeFocused();
    await input.fill('Write the full spec');
    await input.press('Enter');
    const title = page.getByRole('button', { name: 'Edit Write the full spec' });
    await expect(title).toBeFocused();
    await expect(input).toHaveCount(0);
    await page.waitForTimeout(500); // a stray keypress/keyup of that Enter would have reopened it by now; the save lands too
    await expect(input).toHaveCount(0);
    await expect(title).toBeFocused();
  });

  test('keyboard only: Enter opens, Enter saves, the editor stays closed', async ({ page }) => {
    await openBoard(page);
    await page.getByRole('button', { name: 'Edit Sketch the board' }).focus();
    await page.keyboard.press('Enter');
    const input = page.getByRole('textbox', { name: 'Title' });
    await expect(input).toBeFocused();
    await page.keyboard.type('Sketch the columns'); // the editor opens with its text selected
    await page.keyboard.press('Enter');
    const title = page.getByRole('button', { name: 'Edit Sketch the columns' });
    await expect(title).toBeFocused();
    await expect(input).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(input).toHaveCount(0);
    await expect(title).toBeFocused();
  });

  test('Escape cancels and focuses the unchanged title', async ({ page }) => {
    await openBoard(page);
    await page.getByRole('button', { name: 'Edit Build the API' }).click();
    const input = page.getByRole('textbox', { name: 'Title' });
    await input.fill('Something else');
    await input.press('Escape');
    await expect(page.getByRole('button', { name: 'Edit Build the API' })).toBeFocused();
    await expect(input).toHaveCount(0);
    await expect(page.getByText('Something else')).toHaveCount(0);
  });
});

test('moving a card takes focus with it', async ({ page }) => {
  await openBoard(page);
  await page.getByRole('button', { name: 'Move Write the spec to Doing' }).click();
  await expect(page.getByRole('region', { name: 'Doing' }).getByRole('button', { name: 'Edit Write the spec' })).toBeFocused();
  await page.keyboard.press('Tab'); // Details
  await page.keyboard.press('Tab'); // ← To do
  await page.keyboard.press('Tab'); // Done →
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Done' }).getByRole('button', { name: 'Edit Write the spec' })).toBeFocused();
});

test('delete asks first', async ({ page }) => {
  await openBoard(page);
  await page.getByRole('button', { name: 'Delete Set up the repo' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete “Set up the repo”?' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Delete Set up the repo' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete Set up the repo' }).click();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Set up the repo')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Done' })).toBeFocused();
});

test.describe('card dialog', () => {
  test('deep link opens it; Close returns to the board', async ({ page }) => {
    await openBoard(page, '/?card=c3');
    const dialog = page.getByRole('dialog', { name: 'Build the API' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeFocused();
  });

  test('Details opens it; Back closes it and focus returns to the link', async ({ page }) => {
    await openBoard(page);
    const details = page.getByRole('link', { name: 'Details for Build the API' });
    await details.click();
    const dialog = page.getByRole('dialog', { name: 'Build the API' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\?card=c3$/);
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(details).toBeFocused();
  });
});
