<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# NO_TS_CLASS_MODIFIER

**error**, reported by jasno check: private/protected/public/readonly/abstract/override/declare members; use #private.

<!-- /generated:catalogue -->

A class member carries a TypeScript-only modifier: `private`, `protected`, `public`, `readonly`, `abstract`, `override` or `declare`. Type stripping deletes the word, so at run time a `private` or `readonly` field is an ordinary public, writable property: tsc checks the modifier, but nothing enforces it in the browser, and jasno's syntax subset leaves these modifiers out.
<!-- design.md: (c) jasno check table; (e) jasno check 5 -->

## Fix

- `private` or `protected` field or method: make it `#private` (`#count`, `#save()`); the engine enforces it.
- `readonly` field: a `#private` field plus a getter.
- `public` and `override`: delete the word.
- `abstract` member: give the base class a real method (one that throws, if subclasses must replace it), or describe the shape with an interface. An `abstract class` without abstract members is fine.
- `declare` field: delete the line (it only re-types an inherited field) and narrow the type where the value is used.

`readonly` in interfaces and type literals is fine: the rule looks at class members only. The rule runs in tests too.

## Example

```ts
// Wrong: after type stripping, started and label are public, writable fields
export class TimerWrong {
  private started = Date.now();
  readonly label: string;
  constructor(label: string) { this.label = label; }
  elapsed(): number { return Date.now() - this.started; }
}

// Right: the engine enforces #private fields; a getter exposes a read-only value
export class Timer {
  #started = Date.now();
  #label: string;
  constructor(label: string) { this.#label = label; }
  get label(): string { return this.#label; }
  elapsed(): number { return Date.now() - this.#started; }
}
```

## Fixture

`test/cli/check.test.ts` › NO_TS_CLASS_MODIFIER, NO_DECORATORS, NO_ACCESSOR, NO_USING
