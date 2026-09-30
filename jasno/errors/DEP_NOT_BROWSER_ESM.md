<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# DEP_NOT_BROWSER_ESM

**error**, reported by jasno dev, jasno dist: a dependency's static closure contains CommonJS, an unguarded process.env read (a typeof process guard is fine) or an unresolvable bare import, or an installed dependency has no entry for the browser/import/default conditions (an optional peer behind import() inside a dependency is not checked).

<!-- /generated:catalogue -->

A package the app imports cannot run in the browser as installed. jasno does not bundle: `jasno dev` serves each file of a dependency's import closure as an ES module and `jasno dist` copies those files as they are. Reported when a file in that closure uses CommonJS (`require`, `module.exports`), reads `process.env` without a `typeof process` guard, or imports something that does not resolve (a `node:` module, a package that is not installed), or when the package's `"exports"` has no entry for the `browser`, `import` or `default` condition. `jasno dev` prints it and `jasno dist` fails; the message names the dependency file and position.
<!-- design.md: (c) dev/dist, ADR-35 -->

## Fix

- Use a version of the package that ships ES modules for browsers (`"exports"` with a `browser` or `import` condition), or a different package that does.
- A `process.env` read: use the package's browser build if it has one (a read behind `typeof process !== 'undefined'` is fine).
- A bare import inside the package that does not resolve: install the package it names (often a peer dependency); a `node:` import means the package is for Node only.
- Optional peers that a package loads with `import()` are not checked.

## Example

```js
// Wrong: node_modules/old-lib/index.js is CommonJS
module.exports = { slugify: require('./slugify.js') };
```

```json
// Wrong: node_modules/node-only/package.json offers only Node conditions
{ "name": "node-only", "exports": { "node": "./index.js", "require": "./index.cjs" } }
```

```json
// Right: an ES module build that the browser conditions reach
{ "name": "esm-lib", "type": "module", "exports": { "browser": "./browser.js", "import": "./index.js" } }
```

## Fixture

`test/cli/dist.test.ts` › DEP_NOT_BROWSER_ESM: CommonJS or process.env in a dependency closure fails the build
