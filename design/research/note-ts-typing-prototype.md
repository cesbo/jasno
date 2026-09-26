I built a small prototype and checked every claim below with a real compiler. All files are under `/tmp/claude-1000/-home-and-ff/96b9f726-1e37-4313-9d48-852096c2ca84/scratchpad/`:
- `tsproto/`: `src/{signal,dom,component,router,context,store}.ts`, `test/dom.test.ts`, `support/happydom.ts`, and one file per mistake category in `mistakes/m1..m12`
- `ts6/gen.cjs`: the codegen experiment, which writes into `gen/`

Test machine: Linux, 2 vCPU, Node v25.1.0.

## 0. Toolchain status (checked 2026-09-25)

**`npm i typescript@latest` now installs TypeScript 7.0.2**, the native Go port.
- It went GA on 2026-07-08.
- Dist-tags: `latest` is 7.0.2, `next` is 7.1.0-dev, and the 6.x line ends at 6.0.3.

**New defaults in TS 7** (from the release announcement):
- `strict` is true.
- `module` is esnext.
- `target` is the current stable ES.
- `noUncheckedSideEffectImports` is on.
- `types` defaults to `[]`, so you must list `"types": ["node"]` yourself to use node:test.

**Other TS 7 changes that matter here:**
- `moduleResolution node10`, `baseUrl` and `target es5` are now hard errors.
- There is no programmatic API until 7.1. Until then, typescript-eslint and any codegen built on the compiler API need TS 6 or `@typescript/typescript6`.
- JSDoc handling was reworked.

**Error messages:** every error I tried printed the same text in TS 6.0.3 and 7.0.2. Only speed differs.

**tsconfig I used:**
- `target: esnext`
- `module` and `moduleResolution`: `nodenext`
- `lib: [esnext, dom, dom.iterable]`
- `types: [node]`
- `strict`, `noEmit`, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `skipLibCheck`
- `package.json` has `"type": "module"`

## 1. Typed element factories

### Working design (src/dom.ts)

```ts
export type Reactive<T> = [T] extends [(...args: never[]) => unknown]
  ? { 'Reactive<T> cannot wrap a function type': T }   // the error type carries the message
  : T | Accessor<T>;

type IfEquals<X, Y, A, B> = (<G>() => G extends X ? 1 : 2) extends (<G>() => G extends Y ? 1 : 2) ? A : B;
type WritableDataKeys<E> = Extract<keyof {
  [K in keyof E as
    string extends K ? never : number extends K ? never                    // drop index signatures
    : NonNullable<E[K]> extends (...a: never[]) => unknown ? never          // methods and onxxx
    : IfEquals<{ [Q in K]: E[K] }, { -readonly [Q in K]: E[K] }, K, never>  // drop readonly props
  ]: 0 }, string>;

type EventMapFor<E> = E extends HTMLMediaElement ? HTMLMediaElementEventMap
  : E extends HTMLBodyElement ? HTMLBodyElementEventMap : HTMLElementEventMap;
export type EventProps<E> = { [K in keyof EventMapFor<E> & string as `on${K}`]?:
  (event: EventMapFor<E>[K] & { currentTarget: E }) => void };

export type Props<E extends HTMLElement> =
  & { [K in Exclude<WritableDataKeys<E>, Omitted>]?: Reactive<E[K]> }
  & EventProps<E>
  & { class?: Reactive<string | Record<string, Reactive<boolean>>>; style?: StyleProps;
      ref?: (el: E) => void;
      [attr: `data-${string}`]: Reactive<string | number | boolean> | undefined;
      [attr: `aria-${string}`]: Reactive<string | number | boolean> | undefined };

export type Child = Node | string | number | bigint | boolean | null | undefined
  | (() => Child) | readonly Child[];

export const h = create as <K extends Tag>(tag: K, props?: Props<HTMLElementTagNameMap[K]> | null,
  ...children: Child[]) => HTMLElementTagNameMap[K];
export const tags = new Proxy({}, { get: (_, t: string) => (p?: object | null, ...c: Child[]) =>
  create(t, p, ...c) }) as unknown as { [K in Tag]: TagFn<K> };
```

