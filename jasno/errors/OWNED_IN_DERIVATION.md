<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# OWNED_IN_DERIVATION

**error (throws)**, runtime, dev and production builds: effect/resource/component/onMount/root/mount created in a derivation.

- Message: `{kind} created inside {derivation}; derivations have no owner.`
- Hint: Create it in setup or onMount; computed() stays pure.

<!-- design.md: B6.11 -->
<!-- /generated:catalogue -->

An effect, resource, component, `onMount` callback, `createRoot` or `mount()` was created inside a derivation: a `computed()`, a `linkedSignal` computation, a live binding function, a `show`/`match` condition, an `each` key function or resource `params`. Derivations re-run whenever jasno needs their value and have no owner, so nothing could ever dispose what they create; jasno throws, in dev and production builds. Wrapping the code in `untracked()` does not change this.

## Fix

- A resource that should reload when an input changes: create one resource in setup and read the input in `params: () => ...`; new params abort the old load.
- Content that changes with a value: `match(key, render)` or `show(when, then)`. Their callbacks are setup, so they may create components, effects and `onMount`, which die when the branch changes.
- Effects and `onMount`: create them in setup or in `onMount`; `computed()` stays pure.

## Example

```ts
import { component, computed, h, resource, show, type Read } from 'jasno';

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
