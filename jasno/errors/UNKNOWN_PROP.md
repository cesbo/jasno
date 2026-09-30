<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# UNKNOWN_PROP

**warn**, runtime, dev builds: an unknown key reached h.* (also open on an element without it).

- Message: `<{tag}> got unknown prop "{key}".`
- Hint: Key-specific: onClick → onclick (event props are lowercase DOM names), className → class, for → htmlFor, ref → keep the element, key → each(); an unknown aria-* key lists the valid ones.

<!-- design.md: B15.8 -->
<!-- /generated:catalogue -->

An `h.*` call got a prop that is not in jasno's typed props for that tag. Usually it is a React-style name (`onClick`, `className`, `for`, `ref`, `key`) that got in through a spread or a cast, because tsc rejects these in an object literal. jasno applies the key anyway as an element property, which rarely does what was meant: `onClick` listens for an event named `Click`, so the handler never runs.

<!-- design.md: B15.8 -->

## Fix

Use the DOM name. The hint in the message is specific to the key:

- `onClick`, `onChange`, …: event props are lowercase DOM names (`onclick`, `onchange`).
- `className` → `class` (a string or `{ name: Read<boolean> }`); `for` → `htmlFor`.
- `ref`: there are no refs. `h.*` returns the element, so keep it in a const.
- `key`: keys belong to `each(list, { key, render })`.
- `children`: pass children after the props, `h.div(null, a, b)`.
- `innerHTML`: not allowed. Build the nodes with `h.*` and text children.
- `open` on a `dialog`: call `showModal()` in a handler, and `close()` to close it.
- A misspelled `aria-*` key, or any other key: check the name in `jasno.elements.d.ts`.

Then find where the key got in, usually a spread of a wider object (`{ ...props }`) or an `as` cast, and pass only typed props.

## Example

```ts no-check
import { component, h } from 'jasno';
declare function save(): Promise<void>;

// Wrong: React names; the click handler never runs
export const Field = component(function Field(): Node {
  return h.div({ className: 'field' },
    h.label(null, 'Email', h.input({ type: 'email' })),
    h.button({ type: 'button', onClick: () => save() }, 'Save'));
});
```

```ts
import { component, h } from 'jasno';
declare function save(): Promise<void>;

// Right: DOM property names and lowercase events
export const Field = component(function Field(): Node {
  return h.div({ class: 'field' },
    h.label(null, 'Email', h.input({ type: 'email' })),
    h.button({ type: 'button', onclick: () => save() }, 'Save'));
});
```

## Fixture

`test/spec/elements.test.ts` › B15.8 an unknown key warns UNKNOWN_PROP and is applied anyway; for/ref/key get key-specific hints