The usage below type-checks, and the return types flow through (`button(null, 'x')` is `HTMLButtonElement`):

```ts
const { div, button, input, video } = tags;
div({ class: { active: () => count() > 0 } }, button({ onclick: e => { e.currentTarget.disabled = true } }, 'inc'),
  input({ value: name, oninput: e => name.set(e.currentTarget.value) }),
  video({ onvolumechange: e => e.currentTarget.volume }), 'Count: ', count);
```

### Gotchas, all confirmed with the compiler

1. **Calling the generic signature with the full tag union is very expensive.** If `h` is called internally with `K = keyof HTMLElementTagNameMap` (my first proxy did `h(tag as Tag, ...)`), tsc computes `Props` for about 140 elements.
   - Before: 662k instantiations and about 2.1s of check time for dom.ts alone.
   - After I made `h` and `tags` typed facades over one untyped `create(tag: string, props?: object|null, ...)`: 15k instantiations and 0.2s.
   - `{} as Tags` does not cause this cost.
2. **Filter keys with `as` remapping, not a plain `keyof E`.** `HTMLFormElement` has `[name: string]: any`. Plain `keyof E` collapses to `string | number` and every named prop disappears: tsc reported `'id' does not exist in type 'Props<HTMLFormElement>'`. `as` remapping iterates the real properties.
3. **Do not test `K extends string ? ...` before the readonly check.** Inside that branch K becomes `K & string`, the probe `{[Q in K]: E[K]}` is no longer homomorphic, the readonly modifier is lost, and every key looks writable. With that bug, `div({ tagName: 'span' })` and `ATTRIBUTE_NODE` were accepted silently. The fix is to use `string extends K` checks inside the `as` clause, then `Extract<..., string>`.
4. **`Child` must not use a generic alias.** `Accessor<Child>` inside the recursive alias gives TS2456 "Type alias 'Child' circularly references itself". Writing `(() => Child)` inline works.
5. **In TS 7's lib.dom, click events are typed as `PointerEvent`.** You can see it in the error output below.

### T vs () => T ambiguity: how to resolve it

At runtime, a function-valued prop is treated as an accessor. There is no compiler to tell the cases apart, so the rules are:
- **(a) `on*` and `ref` keys are never reactive.** On DOM elements the only function-valued props are handlers and refs, so this rule is complete for elements.
- **(b) `Reactive<F>` for a function type F becomes a named error type.** For example: `Type '(n: any) => string' is not assignable to type '{ 'Reactive<T> cannot wrap a function type': (n: number) => string; }'`.
- **(c) Component callback and render props are typed as plain functions, never Reactive.** Only the component reads its props, so there is no runtime ambiguity.
- **(d) Signal setters are split into `set(v: T)` and `update(fn)`.** An overloaded `set(v | fn)` would reintroduce the ambiguity for signals that hold functions.

Remaining hole: passing a signal that holds a handler, `button({ onclick: handlerSignal })`, compiles. A function returning a function is assignable to `(e) => void`. Only a dev-mode runtime check can catch this (signals carry a brand symbol).

**Alternative I also tested (m10, m11): only branded signals count as reactive.**
- Plain functions are always values, so function-typed props can be reactive too.
- Cost: inline arrows are rejected, and derived values need `computed(...)`.
- If the brand symbol is named to describe the fix, the error explains itself: `Property '[createWith_signal_or_computed]' is missing in type '() => string' but required in type 'Sig<string>'.`

### API-shape comparison (m7): the props slot must be required

