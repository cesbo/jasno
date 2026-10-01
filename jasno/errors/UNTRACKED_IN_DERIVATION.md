<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# UNTRACKED_IN_DERIVATION

**warn**, runtime, dev builds: a derivation read only through untracked().

- Message: `{kind} "{node}" read nothing tracked; it can never update.`
- Hint: Read the signal directly; untracked() is for setup-time seeds only.

<!-- design.md: B12.6 -->
<!-- /generated:catalogue -->

A `computed()` or a live binding function ran and read every signal through `untracked()`, so it depends on nothing and can never recompute: it shows its first value forever. `untracked()` is not a way to silence `STRICT_READ_UNTRACKED`; inside a function jasno re-runs, it only switches tracking off. The dev build warns.

## Fix

- Read the signal directly inside the computed or binding: `computed(() => p.name().toUpperCase())`.
- If the value really must stay as it was at creation (a draft's first text), take it once in setup as a plain value, `const initial = untracked(p.name)`, and use that value, not a function.

## Example

```ts
import { component, computed, h, untracked, type Read } from '@jasno/core';

// Wrong: the computed reads only through untracked(); the heading never changes
export const TitleWrong = component(function TitleWrong(p: { name: Read<string> }): Node {
  const upper = computed(() => untracked(p.name).toUpperCase());
  return h.h2(null, upper);
});

// Right: read the prop directly so the computed follows it
export const Title = component(function Title(p: { name: Read<string> }): Node {
  const upper = computed(() => p.name().toUpperCase());
  return h.h2(null, upper);
});
```

## Fixture

`test/spec/devtest.test.ts` › B12.6 UNTRACKED_IN_DERIVATION: computeds and bindings that read only through untracked(); effects and mixed reads are not reported
