<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# SNAPSHOT_TO_ACCESSOR

**warn**, reported by jasno check (type-aware): in a setup region (the function given to component(), a show/match/catchError callback, an each render; jasno's names resolved through the file's imports) a zero-argument call of a signal or Read whose value lands, through any expression, in a live slot: an h.* prop typed MaybeRead<T> or an h child (h.p(null, count()), step: SAT(sw()) ? '1' : 'any', h.p(null, 'IF ' + f())); reported once per call at the innermost such slot, with the slot named in the message. Nested functions are not entered: handlers and () => bindings read signals rightly, and helper functions called from setup are the runtime's STRICT_READ_UNTRACKED job.

<!-- /generated:catalogue -->

Setup code calls a signal (`count()`) and the value lands where jasno accepts a live function: in an `h.*` child, or in a prop typed `MaybeRead<T>` such as `value`, `step` or `hidden`. Setup runs once: a component body, the `then`/`otherwise` function of `show`, the `render` of `match` or `each`, a `catchError` branch. So the element gets the value of that moment and never updates; in the dev build the same read also reports `STRICT_READ_UNTRACKED` when the branch runs. The call may sit anywhere in the slot's expression: `step: SAT(sw()) ? '1' : 'any'`, `h.p(null, 'IF ' + f() + ' MHz')`, `h.li(null, item().name)`.
<!-- design.md: (c) jasno check table; (e) jasno check 6; ADR-04 -->

## Fix

- Pass the signal itself: `h.p(null, count)`, `h.input({ value: name })`.
- For a derived value wrap the whole expression in a function (the hint prints it): `step: () => (SAT(sw()) ? '1' : 'any')`, `() => item().name`; or a `computed`.
- A value that must never update (seeding a draft input once) is `untracked(signal)`, which says so.

Nested functions are not entered: handlers (`onclick: () => count.set(count() + 1)`), live bindings (`() => count()`) and the first argument of `show`/`match`/`each` read signals rightly. A helper function called from setup is not followed either; the dev build's `STRICT_READ_UNTRACKED` covers it when it runs.

## Example

```ts
import { component, h, signal } from '@jasno/core';

// Wrong: count() is read once, so the button keeps saying 0; the title is read once too, inside its template
export const CounterWrong = component(function CounterWrong(): Node {
  const count = signal(0);
  return h.button({ type: 'button', title: `${count()} clicks`, onclick: () => count.update((n) => n + 1) }, 'Clicked ', count(), ' times');
});

// Right: pass the signal, and wrap the derived string in a function; jasno keeps both in sync
export const Counter = component(function Counter(): Node {
  const count = signal(0);
  return h.button({ type: 'button', title: () => `${count()} clicks`, onclick: () => count.update((n) => n + 1) }, 'Clicked ', count, ' times');
});
```

## Fixture

`test/cli/check.test.ts` › type-aware: SIGNAL_IN_TEMPLATE, SIGNAL_COERCED (+ and String()), SNAPSHOT_TO_ACCESSOR
`test/cli/spec/check.test.ts` › SNAPSHOT_TO_ACCESSOR reaches a signal call nested in a prop expression, a child built with +, a show callback (aliased import) and an each render; not a handler, a () => binding, the show condition or untracked()
