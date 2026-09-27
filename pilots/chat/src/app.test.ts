import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { flush, signal } from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { deliver, reset, setOffline, subscriberCount } from './api.mock.ts';
import { App } from './app.ts';
import { router } from './routes.ts';
import RoomView from './views/room.ts';

beforeEach(() => reset());

const rows = (root: HTMLElement): HTMLLIElement[] => [...root.querySelectorAll<HTMLLIElement>('ol[role=log] > li')];
const texts = (root: HTMLElement): string[] => rows(root).map((li) => li.textContent);
const link = (root: HTMLElement, room: string): HTMLAnchorElement =>
  [...root.querySelectorAll('nav a')].find((a): a is HTMLAnchorElement => a.textContent.startsWith(`#${room}`))!;

test('the first subscribe callback renders the current messages synchronously', (t) => {
  const view = mountTest(t, () => RoomView({ params: () => ({ id: 'random' }), data: () => undefined }));
  // No await, no flush: the mock calls back inside subscribe(), which runs in onMount of the first flush.
  assert.deepEqual(texts(view.root), ['Grace: Welcome to #random', 'Ada: Hi!']);
  assert.equal(subscriberCount('random'), 1);
});

test('switching rooms unsubscribes from the old room and subscribes to the new one', (t) => {
  const params = signal({ id: 'general' });
  const view = mountTest(t, () => RoomView({ params, data: () => undefined }));
  assert.equal(subscriberCount('general'), 1);
  assert.equal(rows(view.root).length, 30);

  params.set({ id: 'help' });
  flush();
  assert.equal(subscriberCount('general'), 0);
  assert.equal(subscriberCount('help'), 1);
  assert.deepEqual(texts(view.root), ['Grace: Welcome to #help', 'Ada: Hi!']);

  deliver('general', 'Ada', 'not for this room');
  deliver('help', 'Linus', 'for this room');
  flush();
  assert.deepEqual(texts(view.root).at(-1), 'Linus: for this room');
  assert.equal(rows(view.root).length, 3);

  view.dispose();
  assert.equal(subscriberCount('help'), 0, 'unmounting unsubscribes too');
});

test('a send shows at once, a failure is marked with Retry and a toast, and Retry resends it', async (t) => {
  history.replaceState(null, '', '/rooms/help');
  const view = mountTest(t, () => App());
  await settled();
  setOffline(true);

  const input = view.root.querySelector('textarea')!;
  input.focus();
  input.value = 'hello there';
  input.form!.requestSubmit();
  flush();
  assert.equal(texts(view.root).at(-1), 'You: hello there Sending…');
  assert.equal(input.value, '');
  assert.equal(document.activeElement, input);

  await settled();
  const row = rows(view.root).at(-1)!;
  assert.match(row.textContent, /^You: hello there Not sent\./);
  assert.match(view.root.querySelector('[aria-live=polite]')!.textContent, /Message not sent/);

  setOffline(false);
  const retry = row.querySelector('button')!;
  assert.equal(retry.getAttribute('aria-label'), 'Retry sending "hello there"');
  retry.focus();
  retry.click();
  flush();
  assert.equal(document.activeElement, row, 'focus moves to the row before the Retry button goes away');
  assert.equal(row.textContent, 'You: hello there Sending…');

  await settled();
  assert.equal(rows(view.root).at(-1), row, 'the confirmed message keeps its row (same id)');
  assert.equal(row.textContent, 'You: hello there');
  assert.equal(texts(view.root).filter((s) => s.includes('hello there')).length, 1);
});

test('rooms I am not viewing count unread messages; opening a room clears them', async (t) => {
  history.replaceState(null, '', '/rooms/general');
  const view = mountTest(t, () => App());
  await settled();
  assert.equal(link(view.root, 'general').textContent.trim(), '#general');
  assert.equal(link(view.root, 'random').textContent.trim(), '#random 2 unread');

  deliver('random', 'Ada', 'ping');
  deliver('general', 'Grace', 'seen right away');
  flush();
  assert.equal(link(view.root, 'random').textContent.trim(), '#random 3 unread');
  assert.equal(link(view.root, 'general').textContent.trim(), '#general');

  await router.navigate('/rooms/random');
  assert.equal(subscriberCount('general'), 0);
  assert.equal(subscriberCount('random'), 1);
  assert.equal(link(view.root, 'random').textContent.trim(), '#random');
  assert.equal(link(view.root, 'random').getAttribute('aria-current'), 'page');
  assert.equal(link(view.root, 'general').getAttribute('aria-current'), null);
  assert.equal(document.activeElement, view.root.querySelector('h1'));

  deliver('general', 'Linus', 'while away');
  flush();
  assert.equal(link(view.root, 'general').textContent.trim(), '#general 1 unread');
});
