<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# KEY_ACTIVATES_NEW_FOCUS

**warn**, runtime, dev builds: an Enter keydown handler returned without preventDefault() and focus moved to a button, link, summary, textarea or form field.

- Message: `The Enter keydown handler in {ownerPath} moved focus from <{from}> to <{to}> without preventDefault(); in Chromium the same key press will activate <{to}>.`
- Hint: Call e.preventDefault() in that branch, or save through a form: h.form({ onsubmit: (e) => { e.preventDefault(); ... } }) handles Enter (RECIPES Inline edit).

<!-- design.md: B15.7 -->
<!-- /generated:catalogue -->

An Enter `keydown` handler returned without calling `e.preventDefault()`, and focus then moved, in the handler or in the update it caused, to a button, a link, a `summary`, a `textarea` or a form field. Chromium delivers the rest of that key press to the newly focused element, which gets clicked or submitted: an inline editor that closes on Enter and focuses its title button opens again at once. happy-dom never does this, so in `node:test` this warning is the only sign of the bug.

## Fix

- Enter-to-save in a text field: put the field in a form and save in `onsubmit` (with `e.preventDefault()` first), and drop the Enter branch from `onkeydown`. Implicit submission cannot activate the element that gets focus next, and it ignores Enter while an IME is composing.
- A keydown handler that must handle Enter itself (a search box that jumps to the first result): call `e.preventDefault()` in every branch that moves focus, directly or through a state change.
- In tests, dispatch the key as `new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })`: without `cancelable`, `preventDefault()` has no effect and a correct handler is reported. Then `await Promise.resolve()` (or `await settled()`) before asserting, since the check runs in a microtask after the handler's flush.

## Example

```ts
import { component, h, onMount, untracked, type Read } from 'jasno';

// The parent closes the editor in onDone and focuses the title button it renders instead.
interface EditorProps { title: Read<string>; onDone: (title: string) => void }

// Wrong: Enter closes the editor, focus lands on the title button, and Chromium's keypress clicks it
export const EditorWrong = component(function EditorWrong(p: EditorProps): Node {
  const input = h.input({ value: untracked(p.title), 'aria-label': 'Title',
    onkeydown: (e) => { if (e.key === 'Enter') p.onDone(input.value); } });
  onMount(() => input.focus());
  return input;
});

// Right: the form handles Enter
export const Editor = component(function Editor(p: EditorProps): Node {
  const input = h.input({ value: untracked(p.title), 'aria-label': 'Title' });
  onMount(() => input.focus());
  return h.form({ onsubmit: (e) => { e.preventDefault(); p.onDone(input.value); } }, input);
});
```

## Fixture

`test/spec/elements.test.ts` › B15.7 KEY_ACTIVATES_NEW_FOCUS: Enter moved focus to a button in the handler or in the flush it scheduled
