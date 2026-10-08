<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# OUTLET_MOVED

**warn**, runtime, dev builds: a flush disposed router.outlet() and rendered another one, as an outlet in each branch of a show does.

- Message: `router.outlet() moved within one flush: the view is built again, its loader runs again, and focus does not move.`
- Hint: Render router.outlet() once, where it never switches; UI a section shares is a layout route (RECIPES: Layout).

<!-- design.md: B17.3 -->
<!-- /generated:catalogue -->

A flush disposed `router.outlet()` and rendered a new outlet of the same router. This happens when App puts an outlet in each branch of a `show`, for example a docs shell and a plain page. The URL that flips the `show` comes from the navigation itself.

The new outlet starts over. It builds the view again, and its loader runs again. Its first render is not a navigation, so it does not move focus and does not announce the page. A keyboard or screen reader user stays on the link that they clicked.

## Fix

- Render `router.outlet()` once, in a place that never switches.
- Make the UI that a section shares, such as a page list, a layout route: `route(path, { layout: () => import('./layouts/docs.ts'), view })`. The router keeps the layout while the routes share it, and builds only the view again.
- A login wall still works. Signing in renders the outlet and disposes none. Signing out disposes it and renders none.

## Example

```ts
import { component, computed, h, show } from '@jasno/core';
import { route, type LayoutProps, type Router } from '@jasno/core/router';

declare const router: Router<'/' | '/docs/:page'>;
declare function DocsNav(): Node;
declare function DocView(): Node;

const inDocs = computed(() => router.url().pathname.startsWith('/docs/'));

// Wrong: the link into the docs flips the show, which disposes one outlet and renders the other
export const AppWrong = component(function AppWrong(): Node {
  return show(inDocs,
    () => h.div({ class: 'docs' }, DocsNav(), h.main(null, router.outlet())),
    () => h.main(null, router.outlet()));
});

// Right: one outlet that never moves; the docs routes name a layout that holds the page list
export const App = component(function App(): Node {
  return h.main(null, router.outlet());
});
export const DocsLayout = component(function DocsLayout(p: LayoutProps): Node {
  return h.div({ class: 'docs' }, DocsNav(), p.view);
});
export const docsRoute = route('/docs/:page', {
  layout: async () => ({ default: DocsLayout }), // in an app: () => import('./layouts/docs.ts')
  view: async () => ({ default: DocView }),
});
```

## Fixture

`test/spec/router-ui.test.ts` › B17.3 OUTLET_MOVED: an outlet in each branch of a show leaves focus on the clicked link, announces nothing and reports OUTLET_MOVED
