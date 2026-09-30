<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# ROUTER_NOT_STARTED

**error (throws)**, runtime, dev and production builds: navigate() or back() before outlet() rendered, or after its owner was disposed.

- Message: `router.{method}("{url}") was called before router.outlet() was rendered.`
- Hint: Mount the app first; in tests mountTest(t, () => App()) before navigate().

<!-- design.md: B17.3, B17.13 -->
<!-- /generated:catalogue -->

`router.navigate()` or `router.back()` was called while no `router.outlet()` of that router was rendered, either before the app mounted or after the outlet was disposed. The router starts only when its outlet renders, so the call throws right away (in both builds) instead of returning a promise.

<!-- design.md: B17.3, B17.13 -->

## Fix

Navigate only while the app with the outlet is mounted:

- Tests: render the app first. Set the start URL with `history.replaceState(null, '', '/')`, call `mountTest(t, () => App())`, `await settled()`, then `await router.navigate(url)`.
- Startup code (`src/main.ts`, module level): do not navigate before `mount()`. The outlet renders the current URL by itself. Put a redirect (a guard, an index route) in the route's loader: `if (!session()) { void router.navigate('/login', { replace: true }); return null; }`.
- A login wall (`show(session, () => router.outlet(), () => Login())`): `session.set(user)` builds the outlet only in the next flush, so a `navigate()` in the same handler throws. When the outlet appears it renders the current URL. To go to another page, call `flush()` after `session.set(user)`, then navigate.
- After `unmount()`, or after a `show()` or `match()` that held the outlet switched away, the router has stopped again.

## Example

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Router } from 'jasno/router';
import { mountTest, settled } from 'jasno/testing';

declare const router: Router<'/' | '/users/:id'>;
declare function App(): Node;

// Wrong: nothing has rendered router.outlet() yet
test('opens a user (wrong)', async () => {
  await router.navigate('/users/1');   // throws ROUTER_NOT_STARTED
});

// Right: mount the app, which renders the outlet, then navigate
test('opens a user', async (t) => {
  history.replaceState(null, '', '/');
  const view = mountTest(t, () => App());
  await settled();
  await router.navigate('/users/1');
  assert.equal(view.root.querySelector('h1')?.textContent, 'Ada');
});
```

## Fixture

`test/router.test.ts` › B17.3/B17.13 ROUTER_NOT_STARTED before outlet(); OUTLET_ALREADY_ACTIVE for a second outlet; disposal stops listening
