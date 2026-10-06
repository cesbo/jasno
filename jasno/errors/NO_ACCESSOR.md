<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NO_ACCESSOR

**error**, reported by jasno check: syntax that passes tsc and the stripper, then fails in V8.

<!-- /generated:catalogue -->

A class field is declared with `accessor` (`accessor count = 0`). TypeScript accepts these auto-accessors. jasno's type stripper passes them through. V8 cannot parse them.

The browser throws a SyntaxError when it loads the module. Every module that imports it fails too.

`jasno check` also reports `SYNTAX_REJECTED` on the same line. This code names the cause.
<!-- design.md: (c) jasno check table; (e) jasno check 4, 5 -->

## Fix

- Write a `#private` field with a getter and a setter.
- If the field exists only to make the value reactive, keep the state in a signal instead: `const count = signal(0)`.

## Example

```ts
// Wrong: V8 cannot parse `accessor`
export class CounterWrong {
  accessor count = 0;
}

// Right: a #private field with a getter and a setter
export class Counter {
  #count = 0;
  get count(): number { return this.#count; }
  set count(value: number) { this.#count = value; }
}
```

## Fixture

`test/cli/check.test.ts` › NO_TS_CLASS_MODIFIER, NO_DECORATORS, NO_ACCESSOR, NO_USING
