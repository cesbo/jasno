<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# ROUTE_SHADOWED

**error (throws)**, runtime, dev and production builds: a route can never match.

- Message: `Route "{later}" can never match: "{earlier}" comes first and matches all of its paths.`
- Hint: List specific routes (/users/new) before param routes (/users/:id).

<!-- design.md: B17.1 -->
<!-- /generated:catalogue -->

Two routes overlap, so the later one can never render. The router tries routes in table order. The earlier route matches every URL the later one could. The message names the earlier route second.

`createRouter()` throws in both builds. So the view does not silently never show.

## Fix

Move the more specific route above the general one. Or delete the later route if it duplicates the earlier one:

- Put a static segment before a parameter: `/users/new` above `/users/:id`.
- Put a constrained parameter before an unconstrained one: `/orders/:id(\d+)` above `/orders/:slug`.
- Optional and rest parameters also match the shorter paths. `/docs/:path*` matches `/docs` and `/docs/intro`, so list `/docs/intro` first. `/p/:x?` matches both `/p` and `/p/:y`.
- The same pattern twice, or twice with only the parameter renamed (`/u/:id`, `/u/:any`): keep one.

The router compares the two patterns segment by segment:

- A static segment covers only the same text.
- An unconstrained parameter covers any single segment.
- `:x(c)` covers only a constraint written exactly as `c`.
- A `+` or `*` parameter covers the rest of the path.

## Example

```ts
import { createRouter, route } from '@jasno/core/router';

declare function Page(): Node;
declare function NotFound(): Node;
declare function ErrorPanel(error: unknown, retry: () => void): Node;
const view = async () => ({ default: Page });

// Wrong: "/users/:id" comes first and also matches /users/new
export const routerWrong = createRouter([
  route('/users/:id', { view }),
  route('/users/new', { view }),
], { error: ErrorPanel, notFound: NotFound });

// Right: specific routes before param routes
export const router = createRouter([
  route('/users/new', { view }),
  route('/users/:id', { view }),
], { error: ErrorPanel, notFound: NotFound });
```

## Fixture

`test/spec/router-patterns.test.ts` › B17.1 ROUTE_SHADOWED uses the catalogue message naming both patterns (first covering route), and the hint
