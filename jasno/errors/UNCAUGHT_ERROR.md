<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# UNCAUGHT_ERROR

**test failure**, jasno/testing: a reactive error reached report, or a promise an on* handler returned rejected, during the test.

- Message: `Reactive code in {ownerPath} threw: {message} (or The promise returned by the {type} handler in {ownerPath} threw: {message})`
- Hint: Fix the error, or wrap the subtree in catchError(() => ..., (err, reset) => ...).

<!-- design.md: B19.3, B19.6 -->
<!-- /generated:catalogue -->

Code that jasno runs for you threw during the test and no `catchError` region caught it: an effect, a binding, `onMount`, a cleanup, or a promise returned by an `on*` handler that rejected. In the app the error would only reach `reportError` and the console, and the user would never be told. The test fails with the original error as `cause`, and the message says where it came from: `Reactive code in <owner path> threw: ...` or `The promise returned by the click handler in <owner path> threw: ...`.

## Fix

- Read the `cause` (node:test prints it with its stack) and fix the bug. A frequent one: reading `value()` of a resource whose load failed, which throws the loader's error; gate on `hasValue()`.
- A handler whose async work can fail (a save, a delete): catch the error in the handler and show it to the user, instead of returning a promise that rejects.
- A subtree the page should survive (a chart, a widget, a panel of third-party data): wrap it in `catchError(() => Chart(), (err, reset) => ...)` with a visible fallback; `reset()` renders it again.

## Example

```ts
import { catchError, component, h, signal } from 'jasno';

declare function save(): Promise<void>;
declare const Chart: () => Node;

// Wrong: when save() fails, the promise the handler returns rejects and nothing handles it
export const SaveWrong = component(function SaveWrong(): Node {
  return h.button({ type: 'button', onclick: () => save() }, 'Save');
});

// Right: the handler catches the failure and says so in a status line
export const Save = component(function Save(): Node {
  const message = signal('');
  return h.div(null,
    h.button({ type: 'button', onclick: async () => {
      try { await save(); message.set('Saved'); } catch { message.set('Not saved. Try again.'); }
    } }, 'Save'),
    h.p({ role: 'status' }, message));
});

// Right, for a subtree that may throw while it renders or updates: a boundary with a visible fallback
export const Report = component(function Report(): Node {
  return h.section(null, catchError(() => Chart(), (_err, reset) =>
    h.p({ role: 'alert' }, 'The chart failed. ', h.button({ type: 'button', onclick: reset }, 'Retry'))));
});
```

## Fixture

`test/spec/elements.test.ts` › B15.7 a rejected handler promise fails settled() with UNCAUGHT_ERROR
