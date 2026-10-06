<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# OWNED_IN_DERIVATION

**error (throws)**, runtime, dev and production builds: effect/resource/component/onMount/root/mount created in a derivation.

- Message: `{kind} created inside {derivation}; derivations have no owner.`
- Hint: Create it in setup or onMount; computed() stays pure.

<!-- design.md: B6.11 -->
<!-- /generated:catalogue -->

Your code created an effect, resource, component, `onMount` callback, `createRoot` or `mount()` inside a derivation.

A derivation is one of these:

- a `computed()`
- a `linkedSignal` computation
- a live binding function
- a `show`/`match` condition
- an `each` key function
- resource `params`

A derivation re-runs whenever jasno needs its value. It has no owner. Nothing could ever dispose what it creates, so jasno throws. It throws in dev and production builds.

Wrapping the code in `untracked()` does not change this.

## Fix

- A resource that must reload when an input changes: create one resource in setup. Read the input in `params: () => ...`. New params abort the old load.
- Content that changes with a value: use `match(key, render)` or `show(when, then)`. Their callbacks are setup. They may create components, effects and `onMount`. These die when the branch changes.
- Effects and `onMount`: create them in setup or in `onMount`. Keep `computed()` pure.

## Example

```ts
import { component, computed, h, resource, show, type Read } from '@jasno/core';

interface User { readonly name: string }
declare function getUser(id: string, abortSignal: AbortSignal): Promise<User>;

// Wrong: a new resource inside computed() whenever the id changes
export const UserCardWrong = component(function UserCardWrong(p: { id: Read<string> }): Node {
  const user = computed(() => {
    const id = p.id();
    return resource({ loader: ({ abortSignal }) => getUser(id, abortSignal) });
  });
  return h.p(null, () => user().status());
});

// Right: one resource, keyed by params
export const UserCard = component(function UserCard(p: { id: Read<string> }): Node {
  const user = resource({ params: () => p.id(), loader: ({ params, abortSignal }) => getUser(params, abortSignal) });
  return show(() => user.hasValue() && user.value(), (u) => h.p(null, () => u().name), () => h.p(null, 'Loading'));
});
```

## Fixture

`test/spec/ownership.test.ts` › B6.11 effect, onMount, resource, component and createRoot inside computed, untracked-in-computed, bindings and linkedSignal throw OWNED_IN_DERIVATION
