<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# EFFECT_LOOP

**error (throws)**, runtime, dev and production builds (microtask guard: dev): a consumer ran more than 100 times in a flush, round 101, or 1,000 microtask flushes without a macrotask.

- Message: `{names} kept re-triggering each other ({runs} runs); DOM may be stale in: {bindings}.`
- Hint: A consumer writes state it reads: derive it with computed()/linkedSignal(), or make the write conditional so it converges.

<!-- design.md: B4.6, B4.10 -->
<!-- /generated:catalogue -->

Effects or live bindings kept re-triggering each other: one ran more than 100 times in a single flush, the flush reached round 101, or (dev build) more than 1,000 microtask flushes ran with no macrotask in between. Without the cap the tab would freeze. jasno stopped the loop and threw, naming the consumers that ran most (with their locations in dev) and the bindings whose DOM may now be stale; they stay subscribed, so the next change to what they read runs them again.

## Fix

Find the consumer the message names first, then:

- An effect that writes a signal it reads: derive the value with `computed()`, or with `linkedSignal()` if the user can also set it. `EFFECT_WRITES_STATE` usually warned about this effect first.
- A write that must stay in an effect: make it converge. Signals compare with `Object.is`, so writing a new array or object on every run never settles; write only when the value really differs.
- Two effects that write each other's sources: compute both values in one `computed()`, or move the writes to the event handler that starts the change.
- An effect that writes after `.then()` (the 1,000-microtask guard): load async data with `resource({ params, loader })` instead.

## Example

```ts
import { component, computed, each, effect, h, signal } from '@jasno/core';

// Wrong: the effect reads names and writes a new sorted array back on every run
export const NamesWrong = component(function NamesWrong(): Node {
  const names = signal<readonly string[]>(['Bea', 'Ada']);
  effect(() => { names.set([...names()].sort()); });
  return h.ul(null, each(names, { key: (n) => n, render: (n) => h.li(null, n) }));
});

// Right: the sorted list is derived; nothing writes back
export const Names = component(function Names(): Node {
  const names = signal<readonly string[]>(['Bea', 'Ada']);
  const sorted = computed(() => [...names()].sort());
  return h.ul(null, each(sorted, { key: (n) => n, render: (n) => h.li(null, n) }));
});
```

## Fixture

`test/spec/core.test.ts` › B4.6 a flush reaching round 101 throws EFFECT_LOOP naming the looping effect
