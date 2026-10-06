<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# ASSET_OUTSIDE_ASSETS

**error**, reported by jasno check, jasno dev: new URL('<relative path>', import.meta.url) in a browser file resolves to a file under src/, or jasno dev gets a request for a non-module file under /src/: jasno dist publishes modules there only under hashed names and other files not at all, so the URL 404s in production (put the file in assets/ and use '/assets/<name>').

<!-- /generated:catalogue -->

Code refers to a file under `src/` that is not a module. `jasno check` reports `new URL('./logo.png', import.meta.url)` in a browser file. `jasno dev` reports a request for such a file.

`jasno dist` publishes only the `.ts` modules under `src/` and the JSON modules they import. It publishes them under hashed names. It publishes no other file from `src/`. The URL therefore 404s in production.
<!-- design.md: (c) check/dev, (e) dev and dist 2, (f) -->

## Fix

- Move the file to `assets/`. Refer to it by its root path, `'/assets/logo.png'`. `jasno dist` copies `assets/` unhashed and never rewrites code. The path stays valid.
- Put files that must sit at the site root (`robots.txt`, `favicon.ico`) in `public/`.
- For data the code needs, use a JSON module instead: `import data from './data.json' with { type: 'json' };`.
- If `jasno dev` reports a `.js`, `.mjs`, `.mts` or `.tsx` file under `src/`, rename it. jasno modules are `.ts` files.

## Example

```ts
import { component, h } from '@jasno/core';

// Wrong: src/logo.png is not published, so the image 404s in production
export const LogoWrong = component(function LogoWrong(): Node {
  return h.img({ src: new URL('./logo.png', import.meta.url).href, alt: 'Acme' });
});

// Right: the file lives at assets/logo.png
export const Logo = component(function Logo(): Node {
  return h.img({ src: '/assets/logo.png', alt: 'Acme' });
});
```

## Fixture

`test/cli/check.test.ts` › browser sinks: NO_HTML_SINK, USE_ROUTER (error and warn), WORKER_UNSUPPORTED, ASSET_OUTSIDE_ASSETS
