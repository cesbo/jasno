<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# FOCUS_LOST

**warn**, runtime, dev builds: an update removed, disabled or hid the focused element and nothing moved focus (B20; also a catchError swap into text-only content, B8.5, whose hint instead says to wrap the text in an element).

- Message: `Focus was on <{tag}> in {ownerPath}, which this update {action}; focus fell to <body>.`
- Hint: Keep the control enabled with 'aria-disabled', focus what replaced it in onMount, or focus something that stays before the change (a Retry inside show(): the status line).

<!-- /generated:catalogue -->

An update removed, disabled or hid the element that had keyboard focus. Nothing moved focus, so the browser put it on `<body>`. Keyboard and screen-reader users lose their place. They must start again from the top of the page.

## Fix

Decide where focus goes before the update takes the focused element away:

- A button that is busy while a request runs: keep it focusable with `'aria-disabled'` instead of `disabled`. Ignore repeat presses in the handler.
- Deleting the focused row, or a filter that hides it: in the handler, focus a neighbour row or the list heading. Do this before you change the list.
- Content that replaces the focused element (a form replaced by its result): focus the new content in `onMount`. Put the `onMount` inside the branch that renders the content.
- A Retry button inside `show()` that disappears when you retry: focus the status line first. Then call `reload()`.

## Example

```ts
import { component, h, signal } from '@jasno/core';

declare function save(): Promise<void>;

// Wrong: the focused button becomes disabled, and focus falls to <body>
export const SaveWrong = component(function SaveWrong(): Node {
  const saving = signal(false);
  return h.button({ type: 'button', disabled: saving, onclick: async () => {
    saving.set(true);
    await save();
    saving.set(false);
  } }, 'Save');
});

// Right: the button stays focusable and ignores presses while saving
export const Save = component(function Save(): Node {
  const saving = signal(false);
  return h.button({ type: 'button', 'aria-disabled': saving, onclick: async () => {
    if (saving()) return;
    saving.set(true);
    try { await save(); } finally { saving.set(false); }
  } }, 'Save');
});
```

In Playwright, `click()` waits for an `aria-disabled` element to become enabled. To test an ignored second press, use `click({ force: true })`.

## Fixture

`test/spec/devtest.test.ts` › B20.2 disabling the focused button reports FOCUS_LOST ("disabled") with element and owner path
