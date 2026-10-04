<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# TAILWIND_FAILED

**error**, reported by jasno dev, jasno dist: a stylesheet under assets/ imports tailwindcss (@import "tailwindcss") and the project's @tailwindcss/cli is not installed (hint: npm install -D @tailwindcss/cli) or exits non-zero on it (its stderr is in the message); dev answers the request with 500, dist writes nothing.

<!-- design.md: ADR-37 -->
<!-- /generated:catalogue -->

A stylesheet under `assets/` imports tailwindcss (`@import "tailwindcss"`), so `jasno dev` and `jasno dist` compile it with the project's `@tailwindcss/cli` (ADR-37), and that failed: the package is not installed, or the CLI exited non-zero on the sheet (an unknown utility in `@apply`, a syntax error, a missing `@source` path). `jasno dev` answers the request with a 500 and prints the problem; `jasno dist` writes nothing.
<!-- design.md: (c) dev/dist, (e) dev and dist 2, ADR-37 -->

## Fix

- Not installed: `npm install -D @tailwindcss/cli`. The stylesheet needs nothing else; jasno finds the CLI through the package's `bin` and runs it from the project root, so Tailwind scans `src/` and `index.html` for classes.
- The CLI failed: the message carries its output. Fix the sheet it names; `npx tailwindcss -i assets/app.css` from the project root reproduces it with the full report.
- A stylesheet that should ship as it is: drop the `@import "tailwindcss"` line; jasno copies every other `.css` under `assets/` unchanged.

## Example

```css
/* assets/app.css: compiled by the project's @tailwindcss/cli in dev and dist; link it from index.html */
@import "tailwindcss";

/* Wrong: no such utility, so the CLI exits 1 and TAILWIND_FAILED names this file */
.card { @apply rounded-md shadow-sm nope; }
```

## Fixture

`test/cli/dist.test.ts` › TAILWIND_FAILED: the CLI exits non-zero (its stderr in the message) or is not installed (install hint); nothing written
`test/cli/dev.test.ts` › a stylesheet in assets/ that imports tailwindcss is served compiled by the project's @tailwindcss/cli; a failing compile is TAILWIND_FAILED (a 500 and the terminal)
