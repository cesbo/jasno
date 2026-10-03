<!-- jasno:begin -->
# jasno agent guide

**Your training data does not know jasno.** It is not React, Solid, Vue, Svelte or Angular. This file plus `jasno.d.ts` is the whole API; start with the RECIPES block at its top (forms, inline edit, dialogs, saves, per-param work, focus, polling). No JSX, no templates, no bundler config: the `.ts` you edit is the module the browser runs (`jasno dev` strips types).

## Example

```ts
import { bindValue, component, computed, each, h, show, signal, type Read } from '@jasno/core';

export interface Todo { readonly id: number; readonly text: string; readonly done: boolean }
export interface TodoListProps { todos: Read<readonly Todo[]>; onToggle: (id: number) => void }

export const TodoList = component(function TodoList(p: TodoListProps): Node {
  const query = signal('');
  const shown = computed(() => p.todos().filter((t) => t.text.includes(query())));
  return h.section(null,
    h.input({ ...bindValue(query), 'aria-label': 'Filter' }),
    show(() => shown().length === 0, () => h.p(null, 'No matches')),
    h.ul(null, each(shown, { key: (t) => t.id, render: (todo) =>
      h.li({ class: { done: () => todo().done } },
        h.button({ onclick: () => p.onToggle(todo().id) }, () => todo().text)) })),
    h.p(null, () => `${shown().length} shown`),
  );
});
```

## The reactive rule

- A function (signal, computed, `() => expr`) is **live**; any other value is **static**: `h.p(null, count)` updates, `h.p(null, count())` never does.
- Setup (a component body; a `show`/`match`/`each`/`catchError` callback) runs **untracked**: read signals only inside functions you give to jasno. A setup read reports `STRICT_READ_UNTRACKED`: make it live (`untracked()` only for values that must never update).
- `s.set(v)` is visible to `s()` at once; the DOM and effects update on the next microtask (`flush()`: now), and so do row `item`s, `show` values and router params.
- Derive with `computed`; state that resets when an input changes is `linkedSignal({ source: p.userId, computation: () => '' })`. `effect` only syncs the outside world and never sets signals (subscriptions that set signals go in `onMount`).

## Components

`component(function Name(p: Props): Node { ... })`: named, annotated `: Node`, called directly: `Card({ title })`. Data props are `Read<T>` (pass `count`, a computed or `() => x`); plain `T` only for ids fixed at creation; optional: `sub?: Read<string> | undefined`. Content that may not render or must see this component's context is a function prop (`panel: () => Child`), not `children`.

## Markup and events

`h.tag(props | null, ...children)` returns the real element: keep it in a const (no refs). Props are DOM properties: `class` (string or `{ name: Read<boolean> }`), `style` (`{ marginTop: '4px', '--gap': () => g() }`), `htmlFor`, `'aria-*'`, `'data-*'`. Events are lowercase (`onclick`, `onsubmit`); `e.currentTarget` is the element: copy it to a const before any `await`. A function child is live **text**; switch nodes with `show(when, then, otherwise?)` or `match(key, render)`. `` css`.card { .title { font-weight: 600; } }` `` is global: put `class: 'card'` on the root. Boundary: `catchError(() => Chart(), (err, reset) => Retry({ reset }))`.

## Lists

`each(list, { key: (t) => t.id, render: (item, index, key) => row })`: `item`/`index` are `Read`s (`() => item().name`); same key + new object updates the row in place. A row dies when its key leaves the list (filter, page), a branch when its condition flips: state that must survive lives in the item or a parent.

## Async

```ts
const user = resource({ params: () => p.id(), loader: ({ params, abortSignal }) => getUser(params, abortSignal) });
show(() => user.hasValue() && user.value(), (u) => h.h2(null, () => u().name), () => h.p({ role: 'status' }, 'Loading'));
```

Gate content on `hasValue()` (never `value()!`), spinners on `isLoading()`, errors on `status() === 'error'`. No `params` = load once. The loader is untracked: read signals only in `params`; resolve `null`, never `undefined`. New params abort the old load; `reload()` refetches. After an `await`, write only if params are unchanged (views stay mounted); undo a failed optimistic `set()` with `set()`, never `reload()`.

