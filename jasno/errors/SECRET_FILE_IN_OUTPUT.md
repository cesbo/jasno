<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# SECRET_FILE_IN_OUTPUT

**error**, reported by jasno dist: an allowlisted directory (src/, assets/, public/) contains .env*, *.pem or *.key, or src/ or assets/ contains a dotfile (public/ dotfiles such as .well-known/ are published).

<!-- /generated:catalogue -->

A directory that `jasno dist` publishes contains a secret-like file. The directories are `src/`, `assets/` and `public/`. The files are `.env*`, `*.pem` and `*.key`.

The build also fails when `src/` or `assets/` contains a dotfile or dot-directory, such as `.cache/`.

Such files usually hold secrets or tool state. Everything in those directories is public. So the build fails and nothing is written.

`public/` is copied as is. Its other dotfiles are published. For example, `public/.well-known/security.txt` is served at `/.well-known/security.txt`.
<!-- design.md: (c) dist, (e) dist 1, ADR-29 -->

## Fix

- Move the file out of `src/`, `assets/` and `public/`. `.env` belongs at the project root, next to `package.json`, and in `.gitignore`.
- A value that browser code reads is not a secret. The browser can download every file under `src/`. Keep secrets on the server. Put public settings in `src/config.dev.ts` and `src/config.prod.ts`, behind the `#config` import.
- A tool that writes a dot-directory under `src/` or `assets/` (a cache): configure it to write elsewhere, or delete the directory.
- A dotfile the site must serve (`.well-known/`): put it in `public/`.
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
  public/
    .well-known/
      security.txt   Right: published at /.well-known/security.txt
    .env.production  Wrong: SECRET_FILE_IN_OUTPUT
```

## Fixture

`test/cli/dist.test.ts` › SECRET_FILE_IN_OUTPUT: a dotfile, .env, *.pem or *.key in src/ or assets/ fails the build and nothing is written
