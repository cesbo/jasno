<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# INVALID_ROUTE_PATTERN

**error (throws)**, runtime, dev and production builds: createRouter with an unsupported pattern.

- Message: `Route pattern "{pattern}" is not supported: {reason}.`
- Hint: Use '/'-rooted static segments, :name, :name?, :name+, :name*, :name(a|b); for unknown URLs, and instead of a pattern that matches every path, use createRouter(routes, { notFound }).

<!-- design.md: B17.1 -->
<!-- /generated:catalogue -->

`createRouter()` threw an error. A route pattern uses syntax that the router does not support, so the app's routes cannot load. The reason after the colon names the problem.

The router checks patterns when `createRouter()` runs, in both builds. It does not check them in `route()`. It stops at the first bad pattern.

## Fix

Rewrite the pattern in the supported grammar. Each segment starts with `/`. Each segment is either plain text or one parameter:

- `:name`
- `:name?` (optional)
- `:name+` (one or more segments)
- `:name*` (zero or more segments)
- `:name(regex)` (one segment that matches the regex)

Then find your reason in this list:

- "empty segment": remove the double slash or the trailing slash (`/users/` → `/users`). A trailing slash in the URL still matches.
- "mixes text and parameter syntax": make each segment all text or one parameter (`/files/*` → `/files/:path+`, `/user-:id` → `/user/:id`).
- "is not :name, …": use identifiers as parameter names (`/:user-id` → `/:userId`).
- "appears twice": give each parameter its own name.
- "must be the last segment": nothing may follow a `+` or `*` parameter. That parameter takes the rest of the path.
- "not a valid regular expression": fix the constraint. It must match one whole decoded segment.
- "it matches every path": delete the catch-all route. This reason has its own hint, "use notFound". `createRouter(routes, { error, notFound })` already renders `notFound()` for any URL that no route matches.

## Example

```ts
import { createRouter, route } from '@jasno/core/router';

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
