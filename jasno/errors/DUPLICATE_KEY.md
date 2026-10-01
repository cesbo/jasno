<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# DUPLICATE_KEY

**warn**, runtime, dev builds: each saw a key twice.

- Message: `each() in {ownerPath} got key {key} more than once.`
- Hint: Keys must be unique and stable, e.g. (item) => item.id.

<!-- /generated:catalogue -->

The array given to `each()` had two items whose key function returned the same key. A key identifies one row, so only the first of those items keeps its row. Every later duplicate gets a new row on every update, losing focus and typed text, and the list usually shows the same item twice.

<!-- design.md: B11.5 -->

## Fix

- Key by a unique id, `key: (item) => item.id`, not by a name, title or other field that two items can share.
- Deduplicate lists merged from several sources by id when you merge them: history plus live pushes, or your own sends plus the server's echo of them.
- Give new items their id on the client when you create them (`crypto.randomUUID()`) and keep it through the save. The server's echo then replaces the item instead of adding it again.

## Example

```ts
import { component, each, h, signal } from '@jasno/core';

interface Msg { readonly id: string; readonly text: string }
export const messages = signal<readonly Msg[]>([]);

// Wrong: a message already in the list (the echo of our own send) is appended again
export function receiveWrong(m: Msg): void {
  messages.update((a) => [...a, m]);
}

// Right: merge by id; the echo replaces the item it duplicates
export function receive(m: Msg): void {
  messages.update((a) => (a.some((x) => x.id === m.id) ? a.map((x) => (x.id === m.id ? m : x)) : [...a, m]));
}

export const MessageLog = component(function MessageLog(): Node {
  return h.ol({ role: 'log', 'aria-label': 'Messages' },
    each(messages, { key: (m) => m.id, render: (m) => h.li(null, () => m().text) }));
});
```

## Fixture

`test/spec/recipes.test.ts` › Chat/log claim: merging without deduplication warns DUPLICATE_KEY
