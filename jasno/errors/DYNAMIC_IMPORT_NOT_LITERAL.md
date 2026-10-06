<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# DYNAMIC_IMPORT_NOT_LITERAL

**error**, reported by jasno dist: import(expr): the bundle holds only modules imported by string literals, so its target is not in dist/.

<!-- /generated:catalogue -->

Your code calls `import()` with a computed specifier. That is a variable, or a template literal with `${}`. `jasno dist` cannot tell which module it loads.

The bundle contains only modules imported by string literals. The target would not be in `dist/`, and the import would fail in the browser. So the build fails and writes nothing.

A literal import also lets the build check the path (`MODULE_NOT_FOUND`). It also gives the view its own chunk.
<!-- design.md: (c) dist, (e) dist 4 -->

## Fix

Write one `import()` with a string literal for each module. Then choose among them in code:

- A lookup table of loaders.
- One route per view (`view: () => import('./views/x.ts')`).

## Example

```ts no-check
// Wrong: jasno dist cannot see which modules this loads
const loadWrong = (name: string) => import(`./widgets/${name}.ts`);

// Right: one literal import per module
const widgets = {
  clock: () => import('./widgets/clock.ts'),
  weather: () => import('./widgets/weather.ts'),
};
const load = (name: keyof typeof widgets) => widgets[name]();
```

## Fixture

`test/cli/dist.test.ts` › DYNAMIC_IMPORT_NOT_LITERAL: import(variable) fails the build at the call, since its target cannot be in the bundle; nothing written
