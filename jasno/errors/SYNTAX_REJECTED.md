<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# SYNTAX_REJECTED

**error**, reported by jasno check, jasno dev, jasno dist: the stripped file does not parse as a module (check parses all files in one process with vm.SourceTextModule and locates a failure with node --check; dev serves a module that throws with file:line:col; dev and dist also report syntax the type stripper refuses, such as enum).

<!-- /generated:catalogue -->

After type stripping, the file is not a valid JavaScript module. Either the stripper refused TypeScript syntax that needs a code transform (`enum`, a `namespace` with code, constructor parameter properties, `import x = require()`, `<T>value` assertions), or the stripped text does not parse in V8 (a duplicate export name, a decorator, an `accessor` field, a plain syntax error). The browser cannot load such a module. When the stripper refuses a file, `jasno dev` serves a module that throws `SyntaxError("[SYNTAX_REJECTED] /src/x.ts:3:7 ...")` and prints the same line, and `jasno dist` stops.
<!-- design.md: (c) jasno check table; (e) jasno check 4, jasno dev -->

## Fix

- `enum`: a const object and a union type of its values (below).
- `namespace`: plain module exports (a `declare namespace` with types only is fine).
- Parameter properties (`constructor(private x: number)`): declare a `#private` field and assign it in the constructor.
- `<T>value`: write `value as T`. `import x = require('y')`: write `import x from 'y'`.
- `NO_DECORATORS` or `NO_ACCESSOR` on the same line: fix that. Otherwise the message carries V8's error text and the position.

## Example

```ts no-check
// Wrong: the stripper cannot erase an enum
export enum Status { Idle, Loading, Done }
```

```ts
// Right: a const object and a union type of its values
export const Status = { Idle: 'idle', Loading: 'loading', Done: 'done' } as const;
export type Status = (typeof Status)[keyof typeof Status];
```

## Fixture

`test/cli/check.test.ts` › the syntax gate: a V8 parse error after stripping, and a file the stripper rejects
