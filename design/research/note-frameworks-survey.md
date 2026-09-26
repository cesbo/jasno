# Survey of reactive UI frameworks for a no-build, function-component, signal-based TypeScript SPA framework

Research date: 2026-09-25. I took versions and dates from the npm registry that same day. The experiments ran in a scratch directory with TypeScript 7.0.2 (native) and 6.0.3 on Node 25.1.

## 0. Status snapshot (npm registry, 2026-09-25)

| Project | Stable | Pre-release | Needs a build for idiomatic use? |
|---|---|---|---|
| solid-js | 1.9.15 | 2.0.0-rc.9 (beta.0 on 2026-03-03, rc.0 on 2026-08-12) | JSX compiler; `@solidjs/html` / `@solidjs/h` work without a build |
| preact / @preact/signals | 10.29.8 / 2.11.2 | preact 11.0.0-rc.2 | no (with htm) |
| htm | 3.1.1 (2022-04) | – | no |
| lit / lit-html | 3.3.3 (2026-05-14) | – | no |
| lit-analyzer / ts-lit-plugin | 2.0.3 / 2.0.2 (2024-01-09) | – | tooling |
| vanjs-core / vanjs-ext | 1.6.1 (2026-07) / 0.6.3 (2025-06) | – | no |
| @arrow-js/core | 1.0.6 (1.0.0 on 2026-03-20) | – | no |
| alpinejs | 3.17.4 | – | no |
| mithril | 2.3.8 | 3.0.0-next.102 | no |
| uhtml | 5.0.9 (5.0.0 on 2025-08-05) | – | no |
| sinuous / s-js / hyperapp | 0.32.1 (2023) / 0.4.9 (2018) / 2.0.22 (2022) | – | no (all effectively dormant) |
| svelte | 5.57.1 | – | compiler |
| vue | 3.5.43 | 3.6.0-rc.9 (Vapor) | SFC compiler for Vapor |
| @angular/core | 22.2.0 | – | compiler |
| @qwik.dev/core | – | 2.0.0-beta.45 | optimizer |
| ripple | 0.4.7 (alpha) | – | compiler (`.tsrx`) |
| mobx | 7.0.5 (7.0.0 on 2026-07-30) | – | no |
| alien-signals | 3.2.1 | – | no |
| typescript | 7.0.2 (7.0 released 2026-07-08) | 7.1 dev | – |
| signal-polyfill (TC39) | 0.2.2 (2025-01) | – | – |

## 1. Per-framework notes

### Solid 1.x and 2.0 (RC)
- **Component model:** components run once. JSX compiles to template cloning plus fine-grained effects. In 2.0.0-rc.9 `createComponent` is literally `untrack(() => Comp(props || {}))`, so component bodies never subscribe their parent (I checked this in the dist).
- **Templating without a build:** `@solidjs/html` was rewritten for 2.0 as an AST runtime parser. It is CSP-safe and has a component registry (`html.define({ For, Show })`). It returns a single node or an array. `@solidjs/h` is the hyperscript option.
- **TS typing of templates:** `(strings: TemplateStringsArray, ...values: any[]) => JSX.Element`, so nothing inside a template is checked. The README lists these differences from JSX:
  - Reactive expressions must be wrapped by hand: `${() => a() + b()}`.
  - The runtime "automatically wraps functions passed to props of components with no arguments in getters". So `onClick=${() => ...}` is wrong and `onClick=${(e) => ...}` is right. This is a heuristic based on function arity.
  - Only callback refs work.
  - Editor diagnostics exist only through a VS Code extension ("Tagged JSX Tools").
- **Reactivity changes in 2.0** (from the migration guide):
  - Async is part of the graph: a memo can return a promise.
  - `Suspense` becomes `<Loading>`, `ErrorBoundary` becomes `Errored`, `SuspenseList` becomes `Reveal`.
  - `isPending(() => expr)` reports pending state. `action(function*)` plus `createOptimisticStore` handle optimistic updates.
  - Batching is deterministic and runs on a microtask. Reads do not see writes until `flush()`. I confirmed that `setCount(1); count()` returns 0 until `flush()`.
  - `createEffect(compute, apply)` is split into two phases, and cleanup is returned from `apply`. `onMount` becomes `onSettled`.
  - Store setters are draft-first (`setStore(s => { s.user.name = 'x' })`).
  - `<For keyed={false}>` replaces `Index`, and `For` children now receive accessors.
  - Renames: `mergeProps`→`merge`, `splitProps`→`omit`, `unwrap`→`snapshot`. `solid-js/web`→`@solidjs/web`, and the store now ships in `solid-js` itself.
  - A write inside a memo throws.
