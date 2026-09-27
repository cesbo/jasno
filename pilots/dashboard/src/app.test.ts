import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush } from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { App } from './app.ts';
import { router } from './routes.ts';
import { pollMs } from './state.ts';

test('settings chooses the polling interval; navigation focuses the new heading', async (t) => {
  history.replaceState(null, '', '/settings');
  const view = mountTest(t, () => App());
  await settled();
  assert.equal(view.root.querySelector('h1')!.textContent, 'Settings');
  assert.equal(view.root.querySelector('a[aria-current="page"]')!.textContent, 'Settings');

  const ten = [...view.root.querySelectorAll('label')].find((l) => l.textContent.includes('10 seconds'))!.querySelector('input')!;
  ten.click();
  flush();
  assert.equal(pollMs(), 10_000);
  assert.equal(localStorage.getItem('pollMs'), '10000');
  assert.match(view.root.querySelector('[role="status"]')!.textContent, /every 10 seconds/);

  await router.navigate('/');
  await settled();
  const h1 = view.root.querySelector('h1')!;
  assert.equal(h1.textContent, 'Dashboard');
  assert.ok(document.activeElement === h1, 'router focuses the new view heading');
  assert.equal(view.root.querySelectorAll('.widget').length, 4);
});
