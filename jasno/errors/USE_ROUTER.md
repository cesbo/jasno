<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# USE_ROUTER

**error / warn**, reported by jasno check: the DOM's history.pushState/replaceState (error); reading the DOM's location.pathname/location.search in a browser file (warn); a local or parameter named history/location does not count.

<!-- /generated:catalogue -->

Browser code changes the URL with `history.pushState` or `replaceState`. This is an error. Browser code reads `location.pathname` or `location.search`. This is a warning.

The router does not see a URL that you push yourself. Its `url()`, the rendered view, the title and focus go stale. A `location` read gives the value of one moment, and it never updates your view.

Only the browser's own `history` and `location` count. A local variable or parameter with that name is not reported.

<!-- design.md: (c) jasno check table; (e) jasno check 3; ADR-21 -->

## Fix

- Change the URL with `router.navigate(url)`. Add `{ replace: true }` for search-param edits and after delete or create. Relative URLs such as `'?q=x'` resolve against the current one.
- Read the URL from `router.url()`, a signal: `computed(() => router.url().searchParams.get('q') ?? '')`.
- Close a detail with `router.back('/')`. The `'/'` is the fallback for a deep link. Do not use `history.back()`.
- Tests may call `history.replaceState` to set the start URL. The rule checks browser files only.

## Example

```ts
import { component, computed, h } from '@jasno/core';
import type { Router } from '@jasno/core/router';

declare const router: Router<'/search'>;

// Wrong: q is read once, and the router never learns about the new URL
export const SearchWrong = component(function SearchWrong(): Node {
  const q = new URLSearchParams(location.search).get('q') ?? '';
  return h.input({ type: 'search', 'aria-label': 'Search', value: q,
    oninput: (e) => history.replaceState(null, '', '?q=' + encodeURIComponent(e.currentTarget.value)) });
});

// Right: navigate through the router and bind router.url()
export const Search = component(function Search(): Node {
  const q = computed(() => router.url().searchParams.get('q') ?? '');
  return h.input({ type: 'search', 'aria-label': 'Search', value: q,
    oninput: (e) => { void router.navigate('?q=' + encodeURIComponent(e.currentTarget.value), { replace: true }); } });
});
```

## Fixture

`test/cli/check.test.ts` › browser sinks: NO_HTML_SINK, USE_ROUTER (error and warn), WORKER_UNSUPPORTED, ASSET_OUTSIDE_ASSETS
