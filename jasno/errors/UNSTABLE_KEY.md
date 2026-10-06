<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# UNSTABLE_KEY

**warn**, runtime, dev builds: the key function disagreed with itself.

- Message: `each() key in {ownerPath} returned {a}, then {b} for the same item.`
- Hint: Derive the key from the item, (item) => item.id; no random values, counters or Date.now().

<!-- design.md: B11.1 -->
<!-- /generated:catalogue -->

The key function given to `each()` returned two different keys for the same item. Dev builds call the key function twice for every new or changed item to check this.

A key that changes from call to call makes each update look like a list of new items. jasno then rebuilds every row. Each rebuilt row drops focus, typed text and other row state.

## Fix

- Derive the key from the item's own data: `key: (item) => item.id`.
- Never generate a key inside the key function. Do not use `Math.random()`, `crypto.randomUUID()`, `Date.now()` or counters there.
- Give an item without an id one when you create it (`{ id: crypto.randomUUID(), text }`). The item keeps that id.
- The index is stable too. Then a row belongs to a position, not to an item. After a removal or a reorder, rows show different items.

## Example

```ts
import { component, each, h, type Read } from '@jasno/core';

interface Todo { readonly id: string; readonly text: string }

// Wrong: the key is new on every call.
export const ListWrong = component(function ListWrong(p: { todos: Read<readonly Todo[]> }): Node {
  return h.ul(null, each(p.todos, { key: () => crypto.randomUUID(), render: (t) => h.li(null, () => t().text) }));
});

// Right: the key comes from the item, and the id is assigned once at creation.
export const List = component(function List(p: { todos: Read<readonly Todo[]> }): Node {
  return h.ul(null, each(p.todos, { key: (t) => t.id, render: (t) => h.li(null, () => t().text) }));
});
export const newTodo = (text: string): Todo => ({ id: crypto.randomUUID(), text });
```

## Fixture

`test/spec/lists.test.ts` › B11.1 UNSTABLE_KEY names both results; a key that uses the index is stable
