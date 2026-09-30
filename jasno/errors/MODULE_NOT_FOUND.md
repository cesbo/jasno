<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# MODULE_NOT_FOUND

**error**, reported by jasno check, jasno dev, jasno dist: the entry index.html imports names no file (check; a missing relative import inside src/ is tsc's TS2307 there); dev and dist: a relative or root-relative import in the module graph names no file (dev prints it when it builds the import map; dist fails), and dist also when index.html has no inline module script; a .js specifier whose .ts exists is TS_EXTENSION instead.

<!-- /generated:catalogue -->

An import names a file that does not exist: a relative (`./x.ts`) or root-relative (`/src/x.ts`) import in the module graph, or the entry that the inline script in `index.html` imports. The browser would get a 404 for that module and fail to load everything that depends on it. `jasno dev` prints it when it builds the import map and `jasno dist` fails; `jasno check` reports it for the `index.html` entry, while a missing import inside `src/` shows there as TypeScript's TS2307.
<!-- design.md: (c) check/dev/dist, (e) dist 5 -->

## Fix

- Correct the path: the file name and its case, the directory, the number of `../`. Relative specifiers name the real file, extension included (`./user-card.ts`).
- If you renamed or moved the file, update every import of it.
- The entry: `index.html` needs `<script type="module">import '/src/main.ts';</script>` naming a file that exists. `jasno dist` also reports this code when that inline script is missing.
- `./x.js` when `x.ts` exists is `TS_EXTENSION` instead: write `./x.ts`.

## Example

```html
<body>
  <div id="app"></div>
  <!-- Wrong: there is no src/app/main.ts -->
  <script type="module">import '/src/app/main.ts';</script>
</body>
```

```html
<body>
  <div id="app"></div>
  <!-- Right -->
  <script type="module">import '/src/main.ts';</script>
</body>
```

```ts no-check
// Wrong in src/views/user.ts: components/ is next to views/, one level up
import { UserCard } from './components/user-card.ts';
// Right
import { UserCard } from '../components/user-card.ts';
```

## Fixture

`test/cli/spec/dist.test.ts` › MODULE_NOT_FOUND for a missing relative or root-relative import (file:line:col), TS_EXTENSION for .js with a .ts sibling; nothing written
