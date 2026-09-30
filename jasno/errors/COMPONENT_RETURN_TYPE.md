<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# COMPONENT_RETURN_TYPE

**warn**, reported by jasno check: component function without a return type annotation (: Node).

<!-- design.md: ADR-06 -->
<!-- /generated:catalogue -->

A function passed to `component()` has no return type annotation. A view usually imports the router (for `router.href`) while `src/routes.ts` imports the view (`view: () => import('./views/about.ts')`); with an inferred return type, TypeScript needs the router's type to type the view and the view's type to type the router, so it gives up and reports TS7022 (`'router' implicitly has type 'any'`) in routes.ts, far from the cause. A `: Node` annotation breaks the cycle.
<!-- design.md: (c) check and the TS7022 rewrite, ADR-06 -->

## Fix

Annotate every component function with `: Node`:

`component(function UserView(p: ViewProps<'/users/:id', User>): Node { ... })`

When TS7022 appears on the router export, `jasno check` prints these warnings first and drops the implicit-any errors it causes in the route table (a `title: (d) => d.name` callback): fix the warnings and the error goes away.

## Example

```ts
import { component, h } from 'jasno';
import type { Router } from 'jasno/router';

declare const router: Router<'/' | '/about'>; // from src/routes.ts, whose table imports this view

// Wrong: the inferred return type closes the routes <-> view type cycle (TS7022 in routes.ts)
export const AboutWrong = component(function About() {
  return h.section(null, h.h1(null, 'About'), h.a({ href: router.href('/') }, 'Home'));
});

// Right
export default component(function About(): Node {
  return h.section(null, h.h1(null, 'About'), h.a({ href: router.href('/') }, 'Home'));
});
```

## Fixture

`test/cli/check.test.ts` › TS7022 on the router export: COMPONENT_RETURN_TYPE findings print first, the downstream implicit any is dropped