- **Agent tooling (the most advanced I found anywhere):**
  - Dev builds emit structured diagnostics with stable codes, about 60 of them: `STRICT_READ_UNTRACKED`, `REACTIVE_WRITE_IN_OWNED_SCOPE`, `EFFECT_WRITES_OWN_SOURCE`, `EFFECT_RELAY_TEAR`, `UNSTABLE_LIST_IDENTITY`, `IMMUTABLE_UPDATE_IN_STORE`, `HUGE_FAN_OUT`, `REACTIVITY_HALTED`, and others.
  - Each diagnostic carries an owner path such as `in <App> › <TodoList> › <TodoRow> › effect`.
  - The first report of each code prints `repair guide: node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`, a 622-line agent skill shipped inside the npm package.
  - `OBSERVE.diagnostics.subscribe()/capture()` is exported.
  - `@solidjs/diagnostics` (described as an "agent-consumable diagnostics harness") provides `captureArtifact`, `expectNoDiagnostics`, `assertBudget({ maxReruns, maxWastedRuns, scopes: { TodoRow: 1 } })`, JSONL export, vitest and Playwright adapters, and an `agent-loops` skill. That skill describes loops for generating code, then checking it against a budget.
  - I confirmed it locally: reading a signal and a props getter in a component body produced `STRICT_READ_UNTRACKED … in <Counter>` twice.
- **Borrow:** run-once components with an ownership tree, component bodies run untracked, split effects, writes in derivations treated as errors, and coded diagnostics shipped with a skill and a capture API.
- **Avoid:** props getters that break when destructured, arity heuristics, API renames (models trained on 1.x will write `Suspense`/`onMount`), and dependence on JSX.

### Preact + @preact/signals + htm
- **Model:** a VDOM that re-renders components. A signal object passed directly as a JSX child or attribute binds that DOM spot and skips the re-render. The result is two update paths, and the hooks rules still apply.
- **Signals core:**
  - `signal`, `computed`, `effect` (returns a dispose function; the callback may return a cleanup), `batch`, `untracked`, `.peek()`.
  - Signal options `{ name, watched, unwatched }`.
  - `createModel(factory)`: returned methods are "automatically wrapped as an action so updates stay batched and untracked", and the model's effects are disposed by `model[Symbol.dispose]()`.
  - `Show`/`For` utilities and devtools.
- **htm:** turns a tagged template into `h()` calls. Syntax: `<${Comp}>`, `<//>`, `...${props}`. It caches the parse per template string. `htm/preact` is typed as `(strings, ...values: any[]) => VNode`, so component props are not checked. It has not been published since 2022. In my test, `htm.bind` did not even type-check under `module: nodenext`.
- **Preact's no-build guide:** import maps with esm.sh `?external=preact`, and "Preact must be used only as a singleton".
- **Borrow:** `.peek()`, `watched`/`unwatched`, disposable models via `Symbol.dispose`, named signals.
- **Avoid:** the hybrid VDOM-plus-signals mental model.

### Lit / lit-html
- **Model:** `LitElement` classes re-run `render()`. lit-html parses each template once into a `<template>`, clones it, and updates only the "parts". There are no stateful function components.
- **Binding prefixes:** `attr=`, `.prop=`, `?bool=`, `@event=`. Directives include `repeat` (keyed lists), `ref`, `until`, `cache`.
- **TS typing:** you get a `TemplateResult`, and tsc checks nothing inside it. Checking requires lit-analyzer or ts-lit-plugin, both last published 2024-01-09. ts-lit-plugin is a tsserver plugin, and TypeScript 7.0 "does not ship with an API". `require("typescript")` in 7.0.2 exports only `version` and `versionMajorMinor`, which I checked, so these tools need TS 6 installed alongside.
- **Signals:** `@lit-labs/signals` 0.3.0 is a Labs package built on the TC39 polyfill. It offers a `SignalWatcher` mixin, a `watch()` directive for pinpoint updates, and an auto-watching `html`. The docs warn "there can be only one copy" of the polyfill.
- **Borrow:** static structure cloned once with only the holes live, and the explicit distinction between attribute, property, boolean and event bindings.
- **Avoid:** class components with decorators (decorators are not erasable) and untyped templates.

