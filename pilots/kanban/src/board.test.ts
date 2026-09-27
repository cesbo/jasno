import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { flush } from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { listCards, mock, resetMock } from './api.mock.ts';
import { App } from './app.ts';
import { router } from './routes.ts';
import { cards, notice } from './state.ts';

/** Lets a held close event run, then waits for what it started. */
async function closed(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1));
  await settled();
}

async function mountBoard(t: TestContext, url = '/'): Promise<HTMLElement> {
  resetMock();
  history.replaceState(null, '', url);
  cards.reload(); // cards is app-lifetime (createRoot): start every test from the seed
  const view = mountTest(t, () => App());
  await settled();
  return view.root;
}

function get<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  assert.ok(found, `nothing matches ${selector}`);
  return found;
}
const labelled = (root: ParentNode, label: string): HTMLElement => get(root, `[aria-label="${label}"]`);
const byText = (root: ParentNode, text: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent === text);
  assert.ok(found, `no button "${text}"`);
  return found;
};
const titles = (root: ParentNode, column: string): string[] =>
  [...get(root, `#col-${column}`).parentElement!.querySelectorAll('.card-title')].map((b) => b.textContent ?? '');
/** Compares by identity; a failing assert.equal on happy-dom nodes tries to print the whole DOM graph. */
function assertFocused(expected: Element): void {
  const active = document.activeElement;
  assert.ok(active === expected, `focus is on ${active?.outerHTML.slice(0, 80)}, expected ${expected.outerHTML.slice(0, 80)}`);
}
const serverTitle = async (id: string): Promise<string | undefined> =>
  (await listCards(AbortSignal.timeout(1000))).find((c) => c.id === id)?.title;

/** Focuses, then clicks, as a browser does for a pointer click (happy-dom's click() does not focus). */
function press(button: HTMLElement): void {
  button.focus();
  button.click();
}

/** Opens the editor of the card titled `from`, types `to` and presses Enter (implicit submission). */
function rename(root: HTMLElement, from: string, to: string): void {
  labelled(root, `Edit ${from}`).click();
  flush();
  const input = get<HTMLInputElement>(root, 'input[aria-label="Title"]');
  input.value = to;
  input.form!.requestSubmit();
  flush();
}

test('inline edit: Enter saves and focuses the title', async (t) => {
  const root = await mountBoard(t);
  labelled(root, 'Edit Write the spec').click();
  flush();
  const input = get<HTMLInputElement>(root, 'input[aria-label="Title"]');
  assertFocused(input);
  input.value = 'Write the full spec';
  input.form!.requestSubmit();
  flush();
  assert.ok(!root.querySelector('input[aria-label="Title"]'));
  assertFocused(labelled(root, 'Edit Write the full spec'));
  await settled();
  assert.equal(await serverTitle('c1'), 'Write the full spec');
  assertFocused(labelled(root, 'Edit Write the full spec'));
});

test('inline edit: Escape cancels and focuses the unchanged title', async (t) => {
  const root = await mountBoard(t);
  labelled(root, 'Edit Write the spec').click();
  flush();
  const input = get<HTMLInputElement>(root, 'input[aria-label="Title"]');
  input.value = 'Something else';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  flush();
  assert.ok(!root.querySelector('input[aria-label="Title"]'));
  assertFocused(labelled(root, 'Edit Write the spec'));
  await settled();
  assert.equal(await serverTitle('c1'), 'Write the spec');
});

test('inline edit: leaving the field saves without pulling focus back', async (t) => {
  const root = await mountBoard(t);
  labelled(root, 'Edit Write the spec').click();
  flush();
  get<HTMLInputElement>(root, 'input[aria-label="Title"]').value = 'Spec v2';
  const other = labelled(root, 'New card in Done');
  other.focus();
  flush();
  assert.deepEqual(titles(root, 'todo'), ['Spec v2', 'Sketch the board']);
  assertFocused(other);
  await settled();
  assert.equal(await serverTitle('c1'), 'Spec v2');
});

test('overlapping saves: an earlier failure changes nothing when the last save succeeds', async (t) => {
  const root = await mountBoard(t);
  mock.outcomes.push('fail', 'ok');
  rename(root, 'Write the spec', 'First');
  rename(root, 'First', 'Second');
  assert.deepEqual(titles(root, 'todo'), ['Second', 'Sketch the board']);
  await settled();
  assert.deepEqual(titles(root, 'todo'), ['Second', 'Sketch the board']);
  assert.equal(await serverTitle('c1'), 'Second');
  assert.equal(notice(), '');
});

test('overlapping saves: when the last save fails, the last accepted title shows', async (t) => {
  const root = await mountBoard(t);
  mock.outcomes.push('ok', 'fail');
  rename(root, 'Write the spec', 'First');
  rename(root, 'First', 'Second');
  assert.deepEqual(titles(root, 'todo'), ['Second', 'Sketch the board']);
  await settled();
  assert.deepEqual(titles(root, 'todo'), ['First', 'Sketch the board']);
  assert.equal(await serverTitle('c1'), 'First');
  assert.match(notice(), /Not saved/);
});

