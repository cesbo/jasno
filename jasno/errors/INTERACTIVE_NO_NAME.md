<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# INTERACTIVE_NO_NAME

**warn**, runtime, dev builds: interactive element, dialog, meter or progress without accessible name.

- Message: `<{tag}> in {ownerPath} has no accessible name.`
- Hint: Add text, aria-label or aria-labelledby, or wrap it: h.label(null, 'Name', h.input(...)).

<!-- design.md: B15.10 -->
<!-- /generated:catalogue -->

A control that an update just inserted has no accessible name. A screen reader announces only its role ("button", "edit text", "dialog"). Nobody can tell what the control does.

After each flush, jasno checks every newly inserted element of these kinds:

- `button`, `a[href]`, `select`, `textarea`
- `input` (except `type: 'hidden'`)
- `dialog`, `meter` and `progress`

jasno reports each element once.

## Fix

Give the element a name:

- Buttons and links: use visible text. On an icon-only button, use `'aria-label'`. An `img` child with `alt` also counts.
- Form fields: wrap them in a label, `h.label(null, 'Email ', h.input(...))`. Or point a label at them with `htmlFor` and `id`. Use `'aria-label'` only when there is no visible label.
- `dialog`, `meter` and `progress`: their text content is not a name. Give them `'aria-labelledby'` with the id of their heading or visible label. Or give them `'aria-label'`.
- `'aria-labelledby'` must point at an element that has text. An empty element does not count.
- Controls repeated in every row need row-specific names: ``'aria-label': () => `Remove ${todo().text}` ``.

One warning can stand for several controls of the same component. Its `count` says how many. Check every control that the component renders.

## Example

```ts
import { component, h, signal, svg } from '@jasno/core';

const icon = (): SVGSVGElement =>
  svg.svg({ viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' }, svg.path({ d: 'M4 12h16' }));

// Wrong: an unlabelled input and an icon-only button
export const FilterWrong = component(function FilterWrong(): Node {
  const query = signal('');
  return h.div(null,
    h.input({ value: query, oninput: (e) => query.set(e.currentTarget.value) }),
    h.button({ type: 'button', onclick: () => query.set('') }, icon()));
});

// Right: the label wraps the input, and the icon-only button has an aria-label
export const Filter = component(function Filter(): Node {
  const query = signal('');
  return h.div(null,
    h.label(null, 'Filter ', h.input({ value: query, oninput: (e) => query.set(e.currentTarget.value) })),
    h.button({ type: 'button', 'aria-label': 'Clear filter', onclick: () => query.set('') }, icon()));
});
```

## Fixture

`test/spec/elements.test.ts` › B15.10 INTERACTIVE_NO_NAME for each listed element without a name
