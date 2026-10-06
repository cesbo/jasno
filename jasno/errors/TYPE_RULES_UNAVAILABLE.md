<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# TYPE_RULES_UNAVAILABLE

**warn (fails under --strict or CI)**, reported by jasno check: the TS API failed to load; tsc ran as a subprocess and the rules that need the syntax tree or types were skipped.

<!-- /generated:catalogue -->

`jasno check` could not import the TypeScript API from your project's `typescript` package. The API modules are `typescript/unstable/sync` and `typescript/unstable/ast`. The message quotes the import error.

jasno still ran `tsc` for both configs. It also ran the rules that work on the stripped module text. It skipped every rule that needs the syntax tree or types.

Problems such as `NO_HTML_SINK`, `USE_ROUTER`, `CURRENT_TARGET_AFTER_AWAIT` or `SIGNAL_IN_TEMPLATE` can be in the code without a report.
<!-- design.md: (c) jasno check table; (e) jasno check 1, 7; ADR-26 -->

## Fix

- Read the error in the message. It usually points to a broken or partial install of `typescript`.
- Reinstall it with `npm install -D typescript@~7.0.2`. Or delete `node_modules` and install again.
- Run `npm run check` again. The warning is gone once the API loads.

The warning does not fail a plain `npm run check`. It fails under `--strict` and whenever the `CI` environment variable is set. A green check without these rules proves little.

These checks still run without the API:

- tsc's own diagnostics
- `TS_EXTENSION`
- `IMPORT_NOT_MAPPED`
- `NODE_TYPES_IN_BROWSER_CODE` for runtime `node:` imports
- `IMPORT_MAP_HANDWRITTEN`
- the syntax gate (`SYNTAX_REJECTED`)
- `TSCONFIG_DRIFT`

## Example

```sh
# Wrong: pass the check locally and ignore the warning; CI fails on it
npm run check

# Right: reinstall, then run the check the way CI does
rm -rf node_modules && npm install
npm run check -- --strict
```

## Fixture

`test/cli/check.test.ts` › without the TS API: tsc runs as a subprocess, TYPE_RULES_UNAVAILABLE warns (fails under --strict)
