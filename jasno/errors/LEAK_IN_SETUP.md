<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# LEAK_IN_SETUP

**warn**, runtime, dev builds: global listener or timer created in setup.

- Message: `{api} was called during setup of {region}; it outlives the component.`
- Hint: Move it into onMount(({ abortSignal }) => ...) and pass { signal: abortSignal } or return a cleanup.

<!-- design.md: B12.8 -->
<!-- /generated:catalogue -->

Setup code (a component body or a region builder) started a timer (`setTimeout`, `setInterval`) or added a listener to a global target (window, document, a media query list, a socket or a channel) without a `signal` option. jasno disposes what a component creates, but not these. They keep running after the component is gone, and every rebuild of the component adds another one.

## Fix

Move the call into `onMount`, which runs after the nodes are inserted and cleans up when the component goes away:

- Listeners: `onMount(({ abortSignal }) => window.addEventListener('resize', fit, { signal: abortSignal }))`.
- Timers: `onMount(() => { const t = setInterval(tick, 1000); return () => clearInterval(t); })`.
- A timer that restarts when a signal changes (polling) goes in an `effect` that returns a cleanup.

Listeners on elements are not reported: use `on*` props on the elements you create. Timers started in event handlers are fine.

## Example

```ts
import { component, h, onMount, signal } from 'jasno';

// Wrong: the interval and the resize listener outlive the component
export const ClockWrong = component(function ClockWrong(): Node {
  const now = signal(Date.now());
  const wide = signal(innerWidth > 800);
  setInterval(() => now.set(Date.now()), 1000);
  window.addEventListener('resize', () => wide.set(innerWidth > 800));
  return h.time({ class: { wide } }, () => new Date(now()).toLocaleTimeString());
});

// Right: start them in onMount; jasno stops them when the component goes away
export const Clock = component(function Clock(): Node {
  const now = signal(Date.now());
  const wide = signal(innerWidth > 800);
  onMount(({ abortSignal }) => {
    window.addEventListener('resize', () => wide.set(innerWidth > 800), { signal: abortSignal });
    const t = setInterval(() => now.set(Date.now()), 1000);
    return () => clearInterval(t);
  });
  return h.time({ class: { wide } }, () => new Date(now()).toLocaleTimeString());
});
```

## Fixture

`test/spec/devtest.test.ts` › B12.8 LEAK_IN_SETUP: timers and window/document listeners without signal in setup; elements, { signal } and non-setup code are silent
