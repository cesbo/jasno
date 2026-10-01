<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# ANONYMOUS_COMPONENT

**warn**, reported by jasno check: component() given an arrow or anonymous function.

<!-- /generated:catalogue -->

`component()` was given an arrow function or an unnamed `function`. jasno names a component's owner after its function, so this one shows as `<Anonymous>` in owner paths (runtime warnings, test failures, `__JASNO__.inspect()` and `why()`), and you cannot tell which component a diagnostic is about.
<!-- design.md: (c) check, B14.1 -->

## Fix

Pass a named function expression, named like the const it is assigned to, with a `: Node` return annotation:

`export const Card = component(function Card(p: CardProps): Node { ... })`

An unannotated arrow also gets `COMPONENT_RETURN_TYPE` at the same position; this one change fixes both.

## Example

```ts
import { component, h, type Read } from '@jasno/core';

export interface CardProps { title: Read<string> }

// Wrong: owner paths show <Anonymous>
export const CardWrong = component((p: CardProps): Node => h.article({ class: 'card' }, h.h2(null, p.title)));

// Right: owner paths show <Card>
export const Card = component(function Card(p: CardProps): Node {
  return h.article({ class: 'card' }, h.h2(null, p.title));
});
```

## Fixture

`test/cli/check.test.ts` › COMPONENT_NOT_WRAPPED, ANONYMOUS_COMPONENT, COMPONENT_RETURN_TYPE (warn)
