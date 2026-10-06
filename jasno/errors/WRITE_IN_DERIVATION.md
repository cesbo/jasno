<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# WRITE_IN_DERIVATION

**error (throws)**, runtime, dev and production builds: a signal is written in a derivation.

- Message: `Write to signal "{signal}" inside {kind} "{derivation}".`
- Hint: Derivations must be pure: compute it with computed()/linkedSignal(), or move the write to an event handler.

<!-- design.md: B5.1 -->
<!-- /generated:catalogue -->

Code wrote a signal while jasno was computing a value. This happens inside one of these:

- a `computed()`
- a `linkedSignal` computation
- a function passed as a live prop or child
- a `show`/`match` condition
- an `each` key function
- resource `params`

jasno runs these functions whenever it needs their value. A write there would change state as a side effect of a read. So jasno throws, in dev and production builds. The write is not applied.

## Fix

Keep the function pure. Move the write somewhere else:

- A value that follows other state: give it its own `computed()`. Do not set it from another computed.
- State that resets when an input changes but can also be edited: use `linkedSignal({ source: p.userId, computation: () => '' })`.
- A change the user causes: write it in the event handler.
- Do not wrap the write in `untracked()`. It exempts reads, not writes.

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
