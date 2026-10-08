<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# OUTLET_MOVED

**warn**, runtime, dev builds: a flush disposed router.outlet() and rendered another one, as an outlet in each branch of a show does.

- Message: `router.outlet() moved within one flush: the view is built again, its loader runs again, and focus does not move.`
- Hint: Render router.outlet() once, where it never switches; show what changes beside it (RECIPES: Layout).

<!-- design.md: B17.3 -->
<!-- /generated:catalogue -->

A flush disposed `router.outlet()` and rendered a new outlet of the same router. This happens when App puts an outlet in each branch of a `show`, for example a docs layout and a plain page. The URL that flips the `show` comes from the navigation itself.

The new outlet starts over. It builds the view again, and its loader runs again. Its first render is not a navigation, so it does not move focus and does not announce the page. A keyboard or screen reader user stays on the link that they clicked.

## Fix

- Render `router.outlet()` once, in a place that never switches.
- Put the UI that depends on the URL beside the outlet, in its own `show`. A page list of a section is an example.
- A login wall may still swap the outlet in for a sign-in form. That flip does not dispose an outlet, so it is not reported.

## Example

```ts
import { component, computed, h, show } from '@jasno/core';
import type { Router } from '@jasno/core/router';

declare const router: Router<'/' | '/docs/:page'>;
declare function DocsNav(): Node;

const inDocs = computed(() => router.url().pathname.startsWith('/docs/'));

// Wrong: the link into the docs flips the show, which disposes one outlet and renders the other
export const AppWrong = component(function AppWrong(): Node {
  return show(inDocs,
    () => h.div({ class: 'docs' }, DocsNav(), h.main(null, router.outlet())),
    () => h.main(null, router.outlet()));
});

// Right: one outlet that never moves; the page list sits beside it
export const App = component(function App(): Node {
  return h.div({ class: () => (inDocs() ? 'docs' : '') }, show(inDocs, () => DocsNav()), h.main(null, router.outlet()));
});
```

## Fixture

`test/spec/router-ui.test.ts` › RECIPES Layout claim: an outlet in each branch of a show leaves focus on the clicked link, announces nothing and reports OUTLET_MOVED
