<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# CONTEXT_OUTSIDE_OWNER

**error (throws)**, runtime, dev and production builds: useContext with no owner.

- Message: `useContext("{name}") was called outside component setup.`
- Hint: Call it during setup and keep the value in a const; handlers and code after await have no owner.

<!-- design.md: B13.3 -->
<!-- /generated:catalogue -->

`useContext` was called when no component was being set up: in an event handler, a timer or a cleanup, after an `await`, inside a `computed()` or a live binding function, or at module level. Context is found through the owner tree, and that code runs with no current owner, so jasno throws (dev and production builds).

## Fix

Call `useContext` in the component body (or in `onMount`, which runs with the component as owner), keep the result in a `const`, and use the const in handlers, async code and computeds. The value is stored as-is, so a const taken in setup stays correct; to share changing data, provide a signal.

## Example

```ts
import { component, createContext, h, useContext } from '@jasno/core';

const Toast = createContext<(msg: string) => void>('Toast');
declare function save(): Promise<void>;

// Wrong: the handler runs with no owner, so useContext throws
export const SaveWrong = component(function SaveWrong(): Node {
  return h.button({ type: 'button', onclick: async () => {
    await save();
    useContext(Toast)('Saved');
  } }, 'Save');
});

// Right: look it up during setup and keep the const
export const Save = component(function Save(): Node {
  const toast = useContext(Toast);
  return h.button({ type: 'button', onclick: async () => {
    await save();
    toast('Saved');
  } }, 'Save');
});
```

## Fixture

`test/spec/elements.test.ts` › B13.3 CONTEXT_OUTSIDE_OWNER in a handler, after await, in a computed and in a binding
