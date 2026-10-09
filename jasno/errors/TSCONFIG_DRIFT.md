<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# TSCONFIG_DRIFT

**error / warn**, reported by jasno check: a required compiler option missing or changed in either config, esnext.disposable in lib, test files included in the browser program, types other than [] there, test or e2e files with no tsconfig.test.json (a project without them needs none), or package.json without "type": "module" (error); a tsconfig.test.json that matches no file, in place of tsc's TS18003 (warn: the project has no tests yet).

<!-- /generated:catalogue -->

One of the project's TypeScript configs differs from what jasno requires. Type checking would then not match how jasno runs the code.

The browser program and the test program must use the same strict, erasable-syntax settings. Only the test program may see Node's types.

The message names each option and the value jasno expects.

## Fix

Set each option the message names, or copy the configs that `npm create @jasno` writes:

```json
// tsconfig.json: the browser program (src without tests).
{
  "compilerOptions": {
    "target": "es2025", "module": "nodenext", "moduleResolution": "nodenext",
    "lib": ["es2025", "dom"], "types": [],
    "strict": true, "noEmit": true,
    "allowImportingTsExtensions": true, "erasableSyntaxOnly": true, "verbatimModuleSyntax": true,
    "exactOptionalPropertyTypes": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

```json
// tsconfig.test.json: tests, e2e specs and the Playwright config, with Node's types.
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src/**/*.test.ts", "e2e", "playwright.config.ts"],
  "exclude": []
}
```

- Keep `*.test.ts` out of the browser program. Keep `"types"` empty there. Then browser code cannot use Node APIs.
- Create `tsconfig.test.json` as soon as there is a test, an e2e spec or a Playwright config.
- With no tests yet, add one (`src/**/*.test.ts`) or delete `tsconfig.test.json` until there is one. A test config that matches no file is a warning.
- Leave `esnext.disposable` out of `lib`. `using` is not part of jasno's syntax.
- Set `"type": "module"` in `package.json`.

## Example

```json
// Wrong: the browser program sees Node's types and includes the tests.
{ "compilerOptions": { "types": ["node"] }, "include": ["src"] }
```

The right configs are the two above.

## Fixture

`test/cli/check.test.ts` › TSCONFIG_DRIFT: options, lib, types, test files in the browser program, a missing test program, no "type": "module"
`test/cli/check.test.ts` › TSCONFIG_DRIFT warns, in place of TS18003, when tsconfig.test.json matches no file
