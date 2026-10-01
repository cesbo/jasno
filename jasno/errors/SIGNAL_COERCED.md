<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# SIGNAL_COERCED

**error (TypeError)**, runtime, dev builds: a signal converted to a primitive.

- Message: `Signal "{node}" was used as a value.`
- Hint: Call it: ${count()}, count() + 1.

**error**, reported by jasno check (type-aware): a value with a zero-parameter call signature (signal or Read) in + concatenation with a string or in String().

<!-- /generated:catalogue -->

A signal was used as if it were its value: concatenated with `+`, passed to `String()`, put in a template literal or compared. A signal is a function, so the text would be its source code (the production build prints exactly that), and tsc accepts all of these. The dev build throws a `TypeError` when a signal, computed or resource field is converted, and `jasno check` reports `+` concatenation and `String()` on anything with a zero-parameter call signature (a signal or a `Read` prop; a template literal gets `SIGNAL_IN_TEMPLATE`).

## Fix

- Call it: `count() + 1`, `String(count())`, `` `${count()}` ``.
- To keep the text live, wrap the whole expression in a function: `h.p(null, () => 'Total: ' + total())`, or pass the parts as separate children: `h.p(null, 'Total: ', total)`.
- A `Read` prop (`p.label`) is a function too: `'Hi ' + p.label()` inside a function.

## Example

```ts
import { component, h, signal } from '@jasno/core';

// Wrong: the signal itself is concatenated (TypeError in dev; jasno check reports SIGNAL_COERCED)
export const CounterWrong = component(function CounterWrong(): Node {
  const count = signal(0);
  return h.button({ type: 'button', onclick: () => count.update((n) => n + 1) }, 'Clicked ' + count + ' times');
});

// Right: call it inside a function, so the text stays live
export const Counter = component(function Counter(): Node {
  const count = signal(0);
  return h.button({ type: 'button', onclick: () => count.update((n) => n + 1) }, () => 'Clicked ' + count() + ' times');
});
```

## Fixture

`test/core.test.ts` › SIGNAL_COERCED: a signal used as a value throws a TypeError in dev
`test/cli/check.test.ts` › type-aware: SIGNAL_IN_TEMPLATE, SIGNAL_COERCED (+ and String()), SNAPSHOT_TO_ACCESSOR
