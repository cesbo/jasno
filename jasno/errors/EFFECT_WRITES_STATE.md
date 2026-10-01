<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# EFFECT_WRITES_STATE

**warn**, runtime, dev builds: an effect run wrote a signal that something observes, or that the effect itself read.

- Message: `Effect "{effect}" wrote signal "{signal}" during its run.`
- Hint: Derive it with computed() or linkedSignal(), or write it in the event handler that caused the change; effects only sync the outside world. A subscription whose callback sets signals goes in onMount (per route param: inside match(() => p.params().id, (id) => Body({ id }))).

<!-- design.md: B5.3 -->
<!-- /generated:catalogue -->

An effect set a signal during its run, and that signal is shown somewhere or was read by the effect itself. The write is applied, but it starts another round of updates, and an effect that reads what it writes re-runs until it settles or hits the loop cap (`EFFECT_LOOP`). Effects only sync the outside world (`document.title`, `localStorage`, a widget); state belongs in signals, computeds and handlers.

## Fix

- A value that follows other state: `computed()`. State that resets when an input changes but can also be edited: `linkedSignal({ source: p.userId, computation: () => '' })`.
- A change the user causes: write it in the event handler.
- A subscription (socket, store, presence) whose callback sets signals: subscribe in `onMount` and return the unsubscribe. To resubscribe per route param, put it in a body keyed by the param: `match(() => p.params().id, (id) => Body({ id }))`, with `onMount` inside.
- Neither a callback nor `untracked()` hides the write: a subscription that emits its current state before the effect returns writes during the run too.

## Example

```ts
import { component, effect, h, match, onMount, signal, type Read } from '@jasno/core';

declare function subscribePresence(roomId: string, onChange: (users: readonly string[]) => void): () => void;

// Wrong: the subscription's first callback sets online during the effect run
export const OnlineWrong = component(function OnlineWrong(p: { roomId: Read<string> }): Node {
  const online = signal<readonly string[]>([]);
  effect(() => subscribePresence(p.roomId(), online.set));
  return h.p(null, () => online().join(', '));
});

// Right: subscribe in onMount, in a body rebuilt per room
const Presence = component(function Presence(p: { roomId: string }): Node {
  const online = signal<readonly string[]>([]);
  onMount(() => subscribePresence(p.roomId, online.set));
  return h.p(null, () => online().join(', '));
});
export const Online = component(function Online(p: { roomId: Read<string> }): Node {
  return h.div(null, match(p.roomId, (id) => Presence({ roomId: id })));
});
```

## Fixture

`test/spec/recipes.test.ts` › Per-param lifecycle claim: the same subscription in effect() reports EFFECT_WRITES_STATE
