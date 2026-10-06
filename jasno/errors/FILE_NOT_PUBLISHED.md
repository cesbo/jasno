<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# FILE_NOT_PUBLISHED

**error**, reported by jasno check, jasno dist: browser code imports a module jasno dist does not publish (outside src/, or a *.test.ts file; check reports it at the import); dist also when src/, assets/ or public/ contains a symlink, or a public/ file takes a name dist generates.

<!-- /generated:catalogue -->

One of two things is wrong:

- Browser code imports a module that `jasno dist` does not publish. This is a file outside `src/`, or a `*.test.ts` file.
- A published directory holds something dist cannot publish as it is. This is a symlink, or a `public/` file that takes a name dist generates.

In production, the import fails, the linked file is missing, or the `public/` file would replace what dist writes.

`jasno check` reports the import cases at the import. `jasno dist` reports all of them and writes nothing.
<!-- design.md: (c) check/dist, (e) dist 1 and 2 -->

## Fix

- A module outside `src/` (`../lib/format.ts`, a shared folder): move it under `src/` (`src/lib/format.ts`) and import it from there. Tests and scripts can import it from `src/` too.
- A test file: move what browser code uses into a normal module. Test-only helpers stay in `*.test.ts` files that only tests import.
- A symlink in `src/`, `assets/` or `public/`: copy the file into the directory instead of linking it.
- A `public/` name clash: jasno generates `index.html`, `404.html`, `_headers`, `_redirects`, `src`, `_deps`, `@jasno/core` and `assets` at the site root. Put static files that code refers to in `assets/`, not `public/assets/`. The page is the root `index.html`.

## Example

```text
my-app/
  lib/format.ts          Wrong: outside src/, never published
  src/
    lib/format.ts        Right: import './lib/format.ts' from src/main.ts
    views/user.ts        must not import user.test.ts
    views/user.test.ts
  public/
    _redirects           Wrong: jasno dist generates /_redirects
    robots.txt           fine: published as /robots.txt
```

## Fixture

`test/cli/audit.test.ts` › CL-20: jasno dist reports FILE_NOT_PUBLISHED for a module outside src/, an imported test file, a symlink and a public/ name clash
