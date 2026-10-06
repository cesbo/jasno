<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# STRICT_READ_UNTRACKED

**warn**, runtime, dev builds: read in setup.

- Message: `Signal "{node}" was read directly in {region}; the value will not update.`
- Hint: Make it live: pass the signal or () => .... untracked() is only for values that must never update.

<!-- design.md: B12.4 -->
<!-- /generated:catalogue -->

Code read a signal directly while jasno was building UI. The signal can also be a computed or a resource field. This happens in a component body, a `show`/`match`/`each`/`catchError` callback, the `mount` view or a route view.

That code runs once. The value it reads is a snapshot: the page shows it and never updates when the signal changes. The dev build warns. In tests, a warning fails the test.

## Fix

Hand jasno a function instead of the current value. Then the signal stays live:

- Children and props: pass the signal or a function, `h.p(null, count)` or `title: () => t()`. Never pass `count()` or `t()`.
- A value computed from signals: `const total = computed(() => p.price() * p.qty())`, not `const total = p.price() * p.qty()`.
- A branch that depends on a signal (`if (open())` in setup): use `show(open, () => ...)` or `match(key, render)`.
- A prop for a child component: pass the `Read` (`count`, `() => user().name`). Do not pass the called value.
- A value that must never update, such as a draft's first text: read it with `untracked()`: `value: untracked(p.card).title`.

## Example

```ts
import { component, computed, h, type Read } from '@jasno/core';

// Wrong: the body reads the props once, so the total never changes.
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