| Signature | Output for `{ clas: 'x' }` |
|---|---|
| **Required props slot** (`div(null, 'text')`) | `error TS2561: Object literal may only specify known properties, but 'clas' does not exist in type 'Props<HTMLDivElement>'. Did you mean to write 'class'?` |
| **Union first parameter** (props-or-child) | `error TS2353: ... 'clas' does not exist in type 'Node \| readonly Child[] \| (() => Child) \| Props<HTMLDivElement>'.` The suggestion is gone. |
| **Overloads** | `error TS2769: No overload matches this call. The last overload gave the following error. Object literal may only specify known properties, and 'class' does not exist in type 'Node \| readonly Child[] \| (() => Child)'.` This blames the wrong overload, even for the correct key `class`. |

`h('div', {...})` and `div({...})` give identical messages, because K is inferred from the literal.

The same effect hits style objects (m9, dbg4): **any union that combines a function type with an object type removes tsc's "Did you mean" suggestion** for excess keys.
- `style?: Reactive<StyleObj>` gives `'colr' does not exist in type 'Accessor<...> | Partial<Record<CssProp, ...>>'` with no suggestion.
- `style?: StyleProps` (an object with reactive leaf values) gives `'colr' does not exist in type 'StyleMap'. Did you mean to write 'color'?`
- Custom properties are allowed through `[custom: `--${string}`]`.
- Kebab-case names like `'background-color'` are rejected with no suggestion.

### Literal tsc output for DOM mistakes (m1)

```
m1-dom.ts(8,7): error TS2561: Object literal may only specify known properties, but 'clas' does not exist in type 'Props<HTMLDivElement>'. Did you mean to write 'class'?
m1-dom.ts(10,7): error TS2353: Object literal may only specify known properties, and 'className' does not exist in type 'Props<HTMLDivElement>'.
m1-dom.ts(11,10): error TS2561: ... but 'onClick' does not exist in type 'Props<HTMLButtonElement>'. Did you mean to write 'onclick'?
m1-dom.ts(12,9): error TS2561: ... but 'onChange' does not exist in type 'Props<HTMLInputElement>'. Did you mean to write 'onchange'?
m1-dom.ts(14,10): error TS2322: Type '(e: KeyboardEvent) => void' is not assignable to type '(event: PointerEvent & { currentTarget: HTMLButtonElement; }) => void'.
  Types of parameters 'e' and 'event' are incompatible.
    Type 'PointerEvent & { currentTarget: HTMLButtonElement; }' is missing the following properties from type 'KeyboardEvent': charCode, code, isComposing, key, and 8 more.
m1-dom.ts(16,42): error TS2339: Property 'checked' does not exist on type 'EventTarget & HTMLButtonElement'.
m1-dom.ts(18,9): error TS2322: Type 'string' is not assignable to type 'boolean | Accessor<boolean> | undefined'.
m1-dom.ts(19,9): error TS2322: Type 'Signal<number>' is not assignable to type 'string | Accessor<string> | undefined'.
  Type 'Signal<number>' is not assignable to type 'Accessor<string>'.
    Type 'number' is not assignable to type 'string'.
m1-dom.ts(21,7): error TS2353: Object literal may only specify known properties, and 'tagName' does not exist in type 'Props<HTMLDivElement>'.
```

Notes on this output:
- `className` gets no suggestion because it is too far from `class`. A key typed as a message (`className?: { "use 'class'": never }`) would carry the fix.
- An unknown handler key also produces a knock-on `TS7006 Parameter 'e' implicitly has an 'any' type`.

## 2. Components and children (src/component.ts, m2, m8)

A component is a plain function called directly: `Card({ title: 'Hi', children: 'body' })`. `component(fn)` adds `untrack` and a debug name. Its type is the identity, `<P>(fn: (props: P) => Node) => (props: P) => Node`, so hovers show the user's own interface. Higher-order inference keeps generics: in `component(List)`, `render` is inferred from `items`, which gave `Property 'toFixed' does not exist on type 'string'` for the wrong usage.

