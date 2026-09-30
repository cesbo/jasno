import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountTest, settled } from 'jasno/testing';
import { App } from './app.ts';
import { router } from './routes.ts';

test('the home page renders; navigating to About focuses its heading', async (t) => {
  history.replaceState(null, '', '/');
  const view = mountTest(t, () => App());
  await settled(); // the lazy view module
  assert.equal(view.root.querySelector('h1')?.textContent, 'Home');
  await router.navigate('/about');
  const h1 = view.root.querySelector('h1');
  assert.equal(h1?.textContent, 'About');
  assert.ok(document.activeElement === h1, 'the router focuses the new page heading'); // compare nodes with ===
});
