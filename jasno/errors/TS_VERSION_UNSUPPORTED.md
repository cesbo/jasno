<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# TS_VERSION_UNSUPPORTED

**error**, reported by jasno check: the loaded TypeScript is outside the tested range (~7.0.2), or typescript is not installed.

<!-- /generated:catalogue -->

`jasno check` loaded a TypeScript version that jasno is not tested with. jasno is tested with 7.0.2 or a later 7.0.x patch. The error also appears when the project has no `typescript` package.

jasno's rules read the TypeScript syntax tree and types through an API. This API is not stable across versions. jasno stops the check instead of reporting wrong results.

The first line of the output, `typescript <version>`, shows which version jasno loaded.
<!-- design.md: (c) jasno check table; (e) jasno check 1; ADR-26 -->

## Fix

- Pin TypeScript with a tilde range in `devDependencies` and install it: `npm install -D typescript@~7.0.2`.
- Run the check through the npm script (`npm run check`). jasno uses the `typescript` that resolves from your project's `package.json`, not a global `tsc`.
- If the pin is right and the message remains, another copy of `typescript` resolves first. For example, a workspace root has its own copy. `npm ls typescript` shows which copy resolves first.

## Example

```json
// Wrong: a caret range lets npm install 7.1 or later, outside the tested range
{ "devDependencies": { "typescript": "^7.0.2" } }
```

```json
// Right: 7.0.2 or a later 7.0.x patch
{ "devDependencies": { "typescript": "~7.0.2" } }
```

## Fixture

`test/cli/check.test.ts` › TS_VERSION_UNSUPPORTED outside ~7.0.2, and when typescript is missing
