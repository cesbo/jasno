<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# CURRENT_TARGET_AFTER_AWAIT

**error**, reported by jasno check: <param>.currentTarget that an await or for await precedes on some path (an await in a block that returns or throws precedes only that block) in an on* handler: an on* prop or method of an h.*/svg props object, an addEventListener callback or an el.onx = ... assignment (the DOM sets it to null).

<!-- /generated:catalogue -->

An async event handler reads `e.currentTarget` after an `await`. The DOM sets `currentTarget` to null once the handler returns, which it does at its first `await`, so the read gives null and the next property access throws a TypeError. TypeScript types `currentTarget` as the element, so tsc cannot catch this.
<!-- design.md: (c) jasno check table; (e) jasno check 5; ADR-03 -->

## Fix

- Copy the element to a const before the first `await` (`const form = e.currentTarget;`) and use the const afterwards.
- An `await` inside a block that ends in `return` or `throw` (an early exit) counts only for code inside that block.

The rule checks `on*` props and methods of `h.*` and `svg()` props objects, `addEventListener` callbacks and `el.onclick = ...` assignments.

## Example

```ts
import { h } from 'jasno';

declare function send(): Promise<void>;

// Wrong: after the await, e.currentTarget is null and reset() throws
export const formWrong = h.form({ onsubmit: async (e) => {
  e.preventDefault();
  await send();
  e.currentTarget.reset();
} }, h.input({ name: 'message', 'aria-label': 'Message' }), h.button({ type: 'submit' }, 'Send'));

// Right: capture the element before the first await
export const form = h.form({ onsubmit: async (e) => {
  e.preventDefault();
  const el = e.currentTarget;
  await send();
  el.reset();
} }, h.input({ name: 'message', 'aria-label': 'Message' }), h.button({ type: 'submit' }, 'Send'));
```

## Fixture

`test/cli/check.test.ts` › CURRENT_TARGET_AFTER_AWAIT: only after the first await
