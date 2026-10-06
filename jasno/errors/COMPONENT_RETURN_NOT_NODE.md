<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# COMPONENT_RETURN_NOT_NODE

**error (throws)**, runtime, dev builds: a component returned a non-Node.

- Message: `Component <{name}> returned {type}, not a Node.`
- Hint: Return one element or a show/match/each region.

<!-- /generated:catalogue -->

A function wrapped in `component()` returned something that is not a DOM node, such as `null`, `undefined`, a string or an array. jasno inserts the node that a component returns. Dev builds therefore throw when the component is called. The message names the component and what it returned.

<!-- design.md: B14.2 -->

## Fix

Return exactly one node:

- To render nothing (`return null`), return a region: `return show(() => cond(), () => h.p(...))`. Or wrap the call in `show()` in the parent.
- For an array of nodes, wrap them in one element. Or render the list with `each()` inside an element.
- For a string, return an element with that text: `h.span(null, text)`.

tsc rejects these return values in a component. The component function must return `Node`. Look for a cast or an `any` value that let them through.

## Example

```ts no-check
import { component, h } from '@jasno/core';

// Wrong: an array of <li>, or null when there are no tags
export const Tags = component(function Tags(p: { tags: readonly string[] }): Node {
  return p.tags.length ? p.tags.map((t) => h.li(null, t)) : null;
});
```

```ts
import { component, each, h, show, type Read } from '@jasno/core';

// Right: always one node; show() renders nothing while the list is empty
export const Tags = component(function Tags(p: { tags: Read<readonly string[]> }): Node {
  return show(() => p.tags().length > 0, () =>
    h.ul(null, each(p.tags, { key: (t) => t, render: (t) => h.li(null, t) })));
});
```

## Fixture

`test/spec/elements.test.ts` › B14.2 COMPONENT_RETURN_NOT_NODE for null, undefined and arrays