test('overlapping saves: when all fail, the original title shows', async (t) => {
  const root = await mountBoard(t);
  mock.outcomes.push('fail', 'fail');
  rename(root, 'Write the spec', 'First');
  rename(root, 'First', 'Second');
  await settled();
  assert.deepEqual(titles(root, 'todo'), ['Write the spec', 'Sketch the board']);
  assert.match(notice(), /Not saved/);
});

test('move: the card and focus go to the other column; a failed move brings both back', async (t) => {
  const root = await mountBoard(t);
  labelled(root, 'Move Write the spec to Doing').click();
  flush();
  assert.deepEqual(titles(root, 'todo'), ['Sketch the board']);
  assert.deepEqual(titles(root, 'doing'), ['Write the spec', 'Build the API']); // a card keeps its place in the list
  assertFocused(labelled(root, 'Edit Write the spec'));
  await settled();

  mock.outcomes.push('fail');
  labelled(root, 'Move Write the spec to Done').click();
  flush();
  assert.deepEqual(titles(root, 'done'), ['Write the spec', 'Set up the repo']);
  assertFocused(labelled(root, 'Edit Write the spec'));
  await settled();
  assert.deepEqual(titles(root, 'doing'), ['Write the spec', 'Build the API']);
  assertFocused(labelled(root, 'Edit Write the spec'));
  assert.match(notice(), /Not saved/);
});

test('add: the card shows at once; a failed add removes it and says so', async (t) => {
  const root = await mountBoard(t);
  const input = get<HTMLInputElement>(root, 'input[aria-label="New card in Doing"]');
  input.value = 'Review';
  input.form!.requestSubmit();
  flush();
  assert.equal(input.value, '');
  assert.deepEqual(titles(root, 'doing'), ['Build the API', 'Review']);
  await settled();
  assert.deepEqual(titles(root, 'doing'), ['Build the API', 'Review']);

  mock.outcomes.push('fail');
  input.value = 'Doomed';
  input.form!.requestSubmit();
  flush();
  assert.deepEqual(titles(root, 'doing'), ['Build the API', 'Review', 'Doomed']);
  await settled();
  assert.deepEqual(titles(root, 'doing'), ['Build the API', 'Review']);
  assert.match(notice(), /Could not add/);
});

test('delete: asks first, focuses a neighbour, and a failed delete puts the card back', async (t) => {
  const root = await mountBoard(t);
  const remove = labelled(root, 'Delete Write the spec');
  press(remove);
  const confirm = get<HTMLDialogElement>(root, 'dialog[aria-labelledby="delete-c1"]');
  assert.ok(confirm.open);
  assertFocused(byText(confirm, 'Cancel'));
  press(byText(confirm, 'Cancel'));
  await closed();
  assert.ok(!confirm.open);
  assert.deepEqual(titles(root, 'todo'), ['Write the spec', 'Sketch the board']);
  assertFocused(remove);

  press(remove);
  press(byText(confirm, 'Delete'));
  await closed();
  assert.deepEqual(titles(root, 'todo'), ['Sketch the board']);
  assertFocused(labelled(root, 'Edit Sketch the board'));

  mock.outcomes.push('fail');
  press(labelled(root, 'Delete Sketch the board'));
  press(byText(get(root, 'dialog[aria-labelledby="delete-c2"]'), 'Delete'));
  await closed();
  assertFocused(get(root, '#col-todo'));
  assert.deepEqual(titles(root, 'todo'), ['Sketch the board']);
  assert.match(notice(), /Could not delete/);
});

test('card dialog: a deep link opens it; Close returns to the board heading', async (t) => {
  const root = await mountBoard(t, '/?card=c3');
  const dialog = get<HTMLDialogElement>(root, 'dialog.detail');
  assert.ok(dialog.open);
  assert.equal(get(dialog, 'h2').textContent, 'Build the API');
  assertFocused(byText(dialog, 'Close'));
  press(byText(dialog, 'Close'));
  await closed();
  assert.equal(router.url().search, '');
  assert.ok(!root.querySelector('dialog.detail'));
  assertFocused(get(root, 'h1'));
});

test('card dialog: Details opens it over the board; Back closes it', async (t) => {
  const root = await mountBoard(t);
  const link = labelled(root, 'Details for Build the API');
  press(link);
  await settled();
  assert.equal(router.url().search, '?card=c3');
  assert.ok(get<HTMLDialogElement>(root, 'dialog.detail').open);
  history.back(); // the browser's Back button
  await closed();
  assert.equal(router.url().search, '');
  assert.ok(!root.querySelector('dialog.detail'));
  assertFocused(link);
});

test('card dialog: an unknown card says so', async (t) => {
  const root = await mountBoard(t, '/?card=nope');
  assert.equal(get(get(root, 'dialog.detail'), 'h2').textContent, 'Card not found');
});
