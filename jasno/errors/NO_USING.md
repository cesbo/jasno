<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NO_USING

**error**, reported by jasno check: using declarations (TS2318 has no location).

<!-- /generated:catalogue -->

The code uses a `using` or `await using` declaration. The oldest browsers jasno supports cannot run it.

TypeScript's own error for it in the browser program is TS2318 (the missing `Disposable` type). That error carries no file or line. So this rule points at the declaration instead.

Adding `esnext.disposable` to `lib` only hides the type error. It is itself `TSCONFIG_DRIFT`.

<!-- design.md: (c) jasno check table; (e) jasno check 5; (h) non-goals -->

## Fix

- Release the resource in `try`/`finally`.
- In a component, create it in `onMount` and return the cleanup. Or pass `abortSignal` to APIs that accept one. jasno runs the cleanup when the component goes away.
- Remove `esnext.disposable` from `lib` if you added it.

The rule runs in tests too.

## Example

```ts no-check
declare function openConnection(): { read(): string; [Symbol.dispose](): void };

// Wrong: `using` is outside jasno's syntax
export function readAllWrong(): string {
  using conn = openConnection();
  return conn.read();
}
```

```ts
import { component, h, onMount } from '@jasno/core';

declare function openConnection(): { read(): string; close(): void };

// Right: try/finally releases it on every path
export function readAll(): string {
  const conn = openConnection();
  try { return conn.read(); } finally { conn.close(); }
}

// Right, in a component: return the cleanup from onMount
export const Live = component(function Live(): Node {
  onMount(() => { const conn = openConnection(); return () => conn.close(); });
  return h.p(null, 'Connected');
});
```

## Fixture

`test/cli/check.test.ts` › NO_TS_CLASS_MODIFIER, NO_DECORATORS, NO_ACCESSOR, NO_USING
