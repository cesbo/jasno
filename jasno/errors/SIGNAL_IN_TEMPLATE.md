<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# SIGNAL_IN_TEMPLATE

**error**, reported by jasno check (type-aware): a value with a zero-parameter call signature (signal or Read) in a template literal.

<!-- /generated:catalogue -->

A signal or a `Read` prop sits uncalled inside a template literal: `` `Clicked ${count} times` ``. A signal is a function, so the string gets the function instead of its value: converting a signal throws `SIGNAL_COERCED` in the dev build, and otherwise the text shows the function's source code. Calling it inside the template is not enough on its own: a string built once never updates.
<!-- design.md: (c) jasno check table and runtime SIGNAL_COERCED; (e) jasno check 6 -->

## Fix

- Call it inside the template and wrap the whole string in a function, so the text stays live: `` () => `Clicked ${count()} times` ``.
- The same for props: `` 'aria-label': () => `Remove ${todo().text}` ``.
- `'n=' + count` and `String(count)` have the same problem and are reported as `SIGNAL_COERCED`.
- Tagged templates such as `css` are not checked.

## Example

```ts
import { component, h, signal } from '@jasno/core';

// Wrong: the text is the function, not the number
export const CounterWrong = component(function CounterWrong(): Node {
  const count = signal(0);
  return h.button({ type: 'button', onclick: () => count.update((n) => n + 1) }, `Clicked ${count} times`);
});

// Right: call it inside a function child, so the text updates on every click
export const Counter = component(function Counter(): Node {
  const count = signal(0);
  return h.button({ type: 'button', onclick: () => count.update((n) => n + 1) }, () => `Clicked ${count()} times`);
});
```

## Fixture

`test/cli/check.test.ts` › type-aware: SIGNAL_IN_TEMPLATE, SIGNAL_COERCED (+ and String()), SNAPSHOT_TO_ACCESSOR
