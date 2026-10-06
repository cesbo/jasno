<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# OUTLET_ALREADY_ACTIVE

**error (throws)**, runtime, dev and production builds: a second live router.outlet().

- Message: `router.outlet() is already rendered in {ownerPath}.`
- Hint: Render router.outlet() exactly once, in App.

<!-- /generated:catalogue -->

`router.outlet()` was called while another outlet of the same router was still rendered. A router drives exactly one outlet. The router renders the current route's view there. So a second call throws, in both builds.

When the second call is inside a view, the router's error view shows this error instead of the page.

<!-- design.md: B17.3 -->

## Fix

Render `router.outlet()` once, in App: `h.main(null, router.outlet())`. Then remove whatever renders it a second time:

- A view or layout that renders `router.outlet()` for nested routes. jasno has no nested outlets. Give each route its own view that uses a shared layout component. Switch sub-pages on a param: `route('/settings/:tab(profile|billing)', ...)` with `match(() => p.params().tab, ...)` in the view.
- App mounted twice, for example two `mountTest()` calls in one test. Mount it once. After an outlet is disposed (`unmount()`, the end of a test), the router can render a new one.

## Example

```ts
import { component, h, match } from '@jasno/core';
import type { Router, ViewProps } from '@jasno/core/router';

declare const router: Router<'/settings/:tab(profile|billing)'>;
declare function Profile(): Node;
declare function Billing(): Node;

export const App = component(function App(): Node {
  return h.main(null, router.outlet());   // the one outlet
});

// Wrong: a nested outlet inside a view
export const SettingsWrong = component(function SettingsWrong(): Node {
  return h.section(null, h.h1(null, 'Settings'), router.outlet());
});

// Right: route('/settings/:tab(profile|billing)', ...) and switch on the param
export default component(function Settings(p: ViewProps<'/settings/:tab(profile|billing)'>): Node {
  return h.section(null, h.h1(null, 'Settings'),
    match(() => p.params().tab, (tab) => (tab === 'profile' ? Profile() : Billing())));
});
```

## Fixture

`test/spec/router-ui.test.ts` › B17.3 OUTLET_ALREADY_ACTIVE: a second outlet throws the catalogue message naming the live one; after disposal it starts again
