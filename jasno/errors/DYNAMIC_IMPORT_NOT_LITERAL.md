<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# DYNAMIC_IMPORT_NOT_LITERAL

**error**, reported by jasno dist: import(expr): the bundle holds only modules imported by string literals, so its target is not in dist/.

<!-- /generated:catalogue -->

`import()` is called with a computed specifier (a variable, or a template literal with `${}`), so `jasno dist` cannot tell which module it loads. The bundle contains only modules imported by string literals, so the target would not be in `dist/` and the import would fail in the browser: the build fails and nothing is written. A literal import also lets the build check the path (`MODULE_NOT_FOUND`) and give the view its own chunk.
<!-- design.md: (c) dist, (e) dist 4 -->

## Fix

Write one `import()` with a string literal per module and choose among them in code: a lookup table of loaders, or one route per view (`view: () => import('./views/x.ts')`).

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
