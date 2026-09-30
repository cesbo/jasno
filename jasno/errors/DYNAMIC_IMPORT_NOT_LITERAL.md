<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# DYNAMIC_IMPORT_NOT_LITERAL

**warn**, reported by jasno dist: import(expr): closure unknown, not budgeted.

<!-- /generated:catalogue -->

`import()` is called with a computed specifier (a variable, or a template literal with `${}`), so `jasno dist` cannot tell which module it loads. That module's closure is not budgeted and not listed with the lazy targets in `dist/.jasno/manifest.json`, and a wrong name surfaces only when the import runs in the browser, where a literal one fails the build with `MODULE_NOT_FOUND`. It is a warning; the build succeeds.
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

`test/cli/spec/dist.test.ts` › DYNAMIC_IMPORT_NOT_LITERAL: import(variable) warns at the call, the build succeeds
