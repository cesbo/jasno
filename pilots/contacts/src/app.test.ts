import { beforeEach, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { flush } from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { reset } from './api.mock.ts';
import { App } from './app.ts';
import { router } from './routes.ts';

beforeEach(() => reset());

async function open(t: TestContext, url: string): Promise<HTMLElement> {
  history.replaceState(null, '', url);
  const view = mountTest(t, () => App());
  await settled();
  return view.root;
}
const h1 = (root: HTMLElement): string => root.querySelector('h1')?.textContent ?? '';
const byLabel = <E extends Element>(root: HTMLElement, sel: string): E => {
  const el = root.querySelector<E>(sel);
  assert.ok(el, `missing ${sel}`);
  return el;
};
const button = (root: HTMLElement, name: string): HTMLButtonElement => {
  const b = [...root.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') ?? x.textContent) === name);
  assert.ok(b, `missing button ${name}`);
  return b;
};
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

test('expanded notes survive the search filter hiding the row', async (t) => {
  const root = await open(t, '/');
  assert.equal(root.querySelectorAll('.people li').length, 4);
  button(root, 'Notes for Ada Lovelace').click();
  const search = byLabel<HTMLInputElement>(root, 'input[type=search]');
  type(search, 'grace');
  await settled();
  assert.equal(router.url().search, '?q=grace');
  assert.equal(root.querySelectorAll('.people li').length, 1);
  type(search, '');
  await settled();
  assert.equal(router.url().search, '');
  assert.equal(button(root, 'Notes for Ada Lovelace').getAttribute('aria-expanded'), 'true');
  assert.equal(byLabel<HTMLElement>(root, '#notes-1').hidden, false);
});

test('a save still in flight when the user opens another person only updates its own record', async (t) => {
  const root = await open(t, '/people/1');
  assert.equal(h1(root), 'Ada Lovelace');
  type(byLabel(root, 'input[name=name]'), 'Ada King');
  byLabel<HTMLFormElement>(root, 'form').requestSubmit();
  await router.navigate('/people/2');
  assert.equal(h1(root), 'Grace Hopper');
  await settled(); // the save for person 1 resolves now
  assert.equal(h1(root), 'Grace Hopper');
  assert.equal(byLabel<HTMLInputElement>(root, 'input[name=name]').value, 'Grace Hopper');
  await router.navigate('/people/1');
  assert.equal(h1(root), 'Ada King');
});

test('saving shows the new name and announces it', async (t) => {
  const root = await open(t, '/people/4');
  type(byLabel(root, 'input[name=name]'), 'Katherine G. Johnson');
  const save = button(root, 'Save');
  save.focus();
  byLabel<HTMLFormElement>(root, 'form').requestSubmit();
  flush();
  assert.equal(save.getAttribute('aria-disabled'), 'true');
  await settled();
  assert.equal(h1(root), 'Katherine G. Johnson');
  assert.equal(document.title, 'Katherine G. Johnson');
  assert.ok(root.textContent?.includes('Saved.'));
  assert.equal(document.activeElement, save);
});

test('delete asks first, Cancel returns focus, Delete goes back to the list', async (t) => {
  const root = await open(t, '/people/3');
  const del = button(root, 'Delete contact');
  const dialog = byLabel<HTMLDialogElement>(root, 'dialog');
  del.focus();
  del.click();
  assert.equal(dialog.open, true);
  assert.equal(document.activeElement, button(root, 'Cancel'));
  button(root, 'Cancel').click();
  await settled();
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, del);
  assert.equal(router.url().pathname, '/people/3');

  del.click();
  button(root, 'Delete').click();
  await settled();
  assert.equal(router.url().pathname, '/');
  assert.equal(h1(root), 'Contacts');
  assert.ok(!root.textContent?.includes('Alan Turing'));
});

test('a delete still in flight does not pull the user off the person they moved to', async (t) => {
  const root = await open(t, '/people/1');
  button(root, 'Delete contact').click();
  button(root, 'Delete').click();
  await router.navigate('/people/2');
  await settled(); // the delete of person 1 resolves now
  assert.equal(router.url().pathname, '/people/2');
  assert.equal(h1(root), 'Grace Hopper');
  await router.navigate('/people/1');
  assert.equal(h1(root), 'Contact not found');
});

test('adding a person opens the new record', async (t) => {
  const root = await open(t, '/people/new');
  type(byLabel(root, 'input[name=name]'), 'Hedy Lamarr');
  byLabel<HTMLFormElement>(root, 'form').requestSubmit();
  await settled();
  assert.match(router.url().pathname, /^\/people\/[0-9a-f-]{36}$/);
  assert.equal(h1(root), 'Hedy Lamarr');
});

test('unknown contact, unknown page and server error each render a heading', async (t) => {
  const root = await open(t, '/people/999');
  assert.equal(h1(root), 'Contact not found');
  await router.navigate('/nope');
  assert.equal(h1(root), 'Page not found');
  await router.navigate('/people/boom');
  assert.equal(h1(root), 'Something went wrong');
  assert.ok(root.textContent?.includes('Server error 500'));
  const retry = button(root, 'Try again');
  retry.focus();
  retry.click();
  await settled();
  assert.equal(h1(root), 'Something went wrong');
  assert.equal(document.activeElement?.tagName, 'H1');
});
