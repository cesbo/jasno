<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NODE_MOVED

**warn**, runtime, dev builds: a node that already has a parent was appended elsewhere.

- Message: `<{tag}> already had a parent and was moved into {ownerPath}.`
- Hint: A node lives in one place: create it where it is used (a function returning a new node); render children once.

<!-- design.md: B15.6 -->
<!-- /generated:catalogue -->

A node that already had a parent was passed as a child again. A DOM node can be in only one place. jasno moved it, so it disappeared from where it was rendered first. Usually you meant one element to appear twice.

## Fix

- For content used in several places, write a function that creates a new node for each use: `const icon = () => svg.svg(...)`. Call it at each place.
- If a component puts a node it received (`p.icon`) in two places, render it once. Or take a function prop (`icon: () => Node`) and call it for each place.
- Build nodes where you use them. Do not take them from elsewhere in the document.

## Example

```ts
import { component, h, svg } from '@jasno/core';

// Wrong: one icon node appended to two buttons; the first button loses it
export const ToolbarWrong = component(function ToolbarWrong(): Node {
  const icon = svg.svg({ viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' }, svg.path({ d: 'M4 12h16' }));
  return h.div(null, h.button({ type: 'button' }, icon, 'Zoom out'), h.button({ type: 'button' }, icon, 'Collapse'));
});

// Right: a function that creates a new node for each use
export const Toolbar = component(function Toolbar(): Node {
  const icon = () => svg.svg({ viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' }, svg.path({ d: 'M4 12h16' }));
  return h.div(null, h.button({ type: 'button' }, icon(), 'Zoom out'), h.button({ type: 'button' }, icon(), 'Collapse'));
});
```

## Fixture

`test/spec/elements.test.ts` › B15.6 a Node that already has a parent is moved and reports NODE_MOVED (element and text node)
