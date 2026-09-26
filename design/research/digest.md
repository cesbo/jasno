# Design Digest: agent-first, no-bundler, signal-based TypeScript SPA framework

Date: 2026-09-26. This digest condenses 12 research notes: ai-failure-modes, frameworks-survey, no-build-ts-toolchain, reactivity, platform-spa, testing-diagnostics, ts-typing-prototype, and the gap notes on the TS 7 lint host, agent fluency, the browser floor, unbundled production delivery and the untracked-read diagnostic.

**Experiment toolchain**
- TypeScript 7.0.2 (native) and 6.0.3.
- Node 25.1.0. That line is EOL, but the strip, dev-server and deploy prototypes gave byte-identical results on Node 24.12.0, 24.21.0, 26.0.0 and 26.10.0.
- Playwright 1.63 driving Chromium 153, Firefox 155 and WebKit trunk. The WebKit trunk build is not Safari.
- Artifacts live under `/tmp/claude-1000/-home-and-ff/96b9f726-1e37-4313-9d48-852096c2ca84/scratchpad/` (subdirectories `tsproto/`, `exp/`, `proto/`, `lint/`, `lint71/`, `deploy/`, `devserver/`, `solid2/`, `sb/`).

**⚠ marks** a fact that is uncertain, inferred, or measured on the contended 2-vCPU lab VM.

---

## 0. Decisions at a glance

| Question | Recommendation | Status |
|---|---|---|
| Authoring | Typed tag functions `h.div(props \| null, ...children)`. Closed prop types generated from lib.dom. No tagged templates, no overloads. | Firm on "typed factories". Choosing `h.div` vs `h('div')` is gated on the eval (arm A). |
| Events | DOM lowercase names (`onclick`), each typed `Event & {currentTarget: E}` | Eval-gated (arm B) |
| Components | Plain functions wrapped once in `component()` and called directly. They run once, untracked, under their own owner. | Firm |
| Reactive rule | A function or signal is live; every other value is static. `on*` and `ref` keys are never reactive. | Firm |
| Signals | Callable getter `count()`, plus `.set(v)`, `.update(fn)` and `.peek()`. Guarded `ReadSignal` type. `toPrimitive` trap in dev. | Firm |
| Scheduling | Read-your-writes. Effects and DOM updates flush on a microtask. `flush()` exists; `batch()` does not. | Firm, but should be confirmed by an A/B eval because it is costly to reverse |
| Graph core | Vendor alien-signals 3.2.1 `createReactiveSystem()` and fix its silent behaviours in the surface layer | Firm |
| Async | `resource({params, loader})` in Angular's shape | Firm (naming in eval arm C) |
| Stores | None in v1. Immutable values in signals, keyed rows, `selector()`. | Firm |
| Lists | `each(list, {key}, (item: Read<T>, i: Read<number>) => Node)`, with `key` required | Firm |
| Static gate | `fw check` wraps: tsc (TS 7, `nodenext`), a syntax gate, a `.ts`-specifier check, and type-aware rules | Type-aware rules depend on an unstable API until TS 7.1 (2026-11-24) |
| Dev | Zero-dependency Node server that strips types per request and preserves positions | Firm |
| Prod | Per-file stripped `.js`, one import map with integrity, modulepreload of the full static graph, generated CSP, module budget | Budgets need real-device data |
| Router | Navigation API plus a small History adapter. Own RegExp matcher over a URLPattern-compatible subset. Route table in code. Accessibility on by default. | Firm |
| Data / forms / styling | `resource` in core. Optional `query` and `form` modules. `css` builds a constructable sheet with `@scope`. | Firm |
| Context | `createContext` / `provide` / `use`, valid only during synchronous setup. Module exports for singletons. | Firm |
| Diagnostics | Descriptive stable codes, structured deduplicated events with source location, repair guide in the package, `window.__FW__` | Firm |
| Testing | node:test with happy-dom (`--test-isolation=none`), plus Playwright against `fw dev`. Warnings fail tests by default. | Firm |
| Disposal | String method `dispose()`. No `Symbol.dispose`. | Firm |
| Node floor | `engines: "^24.12.0 \|\| >=26.0.0"` | Firm |

---

## 1. Templating

**Facts**
- **tsc cannot check anything inside a tagged template.**
  - TypeScript #33304 has been open since 2019.
  - Verified: `<const S extends TemplateStringsArray>` infers `string` for `s[0]`.
  - lit-analyzer and ts-lit-plugin were last published 2024-01-09 and are tsserver plugins. TS 7.0 has no plugin API: `require("typescript")` in 7.0.2 exports only `version` and `versionMajorMinor`.
- **Head-to-head on TS 7.0.2.** I tested `hreff`, `value: 5` on an input, `onClick`, misspelled tag `dvi`, and a wrong component prop type.
  - VanJS 1.6.1, lit-html 3.3.3, htm 3.1.1 and @solidjs/html rc.9 reported **none** of them.
  - A strict tag-function prototype reported **all** of them, with "Did you mean" hints. It inferred `PointerEvent & {currentTarget: HTMLButtonElement}` for the click handler.
  - VanJS types props as `Record<string, …>`, so it also accepts `onClick: 123` and `van.tags.dvi()`.
- **Training prior.** No published benchmark compares hyperscript or tag functions against JSX. Related data:
  - Web-Bench (arXiv 2505.07473), Claude 3.7 pass@2: React 65, Vue 30, Angular 40, Svelte 25.
  - DesignBench (arXiv 2506.06251): the most common JSX errors are "Unexpected Token"; for Vue it is "Missing End Tag". Nobody has measured bracket-balancing errors in deeply nested factory calls.
- **Parse cost is not the deciding factor.** htm spends about 37–50 µs per unique template. For an SPA that totals tens of milliseconds, once.

**Options**
- (a) `h('div', props, …)`
- (b) Typed tag functions
- (c) Tagged templates: untyped, and each dialect differs (`@click` vs `onClick`, `<${C}>`)
- (d) Fluent builders: no prior art in reactive frameworks, and they hide the tree. Rejected.

**Recommendation: (b), typed tag functions.** The rules:
1. **One signature, `(props: Props<E> | null, ...children: Child[])`.** The props slot is required. Measured error quality:

   | Signature | tsc output for `{ clas: 'x' }` |
   |---|---|
   | Required props slot | `error TS2561: Object literal may only specify known properties, but 'clas' does not exist in type 'Props<HTMLDivElement>'. Did you mean to write 'class'?` |
   | Union first parameter | `error TS2353: ... 'clas' does not exist in type 'Node \| readonly Child[] \| (() => Child) \| Props<HTMLDivElement>'.` (the suggestion is lost) |
   | Overloads | `error TS2769: No overload matches this call. The last overload gave the following error. ... 'class' does not exist in type 'Node \| readonly Child[] \| (() => Child)'.` (blames the correct key) |

   With two same-arity overloads, tsc 7.0.2 printed only "The last overload gave the following error", while 6.0.3 listed every overload. ⚠ One re-test saw no difference; the most likely cause is the `tsc` bin-shadowing trap described in §6. **Use no overloads anywhere in the public API.**
