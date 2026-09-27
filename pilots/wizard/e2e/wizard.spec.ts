import { test, expect, type Locator, type Page } from '@playwright/test';

// jasno dist ships the production runtime even with --condition development (that only picks #api's mock),
// so preview has no window.__JASNO__: there the check is skipped and the skip is recorded on the test.
const preview = process.env['JASNO_E2E'] === 'preview';

test.afterEach(async ({ page }) => {
  const found = await page.evaluate(() => {
    const dev = window.__JASNO__;
    if (!dev) return null;
    return [...dev.diagnostics({ severity: 'warn' }), ...dev.diagnostics({ severity: 'error' })].map((d) => d.message);
  });
  if (found === null && preview) {
    test.info().annotations.push({ type: 'skipped-check', description: 'production runtime: no window.__JASNO__ diagnostics' });
    return;
  }
  expect(found, 'window.__JASNO__ diagnostics').toEqual([]);
});

/** Presses Tab (or Shift+Tab) until target has focus. */
async function tabTo(page: Page, target: Locator, key = 'Tab'): Promise<void> {
  for (let i = 0; i < 12 && !(await target.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press(key);
  await expect(target).toBeFocused();
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function account(page: Page): Promise<void> {
  await tabTo(page, page.getByLabel('Email'));
  await page.keyboard.type('ada@example.com');
  await page.keyboard.press('Tab');
  await page.keyboard.type('correct horse');
  await page.keyboard.press('Enter');
  await expect(heading(page)).toHaveText(/Step 2 of 4: Profile/);
  await expect(heading(page)).toBeFocused();
}

async function profile(page: Page, username: string): Promise<void> {
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Full name')).toBeFocused();
  await page.keyboard.type('Ada Lovelace');
  await page.keyboard.press('Tab');
  await page.keyboard.type(username);
  await page.keyboard.press('Tab');
  await page.keyboard.type('United K');            // type-ahead in the focused select
  await expect(page.getByLabel('Country')).toHaveValue('gb');
  await tabTo(page, button(page, 'Next'));
  await page.keyboard.press('Enter');
  await expect(heading(page)).toHaveText(/Step 3 of 4: Preferences/);
  await expect(heading(page)).toBeFocused();
}

async function preferences(page: Page): Promise<void> {
  await tabTo(page, page.getByLabel('I accept the terms of service'));
  await page.keyboard.press('Space');
  await tabTo(page, button(page, 'Next'));
  await page.keyboard.press('Enter');
  await expect(heading(page)).toHaveText(/Step 4 of 4: Review/);
  await expect(heading(page)).toBeFocused();
}

test('a failed Next shows messages and focuses the first invalid field', async ({ page }) => {
  await page.goto('/');
  await expect(heading(page)).toHaveText(/Step 1 of 4: Account/);
  await tabTo(page, page.getByLabel('Email'));
  await page.keyboard.type('ada');
  await page.keyboard.press('Enter');
  const email = page.getByLabel('Email');
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toHaveAccessibleDescription('Enter an email address like name@example.com.');
  await expect(page.getByText('Enter a password.')).toBeVisible();

  await page.keyboard.type('@example.com');        // the shown message follows the value
  await expect(email).toHaveAttribute('aria-invalid', 'false');
  await page.keyboard.press('Enter');
  const password = page.getByLabel('Password', { exact: true });
  await expect(password).toBeFocused();
  await page.keyboard.type('short');
  await expect(password).toHaveAccessibleDescription('At least 8 characters. Use at least 8 characters.');
  await page.keyboard.type(' but longer');
  await page.keyboard.press('Enter');
  await expect(heading(page)).toHaveText(/Profile/);
  await expect(heading(page)).toBeFocused();

  await tabTo(page, button(page, 'Next'));
  await page.keyboard.press('Enter');              // nothing filled in on Profile
  await expect(page.getByLabel('Full name')).toBeFocused();
  await expect(page.getByText('Choose your country.')).toBeVisible();
});

test('sign up with the keyboard; a failed submit keeps focus and data', async ({ page }) => {
  await page.goto('/');
  await account(page);
  await profile(page, 'taken');
  await preferences(page);
  await expect(page.getByRole('definition')).toContainText(['ada@example.com', 'Ada Lovelace', 'taken', 'United Kingdom', 'Free', 'No']);

  const submit = page.getByRole('button', { name: /Create account|Creating account/ });
  await tabTo(page, submit);
  await page.keyboard.press('Enter');
  await expect(submit).toHaveText('Creating account…');
  await expect(submit).toHaveAttribute('aria-disabled', 'true');
  await expect(submit).toBeFocused();
  await expect(page.getByRole('alert')).toHaveText(/already taken/);
  await expect(submit).toHaveText('Create account');
  await expect(submit).toBeFocused();

  await tabTo(page, button(page, 'Back'), 'Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(heading(page)).toHaveText(/Preferences/);
  await expect(heading(page)).toBeFocused();
  await expect(page.getByLabel('I accept the terms of service')).toBeChecked();
  await tabTo(page, button(page, 'Back'));
  await page.keyboard.press('Enter');
  await expect(heading(page)).toBeFocused();
  await expect(page.getByLabel('Full name')).toHaveValue('Ada Lovelace');
  await expect(page.getByLabel('Country')).toHaveValue('gb');

  const username = page.getByLabel('Username');
  await tabTo(page, username);
  await expect(username).toHaveValue('taken');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('ada_l');
  await page.keyboard.press('Enter');
  await expect(heading(page)).toHaveText(/Preferences/);
  await tabTo(page, button(page, 'Next'));
  await page.keyboard.press('Enter');
  await tabTo(page, submit);
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/welcome$/);
  await expect(heading(page)).toHaveText('Welcome, Ada Lovelace!');
  await expect(heading(page)).toBeFocused();
  await expect(page).toHaveTitle('Welcome');
});
