<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NO_DECORATORS

**error**, reported by jasno check: syntax that passes tsc and the stripper, then fails in V8 (§6).

<!-- /generated:catalogue -->

A class or class member has a decorator (`@name`). TypeScript accepts decorators and jasno's type stripper passes them through, but no JavaScript engine ships them yet, so the browser throws a SyntaxError when it parses the module: that module and every module importing it fail to load. `jasno check` also reports `SYNTAX_REJECTED` for the same file; this code names the cause.
<!-- design.md: (c) jasno check table; (e) jasno check 4, 5; (h) non-goals -->

## Fix

- Replace the decorator with a plain function call that wraps the method or value.
- Components are functions in jasno, `component(function Name(p: Props): Node { ... })`, never decorated classes (`@Component`, `@customElement` and `@property` come from other frameworks).
- A reactive field is a signal (`const count = signal(0)`), not a decorated property.

## Example

```ts no-check
declare function logged(method: Function, context: ClassMethodDecoratorContext): void;
const items: string[] = [];

// Wrong: V8 cannot parse @logged, so this module and every module importing it fail to load
export class Cart {
  @logged
  add(id: string): void { items.push(id); }
}
```

```ts
// Right: wrap the function instead
function logged<A extends unknown[], R>(name: string, fn: (...args: A) => R): (...args: A) => R {
  return (...args) => { console.debug(name, ...args); return fn(...args); };
}

const items: string[] = [];
export const add = logged('add', (id: string): void => { items.push(id); });
```

## Fixture

`test/cli/check.test.ts` › NO_TS_CLASS_MODIFIER, NO_DECORATORS, NO_ACCESSOR, NO_USING
