<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# LAZY_BUDGET_EXCEEDED

**warn > 50**, reported by jasno dist: a dynamic-import target's static closure.

<!-- /generated:catalogue -->

A dynamic import, usually a route view (`view: () => import('./views/report.ts')`), loads more than 50 modules that are not already in the entry closure. None of them are preloaded (preload links cover only the entry closure), so the browser fetches them as it finds each import, and the first visit to that view waits for all of them. It is a warning; the build succeeds.
<!-- design.md: (c) dist, (e) dist 4 and 9, ADR-29 -->

## Fix

The message counts the modules per directory and package, largest first; `dist/.jasno/manifest.json` lists each lazy closure in full.

- Barrel files: import each module directly instead of a folder's `index.ts`.
- A heavy part of the view that is not needed at first render (a chart, an editor): load it on demand with `resource` and `match`, so the view renders first. That part becomes its own lazy target, budgeted on its own.
- A large package: import only the entry points you use, if its `"exports"` offers them, or choose a smaller package.

## Example

```ts no-check
import { component, h, match, resource } from 'jasno';

declare const data: readonly number[];

// Wrong: a static import adds the chart and its library to the view's lazy closure
import { Chart } from '../components/chart.ts';

// Right: the view renders at once and loads the chart after
export default component(function Report(): Node {
  const mod = resource({ loader: () => import('../components/chart.ts') });
  return h.section(null,
    h.h1(null, 'Report'),
    match(() => (mod.hasValue() ? mod.value().Chart : null), (Chart) => (Chart ? Chart({ data }) : 'Loading')));
});
```

## Fixture

`test/cli/dist.test.ts` › budgets: MODULE_BUDGET_EXCEEDED (warn, then error) and LAZY_BUDGET_EXCEEDED; DYNAMIC_IMPORT_NOT_LITERAL