### Van.js 1.6 (+ van-x)
- **Model:** components are functions that run once and return real DOM. `van.tags` is a Proxy that yields tag functions `div(props?, ...children)`. State exposes `.val`, `.oldVal`, `.rawVal`, plus `van.derive`. A function passed as a child or prop is a binding that re-runs and replaces its DOM node. The core is about 1 kB.
- **Source-level observations:**
  - Cleanup is GC-style: bindings to disconnected DOM are swept on a 1000 ms timer (`gcCycleInMs`).
  - The docs advise "connect DOM trees before state changes" and "keep DOM construction synchronous".
  - A `derive` created outside a binding attaches to an always-connected sentinel, so it lives forever.
  - Errors inside bindings are `console.error`'d and swallowed; the previous value is returned.
  - Mutating an object or array in place is not detected; you must reassign it.
- **van-x:** adds `reactive()` proxies, `calc`, `list(container, items, fn)` (keyed when `items` is an object) and a diffing `replace()`. Caveats: don't alias sub-fields, deletes leave array holes, and you need `compact()` before serializing.
- **Types:** `Props = Record<string, PropValueOrDerived> & …` and `Tags = Record<string, TagFunc<Element>> & …`. Under TS 7.0.2 all of these type-check with no error: `a({ hreff: "/x" })`, `input({ value: 5 })`, `button({ onClick: 123 })`, `van.tags.dvi()`, `input({ value: State<number> })`. The event parameter is typed `any`.
- **Borrow:** the overall shape (tag functions returning real nodes, "a function means reactive") and the tiny core.
- **Avoid:** loose `Record` types, timer-based cleanup, swallowed errors, and bindings that replace whole nodes.

### ArrowJS 1.0
- **Status:** 1.0.0 on 2026-03-20, 1.0.6 in April. The repo moved to the standardagents org.
- **Pitch:** "the first UI framework for the agentic era". Three functions (`reactive`, `html`, `component`), under 5 kB, and docs that "fit in less than 5 percent of a 200k token context window". It ships an agent skill (`npx @arrow-js/skill`) and `@arrow-js/sandbox` (QuickJS/WASM) for running UI code an agent generated.
- **Templating:** `${() => expr}` is reactive and `${expr}` is static. Events use `@click`, lists use `.key(id)`, and the docs say to avoid destructuring props at creation time.
- **Community-reported problems (InfoQ):** bugs when modifying state inside watchers, glitches in mapped lists without keys, gotchas with nested reactive objects, and missing lifecycle hooks and refs.
- **Borrow:** small docs treated as a feature, and a shipped skill.
- **Avoid:** untyped templates and pitfalls from deep proxies.

### uhtml v5
The 5.0 rewrite (2025-08) has `html`/`svg` tags, `@event`, `.prop`, `?bool`, `ref` and `key`, plus bundled Preact-like signals built on alien-signals. The README says the "reactivity story" is still stabilizing and recommends v4 for production. Template contents are untyped.

### Alpine.js
Expressions live in HTML attributes as strings (`x-data`, `x-on`) and run on @vue/reactivity. Reads inside async code are not tracked. It is irrelevant for a TS SPA, but it illustrates the lesson that string expressions are invisible to tsc.

### Mithril
A VDOM with closure components, lifecycle hooks (`oninit`, `oncreate`, `onremove`) and keys. It redraws automatically only after its own event handlers, `m.request`, and routing, and "does not redraw after setTimeout, setInterval, requestAnimationFrame, raw Promise resolutions and 3rd party library event handlers". Implicit redraw rules like these are the classic trap where the demo works and real code breaks. Signals remove that class of bug.

### S.js, Sinuous, Hyperapp, Elm (foundational or dormant)
- **S.js:** `S.root(dispose)`, `S.data`/`S.value`, child computations disposed when the parent re-runs, `S.cleanup`, and `S.freeze` batching. It uses an atomic clock: "state is immutable until the tick completes". This is the ancestor of Solid's ownership model and of deferred reads.
- **Sinuous:** S.js-style observables with `html`/`h`. Dormant.
- **Hyperapp 2:** actions `(state, payload) => state`, effects as tuples, and `@hyperapp/html` tag functions.
- **Elm:** Model, View, Update, Msg.
- **Borrow:** named, batched, loggable "actions" make state changes auditable.
- **Avoid:** full TEA verbosity, which works against fine-grained updates.

### Svelte 5 (runes)
- A compiler is required. `$state` creates deep proxies; the other runes are `$derived`, `$effect` and `$props`.
- Documented caveats:
  - Destructuring gives non-reactive values.
  - Proxies break `structuredClone` and similar, so you need `$state.snapshot`.
  - A reassigned `$state` cannot be exported.
  - Effects track only synchronous reads; values read "after an `await` or inside a `setTimeout` … will not be tracked".
  - The docs discourage updating state inside effects.
