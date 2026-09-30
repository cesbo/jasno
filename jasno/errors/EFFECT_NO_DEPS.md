<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# EFFECT_NO_DEPS

**warn**, runtime, dev builds: an effect's first run read no signal.

- Message: `Effect "{effect}" read no signals, so it never re-runs.`
- Hint: Use onMount() for one-time work, or read the signals it should react to.

<!-- /generated:catalogue -->

An effect's first run read no signal, so nothing can ever make it run again: it behaved like a one-time callback that happens to be written as an effect. Either the work is one-time and belongs in `onMount`, or the effect was meant to react to state and never read it (the read sits behind an early return or inside `untracked()`). The dev build warns.

## Fix

- One-time work (a window listener, focus, a third-party widget, a value set once): use `onMount(fn)`. It runs after the nodes are inserted, and its cleanup or `abortSignal` ends with the component.
- Work that should follow state: read the signals in every run, before any early return: `effect(() => { const t = title(); if (!enabled) return; document.title = t; })`.

## Example

```ts
import { component, effect, h, onMount } from 'jasno';

declare function fit(): void;

// Wrong: the effect reads no signal; it runs once and never again
export const ChartWrong = component(function ChartWrong(): Node {
  effect(({ abortSignal }) => { window.addEventListener('resize', fit, { signal: abortSignal }); });
  return h.div({ class: 'chart' });
});

// Right: one-time setup goes in onMount
export const Chart = component(function Chart(): Node {
  onMount(({ abortSignal }) => { window.addEventListener('resize', fit, { signal: abortSignal }); });
  return h.div({ class: 'chart' });
});
```

## Fixture

`test/spec/devtest.test.ts` › B12.6 UNTRACKED_IN_DERIVATION: computeds and bindings that read only through untracked(); effects and mixed reads are not reported
