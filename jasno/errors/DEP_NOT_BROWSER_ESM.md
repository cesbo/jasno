<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# DEP_NOT_BROWSER_ESM

**error**, reported by jasno dev, jasno dist: a dependency's static closure contains CommonJS, an unguarded process.env read (a typeof process guard is fine) or an unresolvable bare import, or an installed dependency has no entry for the browser/import/default conditions (an optional peer behind import() inside a dependency is not checked).

<!-- /generated:catalogue -->

A package that the app imports cannot run in the browser as installed.

`jasno dev` does not bundle. It serves each file of the import closure of a dependency as an ES module, and the browser runs the file as it is. `jasno dist` bundles these files with Rolldown, but it checks them the same way. So a package that cannot run in dev also fails the build.

jasno reports this error in these cases:

- A file in the closure uses CommonJS (`require`, `module.exports`).
- A file in the closure reads `process.env` without a `typeof process` guard.
- A file in the closure imports something that does not resolve, such as a `node:` module or a package that is not installed.
- The `"exports"` of the package has no entry for the `browser`, `import` or `default` condition.

`jasno dev` prints the error. `jasno dist` fails. The message names the dependency file and position.
<!-- design.md: (c) dev/dist, ADR-35 -->

## Fix

- Use a version of the package that ships ES modules for browsers (`"exports"` with a `browser` or `import` condition, or, with no `"exports"`, a `"module"` field). Or use a different package that does.
- A `process.env` read: use the browser build of the package if it has one. A read behind `typeof process !== 'undefined'` is fine.
- A bare import inside the package that does not resolve: install the package that the import names. It is often a peer dependency. A `node:` import means the package is for Node only.
- jasno does not check optional peers that a package loads with `import()`.

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