Literal output:

```
m2(7,6): error TS2741: Property 'title' is missing in type '{ subtitle: string; }' but required in type 'CardProps'.
m2(9,20): error TS2561: ... but 'subtitel' does not exist in type 'CardProps'. Did you mean to write 'subtitle'?
m2(11,8): error TS2322: Type 'Signal<{ id: number; name: string; }[]>' is not assignable to type 'string | Accessor<string>'.
m2(13,63): error TS2551: Property 'nme' does not exist on type '{ id: number; name: string; }'. Did you mean 'name'?
m8(9,7): error TS2353: ... 'children' does not exist in type 'Props<HTMLDivElement>'.
m8(11,34): error TS2740: Type 'HTMLDivElement[]' is missing the following properties from type 'Node': baseURI, childNodes, firstChild, isConnected, and 46 more.
m8(12,40): error TS2740: Type 'Promise<HTMLDivElement>' is missing the following properties from type 'Node': ...
m8(14,11): error TS2345: Argument of type '(props: CardProps) => Node' is not assignable to parameter of type 'Child'.
  Type '(props: CardProps) => Node' is not assignable to type '() => Child'.
    Target signature provides too few arguments. Expected 1 or more, but got 0.
```

**Not caught by types:** `Card({ title: title() })`, or `div(null, `n=${n()}`)`. This passes a snapshot instead of an accessor. It compiles and silently loses reactivity. This is the biggest gap that types cannot close.

**exactOptionalPropertyTypes (m12).** Agents often write `subtitle: cond ? 'y' : undefined`. Under this flag that fails with TS2379. On element Props the message expands to `{ accept?: ...; ... 115 more ...; }`. Framework .d.ts files must declare optional props as `?: X | undefined`.

## 3. Forgetting to call an accessor (m3, m4)

```
m3(10,14): error TS2365: Operator '+' cannot be applied to types 'Signal<number>' and 'number'.
m3(11,13): error TS2365: Operator '>' cannot be applied to types 'Signal<number>' and 'number'.
m3(13,5): error TS2774: This condition will always return true since this function is always defined. Did you mean to call it instead?
m3(14,15): error TS2774: (same, for isOpen ? a : b)
m3(16,7): error TS2339: Property 'map' does not exist on type 'Signal<string[]>'.
m3(19,13): error TS2345: Argument of type 'Signal<number>' is not assignable to parameter of type 'number'.
m3(21,11): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.   // count.set('1')
m3(22,7): error TS2554: Expected 0 arguments, but got 1.                                             // count(5)
m3(23,7): error TS2339: Property 'value' does not exist on type 'Signal<number>'.                    // Vue/Preact habit
m3(26,12): error TS2367: This comparison appears to be unintentional because the types 'Signal<number>' and 'number' have no overlap.
```

Function accessors get TS2774, which is special-cased for functions in conditions. An object signal (`.value`) would not get it.

### Two holes with function-shaped signals

**1. Members inherited from `Function.prototype`.** `items.length` compiles as a number (the arity, 0), and `user.name` compiles as a string (`"read"`). Both passed tsc with exit 0.

Fix: return a guarded interface from `signal()` and `computed()`:

```ts
declare const misuse: unique symbol;
type CallMeFirst = { readonly [misuse]: 'This is a signal/accessor. Call it first: x().length, x().name' };
export type Accessor<T> = () => T;                       // input type: inline arrows are fine
export interface ReadSignal<T> { (): T; readonly length: CallMeFirst; readonly name: CallMeFirst }
export interface Signal<T> extends ReadSignal<T> { set(v: T): void; update(fn: (p: T) => T): void }
```

It now reports:

```
m4(5,7): error TS2322: Type 'CallMeFirst' is not assignable to type 'number'.
m4(7,5): error TS2365: Operator '>' cannot be applied to types 'CallMeFirst' and 'number'.
```

