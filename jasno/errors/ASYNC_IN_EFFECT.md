<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# ASYNC_IN_EFFECT

**warn**, reported by jasno check: a jasno effect() callback that, during its run, calls fetch, uses .then( or runs an async function (callbacks and listeners it only installs do not count): use resource().

<!-- /generated:catalogue -->

An `effect()` callback starts async work while it runs: the callback is async, calls `fetch`, chains `.then(`, or runs an async function. An effect re-runs whenever a signal it read changes, so an answer for old input can arrive after the answer for new input and overwrite it, and the work is not cancelled when the input changes or the component goes away. Callbacks and listeners the effect only installs (a timer, an event listener) do not count.
<!-- design.md: (c) jasno check table; (e) jasno check 5; ADR-09, ADR-15 -->

## Fix

- Loading data: `resource({ params, loader })`. `params` is tracked; the loader gets an `abortSignal`, new params abort the old load and stale results are dropped. Resolve `null` for "no data", never `undefined`.
- Work that follows a user action (a save): run it in the event handler.
- A subscription whose callback sets signals: start it in `onMount`.

## Example

```ts
import { component, effect, h, resource, show, signal, type Read } from '@jasno/core';

interface User { readonly name: string }
declare function getUser(id: string, abortSignal?: AbortSignal): Promise<User>;

// Wrong: a slow answer for an old id can land last, and nothing cancels it
export const ProfileWrong = component(function ProfileWrong(p: { id: Read<string> }): Node {
  const user = signal<User | null>(null);
  effect(() => { void getUser(p.id()).then(user.set); });
  return h.p(null, () => user()?.name ?? 'Loading');
});

// Right: a resource aborts the old load when the id changes
export const Profile = component(function Profile(p: { id: Read<string> }): Node {
  const user = resource({ params: () => p.id(), loader: ({ params, abortSignal }) => getUser(params, abortSignal) });
  return show(() => user.hasValue() && user.value(), (u) => h.p(null, () => u().name), () => h.p({ role: 'status' }, 'Loading'));
});
```

## Fixture

`test/cli/check.test.ts` › ASYNC_IN_EFFECT (warn)
