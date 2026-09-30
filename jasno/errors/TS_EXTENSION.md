<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# TS_EXTENSION

**error**, reported by jasno check, jasno dev, jasno dist: relative specifier not ending in .ts (.json for JSON modules; dev: 404 for x.js when x.ts exists, with the hint); check also for an entry in index.html ending in .js whose .ts exists.

<!-- /generated:catalogue -->

An import names a relative module without its real extension: `./format.js` or `./format` instead of `./format.ts`. jasno ships your `.ts` files as the modules the browser loads and never rewrites import specifiers, so the browser (and Node, in tests) requests exactly the path you wrote: `jasno dev` answers it with a 404 and `jasno dist` refuses to build.
<!-- design.md: (c) jasno check table; (e) jasno check 5, jasno dev; (f) conventions -->

## Fix

- Write the file name as it is on disk: `./format.ts`. A `.js` specifier (the habit from compiling TypeScript to JavaScript) becomes `.ts`.
- JSON modules keep `.json`, with the import attribute: `import data from './data.json' with { type: 'json' }`.
- The rule covers `import`, `export ... from` and `import()`, in browser files and in `*.test.ts` files alike.
- The entry in `index.html` follows the same rule: `import '/src/main.ts'`.

## Example

```ts no-check
// Wrong: the browser requests /src/format.js and /src/views/user, which do not exist
import { formatDate } from './format.js';
export const userView = () => import('./views/user');
```

```ts no-check
// Right: the files as they are on disk
import { formatDate } from './format.ts';
import messages from './messages.json' with { type: 'json' };
export const userView = () => import('./views/user.ts');
```

## Fixture

`test/cli/check.test.ts` › TS_EXTENSION: a relative specifier that does not end in .ts (JSON modules keep .json), in browser and test files