- **Agent angle:** the official MCP server includes `svelte-autofixer`, which uses "static analysis to correct common generative AI pitfalls". That is evidence that models fall back to old syntax (Svelte 4) after an API change.

### Vue 3.5 / 3.6 Vapor
3.6 is still an RC (rc.9 on 2026-09-18) and 3.5.43 is `latest`. Reactivity was rebuilt on alien-signals in 3.6.0-alpha.1 (2025-07-12). Vapor is a compile-time opt-in (`<script setup vapor>`, `createVaporApp`) with no Options API. Takeaway: even Vue has moved to Solid-style compiled fine-grained output, and Vapor needs a compiler. `@vue/reactivity` can still be used on its own.

### Qwik 2
Still beta (2.0.0-beta.45 on 2026-09-22). Resumability depends on `$` boundaries processed by the optimizer, so it does not apply here.

### Angular signals (v22, June 2026)
- Signal Forms and `resource`/`rxResource`/`httpResource` are now stable.
- OnPush is the default change detection (the old default is renamed `Eager`). Zoneless has been the default since v21.
- It ships Agent Skills, a stable MCP dev server and experimental WebMCP. It requires TS 6.
- It depends on a compiler.
- Takeaways: async-aware primitives are now expected, and shipping agent skills is becoming standard.

### Ripple (trueadm)
`.tsrx` files, `track()` with `.value`, control flow via `@if`/`@for`/`@switch`/`@try`, scoped styles, and a compiler with a Vite plugin. It is at 0.4.7 alpha. The repo contains `CLAUDE.md`, `AGENTS.md` and skill directories. It is not no-build.

### MobX 7 (2026-07-30)
Proxies only; legacy decorators removed; namespaced APIs replaced by named exports (`observable.ref` → `observableRef`, `comparer.identity` → `compareIdentity`); `trace` removed; 13.96 KiB gzip. Takeaways: prefer named exports over dotted namespaces, and transparent proxies create identity and serialization hazards.

### New in 2025–2026
- **Covered above:** ArrowJS 1.0, Solid 2.0 RC, uhtml 5, Ripple.
- **Remix 3 beta** (beta.5 as of 2026-07-28): drops the React runtime for a forked Preact. State is a plain variable, and `this.update()` signals a change. It has a universal `on` prop with cancellation through `AbortController`, and keeps JSX. There are no signals.
- **Kasper.js:** class components with HTML directives (`@if`, `@each`), signals, cleanup through `AbortController`, and a 16 KB CDN build.
- **Spellcaster:** tag functions (`div({ className }, [...])`) on the TC39 polyfill, with `repeat(signal<Map>)` for lists.
- **TC39 Signals:** still Stage 1. It defines `Signal.State`, `Signal.Computed` and `Signal.subtle.Watcher`, and deliberately includes no effect. `signal-polyfill` is 0.2.2 from January 2025. Useful as an interop target, too immature to build on.

## 2. Cross-cutting footguns an agent will hit
1. **Static vs reactive reads look the same.** In Van, Arrow, Solid's `html`, and Solid's props, `x()` in a component body reads once and `() => x()` stays live. Types cannot tell the two apart, because both produce a valid value. Solid 2 handles this at runtime with `STRICT_READ_UNTRACKED`.
2. **Destructuring loses reactivity.** Documented in Svelte, Solid, Vue and Arrow.
3. **Using effects to derive state.** Svelte docs, Solid's `EFFECT_RELAY_TEAR` and `EFFECT_WRITES_OWN_SOURCE`, and Arrow's reported watcher bugs all point at this.
4. **Writes during derivation.** Solid 2 throws.
5. **Tracking is lost after `await`.** Svelte, Alpine.
6. **Leaks.** Van relies on timer-based GC; S.js and Solid use an ownership tree; Preact uses `Symbol.dispose`.
7. **List identity.** Arrow reports glitches without keys; Solid has `UNSTABLE_LIST_IDENTITY`; van-x leaves array holes.
8. **Duplicate module copies without a bundler.** Preact's singleton warning and Lit's "only one copy" of the polyfill. Solid keeps its shared channels on `globalThis[Symbol.for(...)]`.
9. **Magic heuristics.** Solid's `html` arity rule; Mithril's redraw rules.
10. **API churn versus training data.** The Svelte autofixer exists because of it, and Solid 2's renames will cause the same problem.
11. **Forgotten calls.** In TS 7.0.2, `if (count)` and `flag ? a : b` raise TS2774 ("did you mean to call it"), and `const n: number = count` fails. But `"Count: " + count` and `` `${count}` `` pass silently. Catching those needs a lint rule or a runtime check.

