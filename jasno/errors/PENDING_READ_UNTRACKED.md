<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# PENDING_READ_UNTRACKED

**error (throws)**, runtime, dev builds: value() read in setup while idle/loading.

- Message: `Resource "{node}" was read in {region} while {status}; that snapshot would stay undefined.`
- Hint: Read it inside a function: show(() => r.hasValue() && r.value(), (v) => ...).

<!-- design.md: B12.4 -->
<!-- /generated:catalogue -->

Setup code (a component body, a `show`/`match`/`each`/`catchError` builder, the mount or route view) called a resource's `value()` before the resource had a value, while its status was idle or loading. Setup runs only once, so the read would capture `undefined` and the page would never show the data. Dev builds throw instead.

## Fix

Read the value inside a function that jasno re-runs, and gate content on `hasValue()`:

- Content that needs the data: `show(() => r.hasValue() && r.value(), (v) => ...)`. Inside the builder, read `v()` in functions: `() => v().name`.
- Loading and error states get their own regions: `show(r.isLoading, ...)`, `show(() => r.status() === 'error', ...)`.
- A route view that cannot render without the data: load it in the route's `loader` and read `p.data()` in functions.

Once the resource has a value, the same setup read reports `STRICT_READ_UNTRACKED` instead, and the fix is the same. Reads inside `untracked()` and in `onMount` are not checked.

## Example

```ts
import { component, h, resource, show, type Read } from 'jasno';

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
