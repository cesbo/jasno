<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# SECRET_FILE_IN_OUTPUT

**error**, reported by jasno dist: an allowlisted directory (src/, assets/, public/) contains .env*, *.pem, *.key or a dotfile.

<!-- /generated:catalogue -->

A directory that `jasno dist` publishes (`src/`, `assets/` or `public/`) contains a dotfile or dot-directory (`.env`, `.env.local`, `.cache/`), a `*.pem` or a `*.key` file. Such files usually hold secrets or tool state, and everything in those directories is public, so the build fails and nothing is written.
<!-- design.md: (c) dist, (e) dist 1, ADR-29 -->

## Fix

- Move the file out of `src/`, `assets/` and `public/`: `.env` belongs at the project root, next to `package.json`, and in `.gitignore`.
- A value browser code reads is not a secret: the browser can download every file under `src/`. Keep secrets on the server; public settings go in `src/config.dev.ts` and `src/config.prod.ts` behind the `#config` import.
- A tool that writes a dot-directory under `src/` (a cache): configure it to write elsewhere, or delete the directory.
- Once the build passes, `npm run dist -- --list` prints every file that ships.

## Example

```text
my-app/
  .env               secrets stay here: not published (and listed in .gitignore)
  package.json
  src/
    .env             Wrong: SECRET_FILE_IN_OUTPUT
    config.prod.ts   public settings only, behind "#config"
  assets/
    server.key       Wrong: SECRET_FILE_IN_OUTPUT
```

## Fixture

`test/cli/dist.test.ts` › SECRET_FILE_IN_OUTPUT: a dotfile, .env, *.pem or *.key in src/ or assets/ fails the build and nothing is written
