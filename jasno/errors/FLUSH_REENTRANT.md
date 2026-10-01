<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# FLUSH_REENTRANT

**error (throws)**, runtime, dev and production builds: flush() in a derivation or setup.

- Message: `flush() was called inside {context}.`
- Hint: Call flush() from tests, handlers, effects or onMount, never from computed() or setup.

<!-- design.md: B4.2 -->
<!-- /generated:catalogue -->

`flush()` was called while jasno was building UI (a component body, a `show`/`match`/`each`/`catchError` callback, the `mount` view) or computing a value (a `computed()`, a live binding function, a `linkedSignal` computation, an `each` key function). Flushing there would run effects and DOM updates in the middle of that work, so jasno throws, in dev and production builds.

## Fix

- In setup, remove it: bindings evaluate when they are created, so a component's DOM is complete when it returns. Work that needs the nodes in the document (measuring, focus, scrolling) goes in `onMount`, which runs after they are inserted.
- In a computed or binding function, remove it: derivations only compute.
- `flush()` belongs in tests, event handlers, effects and `onMount`: for example write, `flush()`, then measure the updated DOM in a handler.

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
