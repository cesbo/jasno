import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { flush } from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { App } from './app.ts';
import { router } from './routes.ts';

// assert.equal on two happy-dom elements that differ makes node:assert inspect both DOM graphs (out of memory):
// compare identity and describe the element instead.
function assertFocused(el: Element): void {
  const a = document.activeElement;
  assert.ok(a === el, `focus is on <${a?.tagName.toLowerCase()} ${a?.getAttribute('aria-label') ?? ''}>, expected <${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? ''}>`);
}

async function mountApp(t: TestContext, url = '/') {
  history.replaceState(null, '', url);
  const view = mountTest(t, () => App());
  await settled();
  const $ = <E extends Element = HTMLElement>(sel: string): E => {
    const el = view.root.querySelector<E>(sel);
    assert.ok(el, `no element for ${sel}`);
    return el;
  };
  const byLabel = <E extends HTMLElement = HTMLButtonElement>(label: string): E => $<E>(`[aria-label="${label}"]`);
  const add = (text: string): void => {
    const input = $<HTMLInputElement>('.add input');
    input.value = text;
    $<HTMLFormElement>('.add').requestSubmit();
    flush();
  };
  const rows = (): string[] => [...view.root.querySelectorAll('.todos li .title')].map((b) => b.textContent ?? '');
  return { view, $, byLabel, add, rows };
}

test('add, rename with Enter, cancel with Escape, delete', async (t) => {
  const { $, byLabel, add, rows } = await mountApp(t);
  add('milk');
  add('bread');
  assert.deepEqual(rows(), ['milk', 'bread']);
  assert.equal($('[role="status"]').textContent, 'Added “bread”');

  byLabel('Rename milk').click();
  flush();
  const edit = byLabel<HTMLInputElement>('New name for milk');
  assertFocused(edit);
  edit.value = 'oat milk';
  $<HTMLFormElement>('.rename').requestSubmit();
  flush();
  assert.deepEqual(rows(), ['oat milk', 'bread']);
  assertFocused(byLabel('Rename oat milk'));

  byLabel('Rename bread').click();
  flush();
  const edit2 = byLabel<HTMLInputElement>('New name for bread');
  edit2.value = 'cake';
  edit2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  flush();
  assert.deepEqual(rows(), ['oat milk', 'bread']);
  assertFocused(byLabel('Rename bread'));

  byLabel('Delete oat milk').focus();
  byLabel('Delete oat milk').click();
  flush();
  assert.deepEqual(rows(), ['bread']);
  assertFocused(byLabel('Done: bread'));
  byLabel('Delete bread').click();
  flush();
  assert.deepEqual(rows(), []);
  assertFocused($('.add input'));
});

test('timer time comes from the clock, not from counting ticks', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1_000_000 });
  const { $, byLabel, add } = await mountApp(t);
  add('write report');
  byLabel('Start timer for write report').click();
  flush();
  // Jump the wall clock 65 s ahead but fire the interval only once.
  t.mock.timers.setTime(1_065_000);
  t.mock.timers.tick(1000);
  flush();
  assert.equal($('.todos .time').textContent, '0:01:06');
  assert.equal($('.total').textContent, 'Total time: 0:01:06');

  byLabel('Stop timer for write report').click();
  t.mock.timers.tick(10_000);
  flush();
  assert.equal($('.todos .time').textContent, '0:01:06');
  assert.equal(byLabel('Start timer for write report').textContent, 'Start');
});

test('a running timer keeps running while its row is filtered out', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  const { $, byLabel, add, rows } = await mountApp(t);
  add('a');
  add('b');
  byLabel('Start timer for a').click();
  t.mock.timers.tick(5000);
  flush();

  await router.navigate('?filter=done');
  flush();
  assert.deepEqual(rows(), []);
  t.mock.timers.tick(20_000);

  await router.navigate('?filter=active');
  flush();
  assert.deepEqual(rows(), ['a', 'b']);
  assert.equal($('.todos .time').textContent, '0:00:25');
  assert.equal(byLabel('Stop timer for a').textContent, 'Stop');
});

test('completing a task under the Active filter moves focus to a row that stays', async (t) => {
  const { byLabel, add, rows } = await mountApp(t, '/?filter=active');
  add('a');
  add('b');
  const box = byLabel<HTMLInputElement>('Done: a');
  box.focus();
  box.click();
  flush();
  assert.deepEqual(rows(), ['b']);
  assertFocused(byLabel('Done: b'));
});

test('leaving the rename field saves and does not pull focus back', async (t) => {
  const { view, byLabel, add, rows } = await mountApp(t);
  add('tea');
  byLabel('Rename tea').click();
  flush();
  const edit = byLabel<HTMLInputElement>('New name for tea');
  edit.value = 'green tea';
  byLabel('Start timer for tea').focus(); // Tab to the next control
  flush();
  assert.deepEqual(rows(), ['green tea']);
  assertFocused(byLabel('Start timer for green tea'));
  assert.ok(!view.root.querySelector('.rename'), 'the editor closed');
});