The guard cannot go on the input type `Accessor`. When I tried that, every inline arrow was rejected with `Types of property 'length' are incompatible. Type 'number' is not assignable to type 'CallMeFirst'`. So there must be two types: `Accessor` for inputs and `ReadSignal` for outputs.

**2. Template literals.** `${count}` is not caught by tsc. I added a dev-mode trap, `Symbol.toPrimitive` throws `TypeError('Signal used as a primitive: call it...')`, and a test confirms it.

## 4. Typed router params (src/router.ts, m5)

```ts
type Segment<S extends string> =
  S extends `:${infer N}?` ? { [K in N]?: string } : S extends `:${infer N}` ? { [K in N]: string } :
  S extends `*${infer N}` ? { [K in N extends '' ? 'rest' : N]: string } : {};
type Split<P extends string> = P extends `${infer H}/${infer T}` ? Segment<H> & Split<T> : Segment<P>;
export type Params<P extends string> = Simplify<Split<P>>;
```

Type-level tests pass for four shapes:
- `/users/:id/posts/:postId` gives `{id; postId}`
- `/about` gives `{}`
- `:q?` gives an optional key
- `*path` gives `{path}`

A runtime `match()` and `href()` use the same grammar, and they are tested in happy-dom.

**href arguments:** params are required only when the path has required params:

```ts
type HrefArgs<P extends string> = keyof Params<P> extends never ? [] : {} extends Params<P> ? [params?: Params<P>] : [params: Params<P>];
```

The `[]` case is needed because an object literal passed where `{}` is expected gets no excess-property check. Without it, `href('/about', { id: '1' })` compiled.

**Gotcha: a table-bound `navigate`/`href` typed as `<P extends Path>(path: P, ...rest: HrefArgs<P>)`.** A typo in the path makes inference fall back to the constraint, and tsc blames the params:

```
m5(19,40): error TS2554: Expected 1 arguments, but got 2.
```

Typing the parameter as `path: P extends Path ? P : Path` fixes it:

```
m5(19,13): error TS2345: Argument of type '"/user/:id/posts/:postId"' is not assignable to parameter of type '"/about" | "/users/:id/posts/:postId"'.
m5(5,34): error TS2741: Property 'postId' is missing in type '{ id: string; }' but required in type '{ id: string; postId: string; }'.
m5(3,54): error TS2339: Property 'userId' does not exist on type '{ id: string; }'.
```

Other variants I measured:
- `NoInfer` has the same bad blame.
- `P & Path` produces `...not assignable to parameter of type 'never'`.
- A union of tuples is precise but very verbose.

## 5. Typed context/DI (src/context.ts, m6)

`createContext<T>(name, ...fallback: [] | [T])` returns `Context<T>`, which carries T through a phantom symbol property. `use(ctx)` returns T. With no provider and no fallback, it throws an error that includes the fix: `No provider for context "Api". Wrap the subtree in provide(ApiContext, value, () => ...)`.

**Gotcha:** `provide<T>(ctx: Context<T>, value: T, fn)` accepted `{ mode: 'dim' }` for a `'light' | 'dark'` context. T was inferred from both arguments and simply widened. With `value: NoInfer<T>` (TS 5.4+):

```
m6(11,25): error TS2322: Type '"dim"' is not assignable to type '"dark" | "light"'.
```

## 6. Typed store (src/store.ts, m6)

The store exposes `DeepReadonly<T>` as its view, plus one mutation entry point, `update(fn: (draft: T) => void)`. That is an Immer-style mutable draft over a Proxy, with a signal per property.

I deliberately left out Solid-style path setters. They need many overloads, and overloads produce TS2769 "No overload matches this call" messages that blame the wrong overload, as the API-shape table in section 1 showed.