## 3. Templating for no-build TypeScript: experiments

**Setup.** `strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `lib: dom`. I compared VanJS 1.6.1, lit-html 3.3.3, htm 3.1.1 + Preact, and @solidjs/html rc.9 against a strict tag-function prototype:
```ts
type Reactive<T> = T | (() => T);
type Events<E extends Element> = { [K in keyof HTMLElementEventMap as `on${K}`]?: (ev: HTMLElementEventMap[K] & { currentTarget: E }) => void };
type Props<E extends Element> = { [K in Exclude<WritableKeys<E>, `on${string}`> & string]?: Reactive<E[K]> } & Events<E> & { class?: Reactive<string> };
declare function tag<K extends keyof HTMLElementTagNameMap>(n: K): (props: Props<HTMLElementTagNameMap[K]> | null, ...children: Child[]) => HTMLElementTagNameMap[K];
```

**Results (TS 7.0.2).**

| Mistake | Van | lit-html | htm | solid html | strict tag fn | hyperscript `h(tag, …)` |
|---|---|---|---|---|---|---|
| `hreff` attribute | silent | silent | – | – | error + "Did you mean to write 'href'?" | error |
| `value: 5` on input | silent | silent | – | – | error | error |
| React-style `onClick` | silent | – | – | – | error + "Did you mean 'onclick'?" | error |
| event parameter type | `any` | – | – | – | `PointerEvent & { currentTarget: HTMLButtonElement }` | same |
| misspelled tag `dvi` | silent | – | – | – | error | error |
| wrong component prop type | – | – | silent | silent | error (component called directly) | error |

**Finding 1: tagged templates cannot be checked by tsc.** TS does not type the literal strings of a tagged template: TypeScript issue #33304 has been open since 2019. I confirmed that `<const S extends TemplateStringsArray>` infers `string` for `s[0]`. All checking comes from editor plugins: lit-analyzer (stale) and Solid's VS Code extension. Agents run `tsc`, not VS Code, and TS 7.0 has no plugin or compiler API until 7.1.

**Finding 2: overloads make TS 7 error messages worse.**
- TS 7.0.2 prints only "The last overload gave the following error". If the children overload comes last, the message is misleading: "'hreff' does not exist in type 'Node | readonly Child[] | …'".
- TS 6.0.3 lists every overload.
- A Van-style union first parameter (`props | child`) still errors but loses the "Did you mean" suggestion.
- A single signature `(props: Props<E> | null, ...children)` gives the shortest error, with the suggestion, in both versions.

**Finding 3: parse cost is not the deciding factor.**
- htm: the first call costs about 37–50 µs per unique template (73–99 ms for 2000 templates). Cached calls are 5–20× slower than direct `h()` (9.6–12.1 ms vs 0.6–1.3 ms per 2000 calls).
- lit-html and solid html parse once and clone a `<template>`. For large static subtrees, cloning can beat creating each node with `createElement`.
- For an SPA with a few hundred templates this is at most tens of milliseconds, once.

**Option analysis.**
- **(a) Hyperscript `h('div', props, ...children)`.**
  - Pros: the shape agents know best (`React.createElement`). String tags are typed via `keyof HTMLElementTagNameMap`.
  - Cons: supporting `h(Comp, props)` needs overloads, which give the worst TS 7 messages. Calling components directly avoids this.
- **(b) Typed tag functions `div(props, ...children)`.**
  - Pros: the most tsc coverage. Every tag is a real symbol, so go-to-definition, find-references and rename work. It is plain JS, so codemods and AST tools work. There is nothing to parse and no second syntax to hallucinate.
  - Cons: closing `)` does not say what it closes, which is a bracket-balancing risk in deep nesting (mitigated by small components and a formatter). Tag names shadow common identifiers (`a`, `b`, `i`, `p`, `label`, `select`, `option`, `title`, and `var` is reserved), so use a namespace such as `h.div`. There is less training data than for JSX or HTML: Web-Bench shows React scoring best (pass@2 around 55–65% for Claude 3.7), Angular worst (5–40%), and HTML-like Vue/Svelte doing well on some models.
  - Van's implementation of this shape is loosely typed, which shows the value lies in the types, not the shape.
- **(c) Tagged templates.**
  - Pros: closest to the HTML/JSX that models have seen most, and the most compact for static markup.
  - Cons: untyped. The dialects conflict (`@click` in lit/uhtml/Arrow vs `onClick` in htm/solid; `<${C}>` and `<//>`), and each difference is a way to hallucinate. Attributes are strings, so grep and AST refactors cannot see them.
