<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# WRITE_IN_SETUP

**warn**, runtime, dev builds: setup wrote a signal it did not create.

- Message: `Setup of {region} wrote "{signal}".`
- Hint: Rendering must not change other state: move the write to onMount() or a handler, or derive it.

<!-- design.md: B5.4 -->
<!-- /generated:catalogue -->

While jasno was building UI (a component body, a `show`/`match`/`each`/`catchError` callback, the `mount` view), code wrote a signal that this setup did not create: a module-level signal, or a parent's signal passed down as a prop. The write is applied, but rendering one part of the page then changes what other parts show. The dev build warns; in tests a warning fails the test.

## Fix

- Initial state: create the signal with its initial value, or derive it with `computed()` or `linkedSignal()`.
- A view that publishes something to the shell (a heading in the app header): write it in `onMount` and reset it in the cleanup `onMount` returns.
- A change the user causes: write it in the event handler.
- Setup may write signals it created itself. Wrapping the write in `untracked()` does not help: it exempts reads, not writes.

## Example

```ts
import { component, h, onMount, type WritableSignal } from '@jasno/core';

declare const pageTitle: WritableSignal<string>; // from src/state.ts, shown in the app header

// Wrong: the view writes shared state while it renders
export const SettingsWrong = component(function SettingsWrong(): Node {
  pageTitle.set('Settings');
  return h.h1(null, 'Settings');
});

// Right: publish in onMount and reset in its cleanup
export const Settings = component(function Settings(): Node {
  onMount(() => {
    pageTitle.set('Settings');
    return () => pageTitle.set('');
  });
  return h.h1(null, 'Settings');
});
```

## Fixture

`test/spec/core.test.ts` › B5.4 setup writing a signal it did not create reports WRITE_IN_SETUP and applies the write
