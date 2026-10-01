<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# WRITE_IN_DERIVATION

**error (throws)**, runtime, dev and production builds: a signal is written in a derivation.

- Message: `Write to signal "{signal}" inside {kind} "{derivation}".`
- Hint: Derivations must be pure: compute it with computed()/linkedSignal(), or move the write to an event handler.

<!-- design.md: B5.1 -->
<!-- /generated:catalogue -->

A signal was written while jasno was computing a value: inside a `computed()`, a `linkedSignal` computation, a function passed as a live prop or child, a `show`/`match` condition, an `each` key function or resource `params`. These functions run whenever jasno needs their value, so a write there would change state as a side effect of reading it. jasno throws instead, in dev and production builds, and the write is not applied.

## Fix

Keep the computation pure and move the write somewhere else:

- A value that follows other state: give it its own `computed()` instead of setting it from another computation.
- State that resets when an input changes but can also be edited: `linkedSignal({ source: p.userId, computation: () => '' })`.
- A change the user causes: write it in the event handler.
- Wrapping the write in `untracked()` does not help: it exempts reads, not writes.

## Example

```ts
import { component, computed, h, signal, type Read } from '@jasno/core';

interface Item { readonly name: string; readonly price: number }

// Wrong: computing the total also writes another signal
export const CartWrong = component(function CartWrong(p: { items: Read<readonly Item[]> }): Node {
  const empty = signal(true);
  const total = computed(() => {
    const items = p.items();
    empty.set(items.length === 0);
    return items.reduce((sum, i) => sum + i.price, 0);
  });
  return h.p({ hidden: empty }, () => `Total: ${total()}`);
});

// Right: each value is its own computed
export const Cart = component(function Cart(p: { items: Read<readonly Item[]> }): Node {
  const empty = computed(() => p.items().length === 0);
  const total = computed(() => p.items().reduce((sum, i) => sum + i.price, 0));
  return h.p({ hidden: empty }, () => `Total: ${total()}`);
});
```

## Fixture

`test/core.test.ts` › B5.1 writes in a derivation throw WRITE_IN_DERIVATION, untracked does not exempt