2. **Closed prop types**, derived from `HTMLElementTagNameMap` writable properties plus `HTMLElementEventMap`, never `Record<string, …>`. Prototype core (`tsproto/src/dom.ts`):
   ```ts
   export type Reactive<T> = [T] extends [(...args: never[]) => unknown]
     ? { 'Reactive<T> cannot wrap a function type': T } : T | Accessor<T>;
   type WritableDataKeys<E> = Extract<keyof { [K in keyof E as
     string extends K ? never : number extends K ? never
     : NonNullable<E[K]> extends (...a: never[]) => unknown ? never
     : IfEquals<{ [Q in K]: E[K] }, { -readonly [Q in K]: E[K] }, K, never> ]: 0 }, string>;
   export type EventProps<E> = { [K in keyof EventMapFor<E> & string as `on${K}`]?:
     (event: EventMapFor<E>[K] & { currentTarget: E }) => void };
   export type Child = Node | string | number | bigint | boolean | null | undefined
     | (() => Child) | readonly Child[];          // an Accessor<Child> alias here gives TS2456 (circular)
   export const h = create as <K extends Tag>(tag: K, props?: Props<HTMLElementTagNameMap[K]> | null,
     ...children: Child[]) => HTMLElementTagNameMap[K];   // typed facade over untyped create(tag: string, …)
   ```
   Gotchas, each confirmed with the compiler:
   - `HTMLFormElement`'s index signature collapses a plain `keyof`, so you must use `as` remapping.
   - Testing `K extends string` before the readonly probe makes every key look writable, so `div({tagName:'span'})` was accepted.
   - Instantiating `h<K>` with the full tag union internally cost **662k instantiations and about 2.1 s**. Typed facades over one untyped `create` brought that to 15k and 0.2 s.
3. **Generate flat named interfaces at release time** (`HTMLButtonElementProps extends GlobalProps<HTMLButtonElement>`) instead of computing mapped types in every user compile.
   - Measured on a 56-tag file with TS 7: mapped types took 446k–630k instantiations and 2.0–3.3 s of check time; the generated interfaces took **46k and 0.51–0.59 s**.
   - Errors got slightly better because they name the interface: `'clas' does not exist in type 'HTMLDivElementProps'. Did you mean to write 'class'?`
   - The generator (`ts6/gen.cjs`, about 50 lines) uses the TS 6 API. It must be re-run for each lib.dom version.
4. **Expose tags through a namespace object** (`h.div`) or explicit named exports. Bare destructured tags shadow `a`, `b`, `i`, `p`, `label`, `title`, and `var` is a reserved word.
5. **`style` is an object with reactive leaf values**, never `Reactive<StyleObj>`. Any union of a function type with an object type removes the "Did you mean" suggestion (`'colr' … Did you mean to write 'color'?` survives only without the union). Custom properties go through `` [custom: `--${string}`] ``.
6. **Declare every optional prop as `?: X | undefined`.** Otherwise apps using `exactOptionalPropertyTypes` hit TS2379 with a `{ accept?: ...; ... 115 more ...; }` expansion.

Literal tsc output for DOM mistakes (m1):
```
m1-dom.ts(8,7): error TS2561: ... but 'clas' does not exist in type 'Props<HTMLDivElement>'. Did you mean to write 'class'?
m1-dom.ts(10,7): error TS2353: ... 'className' does not exist in type 'Props<HTMLDivElement>'.
m1-dom.ts(11,10): error TS2561: ... but 'onClick' does not exist in type 'Props<HTMLButtonElement>'. Did you mean to write 'onclick'?
m1-dom.ts(14,10): error TS2322: Type '(e: KeyboardEvent) => void' is not assignable to type '(event: PointerEvent & { currentTarget: HTMLButtonElement; }) => void'.
m1-dom.ts(16,42): error TS2339: Property 'checked' does not exist on type 'EventTarget & HTMLButtonElement'.
m1-dom.ts(18,9): error TS2322: Type 'string' is not assignable to type 'boolean | Accessor<boolean> | undefined'.
m1-dom.ts(19,9): error TS2322: Type 'Signal<number>' is not assignable to type 'string | Accessor<string> | undefined'.
m1-dom.ts(21,7): error TS2353: ... 'tagName' does not exist in type 'Props<HTMLDivElement>'.
```
`className` is too far from `class` to get a suggestion. Typing it as a message fixes that: `className?: { "use 'class'": never }`.

**Event casing**
- The lowercase set derives mechanically from lib.dom, and tsc then suggests `onclick` for `onClick` and `ondblclick` for `ondoubleclick`.
- camelCase cannot be derived: `on${Capitalize<K>}` produces `onKeydown`, not React's `onKeyDown`, so it would need a hand-maintained table.
- Raw lib.dom `on*` types are a trap: `e.currentTarget.value` fails with TS18047 and TS2339.
- Evidence on leakage: in SvelteBench's 27,396 raw samples, React casing appeared **8 times (0.03%)**, and 0 of 7,353 from frontier models. ⚠ `.svelte` files carry a strong framework cue; plain `.ts` files do not.
- Hole: an object spread (`{class:'x', ...p}` where `p` contains `onClick`) compiles. Add a dev warning `UNKNOWN_EVENT_PROP`.
- **Recommendation:** lowercase names, pending eval arm B. No `on:{click}` namespace in v1, because in Svelte the second form was the one models kept regressing to.

---

## 2. Component model