```
m6(4,13): error TS2540: Cannot assign to 'filter' because it is a read-only property.
m6(5,19): error TS2339: Property 'push' does not exist on type 'readonly { readonly id: number; readonly text: string; readonly done: boolean; }[]'.
m6(6,23): error TS2540: Cannot assign to 'done' because it is a read-only property.
m6(8,23): error TS2322: Type '"active"' is not assignable to type '"all" | "done"'.
m6(9,23): error TS2322: Type 'string' is not assignable to type 'boolean'.
```

At runtime, writes outside `update` throw `Store is read-only; mutate inside store.update(d => { d.title = ... })`. A test confirms it.

## 7. Compile times

The type-check time is part of every agent iteration, so it matters.

| Case | TS 7.0.2 | TS 6.0.3 |
|---|---|---|
| Whole prototype (535 lines src/test + @types/node, 217 files) | check 1.5–1.7s, total 2.3–2.5s, 206k instantiations | check 4.1s, total 7.9s, 141k instantiations |
| Same, `--incremental` no-op rebuild | 0.86s total (1.0s wall) | |
| 56-distinct-tag file, mapped-type Props with the readonly filter | 446k–630k instantiations, check 2.0–3.3s | check 6.7–6.9s |
| Same file, without the readonly (IfEquals) filter | 167k instantiations, check 0.74s | |
| Same file, generated flat interfaces (below) | 46k instantiations, check 0.51–0.59s | check 2.8–3.6s |

TS 7 reports more instantiations than TS 6. My unverified guess is that its parallel checkers keep separate caches.

**Codegen (ts6/gen.cjs, about 50 lines, using the TS 6 API).** It emits one named interface per element class:
- 65 interfaces for 112 tags, about 46KB in total.
- A shared `GlobalProps<E>` with the HTMLElement props and the `on*` handlers from HTMLElementEventMap.
- Media and body elements get their extra events.

Output looks like `interface HTMLButtonElementProps extends GlobalProps<HTMLButtonElement> { disabled?: Reactive<HTMLButtonElement['disabled']>; ... }` plus `interface TagProps { button: HTMLButtonElementProps; ... }`.

Error quality is the same or better, because messages name the interface:

```
mist.ts(4,12): error TS2561: ... but 'clas' does not exist in type 'HTMLDivElementProps'. Did you mean to write 'class'?
mist.ts(8,12): error TS2353: ... 'tagName' does not exist in type 'HTMLDivElementProps'.
```

The generated file has to be regenerated for each lib.dom version. I generated from TS 6's lib and checked against TS 7's lib with no errors, but they are not guaranteed to match.

## 8. Node 25 type stripping and happy-dom

### Node runs `.ts` directly

- `node file.ts` works on 25.1.0. `process.features.typescript` is `'strip'`, and no warning is printed.
- Docs history: enabled by default in 23.6; warning removed in 24.3; marked Stable in 25.2.0 and 24.12.0. `--experimental-transform-types` was removed in 26.0.
- `import { make, type User } from './types.ts'` works.
- Node ignores tsconfig. Node refuses to strip `.ts` files under `node_modules`, so the framework must ship `.js` plus `.d.ts`.

Runtime failures and the tsc error that catches each one first:

| Case | Node at runtime | tsc |
|---|---|---|
| Missing `type` on a type-only import | `SyntaxError: The requested module './types.ts' does not provide an export named 'User'` | `TS1484 'User' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.` |
| `enum` | `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript enum is not supported in strip-only mode` | `TS1294 This syntax is not allowed when 'erasableSyntaxOnly' is enabled.` (parameter properties get the same error) |
| Import without extension | `ERR_MODULE_NOT_FOUND` | `TS2835 ... Did you mean './types.js'?` |

**Gotcha: TS2835 suggests `.js` even with `allowImportingTsExtensions`.** If an agent follows the suggestion, `import './types.js'` passes tsc (it resolves to the `.ts` file) but Node throws `ERR_MODULE_NOT_FOUND`. Under `moduleResolution: bundler`, extensionless imports pass tsc and fail at runtime. The framework needs its own check that import specifiers end in `.ts`.

