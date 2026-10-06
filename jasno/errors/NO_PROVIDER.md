<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NO_PROVIDER

**error (throws)**, runtime, dev and production builds: no provider and no default.

- Message: `No provider for context "{name}" in {ownerPath}.`
- Hint: Wrap the subtree in provide({name}, value, () => ...) or give createContext a default. A consumer passed as children was created before the provider: pass () => Child.

<!-- design.md: B13.2 -->
<!-- /generated:catalogue -->

`useContext(Ctx)` found no `provide(Ctx, value, ...)` above the component that called it. `createContext` was given no default. So jasno threw, in dev and production builds.

The lookup walks up from the owner that was current when the consumer was created. It does not start from where the node ends up in the DOM.

## Fix

- Wrap the subtree in `provide(Ctx, value, () => ...)` above every consumer. Do this in App for app-wide values. In tests, wrap the component under test: `mountTest(t, () => provide(Ctx, value, () => Panel()))`.
- A consumer handed over as a node (`child: Label()`) is created by the caller, before the provider runs. Pass a function prop instead (`panel: () => Label()`). Call it inside `provide`.
- When a sensible fallback exists, give `createContext` a default: `createContext<string>('Theme', 'light')`.

## Example

```ts
import { component, createContext, h, provide, useContext } from '@jasno/core';

const Theme = createContext<string>('Theme');
const Label = component(function Label(): Node { return h.span(null, useContext(Theme)); });

// Wrong: Label() runs in AppWrong, before FrameWrong's provide()
const FrameWrong = component(function FrameWrong(p: { panel: Node }): Node {
  return provide(Theme, 'dark', () => h.div(null, p.panel));
});
export const AppWrong = component(function AppWrong(): Node { return FrameWrong({ panel: Label() }); });

// Right: pass a function; Frame calls it inside provide()
const Frame = component(function Frame(p: { panel: () => Node }): Node {
  return provide(Theme, 'dark', () => h.div(null, p.panel()));
});
export const App = component(function App(): Node { return Frame({ panel: () => Label() }); });
```

## Fixture

`test/spec/recipes.test.ts` › AGENTS claim: a consumer passed as children is created before the provider (NO_PROVIDER); a function prop works
