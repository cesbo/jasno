<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NO_OWNER

**warn**, runtime, dev builds: effect/onMount/resource/component with no owner.

- Message: `{kind} created outside any owner at {loc}; it is never disposed.`
- Hint: Create it during setup or onMount; module-level app-lifetime work goes in createRoot(() => ...). signal() and computed() need no owner.

<!-- design.md: B6.8 -->
<!-- /generated:catalogue -->

An effect, `onMount` callback, resource or component was created while no owner was current. This happens at module level, in an event handler, in a timer or a cleanup, or after an `await`.

Nothing will ever dispose it. An ownerless effect keeps running until you call its `stop()`. A resource is never aborted and keeps reacting to its params.

The dev build warns. In tests, a warning fails the test.

## Fix

- Create it during setup (a component body or a `show`/`match`/`each` callback) or in `onMount`. Then jasno disposes it with that owner.
- App-lifetime work at module level (app-wide data in `src/state.ts`): wrap it in `createRoot(() => ...)`.
- A handler that needs to start something: create it in setup. Let the handler change a signal. Example: `show(open, () => Details())` with `onclick: () => open.set(true)`.
- `signal()` and `computed()` need no owner and never report this.

## Example

```ts
import { createRoot, resource } from '@jasno/core';

interface Session { readonly user: string }
declare function getSession(abortSignal: AbortSignal): Promise<Session | null>;

// Wrong: a module-level resource has no owner
export const sessionWrong = resource({ loader: ({ abortSignal }) => getSession(abortSignal) });

// Right: app-lifetime work lives in createRoot
export const session = createRoot(() => resource({ loader: ({ abortSignal }) => getSession(abortSignal) }));
```

## Fixture

`test/spec/ownership.test.ts` › B6.8 effect, onMount, resource and component with no owner report NO_OWNER; createRoot, signal, computed do not
