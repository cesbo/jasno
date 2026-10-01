<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# TLA_OUTSIDE_ENTRY

**error**, reported by jasno check: top-level await outside the entry named in index.html (Safari < 27 partial).

<!-- /generated:catalogue -->

A browser module other than the entry that `index.html` imports (normally `src/main.ts`) uses `await` or `for await` at its top level. Safari before version 27 supports top-level await only partially outside the entry module, so the app may not load correctly there even though it works elsewhere. The entry itself may await.
<!-- design.md: (c) jasno check table; (e) jasno check 3, 5 -->

## Fix

- Data the app needs: make it an app-wide resource in `createRoot` (in `src/state.ts`) and render the views that need it once `hasValue()` is true.
- Setup that must finish before the first render: export an async function and await it in `src/main.ts`, before `mount(...)`.
- Anything else: move the `await` into the function that uses the value.

## Example

```ts
import { createRoot, resource } from '@jasno/core';

interface Settings { readonly theme: string }
declare function getSettings(abortSignal: AbortSignal): Promise<Settings>;

// Wrong: src/settings.ts awaits at its top level
export const settingsWrong = await getSettings(AbortSignal.timeout(10_000));

// Right: an app-wide resource; views render once settings.hasValue() is true
export const settings = createRoot(() => resource({ loader: ({ abortSignal }) => getSettings(abortSignal) }));
```

## Fixture

`test/cli/check.test.ts` › TLA_OUTSIDE_ENTRY: top-level await outside the entry; the entry and awaits inside functions are fine
