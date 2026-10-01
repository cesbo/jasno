<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# COMPONENT_NOT_WRAPPED

**warn**, reported by jasno check: exported PascalCase function returning Node without component().

<!-- /generated:catalogue -->

An exported function with a PascalCase name returns `Node` but is not wrapped in `component()`. Without the wrapper it has no owner of its own: the effects, `onMount` callbacks and cleanups it creates belong to whichever component called it, and owner paths in diagnostics and `window.__JASNO__` do not name it.
<!-- design.md: (c) check, B14.1, ADR-06 -->

## Fix

- Wrap it and keep the name: `export const Card = component(function Card(p: CardProps): Node { ... })`. Call sites stay the same: `Card({ title })`.
- Export a `CardProps` interface next to it: data props are `Read<T>`, callbacks plain functions.
- A small markup helper that creates no signals, effects or `onMount` callbacks may stay a plain function: give it a camelCase name (`badge(text)`). It is then not a component and is not reported.

## Example

```ts
import { component, h, onMount, signal, type Read } from '@jasno/core';

export interface ClockProps { label: Read<string> }

// Wrong: a plain function; its timer belongs to whichever component calls it
export function ClockWrong(p: ClockProps): Node {
  const now = signal(new Date());
  onMount(() => { const t = setInterval(() => now.set(new Date()), 1000); return () => clearInterval(t); });
  return h.p(null, p.label, ' ', () => now().toLocaleTimeString());
}

// Right: a component that owns its timer and shows as <Clock> in owner paths
export const Clock = component(function Clock(p: ClockProps): Node {
  const now = signal(new Date());
  onMount(() => { const t = setInterval(() => now.set(new Date()), 1000); return () => clearInterval(t); });
  return h.p(null, p.label, ' ', () => now().toLocaleTimeString());
});
```

## Fixture

`test/cli/check.test.ts` › COMPONENT_NOT_WRAPPED, ANONYMOUS_COMPONENT, COMPONENT_RETURN_TYPE (warn)
