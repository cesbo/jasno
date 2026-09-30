<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# IMPORT_NOT_MAPPED

**error**, reported by jasno check, jasno dev, jasno dist: a bare specifier in a browser file that is not jasno, jasno/router, a dependencies package or a package.json "imports" key (dev and dist: one that does not resolve).

<!-- /generated:catalogue -->

A browser file imports a bare name that the import map will not contain. There is no bundler: the browser resolves bare names only through the import map that `jasno dev` and `jasno dist` generate, which holds `jasno`, `jasno/router`, the packages in `dependencies` and the package.json `"imports"` keys (`#config`). Any other name fails to load in the browser, and so does every module that imports it.
<!-- design.md: (c) check/dev/dist, (e) check 3, ADR-35 -->

## Fix

- An npm package: `npm install <name>` so it is in `dependencies`. A package in `devDependencies` is not mapped: browser code ships, so what it imports is a dependency.
- `jasno/testing` (or another `jasno/*` path): it is for tests; browser code imports only `jasno` and `jasno/router`.
- A `#name` alias: add the key to package.json `"imports"`.
- Reported by `jasno dev` or `jasno dist`: the name does not resolve because the package is not installed (`npm install`), or the path after the package name is not in its `"exports"`; the message gives the resolver's reason.

## Example

```ts no-check
import { z } from 'zod';        // needs "zod" in dependencies
import { getUser } from '#api'; // needs "#api" in package.json "imports"
```

```json
// Wrong: zod is a devDependency and there is no "#api" key
{ "devDependencies": { "zod": "^4.0.0" } }
```

```json
// Right
{
  "dependencies": { "jasno": "^1.0.0", "zod": "^4.0.0" },
  "imports": { "#api": { "development": "./src/api.mock.ts", "default": "./src/api.ts" } }
}
```

## Fixture

`test/cli/spec/check.test.ts` › IMPORT_NOT_MAPPED: a devDependency, an unknown #key, a dynamic bare import
