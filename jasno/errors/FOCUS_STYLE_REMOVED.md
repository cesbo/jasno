<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# FOCUS_STYLE_REMOVED

**warn**, reported by jasno check: a css rule sets outline: none/0 or all: unset/initial/revert on a selector that reaches an interactive element (a button, a, input, select, textarea or summary tag, a [tabindex] or [contenteditable] attribute, *, a :focus* state (a selector part with :not(:focus-visible) keeps the keyboard ring and does not count), or a class the same file puts on an interactive h.* tag in a string class prop), and no css template in the program has a rule for :focus, :focus-visible or :focus-within that declares anything besides outline: none/0 (an outline, box-shadow, border, background, color or text-decoration change counts; sheets are global, ADR-23) (WCAG 2.4.7: programmatic focus moves need a visible indicator).

<!-- /generated:catalogue -->

A `css` rule removes the focus outline from elements that take focus. The rule uses `outline: none` or `0`, or `all: unset`, `initial` or `revert`. No `css` template in the app shows focus another way.

The rule reaches elements such as these:

- a `button`, `a`, `input`, `select`, `textarea` or `summary`
- `[tabindex]`, `[contenteditable]` or `*`
- a `:focus` state
- a class that the same file puts on such an `h.*` element

Keyboard users then cannot see where focus is. This also applies after the router, a dialog or your `onMount` moves focus (WCAG 2.4.7).
<!-- design.md: (c) check, ADR-33, ADR-23 -->

## Fix

- Add a rule that shows focus. Use a `:focus-visible` (or `:focus`, `:focus-within`) rule. The rule must declare more than removing the outline: an outline, box-shadow, border, background, color or text-decoration change.
- Sheets are global, so one such rule anywhere in the app clears the warning. For example, put `` css`:focus-visible { outline: 2px solid; outline-offset: 2px; }` `` in `src/app.ts`.
- Or drop the reset.
- To hide the ring only after mouse clicks, reset `:focus:not(:focus-visible)` instead. Keyboard focus keeps the ring. jasno does not report a selector with `:not(:focus-visible)`.

## Example

```ts
import { component, css, h } from '@jasno/core';

// Wrong: the reset hides the focus ring, and no rule shows focus instead
css`.toolbar button { all: unset; padding: 4px 8px; cursor: pointer; }`;

// Right: the same reset plus a visible focus state
css`
  .toolbar button { all: unset; padding: 4px 8px; cursor: pointer; }
  .toolbar button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
`;

export const Toolbar = component(function Toolbar(): Node {
  return h.div({ class: 'toolbar' }, h.button({ type: 'button' }, 'Bold'), h.button({ type: 'button' }, 'Italic'));
});
```

## Fixture

`test/cli/check.test.ts` › FOCUS_STYLE_REMOVED: outline removed on a tag or a class the file puts on an interactive h.* tag
