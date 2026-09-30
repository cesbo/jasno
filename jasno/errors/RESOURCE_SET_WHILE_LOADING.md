<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# RESOURCE_SET_WHILE_LOADING

**warn**, runtime, dev builds: set() while loading.

- Message: `set() on resource "{node}" while it loads {params}; the value likely belongs to earlier params.`
- Hint: Capture the params before the await and write only if they are unchanged; optimistic values are set() before the await (this warning never fires in 'reloading').

<!-- design.md: B9.8 -->
<!-- /generated:catalogue -->

`set()` was called on a resource while it was loading, with no value yet, for its current params. This usually happens after an `await` in a save, when the user has already moved to another record. The value almost certainly belongs to the earlier params, but `set()` stores it as the current params' value and aborts their load, so the page would show the wrong record.

## Fix

- After an `await`, capture the params before it and write only if they are unchanged: `const id = p.id(); const saved = await saveNote(id, text); if (p.id() === id) note.set(saved);`.
- Optimistic values are `set()` before the `await`, while the resource holds the value for these params.
- Do not use `set()` to fill a resource that has not loaded yet. Return early with `if (!r.hasValue()) return`.

The warning never fires in `reloading` (a `reload()` that keeps the value), so a save that finishes during a refresh may `set()` its result.

## Example

```ts
import { component, h, resource, show, type Read } from 'jasno';

interface Note { readonly id: string; readonly text: string }
declare function getNote(id: string, signal: AbortSignal): Promise<Note>;
declare function saveNote(id: string, text: string): Promise<Note>;

export const NoteEditor = component(function NoteEditor(p: { id: Read<string> }): Node {
  const note = resource({ params: () => p.id(), loader: ({ params, abortSignal }) => getNote(params, abortSignal) });

  // Wrong: if p.id() changed during the await, note 1 is stored as note 2's value
  async function saveWrong(text: string): Promise<void> {
    note.set(await saveNote(p.id(), text));
  }

  // Right: write only if the params are still the ones the save was for
  async function save(text: string): Promise<void> {
    const id = p.id();
    const saved = await saveNote(id, text);
    if (p.id() === id) note.set(saved);
  }

  return h.section(null,
    show(() => note.hasValue() && note.value(), (n) => h.p(null, () => n().text)),
    h.button({ type: 'button', onclick: () => save('Updated') }, 'Save'));
});
```

## Fixture

`test/spec/resource.test.ts` › B9.8 RESOURCE_SET_WHILE_LOADING names the resource
