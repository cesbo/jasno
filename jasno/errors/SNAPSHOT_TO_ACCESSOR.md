<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# SNAPSHOT_TO_ACCESSOR

**warn**, reported by jasno check (type-aware): x() of a signal or Read passed in a component body (the function given to component()) where MaybeRead<T> is accepted or as an h child (h.p(null, count())); show/match/each callbacks are not checked (the runtime's STRICT_READ_UNTRACKED covers them).

<!-- /generated:catalogue -->

A component body calls a signal (`count()`) and passes the value where jasno accepts a live function: as an `h.*` child, or as a prop typed `MaybeRead<T>` such as `value`, `title` or `hidden`. The component body runs once, so the element gets the value of that moment and never updates; in the dev build the same read also reports `STRICT_READ_UNTRACKED`.
<!-- design.md: (c) jasno check table; (e) jasno check 6; ADR-04 -->

## Fix

- Pass the signal itself: `h.p(null, count)`, `h.input({ value: name })`.
- For a derived value pass a function or a `computed`: `() => count() * 2`.
- A value that must never update (seeding a draft input once) is `untracked(signal)`, which says so.

The rule looks at the component function's own body: calling signals inside handlers and inside functions you give to jasno is how they are meant to be read.

## Example

```ts
import { component, h, signal } from 'jasno';

// Wrong: count() is read once, so the button keeps saying 0
export const CounterWrong = component(function CounterWrong(): Node {
  const count = signal(0);
  return h.button({ type: 'button', onclick: () => count.update((n) => n + 1) }, 'Clicked ', count(), ' times');
});

// Right: pass the signal; jasno keeps the text in sync
export const Counter = component(function Counter(): Node {
  const count = signal(0);
  return h.button({ type: 'button', onclick: () => count.update((n) => n + 1) }, 'Clicked ', count, ' times');
});
```

## Fixture

`test/cli/check.test.ts` › type-aware: SIGNAL_IN_TEMPLATE, SIGNAL_COERCED (+ and String()), SNAPSHOT_TO_ACCESSOR
