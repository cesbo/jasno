<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# PENDING_READ_UNTRACKED

**error (throws)**, runtime, dev builds: value() read in setup while idle/loading.

- Message: `Resource "{node}" was read in {region} while {status}; that snapshot would stay undefined.`
- Hint: Read it inside a function: show(() => r.hasValue() && r.value(), (v) => ...).

<!-- design.md: B12.4 -->
<!-- /generated:catalogue -->

Setup code called a resource's `value()` before the resource had a value. The resource status was idle or loading.

Setup code is a component body, a `show`/`match`/`each`/`catchError` builder, or the mount or route view.

Setup runs only once. The read would capture `undefined`, so the page would never show the data. Dev builds throw instead.

## Fix

Read the value inside a function that jasno re-runs. Gate the content on `hasValue()`:

- Content that needs the data: `show(() => r.hasValue() && r.value(), (v) => ...)`. Inside the builder, read `v()` in functions: `() => v().name`.
- Loading and error states: give each its own region, such as `show(r.isLoading, ...)` or `show(() => r.status() === 'error', ...)`.
- A route view that cannot render without the data: load it in the route's `loader`. Read `p.data()` in functions.

Once the resource has a value, the same setup read reports `STRICT_READ_UNTRACKED` instead. The fix is the same.

jasno does not check reads inside `untracked()` or in `onMount`.

## Example

```ts
import { component, h, resource, show, type Read } from '@jasno/core';

interface User { readonly name: string }
declare function getUser(id: string, signal: AbortSignal): Promise<User>;

// Wrong: value() in the component body, while the first load is still running
export const UserCardWrong = component(function UserCardWrong(p: { id: Read<string> }): Node {
  const user = resource({ params: () => p.id(), loader: ({ params, abortSignal }) => getUser(params, abortSignal) });
  return h.h2(null, user.value()?.name ?? '');
});

// Right: gate on hasValue() and read inside functions
export const UserCard = component(function UserCard(p: { id: Read<string> }): Node {
  const user = resource({ params: () => p.id(), loader: ({ params, abortSignal }) => getUser(params, abortSignal) });
  return show(() => user.hasValue() && user.value(), (u) => h.h2(null, () => u().name),
    () => h.p({ role: 'status' }, 'Loading'));
});
```

## Fixture

`test/spec/resource.test.ts` › B9.11 value() in component setup while loading throws PENDING_READ_UNTRACKED; mount rethrows
