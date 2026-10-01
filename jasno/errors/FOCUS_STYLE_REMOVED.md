<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# FOCUS_STYLE_REMOVED

**warn**, reported by jasno check: a css rule sets outline: none/0 or all: unset/initial/revert on a selector that reaches an interactive element (a button, a, input, select, textarea or summary tag, a [tabindex] or [contenteditable] attribute, *, a :focus* state (a selector part with :not(:focus-visible) keeps the keyboard ring and does not count), or a class the same file puts on an interactive h.* tag in a string class prop), and no css template in the program has a rule for :focus, :focus-visible or :focus-within that declares anything besides outline: none/0 (an outline, box-shadow, border, background, color or text-decoration change counts; sheets are global, ADR-23) (WCAG 2.4.7: programmatic focus moves need a visible indicator).

<!-- /generated:catalogue -->

A `css` rule removes the focus outline (`outline: none` or `0`, `all: unset`, `initial` or `revert`) from elements that take focus (a `button`, `a`, `input`, `select`, `textarea` or `summary`, `[tabindex]`, `[contenteditable]`, `*`, a `:focus` state, or a class the same file puts on such an `h.*` element), and no `css` template in the app shows focus another way. Keyboard users then cannot see where focus is, also after the router, a dialog or your `onMount` moves it (WCAG 2.4.7).
<!-- design.md: (c) check, ADR-33, ADR-23 -->

## Fix

- Add a rule that shows focus: a `:focus-visible` (or `:focus`, `:focus-within`) rule that declares something other than removing the outline, such as an outline, box-shadow, border, background, color or text-decoration. Sheets are global, so one such rule anywhere in the app clears the warning, for example `` css`:focus-visible { outline: 2px solid; outline-offset: 2px; }` `` in `src/app.ts`.
- Or drop the reset.
- To hide the ring only after mouse clicks, reset `:focus:not(:focus-visible)` instead: keyboard focus keeps the ring, and a selector with `:not(:focus-visible)` is not reported.

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
