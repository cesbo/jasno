<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# EXPECTED_DIAGNOSTIC_MISSING

**test failure**, @jasno/core/testing: a code in expect never occurred.

- Message: `Expected diagnostic {code} did not occur.`
- Hint: Remove it from expect, or make the test reach that case.

<!-- /generated:catalogue -->

The test passed `{ expect: [...] }` to `mountTest`, but the code the message names was never reported while the view was mounted. Either the test no longer reaches the case it was written to check, or the component was fixed and the expectation is stale; the test fails so that a test about a warning cannot pass without the warning.

## Fix

- The component was fixed on purpose: remove the code from `expect` (and drop the option when the list is empty).
- The test should reproduce it: make it reach the case. Do what a user would do first (focus the element before the update that should report `FOCUS_LOST`), and after the last change call `flush()` or `await settled()`, so the update runs before the view is unmounted and checked.
- `expect` accepts only codes that correct code can trigger; a code that always means broken code is a type error there.

## Example

```ts
import { test } from 'node:test';
import { flush, h, show, signal } from '@jasno/core';
import { mountTest } from '@jasno/core/testing';

// Wrong: the button never had focus, so hiding it reports nothing
test('hiding Next reports FOCUS_LOST', (t) => {
  const on = signal(true);
  mountTest(t, () => h.div(null, show(on, () => h.button({ type: 'button' }, 'Next'))), { expect: ['FOCUS_LOST'] });
  on.set(false);
  flush();
});

// Right: focus it as a user would, then hide it
test('hiding the focused Next button reports FOCUS_LOST', (t) => {
  const on = signal(true);
  const view = mountTest(t, () => h.div(null, show(on, () => h.button({ type: 'button' }, 'Next'))), { expect: ['FOCUS_LOST'] });
  view.root.querySelector('button')!.focus();
  on.set(false);
  flush();
});
```

## Fixture

`test/spec/devtest.test.ts` › B19.4 expect: a listed code that occurs is accepted; one that never occurs fails with EXPECTED_DIAGNOSTIC_MISSING
