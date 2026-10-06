<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# FLUSH_REENTRANT

**error (throws)**, runtime, dev and production builds: flush() in a derivation or setup.

- Message: `flush() was called inside {context}.`
- Hint: Call flush() from tests, handlers, effects or onMount, never from computed() or setup.

<!-- design.md: B4.2 -->
<!-- /generated:catalogue -->

Code called `flush()` while jasno was building UI or computing a value. jasno throws an error in dev and production builds.

Building UI means running one of these:

- a component body
- a `show`/`match`/`each`/`catchError` callback
- the `mount` view

Computing a value means running one of these:

- a `computed()`
- a live binding function
- a `linkedSignal` computation
- an `each` key function

A flush there would run effects and DOM updates in the middle of that work.

## Fix

- In setup, remove the call. Bindings evaluate when they are created, so the DOM of a component is complete when it returns.
- In setup, put work that needs the nodes in the document in `onMount`. This includes measuring, focus and scrolling. `onMount` runs after jasno inserts the nodes.
- In a computed or binding function, remove the call. A computed only computes.
- Call `flush()` only in tests, event handlers, effects and `onMount`. For example, in a handler: write, call `flush()`, then measure the updated DOM.

## Example

```ts
import { component, flush, h, onMount } from '@jasno/core';

declare function report(height: number): void;

// Wrong: flush() in the component body, to measure the panel
export const PanelWrong = component(function PanelWrong(): Node {
  const panel = h.div({ class: 'panel' }, 'Content');
  flush();
  report(panel.getBoundingClientRect().height);
  return panel;
});

// Right: measure in onMount, after the panel is in the document
export const Panel = component(function Panel(): Node {
  const panel = h.div({ class: 'panel' }, 'Content');
  onMount(() => { report(panel.getBoundingClientRect().height); });
  return panel;
});
```

## Fixture

`test/spec/core.test.ts` › B4.2 flush() in setup throws FLUSH_REENTRANT: component body, mount view, untracked in setup