### Getting to the browser without a bundler

- **`module.stripTypeScriptTypes`** (Stability 1.2, release candidate; prints an ExperimentalWarning on 25.1) replaces types with whitespace. Output length equals input length, so line and column positions are preserved and no source maps are needed. Specifiers like `'./types.ts'` are kept, which browsers accept when the server sends a JavaScript MIME type.
- **Alternative:** `tsc --rewriteRelativeImportExtensions --outDir` emits `./types.js`. Verified with TS 7.
- The TC39 Type Annotations proposal is still Stage 1, and its last recorded discussion was in 2023.

### happy-dom with node:test

- `@happy-dom/global-registrator` 20.14.5: call `GlobalRegistrator.register({ url })` in a support module, and all 6 tests pass. They cover reactive text, attributes and class, the input binding, components with the store, the primitive trap, the router, and context.
- Timing: registration takes about 1.1s wall (0.57s user). The tests themselves take 56ms. The whole `node --test` run takes about 1.6s.

Gotchas:
- `node --test test/` treats `test/` as a module and fails. Plain `node --test` with no arguments discovers `*.test.ts` files.
- Every file under a `test/` directory counts as a test, so my setup file ran as one. Keep setup outside `test/`, or load it with `--import`.
- `node --test` passed while tsc was failing, because stripping does not check types. The agent loop must run `tsc --noEmit` and `node --test` as separate steps.
- Use `--pretty false` to get stable one-line `file(line,col): error TSxxxx:` output that agents can parse.

IMPLICATIONS
- Element typing: ship generated flat named interfaces (HTMLButtonElementProps etc.) produced from lib.dom at framework release time rather than deriving Props with mapped/IfEquals types in user compiles: measured 46k vs 446-630k instantiations and ~0.55s vs 2-3.3s check (TS7) for a 56-tag file, with identical or better error messages naming the interface.
- Never let a public generic (h<K>) be instantiated with the full tag union internally; keep typed facades (h, tags Proxy) over one untyped create(tag: string, props: object|null, ...children) - this alone cut dom.ts from 662k to 15k instantiations.
- Require the props slot in element factories (div(props|null, ...children)); do not use union-first-arg or overloads: both destroy TS2561 'Did you mean' suggestions and overloads (TS2769) blame the wrong overload.
- Prefer per-tag functions and direct component calls (Card({...})) over JSX-like h(Component, props): generic inference keeps literal types, go-to-definition works, errors cite the user's own props interface (e.g. 'CardProps').
- Reactive prop rule: at runtime any function is an accessor EXCEPT on* and ref keys; component callback/render props are typed as plain functions (never Reactive); Reactive<F> for a function type F resolves to a message-carrying error type; signals expose set(v) and update(fn) separately (no T | (prev=>T) overload).
- Two accessor types: Accessor<T> = () => T as the input type (so inline arrows work), and ReadSignal<T>/Signal<T> as output types that shadow Function.prototype length/name with a CallMeFirst type - verified this turns silent items.length / user.name bugs into TS2322/TS2365 errors.
- Choose function accessors over .value objects: tsc special-cases functions in conditions (TS2774 'Did you mean to call it instead?'), which object signals do not get; also add a dev-mode Symbol.toPrimitive trap because `${count}` is not caught by tsc.
- Accept that snapshot-instead-of-accessor (title: title()) cannot be caught by types; spec must provide a dev-runtime diagnostic or lint for it, and a dev check that rejects signals passed as event handlers (compiles because () => fn is assignable to (e) => void).
- Object-valued props (style) must not be unioned with function types: keep style as an object with reactive leaves (StyleProps interface incl. `--${string}` custom props) so 'Did you mean color?' survives.
- Every optional prop in framework .d.ts must be declared `?: X | undefined` so apps using exactOptionalPropertyTypes don't hit TS2379 with 115-member expansions.
- Design types for error messages: use named interfaces, Simplify<> on computed objects, descriptively named brand symbols (Property '[createWith_signal_or_computed]' is missing) and message-carrying types; add NoInfer on 'value' params (provide(ctx, value)) - without it a wrong value silently widens T.
- Router: derive params with template-literal types plus Simplify; bind navigate/href to the route table with `path: P extends Path ? P : Path` (not `P extends Path`) so typos report the path, not 'Expected 1 arguments, but got 2'; static routes take [] args to block extra params.
- Store: readonly DeepReadonly view + single update(draft => ...) mutation API (Immer-like, familiar to agents); avoid Solid-style variadic path setters (overload error hell). Runtime write outside update throws with the fix in the message.
- Toolchain contract: TS 7.x (types default [] -> list 'node' explicitly), erasableSyntaxOnly + verbatimModuleSyntax + module nodenext + allowImportingTsExtensions, imports must end in .ts; add a framework check for '.js' specifiers because TS2835 suggests '.js' which passes tsc but fails in Node.
- Agent verification loop = `tsc --noEmit --pretty false` + `node --test` with happy-dom via GlobalRegistrator in a support file outside test/ (node:test treats everything in test/ as a test); stripping does not type-check, so both steps are mandatory.
- Framework must ship compiled .js + .d.ts (Node refuses to strip .ts under node_modules); app code can run as .ts in Node and be served to browsers via position-preserving stripping (module.stripTypeScriptTypes) or per-file tsc emit with rewriteRelativeImportExtensions.

