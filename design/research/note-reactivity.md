# Fine-grained reactivity in 2026: research notes for the signal-system spec

Checked on 2026-09-25 against the npm registry, GitHub sources and package tarballs. Experiments ran on Node v25.1.0 and TypeScript 7.0.2. Scratch files are in `/tmp/claude-1000/-home-and-ff/96b9f726-1e37-4313-9d48-852096c2ca84/scratchpad/exp/`.

## 0. Recommendations at a glance

| Decision | Recommendation |
|---|---|
| Algorithm | Push-pull (alien-signals style): push dirty/pending flags down the graph, pull recomputation on read. Dependency lists are doubly linked. The core has no recursion. |
| Computeds | Lazy and cached. Glitch-free by construction. |
| Equality | `Object.is` by default. `equals` option. `equals: false` means always notify. |
| Write visibility | **Read-your-writes**: after `set()`, reads return the new value immediately. No Solid-2.0-style stale reads. |
| Effect scheduling | Effects and DOM bindings are queued and flushed in a **microtask**, so batching is automatic everywhere, including after `await`. `flush()` drains the queue synchronously. No `batch()` API. Within a flush: bindings first (owner order), then user effects. |
| Writes in computeds | Always **throw**, in dev and in prod. Precedents: Angular NG0600, Solid `REACTIVE_WRITE_IN_OWNED_SCOPE`. |
| Writes in effects | Allowed. A self-write re-runs the effect until it is stable. Dev warns `EFFECT_WRITES_OWN_SOURCE`. A loop cap throws and names the effects involved. |
| Writable derived state | `linked()`, like Angular's linkedSignal or Solid 2's function-form createSignal. It is the sanctioned replacement for effects that copy state. |
| untrack | `untrack(fn)` plus `sig.peek()`. |
| Ownership | Owner tree. Roots created inside an owner are owned by default. Effects return their cleanup. `onCleanup()` works in setup. Each owner and each effect run exposes an `AbortSignal`. Creating an effect or cleanup without an owner is a dev error. |
| Errors | A computed caches the error and rethrows it on every read (TC39 semantics). An effect error goes to the nearest owner's `catchError` handler, otherwise to `reportError()`. The rest of the system keeps running. |
| Async | `resource({ params, load })` modelled on Angular: `params` is tracked and synchronous, `load(params, { signal })` is untracked and async. It aborts the previous request and drops stale results automatically. State is a discriminated union. No Suspense or transitions in v1. |
| Stores | v1 uses **immutable values in signals**, keyed lists with per-row item signals, and `selector()`. No Proxy deep stores in v1. |
| Lists | `each(list, { key }, (item: Read<T>, index: Read<number>) => …)`. A key is required. The callback has the same shape in keyed and index modes. The DOM diff trims prefix and suffix, builds a key map, then uses LIS. It uses `moveBefore` when the browser supports it. |
| Introspection | `inspect()`, `graph()` and `why()`. Stable diagnostic codes and a capture API for tests. An in-page DevTools AI tool. Dev builds record creation locations. |

## 1. State of the art (versions checked)

### TC39 Signals
- Still **Stage 1**. It was presented for Stage 1 in 2024-04 and "Algorithms for Signals" in 2024-06. It does not appear in the Stage 2 list. The last commits to the repo are from 2025-08-11. `signal-polyfill` is at 0.2.2, published 2025-01.
- API:
  - `Signal.State(v, {equals})` with `get()`/`set()`.
  - `Signal.Computed(fn, {equals})`: lazy, cached, glitch-free.
  - `Signal.subtle`: `untrack`, `currentComputed`, `introspectSources`/`introspectSinks`, `hasSinks`/`hasSources`, `Watcher(notify)`, and `watched`/`unwatched` hooks.
  - Default equality is **`Object.is`**.
- Semantics:
  - Writes are synchronous and take effect immediately. Batching is left to frameworks.
  - `notify` runs synchronously inside `set()`. It may not read or write any signal; the polyfill throws.
  - A computed that throws caches the error and rethrows it until a dependency changes.
  - Effects are deliberately left out. The README's example effect schedules with `queueMicrotask`.
  - The README calls `untrack` unsound and says to "discourage" it.
- The polyfill **allows writes inside a Computed**; I checked this.
- Performance: in the 2026-09-19 benchmark snapshot the polyfill is 3.3× to 10.5× slower than the fastest engine. Recommendation: align with its semantics, but do not depend on the polyfill.
- AsyncContext is still Stage 2. It will be what eventually allows tracking and ownership to survive an `await`.

