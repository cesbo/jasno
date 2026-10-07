<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# IMPORT_NOT_MAPPED

**error**, reported by jasno check, jasno dev, jasno dist: a bare specifier in a browser file that is not @jasno/core, @jasno/core/router, a dependencies package or a package.json "imports" key (dev and dist: one that does not resolve).

<!-- /generated:catalogue -->

A browser file imports a bare name that jasno does not map. In dev, the browser resolves bare names only through the import map that `jasno dev` generates. `jasno dist` bundles the imports with Rolldown at build time.

jasno maps these names:

- `@jasno/core` and `@jasno/core/router`
- the packages in `dependencies`
- the package.json `"imports"` keys (`#config`)

In dev, any other name fails to load in the browser, and every module that imports it fails too. `jasno dist` fails the build instead.
<!-- design.md: (c) check/dev/dist, (e) check 3, ADR-35 -->

## Fix

- An npm package: run `npm install <name>` so it is in `dependencies`. jasno does not map a package in `devDependencies`. Browser code ships, so what it imports is a dependency.
- `@jasno/core/testing` (or another `jasno/*` path): this path is for tests. Browser code imports only `@jasno/core` and `@jasno/core/router`.
- A `#name` alias: add the key to package.json `"imports"`.
- Reported by `jasno dev` or `jasno dist`: the name does not resolve. Either the package is not installed (run `npm install`), or the path after the package name is not in its `"exports"`. The message gives the reason from the resolver.

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
  "dependencies": { "@jasno/core": "^1.0.0", "zod": "^4.0.0" },
  "imports": { "#api": { "development": "./src/api.mock.ts", "default": "./src/api.ts" } }
}
```

## Fixture

`test/cli/spec/check.test.ts` › IMPORT_NOT_MAPPED: a devDependency, an unknown #key, a dynamic bare import
