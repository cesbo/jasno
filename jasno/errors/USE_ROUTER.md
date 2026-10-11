<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# USE_ROUTER

**error / warn**, reported by jasno check: only when a browser file imports @jasno/core/router: the DOM's history.pushState/replaceState (error); reading the URL in a browser file (warn): location.href/pathname/search/hash/toString(), location itself as a value (String(location), destructuring a URL part), document.URL; writes (location.href = ...), other parts (origin, host) and a local or parameter named history/location do not count.

<!-- /generated:catalogue -->

The rule runs only in an app with a router: some browser file imports `@jasno/core/router`. An app without one reads and changes the URL as it needs to.

Browser code changes the URL with `history.pushState` or `replaceState`. This is an error. Browser code reads the URL: `location.href`, `pathname`, `search` or `hash`, `location` itself (`String(location)`, `const { search } = location`), or `document.URL`. This is a warning. Every way to read the URL counts the same.

The router does not see a URL that you push yourself. Its `url()`, the rendered view, the title and focus go stale. A `location` read gives the value of one moment, and it never updates your view.

Only the browser's own `history` and `location` count. A local variable or parameter with that name is not reported. A write such as `location.href = '/login'` is a full page load, not a read. Parts that do not change with navigation (`location.origin`, `location.host`) are not reported.

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
