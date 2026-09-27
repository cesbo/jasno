import { expect, test } from '@playwright/test';

// jasno dist ships jasno's production build even with --condition development (that only picks #api's mock),
// so window.__JASNO__ exists under jasno dev only. Uncaught page errors are checked in both modes.
const preview = process.env['JASNO_E2E'] === 'preview';
const pageErrors: string[] = [];
test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on('pageerror', (e) => pageErrors.push(e.message));
});
test.afterEach(async ({ page }) => {
  const problems = await page.evaluate((preview) => {
    const d = window.__JASNO__;
    if (!d) return preview ? [] : ['window.__JASNO__ is missing: not a dev build'];
    return [...d.diagnostics({ severity: 'warn' }), ...d.diagnostics({ severity: 'error' })].map((x) => x.message);
  }, preview);
  expect([...pageErrors, ...problems]).toEqual([]);
});

test('search filter lives in the URL and expanded notes survive filtering', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();
  const notes = page.getByRole('button', { name: 'Notes for Ada Lovelace' });
  await notes.click();
  await expect(notes).toHaveAttribute('aria-expanded', 'true');
  const search = page.getByRole('searchbox', { name: 'Search' });
  await search.fill('grace');
  await expect(page).toHaveURL(/\?q=grace$/);
  await expect(page.getByRole('link', { name: 'Ada Lovelace' })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'contacts' })).toHaveText('1 of 4 contacts');
  await search.fill('');
  await expect(page).toHaveURL(/\/$/);
  await expect(notes).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Prefers email.')).toBeVisible();

  await page.goto('/?q=alan');
  await expect(search).toHaveValue('alan');
  await expect(page.getByRole('link', { name: 'Alan Turing' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Grace Hopper' })).toHaveCount(0);
});

test('a save in flight when the user moves to another person stays with its own record', async ({ page }) => {
  await page.goto('/people/1');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText('Ada Lovelace');
  await page.getByLabel('Name').fill('Ada King');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: 'Next: Alan Turing' }).click();
  await expect(heading).toHaveText('Alan Turing');
  await expect(heading).toBeFocused();
  await page.waitForTimeout(600); // the mock save takes 400 ms: let it land while Alan is shown
  await expect(heading).toHaveText('Alan Turing');
  await expect(page.getByLabel('Name')).toHaveValue('Alan Turing');
  await expect(page).toHaveTitle('Alan Turing');
  await page.goBack();
  await expect(heading).toHaveText('Ada King');
});

test('saving with Enter announces the result and keeps focus in the Name field', async ({ page }) => {
  await page.goto('/people/2');
  await page.getByLabel('Name').fill('Grace Brewster Hopper');
  await page.getByLabel('Name').press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grace Brewster Hopper');
  await expect(page.getByLabel('Name')).toBeFocused();
});

test('add a person from the header', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Add person' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add person' })).toBeFocused();
  await page.getByLabel('Name').fill('Hedy Lamarr');
  await page.getByLabel('Email').fill('hedy@example.com');
  await page.getByRole('button', { name: 'Add person' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hedy Lamarr');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/); // replace: the add form is not in history
  await expect(page.getByRole('link', { name: 'Hedy Lamarr' })).toBeVisible();
});

test('delete asks in a modal dialog and returns focus', async ({ page }) => {
  await page.goto('/people/3');
  const del = page.getByRole('button', { name: 'Delete contact' });
  const dialog = page.getByRole('dialog', { name: 'Delete Alan Turing?' });
  await del.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(del).toBeFocused();
  await del.press('Enter');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(del).toBeFocused();
  await expect(page).toHaveURL(/\/people\/3$/);
  await del.click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Alan Turing' })).toHaveCount(0);
});

test('not-found and error views', async ({ page }) => {
  await page.goto('/people/999');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact not found');
  await page.goto('/no/such/page');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await page.getByRole('link', { name: 'Back to all contacts' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeFocused();
  await page.goto('/people/boom');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Something went wrong');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Something went wrong');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});
