<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# SETTLE_TIMEOUT

**test failure**, @jasno/core/testing: settled() timed out.

- Message: `settled() timed out after {ms} ms; pending: {list}.`
- Hint: Stub fetch or provide a fake service; raise timeout only for slow real work.

<!-- /generated:catalogue -->

`await settled()` waited for its timeout, and work was still pending. The timeout is 2,000 ms unless you pass `timeout`.

The message lists the pending work:

- `loader of <name>`: a resource. The name is its `debugName`, or `resource#N` without one.
- `initial navigation` or `navigation to /path`: the router.
- `click handler in <Owner>`: a promise that an `on*` handler returned.
- `the flush queue`.

Usually the code under test waits for a real server, a mocked timer, or a promise the test never settles.

## Fix

- Real network: stub `fetch` before `mountTest`. Or `provide()` a fake service through context. Or import the API from a `#api` mock module. `npm test` gets this module through the `development` condition.
- A promise the test holds on purpose, to check a "Loading" state: assert with `await waitFor(() => ...)`. It does not wait for pending work. Then settle the promise and `await settled()`.
- `mock.timers`: work that waits on a mocked `setTimeout` stays pending until `t.mock.timers.tick(ms)`. Tick before `await settled()`.
- Give resources a `debugName`. Then the message says which one is pending.
- Raise `settled({ timeout })` only for real work that is slow.

## Example

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { component, createContext, h, provide, resource, useContext } from '@jasno/core';
import { mountTest, settled, waitFor } from '@jasno/core/testing';

interface Api { listBooks(signal: AbortSignal): Promise<readonly string[]> }
const ApiContext = createContext<Api>('Api');

const Books = component(function Books(): Node {
  const api = useContext(ApiContext);
  const books = resource({ debugName: 'books', loader: ({ abortSignal }) => api.listBooks(abortSignal) });
  return h.p({ role: 'status' }, () => (books.hasValue() ? books.value().join(', ') : 'Loading books'));
});

// Wrong: the test holds the loader to see "Loading", but settled() waits for it:
// "settled() timed out after 2000 ms; pending: loader of books."
test('shows Loading while the books load', async (t) => {
  const view = mountTest(t, () => provide(ApiContext, { listBooks: () => new Promise(() => {}) }, () => Books()));
  await settled();
  assert.equal(view.root.textContent, 'Loading books');
});

// Right: waitFor checks "Loading" without waiting for the loader. Then the fake answers.
test('shows Loading, then the books', async (t) => {
  let answer = (_books: readonly string[]): void => {};
  const view = mountTest(t, () => provide(ApiContext, { listBooks: () => new Promise((resolve) => { answer = resolve; }) }, () => Books()));
  await waitFor(() => assert.equal(view.root.textContent, 'Loading books'));
  answer(['Dune']);
  await settled();
  assert.equal(view.root.textContent, 'Dune');
});
```

## Fixture

`test/spec/devtest.test.ts` › B19.6 SETTLE_TIMEOUT names a pending loader by debugName and a pending handler by event type and owner path
