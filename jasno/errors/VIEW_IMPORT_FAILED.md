<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# VIEW_IMPORT_FAILED

**warn**, runtime, dev builds (the reload happens in both builds): a view module failed to load.

- Message: `The module for "{route}" failed to load ({error}); reloading {url}.`
- Hint: Usually a deploy replaced the files: keep previous deploys (npm run dist -- --keep 2).

<!-- design.md: B17.17 -->
<!-- /generated:catalogue -->

During a navigation, the `import()` of the route's view module failed with a `TypeError`. The browser could not fetch that module or one it imports. Or its integrity check failed.

Almost always, the tab was opened before a deploy. The new deploy removed the hashed files that the old page still asks for.

The router then loads the target URL as a full page. This picks up the new deploy. If that URL fails again, the error view renders.

## Fix

- Deploy with `npm run dist -- --keep 2`. Then `dist/` keeps the hashed files of the previous two deploys next to the new ones. Open tabs go on loading their modules.
- `--keep` takes the previous files from the existing `dist/`. Build where the last `dist/` is. In CI, restore it from a cache first. Upload all of `dist/`.
- Under `jasno dev`, the dev server stopped. Or the view file, or a module it imports, was renamed or deleted while the tab was open. The browser's network panel shows the URL that failed.

The reload happens in every build. Only the dev build prints this warning.

## Example

```sh
# Wrong: each deploy replaces dist/, so tabs opened before it ask for files that are gone
npm run dist
# Right: keep the previous two deploys' hashed files in dist/ next to the new ones
npm run dist -- --keep 2
```

## Fixture

`test/router.test.ts` › B17.17 a view import TypeError reports VIEW_IMPORT_FAILED and reloads once; a second failure renders the error view