### alien-signals
- Version 3.2.1, 2026-05-14. It is push-pull, drawing on Vue 3's propagation, Preact's doubly linked lists, Svelte's inner-effect scheduling and Reactively's graph coloring. The core uses no Array/Set/Map and no recursion.
- `createReactiveSystem({update, notify, unwatched})` exposes `link`/`unlink`/`propagate`/`checkDirty`/`shallowPropagate`. It is small: about 6.6 KB of unminified ESM.
- Other exports: `signal`, `computed`, `effect` (can return a cleanup), `effectScope`, `trigger`, `startBatch`/`endBatch`, `getActiveSub`/`setActiveSub`.
- Adopted by Vue 3.6 and XState.
- Fastest overall in the benchmark (details below).
- **Silent behaviours I verified in 3.2.1**, all of which an agent-facing layer must fix:
  1. A computed that throws raises the error on the first read and **returns `undefined` on the second read**. The error is swallowed.
  2. Equality is `!==`, so setting `NaN` to `NaN` re-runs effects.
  3. An effect that writes its own dependency is **silently not re-run**. The effect saw 0 and the signal is now 1.
  4. Effects flush synchronously on every write outside a batch.

### Preact signals-core
- Version 1.14.4, 2026-07.
- Internals: global and per-signal version numbers, lazy computeds that check sources in order, and one reusable "quad-linked" node per dependency edge.
- Batches are synchronous. Reading inside a batch sees the new value.
- Computeds cache errors and rethrow them (verified).
- Effect self-writes re-run until stable; more than 100 iterations throws `"Cycle detected"`, which carries no names.
- 1.14.0 stopped A→B→A batches from triggering updates. 1.14.4 fixed version monotonicity when a batch reverts a write.
- `createModel` and `action` (batched and untracked) were added in 1.13. `name` options feed `@preact/signals-debug` 1.5.0.

### Solid 1.x vs 2.0
- Solid 1.9.15 is the stable release. `solid-js@2.0.0-rc.9` and `@solidjs/signals@2.0.0-rc.9` were published 2026-09-18, and the API is "frozen barring showstoppers".
- Changes in 2.0:
  - **Microtask batching, and reads stay stale until flush.** After `setCount(1)`, `count()` still returns 0 until the microtask runs or `flush()` is called (verified). `batch` is removed.
  - **Split effects**: `createEffect(compute, apply)`. The compute half tracks; the apply half is untracked and returns the cleanup. The single-argument form is an error.
  - **No writes under an owned scope.** This covers components, memos and even the body of `createRoot`. It throws `REACTIVE_WRITE_IN_OWNED_SCOPE` (verified). Opt out with `ownedWrite: true`.
  - **Warnings for top-level reads in a component body** (`STRICT_READ_UNTRACKED`).
  - `createRoot` is owned by its parent by default. Detaching is explicit with `runWithOwner(null, …)`.
  - A function passed to `createSignal` makes a **writable memo**.
  - `createMemo` can return a Promise or AsyncIterable. This replaces `createResource`. It works with `<Loading>`, `isPending`, `latest`, `refresh`, `affects`, `action(function*)`, optimistic primitives and built-in transitions with "holds" and "lanes".
  - Memos are eager by default; `lazy: true` defers the first compute and autodisposes. There is an `unobserved` callback.
  - Lists: `<For keyed | keyed={false} | keyed={fn}>`, where the callback's argument types change with the mode. Also `<Repeat>`. `indexArray` is folded into `mapArray`.
- Solid 2.0 is now explicitly aimed at AI agents:
  - `CHEATSHEET.md` starts with an "AI codegen warning" and says props-as-accessors mistakes are "the single most common AI-generated bug".
  - The package ships `skills/reactivity-diagnostics/SKILL.md`, which maps each stable code to its repair.
  - `@solidjs/diagnostics` (2.0.0-rc.2) has `captureArtifact`, `expectNoDiagnostics`, `assertBudget({maxReruns, maxWastedRuns})`, Vitest matchers, and an `agent-loops` skill with three loops: generation, acceptance and attribution.
  - `DEV.getSources/getObservers/getChildren/getParent`, and an opt-in attribution engine that prints why-run chains.
  - The full RFC is about 150 KB. The async RFC alone is about 26 KB, which shows how much conceptual surface the async model has.

