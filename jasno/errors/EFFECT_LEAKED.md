<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# EFFECT_LEAKED

**test failure**, jasno/testing: owners created by the test alive after unmount.

- Message: `{n} owners created by this test are alive after unmount: {paths}.`
- Hint: Create effects and resources during setup or onMount, not in handlers or after await.

<!-- design.md: B19.4 -->
<!-- /generated:catalogue -->

When the test ended and its view was unmounted, effects, resources or components created during the test were still alive. They were created where there is no owner, in an event handler or after an `await`, so nothing ever disposes them: in the app they keep running after the part of the page that made them is gone, and every click adds another. The message lists their owner paths (`(no owner)` for ownerless ones); `NO_OWNER` is usually reported for the same code.

## Fix

- Create effects and resources in setup (the component body) or in `onMount`, before any `await`: there they belong to the component and are disposed with it.
- Handlers only change signals. An effect or resource created in setup reacts to them: for a load that a click starts, the handler sets the signal the resource reads in `params`.
- App-lifetime work goes in a module-level `createRoot(() => ...)` in `src/state.ts`; such roots are never counted.
- An effect the test body creates itself: call the `stop()` it returns before the test ends.

## Example

```ts
import { component, effect, h, signal } from 'jasno';

// Wrong: every click creates another effect with no owner, and none is ever disposed
export const CounterWrong = component(function CounterWrong(): Node {
  const count = signal(0);
  return h.button({ type: 'button', onclick: () => {
    count.set(count() + 1);
    effect(() => { document.title = `${count()} clicks`; });
  } }, 'Add');
});

// Right: one effect, created in setup and disposed with the component; the handler only writes the signal
export const Counter = component(function Counter(): Node {
  const count = signal(0);
  effect(() => { document.title = `${count()} clicks`; });
  return h.button({ type: 'button', onclick: () => count.set(count() + 1) }, 'Add');
});
```

## Fixture

`test/spec/devtest.test.ts` › B19.4 EFFECT_LEAKED counts ownerless effects created after await; stopped effects and detached roots are not counted
