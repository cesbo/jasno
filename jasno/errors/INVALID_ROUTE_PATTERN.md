<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# INVALID_ROUTE_PATTERN

**error (throws)**, runtime, dev and production builds: createRouter with an unsupported pattern.

- Message: `Route pattern "{pattern}" is not supported: {reason}.`
- Hint: Use '/'-rooted static segments, :name, :name?, :name+, :name*, :name(a|b); for unknown URLs, and instead of a pattern that matches every path, use createRouter(routes, { notFound }).

<!-- design.md: B17.1 -->
<!-- /generated:catalogue -->

`createRouter()` threw because a route pattern uses syntax the router does not support, so the app's routes cannot load. The reason after the colon names the problem. The router checks patterns when `createRouter()` runs, not in `route()`, in both builds, and it stops at the first bad pattern.

## Fix

Rewrite the pattern in the supported grammar: segments that start with `/`, each either plain text or one parameter: `:name`, `:name?` (optional), `:name+` (one or more segments), `:name*` (zero or more) or `:name(regex)` (one segment matching the regex).

- "empty segment": remove the double or trailing slash (`/users/` → `/users`). A trailing slash in the URL still matches.
- "mixes text and parameter syntax": a segment is all text or one parameter (`/files/*` → `/files/:path+`, `/user-:id` → `/user/:id`).
- "is not :name, …": parameter names are identifiers (`/:user-id` → `/:userId`).
- "appears twice": give each parameter its own name.
- "must be the last segment": a `+` or `*` parameter takes the rest of the path, so nothing may follow it.
- "not a valid regular expression": fix the constraint. It must match one whole decoded segment.
- "it matches every path" (this one has its own hint, "use notFound"): delete the catch-all route. `createRouter(routes, { error, notFound })` already renders `notFound()` for any URL that no route matches.

## Example

```ts
import { createRouter, route } from 'jasno/router';

declare function Page(): Node;
declare function NotFound(): Node;
declare function ErrorPanel(error: unknown, retry: () => void): Node;
const view = async () => ({ default: Page });

// Wrong: a wildcard segment, a trailing slash and a catch-all route
export const routerWrong = createRouter([
  route('/files/*', { view }),
  route('/users/:id/', { view }),
  route('/:rest*', { view: async () => ({ default: NotFound }) }),
], { error: ErrorPanel, notFound: NotFound });

// Right: a rest parameter, no trailing slash, unknown URLs through notFound
export const router = createRouter([
  route('/files/:path+', { view }),
  route('/users/:id', { view }),
], { error: ErrorPanel, notFound: NotFound });
```

## Fixture

`test/spec/router-patterns.test.ts` › B17.1 INVALID_ROUTE_PATTERN for every unsupported pattern, with the catalogue message; route() itself is inert