## Routing (`@jasno/core/router`)

```ts
export const router = createRouter([
  route('/users/:id', { loader: ({ params, abortSignal }) => getUser(params.id, abortSignal), view: () => import('./views/user.ts'), title: (u) => u.name }),
], { error: (error, retry) => ErrorPanel({ error, retry }), notFound: () => NotFound() });
// views/user.ts
export default component(function UserView(p: ViewProps<'/users/:id', User>): Node { /* p.params().id, p.data().name */ });
```

App is `h.header(null, nav)` + `h.main(null, router.outlet())`; every view has an `h.h1` (focused after navigation). Links: `h.a({ href: router.href('/users/:id', { id }) })`. Search params: `router.url().searchParams.get('q')`; set with `router.navigate('?q=x', { replace: true })`. Use `{ replace: true }` after delete/create; close a detail with `router.back('/')`. Never touch `history` or `location`. Views stay mounted when only params change: per-param work goes in `match(() => p.params().id, (id) => Body({ id }))`, `onMount` inside.

## Context, cleanup, state

```ts
export const Toast = createContext<(msg: string) => void>('Toast');
provide(Toast, notify, () => Page());   // parent
const toast = useContext(Toast);        // child setup; keep the const
onMount(({ abortSignal }) => {
  window.addEventListener('resize', fit, { signal: abortSignal });
  const t = setInterval(tick, 1000); return () => clearInterval(t);
});
effect(() => { document.title = `${count()} items`; });
```

jasno disposes what it creates in setup (computeds, effects, resources, children); window/document listeners and timers go in `onMount`, never in setup. App-wide state is a signal in `src/state.ts`; app-lifetime effects go in App's setup.

## Project

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>App</title><!--jasno:head--></head>
<body><div id="app"></div><script type="module">import '/src/main.ts';</script></body></html>
```

Never write an import map: `jasno dev`/`dist` put one at `<!--jasno:head-->`. `src/main.ts`: `mount(App, document.getElementById('app'))`. `package.json`: `"type": "module"`, scripts as in Verify. Relative imports end in `.ts`; npm packages by name. `tsconfig.json` covers `src` minus tests; `tsconfig.test.json` adds `"types": ["node"]` for `*.test.ts`.

## Testing

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush } from '@jasno/core';
import { mountTest } from '@jasno/core/testing';

test('filters', (t) => {
  const view = mountTest(t, () => TodoList({ todos: () => [{ id: 1, text: 'milk', done: false }], onToggle: () => {} }));
  const input = view.root.querySelector('input')!;
  input.focus();
  input.value = 'milk';
  input.dispatchEvent(new Event('input'));
  flush(); // async: await settled()
  assert.equal(view.root.querySelectorAll('li').length, 1);
});
```

Warnings, uncaught effect errors and leaked effects fail the test: fix them. Module-level signals reset after each test. Compare nodes with `assert.ok(a === b)` (`assert.equal` prints both: out of memory).

## Verify in order (non-zero exit = fail)

1. `npm run check` (`jasno check`): tsc for both configs plus its rules.
2. `npm test`: `node --conditions=development --import @jasno/core/testing/happy-dom --test --test-isolation=none "src/**/*.test.ts"`.
3. `npx playwright test` against `npm run dev`: `getByRole`, focus, keyboard.

If a rung cannot run, say so; never claim it passed. State: `window.__JASNO__.diagnostics()`; fixes: `npm run explain CODE`.

## Top mistakes (tsc accepts these)

| Mistake | Fix |
|---|---|
| `h.p(null, count())`, `h.a({ title: t() })` | `count`, `() => t()` |
| loader reads `query()` | `params: () => query()` |
| disabling/removing the focused button | `'aria-disabled'`; move focus |
| Enter keydown that moves focus | form `onsubmit`, or `e.preventDefault()` |
<!-- jasno:end -->
