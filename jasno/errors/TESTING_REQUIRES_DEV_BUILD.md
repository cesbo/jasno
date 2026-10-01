<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# TESTING_REQUIRES_DEV_BUILD

**error at import**, @jasno/core/testing: @jasno/core/testing resolved without --conditions=development.

- Message: `@jasno/core/testing needs the development build of jasno.`
- Hint: Run node with --conditions=development (npm test does).

<!-- /generated:catalogue -->

A test imported `@jasno/core/testing`, but Node resolved it without the `development` condition. Without that condition Node loads jasno's production build, which reports no diagnostics, so there is nothing for `mountTest` to check: `@jasno/core/testing` throws on import, and no test in the file runs.

## Fix

- Run tests with `npm test`: the script that `npm create @jasno` writes passes `--conditions=development`.
- To run one file by hand, pass the same flags: `node --conditions=development --import @jasno/core/testing/happy-dom --test src/views/user.test.ts`.
- A tool that starts Node itself (an editor's test runner, a CI step that calls `node --test`): set `NODE_OPTIONS=--conditions=development` for it.

## Example

```json
// Wrong: plain node --test resolves jasno's production build
{ "scripts": { "test": "node --test \"src/**/*.test.ts\"" } }
```

```json
// Right: the script npm create @jasno writes
{ "scripts": { "test": "node --conditions=development --import @jasno/core/testing/happy-dom --test --test-isolation=none \"src/**/*.test.ts\"" } }
```

## Fixture

`test/spec/prod.test.ts` › TESTING_REQUIRES_DEV_BUILD: @jasno/core/testing through its default condition refuses to load
