<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NODE_OUTSIDE_REGION

**warn**, runtime, dev builds: a builder (a show/match branch, an each row, a catchError fallback) returned a node built outside it.

- Message: `{builder} in {ownerPath} returned <{tag}>, created outside it.`
- Hint: Create the node inside the builder, or keep it mounted and toggle hidden: () => !open().

<!-- design.md: B10.6 -->
<!-- /generated:catalogue -->

A `show` or `match` branch, an `each` row or a `catchError` fallback returned an element that it did not create. The element was built in the component's setup or in an earlier branch. Its bindings therefore belong to another owner: they outlive the branch, and a `catchError` cannot catch their errors.

## Fix

- Create the element inside the builder: `show(open, () => h.section(...))`. Each build gets a new element whose bindings end with the branch. Calling a component there is fine too: `show(open, () => Details())`.
- To keep one element and its state (scroll position, typed text) while it is closed, leave it mounted and toggle it: `h.section({ hidden: () => !open() }, ...)`.
- Do not cache elements between builds (`cached ??= h.p(...)`) or share one element across rows.

## Example

```ts
import { component, h, show, type Read } from '@jasno/core';

interface HelpProps { open: Read<boolean>; text: Read<string> }

// Wrong: the panel is created in setup and returned by the branch
export const HelpWrong = component(function HelpWrong(p: HelpProps): Node {
  const panel = h.section(null, h.p(null, p.text));
  return h.div(null, show(p.open, () => panel));
});

// Right: create it in the branch...
export const Help = component(function Help(p: HelpProps): Node {
  return h.div(null, show(p.open, () => h.section(null, h.p(null, p.text))));
});

// ...or keep it mounted and toggle hidden
export const HelpKept = component(function HelpKept(p: HelpProps): Node {
  return h.div(null, h.section({ hidden: () => !p.open() }, h.p(null, p.text)));
});
```

## Fixture

`test/spec/lists.test.ts` › B10.6 a show or match builder returning an element created in the parent setup reports NODE_OUTSIDE_REGION
