<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# STRICT_READ_UNTRACKED

**warn**, runtime, dev builds: read in setup.

- Message: `Signal "{node}" was read directly in {region}; the value will not update.`
- Hint: Make it live: pass the signal or () => .... untracked() is only for values that must never update.

<!-- design.md: B12.4 -->
<!-- /generated:catalogue -->

A signal (or a computed, or a resource field) was read directly while jasno was building UI: in a component body, a `show`/`match`/`each`/`catchError` callback, the `mount` view or a route view. That code runs once, so the value read there is a snapshot: the page shows it and never updates when the signal changes. The dev build warns; in tests a warning fails the test.

## Fix

Keep the signal live by handing jasno a function instead of its current value:

- Children and props: pass the signal or a function, `h.p(null, count)` or `title: () => t()`, never `count()` or `t()`.
- A value computed from signals: `const total = computed(() => p.price() * p.qty())`, not `const total = p.price() * p.qty()`.
- A branch that depends on a signal (`if (open())` in setup): `show(open, () => ...)` or `match(key, render)`.
- A prop for a child component: pass the `Read` (`count`, `() => user().name`), not the called value.
- Only a value that must never update, such as a draft's first text, is read with `untracked()`: `value: untracked(p.card).title`.

## Example

```ts
import { component, computed, h, type Read } from '@jasno/core';

// Wrong: the body reads the props once; the total never changes
export const TotalWrong = component(function TotalWrong(p: { price: Read<number>; qty: Read<number> }): Node {
  const total = p.price() * p.qty();
  return h.p(null, `Total: ${total}`);
});

// Right: a computed, shown by a live text function
export const Total = component(function Total(p: { price: Read<number>; qty: Read<number> }): Node {
  const total = computed(() => p.price() * p.qty());
  return h.p(null, () => `Total: ${total()}`);
});
```

## Fixture

`test/spec/recipes.test.ts` › AGENTS claim: h.p(null, count()) never updates and reports STRICT_READ_UNTRACKED; h.p(null, count) updates