- **(d) Builder / fluent chains** (`div().class('x').on('click', f).append(...)`).
  - Typable, but element-specific attributes need either per-element method sets or a stringly `.attr()`.
  - The chain hides the tree's shape and depends on call order.
  - No modern reactive framework in this survey uses it, so there are no priors to lean on. Avoid.

**Recommendation: (b) typed tag functions.** Rules:
- Closed prop types derived from `HTMLElementTagNameMap` and `HTMLElementEventMap`.
- One call signature, no overloads.
- Components are plain typed functions called directly.
- One reactivity rule: a function or signal means live, anything else is static.
- Dev-mode diagnostics for static reads.

Example:
```ts
import { h, signal } from "fw";
export function Counter(props: { label: () => string; start?: number }) {
  const count = signal(props.start ?? 0);
  return h.button({ onclick: () => count.set(count() + 1), class: () => (count() > 5 ? "hot" : "") },
    props.label, ": ", count);
}
```
Rationale: an agent's main feedback loop is `tsc` plus tests. Typed tag functions are the only option where every attribute, event and component prop mistake shows up as a compiler error with a suggested fix, and they need no editor plugin. That matters because TS 7.0 has no plugin API.

IMPLICATIONS
- Primary authoring API: typed tag functions (h.div(props, ...children)), not tagged templates. Evidence: in my TS 7.0.2 run, every attribute, event and prop mistake raised an error in the strict tag-function prototype, while lit-html, htm and @solidjs/html raised none. TS cannot type template strings (TS #33304, open since 2019), and TS 7.0 ships no compiler or plugin API, so ts-lit-plugin can't run.
- Use exactly one call signature, `(props: Props<E> | null, ...children: Child[])`, and no overloads anywhere in the public API. Evidence: TS 7.0.2 reports only 'The last overload gave the following error' (which can be misleading); a union first parameter loses the 'Did you mean' suggestion; the single signature gave 'Did you mean to write href?' in both TS 6 and TS 7.
- Derive closed prop types from HTMLElementTagNameMap writable properties plus HTMLElementEventMap, never Record<string, …>, and type handlers as `Event & { currentTarget: E }`. Evidence: VanJS's Record-based types accepted `hreff`, `onClick: 123`, `value: State<number>` and the tag `dvi` with zero errors; the strict version caught all of them and inferred PointerEvent with a typed currentTarget.
- Expose tags through a namespace object (h.div, h.a) or explicit named exports, not a Proxy typed as Record<string, TagFunc>. This avoids shadowing `a`, `b`, `i`, `p`, `label` and `title`, avoids `var` (a reserved word), and makes misspelled tag names type errors. Evidence: VanJS types `van.tags.dvi` without error.
- Components are plain functions with typed props, called directly (Counter({...})). The runtime must run component bodies and control-flow branch/item factories untracked and under their own owner. Evidence: Solid 2's createComponent is exactly `untrack(() => Comp(props))`; direct calls avoid the overloads that `h(Comp, props)` needs.
- Apply one reactivity rule everywhere (children, attributes, props): a function or signal means live, any other value is static. No heuristics. Evidence: Van, Arrow and Solid html share this rule; Solid html's arity heuristic (zero-argument function props become getters, so `onClick=${() => …}` breaks) is an agent-hostile counterexample.
- Make signals callable getters (`count()` to read, `count` to pass as a reactive accessor), so a signal slots directly into the 'function means live' rule. Evidence: TS2774 catches `if (count)` and `flag ? a : b`, and assignments are type-checked. But `'x' + count` and template literals are not caught, so add a dev-mode check or lint for stringifying a signal.
- Type reactive props as accessors (`label: () => string`), so destructuring props stays safe. Evidence: destructuring losing reactivity is documented in Svelte ($state docs), Solid (STRICT_READ_UNTRACKED covers destructured props) and ArrowJS ('avoid destructuring props').
- Ship dev-mode structured diagnostics with stable codes, an owner path, and a repair guide per code, plus a programmatic capture/assert API for tests and agent loops. Evidence: Solid 2.0 RC emits about 60 codes (STRICT_READ_UNTRACKED, REACTIVE_WRITE_IN_OWNED_SCOPE, EFFECT_RELAY_TEAR, UNSTABLE_LIST_IDENTITY…) with `in <App> › <Row>` paths, points to a SKILL.md inside node_modules, and @solidjs/diagnostics offers captureArtifact, expectNoDiagnostics and assertBudget({maxReruns, maxWastedRuns}). I confirmed this locally with rc.9.
- Dev mode should warn on reactive reads in component bodies outside a tracking scope (a single documented escape via untrack/peek), throw on writes inside computed/derivations, and flag effects that write their own sources. Evidence: Solid 2 STRICT_READ_UNTRACKED and REACTIVE_WRITE_IN_OWNED_SCOPE (throws); the Svelte $effect docs discourage state updates in effects.
- Effects: return cleanup from the effect callback, and consider Solid 2's split `effect(compute, apply)`, which makes tracked reads explicit. Evidence: Solid 2 migration guide; Preact signals cleanup-return; S.cleanup.
- Lifetime: use an ownership tree with deterministic disposal (S.js/Solid style) plus `Symbol.dispose` on roots and models; never timer-based GC. Evidence: VanJS sweeps bindings on a 1000 ms timer and keeps derives made outside bindings alive forever; Preact createModel disposes via `model[Symbol.dispose]()`.
- Never swallow errors. An uncaught error in the reactive graph should surface through reportError and a coded diagnostic, with error boundaries as the recovery path. Evidence: VanJS console.errors and returns the previous value; Solid 2 raises REACTIVITY_HALTED and forwards to reportError.
- Lists: a keyed each(items, key, render) primitive with a key function required or strongly encouraged, and a dev warning when rows are recreated for equivalent data. Evidence: ArrowJS users reported glitches without keys; Solid 2 has UNSTABLE_LIST_IDENTITY; van-x list() leaves array holes.
- Async should be first-class (resource or async computed with pending/error state). Document and diagnose that reads after `await` are not tracked. Evidence: Solid 2 async memos, isPending and Loading; Angular v22 made resource/httpResource stable; the Svelte and Alpine docs both warn that async reads are untracked.
- No-bundler hazard: keep runtime singletons on globalThis[Symbol.for('fw')] and fail with a coded error when two framework copies load. Evidence: Preact 'must be used only as a singleton'; Lit signals 'there can be only one copy' of the polyfill; Solid shares channels via Symbol.for.
- Own a small push-pull signal core (alien-signals style) or depend on alien-signals 3.x; do not build on the TC39 polyfill. Evidence: TC39 Signals is still Stage 1 and signal-polyfill is 0.2.2 from January 2025; alien-signals underpins Vue 3.6 and uhtml 5.
- Don't make correctness depend on TS language-service plugins or the compiler API. Everything must be caught by plain `tsc`. Evidence: TS 7.0 (2026-07-08) ships no API; `require('typescript')` in 7.0.2 exports only version fields; lit-analyzer was last published 2024-01-09.
- Treat API stability and training-data drift as design constraints: use flat named exports, avoid renames, and ship an agent skill, llms.txt and compact docs inside the npm package. Evidence: Svelte needed an MCP autofixer for outdated syntax; Solid 2 renamed Suspense→Loading and onMount→onSettled; MobX 7 moved to named exports; ArrowJS markets docs under 5% of a 200k context; Angular v22 ships Agent Skills.
- Prefer explicit, named, batched writes (actions) for testability and logging. Evidence: Preact createModel wraps methods as batched, untracked actions; Solid 2 action(); Elm/Hyperapp pure update functions.

OPEN
- Event prop naming: DOM-lowercase `onclick` (mechanically derived from HTMLElementEventMap, and TS suggests the fix for `onClick`) vs React-style `onClick` (strongest model prior, but multi-word names like onPointerDown can't be derived mechanically) vs an `on: { click }` object. Needs an agent eval.
- Tag-function ergonomics: require `null`/`{}` as the props argument on every call (best TS 6 and TS 7 errors), or accept a props-or-child union like VanJS (shorter code, weaker errors)? Could a future TS 7.x release fix the overload error regression and change the answer?
- Batching semantics: Solid 2 style (reads don't see writes until microtask flush, deterministic but surprising) vs Preact/alien-signals style (a read right after a write sees the new value)? Which produces fewer agent mistakes?
- Deep reactive stores (proxies with draft setters, as in Solid 2 or van-x) vs signals-only plus immutable data. Proxies bring identity and serialization hazards (Svelte $state.snapshot, van-x noreactive).
- Is it worth an optional html`` adapter for HTML-heavy static markup, given it would be untyped? (Default answer: no, per YAGNI.)
- Do agents actually succeed more often with typed tag functions (less training data, full tsc feedback) than with JSX- or HTML-like text? This needs a Web-Bench-style eval run with our docs and skill loaded.
- Should the diagnostic code format and capture API align with Solid 2.0's (which may become a de facto convention), and when will Solid 2.0 go final (rc.9 as of 2026-09-18)?
- TS 7.1 is expected to ship a new, different API. Could that re-enable template type-checking plugins, and should the spec stay independent of it regardless?
- Build the signal core in-house (full control over diagnostics and ownership) or depend on alien-signals 3.x (proven, underpins Vue 3.6)?

SOURCES
- SolidJS 2.0 Beta: First-Class Async, Reworked Suspense and Deterministic Batching (InfoQ): https://www.infoq.com/news/2026/05/solidjs-2-async/
- Solid 2.0 migration guide (solidjs/solid, next branch): https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/MIGRATION.md
- npm registry: solid-js (2.0.0-rc.9; skills/reactivity-diagnostics/SKILL.md inspected locally): https://registry.npmjs.org/solid-js
- npm registry: @solidjs/diagnostics (agent-consumable diagnostics harness; README and agent-loops skill inspected): https://registry.npmjs.org/@solidjs/diagnostics
- Vue core releases (3.6.0-rc.9, 3.5.43): https://github.com/vuejs/core/releases
- Vue 3.6 RC and Vapor Mode: status, limits (TODOvue): https://todovue.blog/blog/vue-3-6-rc-vapor-mode-status-limits-evaluation-2026.en/
- Ripple - the elegant TypeScript UI framework: https://github.com/trueadm/ripple
- TC39 proposal-signals: https://github.com/tc39/proposal-signals
- VanJS home: https://vanjs.org/
- VanX docs: https://vanjs.org/x
- VanJS advanced topics: https://vanjs.org/advanced
- ArrowJS home: https://www.arrow-js.com/
- ArrowJS repository: https://github.com/justin-schroeder/arrow-js
- ArrowJS Reaches 1.0, Recast as the First UI Framework for the Agentic Era (InfoQ): https://www.infoq.com/news/2026/06/arrowjs-v1-agentic/
- Is ArrowJS Really the UI for the Agentic Era? (KDnuggets): https://www.kdnuggets.com/is-arrowjs-really-the-ui-for-the-agentic-era
- Lit releases: https://github.com/lit/lit/releases
- lit-analyzer / ts-lit-plugin repository: https://github.com/runem/lit-analyzer
- Lit docs: Signals: https://lit.dev/docs/data/signals/
- Announcing TypeScript 7.0: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- Announcing TypeScript 7.0 RC: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/
- TypeScript issue #33304: Type safety with TemplateStringsArray and tag functions: https://github.com/microsoft/TypeScript/issues/33304
- Preact Signals repository: https://github.com/preactjs/signals
- @preact/signals-core README (createModel, effect cleanup, options): https://raw.githubusercontent.com/preactjs/signals/main/packages/core/README.md
- Preact: No-Build Workflows: https://preactjs.com/guide/v10/no-build-workflows/
- Preact releases: https://github.com/preactjs/preact/releases
- uhtml repository: https://github.com/WebReflection/uhtml
- htm repository: https://github.com/developit/htm
- Svelte docs: $state: https://svelte.dev/docs/svelte/$state
- Svelte docs: $effect: https://svelte.dev/docs/svelte/$effect
- Svelte MCP overview: https://svelte.dev/docs/mcp/overview
- Google Releases Angular v22 (InfoQ): https://www.infoq.com/news/2026/08/angular-v22-released/
- Qwik releases: https://github.com/QwikDev/qwik/releases
- Mithril auto-redraw system: https://mithril.js.org/autoredraw.html
- Alpine.js reactivity: https://alpinejs.dev/advanced/reactivity
- S.js repository: https://github.com/adamhaile/S
- alien-signals repository: https://github.com/stackblitz/alien-signals
- Sinuous repository: https://github.com/luwes/sinuous
- Hyperapp repository: https://github.com/jorgebucaran/hyperapp
- The Elm Architecture: https://guide.elm-lang.org/architecture/
- MobX 7.0.0 release notes (newreleases.io mirror): https://newreleases.io/project/github/mobxjs/mobx/release/mobx@7.0.0
- MobX releases: https://github.com/mobxjs/mobx/releases
- Remix 3 Beta Preview Ditches React (InfoQ): https://www.infoq.com/news/2026/07/remix-3-beta-preview/
- Kasper.js repository: https://github.com/eugenioenko/kasper-js
- Spellcaster repository: https://github.com/gordonbrander/spellcaster
- The Lightweight JavaScript Framework Renaissance of 2026 (DEV): https://dev.to/eugenioenko/the-lightweight-javascript-framework-renaissance-of-2026-4ee0
- Web-Bench: A LLM Code Benchmark Based on Web Standards and Frameworks (arXiv 2505.07473): https://arxiv.org/html/2505.07473v1