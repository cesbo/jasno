<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NODE_TYPES_IN_BROWSER_CODE

**error**, reported by jasno check: /// <reference types="node" /> or a node: import in a browser file.

<!-- /generated:catalogue -->

A browser file imports a `node:` module or starts with `/// <reference types="node" />`. A browser file is a non-test file under `src/`, or a module the `index.html` entry reaches.

Node's modules do not exist in the browser. The import fails when the page loads.

The reference directive is worse. It gives every browser file Node's globals. Then `process.env.X` type-checks. And `setTimeout()` returns Node's `Timeout` instead of a number.
<!-- design.md: (c) jasno check table; (e) jasno check 1, 3, 5; ADR-26 -->

## Fix

- Delete the `/// <reference types="node" />` line. Do the same in `.d.ts` files under `src/`. Tests get Node's types from `tsconfig.test.json`.
- Keep Node code in tests, e2e specs and config files, or in a script outside `src/`.
- In browser code, use the web platform instead: `crypto.randomUUID()` and `crypto.subtle` for `node:crypto`, `TextEncoder` and `Uint8Array` for `Buffer`, `EventTarget` for `node:events`.

The rule covers `import` (type-only imports too), `export ... from`, `import()` and `typeof import('node:...')`.

## Example

```ts
// Wrong: node:crypto does not exist in the browser, so the page fails to load
import { randomUUID } from 'node:crypto';
export const newIdWrong = (): string => randomUUID();

// Right: the Web Crypto API is a browser global
export const newId = (): string => crypto.randomUUID();
```

## Fixture

`test/cli/check.test.ts` › IMPORT_NOT_MAPPED and NODE_TYPES_IN_BROWSER_CODE (a node: import, type-only too, and the triple-slash reference)