**Facts**
- In Solid 2.0 rc.9, `createComponent` is literally `untrack(() => Comp(props))`.
- Calling `Comp(props)` directly bypassed Solid's strict-read check entirely (**0 events**, measured).
- Remix 3 beta dropped hooks in favour of explicit updates ("Model-First" principle, PR #11925, 2026-09-22).
- Custom elements as the component model are rejected, for four reasons:
  - Cross-root ARIA (Reference Target) ships only in Chrome 152.
  - Scoped registries are missing from stable Firefox.
  - `customElements.define` is irreversible, so there is no hot redefinition.
  - Attribute/property duality and event retargeting cause bugs (Carniato, 2024).

**Recommendation**
- A component is `export const Card = component(function Card(p: CardProps) { … })`, called directly as `Card({…})`.
  - The wrapper's type is the identity `<P>(fn: (props: P) => Node) => (props: P) => Node`, so hovers and errors show the user's own interface, and generic inference survives (`render` is inferred from `items`).
  - The wrapper runs the body untracked, under a new owner, and inside the strict-read region labelled with `fn.name`.
  - Direct calls go through the wrapper, which covers typing and diagnostics together.
  - ⚠ A bare, unwrapped function component escapes the check. `fw check` could flag exported PascalCase functions that return `Node` without the wrapper.
- Bodies run once. No hooks, no call-order rules, no double invocation in dev only. Lifecycle is `onCleanup` and `onMount` (the latter for imperative construction).
- **Reactive inputs are typed as accessors** (`label: Read<string>`), so destructuring stays safe and passing `n()` is a compile error (verified against `Read<number>`).
  - Where a prop accepts `T | () => T`, the snapshot mistake `title: title()` compiles. The strict-read diagnostic (§12) catches it in the parent's setup.
- **Callback and render props are typed as plain functions**, never `Reactive`. `Reactive<F>` for a function type F resolves to the message-carrying error type shown in §1.

Literal output (m2, m8):
```
m2(7,6): error TS2741: Property 'title' is missing in type '{ subtitle: string; }' but required in type 'CardProps'.
m2(9,20): error TS2561: ... but 'subtitel' does not exist in type 'CardProps'. Did you mean to write 'subtitle'?
m2(13,63): error TS2551: Property 'nme' does not exist on type '{ id: number; name: string; }'. Did you mean 'name'?
m8(9,7): error TS2353: ... 'children' does not exist in type 'Props<HTMLDivElement>'.
m8(12,40): error TS2740: Type 'Promise<HTMLDivElement>' is missing the following properties from type 'Node': ...
m8(14,11): error TS2345: Argument of type '(props: CardProps) => Node' is not assignable to parameter of type 'Child'.
    Target signature provides too few arguments. Expected 1 or more, but got 0.
```

---

## 3. Reactivity semantics

**Facts**

TC39 Signals
- Still **Stage 1**. Last repo commits are from 2025-08-11.
- `signal-polyfill` is 0.2.2 (January 2025). It allows writes inside a Computed (verified) and is 3.3–10.5× slower than the fastest engine in the 2026-09-19 js-reactivity-benchmark.
- Its semantics: `Object.is` equality, lazy glitch-free computeds, errors cached and rethrown, set-then-get synchronous, no effects.

alien-signals 3.2.1 (2026-05-14)
- Push-pull, with no arrays, sets, maps or recursion in the core.
- Underpins Vue 3.6 (rc.9, 2026-09-18) and XState. It had the best score in the benchmark (1.00–1.33 geometric-mean slowdown across workload families).
- **Four behaviours verified that are silent or need fixing:**
  1. A throwing computed returns `undefined` on its second read.
  2. `!==` equality, so setting `NaN` re-runs effects.
  3. An effect that writes its own source is skipped silently.
  4. Effects flush synchronously on every unbatched write.

Preact signals-core 1.14.4
- Caches errors correctly.
- Self-writes throw `"Cycle detected"` after 100 rounds, and the message names nothing.

Solid 2.0.0-rc.9 (2026-09-18, API "frozen barring showstoppers")
- Reads stay stale until `flush()` (verified: `setCount(1); count()` returns 0). Solid's own cheatsheet lists this as an AI footgun.
- A write inside an owned scope throws `REACTIVE_WRITE_IN_OWNED_SCOPE`.
- A concise-arrow cleanup, `v => setQ(v+1)`, raised `REACTIVITY_HALTED`, and every later update was ignored.

Angular 22.2
- `Object.is` equality, NG0600 on writes inside computed or template.
- `linkedSignal`, and `resource` stable.
- The effect callback receives `onCleanup`, returns an `EffectRef` with `.destroy()`, and runs during change detection.

**Recommendations**
1. **Graph core:** vendor alien's `createReactiveSystem()` (about 6.6 KB unminified, MIT). The surface-layer prototype (`exp/proto.mjs`, 78 lines) passes these tests:
   - read-your-writes, with the effect deferred to the microtask
   - one coalesced, glitch-free run
   - `Object.is` equality
   - cached errors (1 call for 2 reads)
   - `WRITE_IN_COMPUTED` thrown with the names of both nodes
   - `EFFECT_LOOP` naming the culprit
   - a clamp effect that converges and emits `EFFECT_WRITES_OWN_SOURCE`
   - `inspect()` output
2. **Equality:** `Object.is` by default, an `equals` option, `equals: false` to always notify, and a `shallowEqual` helper.
3. **Scheduling, model B:** state changes are immediate; side effects run on the next microtask.
   - `flush()` is the only escape hatch. There is no `batch()`.
   - Within a flush, computeds are pulled as needed, then DOM bindings run parent-first, then user effects run after the DOM (so they can measure layout).
   - In dev, lazily capture the stack of the first write that scheduled each effect and attach it as `error.cause`.
   - Rejected: model A (sync flush), because torn state after `await` fails silently. Model C (Solid 2's stale reads).
4. **Writes:**
   - Inside a computed: always throw, in dev and in prod.
   - Inside an effect: allowed. Re-queue until stable, warn `EFFECT_WRITES_OWN_SOURCE`, and cap at about 100 rounds before throwing `EFFECT_LOOP` with effect names and locations.
   - In setup: warn only on writes to signals the setup did not create. Solid throws on all such writes and had to add an `ownedWrite` escape.
   - `linked()` provides writable derived state, the sanctioned replacement for "copy a prop into local state with an effect". Solid calls that pattern `EFFECT_RELAY_TEAR` and Svelte calls it `assign-in-effect`.
5. **`untrack(fn)` and `sig.peek()`** mark intentional one-time reads.
6. **Ownership**
   - Components, branches and rows are owners. Children are disposed first, then cleanups run LIFO.
   - A root created inside an owner is owned by it.
   - An effect returns its cleanup, and `onCleanup()` works in setup.
   - Each owner and each effect run gets an `AbortSignal`: `effect(({signal}) => …)`. `fetch` and `addEventListener` then need no manual teardown.
   - `NO_OWNER_EFFECT` warns when there is no owner. `WRITE_AFTER_DISPOSE` warns on writes to signals of a disposed owner.
7. **Errors:** a computed caches its error and rethrows it. An effect error goes to the nearest `catchError`, otherwise to `reportError()`. The effect stays subscribed, and the system never halts globally.
8. **Types** (verified, TS 7.0.2 `--strict --erasableSyntaxOnly`):
   - `effect: (ctx: {signal: AbortSignal}) => void | Cleanup` rejects `effect(async …)` and `effect(() => setQ(1))`.
   - A non-Promise constraint on `computed` rejects `computed(async …)`.
   - Const objects work in place of enums.

**Signal shape: callable getter, not `.value`.** Literal output for forgotten calls (m3):
```
m3(10,14): error TS2365: Operator '+' cannot be applied to types 'Signal<number>' and 'number'.
m3(13,5): error TS2774: This condition will always return true since this function is always defined. Did you mean to call it instead?
m3(16,7): error TS2339: Property 'map' does not exist on type 'Signal<string[]>'.
m3(19,13): error TS2345: Argument of type 'Signal<number>' is not assignable to parameter of type 'number'.
m3(22,7): error TS2554: Expected 0 arguments, but got 1.                     // count(5)
m3(23,7): error TS2339: Property 'value' does not exist on type 'Signal<number>'.   // Vue/Preact habit
m3(26,12): error TS2367: This comparison appears to be unintentional because the types 'Signal<number>' and 'number' have no overlap.
```
- A `.value` object gets no TS2774, because `if (ref)` is always truthy.
- tsc misses four forgotten-call forms: `` `${count}` ``, `"x" + count`, and `items.length` / `user.name`, which resolve to `Function.prototype` members.
- The fix uses two types, one for inputs and one for outputs. The guard cannot go on the input type, because every inline arrow was then rejected.
```ts
declare const misuse: unique symbol;
type CallMeFirst = { readonly [misuse]: 'This is a signal/accessor. Call it first: x().length, x().name' };
export type Accessor<T> = () => T;                         // input type
export interface ReadSignal<T> { (): T; readonly length: CallMeFirst; readonly name: CallMeFirst }
export interface Signal<T> extends ReadSignal<T> { set(v: T): void; update(fn: (p: T) => T): void }
```
```
m4(5,7): error TS2322: Type 'CallMeFirst' is not assignable to type 'number'.
m4(7,5): error TS2365: Operator '>' cannot be applied to types 'CallMeFirst' and 'number'.
```
Coercion trap: signals share a prototype whose `Symbol.toPrimitive` throws. Verified to catch template literals, `"x"+count`, `String(count)` and `count+1` at the faulty line, while `.call` and `.bind` keep working. ⚠ The V8/JSC/SpiderMonkey cost of `setPrototypeOf` on every signal has not been benchmarked.
```js
const proto = Object.create(Function.prototype, { [Symbol.toPrimitive]: { value() { throw new TypeError("SIGNAL_COERCED: …"); } } });
function signal(v) { const s = () => v; Object.setPrototypeOf(s, proto); /* … */ return s; }
```
Signal used as a handler becomes a type error. tsc rejects `onclick: count` with TS2322 ("Types of property '[SIGNAL]' are incompatible") and still accepts arrows and named handlers:
```ts
type Handler<E extends Event> = ((e: E) => void) & { readonly [SIGNAL]?: never };
```
Keep `set(v)` and `update(fn)` separate. A `set(v | fn)` overload would reintroduce the value-or-function ambiguity.

**Naming** (the research papers are in §14)
- `signal`, `set`, `update` and `computed` match Angular and Svelte stores in meaning, so they use the prior. The Svelte autofixer flags `.set` on runes because models *reach for* it.
- `effect` diverges from Angular (cleanup returned rather than passed in; microtask timing; a disposer instead of `EffectRef`). Either mirror Angular or rename it. That is eval arm C.
- ⚠ `linked` vs Angular's `linkedSignal`: a near-miss name. Decide in the same eval.
- Never use `useEffect`, `ref`/`.value` or `createSignal`.

---

## 4. Async

**Facts**
- Solid 2 makes every memo potentially async, with holds, lanes and transitions. The async RFC alone is about 26 KB.
- Solid needed `UNTRACKED_READ_AFTER_AWAIT` (PR #3602, 2026-09-23), a V8-only heuristic based on async stack traces, because "JavaScript has no async context".
- Svelte and Alpine document that reads after `await` are untracked. AsyncContext is Stage 2.
- Angular 22 `resource` is stable:
  - `{params, loader}`, and the loader receives `{params, abortSignal, previous}`.
  - Status is `idle|loading|reloading|resolved|error|local`.
  - Also `hasValue()`, `reload()`, local `set()`, and `debounced` added in v22.

**Recommendation**
- `resource({params, loader})`. `params` is synchronous and tracked; `loader` is async and untracked. This removes the read-after-await bug by construction and works in Safari and Firefox.
  - The previous load is aborted when `params` changes.
  - A version counter drops stale results even if the loader ignores the abort.
  - State is a discriminated union. A non-exhaustive `switch` is rejected (verified).
- **Mirror Angular's names exactly** (`loader`, `abortSignal`, `previous`). Never use `load`: near-miss renames are the most damaging case in the literature (§14).
  - ⚠ Whether to mirror Angular's full status set or a smaller union is still open.
- Show a fallback on the initial load only. Expose `pending` for refreshes (Solid 2's `Loading`/`isPending` lesson).
- No Suspense and no transitions in v1.
- In a strict region, a read of a value that is still pending is an error, not a warning.

---

## 5. Lists and control flow

**Recommendation**
- `each(list, {key: t => t.id}, (item: Read<T>, index: Read<number>) => Node)`.
  - A missing key is a **type error**. Index keys only via an explicit opt-in.
  - The callback has the same shape in every mode, avoiding Solid 2's mode-dependent types.
  - `repeat(n, i => …)` covers ranges.
- Same key with a new object updates the row's item signal in place. Refetched data then patches rows instead of recreating them.
- Dev checks: `DUPLICATE_KEY` (Angular NG0955 precedent) and `ROWS_RECREATED` (NG0956, Solid `UNSTABLE_LIST_IDENTITY`).
- Reconciliation: trim the common prefix and suffix, build a key map, then place with LIS (Vue `getSequence`).
  - Use `Element.moveBefore` when present (Chrome/Edge 133+, Firefox 144+, **not Safari 27**). It preserves focus, iframes and open popovers. Otherwise fall back to `insertBefore`.
- `selector(source)` gives O(1) "is this row selected" updates.
- The builder callbacks of `each`, `show` and `switch` **run inside the strict-read region**. Otherwise `show(c, () => Child({title: title()}))` silently remounts instead of warning. Solid #3126 found 24 such reads in one list.

---

## 6. TypeScript toolchain and the static gate

**TypeScript facts**
- TS 7.0 GA was 2026-07-08; 7.0.2 is the current `latest` tag.
- TS 7.1 schedule (microsoft/TypeScript#63703): beta 2026-10-06, RC 2026-11-10, **stable 2026-11-24**. Its goal is to stabilize the client API.
- There will be **no third-party rules inside tsc or tsserver**. andrewbranch (2026-08-26): "package it up into your own CLI (e.g. like Angular does)".
- TS 7.0.2 ships an unstable API under `typescript/unstable/{sync,async,ast,...}`.
  - It churns: `updateSnapshot` became `createSnapshot().update` on 7.1-dev ("Cannot update an inactive snapshot"). A one-line shim fixed it.
  - It is Node-only; it breaks on Bun (TypeScript#64387).
- typescript-eslint has no TS 7 support: #12518 was closed as not planned, and #10940 is in progress with no ETA.
- oxlint JS plugins have no type information. tsgolint accepts no custom rules. Biome/GritQL has no type information.
- **Bin trap:** installing `@typescript/typescript6` alongside TS 7 made `node_modules/.bin/tsc` resolve to **6.0.3** (typescript-go#4567). Always print `tsc -v`.
- Exit codes differ: 7.0.2 exits 1 where 6.0.3 exits 2 for the same errors. Gates must test for non-zero.
- Type-check speed:
  - 500-module project: 1.1 s with TS 7 vs 5.1 s with TS 6.
  - The whole prototype: 1.5–1.7 s check (TS 7) vs 4.1 s (TS 6).
  - Incremental no-op rebuild: 0.86 s.

**What each tool catches**

| Mistake | Node at runtime | tsc |
|---|---|---|
| Type imported without `type` | `SyntaxError: The requested module './types.ts' does not provide an export named 'User'` | `TS1484 'User' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.` (re-export: TS1205) |
| `enum`, parameter property | `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | `TS1294 This syntax is not allowed when 'erasableSyntaxOnly' is enabled.` |
| Import without extension | `ERR_MODULE_NOT_FOUND` | `TS2835 ... Did you mean './types.js'?`, **the wrong fix**: `./x.js` passes tsc and fails in Node |
| `@dec class`, `accessor` | Passed through by the stripper, then **SyntaxError** in V8 | passes (exit 0). This corrects the earlier claim that it raises `ERR_UNSUPPORTED…`. |
| `Symbol.dispose` / `using` | Missing in Safari 27 | TS2550 / TS2318 under `lib: es2025`. TS2318 has **no file or line**. Both pass if `esnext.disposable` is added. |

- `moduleResolution: bundler` accepts `./util` and `./util.js`.
- `nodenext` catches `./util` (TS2835) and JSON imported without `with {type:'json'}` (TS1543). Neither rejects `./x.js`.
- Stripping does not type-check: `node --test` passed while tsc failed.

**Recommended tsconfig (app)**
```json
{"compilerOptions":{"target":"es2025","module":"nodenext","moduleResolution":"nodenext","lib":["es2025","dom"],
 "types":[],"strict":true,"noEmit":true,"allowImportingTsExtensions":true,"erasableSyntaxOnly":true,
 "verbatimModuleSyntax":true,"exactOptionalPropertyTypes":true,"noUncheckedIndexedAccess":true,"skipLibCheck":true}}
```
- package.json must contain `"type":"module"`. npm 11's `npm init -y` writes `"commonjs"`, which disables ESM detection for `.ts`: "Cannot use import statement outside a module".
- Tests add `"types":["node"]`, because TS 7 defaults `types` to `[]`.
- Forbid `esnext.disposable`.
- Use `--pretty false` to get one-line `file(line,col): error TSxxxx:` output.

**`fw check`: the single gate, one output format, `--json` for agents**

It combines:
1. tsc diagnostics, with TS2835's suggestion rewritten to `.ts`.
2. A syntax gate: `stripTypeScriptTypes` followed by `node --check`.
3. Rules:

   | Rule | Catches |
   |---|---|
   | `TS_EXTENSION` | Relative specifiers that don't end in `.ts` |
   | `NO_DECORATORS`, `NO_ACCESSOR` | Syntax that passes tsc and the stripper, then fails in V8 |
   | `NO_TS_CLASS_MODIFIER` | `private`, `protected` etc. Use `#private`, which also keeps compatibility with the Stage 1 type-annotations proposal. |
   | `NO_USING` | `using`, reported with a location |
   | `TLA_OUTSIDE_ENTRY` | Top-level await outside the entry. Safari 15–26.6 support is partial (WebKit 242740, fixed in 27). The entry is read from index.html. |
   | `SIGNAL_IN_TEMPLATE`, `SIGNAL_COERCED` | Signals used in templates or coerced |
   | `SIGNAL_AS_HANDLER` | Signals passed as handlers |
   | `SNAPSHOT_TO_ACCESSOR` | Warning only, with a `peek`/`untrack` escape hatch |

- Prototype (`lint/fwlint-batch.ts`, on `typescript/unstable/sync`, zero new dependencies): **18/18 expected hits and no false positives** on the fixture. Signal detection uses a unique-symbol brand, `__@SIGNAL@`.
- Performance on 500 files / 12k lines:

  | Tool | Time |
  |---|---|
  | Naive per-node IPC | 87 s |
  | Batched (one `getTypeAtLocation(nodes[])` per file, memoized by `type.id`, Identifier/PropertyAccess nodes only) | **3.8 s** |
  | tsc | 3.1 s |
  | ESLint + typescript-eslint on TS 6 | 25.8 s |

  Batching is therefore mandatory.
- Peer range `typescript: ">=7.0.2 <7.2"`, with a compatibility shim.
- Move as many rules as possible into types (`Handler` brand, required `key`) and runtime traps (`toPrimitive`), so little depends on the unstable API.

**Publishing the framework**
- Ship stripped `.js` plus `.d.ts` from `--emitDeclarationOnly --isolatedDeclarations`, which needs an explicit `rootDir` (TS5011 otherwise).
- Node refuses to strip `.ts` under node_modules (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), and tsc type-checks dependency `.ts` files with the consumer's settings.

**Node**
- Type stripping became stable in 25.2.0 and 24.12.0 (nodejs/node#60600). v26 is Current (LTS on 2026-10-28). v25 is EOL: nodejs.org says 2026-03-31, while schedule.json says 2026-06-01.
- `module.stripTypeScriptTypes` is Stability 1.2 (RC) and prints an ExperimentalWarning even on 26.10. v26 removed `transform` and `sourceMap`.
- Call it with default options and `sourceUrl`, and forward `e.stack` so errors keep file:line.
- Pin `amaro` if production output must be byte-stable across Node upgrades.

---

## 7. No-build dev and prod; module loading

**Dev server** (prototypes: `devserver/serve.ts`, about 45 lines; `proto/serve.ts`, about 30)
- `node:http` plus `stripTypeScriptTypes`. Serves `/src/x.ts` as `text/javascript` with `no-store`, SSE live reload, and a path-traversal guard.
- Strip errors are returned as a module that throws with the file path. Without this, one parameter property produced a silently failed import and a 30 s Playwright timeout.
- A 404 for `./x.js` when `./x.ts` exists answers "did you mean ./x.ts".
- Positions are preserved, so no source maps are needed: the stack showed `/fw.ts:48:55`, and line 48 is the `throw`.
- Node's built-in stripper, amaro and ts-blank-space produce byte-identical output. esbuild and oxc reprint the code and change line counts. ts-blank-space is tied to the TS ≤6.0 parser.
- Rejected:
  - **tsc emit**: it reformats the code and injects a `__rewriteRelativeImportExtension` helper for non-literal `import()`.
  - **Service Worker**: shift-reload bypasses it, the first load is uncontrolled, and Playwright's `route()` can't see its requests.
  - **In-browser stripping**: 1.58 MB gzipped.

**Dev vs prod builds of the framework**
- Ship two prebuilt files, `dist/dev.js` and `dist/prod.js`.
- Select them with the `"development"` export condition in Node (`node --conditions=development`, verified) and with the import map in the browser.
- A runtime `if (DEV)` is never eliminated without a bundler.
- Do not key a "server" build on the `node` condition. Solid's `node` condition resolves its server build, which silently disabled every diagnostic in tests.
- Every specifier must resolve in both Node (package.json `exports`/`imports`) and the import map. Verified: `#fw` works in both, while a name that exists only in the import map fails in Node with `ERR_MODULE_NOT_FOUND`.

**Production recipe** (`deploy/deploy.ts`, verified in Chromium 153; Firefox 155 and WebKit trunk for integrity and CSP)
1. Each `src/a/b.ts` becomes `dist/src/a/b.js` = strip(source), byte for byte (diffed). Optionally blank comments while preserving positions: −32% brotli.
2. Emit **one** inline import map, `{"/src/a/b.ts": "/src/a/b.js?v=<sha256:10>"}`, plus an `integrity` block (sha384).
   - Firefox 150–156 keeps multiple import maps behind a pref.
   - Remapping to `.js` avoids nginx/mime-db serving `.ts` as `video/mp2t`.
3. Emit modulepreload for **the full static import closure** (computed with a real lexer), repeating the same integrity value on each link.
   - Chromium 153 and WebKit do not fetch descendants; Firefox 155 does.
   - Without link integrity, Chromium fetched every module twice (301 requests for 150 modules).
   - WebKit ignores link integrity, but import-map integrity blocked tampered modules in all three engines.
   - Dynamic-import targets are excluded. The router injects preloads for a lazy route's closure from a deploy manifest.
4. Entry: `<script type="module">import '/src/main.ts'</script>`. Import maps do not apply to `src=` or to workers. The worker story is still open.
5. Cache headers: HTML `no-cache`, modules `immutable`.
6. Verified result: a thrown error reported `model.js?v=…:3:71`, which is exactly `src/model.ts:3:71`.

**CSP** (with `object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'`)
- Static host: `script-src 'self' 'sha256-<map>' 'sha256-<entry>'`, as a header or meta tag. Works in all three engines. The deploy step writes it on every deploy.
- Nonce-capable server: `'nonce-X' 'strict-dynamic'`, with the nonce on the map, the entry and every link.
- **Ban hash + `'strict-dynamic'`.** It blocks descendant imports in Chromium and Firefox but passes in WebKit.
- Nothing in the recipe touches a Trusted Types sink. `import()` and modulepreload links created by script are safe.

**Load cost** (⚠ contended 2-vCPU VM; no real phone)
- The overhead is per request, not per byte:
  - LAN: about 5.3–5.9 ms per module cold vs a minified bundle.
  - Mobile profile (100 ms RTT, 4× CPU): **8.8–12 ms per module**. 300 modules: +2.6 to 3.6 s.
  - Desktop estimate from the Chrome 2018 study: 1–2 ms per module.
- **HTTP/3 is slower than HTTP/2** for 150–300 modules in every profile, including the real jsDelivr edge.
- Firefox warm loads cost about 8–10 ms per module, roughly 20× Chromium. ⚠ This needs real hardware.
- Byte penalty: 1.6–2.9× brotli vs a bundle.
- V8's guidance: fewer than 100 modules, depth under 5.

**Budget**
- Initial route's static graph: target ≤100 modules, warn at 150, fail the deploy at 250, counting transitive npm modules. For scale: date-fns has 305, lodash-es 640, three 389.
- Lazy route closure: about 50 modules or fewer.
- The error `MODULE_BUDGET_EXCEEDED` lists counts per package.
- The framework runtime itself is a few files.

**Platform and dependencies**
- JSON modules are fine (Baseline 2025-04-29). CSS module scripts are not in Safari.
- Top-level await became Baseline only with Safari 27.
- npm dependencies are vendored as browser-ready ESM, added to the import map with integrity, and mirrored in tsconfig `paths`.

---

## 8. Routing

**Facts**
- Navigation API: Baseline 2026-01-13 (Chrome 102, Firefox 147, Safari 26.2).
- URLPattern: Baseline 2025-09-15 (Chrome 95, Firefox 142, Safari 26).
- `precommitHandler` is **absent from Safari 26 and 27**.
- Safari 26.2–26.6 has Navigation API bugs fixed only in 27: `canIntercept` across ports, `navigationType` on same-URL navigation, and offset hit-testing.
- Coverage, September 2026:
  - About 92.8% of global tracked traffic supports both.
  - iOS on ≥26.2: **75.6%** (StatCounter; a lower bound, because of the UA freeze) to **89.7%** (TelemetryDeck).
  - ⚠ An estimated 9–10% of active iPhones are hardware-capped at iOS 18 or older (my inference from Apple's June figures).
  - Firefox ESR 140 (no Navigation API) reaches EOL 2026-10-13 and moves to ESR 153 (has it). Legacy ESR 115 runs until March 2027.
- Verified in Chrome 153:
  - A superseded navigation aborts the old loader's signal, and its `finished` rejects with `AbortError`.
  - The new `finished` resolves after render, with the title set and focus on the `<h1>`.

**Recommendation**
- The Navigation API path is primary. **A small History adapter** sits behind the same public API, selected by `'navigation' in window`. It handles delegated same-origin `<a>` clicks, push/replace, popstate, and scroll and focus restore. It is not a general polyfill.
  - Removal trigger: iOS ≥26.2 above 95% of iOS traffic.
- **Matcher:** a roughly 20-line RegExp compiler over a URLPattern-compatible pathname subset (`:name`, `:name?`, `:name+`, `:name*`, `:name(re)`, named splats only).
  - A dev assert rejects anything else.
  - First match in declaration order wins.
  - The matcher does not depend on URLPattern at runtime.
- **Routes are code, in one module.** File-based routing needs a generator.
- Typed params (tsc 7.0.2, run under Node):
  ```ts
  type Strip<S extends string> = S extends `${infer N}(${string})${infer R}` ? `${N}${R}` : S;
  type Seg<S extends string> = S extends `:${infer N}?` ? { [K in N]?: string } : S extends `:${infer N}+` ? { [K in N]: string }
    : S extends `:${infer N}*` ? { [K in N]?: string } : S extends `:${infer N}` ? { [K in N]: string } : {};
  type Split<S extends string> = S extends `${infer H}/${infer T}` ? Seg<Strip<H>> & Split<T> : Seg<Strip<S>>;
  export type Params<P extends string> = { [K in keyof Split<P>]: Split<P>[K] } & {};
  type HrefArgs<P extends string> = keyof Params<P> extends never ? [] : {} extends Params<P> ? [params?: Params<P>] : [params: Params<P>];
  ```
  - Static routes take `[]`, because otherwise `href('/about', {id:'1'})` compiles.
  - Type the path as `path: P extends Path ? P : Path`. Plain `P extends Path` blames the params: `m5(19,40): error TS2554: Expected 1 arguments, but got 2.` The fixed form reports:
  ```
  m5(19,13): error TS2345: Argument of type '"/user/:id/posts/:postId"' is not assignable to parameter of type '"/about" | "/users/:id/posts/:postId"'.
  m5(5,34): error TS2741: Property 'postId' is missing in type '{ id: string; }' but required in type '{ id: string; postId: string; }'.
  ```
  `NoInfer` and `P & Path` both give worse messages.
- **Route shape:** `route(path, {loader?, view: () => import('./x.ts'), title?, children?})`.
  - The loader is eager; only the view is lazy (TanStack Router's critical vs non-critical split).
  - The router runs all matched loaders and view imports with `Promise.all`, passing `AbortSignal.any([navSignal, …])`.
  - Use **`loader`, the same word as `resource`**, to avoid a near-miss.
  - Intent preloading on `pointerenter`/`focusin`.
- **Accessibility defaults:**
  - `focusReset: 'manual'`. After render, set `document.title` and focus `[autofocus]`, else `h1[tabindex=-1]`, else `<main>`.
  - Announce via `ariaNotify` (Baseline 2026-09-14; Safari 27 only), with an `aria-live` fallback.
  - Skip the focus move on search- or hash-only changes. Keep `scroll: 'after-transition'`.
  - Reason: LLM-generated UI has critical WCAG violations even when prompted for accessibility (W4A 2025).
  - ⚠ Screen readers may double-announce; this is not yet tested with real assistive tech.
- View transitions are opt-in. Skip them when `hasUAVisualTransition` is set, and respect reduced motion.
- POST actions come from `NavigateEvent.formData`. ⚠ The History adapter must intercept `submit` itself.
- `router.navigate(url)` returns a promise that resolves after render. It is the documented await point for tests and agents.

---

## 9. Data

- Core: `resource` (§4).
- Optional `query` module (about 1–2 kB):
  - hierarchical keys, prefix invalidation
  - `staleTime` (default 0), `gcTime` (5 min)
  - dedupe, focus and reconnect revalidation
  - mutations with optimistic rollback
  - Defaults follow TanStack Query and SWR.
- Router loaders accept a cache-aware function but don't require one.
- Whether `query` ships in v1 is open. Ship it later unless the eval tasks need it.

## 10. Forms

- Native first: `<form>`, `FormData`, the Constraint Validation API, and `:user-invalid` (Baseline widely 2026-05-02), so no "touched" state is needed.
- Controlled inputs only where the value drives other UI: `input({value: name, oninput: e => name.set(e.currentTarget.value)})`.
- Optional `form(schema, {onSubmit})` that accepts any Standard Schema v1 validator, with no validator dependency. Verified: zod 4.6.5, valibot 1.5.0 and arktype 2.2.5 expose `~standard`, and `issue.path` is `["email"]`. The module:
  - maps issues to `setCustomValidity`
  - sets `aria-invalid` and `aria-describedby`
  - focuses the first invalid field on submit
- Do not wrap dialog, popover, invoker commands or anchor positioning. Document the native patterns instead.

## 11. Styling

- `css` tagged template → `CSSStyleSheet.replaceSync` → `document.adoptedStyleSheets` (Baseline widely 2025-09-27), deduplicated per module.
- Scoping is donut scoping: `@scope ([data-c="Card"]) to ([data-c]) { p {…} }` (Baseline 2026-03-24). Verified in Chrome 153: Card's `<p>` is styled, and a nested Button's `<p>` is not.
  - ⚠ `&` inside `@scope` needs Chrome 143.
- Native nesting is Baseline widely (2026-06-11).
- No shadow DOM by default. No CSS module scripts (not in Safari).
- `data-c` is placed only on styled components. Debug identity stays out of the DOM (§12).

## 12. Context

- API: `createContext<T>(name, ...fallback: [] | [T])`, `provide(ctx, value: NoInfer<T>, fn)`, `use(ctx)`. Valid only during synchronous setup.
- A dev throw carries the fix: `No provider for context "Api". Wrap the subtree in provide(ApiContext, value, () => ...)`.
- Without `NoInfer`, a wrong value silently widens T. With it:
  ```
  m6(11,25): error TS2322: Type '"dim"' is not assignable to type '"dark" | "light"'.
  ```
- `capture()` reuses the owner after `await`. AsyncContext is Stage 2.
- App-wide singletons are plain module exports: greppable, and resolvable with go-to-definition.
- One copy per page: keep the runtime singleton on `globalThis[Symbol.for('fw')]` and throw `DUPLICATE_RUNTIME` if a second copy loads (Preact and Lit singleton warnings).

---

## 13. Errors and diagnostics

**Precedents**

| Project | What it does |
|---|---|
| React | 598 codes; prod `Minified React error #185` with a decoder page; nested-update limit of 50 |
| Angular | `NG0600`, with a versioned docs URL (`v{major}.angular.dev/errors/…`) |
| Rust | `--explain`; codes never reused |
| Vue | Recursion limit of 100, and the message names the component |
| Preact | Nameless "Cycle detected" (the anti-pattern) |
| Solid 2 rc.9 | About 50–60 **descriptive** codes (`STRICT_READ_UNTRACKED`, `REACTIVE_WRITE_IN_OWNED_SCOPE`…), an owner path (`in <App> › <TodoRow>`), a once-per-code footer pointing to `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`, `OBSERVE.diagnostics.capture()`, and `@solidjs/diagnostics` (`expectNoDiagnostics`, `assertBudget`, `globalThis.__SOLID_DIAGNOSTICS__`) |

**Code format: descriptive slugs, not `FW101`.**
- Anthropic's tool-design guidance (2025-09-11) says agents do much better with natural-language names than cryptic identifiers.
- A new framework has no prior for numeric codes.
- One slug serves as the runtime `TypeError` prefix, the `fw check` code and the docs anchor.
- Slugs are never reused. The first text line is self-contained: `[WRITE_IN_COMPUTED] Write to signal "a" inside computed "c". hint: … docs: <versioned URL>`.
- Event shape: `{code, severity, message, hint, docs, ownerPath, nodeName, loc, data, count}`. `loc` is the first user stack frame. Solid's events carry no location.

**Strict-read rule** (copies Solid's mechanism; MobX's inverted rule is rejected)
- MobX warns everywhere outside reactions and actions. Its maintainers refused to make that default-on (PR #2079), it has open false-positive issues (#4607, #3835, #3648), and severity escalation (#3634) was never merged.
- Measured on Solid rc.9:

  | Case | Warnings |
  |---|---|
  | Read in component body | 1 |
  | Helper called from body | 1 |
  | Child reads a props getter | 1, path `["<Parent>","<Child>"]` |
  | **Snapshot `{title: count()}`** | 1, reported in the parent |
  | Handler called after mount | 0 |
  | Handler dispatched synchronously in setup | 1 |
  | `untrack` | 0 |
  | Read after `await` | 0 |
  | **Direct `Comp(props)`** | **0** |
  | 100 reads | 100 warnings (no dedupe) |

- Implementation: a dev-only module variable `strictLabel`.
  - Set by the component wrapper and by control-flow builders.
  - Cleared on every computation run, in `untrack`/`peek`, and in the wrappers for handlers, refs and lifecycle callbacks.
- Do **not** label effect apply halves. That label caused 570 of 573 warnings per refresh in Pictelio, all intentional snapshots (Kobalte #723 hit the same).
- Deduplicate per (code, region, node, call site). Solid PR #3326 measured 97.6 ms vs 3.56 ms when warnings were emitted per leaf.
- Keep framework internals out of the region (`then` probes, style enumeration). Add a self-test that mounting every built-in yields zero diagnostics (Solid PRs #3263 and #3326; TanStack Query #11358 flooded app components).
- Offer a seed-from-accessor form for local state.
- ⚠ Proposal without prior art: `peek` emits an info-level acknowledgement so snapshots can be counted.

**Initial catalogue**

| Area | Codes |
|---|---|
| Reactivity | `WRITE_IN_COMPUTED` (throws, also in prod), `STRICT_READ_UNTRACKED`, `COMPUTED_SELF_READ` |
| Effects | `EFFECT_LOOP` (throws, also in prod; names the nodes), `EFFECT_WRITES_OWN_SOURCE`, `EFFECT_NO_DEPS` |
| Ownership | `NO_OWNER_EFFECT`, `EFFECT_LEAKED` (fails tests), `WRITE_AFTER_DISPOSE` |
| Lists | `DUPLICATE_KEY`, `ROWS_RECREATED` |
| Signals and props | `SIGNAL_COERCED`, `UNKNOWN_EVENT_PROP` |
| Context and runtime | `NO_PROVIDER`, `CONTEXT_OUTSIDE_SETUP`, `DUPLICATE_RUNTIME` |
| Accessibility | `INTERACTIVE_NO_NAME` |
| Deploy | `MODULE_BUDGET_EXCEEDED`, `IMPORT_NOT_PRELOADED` |

**Introspection**
- `window.__FW__` (dev only) is the stable contract: `graph(filter)`, `inspect(node|el)`, `why(node)`, `diagnostics()`, `componentOf(el)`.
  - The graph uses Angular's shape, `{nodes, edges: [{consumer, producer}]}`.
  - Prototype output: `[{"id":1,"kind":"signal","name":"count","owner":"Counter","value":2,"observers":[3,2]},{"id":2,"kind":"computed","name":"double","runs":3,"sources":[1]},…]`, and `why("double")` → `{"dependsOn":["count"],"triggers":["p#text"]}`.
- Optional adapter: Chrome DevTools MCP third-party tools via the `devtoolstooldiscovery` event. Angular ships its signal-graph and DI-graph tools this way. The feature is experimental and needs `--categoryExperimentalThirdParty=true`.
- Names are an optional `{name}`. Lazy capture of creation location costs about 10 µs per node (26 µs if formatted eagerly). ⚠ For 20k nodes that is about 200 ms in dev, so make it configurable.
- Keep component identity in WeakMaps. `data-*` debug attributes polluted `innerHTML` snapshots.
- The dev server forwards browser errors to the terminal.
- ⚠ Open: should prod carry full messages, or code plus args with a decoder?

---

## 14. Testing

**Facts**
- DOM emulators:
  - happy-dom 20.14.5. JS evaluation has been off by default since v20 (CVE-2025-61927).
  - jsdom 30.1.1.
  - linkedom breaks Testing Library `getByRole` (no `getComputedStyle`).
- Isolation: 8 files took **13.2 s** with process isolation and **1.8 s** with `--test-isolation=none`.
- A real browser is competitive:

  | Measure | Chromium (Playwright) | happy-dom | jsdom |
  |---|---|---|---|
  | Launch + first page | 415 ms | ~1.0 s env import | ~2.1–2.4 s env import |
  | `getByRole` on 1000 rows | 111 ms | 592 ms | 2038 ms |
  | Per test | 60 ms (page reused), 389 ms (fresh context) | 39–70 ms | |

- Excluded: Vitest 5 hard-depends on Vite (`^6.4 || ^7 || ^8`), and Playwright CT is Vite-based.
- ARIA snapshots (`mode:'ai'`) look like `- button "Increment" [active] [ref=e5]`. A 1000-row list is about 8.2k tokens, so scope snapshots.
- node:test gotchas:
  - `node --test test/` treats the directory as a module and fails.
  - Anything under `test/` runs as a test, including setup files. Load setup with `--import`.

**Verification ladder** (each rung exits 0 or 1)
1. `fw check` (about 1–2 s).
2. `node --conditions=development --import fw/testing/happy-dom --test --test-isolation=none`.
   - `fw/testing` provides `mount(Comp, props) → {root, dispose}`, `flush()`, `await settled()`, `failOn: 'warn'` by default, and an automatic `EFFECT_LEAKED` check on dispose (modelled on Deno's sanitizers).
   - An allowance must **assert that the code occurred** (cobracket #30), so it cannot decay into a silent mute.
   - Time: `mock.timers` (Date plus timers). IDs come from per-root counters.
3. Playwright Test against `fw dev`, reusing one page per file. Assert with `getByRole` and `toMatchAriaSnapshot`, and control time with `page.clock`.
4. Exploratory checks by the agent: Playwright CLI (the MCP README itself calls the CLI more token-efficient), Chrome DevTools MCP (heap snapshots for leaks), and `__FW__`.

**Agent reporter** (15 lines): silent on pass, one JSON line per failure. `diag` survives serialization as `error.cause.diag`.
```
{"test":"write in computed","at":".../broken.test.ts:4","code":"FW101","message":"[FW101] Write to signal \"a\" inside computed \"c\"","docs":"https://fw.example/e/FW101"}
{"pass":1,"fail":1}
```
The prototype used numeric codes; the spec uses slugs.

---

## 15. AI-agent priorities (the lens behind every section)

**Evidence**

Type errors dominate
- 94% of compile errors in LLM-generated TypeScript are type errors (PLDI 2025, arXiv 2504.09246). Type-constrained decoding cut them by 52–75%.
- TypeScript became #1 on GitHub in August 2025 (Octoverse).

Training priors go stale and mix versions
- GitChameleon 2.0: 48–51% on version-conditioned problems.
- "When LLMs Lag Behind" (arXiv 2604.09515): 42.55% of generated code executable without docs, 66.36% with them. Same-interface semantic modifications were the hardest case, at 58.19%.
- ICSE'25 (2406.09834): 70–90% deprecated-API use when the surrounding code is old-style.
- Zan et al. 2022: renaming pandas APIs dropped Codex from 18.88% to 1.47%.

Svelte 5 as a natural experiment (SvelteBench raw samples)
- The stale `on:click` prior lasted about 7–18 months, depending on the vendor.
- Paired runs on the same day showed version-matched docs removing it completely: `on:` usage went from 0.67 to 0, and pass rate from 0.13–0.18 to 0.86–0.89 for o3-mini, gpt-4o and o4-mini.
- Leaks from other signal libraries' idioms were rare: `.set(`/`.update(` appeared in 0.99% of samples.

Other findings
- Package hallucination: at least 5.2% (commercial models) and 21.7% (open models) of suggested packages don't exist (USENIX Security 2025).
- Frontier models saturate: 1.00 on SvelteBench, 97% on the Next.js evals.

**Ranked priorities**
1. Stable meaning of names. New semantics get a new name. Removed APIs become throwing stubs that name the replacement, plus a codemod.
2. No silent failures. Every likely misuse becomes a type error, a dev throw, or a diagnostic that names the fix.
3. A check the agent can run beats human conveniences.
4. Types checked by the stock compiler, not a template DSL.
5. Explicit and local over magical, but no hand-synced duplication such as dependency arrays.
6. One canonical way, and no false friends.
7. Context economy: API reference plus rules within about 8 KB.
8. Deterministic semantics that are identical in dev and prod.
9. Greppable prefixed names and explicit imports. No globals, no string registration.
10. Runtime state available as text.

Lower priority for agents than for humans: terse syntax, a gradual learning curve, ecosystem size.

---

## 16. Docs for agents and the pre-v1 eval gate

**Facts**
- Vercel (2026-01-27), on Next 16 APIs absent from training data:

  | Setup | Pass rate |
  |---|---|
  | Baseline | 53% |
  | Skill | 53% (not invoked in 56% of runs) |
  | Skill + explicit instruction | 79% |
  | 8 KB AGENTS.md docs index | **100%** |

- nextjs.org/evals: weaker models gain 13–16 points (Sonnet 5 went from 81 to 97).
- Next 16.2+ bundles its docs in `node_modules/next/dist/docs/` and writes a managed AGENTS.md block: "This is NOT the Next.js you know…".
- Code examples are the doc component that matters most: removing them dropped Qwen-32B from 0.66–0.82 to 0.22–0.39 (arXiv 2503.15231).
- llms.txt mostly helps retrieval.

**Recommendation**
- The package ships:
  - `docs/*.md`
  - `errors/<CODE>.md` plus `errors.json`, and `fw explain CODE` for sandboxed agents with no web access
  - a SKILL-style repair guide, linked once per code
- The scaffold writes:
  - an AGENTS.md block of 8 KB or less between markers, examples first, stating "your training data is wrong about this framework"
  - `CLAUDE.md` containing `@AGENTS.md`
  - tsconfig, `"type":"module"`, and check scripts
- Also publish llms.txt and a `.md` version of every docs page.

**Eval gate (before v1)**
- Nothing published measures API-surface variants.
- One runtime with thin API skins, so arms differ only in surface syntax.
- Arms:
  - **A:** `h.div` vs `h('div')`, with an optional reference JSX arm built inside the harness
  - **B:** `onclick` vs `onClick` vs `on:{click}`
  - **C:** Angular-exact names and semantics vs fresh names vs Angular names with divergent semantics
  - Also: microtask vs sync flush
- Conditions: no docs; passive AGENTS.md; docs plus a `fw check` and test loop.
- Metrics:
  - hidden behavioural tests, including timing and disposal
  - first-attempt tsc errors by code
  - regex-measured rate of leaked idioms (`onClick`, `className`, `useState`, `.value`, `load`/`loader`)
  - iterations to green, and tokens
- Models: at least 3 vendors plus an open-weight model plus a mid-tier model. Priors differ by vendor: GPT-5–5.4 wrote `on:` in about 80% of event tests, Claude 4+ in 0%.
- Power: about 250 samples per arm to detect 85% vs 75%. Paired design; about 25 tasks × 10 samples per model is the floor.
- Harness candidates: `@vercel/agent-eval` 2.3.0 (needs a Vercel sandbox), `web-codegen-scorer` 0.0.70, or a local SvelteBench-style runner.
- Feed recurring mistakes back into types, diagnostics and docs.

---

## 17. Conflicts resolved across notes

| Topic | Resolution |
|---|---|
| Disposal | String `dispose()`. `Symbol.dispose`, `DisposableStack` and `using` are Safari preview only and false on iOS (BCD 8.1.3); Explicit Resource Management is ES2027. No `esnext.disposable`. |
| moduleResolution | `nodenext`, plus a `.ts`-specifier check (not `bundler`) |
| Gate | `fw check`, not bare `tsc --noEmit` |
| Decorators | Pass tsc and the stripper, then fail as a SyntaxError. `NO_DECORATORS` is required. |
| Diagnostic codes | Descriptive slugs |
| Router | Navigation API plus History adapter, own matcher (not fallback-free, not a URLPattern runtime dependency) |
| Resource naming | `loader`, never `load`, including in routes |
| Event namespace | None in v1 |
| Stores | Deferred. If added, use a `DeepReadonly` view plus a single `update(draft => …)` (prototype errors TS2540/TS2339), never path-setter overloads. |
| Dates | Safari 27 released 2026-09-14 (the WebKit post is dated 09-17). ArrowJS 1.0.0 published 2026-03-20. |
| Node | `^24.12.0 \|\| >=26.0.0` |

## 18. Open questions

1. The eval outcomes for arms A, B and C and for flush timing. The flush model is the costliest decision to reverse.
2. Should `fw check` type-aware rules be default-on before TS 7.1 stable, or sit behind a flag? Re-test on the 7.1 beta (2026-10-06).
3. Real-device per-module cost: mid-range Android, Safari/iOS (Safari 27 rewrote its module loader), and Firefox warm loads. The budgets are provisional until then.
4. The worker story under import maps, which do not apply to workers. Should `fw check` validate that bare imports match the import map?
5. Screen-reader behaviour with intercepted navigations plus `ariaNotify` (risk of double announcements).
6. Do agents over-apply `peek`/`untrack` once warnings fail their tests? Does a snapshot-acknowledgement budget help?
7. Is prototype-swapping every signal for the `toPrimitive` trap acceptably cheap across engines?
8. Do the `query` and `form` modules ship in v1, and is a `toCustomElement` adapter needed at all?
9. Does prod carry full messages, or code plus args?
10. The source of the conflicting TS 7 overload-error re-test (suspected bin shadowing).