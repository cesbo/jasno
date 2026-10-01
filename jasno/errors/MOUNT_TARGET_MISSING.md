<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# MOUNT_TARGET_MISSING

**error (throws)**, runtime, dev and production builds: mount(view, null).

- Message: `mount() got a null target.`
- Hint: Add <div id="app"></div> to index.html and call mount(App, document.getElementById('app')).

<!-- design.md: B16.1 -->
<!-- /generated:catalogue -->

`mount()` got `null` (or `undefined`) as its target, almost always because `document.getElementById('app')` found no element with that id when `src/main.ts` ran. Nothing was rendered, and jasno throws in dev and production builds. tsc cannot catch it: `getElementById` returns `HTMLElement | null` and `mount` accepts `Element | null`.

## Fix

- Give `index.html` the element, in its body: `<div id="app"></div>`.
- Pass the same id to the lookup: `mount(App, document.getElementById('app'))`.
- In tests, use `mountTest(t, () => App())` from `@jasno/core/testing`: it creates its own container.

```html
<body><div id="app"></div><script type="module">import '/src/main.ts';</script></body>
```

## Example

```ts
import { component, h, mount } from '@jasno/core';

const App = component(function App(): Node { return h.main(null, h.h1(null, 'Hello')); });

// Wrong: index.html has <div id="app">, so there is no #root and the target is null
mount(App, document.getElementById('root'));

// Right: the id matches the element in index.html
mount(App, document.getElementById('app'));
```

## Fixture

`test/spec/elements.test.ts` › B16.1 null (and undefined) target throw MOUNT_TARGET_MISSING before the DUPLICATE_RUNTIME check