### Vue 3.6
- `@vue/reactivity@3.6.0-rc.9`, 2026-09-18; stable is still 3.5.43.
- It is a rewrite ported from alien-signals (PR #12349, merged 2024-12-02). The PR reports about 13% less memory and computed reads up to 30× faster in large graphs, with no public API changes.
- Still has `onTrack`/`onTrigger` debug hooks.
- The `reactive()` docs list its limitations themselves: primitives are not supported, the whole object cannot be replaced, and it is "not destructure-friendly". They recommend `ref()` as the primary API.

### Angular (v22.2.0; v22 released 2026-06-03)
- `signal()` has `.set`/`.update`. `computed` is lazy. Equality defaults to `Object.is` (`defaultEquals`, confirmed in source). `untracked`.
- Writing in a `computed`, a template or a `linkedSignal` computation throws **NG0600**.
- v19 removed `allowSignalWrites`, so effects may write. Component effects run during change detection, before their component is checked; root effects run separately, first described as a microtask.
- The docs say to "avoid using effects for propagation of state changes" and point to `afterRenderEffect` phases for DOM work.
- `linkedSignal`: a shorthand form, or `{source, computation(newSource, previous)}`.
- `resource`, `rxResource` and `httpResource` are **stable in v22**:
  - `params` is tracked and `loader({params, abortSignal})` is async.
  - The previous request is aborted automatically.
  - Status is `idle|loading|reloading|resolved|error|local`, with `hasValue()` as a type guard, plus `reload()` and local `set()`.
  - v22 adds `debounced`.
- In dev mode Angular registers **in-page AI tools**, `angular:signal_graph` and `angular:di-graph`, through the Chrome DevTools `devtoolstooldiscovery` event. The tool returns `{nodes: [{kind, value, label, epoch}], edges: [{consumer, producer}]}`.

### MobX 7 (7.0.0 released 2026-07-30; now 7.0.5)
- Proxies are always on; the ES5 fallback and legacy decorators were removed.
- The `trace` API was removed. `getDependencyTree`, `getObserverTree` and `spy` remain.
- `configure` still has the strictness flags that matter here:
  - `enforceActions`
  - `computedRequiresReaction`
  - `observableRequiresReaction` ("warn if observables are accessed outside a reactive context")
  - `reactionRequiresObservable` ("warn if you create a reactive context without accessing any observable")

### S.js
- Version 0.4.9, last published 2022.
- "Atomic clock" model: within a tick all signals are immutable, and writes made during the tick are deferred to its end. Scheduling two different values for one signal in the same tick is an error.
- Child computations are disposed automatically when their parent re-runs. This is where the ownership-tree idea comes from.
- `S.data` always notifies; `S.value` compares values.

### Benchmark (js-reactivity-benchmark snapshot, 2026-09-19, M3 Pro, Node 25.9)
Numbers are the geometric mean of slowdown relative to the fastest engine, per workload family: kairo / mol / s / dynamic / cellx.

| Engine | kairo | mol | s | dynamic | cellx |
|---|---|---|---|---|---|
| alien-signals 3.2.1 | 1.02 | 1.33 | 1.02 | 1.00 | 1.00 |
| Preact | 1.20 | 1.30 | 1.31 | 1.29 | 1.45 |
| Vue 3.5 | 2.05 | 1.31 | 1.50 | 1.70 | 2.79 |
| Angular | 2.93 | 1.35 | 2.39 | 2.70 | 2.26 |
| SolidJS | 4.07 | 1.58 | 2.92 | 3.54 | 1.84 |
| MobX | 3.68 | 1.36 | 3.66 | 2.51 | 3.93 |
| TC39 polyfill | 6.19 | 1.41 | 3.63 | 10.45 | 3.28 |

## 2. Semantics to decide

### 2.1 Push-pull vs push
**Options.**
- Pure push with topological order, as in MobX's two-pass counters or height sorting.
- Pure pull with version numbers (Preact).
- Push-pull with coloring (Reactively, alien, Vue 3.6, Solid 2): writes push `Pending`/`Dirty` flags, and reads pull through `checkDirty`.

**Pick push-pull.** It is lazy, glitch-free, and the fastest measured.

Ladder note: do not write the graph core. Build on alien-signals' `createReactiveSystem()`, which its README invites and which Vue and XState did. I prototyped the recommended surface on it in 78 lines (see §5), which confirms that the silent behaviours listed above can be fixed in the surface layer.

### 2.2 Glitch-freedom and lazy computeds
Computeds are lazy and cached, and they are pulled in dependency order. Effects run only after propagation finishes, so no effect ever sees a half-updated graph.

Lazy should be the default, as in TC39. Solid 2 is eager by default. An unobserved computed should drop its dependency links when it loses its last subscriber (alien's `unwatched`) so it can be garbage-collected.

### 2.3 Equality
Use `Object.is`, as TC39 and Angular do. Preact and alien use `!==`, which re-notifies on `NaN`.

Provide `equals` and `equals: false`. Also ship a `shallowEqual` helper for computeds that return fresh arrays or objects. Solid's `UNSTABLE_MEMO_OUTPUT` diagnostic exists because this pattern is common.

### 2.4 Write visibility, batching and effect scheduling
Three models exist:
- **(A) Sync flush at the end of the outermost batch.** Used by Preact, MobX, alien and Solid 1.x. Stack traces connect the write to the effect, and tests need no flush. The downside: unbatched writes after an `await` expose torn intermediate state to side-effecting effects. The TC39 README names exactly this soundness risk. Those failures are *silent*.
- **(B) Writes are immediate; effects run on a microtask with a `flush()` escape.** Used by Vue watchers and render, Svelte 5, Angular root effects, and the TC39 example. It coalesces everything, including after `await`. A test that asserts on the DOM without flushing fails *loudly and deterministically*.
- **(C) Writes are deferred too, so reads are stale until flush.** Used by Solid 2. Solid's own cheatsheet lists this as an AI footgun (`setX(v); x()` returns the old value).

**Recommend B.** The rule is one sentence: *state changes are immediate; side effects run on the next microtask*. It matches where the mainstream converged: Vue, Svelte 5, Angular and Solid 2 all defer. It also keeps the door open for transitions later. Switching sync to async after release is a breaking change, which Solid had to take in a major version.

Drop `batch()`; coalescing is automatic. Keep one escape hatch, `flush()`, as Solid 2 did.

Mitigate B's weakness, the loss of causality in errors: in dev, lazily capture the stack of the first write that scheduled each effect, and attach it as `error.cause` to anything that effect throws.

Order within a flush: computeds are pulled as needed, then DOM bindings run parent-first, then user effects run post-DOM so they can measure layout. This mirrors Angular's `afterRenderEffect` and Solid's render effects vs effects.

### 2.5 Writes inside computeds, effects and setup
- **Computed:** always throw, with a coded message that names the signal and the computed. Checking is one branch on the active node.
- **Effect:** allowed. A self-write re-queues the effect until it converges; alien's silent skip is the wrong default. Warn `EFFECT_WRITES_OWN_SOURCE`, with the same text Solid uses: "the written value is a function of what the effect reads, so it is a memo". Cap at about 100 rounds and throw `EFFECT_LOOP` listing the effect names. Preact's "Cycle detected" carries no names.
- **Setup (component body):** warn on writes to signals *not created in this setup*. Solid throws on all of them, which forced it to add an `ownedWrite` escape.

Provide `linked(source | fn)`, a writable derived signal that resets when its source changes, as the fix for the "copy a prop into local state with an effect" pattern. Solid calls that pattern `EFFECT_RELAY_TEAR`, Svelte's autofixer calls it `assign-in-effect`, and the Angular docs warn against it.

### 2.6 untrack
Provide `untrack(fn)` and `peek()`. Their main job is to make intentional one-time reads explicit, which silences the setup-read warning in §3. Do not add extra warnings on `untrack` itself.

### 2.7 Ownership, disposal and cleanup
- Every component, branch and list row is an owner. Effects and computeds created inside an owner are disposed with it. Disposal unwinds children first, then LIFO cleanups (Solid 2 RFC 02).
- Roots created inside an owner are owned by default; detaching is explicit.
- An effect returns its cleanup, the convention LLMs know from React, Preact and alien. `onCleanup()` is available during setup.
- **Each owner and each effect run carries an `AbortSignal`**, delivered as `effect(({signal}) => …)`. This is the platform-native form of cleanup: `addEventListener(t, f, {signal})` and `fetch(url, {signal})` need no manual teardown. An explicit context parameter also survives `await`, while an ambient "current owner" does not.
- Dev errors: `NO_OWNER_EFFECT` and `NO_OWNER_CLEANUP`, as in Solid.
- Also warn when a signal owned by a disposed owner is written; this catches the "fetch resolved after unmount" race.

### 2.8 Error propagation
- A computed caches the error and rethrows it on read (TC39 and Preact semantics; alien's `undefined` must be fixed).
- An effect error goes to the nearest owner's `catchError(fn, handler)`, otherwise to `reportError()`, which reaches `window.onerror` where monitors and browser-automation agents already listen. The effect stays subscribed so a later state fix can heal it.
- Do not halt the whole system the way Solid 2's `REACTIVITY_HALTED` does. In my experiment a single bad cleanup value halted all further updates.
- Every dev error message should carry: the code, the owner path (`<App> › <TodoRow> › effect "name"`), the node's source location, and the write that caused the run.

### 2.9 Async
The models:
- Solid 2 lets any computed be async, with holds, lanes and transitions. Powerful, but a lot of surface.
- Solid 1 had `createResource` with Suspense and `startTransition`.
- Angular has `resource`, where tracked params and untracked loader are separate.

**Recommend Angular's shape.** Splitting a synchronous, tracked `params` from an untracked async `load` removes a whole class of bug by construction. Solid needs a V8-only runtime check (`UNTRACKED_READ_AFTER_AWAIT`) to catch the same mistake.

- The previous load is aborted automatically when `params` changes.
- A version counter drops stale results even if the loader ignores the abort.
- `state()` is `{status:'idle'|'loading'(previous?)|'ready'(value)|'error'(error)}`. Also `value()`, `hasValue()`, `reload()`, `set()`.
- Types reject async computeds and async effects; checked with TS 7.0.2 in §5.
- Suspense and transitions are out of scope for v1; revisit together with AsyncContext.

### 2.10 Deep reactive stores vs immutable values
Problems with Proxy stores:
- `proxy !== raw`, and `new Set([raw]).has(proxy)` is false (verified).
- `structuredClone(proxy)` throws `DataCloneError` (verified).
- Destructuring loses reactivity (Vue's own docs).
- Mixing paradigms is common enough that Solid added `IMMUTABLE_UPDATE_IN_STORE` for spreads written into stores.

Immutable values in signals are JSON-safe and snapshot for free. They match the largest training corpus (React), and native ES2023 methods make updates cheap to write: `with`, `toSorted`, `toSpliced`.

Get the fine grain back where it matters:
- Keyed `each()` updates a row's item signal in place when the key is the same but the object is new. Refetched data therefore patches rows instead of recreating them, which avoids Solid's `UNSTABLE_LIST_IDENTITY` by construction.
- `selector(source)` gives O(1) "is this row selected" updates (Solid's `HUGE_FAN_OUT` case).
- Leaf bindings compare with `Object.is`.

Defer a Proxy `store()` until profiling demands it.

### 2.11 Keyed lists: mapArray vs indexArray
- `mapArray` means rows are stable per key and the index is reactive. `indexArray` means rows are stable per slot and the item is reactive.
- Solid 2 merged both into `For keyed`, but the callback's argument types change with the mode, and the RFC says to "avoid dynamic boolean keyed".
- **Pick a uniform callback:** `(item: Read<T>, index: Read<number>)` in every mode, plus `repeat(n, i => …)` for ranges.
- **A key is required**; duplicate keys are a dev error.
- DOM algorithm: trim common prefix and suffix, build a key map, then place with LIS for minimal moves (Vue 3's `getSequence`). The simpler alternative is udomdiff's heuristic, which Solid's `reconcileArrays` is a "slightly modified version of".
- Use `Element.moveBefore` when available; it preserves focus, iframes, animations and dialog state. It ships in Chrome/Edge 133+ and Firefox 144+, and not in Safari. Fall back to `insertBefore`.

## 3. Agent failure modes and how to make them impossible or loud

| # | Mistake (evidence) | Prevention |
|---|---|---|
| 1 | Losing reactivity by reading early: destructured props, passing `count()` instead of `count`, reading in the component body. Solid calls it "most common AI-generated bug"; Vue lists it as a `reactive()` limitation. | **Types:** reactive props are `Read<T>` accessors, so passing `n()` where `Read<number>` is expected is a compile error, and destructuring an accessor stays reactive (both verified). **Dev:** `STATIC_READ_IN_SETUP` for signal reads in setup outside `peek`/`untrack` (MobX `observableRequiresReaction` and Solid `STRICT_READ_UNTRACKED` are precedents). |
| 2 | Derived state through effects (Angular docs, Svelte `assign-in-effect`, Solid `EFFECT_RELAY_TEAR`) | Provide `computed` and `linked`. Warn `EFFECT_WRITES_OWN_SOURCE`. |
| 3 | Infinite loops | Loop cap that throws `EFFECT_LOOP` with names and locations. |
| 4 | Writes in computeds or setup | Always throw in computeds; warn in setup. |
| 5 | Forgotten cleanups and leaks | Owner tree, returned cleanup, per-owner `AbortSignal`, `NO_OWNER_*` errors. |
| 6 | Tracking lost after `await` | params/load split. Type error on async `computed`/`effect`. |
| 7 | Async races | `resource` aborts and drops stale results; warn on writes after dispose. |
| 8 | Stale read after write (Solid 2) | Read-your-writes model. |
| 9 | Reading the DOM before the flush | `flush()`. Test helpers flush automatically. Loud failure. |
| 10 | Concise-arrow cleanup trap, `effect(() => setQ(1))`. In Solid 2 this halted the whole reactive system in my test. | Signature `() => void \| Cleanup` rejects it at compile time (verified); dev runtime check as backup. |
| 11 | Effect with zero dependencies, which never re-runs | Warn `EFFECT_NO_DEPS` (MobX `reactionRequiresObservable`). |
| 12 | Unstable list identity | Required key; duplicate-key error; same key with a new object updates in place. |
| 13 | Priors from other frameworks. Solid: "not React, and 2.0 is not 1.x"; Svelte's autofixer flags store-style `.set` used on runes. | Reuse the names with the most common matching semantics: Angular's `signal()/set/update/computed/effect/linkedSignal/resource`. Never reuse a known name with different semantics. Ship an in-package, version-pinned AGENTS/skill doc that maps each code to its fix. |
| 14 | Silent core behaviour: swallowed errors, `NaN` churn, skipped self-writes in alien | Fix in the surface layer; tested in §5. |

## 4. Dependency-graph introspection
- **Naming:** an optional `{name}` on every primitive. In dev, record the creation location automatically by capturing a lazy `new Error()`; there is no compiler to do this. Measured on this machine: about 10 µs per node for a lazy capture, versus about 26 µs if `.stack` is formatted eagerly. Make it configurable.
- **`inspect(nodeOrElement)`:** returns JSON: `{name, kind, loc, valuePreview, sources, observers, owner, children, runs, lastCause}`. The prototype has already passed this: `inspect(full)` gave `{kind:'computed', sources:['first','last'], observers:['logFull']}`.
- **`graph(root?)`:** `{nodes, edges:[{consumer, producer}]}`, the same shape Angular's `angular:signal_graph` returns.
- **`why(node)`:** the cause chain for the last run, from the root write through each changed computed. This is Solid's `[why-run]` idea at minimal size; defer budgets and cost tables.
- **Diagnostics:**
  - A stable code catalogue. Each event carries `{code, severity, message, ownerPath, nodeName, loc, data}`.
  - `diagnostics.subscribe()` and `capture(fn)` for tests, plus `expectNoDiagnostics`.
  - Every code gets an anchored docs section, shipped in the package.
- **Agent access:** in dev, answer `devtoolstooldiscovery` with `fw:signal_graph` and `fw:inspect` tools (Angular's pattern), and expose a `globalThis.__FW__` object for Playwright-style agents.

## 5. Experiments (Node 25.1.0)
- alien-signals 3.2.1:
  - A diamond runs its effect once per write (glitch-free).
  - Throwing computed: the second read returns `undefined`.
  - `NaN` re-set: the effect runs twice.
  - Effect self-write: runs once and is silently skipped.
- Preact 1.14.4: errors are cached and rethrown; an unbounded self-write throws "Cycle detected".
- Solid 2.0.0-rc.9:
  - A read right after a write returns the stale value until `flush()`.
  - Writing in a memo or root body throws `REACTIVE_WRITE_IN_OWNED_SCOPE`.
  - `v => setQ(v+1)` in an effect's apply half caused `REACTIVITY_HALTED`, and all later updates were ignored.
  - A block-bodied self-feeding effect throws "Potential Infinite Loop Detected".
  - `DEV` exposes `getSources/getObservers/getChildren/getParent/getSignals`.
- signal-polyfill 0.2.2: allows writes inside a Computed; reads inside `notify` throw; introspection works.
- **Prototype** (`exp/proto.mjs`, 78 lines, on alien's `createReactiveSystem`) passes `proto.test.mjs`:
  - read-your-writes, with the effect deferred until the microtask flush
  - one coalesced, glitch-free effect run
  - `Object.is` equality
  - cached errors rethrown, with 1 call for 2 reads
  - `WRITE_IN_COMPUTED` thrown with names
  - `EFFECT_LOOP` names the culprit
  - the clamp effect converges and emits `EFFECT_WRITES_OWN_SOURCE`
  - `inspect()` output as expected
- **TypeScript 7.0.2** with `--strict --erasableSyntaxOnly`:
  - `computed(async …)` is rejected with a readable message.
  - `Counter({count: n()})` is rejected against `Read<number>`.
  - `effect(async …)` and `effect(() => setQ(1))` are rejected against `() => void | Cleanup`.
  - A non-exhaustive `switch` over the resource state is rejected.
  - Const-object flags work in place of enums.

## 6. API sketch (erasable TS, no JSX)
```ts
const count = signal(0, { name: 'count' });   // count(), count.set(v), count.update(f), count.peek()
const double = computed(() => count() * 2);    // lazy, Object.is, cached errors
const sel = linked(() => options()[0]);        // writable derived
effect(({ signal }) => { addEventListener('resize', onR, { signal }); return () => {}; });
const user = resource({ params: () => ({ id: id() }), load: ({ id }, { signal }) => fetch(`/u/${id}`, { signal }).then(r => r.json()) });
each(todos, { key: t => t.id }, (todo, i) => row(todo, i));   // todo: Read<Todo>
flush(); untrack(fn); onCleanup(fn); catchError(fn, onErr); root(fn);
inspect(double); graph(); why(double); diagnostics.capture(fn);
```

IMPLICATIONS
- Build the graph core on alien-signals' createReactiveSystem() (v3.2.1, MIT, ~6.6 KB unminified, fastest in the 2026-09-19 benchmark), vendored as an ES module. Do not write a new propagation algorithm. The 78-line prototype confirms the surface layer can add everything alien lacks.
- Fix alien's three silent behaviours in the surface layer and keep regression tests for them: a computed error must be rethrown on every read (alien returns undefined on the 2nd read); equality must be Object.is (alien re-runs effects on NaN); an effect that writes its own source must be re-queued and reported (alien skips it silently).
- Adopt read-your-writes plus microtask-flushed effects, with flush() as the only escape hatch and no batch(). This avoids Solid 2.0's stale-read-after-set model, which Solid's own cheatsheet lists as an AI footgun. It matches the Vue, Svelte 5, Angular and Solid 2 convergence on deferred effects.
- Make writes inside computeds throw in dev and prod, with a code that names both nodes (precedents: Angular NG0600, Solid REACTIVE_WRITE_IN_OWNED_SCOPE). The TC39 polyfill allows such writes, so do not inherit its permissiveness.
- Allow writes in effects but re-run until stable, cap the loop (~100 rounds), and throw EFFECT_LOOP naming the effects and their locations (Preact's 'Cycle detected' names nothing). Warn EFFECT_WRITES_OWN_SOURCE and point to computed()/linked().
- Ship linked() (writable derived) as a core primitive, because the effect-copies-state pattern is flagged by Angular's docs, Svelte's autofixer (assign-in-effect) and Solid (EFFECT_RELAY_TEAR).
- Make reactivity visible in types: reactive component inputs are Read<T>/() => T accessors, so passing count() is a compile error and destructuring stays safe (verified with TS 7.0.2). Pair this with a dev warning, STATIC_READ_IN_SETUP, for signal reads in component setup outside peek()/untrack().
- Type effect as (ctx:{signal:AbortSignal}) => void | Cleanup and computed with a non-Promise constraint. TS 7.0.2 then rejects async effects, async computeds, and concise arrows that return non-cleanup values; the last one halted Solid 2's whole reactive system in my test.
- Use Angular's resource shape for async: tracked sync params plus untracked async load(params,{signal}), auto-abort, stale-result dropping, and a discriminated-union state. This removes the read-after-await tracking bug by construction; Solid needs a V8-only runtime check for it. Keep Suspense and transitions out of v1.
- Give every owner and every effect run an AbortSignal, so fetch() and addEventListener() clean up natively. Make effect/cleanup creation without an owner a dev error (Solid's NO_OWNER_* precedent). Roots created inside an owner are owned by default.
- Route effect errors to the nearest catchError owner, otherwise reportError(), and keep the rest of the system running. Do not replicate Solid 2's global REACTIVITY_HALTED. Every error carries code, owner path, source location, and (in dev) the causing write as error.cause.
- v1 stores are immutable values in signals, not Proxy stores. Proxies break identity and structuredClone (both verified) and lose reactivity on destructuring (Vue docs). Use native ES2023 immutable array methods, keyed rows that update in place, and a selector() primitive for O(1) selection.
- Lists: require a key, error on duplicate keys, and use a uniform (item: Read<T>, index: Read<number>) callback in every mode, avoiding Solid 2's mode-dependent callback types. Reconcile with prefix/suffix trimming + key map + LIS, and use Element.moveBefore when supported (Chrome/Edge 133+, Firefox 144+, not Safari).
- Treat introspection as a first-class API: inspect(), graph() with Angular-compatible {nodes, edges:{consumer, producer}}, why(), a stable diagnostic code catalogue with capture() for tests, a devtoolstooldiscovery in-page tool (Angular precedent), and a version-pinned in-package AGENTS/skill doc that maps codes to fixes (Solid precedent).
- Name primitives like Angular (signal/set/update/computed/effect/linked/resource), the largest matching training prior, and never reuse a well-known name with different semantics. Solid's cheatsheet says React and Solid 1.x priors are the dominant bug sources for Solid 2.0 agents.
- Align core semantics with TC39 Signals (Object.is, lazy glitch-free computeds, cached errors, untrack, source/sink introspection) so a native backend could be swapped in later. Do not ship the polyfill: it is still Stage 1 and 3–10× slower in the benchmark.

OPEN
- Microtask vs sync effect flush is the one scheduling decision that is costly to reverse. It should be settled by an A/B eval: coding agents write components and tests under both models, and we compare failure rates and whether the failures are loud or silent. It should not be settled by argument alone.
- Should alien-signals be a dependency (via an import map), vendored as a pinned copy, or reimplemented? Vendoring avoids a registry dependency without a bundler, but means tracking upstream fixes by hand.
- How are dev and prod builds selected with no bundler: an import-map swap (fw -> fw/dev.js), or a runtime flag? And which checks are cheap enough to keep in prod? Proposal: keep write-in-computed and the loop cap in prod.
- Should dev-mode source-location capture be on by default? Measured cost is ~10 µs per node on this machine (lazy Error capture, Node 25), so a 20k-node app would pay ~200 ms at startup in dev.
- What exactly counts as a setup-phase read for STATIC_READ_IN_SETUP when components are plain functions with no compiler? How are false positives avoided for helper functions called during setup that legitimately read once?
- Template bindings treat function-valued props as reactive. Event handlers need a separate namespace (e.g. on:{click}) so a zero-arg handler is never mistaken for a reactive accessor. This needs coordination with the template/DOM research.
- Is a Proxy store() needed at all (e.g. for large forms or editors)? If so, when, and how does it coexist with immutable signals without inviting the mixed-paradigm errors Solid now diagnoses?
- Should Suspense and transitions come in v2? If so, does that force deferred writes (Solid 2's model) or can read-your-writes be kept? Watch AsyncContext (Stage 2) as the enabler for tracking and ownership across await.
- Chrome DevTools' devtoolstooldiscovery event is used by Angular, but I did not verify its standardization status or support outside Chrome. A globalThis.__FW__ fallback plus an optional MCP bridge may be needed.
- If TC39 Signals ever reach Stage 3, should the core expose an adapter to native Signal.State/Computed? What should the interop story be for the Watcher's no-read/no-write notify restriction?

SOURCES
- tc39/proposal-signals (README, API, semantics): https://github.com/tc39/proposal-signals
- tc39/proposals Stage 1 list (Signals at Stage 1): https://github.com/tc39/proposals/blob/main/stage-1-proposals.md
- tc39/proposal-signals commit history: https://github.com/tc39/proposal-signals/commits/main
- tc39/proposal-async-context (Stage 2): https://github.com/tc39/proposal-async-context
- stackblitz/alien-signals README: https://github.com/stackblitz/alien-signals
- alien-signals 3.2.1 package tarball (source inspected): https://registry.npmjs.org/alien-signals/-/alien-signals-3.2.1.tgz
- vuejs/core PR #12349: port alien-signals to Vue 3.6: https://github.com/vuejs/core/pull/12349
- Vue core CHANGELOG (minor branch, 3.6 notes): https://raw.githubusercontent.com/vuejs/core/minor/CHANGELOG.md
- Vue 3.6 RC upgrade guide (alien-signals, behavior notes): https://blog.sparkles-editor.com/en/blog/vue-3-6-rc-upgrade-guide
- Vue docs: Reactivity Fundamentals (limitations of reactive()): https://vuejs.org/guide/essentials/reactivity-fundamentals.html
- Vue runtime-core renderer.ts (getSequence LIS): https://github.com/vuejs/core/blob/main/packages/runtime-core/src/renderer.ts
- Preact blog: Signal Boosting (internals): https://preactjs.com/blog/signal-boosting/
- @preact/signals-core 1.14.4 tarball (CHANGELOG, source): https://registry.npmjs.org/@preact/signals-core/-/signals-core-1.14.4.tgz
- Milo: Super Charging Fine-Grained Reactive Performance (Reactively coloring): https://milomg.dev/2022-12-01/reactivity
- Solid 2.0 RFC 01: Reactivity, batching, and effects: https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/01-reactivity-batching-effects.md
- Solid 2.0 RFC 02: Signals, derived primitives, ownership: https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/02-signals-derived-ownership.md
- Solid 2.0 RFC 03: Control flow (For keyed modes): https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/03-control-flow.md
- Solid 2.0 RFC 05: Async data: https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/05-async-data.md
- Solid 2.0 RFC 08: Dev-mode diagnostics and errors: https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/08-dev-diagnostics.md
- Solid agent diagnostics plan (@solidjs/diagnostics): https://github.com/solidjs/solid/blob/next/documentation/plans/agent-diagnostics-plan.md
- solid-js 2.0.0-rc.9 tarball (CHEATSHEET.md, skills/reactivity-diagnostics/SKILL.md): https://registry.npmjs.org/solid-js/-/solid-js-2.0.0-rc.9.tgz
- @solidjs/signals 2.0.0-rc.9 tarball (README, dev build): https://registry.npmjs.org/@solidjs/signals/-/signals-2.0.0-rc.9.tgz
- @solidjs/diagnostics 2.0.0-rc.2 tarball (agent-loops skill): https://registry.npmjs.org/@solidjs/diagnostics/-/diagnostics-2.0.0-rc.2.tgz
- dom-expressions reconcileArrays (udomdiff-derived): https://github.com/ryansolid/dom-expressions/blob/main/packages/dom-expressions/src/reconcile.js
- udomdiff 1.1.2 tarball (source): https://registry.npmjs.org/udomdiff/-/udomdiff-1.1.2.tgz
- Angular guide: Effects: https://angular.dev/guide/signals/effect
- Angular guide: linkedSignal: https://angular.dev/guide/signals/linked-signal
- Angular guide: resource: https://angular.dev/guide/signals/resource
- Angular error NG0600 (signal write in disallowed context): https://angular.dev/errors/NG0600
- Ninja Squad: What's new in Angular 19.0 (effect changes): https://blog.ninja-squad.com/2024/11/19/what-is-new-angular-19.0
- Angular Architects: Angular 22 features (resource stable, AI tools): https://www.angulararchitects.io/en/blog/angular-22-the-most-important-new-features-at-a-glance/
- Angular commit: DI graph in-page AI tool (registers signalGraphTool): https://github.com/angular/angular/commit/75f2cb8f566de43a5f2fd27bb2982c796b93490d
- Angular source: angular:signal_graph AI tool: https://raw.githubusercontent.com/angular/angular/main/packages/core/src/debug/ai/signal_graph.ts
- Angular source: AI tool registration via devtoolstooldiscovery: https://raw.githubusercontent.com/angular/angular/main/packages/core/src/debug/ai/registration.ts
- Angular source: defaultEquals (Object.is): https://raw.githubusercontent.com/angular/angular/main/packages/core/primitives/signals/src/equality.ts
- mobx 7.0.5 tarball (CHANGELOG, configure.ts): https://registry.npmjs.org/mobx/-/mobx-7.0.5.tgz
- S.js README (atomic clock, ownership): https://github.com/adamhaile/S
- js-reactivity-benchmark (repo): https://github.com/transitive-bullshit/js-reactivity-benchmark
- js-reactivity-benchmark latest results (2026-09-19): https://raw.githubusercontent.com/transitive-bullshit/js-reactivity-benchmark/main/results/latest.md
- MDN: Element.moveBefore(): https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore
- Can I use: Element.moveBefore: https://caniuse.com/mdn-api_element_movebefore
- Svelte MCP tools (svelte-autofixer): https://svelte.dev/docs/mcp/tools
- Svelte autofixer rule sources (assign-in-effect, wrong-property-access-state): https://github.com/sveltejs/ai-tools/tree/main/packages/mcp-server/src/mcp/autofixers/visitors