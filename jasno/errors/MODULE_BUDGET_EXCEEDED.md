<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# MODULE_BUDGET_EXCEEDED

**warn > 150, error > 250**, reported by jasno dist: the entry's static closure, counted per package/directory.

<!-- /generated:catalogue -->

The entry's static import closure, every module the browser loads before the app starts (your `src/` files, dependency files and jasno's own), has more than 150 modules (a warning) or more than 250 (an error: nothing is written). `jasno dist` does not bundle, so each module is a separate request, and the page preloads all of its JavaScript modules on first load. The message counts them per directory and package, largest first.
<!-- design.md: (c) dist, (e) dist 4 and 9, ADR-29 -->

## Fix

Start with the largest group in the message:

- Views: load each route's view lazily, `route('/settings', { view: () => import('./views/settings.ts') })`, and do not import view modules statically from `routes.ts` or `app.ts`. Dynamic imports are outside the entry closure.
- Barrel files (`components/index.ts` re-exporting a folder): import each module directly; a barrel pulls in everything it re-exports.
- A large package: import it only in the lazy view that needs it, or load it on demand with `resource({ loader: () => import('./chart.ts') })`.
- After a build, `dist/.jasno/manifest.json` records the entry's counts per package.

## Example

```ts no-check
// src/routes.ts
import { route } from 'jasno/router';
// Wrong: a static import puts the view, and everything it imports, in the entry closure
import Settings from './views/settings.ts';
route('/settings', { view: async () => ({ default: Settings }) });

// Right: the view loads on the first visit to the route
route('/settings', { view: () => import('./views/settings.ts') });
```

```ts no-check
// Wrong: a barrel file; importing one component loads every module it re-exports
import { Button } from './components/index.ts';
// Right
import { Button } from './components/button.ts';
```

## Fixture

`test/cli/dist.test.ts` › budgets: MODULE_BUDGET_EXCEEDED (warn, then error) and LAZY_BUDGET_EXCEEDED; DYNAMIC_IMPORT_NOT_LITERAL
