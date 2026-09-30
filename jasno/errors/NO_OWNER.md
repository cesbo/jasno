<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NO_OWNER

**warn**, runtime, dev builds: effect/onMount/resource/component with no owner.

- Message: `{kind} created outside any owner at {loc}; it is never disposed.`
- Hint: Create it during setup or onMount; module-level app-lifetime work goes in createRoot(() => ...). signal() and computed() need no owner.

<!-- design.md: B6.8 -->
<!-- /generated:catalogue -->

An effect, `onMount` callback, resource or component was created while no owner was current: at module level, in an event handler, a timer or a cleanup, or after an `await`. Nothing will ever dispose it: an ownerless effect keeps running until you call its `stop()`, and a resource is never aborted and keeps reacting to its params. The dev build warns; in tests a warning fails the test.

## Fix

- Create it during setup (a component body or a `show`/`match`/`each` callback) or in `onMount`, so it is disposed with that owner.
- App-lifetime work at module level (app-wide data in `src/state.ts`): wrap it in `createRoot(() => ...)`.
- A handler that wants to start something: create it in setup and let the handler change a signal, for example `show(open, () => Details())` with `onclick: () => open.set(true)`.
- `signal()` and `computed()` need no owner and never report this.

## Example

```ts
import { createRoot, resource } from 'jasno';

interface Session { readonly user: string }
declare function getSession(abortSignal: AbortSignal): Promise<Session | null>;

// Wrong: a module-level resource has no owner
export const sessionWrong = resource({ loader: ({ abortSignal }) => getSession(abortSignal) });

// Right: app-lifetime work lives in createRoot
export const session = createRoot(() => resource({ loader: ({ abortSignal }) => getSession(abortSignal) }));
```

## Fixture

`test/spec/ownership.test.ts` › B6.8 effect, onMount, resource and component with no owner report NO_OWNER; createRoot, signal, computed do not
