<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# EFFECT_LEAKED

**test failure**, @jasno/core/testing: owners created by the test alive after unmount.

- Message: `{n} owners created by this test are alive after unmount: {paths}.`
- Hint: Create effects and resources during setup or onMount, not in handlers or after await.

<!-- design.md: B19.4 -->
<!-- /generated:catalogue -->

The test ended and its view was unmounted. Effects, resources or components created during the test were still alive.

They were created where there is no owner, in an event handler or after an `await`. Nothing ever disposes them. In the app they keep running after the part of the page that made them is gone. Every click adds another.

The message lists their owner paths. It shows `(no owner)` for ownerless ones. jasno usually reports `NO_OWNER` for the same code.

## Fix

- Create effects and resources in setup (the component body) or in `onMount`, before any `await`. There they belong to the component, and jasno disposes them with it.
- Handlers only change signals. An effect or resource created in setup reacts to them. For a load that a click starts, the handler sets the signal the resource reads in `params`.
- Put app-lifetime work in a module-level `createRoot(() => ...)` in `src/state.ts`. jasno never counts such roots.
- An effect the test body creates itself: call the `stop()` it returns before the test ends.

## Example

```ts
import { component, effect, h, signal } from '@jasno/core';

// Wrong: every click creates another effect with no owner, and none is ever disposed
export const CounterWrong = component(function CounterWrong(): Node {
  const count = signal(0);
  return h.button({ type: 'button', onclick: () => {
    count.set(count() + 1);
    effect(() => { document.title = `${count()} clicks`; });
  } }, 'Add');
});

// Right: the effect is created in setup, and the handler only writes the signal
export const Counter = component(function Counter(): Node {
  const count = signal(0);
  effect(() => { document.title = `${count()} clicks`; });
  return h.button({ type: 'button', onclick: () => count.set(count() + 1) }, 'Add');
});
```

## Fixture

`test/spec/devtest.test.ts` › B19.4 EFFECT_LEAKED counts ownerless effects created after await; stopped effects and detached roots are not counted
