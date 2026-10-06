<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# EFFECT_NO_DEPS

**warn**, runtime, dev builds: an effect's first run read no signal.

- Message: `Effect "{effect}" read no signals, so it never re-runs.`
- Hint: Use onMount() for one-time work, or read the signals it should react to.

<!-- /generated:catalogue -->

The first run of an effect read no signal. Nothing can make it run again. It behaves like a one-time callback that is written as an effect.

There are two possible causes:

- The work is one-time and belongs in `onMount`.
- The effect should react to state but never reads it. The read sits behind an early return or inside `untracked()`.

The dev build warns.

## Fix

- One-time work (a window listener, focus, a third-party widget, a value set once): use `onMount(fn)`. It runs after jasno inserts the nodes. Its cleanup or `abortSignal` ends with the component.
- Work that should follow state: read the signals in every run, before any early return. Example: `effect(() => { const t = title(); if (!enabled) return; document.title = t; })`.

## Example

```ts
import { component, effect, h, onMount } from '@jasno/core';

declare function fit(): void;

// Wrong: the effect reads no signal, so it runs once and never again.
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