OPEN
- Event prop naming: DOM-native lowercase onclick (derivable from HTMLElementEventMap, tsc suggests it when agents write onClick: 'Did you mean to write onclick?') vs React-style onClick (dominant in agent training data, needs a hand-maintained multiword map). Needs an empirical agent eval.
- Function accessors (inline arrows allowed, T|()=>T ambiguity handled by key rules) vs branded-signal-only reactive props (no ambiguity, function-typed props can be reactive, but every derived value needs computed()). Both prototyped; choose by agent error rate.
- How to surface the snapshot-vs-accessor mistake (title: title()) that types cannot see: dev-mode untracked-read warnings, a reactivity tracer queryable by agents, or a lint rule (typescript-eslint cannot use TS7 until the 7.1 API ships).
- Codegen'd element interfaces must track lib.dom per TS version (TS6 vs TS7 libs differ, e.g. click typed as PointerEvent); how to version/ship them and whether to copy MDN JSDoc into generated props.
- Not prototyped: SVG/MathML element typing, custom elements (HTMLElementTagNameMap augmentation), keyed list/Show/For control-flow typing, async-safe owner-tree context, and generic components wrapped in component() with default type params.
- Whether browsers should load app .ts via a stripping dev server (module.stripTypeScriptTypes is release-candidate, warns on 25.1, output 'not stable across Node versions') or via per-file tsc emit with rewriteRelativeImportExtensions.
- Whether to accept kebab-case style keys (tolerant input) at the cost of silently accepting hyphenated typos via a `${string}-${string}` index signature.

SOURCES
- Announcing TypeScript 7.0 (Microsoft DevBlogs): https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- Node.js docs: Modules - TypeScript (type stripping): https://nodejs.org/api/typescript.html
- Node.js docs: node:module (stripTypeScriptTypes): https://nodejs.org/api/module.html
- happy-dom wiki: Global Registrator: https://github.com/capricorn86/happy-dom/wiki/Global-Registrator
- TypeScript 5.8 release notes (erasableSyntaxOnly): https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html
- TypeScript Handbook: Utility Types (NoInfer): https://www.typescriptlang.org/docs/handbook/utility-types.html
- TC39 proposal-type-annotations: https://github.com/tc39/proposal-type-annotations