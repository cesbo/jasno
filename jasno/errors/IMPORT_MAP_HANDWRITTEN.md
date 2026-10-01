<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# IMPORT_MAP_HANDWRITTEN

**error**, reported by jasno check, jasno dev, jasno dist: index.html contains a <script type="importmap">; dev refuses to inject a second map and serves an error page naming this code.

<!-- /generated:catalogue -->

`index.html` contains its own `<script type="importmap">`. `jasno dev` and `jasno dist` generate the import map (source files, packages, `#imports` keys, and in dist the hashed file names with their integrity) and put it at `<!--jasno:head-->`. With a handwritten map in the page, `jasno dev` injects nothing and serves an error page instead of the app, and `jasno check` and `jasno dist` fail.
<!-- design.md: (c) check/dev, (e) dev, (f) -->

## Fix

Delete the `<script type="importmap">` element and keep the `<!--jasno:head-->` slot in `<head>`. Move what the map did to package.json:

- Packages: list them in `dependencies` and import them by name (`import { z } from 'zod'`); jasno maps them.
- Aliases: package.json `"imports"` keys starting with `#` (`"#config"`), with `development` and `default` conditions when dev and production differ.
- `@jasno/core` and `@jasno/core/router` are always mapped.

## Example

```html
<head>
  <meta charset="utf-8">
  <title>App</title>
  <!-- Wrong: a handwritten map where jasno's goes -->
  <script type="importmap">{ "imports": { "@jasno/core": "/node_modules/@jasno/core/dist/prod.js" } }</script>
</head>
```

```html
<head>
  <meta charset="utf-8">
  <title>App</title>
  <!-- Right: the slot jasno fills -->
  <!--jasno:head-->
</head>
```

## Fixture

`test/cli/dev.test.ts` › a handwritten import map: dev injects nothing and serves an error page naming IMPORT_MAP_HANDWRITTEN
