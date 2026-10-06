<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# VIEW_NO_HEADING

**warn**, runtime, dev builds: the router found no h1 or visible [autofocus].

- Message: `The view for "{route}" has no h1 or visible [autofocus]; the router focused <main>.`
- Hint: Render an h.h1 in every view, outside show/match (its text may be live).

<!-- design.md: B17.8 -->
<!-- /generated:catalogue -->

After a navigation, the router moves focus into the new view. It focuses the first visible `[autofocus]` element. If there is none, it focuses the first `h1`.

This view had neither when it rendered. The router focused `<main>` instead. A screen reader user then hears nothing that says which page opened.

The message names the route pattern, or `notFound`. After a failed navigation, the router checks the error view under the failed route's pattern.

## Fix

- Render an `h.h1` in every view, the `notFound` and `error` views included. It may sit in a child component. The router takes the first `h1` anywhere in the view.
- Keep it outside `show`/`match`. Then it exists while the view's own data is still loading. Its text may be live.
- A view that starts with a form may put `autofocus: true` on its first field instead. That field must be visible. The router skips an `[autofocus]` element that is hidden, inside a closed `dialog` or inside a hidden popover.

## Example

```ts
import { component, h, resource, show } from '@jasno/core';
import type { ViewProps } from '@jasno/core/router';

interface User { readonly id: string; readonly name: string }
declare function getUser(id: string, signal: AbortSignal): Promise<User>;

// Wrong: the h1 exists only after the user has loaded. Until then the view shows "Loading"
export const UserWrong = component(function UserWrong(p: ViewProps<'/users/:id'>): Node {
  const user = resource({ params: () => p.params().id, loader: ({ params, abortSignal }) => getUser(params, abortSignal) });
  return h.section(null, show(() => user.hasValue() && user.value(),
    (u) => h.h1(null, () => u().name), () => h.p({ role: 'status' }, 'Loading')));
});

// Right: the h1 is always there, and its text is live
export default component(function UserView(p: ViewProps<'/users/:id'>): Node {
  const user = resource({ params: () => p.params().id, loader: ({ params, abortSignal }) => getUser(params, abortSignal) });
  return h.section(null,
    h.h1(null, () => (user.hasValue() ? user.value().name : 'User')),
    h.p({ role: 'status' }, () => (user.isLoading() ? 'Loading' : '')));
});
```

## Fixture

`test/router.test.ts` › B17.8 focus after a navigation: [autofocus], else h1 (tabindex -1), else main with VIEW_NO_HEADING; never on the first render
