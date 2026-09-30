# jasno design record, v3

Date: 2026-09-26. Inputs: the research digest (`r1/digest.md`, cited as §0–§18), design v1, four agent usability runs on v1 (contacts, todo-timers, dashboard, wizard: fresh agents with only AGENTS.md + jasno.d.ts, then a semantic review each), five adversarial critiques (reactivity R/m, TypeScript TS, agent red team A/G, toolchain C/M/m, scope S), and for v3 two usability runs on v2 (kanban, chat, with a semantic review each; the Enter-key bug was reproduced in Chromium) plus a consistency check of v2 (V2-01..V2-19). Every feedback item is listed with its outcome in `changelog.md`. Every type-level claim was checked with TypeScript 7.0.2 (`tsc -v` printed `Version 7.0.2`) on Node 25.1.0; evidence is in the appendix.

| File | What it is |
|---|---|
| `jasno.d.ts` | The complete public API: `jasno`, `jasno/router`, `jasno/testing`, `jasno/testing/happy-dom`, the `window.__JASNO__` type, and a RECIPES block (patterns that are not one function). 49.5 KB; it references `jasno.elements.d.ts`. |
| `jasno.elements.d.ts` | The generated element props (`GlobalProps`, one `*Props` interface per element class, the `H` tag table), merged into module `jasno`; 49.8 KB that tsc checks and agents rarely need to read. |
| `AGENTS.md` | The agent guide shipped in the package (8,187 bytes, ASCII). With `jasno.d.ts` (and the `jasno.elements.d.ts` it references, which tsc needs and agents rarely read) it is everything a fresh agent gets. |
| `example/` | A multi-file app (router with a param route, lazy views, notFound, resources, keyed lists, a form, context, cleanup, an SVG icon, `selector`, a toast region) and two `node:test` files. Its fetch functions are imported as `#api`, which `package.json` maps to `api.mock.ts` under the `development` condition, so the app runs under `jasno dev` and in tests without a backend. |
| `tsconfig.json`, `tsconfig.test.json` | Validation: the browser program (jasno.d.ts + example, no tests, `types: []`) and the test program (`types: ["node"]`). Both report 0 errors. |
| `tsconfig.app.json`, `tsconfig.app-test.json` | Templates testers extend for their browser and test programs. |
| `tools/gen-elements.cjs` | Generator of the closed element props and the `H` table (v2 rules: live `undefined`, closed `aria-*` from lib.dom's `ARIAMixin`, void elements without children, message-typed `dialog.open`). |
| `tools/agents-samples/` | Every AGENTS.md sample and every RECIPES snippet as compiling files (`tsc -p tools/agents-samples/tsconfig.json` and `tsconfig.test.json`: 0 errors). |
| `changelog.md` | Every feedback item: id/source, severity, accepted, rejected or deferred, what changed or why not (v2 items first, then the v3 section). |

## What changed after the agent-friendliness review (2026-09-26)
- **Optimistic-save recipe (ADR-15):** saves of one record are serialized and a failure shows the last value the server accepted; no `reload()` after a save. v3's recipe left an unconfirmed value on screen when two overlapping saves both failed in start order, and a failed post-save `reload()` cleared the list.
- **Example form:** `NoteForm` lives inside `match()` on the person's id and clears the field only when it still holds the sent text; a second test covers text typed during a save.
- **`settled()` (B19.6):** also waits for promises returned by `on*` handlers, which is what AGENTS.md and the example test already assumed; B19.5 no longer claims that plain module variables are reset.
- **Assets (`jasno dist`):** non-module files ship only from `assets/`, unhashed, referenced as `/assets/<name>`; `new URL('./x.png', import.meta.url)` under `src/` is the new check error `ASSET_OUTSIDE_ASSETS` (the old contract hashed the file but left the URL unchanged).
- **`FOCUS_STYLE_REMOVED`:** checks only selectors that reach interactive elements and accepts any `:focus`, `:focus-visible` or `:focus-within` rule in the program that changes more than the outline, so the known false positives no longer fire (ADR-24).
- **Eval plan:** a mandatory reference arm on a familiar stack, tasks that change an existing app, a frozen held-out task set, a hidden production-build rung, and cost metrics.
- **Types:** the generated element props moved to `jasno.elements.d.ts`, halving `jasno.d.ts`.

## What changed after the runtime prototype (2026-09-26)
The first runtime prototype (`../jasno`, milestone M1: core, DOM, `resource`, `jasno/testing`) was checked against this record by seven agents writing conformance tests per section (538 tests; 608 with the prototype's own). The runtime bugs they found are fixed in the prototype; the spec questions were decided as follows (changelog "Runtime prototype conformance review"):
- **B8.1 vs B1.3:** the same error object is rethrown while the computed has observers; without observers each read recomputes (B1.3).
- **B21.4 (new):** a write re-reads the selector source at once, so `isSelected()` and computations over it are read-your-writes; its errors are routed in the next flush. The selector source is a derivation (Terms).
- **B8.5, B20.3:** a `catchError` swap focuses the first focusable element of the new content, else its first element (given `tabindex="-1"`, as the router does, B17.8); text-only content cannot take focus and reports `FOCUS_LOST` with a wrap hint. It applies to `reset()` too.
- **Smaller rules:** `WRITE_IN_SETUP` inside `untracked()` (B5.4); live `undefined` removes a reflected attribute absent at creation, no `href=""` (B15.5); `UNKNOWN_PROP` checks jasno's generated prop table, not DOM membership (B15.8); `mount()` in a derivation throws (B6.11); owners created under disposed owners are disposed at once (B6.2).
- **Clarified from ambiguities:** B4.10 re-arms like B4.6; B5.3 dedupes per (effect, signal); B9.4 forgets the request on idle and throwing params; B10.6 covers `each` rows; B14.1 components called in an effect are setup; B19.2 tags owners inside module-level roots; B19.5 resets linkedSignals; B19.6 ignores loaders jasno aborted.
- **Router (B17, second pass):** see "What changed after the router prototype" below.
- **CLI ((e), second pass):** see "What changed after the CLI prototype" below.
- **Testing guidance (g):** focus a field before typing into it; dispatch Enter as a cancelable `keydown` and await a microtask before simulating its default action; `jasno/testing/happy-dom` adds the dialog focusing steps happy-dom lacks. The example's `user-list.test.ts` typed without focusing the field and correctly got `FOCUS_LOST`.

## What changed after the CLI prototype (2026-09-27)
The five commands (`../jasno/cli/`) run the design example through rungs 1–4 (`jasno check`, the browser probes under `jasno dev`, `jasno dist` + `jasno preview` in Chromium and Firefox). Four agents probed them (184 conformance tests, 26 real-browser checks of the shipped artifact); the bugs are fixed and the spec now says (changelog "CLI prototype", CL-01..CL-36):
- **Names and endpoints (ADR-34, (e) dev):** `/__jasno/log`, `/__jasno/ping`, `/__jasno/events`, `/__jasno/client.js`; only `GET`/`HEAD` except the log; `Host` may be a loopback name, `*.localhost` or an IP literal (rebinding needs a name), with `--host` also the machine's own name.
- **Terminal and CSP:** everything printed is stripped of control characters (a 404 URL could fake a `file:line:col` line); the production CSP is on every dev response.
- **Resolution (ADR-35):** Node's algorithm exactly (null targets, array fallbacks, invalid segments, legacy `main`); a package is the root reached through `node_modules`, not a nested `{"type":"module"}` marker; package-private keys go under import-map `scopes`.
- **dist:** `FILE_NOT_PUBLISHED` (a module outside `src/`, a test file, a symlink, a `public/` name clash); `public/` → the site root; misses under `/src`, `/_deps`, `/jasno`, `/assets` are 404, not the SPA fallback (dev agrees); `--condition` applies to the app's `imports` only; `CSP_HASH_STRICT_DYNAMIC` fires on a handwritten CSP meta (an error with `'strict-dynamic'`, else a warning).
- **check:** DOM names checked by symbol, jasno rules only for imports from `jasno`, the test program reports only Node files, rules narrowed to what runs (`ASYNC_IN_EFFECT`, path-aware `CURRENT_TARGET_AFTER_AWAIT`, `:not(:focus-visible)`); without the TS API the syntax-tree rules are skipped too (TypeScript 7's tree comes from the API).
- **explain:** the catalogue rows until `errors/CODE.md` exists; `MODULE_NOT_FOUND` added.

## What changed after the router prototype (2026-09-26)
The router (`jasno/router`) was checked by four agents (181 conformance tests in happy-dom, 46 scenarios in real Chromium and Firefox through the Navigation API adapter). The bugs they found are fixed; the spec now says (changelog "Router prototype review"):
- **Matching (B17.2):** decoded segments; statics and constraints compare decoded text (patterns are written decoded); a constraint tests one whole segment; the trailing slash is never part of a param; a `+`/`*` param cannot carry an encoded `/`. **B17.1:** equivalents of a lone splat (`/:x?/:rest*`) are rejected as catch-alls.
- **Navigation API (B17.5):** loading starts after the browser committed the URL (the `intercept()` handler), so loaders see the new URL and a loader redirect with `replace` replaces the right entry. **B17.4:** reloads and links with any `target` are left to the browser.
- **Focus and scroll:** redirects before the first render stay quiet (a link click or Back that supersedes the initial navigation moves focus); an outlet swapped in by a flush that removed the focused element (a login wall) focuses on its first render and the focus-loss check waits for it, while one that appears with focus on `body` (an async gate on page load) stays quiet (B17.3, B20.2); the outlet's error swap restores focus like `catchError` (B17.12); positions are kept per history entry and a replace to a new view lands at the top (B17.11).
- **`back()` (B17.18):** repeated calls share one step; disposal settles it; a cross-origin fallback is a full navigation.
- **RECIPES:** the detail-over-a-list dialog returns focus to the list's `h1` when a deep link left no opener.

## What changed from v2, in one screen

- **One API addition:** `router.back(fallback)` goes back one entry when the previous entry is this app's, else replaces the URL with `fallback` (a deep link). "Close the dialog = go back" was impossible to write correctly while AGENTS.md forbids touching `history` (U-K4).
- **Two new checks:** `KEY_ACTIVATES_NEW_FOCUS` (dev warn): an Enter keydown handler that moves focus without `preventDefault()`, because Chromium then delivers the same key's keypress to the newly focused button and clicks it (U-K1, reproduced); `FOCUS_STYLE_REMOVED` (`jasno check` warn): a `css` sheet that removes the outline from interactive elements while no focus-state rule shows focus another way (U-K6, U-D7; narrowed after the 2026-09-26 review).
- **Semantics made precise:** search-only navigations update `router.url` before `navigate()` returns; a view without a route title starts from `index.html`'s title (no cleanup needed); the announcement falls back to the view's first `h1`; module-level `createRoot` roots are app-lifetime in tests (no `EFFECT_LEAKED`); `EFFECT_WRITES_STATE` covers callbacks that fire during an effect run, and subscriptions belong in `onMount`.
- **Docs fixed where they steered agents wrong:** the optimistic-save recipe no longer rolls back by reloading (a failed reload clears the value, and a reload in `finally` overwrote other saves still in flight); new recipes for inline edit through a form, per-param lifecycle (`match` keyed on the param with `onMount` inside), a detail over a list as a search param with `router.back`, focus that survives removed rows, chat/log lists, and a dev backend behind `#api`; `autofocus` is documented as working only in dialogs and routed views.
- **Consistency:** `h.header(null, nav)`, "every view has an `h1`" (its text may be live), the flagship example no longer triggers `EFFECT_NO_DEPS` or `FOCUS_LOST`, Playwright runs one `webServer` chosen by `JASNO_E2E`, and the stale cross-references and hints the check found are corrected.

## What changed from v1 (the v2 pass), in one screen

- **The critical bug of all four usability runs** (a hand-written import map that shadows the generated one, so the app never boots) is fixed at three rungs: AGENTS.md shows the complete `index.html` with the `<!--jasno:head-->` slot and says "never write an import map"; `jasno check` and `jasno dev` fail with `IMPORT_MAP_HANDWRITTEN`; `jasno dev` refuses to inject a second map.
- **Types now catch** forgotten calls on every `Read` (`p.user.name`), in-place mutation of signal and resource arrays, `Signal` variance, non-exhaustive `match`, object `match` keys, `each` without a key (named in the error), void-element children, `dialog.open`, ARIA typos, `css` interpolation, untyped contexts, empty `provide` scopes, fallbacks that render nothing, loaders resolving `undefined`, route patterns without `/`, a required `notFound`, and `router.url().searchParams.set`.
- **Semantics are specified where critics found holes:** flush drain order, loop-cap recovery, disposal order, self-disposal, linkedSignal's source, the resource state as a pure function, AbortError handling, errors inside regions, reporting without `reportError`, focus after region swaps and keyed moves.
- **New dev diagnostics** for silent failures the reviews found: `LOADER_READ_UNTRACKED`, `EFFECT_WRITES_STATE` (replaces `EFFECT_WRITES_OWN_SOURCE`), `LEAK_IN_SETUP`, `UNTRACKED_IN_DERIVATION`, `RESOURCE_SET_WHILE_LOADING`, `FOCUS_LOST`, `VIEW_NO_HEADING`, `NODE_MOVED`, `NODE_OUTSIDE_REGION`, `SUBMIT_NOT_PREVENTED`, `UNSTABLE_KEY` (replaces the false-positive-prone `ROWS_RECREATED`).
- **API:** added `selector`, `svg`, `SvgAttributes`, `RouterOptions.notFound`, `LinkedSignalOptions`, `EachOptions`, `ReadonlyURL`, `NavigateResult` and message-typed stubs for 15 names from other frameworks; removed `onCleanup`, `ResourceLoaderContext.previous`, `__JASNO__.componentOf`/`config`, `UNTRACKED_IN_SETUP`, `WRITE_AFTER_DISPOSE`, `ROWS_RECREATED`, `NO_ROUTE_MATCH`; renamed `Signal`→`WritableSignal`, `ReadonlySignal`→`Signal`, `router.pending`→`router.isLoading`; changed `each`, `linkedSignal`, `navigate()`, `mount()`, `provide()`, `css`, `match`, `resource` signatures.
- **Toolchain:** separate browser and test programs, dependencies imported by name (resolved and copied, never bundled), `#config` conditional imports for environments, hashed file names instead of `?v=`, a publish allowlist, a locked-down dev server that sends the production CSP, SPA fallback, `jasno preview`.

## Decisions at a glance

| Question | v3 decision | ADR |
|---|---|---|
| Authoring | `h.div(props \| null, ...children)`; `svg(tag, attributes, ...children)` for SVG | 01, 28 |
| Element props | closed, generated from lib.dom; live values may be `undefined`; closed `aria-*`; void elements take no children | 02 |
| Events | lowercase DOM names; `Handler` brand rejects signals with a message | 03 |
| Live component props | `Read<T>`, an interface whose `length`/`name` carry a "call it first" message | 05 |
| Signal types | `WritableSignal<T>` (writable), `Signal<T>` (read-only), Angular's names; `set`/`update` are bound properties | 07, 08 |
| Immutability | `signal()` and `resource()` values read back readonly for arrays, Map, Set; `signal<T, T>` for generic code | 07 |
| linkedSignal | Angular's object form `{ source, computation }`, reset only when the source value changes | 08 |
| effect | syncs the outside world; writing signals in its run (callbacks that fire during it included) is `EFFECT_WRITES_STATE`; subscriptions go in `onMount` | 09, 12 |
| Cleanup | returned from `onMount`/`effect`, or `abortSignal`; `onCleanup` removed | 09 |
| Scheduling | read-your-writes, microtask flush, phase (a) drained by creation order, per-consumer cap | 10 |
| Lists | `each(list, { key, render })`, render gets `(item, index, key)` | 14 |
| match | keys are primitives or functions; render returns something for every key | 14 |
| Resource | loader resolves `T extends {} \| null`; params compared shallowly; `set()` during `loading` warns | 15 |
| Router 404 | required `notFound` view; catch-all patterns rejected | 21 |
| navigate() | resolves `'done' \| 'superseded' \| 'failed'`, never rejects for outcomes | 21 |
| Closing a detail | `router.back(fallback)`; a detail over a list is a search param on the list's route (no overlay routes) | 21 |
| Selection | `selector(source)` restored | 31 |
| Focus | router, boundaries and keyed moves restore focus; `FOCUS_LOST`, `VIEW_NO_HEADING`, `KEY_ACTIVATES_NEW_FOCUS`; `jasno check` `FOCUS_STYLE_REMOVED` | 33 |
| Docs channel | AGENTS.md (≤ 8 KB) + RECIPES block in jasno.d.ts (+ `docs/recipes/` in the package) | 30 |
| Dependencies | npm packages imported by name, copied as files; `#name` only for app aliases and `#config` | 26, 35 |
| TS programs | browser `tsconfig.json` (`types: []`) and `tsconfig.test.json` (`types: ["node"]`) | 26 |
| Dev server | localhost only, allowlisted paths, same CSP as production, SPA fallback | 34 |

---

## (a) Architecture decision records

Each ADR: decision, rationale (digest sections and feedback ids), rejected alternatives. v1 ADRs keep their numbers; "(v2)" marks a changed decision. Eval-gated items keep their eval arm (plan at the end of this section).

### ADR-01 Authoring: a namespace of typed tag functions
- **Decision.** `h.tag(props | null, ...children)` returns the real element. One signature, props slot required, no overloads. `h` is an object.
- **Rationale.** §1: without a build step, typed factories are the only authoring form tsc checks fully: tagged templates are unchecked, and JSX, which tsc does check, needs a transform (non-goals, (h)). Namespace members give "Did you mean" on most tag typos (`h.buton`; tsc skips very short ones such as `h.dvi`) and avoid shadowing `a`, `p`, `var`. Unchanged by feedback: no usability run leaked JSX, `className` or `onClick` (all four reports).
- **Rejected.** `h('div')`, bare destructured tags, tagged templates, JSX, fluent builders (§1).
- **Eval (arm A).** Unchanged.

### ADR-02 Closed element props generated from lib.dom (v2)
- **Decision.** One flat interface per element class, generated by `tools/gen-elements.cjs`. v2 rules: (1) every generated prop is `MaybeRead<E['x'] | undefined>`, so a live value may return `undefined` (returns the element to its creation state: a reflected attribute it did not have is removed, so no `href=""`, B15.5); (2) `aria-*` is a closed set of 51 keys derived from lib.dom's `ARIAMixin` (`ariaHasPopup` → `'aria-haspopup'`, element-reference properties map to their ID-reference attributes), replacing the `` `aria-${string}` `` index signature; (3) void elements (`area`, `br`, `col`, `hr`, `img`, `input`, `source`, `track`, `wbr`) and `textarea` take no children; (4) `HTMLDialogElementProps.open` is message-typed; (5) `class` accepts `Read<string | undefined>`. `data-*` stays an index signature.
- **Rationale.** TS-02 (26 errors in a 453-line app pushed agents to `?? ''`, which sets `href=""`); A19 (ARIA typos were silently ignored); A18 (`h.input(null, 'Remember me')` and `h.textarea(null, text)` compiled and misbehaved); A17/S7 (`open` makes a non-modal dialog). Verified: `'aria-lable'` gives TS2353, `h.input({...}, 'x')` gives `TS2554 Expected 1 arguments, but got 2`, `open: true` prints the message (appendix E1).
- **Rejected.** A hand-written ARIA table (lib.dom already has it); typing each ARIA value (`aria-live: 'polite' | ...`): more generator code for little gain, revisit with eval data.

### ADR-03 Events: lowercase DOM names, typed `currentTarget`, signals rejected (v2)
- **Decision.** Unchanged, except the brand now carries a message: `onclick: count` reports `'jasno: a signal is not a handler; write () => count.set(...)'` (TS-13). `currentTarget` stays typed as the element; using it after `await` (where the DOM nulls it) is the `jasno check` rule `CURRENT_TARGET_AFTER_AWAIT` (A13).
- **Rationale.** §1: the lowercase set derives mechanically from lib.dom and tsc suggests `onclick` for `onClick`; React casing leaked into 0.03% of 27,396 SvelteBench samples; no usability run leaked `onClick`.
- **Rejected.** Typing `currentTarget` as nullable (every synchronous handler would need a guard); a component-callback brand for signals (TS-13's second half: rare, no new export).

### ADR-04 The reactive rule
- **Decision.** Unchanged: a function is live, anything else static. Function children are live text (ADR-14).
- **Rationale.** §0, §2, §5: one rule without heuristics; signals are functions, so passing `count` is the live form and `count()` the snapshot.
- **Rejected.** Solid html's arity rule; Vue-style auto-unwrapping (hides the live/snapshot distinction the whole design relies on, §3).

### ADR-05 Component props: `Read<T>` for live inputs (v2)
- **Decision.** `Read<T>` is an interface: a call signature plus `length: number | {msg}` and `name: string | {msg}`. Inline arrows and signals stay assignable (their `length` is `number`), but reading `p.items.length` or `p.user.name` yields a union that fails in every realistic use with the text "call it first: items().length, user().name". Builder arguments (`each` item/index, `show` value, `ViewProps.params`/`data`) are `Read`s too, so the same guard covers them.
- **Rationale.** TS-01/A01 (critical): `p.user.name` returned `Function.prototype.name` and rendered silently. The critic's union form keeps inline arrows legal where the digest's guard could not (§3 "the guard cannot go on the input type"). Verified on the example, agents samples and tester apps: no valid code broke (appendix E1, E4).
- **Rejected.** Typing jasno-produced Reads as `Signal<T>` only (A01's fix): leaves user-declared `Read` props unguarded; a runtime `name`/`length` trap (breaks `console.log(signal)` in Node, whose inspector reads `name`).

### ADR-06 Components (v2)
- **Decision.** Unchanged shape. `component<A extends [] | [props: unknown] | [props?: unknown]>` accepts an optional props parameter (`p: SpinnerProps = {}`, TS-10). Convention: data props `Read<T>`, optional props `?: Read<T> | undefined` (G03). Content that may not render or must see the component's context is a function prop (`panel: () => Child`), because arguments run before the callee's body (S3).
- **Rationale.** §2 (run-once components; the wrapper labels direct calls for the strict-read check); the `: Node` annotation breaks the routes↔views type cycle (TS7022, v1 appendix E4); TS-10; S3 (arguments run before the callee, so eager children cannot see its context).
- **Rejected.** Lazy children by default (a thunk for every child hurts the common case).

### ADR-07 Signal shape (v2)
- **Decision.** Callable getter; `set`/`update` are bound, declared as `readonly set: (value: T) => void` (property syntax). `signal<T, V extends T | Frozen<T> = Frozen<T>>(initial: T)` returns `WritableSignal<V>`: arrays and tuples read back `readonly`, `Map`/`Set` as `ReadonlyMap`/`ReadonlySet`; other types are unchanged. Generic code that stores a type parameter writes `signal<T, T>(initial)`. `resource()` values are frozen the same way. `computed` and `linkedSignal` results are not.
- **Rationale.** TS-03/A22: method syntax made `Signal<'s'|'m'>` assignable to `Signal<string>` and left `onclick: s.set` undefined in `this`; property syntax is invariant and documents binding. A06 (critical): `users().push(u); users.set(users())` is a silent no-op under `Object.is`, and Vue/Svelte priors make mutation the default habit; now `Property 'push' does not exist on type 'readonly User[]'`. Measured costs: `Readonly<T>` on arbitrary objects produced false positives (`el().textContent = ...` on a signal holding an element), so only arrays, Map and Set are frozen; a frozen bare type parameter is not provably assignable (`T` to `Frozen<T>`), hence the explicit `signal<T, T>` escape (appendix E2).
- **Rejected.** Dev-only `Object.freeze` (breaks libraries that mark arrays, e.g. chart libraries, and makes dev differ from prod); freezing every object type (false positives on DOM and class instances); freezing `computed` (generic components over `Read<T>` would get `Frozen<T>` back).

### ADR-08 Names follow Angular's signal family (v2)
- **Decision.** Types renamed to Angular's: `WritableSignal<T>` (writable) and `Signal<T>` (read-only; was `ReadonlySignal`). `linkedSignal` takes Angular's object form `{ source, computation(source, previous: { source, value }), equal?, debugName? }`; the shorthand `linkedSignal(fn)` is a type error. Difference from Angular, stated in the JSDoc: jasno memoizes `source` (resets only when its value changes by `Object.is`) and runs `computation` untracked. `router.pending` becomes `router.isLoading` (the resource's word).
- **Rationale.** S18: ADR-08 claimed Angular's family but used Preact's type names, a same-name-different-meaning case for `Signal`. R5/A24/U-C3: v1's `linkedSignal(() => { p.userId(); return ''; })` reset on any change of anything read (an inline `() => user().id` wiped drafts on every refetch), and the dependency line looked dead and got deleted. The object form names the dependency; the memoized source fixes granularity; `previous.source` enables merges (keep edits across a save echo).
- **Rejected.** Positional `linkedSignal(source, computation)` (R5's form; nobody's prior); keeping Preact type names; Angular-exact tracking of `computation` (reintroduces the refetch-wipes-draft bug).

### ADR-09 `effect` and `onMount` (v2)
- **Decision.** `effect(fn): stop` syncs the outside world; its first run is in the first flush, then after its sources change. Writing a signal during an effect run reports `EFFECT_WRITES_STATE` (ADR-12). `onMount(fn)` runs once after the current owner's nodes are inserted (first render included) with that owner current, so effects and resources created inside it are owned. Cleanup is returned from `effect`/`onMount` or done through `abortSignal`. **`onCleanup` is removed** (a message-typed stub remains). `createRoot` stays for module-level app-lifetime work.
- **Rationale.** S16: three cleanup spellings violated "one canonical way"; the only v1 use (`onCleanup(() => socket.close())`) is `onMount(() => () => socket.close())`, and creating resources in setup is the leak A12 describes. G01: v1's only effect sample fetched in an effect (A05, m9); v2's samples use `document.title` and storage. U-T4: "runs in the first flush" is now in the JSDoc and AGENTS.md.
- **Rejected.** Deleting `createRoot` (S16's second half): a module-level `resource()` for app-wide data (a session) needs an owner, and `NO_OWNER` must stay to catch effects created in handlers; `createRoot` is the explicit form its hint names.
- **Eval (arm C).** Unchanged.

### ADR-10 Scheduling (v2)
- **Decision.** Read-your-writes; bindings and effects run in a microtask flush; `flush()` runs it now; no `batch()` (a message-typed stub remains). v2 makes the flush normative (B4): phase (a) is a queue ordered by creation sequence and drained until empty, including bindings dirtied during the phase; the loop cap counts runs per consumer (100 per flush) as well as rounds; consumers dropped at the cap stay subscribed and re-armed; `flush()` inside an effect or `onMount` drains pending bindings synchronously, and inside a derivation or setup throws `FLUSH_REENTRANT` in both builds.
- **Rationale.** R1 (the prototype's per-round snapshot let effects see stale row DOM), R2 (dropped consumers went permanently dead), m4 (`flush()` silently ignored in prod while the JSDoc recommended it before measuring).
- **Eval (flush A/B).** Decided 2026-09-26 by the owner: microtask flush. Arm E now confirms rather than chooses; a significant sync win in condition 3 reopens the question, it does not switch automatically. Still the costliest decision to reverse.
- **Rejected.** Model A (synchronous flush: torn state after `await`, §3); model C (Solid 2's stale reads, its own listed AI footgun); `batch()` (writes are already deferred; now a message-typed stub).

### ADR-11 Graph core: vendored alien-signals, fixed in the surface layer (v2)
- **Decision.** Unchanged core. The regression list grows from four to eight pinned behaviours: the four from §3 plus cap re-arming (R2), cleanup-at-most-once (R4), no caching of unobserved computeds (m1) and settled-before-write for linkedSignal (R5). Two surface-level tests join them: an effect that reads a row's text after an in-place item update sees the new text in the same flush (R1), and one throwing row among 100 followed by an update leaves DOM order equal to list order (R9).
- **Rationale.** §3: best score in the 2026-09-19 benchmark, underpins Vue 3.6; the fixes live in a small surface layer with regression tests.
- **Rejected.** An own propagation algorithm; the TC39 polyfill (3.3–10.5× slower, Stage 1, allows writes in computeds).

### ADR-12 Writes by context (v2, v3)
- **Decision.** Derivations throw `WRITE_IN_DERIVATION` (both builds). A signal write during an effect's synchronous run is applied and reported `EFFECT_WRITES_STATE` (dev warn) when the signal has observers; a self-write also re-queues the effect (cap applies). Writes in `onMount`, handlers, timers and promise callbacks are silent. Setup writing a signal it did not create: `WRITE_IN_SETUP`. **`WRITE_AFTER_DISPOSE` is removed**: such writes are applied and silent, and the RECIPES block says they are harmless (v3 moved that line out of AGENTS.md for space).
- **Rationale.** A04: `effect(() => count.set(p.items().length))` read one signal and wrote another, so v1's own-source check missed the most common derivation-in-effect; one code now covers both. U-C11/S17: the info-level code never failed tests, agents added `alive` flags anyway, and m7 showed its owner link retained disposed subtrees.
- **v3 clarification (U-CH1, U-CH2).** "During the run" includes callbacks that external code calls synchronously, e.g. a presence source that emits its current state on subscribe. That is not a false positive in ADR-24's sense: such a callback runs inside the effect's tracking scope, so any signal it reads subscribes the effect and re-runs the subscription. The documented rule is therefore "subscriptions whose callback sets signals go in `onMount`", and per route param inside `match(() => p.params().id, (id) => Body({ id }))`, whose branch owner restarts them. The chat app's workaround (making its mock emit asynchronously to stay silent) is what the rule and the hint now prevent.
- **Rejected.** Throwing on writes in effects (legitimate imperative-API results exist; warn is enough under warnings-fail-tests); exempting writes inside `untracked()` in an effect (a mute agents would reach for, A33); a `fromSource()` primitive (U-CH1's alternative: `onMount` inside a `match` body already expresses it, with no new export).

### ADR-13 Ownership, disposal, strict-read region (v2)
- **Decision.** Owner tree unchanged. **Disposal order (B6.3):** mark disposed, dispose children, abort the owner's `AbortSignal`, run cleanups (untracked, no owner, no strict label, at most once each), then unlink. Computeds owned by a disposed owner evaluate untracked and uncached when read afterwards. Disposing an owner during its own run takes effect when the run returns (the returned cleanup runs at once). Derivations run with no owner: creating an effect, resource, component, `onMount`, root or `mount()` inside one throws `OWNED_IN_DERIVATION`. Signals keep their creating owner only as a dev-only token.
- **Rationale.** R3 (cleanups read stale or re-linked computeds), R4 (self-stop lost the returned cleanup and ran the previous one twice), m1 (owner depended on who read a lazy computed first), m7 (retention).
- **Rejected.** v1's unlink-before-cleanup order (stale or re-linked reads, R3); `Symbol.dispose`/`using` (§17: missing on iOS); labelling effect bodies (§13: 570 of 573 warnings were noise in Pictelio).

### ADR-14 Control flow: `show`, `match`, `each`; function children are text (v2)
- **Decision.** `show` unchanged. `match<K extends MatchKey>(key, render: (key) => Rendered)`: keys are primitives or functions, `render` must return something for every key (`Rendered` excludes `null`, `undefined`, booleans). `each(list, { key, render })` with `render(item, index, key)`: the key function is a named, required property and the plain key is passed to the row. The function-child message names `each()` as well as `show()`/`match()`.
- **Rationale.** TS-06 (a non-exhaustive switch in `match` compiled and rendered nothing); A28 (object keys rebuilt forms on every refetch); TS-07/A36 (the 2-argument Solid/Lit habit produced a misleading `TS2349` pushing agents to `todo.text`; the object form reports `Property 'key' is missing`); m3 (row setup reading the key-stable id was a strict-read false positive; the plain key removes the reason); A35/TS-09 (`.map` in a function child now names `each()`).
- **Rejected.** `each(list, render, key)` (A36; render could not receive a typed key because inference runs left to right); keeping positional arguments with an `jasno check` rewrite (TS-07 alternative; fragile).

### ADR-15 Async: `resource`, Angular-shaped (v2, v3)
- **Decision.** `resource<T extends {} | null, P = unknown>({ params?, loader, debugName? })`. Changes: (1) loaders must resolve `null` for "no data" (a `void`/`undefined` loader is a type error); (2) `P` defaults to `unknown` so near-miss options (`load:`) and explicit `resource<User>()` get honest errors; (3) `ResourceLoaderContext.previous` removed; (4) params are compared with a one-level shallow equality for plain objects and arrays (`Object.is` otherwise), so inline object params do not refetch on unrelated parent refreshes; (5) the state is a pure function of `params()` and the last request (B9); (6) a rejection is ignored only when the request is stale or jasno aborted it, so a loader's own timeout becomes `error`; (7) `set()` while `loading` warns `RESOURCE_SET_WHILE_LOADING`; (8) `reload()`/`set()` are no-ops while params are `undefined` or after disposal; (9) members are bound; `hasValue()` is documented as a tracked read; (10) 2026-09-28: `latest()`, the last value held for the current params, kept across a failed load or `reload()` (B9.9).
- **Rationale.** A08/m8/U-W6 (resolved-`undefined` showed "Loading" forever), TS-05, S17, R5, R6, R7, R8/A25/S6/U-C4 (the flagship example itself shipped the stale-`set()` race), U-D2/U-D9 (reload aborts in flight; JSDoc now says so).
- **v3 (U-K2, U-K3).** Semantics unchanged; the docs were wrong. v2's recipe ("`set()` before the await, `reload()` in `finally`") rolled back by refetching: the rejected value stayed on screen during the reload, a reload that also failed cleared the value (B9.6, so the kanban board emptied), and a reload that finished while another save was in flight overwrote that save's optimistic value. The recipe now undoes only its own change with `set()` (allowed after an await when params are unchanged), reloads only when no other save is in flight, and gives the request a timeout; the `set`/`reload` JSDoc and AGENTS.md say the same.
- **Review 2026-09-26.** v3's recipe still failed one order: two overlapping saves that both failed, the earlier one first, left the second save's "before" value (itself unconfirmed) on screen; with three failures it drifted further. A successful save followed by a failed `reload()` also cleared the value (B9.6). The recipe now queues saves per record, rolls back to the last value the server accepted when the last queued save fails, re-shows a successful last save in case a concurrent `reload()` replaced it, and never reloads after a save; a model of every interleaving of up to four saves, with or without one unrelated `reload()` at any point, ends with the screen equal to the server (a timed-out request is modelled as not applied).
- **Rejected.** A `keepPrevious`/`refresh`/`debounced` option (recipes cover them; add only if the eval shows repeated hand-rolling); an `equal` option for params (shallow default covers the reported case); a discriminated `state()` union (TS-14: `hasValue()` narrows; reconsider if the eval shows `value()!`); keeping the value in `value()` when a `reload()` fails, SWR/TanStack style (U-K2's API proposal: it diverges from Angular's resource, where `error` has no value; since 2026-09-28 the separate `latest()` covers it, and the keep-last-value recipe uses it); `resource.mutate(apply, promise)` (a mutation cache is the deferred `query` module's job, ADR-22).

### ADR-16 Error boundary: `catchError` (v2)
- **Decision.** `catchError(tryFn, fallback: (error, reset) => Rendered)`: a fallback must render something. When the swapped region contained the focused element (an error swap or `reset()`), focus moves to the first focusable element of the new content, else to its first element (given `tabindex="-1"`, as the router does in B17.8); text-only content cannot take focus and reports `FOCUS_LOST` with a hint to wrap it in an element (B8.5, B20.3).
- **Rationale.** S8 (a Solid 1 handler-only fallback compiled and blanked the region); U-D5 (Retry lost focus).
- **Rejected.** `ErrorBoundary` components (JSX-shaped); Solid 1 handler-only semantics (S8); catching event-handler errors (hides bugs; React and Solid do not).

### ADR-17 Mount entry (v2)
- **Decision.** `mount(view, target: Element | null)`; a `null` target throws `MOUNT_TARGET_MISSING` naming the `index.html` fix.
- **Rationale.** U-C doc ambiguity: `mount(App, document.getElementById('app'))` failed under strict, and agents mounted into `document.body` to avoid `!`.
- **Rejected.** `mount(App, '#app')` string selectors (Vue's prior, but it adds a second target type and hides a typo exactly like `null` does); `render()` (Solid/Preact name, now a message-typed stub).

### ADR-18 No portal (v2)
- **Decision.** Still no portal. `dialog.open` is message-typed; the RECIPES block documents the modal dialog (`showModal`, `method: 'dialog'`, `returnValue`, `aria-labelledby`), popovers for menus, a toast region that exists before messages, and focus handling.
- **Rationale.** S7, U-C9, U-D8. The dashboard's body-appended toast host worked but was undocumented; the recipe keeps elements in the tree.
- **Rejected.** `portal(target, fn)`: ownership across DOM trees, focus management and one more export, while the top layer already removes the stacking reason.

### ADR-19 No refs
- **Decision.** Unchanged; `useRef`/`ref` are message-typed stubs.
- **Rationale.** Removes the React `useRef` / Vue `ref` confusion and an API surface: the element is a value.
- **Rejected.** `ref` props and callback refs (React/Solid priors; the `ref` prop is message-typed instead).

### ADR-20 Context (v2)
- **Decision.** `createContext<T = message>(name, ...defaultValue)`: without a type argument or default, using the context is a type error that says "name the type". `provide(context, value, fn: () => Node): Node`.
- **Rationale.** TS-08 (`createContext('Toast')` inferred `unknown`); A27 (`provide(Theme, 'dark', () => {})` compiled as a no-op).
- **Rejected.** `use` (React 19's `use(promise)` differs), `inject`, `capture()` (v1 reasons stand); a `PROVIDE_EMPTY_SCOPE` diagnostic (A27's proposal: the `() => Node` type catches it earlier).

### ADR-21 Router (v2, v3)
- **Decision.** Changes: (1) `RouterOptions.notFound` is required; unmatched link clicks go to the browser, an unmatched initial URL or `navigate()` renders `notFound`; a pattern that matches every path is rejected (`INVALID_ROUTE_PATTERN`, hint: use `notFound`); (2) `createRouter` throws `ROUTE_SHADOWED` when a pattern can never match because an earlier one matches all its paths; (3) `route<const P extends `/${string}`>(path, options: RouteOptions<NoInfer<P>, D>)`: the path alone infers `P`, so one view serves several patterns with the same params; (4) `:name(a|b)` gives a literal union; `href` accepts numbers; (5) `navigate()` resolves `NavigateResult` and never rejects for navigation outcomes; (6) `router.url` is `Signal<ReadonlyURL>`; (7) focus rule: first `[autofocus]` that passes `checkVisibility()` and is not inside a closed `dialog` or hidden popover, else the view's first `h1`, else `main`; if focus did not land, fall back to the next candidate; `VIEW_NO_HEADING` when the view has no candidate; (8) the route title is a binding owned by the view, written before the view's first effects run; a route without a title, `notFound` and the error view restore the title the document had when the router was created (v3), and a view may still set its own; the announcement uses the title, else the text of the view's first `h1` (v3); (9) a `navigate()` started while a loader runs supersedes that navigation, and `replace` replaces the entry being navigated to in both adapters (redirects and guards); (10) search-only navigations keep scroll and focus, and update `url` before `navigate()` returns (v3); (11) a view module that fails to load (`TypeError` from `import()`, typical after a deploy) triggers one full navigation to the target URL and `VIEW_IMPORT_FAILED`; (12) **v3:** `router.back(fallback)` traverses back one entry when the previous entry is this app's, else behaves as `navigate(fallback, { replace: true })`.
- **Rationale.** S4 (the taught catch-all intercepted server URLs), A29, TS-04 and U-C ("one view for two routes"), S19, TS-12, U-C6/A16, S14/A15, U-C2 (focus went to a Cancel button inside a closed dialog), U-T9, S13 and U-C (per-record titles), S5, U-T (scroll on filter tabs), M1. v3: U-K4 (closing a routed dialog pushed a new entry, so Back reopened it; only the router knows whether the previous entry is the app's, and AGENTS.md forbids `history`); U-K11/U-CH5 (title-less views left a stale title behind; resetting in the router removes the cleanup every view would need); U-KA11 (the announcement was undefined when focus landed on a non-heading `[autofocus]`); U-KA13 (a search navigation that updated `url` asynchronously would drop keystrokes in an input bound to it).
- **Rejected.** Specificity ranking instead of table order (a silent reordering of a documented rule; `ROUTE_SHADOWED` makes the order mistake loud); a `base` option now (M10: deferred, additive later because the default stays `/`); nested layouts, `beforeLeave`, view transitions (S19, deferred with recipes); v3: overlay routes (`route(path, { view, over: '/' })`, U-K5) and a per-navigation `scroll` option: a detail over a list goes on the list's route as a search param, which already keeps the list mounted, its scroll and its focus (B17.7), and the dialog returns focus to its opener; `title: (data, params) => string` (U-CH5: the router reset plus an `onMount` or effect in the view covers param-only titles); `href()` with a search argument (concatenating `router.url().search` is one expression).

### ADR-22 No stores, no `query`, no `form` in v1 (unchanged)
- **Decision.** Unchanged. The form patterns the reviews asked for (native validity, radio groups, number inputs, focus-safe submit) are recipes, not a module.
- **Rationale.** §9, §10, §17: ship later unless the eval needs it; every module costs AGENTS.md bytes. The usability runs needed forms, not a form module: every form issue they hit (validity, focus, disabled buttons) was native behaviour, now in RECIPES.
- **Rejected.** A `form(schema)` module and a `query` cache in v1 (no usability task needed caching; forms needed documentation, not an abstraction).

### ADR-23 Styling (v2)
- **Decision.** `css(strings: TemplateStringsArray)`: interpolation is a type error (`TS2554 Expected 1 arguments, but got 2`). Sheets are global; the JSDoc and AGENTS.md say the author puts the component class on the root (no automatic stamping). `style` leaves accept `undefined` (removes).
- **Rationale.** A09 (interpolations were evaluated once per call site: every instance got the first instance's colour); U-T/U-W doc ambiguity ("component-named classes" read as automatic).
- **Rejected.** `CSS_SELECTOR_COLLISION` (A10, deferred: needs sheet parsing; the naming convention plus review suffice for v1).

### ADR-24 Diagnostics (v2, v3)
- **Decision.** Slugs, one code per problem, event shape unchanged. Policy for heuristics (warnings fail tests): a warn-level check must have no known false positive on correct code; checks that failed this were replaced (`ROWS_RECREATED` → `UNSTABLE_KEY`) or narrowed (`INTERACTIVE_NO_NAME` skips `input[type=hidden]`, counts submit/reset defaults, and now also checks `dialog`, `meter`, `progress`). The message footer carries one pointer, the repair-guide path (the `jasno explain` footer is gone).
- **Rationale.** R11/S10/U-T10, S17, U-C9/U-D10.
- **v3.** U-CH1 reported `EFFECT_WRITES_STATE` as a false positive for a subscription whose source emits synchronously. Resolved by stating the rule the check enforces (ADR-12: no signal writes during an effect run, callbacks included; subscriptions go in `onMount`) and naming the alternative in the hint, not by weakening the check: under the documented rule the report is correct, and the silent async case is a false negative, which the policy tolerates. The new `KEY_ACTIVATES_NEW_FOCUS` fires only when the Enter key's own activation will reach an element that Enter activates or types into, so a correct handler (one that calls `preventDefault()`, or moves focus to a heading) never triggers it.
- **Review 2026-09-26.** `FOCUS_STYLE_REMOVED` fired on correct CSS (`button { outline: none } button:focus { outline: 2px solid }`, and `all: unset` on elements that never take focus), breaking this policy. It now checks only rules whose selector reaches an interactive element and accepts any focus-state rule, in any template (sheets are global), that changes more than the outline: outline, box-shadow, border, background, color or text-decoration ((c)). Class selectors the file never puts on an interactive `h.*` tag, and a focus rule that restyles a different element, are tolerated false negatives.
- **Rejected.** Numeric codes (§13); heuristic checks that fire on correct code (they train agents to mute diagnostics, A33); info-level codes no test ever sees (S17).

### ADR-25 Dev and prod builds (v2)
- **Decision.** Unchanged selection (export conditions). Reporting: jasno reports uncaught reactive errors through `globalThis.reportError` when present, else `queueMicrotask(() => { throw error })`; the flush always continues; jasno never mutates user error objects (the scheduling write is kept in a `WeakMap` and shown by `__JASNO__.why()`).
- **Rationale.** R10 (`reportError` is missing in Node 25.1 and happy-dom 20.14.5, so test-rung errors turned into `TypeError`s), m6.
- **Rejected.** Calling `globalThis.reportError` unguarded (missing in Node and happy-dom, R10); decorating user errors with `cause` (m6); a `node`-condition server build (§7: it silently disabled Solid's diagnostics in tests).

### ADR-26 Toolchain and the static gate (v2)
- **Decision.** Two TypeScript programs: `tsconfig.json` (browser: `src` without tests, `types: []`) and `tsconfig.test.json` (tests and e2e, `types: ["node"]`); `jasno check` runs both; the `/// <reference types="node" />` convention is gone. npm `dependencies` are imported by bare name (ADR-35); `#name` imports remain for app aliases and `#config` (conditional: `development` for `jasno dev` and tests, `default` for `jasno dist`). TypeScript is pinned `~7.0.2`; `jasno check` prints the loaded version and fails outside the tested range (`TS_VERSION_UNSUPPORTED`); `TYPE_RULES_UNAVAILABLE` is a warning that fails under `--strict` or `CI`.
- **Rationale.** C1 (critical, verified: a test file's triple-slash reference gave every browser file Node globals, so `process.env.X` type-checked and `setTimeout()` returned `Timeout`), M2, M3, M9, U-W10.
- **Rejected.** One program with a triple-slash Node reference in test files (C1); `moduleResolution: bundler` (§6: accepts extensionless imports that fail in the browser); a tsconfig `paths` mirror for dependencies (a second source of truth).

### ADR-27 Testing (v2, v3)
- **Decision.** Unchanged ladder. `mountTest` additionally: records uncaught reactive errors and fails the test with them (`UNCAUGHT_ERROR`, owner path attached); restores every signal created outside any owner to its initial value when the test ends; accepts in `expect` only codes that can occur in correct code. `settled()` uses timers captured at import, so `mock.timers` cannot hang it. The test script names its files: `"src/**/*.test.ts"`.
- **v3.** Detached roots (`createRoot` with no current owner, i.e. module-level app data in `src/state.ts`) are app-lifetime: `EFFECT_LEAKED` never counts them, even when their module is first imported during a test (a lazy view import), and B19.5 does not reset them; a test that needs their data fresh calls `reload()` after stubbing `fetch` (U-KA7).
- **Review 2026-09-26.** B19.6 said `settled()` waits for flush, loaders and navigations only, while AGENTS.md and the example test awaited it for an async submit; the example passed only because its fake save settled in microtasks. `settled()` now also waits for promises returned by `on*` handlers (B15.7, B19.6). B19.5 now says what is not reset: plain module variables and what detached roots own; test-order dependence is listed as a risk.
- **Rationale.** R10, m11/A31 (module state leaked across files under `--test-isolation=none`), A33 (`expect` as a mute), A32, M7.
- **Rejected.** A failing `MODULE_STATE_WRITTEN` warning (A31: restoring is deterministic and needs no action); `{ code, because }` objects in `expect` (A33's alternative adds friction, not prevention); Vitest browser mode (hard Vite dependency, §14).

### ADR-28 SVG through `svg()` (v2, replaces "no SVG")
- **Decision.** `svg<K extends keyof SVGElementTagNameMap>(tag, attributes: SvgAttributes | null, ...children): SVGElementTagNameMap[K]`. Attributes are an open record set with `setAttribute` in the SVG namespace (live when a function); `on*` keys add listeners with a plain `Event`. Custom elements stay deferred.
- **Rationale.** S2: icons and charts are everyday SPA work, and without SVG the only path was `innerHTML`, which the production CSP blocks (A34). An open attribute record is the honest trade-off: SVG DOM properties are `SVGAnimated*` objects, so closed props cannot be derived (v1 ADR-28).
- **Rejected.** A hand-written closed SVG attribute table (maintenance); `h.custom(tag, props)` for custom elements (S2's second half; deferred: no usability or eval task used a web component, and `document.createElement` plus `onMount`/`effect` is the documented workaround).

### ADR-29 Honest unbundled delivery (v2)
- **Decision.** `jasno dist` still only erases types. v2: content hashes go into file names in the same directory (`src/views/user.3f2c1a9b0d.js`), so relative resolution and line/column mapping hold and immutable caching is expressible per path; published files come from an allowlist (index.html, `assets/**`, non-test `src/**/*.ts` stripped, dependency closures, jasno's own files), never dotfiles; `--keep N` keeps the previous deploys' hashed files; `_redirects` and `404.html` provide the SPA fallback; `jasno dist --list` prints what ships.
- **Rationale.** M1 (`?v=` cannot serve two versions; a stale tab failed integrity on the first lazy route after a deploy), C3 (critical, verified: the prototype published `.env`, `.git/config` and test files), M5.
- **Rejected.** `?v=` query busting (M1); publishing everything except a denylist (C3: a denylist misses the next secret); a `--blank-comments` option for now (2026-09-27, deferred to phase 4: the byte win is real on comment-heavy files, 32% of brotli in the §7 measurement, but a correct comment blanker needs a tokenizer that tells a regex from a division; the candidate is the project's own TypeScript API, whose syntax tree gives exact comment ranges; it returns when the module budget or the eval shows shipped comment bytes mattering).

### ADR-30 The docs channel: AGENTS.md plus a RECIPES block (v2, v3)
- **Decision.** AGENTS.md (≤ 8,192 bytes) holds the rules and the examples; the RECIPES block at the top of `jasno.d.ts` holds patterns that are not one function (forms, mutations, dialog, popover, toasts, focus, polling, debounce, keep-last-value, search params, guards, loader vs resource, per-record titles, tabs, lazy components, app-wide state, timers, persistence, render-function children, selection, row labels, icons, animation, widgets, config). The package also ships the recipes as `docs/recipes/*.md`, the same text as the RECIPES block, which AGENTS.md points to (v3: AGENTS.md has no room for a separate index line, V2-13). v3 adds inline edit, per-param lifecycle, detail over a list, optimistic saves, a dev backend and chat/log lists to the block, and corrects the optimistic-save and `autofocus` guidance. The top-mistakes table lists only mistakes tsc accepts.
- **Rationale.** S1 (critical: no room and no place for native patterns), G02 (v1 spent six table rows on mistakes that already had self-explaining errors), §16 (docs index effect, examples matter most). The usability harness gives agents only AGENTS.md and jasno.d.ts (plus jasno.elements.d.ts for tsc), so recipes must be in one of the first two; jasno.d.ts has no byte budget. Review 2026-09-26: the generated element props (half the file) moved to `jasno.elements.d.ts`, which jasno.d.ts references, so the part an agent reads is 49.5 KB: 17.0 KB of RECIPES and the hand-written API. Every recipe snippet compiles (`tools/agents-samples/recipes.ts`).
- **Rejected.** A docs index pointing only to `node_modules/jasno/docs` (invisible to sandboxed agents without the package); growing AGENTS.md past 8 KB (§15 priority 7).

### ADR-31 `selector()` restored (new)
- **Decision.** `selector<K>(source: Read<K>): (key: K) => boolean`; a call is a tracked read that depends only on whether `source() === key` flips. Also: a binding whose new value is `Object.is`-equal to the last applied value does not touch the DOM (B15.3).
- **Rationale.** U-D3 (the dashboard's "efficient selection" requirement was O(N) with no documented alternative); the digest marked `selector` Firm (§0, §5) and v1 dropped it without an ADR.
- **Rejected.** Per-row comparisons only (O(N) closure runs per change, U-D3); an app-maintained map of boolean signals (a hand-rolled selector every app would repeat).

### ADR-32 Message-typed stubs for names from other frameworks (new)
- **Decision.** `jasno.d.ts` declares never-callable constants whose type is the fix: `batch`, `createSignal`, `useState`, `createMemo`, `useMemo`, `createEffect`, `useEffect`, `createResource`, `useRef`, `ref`, `onCleanup`, `onDestroy`, `render`, `For`, `Show`. The runtime does not export them, so an unused import fails at load with the name visible.
- **Rationale.** S9: tsc suggested `match` for `batch`, a different primitive; other leaked names got a bare TS2305. Verified: `batch(() => {})` prints `'jasno: no batch(); writes apply at once, ...'` (appendix E1). Zero AGENTS.md bytes.
- **Rejected.** Runtime throwing stubs (would make the bogus import load; the type error is earlier and the load error louder).

### ADR-33 Focus is a framework concern (v2, v3)
- **Decision.** jasno restores focus where jasno moved or removed nodes: the router (ADR-21 rule 7), `catchError` swaps (ADR-16), keyed moves on engines without `moveBefore` (re-focus after `insertBefore`, B11.4). Everything else is reported: `FOCUS_LOST` (dev warn) when a flush disabled, hid or removed the focused element and nothing moved focus by the end of the task; `VIEW_NO_HEADING` when a routed view gives the router nothing to focus. **v3:** `KEY_ACTIVATES_NEW_FOCUS` (dev warn, B15.7) when an Enter keydown handler returns without `preventDefault()` and focus moves, in the handler or the flush it scheduled, to an element Enter activates or types into; `FOCUS_STYLE_REMOVED` (`jasno check` warn) when a `css` rule removes the outline (`outline: none`/`0`, `all: unset`/`initial`/`revert`) from a selector that reaches an interactive element and no focus-state rule in the program shows focus another way (narrowed after the 2026-09-26 review, ADR-24).
- **Rationale.** Focus loss appeared in every usability review (U-C2, U-C5, U-T8, U-D4, U-D5, U-W2, U-W3), and v1's own example taught `disabled: saving` on the focused submit button. jasno performs these DOM operations, so it can detect them exactly. v3: jasno's microtask flush runs between a key's `keydown` and its `keypress`, so a focus move made "the jasno way" (in `onMount`) lands before Chromium dispatches the keypress, which then clicks the new button (U-K1, reproduced; Firefox is not affected, and happy-dom simulates neither, so only a check in the handler wrapper sees it at rung 2). jasno's own recipes move focus programmatically, so they owe a visible indicator (U-K6; v2 rejected the same finding as app CSS, U-D7). v2's example still dropped focus in two places (toast dismiss, "Show more", V2-03/V2-04); both are fixed and the second is now asserted in a test.
- **Rejected.** Moving focus automatically into every `show`/`match` swap (the right target is app-specific; a wrong automatic target is worse than a reported loss); leaving focus entirely to apps (every usability review found focus loss).

### ADR-34 The dev server is local, allowlisted and CSP-identical (new)
- **Decision.** `jasno dev` binds `127.0.0.1`/`::1` (`--host` opts in with a warning), serves an allowlist (index.html, `src/`, `assets/`, the packages the module graph resolves, jasno's files), rejects dot segments, answers 403 unless `Host` is a loopback name, `*.localhost` or an IP literal (with `--host` also the machine's own name), accepts `/__jasno/log` only from its own origin with a size cap and strips control characters before printing, sends the production CSP (Trusted Types included; its own inline scripts by hash), serves `index.html` for extension-less HTML requests (SPA fallback), watches only served files, skips live reload under `navigator.webdriver`, and verifies a recorded server with `GET /__jasno/ping` before reusing it.
- **Rationale.** C2 (critical, verified: the prototype listened on all interfaces and served `.env` and `.git/config`, also to a forged `Host`), A34/M4 (`innerHTML` worked in dev and threw in production), M5, m3, m4.
- **Rejected.** Serving the whole project directory behind a traversal guard (the prototype leaked `.env` and `.git`, C2); a dev server without the production CSP (A34: Trusted Types violations surfaced only after deploy).

### ADR-35 npm dependencies without a bundler (new)
- **Decision.** Packages in `dependencies` are imported by bare name. `jasno dev` resolves them with Node's resolver (conditions `browser`, `import`, `development`, `default`) and serves them under `/@dep/<name>@<version>/`; `jasno dist` copies each package's static import closure to `dist/_deps/<name>@<version>/` with hashed names and integrity; the import map maps every bare specifier those files use. A closure containing CommonJS, `process.env` or unresolvable bare imports fails with `DEP_NOT_BROWSER_ESM`. Budgets count dependency modules per package.
- **Rationale.** M2/S11: "vendored browser-ready ESM as `#name`" required a bundler for real packages (zod's ESM closure is 95 modules) and could not express packages that import siblings by name (CodeMirror). Verified: `"imports": {"#zod": "zod"}` type-checks and runs in Node without vendoring, so the resolution already exists; v2 drops the `#` indirection for packages to match the agents' prior (`import { z } from 'zod'`).
- **Rejected.** `jasno vendor` building single files (a bundler for dependencies; S11 alternative); keeping `#name` for packages (fights the prior, adds a hallucination surface).

### ADR-36 Package name `jasno`, commands through npm scripts (updated 2026-09-26)
- **Decision.** The package and CLI are `jasno` (owner's decision, 2026-09-26; `ff` was the working name). AGENTS.md and diagnostics still use `npm run check`, `npm test`, `npm run dev`, which resolve only the local binary, never `npx jasno`.
- **Rationale.** S12: the npm name `ff` is taken (a 2012 flow-control package, no bin), so `npx ff` in a fresh sandbox would fetch it; `ff` also matches `effect`, `diff` and `buffer` under grep. `jasno` means "clearly" in Polish, Czech, Slovak and Serbo-Croatian (Russian "ясно"). Checked 2026-09-26: `jasno` and the `@jasno` scope are free on npm; jasno.dev and jasno.org have no DNS records (jasno.io is registered); GitHub has only a few zero-star repositories with the name, so models carry no API prior for it; it has no `-js` suffix an agent could drop onto someone else's package.
- **Rejected.** `clearbox` (Clearbox AI and other projects use the name; longer CLI), `tochno` (Russian only; tochno.st exists), `yasno` (a Ukrainian energy brand), `unbuilt` (unbuilt.app, a frontend tool), `kerf` (the Kerf database language; `kerfjs` is taken), `overt`/`lucid`/`plumb`/`verbatim`/`legible`/`candor` (taken on npm); `npx jasno` in docs (S12).

### Eval plan (pre-1.0 gate)
- **Decision 2026-09-30: the arms are decided without the formal eval.** A `h.div(props, ...children)`; B lowercase `onclick`; C Angular names where the meaning matches, jasno names otherwise; D `Read<T>` data props; E microtask flush (ADR-10); F the full `resource` status set; G `each(list, { key, render })`; H frozen signal values. Evidence instead of the powered eval: six pilot apps rebuilt from AGENTS.md and `jasno.d.ts` alone with no leaked idioms or arm-specific failures; a calibration against React and Solid (all nine apps at 100% of hidden tests); a second vendor's model (`grok-4.7`) at the same quality as its React builds (changelog "Stack comparison"). None of these compared the variants of one arm, so the choices rest on the design's reasoning plus the absence of observed failures. A variant that post-v1 data shows to cost agents goes through the version policy (a stub with the replacement name, plus a codemod). The plan below stays as the method for such a check.
- **Harness, conditions, models, power, decision rule:** unchanged from v1 (§16).
- **Arms:** A `h.div` vs `h('div')`; B `onclick` vs `onClick`; C Angular-exact vs fresh names vs jasno; D `Read<T>` vs `MaybeRead<T>` component props; E sync vs microtask flush (confirmation only: microtask decided 2026-09-26, ADR-10); F resource status full vs small; **G (new)** `each(list, { key, render })` vs positional; **H (new)** frozen signal values vs plain (measure mutation bugs vs friction in generic code).
- **Metrics (additions):** `untracked` calls per component (replaces `UNTRACKED_IN_SETUP`), `FOCUS_LOST`/`VIEW_NO_HEADING`/`KEY_ACTIVATES_NEW_FOCUS` rates in Playwright runs, hand-written import maps, `value()!` usage, stale `set()` after `await`, rollback by `reload()`, subscriptions inside `effect()`.
- **Review 2026-09-26 additions.** (1) A mandatory reference arm on a familiar stack (React with JSX and Vite, TypeScript, Testing Library), with the same tools and an agent guide of the same size, so the result measures jasno against the alternative and not only its own syntax variants. (2) Tasks that change an existing app, scored by hidden regression tests as well as the new behaviour. (3) A hidden rung on the production build (`jasno dist` plus `jasno preview`). (4) Task sets: the tasks listed below are the development set used to tune AGENTS.md and RECIPES; a held-out set is written before the eval by people who have not seen RECIPES, frozen, never used for tuning, and reported separately. (5) Cost metrics: wall-clock time, tokens, iterations to green, context read (bytes of jasno docs opened), whether the needed recipe was found, and the number of distinct rules or recipes a solution needed.
- **Tasks (additions from the usability runs):** mutation after await on a kept-mounted view, filtered lists with row state, polling with slow responses, a wizard with focus management, a dialog confirmation; v3: inline edit with Enter/Escape, overlapping optimistic saves with a failing network, a detail dialog over a list that Back closes, a per-room subscription whose source emits on subscribe.

---

## (b) Semantics

Terms. *Signal*: writable source (`signal`, `linkedSignal`). *Derivation*: a `computed` or linkedSignal computation, resource params, the user function of a binding (live element prop, function child, `show`/`match`/`each` source), an `each` key function, a `selector` source. *Binding*: an internal consumer made of a user function (a derivation) and an apply half (jasno's DOM writes). *Consumer*: a derivation, binding or effect. *Setup*: a component body, a control-flow or `catchError` builder, the `mount` view function, a route view's body. *Owner*: B6.1. *Round*, *phase (a)*, *phase (b)*: B4.3.

### B1 Reactive graph
1. A read of a signal, computation or resource field records an edge only while a consumer runs. Reads anywhere else (setup, handlers, timers, `untracked`, `onMount`, cleanups, loaders) record nothing.
2. Dependencies are dynamic: a run's edges replace the previous run's.
3. Computeds and linkedSignals are lazy. While a computed has at least one observer it is cached and recomputed only when read after a source changed. A computed with no observers recomputes on every read and keeps no links to its sources after the read, so a computed created in a handler is garbage once unreferenced.
4. Glitch-free: a consumer sees every computed consistent with all writes made before its run, and no consumer runs twice in a round because several sources changed.
5. Derivations run with no current owner (B6.11).
6. The graph core is alien-signals' `createReactiveSystem` with eight behaviours pinned by regression tests (ADR-11).

### B2 Equality
1. Default equality is `Object.is`. `set(v)` with an equal value is a no-op: nothing is notified or scheduled.
2. `equal(a, b)` replaces `Object.is` for its node; `equal: () => false` always notifies.
3. When a computation's new value is equal to its previous one, its consumers are not re-run.
4. `update(fn)` is `set(fn(current))` with `current` read untracked.
5. `equal` runs untracked and must be pure; if it throws, the write throws and the value is unchanged.
6. Mutating an object held by a signal is invisible to jasno. `signal()` and `resource()` values type arrays, Maps and Sets as readonly (ADR-07) so the common mutations do not compile.
7. linkedSignal compares successive `source()` values with `Object.is`; resource params use B9.3.

### B3 Read-your-writes
1. After `s.set(v)` returns, `s()` is `v` and every computation depending on `s` yields a value consistent with `v` on its next read.
2. Writes never run bindings or effects synchronously; they schedule them (B4). The one derivation a write runs is a `selector` source that depends on the written signal (B21.4).
3. Resource state derives synchronously from params (B9.4).
4. Lagging Reads: builder-provided Reads (`each` item and index, `show` value) and router state (`params`, `data`) are updated by their binding in the next flush (a search-only `navigate()` updates `url` before returning, B17.7). Between a write and that flush they return the previous value. In a handler that writes and then needs the new value, read the source (the list, the signal), not the builder Read.
5. `set()`/`update()` on a linkedSignal first settle a pending recomputation (the source changed but was not read yet), then store the local value; a local write made after a source change therefore survives the next read.

### B4 Scheduling and flush order
1. A write that dirties a binding or effect schedules one flush with `queueMicrotask` (at most one pending).
2. `flush()`: outside a flush it runs the pending flush now (no-op if none). Called during phase (b) (an effect or `onMount` run) or from a handler dispatched synchronously during a flush, it drains phase (a) and returns; phase (b) work stays queued for the running flush. Called in a derivation or setup it throws `FLUSH_REENTRANT` in both builds.
3. A flush repeats rounds until no work remains. **Phase (a):** dirty bindings form a queue ordered by creation sequence; jasno repeatedly runs the lowest-sequence dirty binding until the queue is empty. Bindings dirtied during phase (a), such as row item signals set by an `each` list binding or a `show` value, join the queue and run in the same phase; a binding with a lower sequence that is dirtied again runs again before phase (b). Bindings of owners disposed during the phase are dropped. **Phase (b):** pending first runs (new effects, `onMount` callbacks) and dirty effects run in creation order. Writes during phase (b) that dirty consumers start another round.
4. Computations are never scheduled; they are pulled when read (a `selector` source is pulled by the write, B21.4).
5. A binding's user function is a derivation (B5.1 applies); its apply half performs jasno's DOM writes; builders called by the apply half (`show`/`match`/`each` rendering) follow the setup rules (B5.4, B12).
6. Loop cap: a consumer running more than 100 times in one flush, or a flush reaching round 101, throws `EFFECT_LOOP` (both builds) naming the consumers that ran most, with locations in dev. The queue is cleared, but dropped consumers keep their subscriptions and are re-armed, so their next source change schedules them; the message lists bindings whose DOM may be stale. A microtask flush reports the error (B8.3); `flush()` throws it to its caller.
7. First runs: a binding evaluates synchronously at creation, so a component's DOM is complete when it returns. An effect or `onMount` created outside a flush first runs in the next flush's phase (b); one created during a flush first runs in phase (b) of the same flush.
8. Effects run after the bindings of their round: they see the updated DOM and may measure layout.
9. Dev: the stack of the first write that scheduled a consumer is captured lazily. When that consumer throws, the write is associated with the error in a `WeakMap` and reported by `__JASNO__.why()`; user error objects are never modified.
10. Dev async-loop guard: consecutive microtask flushes with no macrotask between them are counted (reset by a `MessageChannel` ping); above 1,000, `EFFECT_LOOP` is thrown naming the consumers that ran most (a loop through `.then` in an effect otherwise freezes the tab); the queue is then cleared and dropped consumers are re-armed, as in B4.6.

### B5 Writes in derivations, effects and setup
1. A write inside a derivation throws `WRITE_IN_DERIVATION` (both builds) naming the signal and the derivation. `untracked` does not exempt it.
2. Writes in `onMount`, event handlers, timers, promise callbacks and cleanups are allowed and silent.
3. A write during an effect's synchronous run is applied. If the signal has observers (or the effect read it), dev reports `EFFECT_WRITES_STATE` once per (effect, signal), whatever the call site. If the effect read the signal in the same run, the effect is queued again for the next round and must converge within the cap. The synchronous run includes callbacks that other code invokes before the effect function returns (a source that emits its current state on subscribe); their reads are tracked by the effect too. Subscriptions whose callbacks write signals belong in `onMount` (B5.2, B6.9), per route param inside a `match` branch keyed on the param.
4. Setup may write signals created in the same setup. Writing any other signal is applied and reported `WRITE_IN_SETUP` (dev warn); `untracked()` does not exempt it (it exempts reads, B12.2, not writes).
5. A write to a signal whose creating owner is disposed is applied and silent.
6. linkedSignal: on read, if `source()` differs (B2.7) from the source value used last, jasno computes `computation(newSource, { source: oldSource, value: current })` untracked and stores it; `set`/`update` store a local value (after B3.5) that persists until the source value changes. The first read calls `computation(source, undefined)`.

### B6 Ownership and disposal
1. Owners: the `mount` root, `createRoot`, each component call, each `show`/`match` branch, each `each` row, each effect run, each `catchError` try and fallback region, the router outlet and its current view, each `provide` scope.
2. Everything created while an owner is current (computations, effects, bindings, resources, `onMount` registrations, nested owners) belongs to it. Signals hold nothing to dispose; in dev they keep a small token (disposed flag, owner path) of their creating owner for B5.4. An owner created under an owner that is already disposed or disposing (an effect created after its run called `stop()`, work started in `onMount` after its owner was disposed) is disposed at once: none of its effects, `onMount` callbacks or resource requests run and its bindings never re-run (a component body called there still runs as setup and evaluates its bindings once).
3. Disposing an owner: (1) mark it disposed, so its consumers leave the queue and never run again; (2) dispose its child owners in reverse creation order, recursively; (3) abort its `AbortSignal` with a `DOMException` named `AbortError`; (4) run its cleanups (those returned by its latest effect run and by its `onMount` callbacks) in reverse registration order, each at most once, untracked, with no current owner and no strict label; (5) unlink its consumers from their sources and flag its computeds as disposed: a later read evaluates untracked and caches or links nothing. A throwing cleanup is reported (B8.3) and does not stop the remaining steps. A disposed owner drops its references to children, cleanups and context values.
4. Before an effect re-runs, the previous run's owner is disposed (B6.3).
5. Self-disposal: an owner disposed during its own effect or `onMount` run is marked disposed and its `AbortSignal` aborts immediately; the cleanup that run returns is called as soon as the run returns. `stop()`, `dispose()` and `unmount()` are idempotent.
6. Disposal never removes DOM nodes; the region that owns them (`show`, `match`, `each`, `catchError`, outlet, `mount`) removes them after disposing the owner.
7. `createRoot(fn)` creates an owner that is a child of the current owner if there is one, otherwise detached; `dispose` ends it early; `fn` runs untracked and its result is returned. A detached root is app-lifetime by definition: `jasno/testing` neither reports nor resets it (B19.4, B19.5).
8. Creating an effect, `onMount`, resource or component with no current owner reports `NO_OWNER` (dev warn). Such an effect lives until its `stop()`.
9. `onMount` callbacks run with their registering owner current (effects and resources created there belong to it and context lookups work), untracked and without a strict label.
10. Event handlers, timers and code after `await` run with no current owner.
11. Derivations run with no current owner: creating an effect, resource, component, `onMount`, root or `mount()` inside one throws `OWNED_IN_DERIVATION` (both builds).

### B7 AbortSignal per owner and effect run
1. Every owner has an `AbortSignal` (created on first use). An effect run's `abortSignal` belongs to that run: aborted before the next run and on disposal. `onMount`'s `abortSignal` belongs to its owner.
2. A resource loader's `abortSignal` aborts when params change, when `reload()` or `set()` supersedes the request, and when the resource's owner is disposed.
3. A router loader's `abortSignal` is `AbortSignal.any([navigation signal, outlet owner signal])`.
4. jasno's abort reasons are `DOMException`s named `AbortError`. A settlement is ignored when its request is no longer current or jasno aborted its signal. Every other rejection, including an `AbortError` from the loader's own controller or timeout, is an error state (resource) or a failed navigation (router).

### B8 Errors and boundaries
1. A computation that throws caches the error: while it has observers, every read rethrows the same object until a source changes. A computation with no observers recomputes on every read (B1.3), so a pure one throws an equal error again, not the same object.
2. Errors thrown synchronously by setup propagate up the JavaScript stack: the nearest `catchError` whose `tryFn` is on the stack catches them; `mount` disposes its root and rethrows. A binding's first evaluation (at creation) is part of setup.
3. Errors thrown by later binding runs, effect runs, `onMount`, cleanups or resource internals go to the nearest `catchError` region up the owner tree (the router outlet is one). With none, jasno calls its `report(error)`: `globalThis.reportError(error)` when it exists, else `queueMicrotask(() => { throw error; })`, in both builds. `jasno/testing` replaces `report` with its recorder (B19.3).
4. A consumer that threw stays subscribed to what it read before throwing; the flush continues; there is no global halt.
5. `catchError(tryFn, fallback)`: `tryFn` runs in a child owner. On an error the try owner is disposed and its nodes removed, then `fallback(error, reset)` renders in place under a new owner; further errors from the disposed subtree in the same flush are dropped; errors thrown by `fallback` go to the next region up. `reset()` disposes the fallback and runs `tryFn` again from scratch (setup re-runs) in the next flush. If `document.activeElement` was inside the removed nodes (in either direction: an error swap or `reset()`), jasno focuses, after inserting the new content, its first focusable element, else its first element (given `tabindex="-1"`, as the router does in B17.8, so an alert text is read out); content that is only text cannot take focus, and `FOCUS_LOST` is reported with the hint to wrap it in an element.
6. Event-handler errors are not routed: they propagate like any DOM listener error.
7. Errors jasno creates carry their `Diagnostic` as `error.diag` and their scheduling write as `error.cause`, set at construction. jasno never adds properties to user errors or thrown non-errors.
8. A loader rejection is state, not a throw (B9.6); reading `value()` in `error` throws the loader's error at the reader, which then follows B8.2/B8.3.
9. Region guards: every builder call (a `show`/`match` branch, an `each` row, a `catchError` fallback, a route view) runs in a guard. If it throws, its partial owner is disposed, none of its nodes are inserted, and for `each` the key is not recorded, so the next update retries that row; the rest of the reconciliation completes, so DOM order still equals list order; then the error is routed by B8.2 (first evaluation) or B8.3.

### B9 Resource state machine and races
1. `resource()` creates, under the current owner, a params computation, a request record `{ params, version, outcome }` and a request binding.
2. Without `params`, the resource behaves as if `params()` returned a constant defined value: it loads once at creation and again on `reload()`.
3. Params equality: successive params values compare with `Object.is`, except that plain objects and arrays compare one level deep (same keys or length, `Object.is` per member).
4. The state is a pure function of `params()` and the request record: `params()` undefined gives `idle`; params equal to the record's params give the record's outcome (`loading`, `reloading`, `resolved`, `error` or `local`); otherwise `loading` with no value. Status and value therefore read-your-writes against params. A params function that throws gives `error` with that error, aborts and forgets the current request, and starts no request. When params become undefined the request is forgotten too, so returning to the same params later starts as `loading` (B9.14), never with the old outcome.
5. The request binding evaluates params at creation (to link) and runs in phase (a) when params changed: it aborts the current request, increments the version, and calls the loader through `Promise.try(loader, { params, abortSignal })`, untracked and outside any setup region, so a synchronous throw becomes a rejection.
6. A settlement counts only if its request is current and jasno did not abort it (B7.4): a fulfilment gives `resolved` with the value; a rejection gives `error` with the reason and no value, also when the request came from `reload()` (the value kept during `reloading` is dropped from `value()`, as in Angular's resource; `latest()` keeps it, B9.9). A rollback therefore never relies on a reload: the recipe undoes a failed optimistic `set()` with `set()`.
7. `reload()`: a no-op while `params()` is undefined or after disposal; otherwise it aborts the current request, keeps the value, sets `reloading` if a value is held (else `loading`) and starts a request in the next flush.
8. `set(v)`: a no-op while `params()` is undefined or after disposal. Otherwise it aborts the current request and stores `local` with value `v` for the current params. Dev: `set()` while the status is `loading` reports `RESOURCE_SET_WHILE_LOADING`, because such a value almost always belongs to params that are no longer current.
9. `value()` returns the value and throws the stored error in `error`. `hasValue()` is a tracked read, true in `resolved`, `local` and `reloading` with a value. `isLoading()` is true in `loading` and `reloading`. `error()` is the stored error in `error`, else `undefined`. `latest()` is a tracked read that never throws: the value while one is held; in `error`, and in the `loading` that a `reload()` starts from `error`, the value the current params held before the failed request; `undefined` in `idle`, before the first value, and after a params change, so another params' value never shows. Decided 2026-09-28 (open question 13): `value()` keeps Angular's meaning, and the last known value is a separate, explicit read; the name and meaning are Solid's `resource.latest`.
10. Disposing the owner aborts the current request; later settlements are ignored.
11. Reading `value()` in a setup region while `idle` or `loading` throws `PENDING_READ_UNTRACKED` (dev).
12. Loaders resolve `null`, not `undefined`, for "no data" (type-enforced: `T extends {} | null`).
13. Dev: a signal read during the synchronous part of a loader reports `LOADER_READ_UNTRACKED`; reads inside `untracked()` there are silent.
14. Transitions (rows: current status; columns: event):

| from \ event | params → undefined | params change | `reload()` | `set(v)` | current request fulfils | current request rejects |
|---|---|---|---|---|---|---|
| idle | idle | loading | idle | idle | – | – |
| loading | idle | loading | loading | local (warns) | resolved | error |
| reloading | idle | loading | reloading | local | resolved | error |
| resolved | idle | loading | reloading | local | – | – |
| error | idle | loading | loading | local | – | – |
| local | idle | loading | reloading | local | – | – |

### B10 `show` and `match`
1. `show(when, then, otherwise?)`: `when` is a binding. While `when()` is truthy the region shows `then(value)`; while falsy, `otherwise()` or nothing. A branch is built at creation and whenever truthiness flips, never otherwise. `value()` returns the latest truthy value of `when()`.
2. `match(key, render)`: `key` is a binding; whenever `key()` changes (`Object.is`), the current branch is disposed and `render(newKey)` builds the next one.
3. Builders run untracked, under a new owner, in the region `<Component> › show` (or `› match`), inside a guard (B8.9).
4. A region sits between two empty Text nodes, invisible in `innerHTML` and ARIA snapshots.
5. Switching: dispose the old branch owner (everything created in it dies: signals, resources, `onMount` work), remove its nodes, build the new branch, insert its nodes before the end marker. A `DocumentFragment` result contributes the child nodes it had when inserted.
6. Dev: a builder (a `show`/`match` branch, an `each` row, B8.9) returning a Node created outside the builder (its creating owner is not the branch or row owner or a descendant) reports `NODE_OUTSIDE_REGION`: its bindings would outlive the branch and a boundary could not catch its errors.

### B11 `each`: reconciliation and row identity
1. `list` is a binding. On each run jasno reads the new array and computes keys with `key(item, index)`, untracked. Dev: for each new or changed item the key function is called twice; different results report `UNSTABLE_KEY`.
2. A key present before and after keeps its row (owner, nodes, DOM state); the row's item signal is set to the new item (same object: no notification) and its index signal to the new index, during phase (a) (B3.4).
3. For a new key, `render(item, index, key)` runs untracked under a new row owner in the region `<Component> › each row`, guarded (B8.9). For a removed key, the row owner is disposed (everything the row created dies), then its nodes are removed.
4. Order: common prefix and suffix are skipped; among the rest, rows on the longest increasing subsequence of old positions stay and the others move, with `Element.moveBefore` when present (keeps focus, playing media, open dialogs) else `insertBefore`. After an `insertBefore` move, if `document.activeElement` was inside a moved row, jasno calls `focus({ preventScroll: true })` on it again.
5. Duplicate keys: dev reports `DUPLICATE_KEY`; the first occurrence owns the key's row, later duplicates get fresh rows on every update.
6. The list binding is older than its rows, so removed rows are disposed before their bindings could run.
7. A row returning a `DocumentFragment` contributes the child nodes it had when inserted.

### B12 Strict-read region (dev build only)
1. jasno sets a region label while it runs setup: a component body (`<Name>`), a builder (`<Name> › show`, `› match`, `› each row`, `› catchError`), the `mount` view (`<mount>`), a route view (`<view /users/:id>`).
2. The label is cleared (and restored afterwards) while any consumer runs, inside `untracked`, event handlers, `onMount` and cleanup callbacks, key functions and jasno internals.
3. While jasno calls a resource loader it sets the label `<resource name> loader` until the loader returns its promise. Route loaders get no label: reading a signal there is a deliberate snapshot at navigation time (the guard recipe reads `session()`).
4. Reading a signal, computation or resource field under a setup label reports `STRICT_READ_UNTRACKED` (warn) with region, node, owner path and first user stack frame; under a loader label it reports `LOADER_READ_UNTRACKED`. Reading a resource's `value()` while `idle`/`loading` in setup throws `PENDING_READ_UNTRACKED` instead.
5. Deduplication: one event per (code, region label, node, call site); repeats increment `count`.
6. Reads inside `untracked()` in setup are silent (writes there still report `WRITE_IN_SETUP`, B5.4). A derivation run that called `untracked()` and read no tracked source reports `UNTRACKED_IN_DERIVATION` (warn): it can never update.
7. A child reading its own `Read` props in its body is reported in the child's region; the owner path shows the parent.
8. While a setup label is set, `addEventListener` on a target that is not an `Element` (window, document, sockets, media-query lists, channels) without a `signal` option, and `setInterval`/`setTimeout`, report `LEAK_IN_SETUP` (warn). The dev build wraps these functions once at load; outside setup the wrapper only tests the label.
9. CI self-test: mounting every built-in with no user reads yields zero diagnostics.
10. Production has no labels and no checks.

### B13 Context lookup
1. `provide(ctx, value, fn)` runs `fn` in a new child owner that stores `ctx → value` and returns `fn`'s node.
2. `useContext(ctx)` walks from the current owner to the root and returns the first stored value; with none it returns the default given to `createContext`, else throws `NO_PROVIDER` (both builds; the hint adds: a consumer passed as `children` was created before the provider ran, pass `() => Child`).
3. With no current owner, `useContext` throws `CONTEXT_OUTSIDE_OWNER` (both builds).
4. Owners created later under the provider (branches, rows, effect runs) see the value: the chain is structural, not temporal.
5. The value is stored as-is and never tracked; share changing data by providing signals.
6. Contexts compare by identity.

### B14 Components
1. Calling a `component()` function: create an owner under the current owner (`NO_OWNER` if none), run the body untracked in the region `<fn.name>` (`<Anonymous>` if unnamed), return its node. The body is setup also when the component is called during an effect run: B5.4 applies to its writes, not B5.3.
2. A non-Node return throws `COMPONENT_RETURN_NOT_NODE` (dev).
3. Props are passed by reference; jasno never copies, proxies or tracks them.
4. Dev keeps a `WeakMap` from created elements to their owner path (for `__JASNO__.inspect(node)` and B10.6); nothing is written to the DOM.

### B15 Elements (`h`, `svg`)
1. `h.tag(props, ...children)`: `document.createElement(tag)`, then props, then children, then deferred props (`value`, `selectedIndex` on `select`, applied after its options exist).
2. `type` is applied first; the other keys in object order.
3. A key starting with `on` adds a listener for the rest of the key, never live. Any other function value creates a binding (evaluated now, re-run in phase (a)); a binding whose new value is `Object.is`-equal to the last applied value does not touch the DOM. Other values are applied once.
4. Application: `class` string sets `className`; `class` object toggles each key; `style` sets `--*` keys with `setProperty` and others with `style[key]`, `null`/`undefined` remove; `aria-*` set `String(value)` (booleans become `'true'`/`'false'`), `null`/`undefined` remove; `data-*` set `String(value)` for strings and numbers, `''` for `true`, and remove for `false`/`null`/`undefined`; every other key assigns the element property. `value`, `checked` and `selectedIndex` are assigned at creation, then only when different from the element's current value, so the caret stays put (an option's `value` reads its text until the attribute is set, so `value: ''` must be assigned).
5. `undefined` for a property is skipped at creation. A later live update to `undefined` returns the element to its creation state: a reflected attribute the element did not have at creation (`href`, `id`, `title`, `htmlFor`) is removed, so no `href=""` link to the current page appears; otherwise the property gets back its creation value (`value`, `checked` and `selectedIndex` always do).
6. Children are flattened in order: `null`, `undefined`, booleans render nothing; strings, numbers, bigints become Text nodes; Nodes are appended (a `DocumentFragment` appends its children); a Node that already has a parent is moved and reports `NODE_MOVED` (dev warn); a function becomes a live Text node (`String(v)`, nothing for `null`/`undefined`/booleans); a function child returning a Node throws `NODE_IN_TEXT_BINDING` (dev).
7. Handlers run through a wrapper: untracked, no owner, no strict label. When a handler returns a promise, the wrapper hands it to the settle tracker, a no-op unless `jasno/testing` is loaded, so `settled()` waits for it (B19.6); work a handler starts without returning it stays invisible. Dev: when an `onsubmit` handler returns without `preventDefault()` on a form with no `action` attribute and a method other than `dialog`, jasno reports `SUBMIT_NOT_PREVENTED`. Dev: an `onkeydown` wrapper notes `document.activeElement` before calling the handler; when the handler returns for an Enter key event that is not composing (`isComposing` false) and not `defaultPrevented`, the wrapper queues a microtask, which runs after the flush the handler scheduled (the flush was queued first), and if focus has moved (in the handler or in that flush) to a different element that is a `button`, `a[href]`, `summary`, `textarea` or an `input` with a form owner, jasno reports `KEY_ACTIVATES_NEW_FOCUS` (warn) with both elements and the handler's owner path. Chromium dispatches the key's `keypress` as a separate task after that flush and activates the newly focused element; happy-dom does not simulate it, so the check is what makes the bug visible in `node:test`.
8. A key outside jasno's closed prop table for the tag (the props of `jasno.elements.d.ts`, from which the dev build's table is generated; possible only through spreads or casts) is reported as `UNKNOWN_PROP` (dev warn) and applied anyway; message-typed keys (`className`, `for`, `ref`, `key`, `children`, `innerHTML`, `open` on `dialog`) get their key-specific hint, and an `aria-*` key outside the table is reported too. In the dev build, a typed prop that the engine does not expose as a property (happy-dom lacks `autofocus`) is set as its attribute; the production build has no table (browsers expose every typed prop) and assigns every key other than `aria-*`/`data-*` as the property. `on*` keys always add the listener (custom events); a key such as `onClick` whose lowercase form is a known handler property (`onclick`) is also reported.
9. When a region inside a `<select>` changes its children, jasno re-applies the select's bound `value`/`selectedIndex`.
10. After each flush, dev checks newly inserted `button`, `a[href]`, `input` (not `type=hidden`), `select`, `textarea`, `dialog`, `meter` and `progress` for an accessible name (text, `aria-label`, `aria-labelledby`, `title`, labels, `alt` of an image child, `value` of button inputs, the default name of submit and reset inputs) and reports `INTERACTIVE_NO_NAME` once per element.
11. `svg(tag, attributes, ...children)`: `document.createElementNS('http://www.w3.org/2000/svg', tag)`; each attribute key starting with `on` adds a listener; a function value is a binding applied with `setAttribute(key, String(v))` (`null`/`undefined` remove); other values are set once; children follow B15.6.

### B16 Mount
1. `mount(view, target)`: a `null` target throws `MOUNT_TARGET_MISSING` (both builds). Otherwise check `DUPLICATE_RUNTIME`, create a root owner, run `view()` untracked in the region `<mount>`, `target.replaceChildren(node)`, return `unmount`.
2. If `view()` throws, the root is disposed, `target` keeps its children and the error is rethrown.
3. The first flush (microtask) runs `onMount` callbacks and first effect runs; the nodes are in the document by then.
4. `unmount()` disposes the root and removes the inserted nodes; calling it again does nothing.
5. Several mounts on different targets are independent roots.

### B17 Router
1. `createRouter(routes, options)` validates every pattern (`INVALID_ROUTE_PATTERN`, both builds). A pattern that matches every path, or every path but `/` (`/:x*` or `/:x+` alone, and equivalents such as `/:x?/:rest*` or `/:x/:rest*`: only unconstrained params, a splat, at most one required segment), is rejected with the hint "use notFound". A route that can never match because an earlier route matches all of its paths throws `ROUTE_SHADOWED` (both builds), naming both patterns: segment by segment, an earlier static segment covers only the same static segment, an unconstrained param covers any single segment, `:x(c)` covers only the same constraint, and a splat covers the rest. It returns an inert router.
2. Pattern grammar: `/`-rooted segments, each static or `:name`, `:name?`, `:name+`, `:name*`, `:name(regex)`. Matching is case-sensitive and works on decoded segments: the pathname is split at `/`, each segment is decoded with `decodeURIComponent` (a path that fails to decode matches no route), and static segments and constraints compare with the decoded text, so `/x|y`, `/über` and `/%c3%bcber` match their patterns. A constraint tests one whole segment, as `^(?:c)$` (anchors and groups inside it are fine). A trailing slash is optional and never part of a param; `+`/`*` params join their decoded segments with `/`, so an encoded slash (`%2F`) inside a segment comes back as `/` and cannot be told from a separator. Patterns are written decoded (`/über`, not `/%C3%BCber`). The first matching route in table order wins.
3. `router.outlet()` needs an owner and throws `OUTLET_ALREADY_ACTIVE` while another outlet is live. It starts listening (Navigation API `navigate` when `'navigation' in window`, else the History adapter), resolves the current URL without moving focus (a `navigate()` before that first render, a loader redirect or a guard, stays quiet too; a link click or traversal that supersedes the initial navigation is the user's and moves focus; a `navigate()` from a handler before the first render cannot be told from a redirect and stays quiet), and returns the region. An outlet created by a flush that removed the focused element (a login wall replacing its form after sign-in) focuses and announces on its first render as after a navigation, and the focus-loss check waits for it (B20.2); an outlet that appears while focus is on `body` (an async session gate on page load) stays quiet. Disposing the outlet owner stops listening, aborts a pending navigation and removes the router's live region.
4. Interception: same-origin navigations whose pathname matches a route (links, GET forms, back/forward, `navigate()`). Unmatched pathnames, downloads, cross-origin URLs, links with any `target` (including `_self`), reloads and modified clicks are left to the browser (the server's SPA fallback then serves `index.html` and the start URL renders `notFound`). The History adapter intercepts primary-button unmodified clicks on matching same-origin `a[href]` without `target`/`download`, and `popstate`; it does not intercept form submissions.
5. A navigation that changes the route or its path params: `isLoading` becomes true; the previous navigation is superseded (its `navigate()` resolves `'superseded'`); the URL commits first (with the Navigation API the router starts loading from its `intercept()` handler, which runs after the browser committed the URL, also for link clicks and traversals; the History adapter calls `pushState`/`replaceState` before loaders); the loader and the view import run in parallel. On success: params, data and `url` update; if the route changed, the old view owner is disposed and the new view is built (untracked, region `<view pattern>`, guarded), otherwise the view is kept and its `params`/`data` Reads update; then flush (the new view's `onMount` callbacks and first effect runs happen here, so a dialog opened in `onMount` is open before focus), focus (B17.8), announcement (B17.9), `isLoading` false, `navigate()` resolves `'done'`. The title binding (B17.10) is created before the new view is built. On failure (B7.4): `url` updates (the address bar already shows the attempted URL), the previous view owner is disposed, the title is restored (B17.10), `options.error(error, retry)` renders in the outlet, `isLoading` false, `navigate()` resolves `'failed'`.
6. An unmatched URL at start or through `navigate()` renders `options.notFound()` in the outlet (the previous view owner is disposed), then focus and announcement as in B17.5; `navigate()` resolves `'done'`.
7. A search- or hash-only change on the same route and params updates `url` only: no loader, no rebuild, no focus move, no scroll change (a hash change scrolls to its fragment as the browser does). For a `navigate()` call, `url` is updated synchronously before `navigate()` returns (the Navigation API commits during the `navigate` event; the History adapter calls `replaceState`/`pushState` first), so an input whose `value` is bound to `url()` never lags behind typing. Back and forward between such entries behave the same, which is why a detail kept in a search param (RECIPES) closes without rebuilding the list.
8. Focus after a navigation (not on the outlet's first render, except an outlet whose creating flush removed the focused element or a link click or traversal that superseded the initial navigation, B17.3; skipped when the flush disposed the outlet or a newer navigation superseded this one): candidates are the view's first `[autofocus]` element that passes `checkVisibility()` and is not inside a closed `dialog` or a hidden popover, then the first `h1` in the view's DOM, child components included, wherever it sits (given `tabindex="-1"`), then the outlet's closest `main` (given `tabindex="-1"`). jasno focuses the first candidate and checks `document.activeElement`; if focus did not land it tries the next. A view with no `[autofocus]` candidate and no `h1` reports `VIEW_NO_HEADING` (dev warn).
9. Announcement: the route title if the route has one (a failed navigation announces the error view's `h1`, not the failed route's title), else the text of the view's first `h1` (focused or not), else nothing (the focused element announces itself); through `document.body.ariaNotify` when available, else through a visually hidden `aria-live="polite"` element that the router appends to `document.body` at its first announcement.
10. Title: a route's `title` (a string or `(data) => string`) is a binding owned by the current view, created before the view is built, so on a navigation it writes `document.title` before the view's effects first run, and a view effect that writes `document.title` wins. A route without `title`, `notFound` and the error view set `document.title` back to the title the document had when `createRouter` ran (index.html's `<title>`), at the same point, so a stale title never survives a navigation and a view that sets its own title (an effect or `onMount`) still wins. Search-only navigations do not touch the title.
11. Scroll: Navigation API `scroll: 'after-transition'`; History adapter: top of page after a push or replace renders a new view or new params (a replace redirect lands at the top too), on `popstate` the position the entry had when it was left (Back and Forward; positions are kept per entry); search-only navigations keep the scroll position.
12. The outlet is a boundary for the view's setup, bindings and effects: an error replaces the view with the error view, moving focus like a `catchError` swap (B8.5); the next navigation or `retry()` rebuilds. `retry()` re-runs the navigation to the current URL.
13. `navigate(url, { replace })` resolves `url` against the current location; before `outlet()` it throws `ROUTER_NOT_STARTED` (so does `back()`). It returns `Promise<NavigateResult>` and never rejects for navigation outcomes (jasno handles the promise internally, so an unawaited call cannot cause an unhandled rejection). A `navigate()` started while a navigation's loader runs supersedes it; with `replace`, the new entry replaces the superseded navigation's entry in both adapters (the URL committed first, B17.5), so a redirecting guard leaves no history entry behind.
14. `href(pattern, params)` substitutes `encodeURIComponent(String(value))` per segment (numbers allowed; `+`/`*` params per sub-segment), drops empty optional segments and returns an absolute path.
15. Intent preload: `pointerenter`/`focusin` on a matching `a[href]` starts that route's view import (loaders are not preloaded).
16. `url` changes when a navigation completes (a search- or hash-only one completes inside `navigate()`, B17.7), so it always describes the rendered view; it is typed `ReadonlyURL` (change the URL with `navigate()`).
17. When a view's `import()` rejects with a `TypeError` (module fetch or integrity failure, typically a tab opened before a deploy), the router reports `VIEW_IMPORT_FAILED` and performs one full document navigation to the target URL; a second failure for the same URL renders the error view.
18. `back(fallback)`: if the previous session-history entry is same-origin, belongs to this tab's session and its pathname matches a route (Navigation API: `navigation.canGoBack` and the URL of `navigation.entries()[currentEntry.index - 1]`, which must be `sameDocument`: an entry from an earlier page load in the tab, a typed URL or a reload, is not the app's even when a route matches it; History adapter: the index the router keeps in `history.state`, 0 for the entry the app started on, +1 on every push, unchanged on replace, is above 0), the router traverses back one entry (`navigation.back()` or `history.back()`) and resolves with that navigation's result; otherwise it behaves as `navigate(fallback, { replace: true })`, so a deep link closes without leaving the app and without a duplicate entry. It never rejects for navigation outcomes. A `back()` called again before its traversal arrives returns the same promise (one step), disposing the outlet settles a pending `back()` with `'superseded'`, and a cross-origin fallback is a full navigation, as `navigate()` does.

### B18 `css`
1. The first `` css`...` `` call for a template-strings object creates a `CSSStyleSheet` (`replaceSync`) and appends it to `document.adoptedStyleSheets`; later calls with the same strings object return the same sheet. There are no interpolations (type-enforced). Sheets are global and never removed.

### B19 `jasno/testing`
1. `mountTest(t, view, options)`: appends a container `div` to `document.body`, renders `view()` under a fresh root, runs one `flush()`, and registers its checks with `t.after`.
2. While a test runs, every diagnostic is recorded against the active `mountTest`; one from an owner the test did not create, or from an owner inside a detached (module-level) root even if created during the test, is tagged `<module root>` in its owner path and still counts.
3. Uncaught reactive errors (B8.3) during the test are recorded and fail it with `UNCAUGHT_ERROR`, carrying the original error as `cause` and the owner path.
4. At the end: unmount; fail on unexpected warn/error diagnostics (an `AggregateError` when several), on expected codes that never occurred (`EXPECTED_DIAGNOSTIC_MISSING`) and on owners created during the test that are still alive (`EFFECT_LEAKED`, including ownerless effects created in handlers or after `await`; detached `createRoot` roots are app-lifetime and never counted, B6.7).
5. Then every signal and linkedSignal created outside any owner (module level or in the test body) is set back to its initial value (a linkedSignal to the computation of its current source), so module-level signals cannot leak between tests or files under `--test-isolation=none`. Not reset: plain module variables (`let cache = new Map()`) and what detached roots own (a module-level resource and the effects, subscriptions and timers in it); a test that needs such data fresh calls its `reload()` after stubbing `fetch`, and app state belongs in signals in `src/state.ts` (RECIPES).
6. `settled()` loops (flush, await pending loaders, navigations and promises returned by `on*` handlers (B15.7), await one macrotask) until nothing is pending, using `setTimeout`/`setImmediate` captured when `jasno/testing` was imported (so `mock.timers` cannot hang it). A loader whose request jasno aborted (superseded, reset by `set()`, or disposed, B7.4) no longer counts as pending, since its result can never count. It rejects with recorded unexpected diagnostics or with `SETTLE_TIMEOUT` listing pending work by `debugName`, and a pending handler promise by its event type and the element's owner path (default 2,000 ms). A rejected handler promise is not swallowed: it fails the test as `UNCAUGHT_ERROR` (B19.3).
7. `expect` accepts only codes that correct code can trigger (the type excludes the codes that always mean broken code, e.g. `STRICT_READ_UNTRACKED`); each listed code must occur.

### B20 Focus-loss check (dev build only)
1. At the start of a flush, jasno records `document.activeElement` if it is inside a mounted root.
2. In a microtask queued after the flush, or, when that flush removed the focused element and created the router outlet (a login wall, B17.3), after the outlet's first navigation, which moves focus (so a router focus move or a phase-(b) `focus()` in the same task counts, e.g. a row that moved to another list focusing its new copy in `onMount`), if that element is disconnected, disabled, inert or hidden and `document.activeElement` is still that element, `body` or `null`, jasno reports `FOCUS_LOST` (warn) with the element, the owner path and the flush's cause. Checking the element itself matters because engines differ: Chromium moves focus to `body` when the focused button is disabled, happy-dom keeps it on the disabled button (appendix E6).
3. Regions that restore focus themselves (B8.5, B11.4, B17.8) do not report it when they restored it; when they could not (a `catchError` swap into text-only content, B8.5), `FOCUS_LOST` is reported.

### B21 `selector`
1. `selector(source)` creates, under the current owner, a node that reads `source()` (tracked) and keeps, per key, the consumers that asked about that key.
2. `isSelected(key)` called by a consumer returns `Object.is(source(), key)` and subscribes that consumer to `key` only; called outside a consumer it returns the comparison and subscribes nothing.
3. When `source()` changes from `a` to `b`, only consumers subscribed to `a` or `b` are dirtied.
4. A write that can change `source()` re-reads it at once, as part of the write: the source is a derivation that the write pulls, not a scheduled consumer (B3.2 is about consumers). So `isSelected()` and computations over it are read-your-writes (B3.1) while only the consumers of the old and new keys are dirtied. An error thrown by the source is routed (B8.3) in the next flush, never inside the write. With the usual `selector(selectedId)` the write runs no user code; `selector(() => expr)` evaluates `expr` once per write.

---

## (c) Diagnostics catalogue

**Format.** First line self-contained: `[CODE] message (at loc in ownerPath) hint: ... docs: node_modules/jasno/errors/CODE.md`. Event shape: `Diagnostic` in `jasno.d.ts` (`code, severity, message, hint, docs, ownerPath, node?, loc?, count`). `loc` is the first stack frame outside jasno (captured lazily, always on in dev). Deduplication per (code, region, node, call site); `EFFECT_WRITES_STATE` per (effect, signal) (B5.3) and `FOCUS_LOST`, which has no call site, per (element, action, owner path, cause). Delivery: `console.warn`/`console.error` (dev), `__JASNO__.diagnostics()`, `jasno dev` terminal forwarding, `mountTest` recording. Codes are never reused. **Heuristic policy (ADR-24):** a warn-level check (warnings fail tests) must have no known false positive on correct code. Removed in v2: `UNTRACKED_IN_SETUP`, `WRITE_AFTER_DISPOSE`, `ROWS_RECREATED`, `EFFECT_WRITES_OWN_SOURCE` (merged into `EFFECT_WRITES_STATE`), `NO_ROUTE_MATCH` (replaced by `notFound`). Added in v3: `KEY_ACTIVATES_NEW_FOCUS` (runtime) and `FOCUS_STYLE_REMOVED` (`jasno check`).

### Runtime

| Code | Severity | Build | When | Message template | Hint |
|---|---|---|---|---|---|
| `WRITE_IN_DERIVATION` | error (throws) | dev + prod | a signal is written in a derivation (B5.1) | `Write to signal "{signal}" inside {kind} "{derivation}".` | Derivations must be pure: compute it with computed()/linkedSignal(), or move the write to an event handler. |
| `EFFECT_LOOP` | error (throws) | dev + prod (microtask guard: dev) | a consumer ran more than 100 times in a flush, round 101, or 1,000 microtask flushes without a macrotask (B4.6, B4.10) | `{names} kept re-triggering each other ({runs} runs); DOM may be stale in: {bindings}.` | A consumer writes state it reads: derive it with computed()/linkedSignal(), or make the write conditional so it converges. |
| `NO_PROVIDER` | error (throws) | dev + prod | no provider and no default (B13.2) | `No provider for context "{name}" in {ownerPath}.` | Wrap the subtree in provide({name}, value, () => ...) or give createContext a default. A consumer passed as children was created before the provider: pass () => Child. |
| `CONTEXT_OUTSIDE_OWNER` | error (throws) | dev + prod | `useContext` with no owner (B13.3) | `useContext("{name}") was called outside component setup.` | Call it during setup and keep the value in a const; handlers and code after await have no owner. |
| `DUPLICATE_RUNTIME` | error (throws) | dev + prod | `mount()` is called from a second copy of jasno, not the one that loaded first (B16.1) | `Two copies of jasno are loaded: {first} and {second}.` | Import jasno only as 'jasno' and never write an import map: jasno dev and jasno dist generate it. |
| `MOUNT_TARGET_MISSING` | error (throws) | dev + prod | `mount(view, null)` (B16.1) | `mount() got a null target.` | Add <div id="app"></div> to index.html and call mount(App, document.getElementById('app')). |
| `FLUSH_REENTRANT` | error (throws) | dev + prod | `flush()` in a derivation or setup (B4.2) | `flush() was called inside {context}.` | Call flush() from tests, handlers, effects or onMount, never from computed() or setup. |
| `OWNED_IN_DERIVATION` | error (throws) | dev + prod | effect/resource/component/onMount/root/mount created in a derivation (B6.11) | `{kind} created inside {derivation}; derivations have no owner.` | Create it in setup or onMount; computed() stays pure. |
| `INVALID_ROUTE_PATTERN` | error (throws) | dev + prod | `createRouter` with an unsupported pattern (B17.1) | `Route pattern "{pattern}" is not supported: {reason}.` | Use '/'-rooted static segments, :name, :name?, :name+, :name*, :name(a\|b); for unknown URLs, and instead of a pattern that matches every path, use createRouter(routes, { notFound }). |
| `ROUTE_SHADOWED` | error (throws) | dev + prod | a route can never match (B17.1) | `Route "{later}" can never match: "{earlier}" comes first and matches all of its paths.` | List specific routes (/users/new) before param routes (/users/:id). |
| `OUTLET_ALREADY_ACTIVE` | error (throws) | dev + prod | a second live `router.outlet()` | `router.outlet() is already rendered in {ownerPath}.` | Render router.outlet() exactly once, in App. |
| `ROUTER_NOT_STARTED` | error (throws) | dev + prod | `navigate()` or `back()` before `outlet()` rendered, or after its owner was disposed (B17.3, B17.13) | `router.{method}("{url}") was called before router.outlet() was rendered.` | Mount the app first; in tests mountTest(t, () => App()) before navigate(). |
| `SIGNAL_COERCED` | error (TypeError) | dev | a signal converted to a primitive | `Signal "{node}" was used as a value.` | Call it: `${count()}`, count() + 1. |
| `NODE_IN_TEXT_BINDING` | error (throws) | dev | a function child returned a Node | `A function child in {ownerPath} returned <{tag}>; function children are live text.` | Lists use each(list, { key, render }); switches use show(when, then, otherwise) or match(key, render). |
| `PENDING_READ_UNTRACKED` | error (throws) | dev | `value()` read in setup while idle/loading (B12.4) | `Resource "{node}" was read in {region} while {status}; that snapshot would stay undefined.` | Read it inside a function: show(() => r.hasValue() && r.value(), (v) => ...). |
| `COMPONENT_RETURN_NOT_NODE` | error (throws) | dev | a component returned a non-Node | `Component <{name}> returned {type}, not a Node.` | Return one element or a show/match/each region. |
| `STRICT_READ_UNTRACKED` | warn | dev | read in setup (B12.4) | `Signal "{node}" was read directly in {region}; the value will not update.` | Make it live: pass the signal or () => .... untracked() is only for values that must never update. |
| `LOADER_READ_UNTRACKED` | warn | dev | read in a loader (B9.13) | `Signal "{node}" was read in the loader of resource "{resource}"; changing it will not reload.` | Move the read into params: () => .... Use untracked() there only if a change must not reload. |
| `UNTRACKED_IN_DERIVATION` | warn | dev | a derivation read only through `untracked()` (B12.6) | `{kind} "{node}" read nothing tracked; it can never update.` | Read the signal directly; untracked() is for setup-time seeds only. |
| `EFFECT_WRITES_STATE` | warn | dev | an effect run wrote a signal that something observes, or that the effect itself read (B5.3) | `Effect "{effect}" wrote signal "{signal}" during its run.` | Derive it with computed() or linkedSignal(), or write it in the event handler that caused the change; effects only sync the outside world. A subscription whose callback sets signals goes in onMount (per route param: inside match(() => p.params().id, (id) => Body({ id }))). |
| `EFFECT_NO_DEPS` | warn | dev | an effect's first run read no signal | `Effect "{effect}" read no signals, so it never re-runs.` | Use onMount() for one-time work, or read the signals it should react to. |
| `NO_OWNER` | warn | dev | effect/onMount/resource/component with no owner (B6.8) | `{kind} created outside any owner at {loc}; it is never disposed.` | Create it during setup or onMount; module-level app-lifetime work goes in createRoot(() => ...). signal() and computed() need no owner. |
| `WRITE_IN_SETUP` | warn | dev | setup wrote a signal it did not create (B5.4) | `Setup of {region} wrote "{signal}".` | Rendering must not change other state: move the write to onMount() or a handler, or derive it. |
| `LEAK_IN_SETUP` | warn | dev | global listener or timer created in setup (B12.8) | `{api} was called during setup of {region}; it outlives the component.` | Move it into onMount(({ abortSignal }) => ...) and pass { signal: abortSignal } or return a cleanup. |
| `RESOURCE_SET_WHILE_LOADING` | warn | dev | `set()` while `loading` (B9.8) | `set() on resource "{node}" while it loads {params}; the value likely belongs to earlier params.` | Capture the params before the await and write only if they are unchanged; optimistic values are set() before the await (this warning never fires in 'reloading'). |
| `DUPLICATE_KEY` | warn | dev | `each` saw a key twice | `each() in {ownerPath} got key {key} more than once.` | Keys must be unique and stable, e.g. (item) => item.id. |
| `UNSTABLE_KEY` | warn | dev | the key function disagreed with itself (B11.1) | `each() key in {ownerPath} returned {a}, then {b} for the same item.` | Derive the key from the item, (item) => item.id; no random values, counters or Date.now(). |
| `UNKNOWN_PROP` | warn | dev | an unknown key reached `h.*` (also `open` on an element without it) (B15.8) | `<{tag}> got unknown prop "{key}".` | Key-specific: onClick → onclick (event props are lowercase DOM names), className → class, for → htmlFor, ref → keep the element, key → each(); an unknown aria-* key lists the valid ones. |
| `NODE_MOVED` | warn | dev | a node that already has a parent was appended elsewhere (B15.6) | `<{tag}> already had a parent and was moved into {ownerPath}.` | A node lives in one place: create it where it is used (a function returning a new node); render children once. |
| `NODE_OUTSIDE_REGION` | warn | dev | a builder (a `show`/`match` branch, an `each` row, a `catchError` fallback) returned a node built outside it (B10.6) | `{builder} in {ownerPath} returned <{tag}>, created outside it.` | Create the node inside the builder, or keep it mounted and toggle hidden: () => !open(). |
| `INTERACTIVE_NO_NAME` | warn | dev | interactive element, dialog, meter or progress without accessible name (B15.10) | `<{tag}> in {ownerPath} has no accessible name.` | Add text, aria-label or aria-labelledby, or wrap it: h.label(null, 'Name', h.input(...)). |
| `FOCUS_LOST` | warn | dev | an update removed, disabled or hid the focused element and nothing moved focus (B20; also a `catchError` swap into text-only content, B8.5, whose hint instead says to wrap the text in an element) | `Focus was on <{tag}> in {ownerPath}, which this update {action}; focus fell to <body>.` | Keep the control enabled with 'aria-disabled', focus what replaced it in onMount, or focus something that stays before the change (a Retry inside show(): the status line). |
| `KEY_ACTIVATES_NEW_FOCUS` | warn | dev | an Enter keydown handler returned without `preventDefault()` and focus moved to a button, link, summary, textarea or form field (B15.7) | `The Enter keydown handler in {ownerPath} moved focus from <{from}> to <{to}> without preventDefault(); in Chromium the same key press will activate <{to}>.` | Call e.preventDefault() in that branch, or save through a form: h.form({ onsubmit: (e) => { e.preventDefault(); ... } }) handles Enter (RECIPES Inline edit). |
| `SUBMIT_NOT_PREVENTED` | warn | dev | an `onsubmit` handler did not prevent navigation (B15.7) | `The submit handler of <form> in {ownerPath} did not call preventDefault(); the browser will navigate.` | Call e.preventDefault() first in onsubmit. |
| `VIEW_NO_HEADING` | warn | dev | the router found no `h1` or visible `[autofocus]` (B17.8) | `The view for "{route}" has no h1 or visible [autofocus]; the router focused <main>.` | Render an h.h1 in every view, outside show/match (its text may be live). |
| `VIEW_IMPORT_FAILED` | warn | dev (the reload happens in both builds) | a view module failed to load (B17.17) | `The module for "{route}" failed to load ({error}); reloading {url}.` | Usually a deploy replaced the files: keep previous deploys (npm run dist -- --keep 2). |

### `jasno/testing`

| Code | Severity | When | Message template | Hint |
|---|---|---|---|---|
| `EFFECT_LEAKED` | test failure | owners created by the test alive after unmount (B19.4) | `{n} owners created by this test are alive after unmount: {paths}.` | Create effects and resources during setup or onMount, not in handlers or after await. |
| `EXPECTED_DIAGNOSTIC_MISSING` | test failure | a code in `expect` never occurred | `Expected diagnostic {code} did not occur.` | Remove it from expect, or make the test reach that case. |
| `SETTLE_TIMEOUT` | test failure | `settled()` timed out | `settled() timed out after {ms} ms; pending: {list}.` | Stub fetch or provide a fake service; raise timeout only for slow real work. |
| `UNCAUGHT_ERROR` | test failure | a reactive error reached `report`, or a promise an `on*` handler returned rejected, during the test (B19.3, B19.6) | `Reactive code in {ownerPath} threw: {message}` (or `The promise returned by the {type} handler in {ownerPath} threw: {message}`) | Fix the error, or wrap the subtree in catchError(() => ..., (err, reset) => ...). |
| `TESTING_REQUIRES_DEV_BUILD` | error at import | `jasno/testing` resolved without `--conditions=development` | `jasno/testing needs the development build of jasno.` | Run node with --conditions=development (npm test does). |

Unexpected warn/error diagnostics fail a test with their own code (an `AggregateError` when several).

### `jasno check`, `jasno dev`, `jasno dist`

| Code | Severity | Tool | When |
|---|---|---|---|
| `TS<number>` | error | check | any tsc diagnostic from either program, printed with its related information. Rewrites: TS2835's "Did you mean './x.js'" becomes `./x.ts`; TS2554 on a `component()` value adds "children go in the props object"; TS7022 on the router export prints the `COMPONENT_RETURN_TYPE` findings first and drops the downstream title error |
| `TS_VERSION_UNSUPPORTED` | error | check | the loaded TypeScript is outside the tested range (`~7.0.2`), or `typescript` is not installed |
| `TYPE_RULES_UNAVAILABLE` | warn (fails under `--strict` or `CI`) | check | the TS API failed to load; tsc ran as a subprocess and the rules that need the syntax tree or types were skipped |
| `TS_EXTENSION` | error | check, dev, dist | relative specifier not ending in `.ts` (`.json` for JSON modules; dev: 404 for `x.js` when `x.ts` exists, with the hint); check also for an entry in `index.html` ending in `.js` whose `.ts` exists |
| `NO_DECORATORS`, `NO_ACCESSOR` | error | check | syntax that passes tsc and the stripper, then fails in V8 (§6) |
| `NO_TS_CLASS_MODIFIER` | error | check | `private`/`protected`/`public`/`readonly`/`abstract`/`override`/`declare` members; use `#private` |
| `NO_USING` | error | check | `using` declarations (TS2318 has no location) |
| `TLA_OUTSIDE_ENTRY` | error | check | top-level `await` outside the entry named in `index.html` (Safari < 27 partial) |
| `SYNTAX_REJECTED` | error | check, dev, dist | the stripped file does not parse as a module (check parses all files in one process with `vm.SourceTextModule` and locates a failure with `node --check`; dev serves a module that throws with file:line:col; dev and dist also report syntax the type stripper refuses, such as `enum`) |
| `IMPORT_NOT_MAPPED` | error | check, dev, dist | a bare specifier in a browser file that is not `jasno`, `jasno/router`, a `dependencies` package or a package.json `"imports"` key (dev and dist: one that does not resolve) |
| `IMPORT_MAP_HANDWRITTEN` | error | check, dev, dist | `index.html` contains a `<script type="importmap">`; dev refuses to inject a second map and serves an error page naming this code |
| `NODE_TYPES_IN_BROWSER_CODE` | error | check | `/// <reference types="node" />` or a `node:` import in a browser file |
| `WORKER_UNSUPPORTED` | error | check | `new Worker`, `new SharedWorker` or `serviceWorker.register` of the DOM globals in a browser file (import maps do not apply to workers; v1 has no worker story) |
| `NO_HTML_SINK` | error | check | assignment to `innerHTML`/`outerHTML`/`srcdoc`, `insertAdjacentHTML`, `document.write`/`writeln`, also through `el['innerHTML']` (blocked by the production Trusted Types CSP) |
| `USE_ROUTER` | error / warn | check | the DOM's `history.pushState`/`replaceState` (error); reading the DOM's `location.pathname`/`location.search` in a browser file (warn); a local or parameter named `history`/`location` does not count |
| `CURRENT_TARGET_AFTER_AWAIT` | error | check | `<param>.currentTarget` that an `await` or `for await` precedes on some path (an await in a block that returns or throws precedes only that block) in an `on*` handler: an `on*` prop or method of an `h.*`/`svg` props object, an `addEventListener` callback or an `el.onx = ...` assignment (the DOM sets it to null) |
| `ASYNC_IN_EFFECT` | warn | check | a jasno `effect()` callback that, during its run, calls `fetch`, uses `.then(` or runs an async function (callbacks and listeners it only installs do not count): use `resource()` |
| `SIGNAL_IN_TEMPLATE` | error | check (type-aware) | a value with a zero-parameter call signature (signal or `Read`) in a template literal |
| `SIGNAL_COERCED` | error | check (type-aware) | a value with a zero-parameter call signature (signal or `Read`) in `+` concatenation with a string or in `String()` |
| `SNAPSHOT_TO_ACCESSOR` | warn | check (type-aware) | `x()` of a signal or `Read` passed in a component body (the function given to `component()`) where `MaybeRead<T>` is accepted or as an `h` child (`h.p(null, count())`); `show`/`match`/`each` callbacks are not checked (the runtime's `STRICT_READ_UNTRACKED` covers them) |
| `COMPONENT_NOT_WRAPPED` | warn | check | exported PascalCase function returning `Node` without `component()` |
| `ANONYMOUS_COMPONENT` | warn | check | `component()` given an arrow or anonymous function |
| `COMPONENT_RETURN_TYPE` | warn | check | component function without a return type annotation (`: Node`) (ADR-06) |
| `FOCUS_STYLE_REMOVED` | warn | check | a `css` rule sets `outline: none`/`0` or `all: unset`/`initial`/`revert` on a selector that reaches an interactive element (a `button`, `a`, `input`, `select`, `textarea` or `summary` tag, a `[tabindex]` or `[contenteditable]` attribute, `*`, a `:focus*` state (a selector part with `:not(:focus-visible)` keeps the keyboard ring and does not count), or a class the same file puts on an interactive `h.*` tag in a string `class` prop), and no `css` template in the program has a rule for `:focus`, `:focus-visible` or `:focus-within` that declares anything besides `outline: none`/`0` (an outline, box-shadow, border, background, color or text-decoration change counts; sheets are global, ADR-23) (WCAG 2.4.7: programmatic focus moves need a visible indicator) |
| `ASSET_OUTSIDE_ASSETS` | error | check, dev | `new URL('<relative path>', import.meta.url)` in a browser file resolves to a file under `src/`, or `jasno dev` gets a request for a non-module file under `/src/`: `jasno dist` publishes modules there only under hashed names and other files not at all, so the URL 404s in production (put the file in `assets/` and use `'/assets/<name>'`) |
| `TSCONFIG_DRIFT` | error | check | a required compiler option missing or changed in either config, `esnext.disposable` in `lib`, test files included in the browser program, `types` other than `[]` there, test or e2e files with no `tsconfig.test.json` (a project without them needs none), or package.json without `"type": "module"` |
| `MODULE_NOT_FOUND` | error | check, dev, dist | the entry `index.html` imports names no file (check; a missing relative import inside `src/` is tsc's TS2307 there); dev and dist: a relative or root-relative import in the module graph names no file (dev prints it when it builds the import map; dist fails), and dist also when `index.html` has no inline module script; a `.js` specifier whose `.ts` exists is `TS_EXTENSION` instead |
| `DEP_NOT_BROWSER_ESM` | error | dev, dist | a dependency's static closure contains CommonJS, an unguarded `process.env` read (a `typeof process` guard is fine) or an unresolvable bare import, or an installed dependency has no entry for the `browser`/`import`/`default` conditions (an optional peer behind `import()` inside a dependency is not checked) |
| `SECRET_FILE_IN_OUTPUT` | error | dist | an allowlisted directory (`src/`, `assets/`, `public/`) contains `.env*`, `*.pem`, `*.key` or a dotfile |
| `FILE_NOT_PUBLISHED` | error | check, dist | browser code imports a module jasno dist does not publish (outside `src/`, or a `*.test.ts` file; check reports it at the import); dist also when `src/`, `assets/` or `public/` contains a symlink, or a `public/` file takes a name dist generates |
| `MODULE_BUDGET_EXCEEDED` | warn > 150, error > 250 | dist | the entry's static closure, counted per package/directory |
| `LAZY_BUDGET_EXCEEDED` | warn > 50 | dist | a dynamic-import target's static closure |
| `DYNAMIC_IMPORT_NOT_LITERAL` | warn | dist | `import(expr)`: closure unknown, not budgeted |
| `CSP_HASH_STRICT_DYNAMIC` | error / warn | dist | `index.html` carries its own CSP `<meta>`: with `'strict-dynamic'` (error), combined with jasno's hash sources it blocks imports in Chromium and Firefox (§7); without it (warn), browsers enforce both policies and the stricter wins, so the app breaks only after deploy |

---

## (d) `window.__JASNO__` introspection (dev build)

Type: `FFDevtools` in `jasno.d.ts`; `window.__JASNO__` is `undefined` in production. Results are JSON-serializable and small; values are previews truncated to 80 characters. v2 removes `componentOf` (use `inspect(node).ownerPath`) and `config` (stack capture is always lazy).

| Member | Returns | Example |
|---|---|---|
| `version` | jasno version | `"1.0.0"` |
| `diagnostics(filter?)` | deduplicated events since load or `clearDiagnostics()` | `[{ code: 'FOCUS_LOST', severity: 'warn', ownerPath: '<App> › <UserView>', loc: 'src/views/user.ts:34:9', count: 1, ... }]` |
| `graph(filter?)` | nodes and edges in Angular's `{ nodes, edges: [{ consumer, producer }] }` shape; filter by owner path prefix or name | `{ nodes: [{ id: 1, kind: 'signal', name: 'query', ownerPath: '<App> › <UserList>', value: '"tu"' }, { id: 2, kind: 'computed', name: 'matches', runs: 3 }], edges: [{ consumer: 2, producer: 1 }] }` |
| `inspect(target)` | a node by id or `debugName`, or a DOM node: sources, observers, runs, location; for a DOM node its owner path and bindings | `{ kind: 'element', name: 'li', ownerPath: '<UserList> › each row', bindings: ['textContent ← user'], sources: [], observers: [] }` |
| `why(target)` | the cause chain of a node's last run, including the scheduling write of its last error | `["query.set at src/components/user-list.ts:41:61", "matches", "visible", "binding each(visible)"]` |
| `router()` | router state | `{ url: '/users/7', route: '/users/:id', isLoading: false, error: undefined }` |

Names come from `debugName`, else `<kind>#<id>`; AGENTS.md's runtime-state line points to `why(name)`. The optional Chrome DevTools MCP adapter (`devtoolstooldiscovery`) exposes the same functions; `__JASNO__` is the stable contract.

---

## (e) CLI

All commands exit 0 on success and 1 on failure, print one line per problem (`file:line:col CODE message`, or `file CODE message` / `CODE message` when there is no position; paths relative to the project with `/`; control characters stripped from everything printed), and accept `--json` (one JSON object per line, fatal errors included as `{ severity, message }`). Every URL derived from a file path uses `/` separators (`pathToFileURL`), so Windows and Linux produce the same map, hashes and integrity values (with `.gitattributes` fixing line endings). Projects call them through npm scripts (`npm run check`, `npm run dev`, `npm run dist`), never `npx jasno` (ADR-36).

### `jasno check`
1. Loads TypeScript through `typescript/unstable/sync` and prints `typescript <version>` in its header and JSON metadata; a version outside the tested range fails with `TS_VERSION_UNSUPPORTED`. If the API cannot load, it spawns the resolved package's own `tsc --pretty false` for each program, reports `TYPE_RULES_UNAVAILABLE` (a warning that fails under `--strict` or when `CI` is set) and skips the rules that need the syntax tree or types (TypeScript 7's syntax tree comes from the same API); the rules on the stripped module text still run (`TS_EXTENSION`, `IMPORT_NOT_MAPPED`, `NODE_TYPES_IN_BROWSER_CODE` for runtime imports, `IMPORT_MAP_HANDWRITTEN`, the syntax gate, `TSCONFIG_DRIFT`).
2. Checks both programs: `tsconfig.json` (browser) and `tsconfig.test.json` (tests, e2e, Playwright config), printing related information and the rewrites in (c). The test program reports diagnostics only for Node files: a browser module a test imports is checked with browser types, not Node's. A project with no test or e2e files needs no `tsconfig.test.json` (a config file alone does not count); once it has them, a missing test program is `TSCONFIG_DRIFT`. `npm run check` resolves the local `jasno` and `typescript` from `devDependencies`/`dependencies` (template in (f)).
3. File classes: browser files are the `index.html` entry's closure (with either condition set, also outside `src/`) plus every non-test file under `src/` (and `.d.ts` files there, for the Node reference); Node files are `*.test.ts`, `e2e/**` and config files. Browser-only rules: `IMPORT_NOT_MAPPED`, `NODE_TYPES_IN_BROWSER_CODE`, `WORKER_UNSUPPORTED`, `NO_HTML_SINK`, `USE_ROUTER`, `TLA_OUTSIDE_ENTRY`, `ASSET_OUTSIDE_ASSETS`.
4. Syntax gate: strips every file with the pinned `amaro` and parses all outputs in one child process with `vm.SourceTextModule` (parse only, no linking; a failing file is re-checked with `node --check` for its line and column): 500 modules in about 60 ms, where one `node --check` spawn per file took about 37 s (m1).
5. Syntactic rules: `TS_EXTENSION`, `NO_DECORATORS`, `NO_ACCESSOR`, `NO_TS_CLASS_MODIFIER`, `NO_USING`, `TLA_OUTSIDE_ENTRY`, `IMPORT_NOT_MAPPED`, `IMPORT_MAP_HANDWRITTEN`, `NODE_TYPES_IN_BROWSER_CODE`, `WORKER_UNSUPPORTED`, `NO_HTML_SINK`, `USE_ROUTER`, `CURRENT_TARGET_AFTER_AWAIT`, `ASYNC_IN_EFFECT`, `COMPONENT_*`, `ANONYMOUS_COMPONENT`, `FOCUS_STYLE_REMOVED` (`css` templates are static strings, ADR-23, so their rules are scanned exactly; the check matches them against string `class` props of `h.*` calls in the same file and looks for focus-state rules in every template, ADR-24), `ASSET_OUTSIDE_ASSETS`, `TSCONFIG_DRIFT`.
6. Type-aware rules, batched: one `getTypeAtLocation(nodes[])` per file, memoized by type id (87 s → 3.8 s on 500 files, §6). `SIGNAL_IN_TEMPLATE` keys on any zero-parameter call signature, so it covers `Read` props as well as branded signals (A02).
7. Warnings do not fail unless `--strict` or `CI` is set.

### `jasno dev`
- Zero-dependency `node:http` server (`--port`, default 5173) bound to `127.0.0.1` and `::1`; `--host` opts into other interfaces and prints a warning. Requests get 403 unless `Host` is a loopback name, `*.localhost` or an IP literal (DNS rebinding needs a domain name); with `--host` the machine's own name (`os.hostname()`, `<hostname>.local`) is accepted too, and every other name still gets 403. Only `GET` and `HEAD` are served (405 otherwise, like a static host), except `POST /__jasno/log`.
- Serves an allowlist: `index.html`, the `.ts` and JSON modules under `src/` (any other file under `/src/` gets a 404 page with the `ASSET_OUTSIDE_ASSETS` hint, since `jasno dist` does not publish it), `assets/`, the files of every package the module graph resolves under `/@dep/<name>@<version>/` (resolved with Node's `exports`/`imports` algorithm and the conditions `browser`, `import`, `development`, `default`; not their nested `node_modules`) and jasno's own files under `/@jasno/`. Any path segment starting with `.` is rejected; a request whose case differs from the file's real name gets 404 (static Linux hosts are case-sensitive).
- `.ts` is served as `text/javascript`, `cache-control: no-store`, stripped with the same pinned `amaro` as `jasno dist` (positions preserved, no source maps). A strip failure is served as a module that throws `SyntaxError("[SYNTAX_REJECTED] /src/x.ts:3:7 ...")`. A 404 for `x.js` when `x.ts` exists answers with the `TS_EXTENSION` hint; a 404 under `/@jasno/` names the correct file.
- `index.html` gets, at `<!--jasno:head-->` (else before `</head>`), one generated import map (`jasno` → `/@jasno/dev.js`, `jasno/router`, every dependency and `#imports` key the module graph uses, with the `development` condition; a package's own `#imports` keys and bare imports go under `scopes` keyed by its URL prefix, so they cannot collide with the app's) and the dev client (`/__jasno/client.js`). If `index.html` already contains an import map, `jasno dev` injects nothing, serves an error page naming `IMPORT_MAP_HANDWRITTEN` and prints it.
- Sends the production CSP as a response header on every response (`index.html` adds its own inline scripts by hash), so Trusted Types violations appear in dev, in Playwright and in the terminal (A34, M4).
- SPA fallback: a `GET` with `Accept: text/html`, no file extension and no matching file serves `index.html`; never under `/src`, `/@dep`, `/@jasno` or `/assets` (a miss there is a missing file, as in dist's `_redirects`), and never for `.ts`/`.js`. Files under `public/` are served at the root, as dist publishes them.
- Dev client: SSE (`/__jasno/events`) full reload on change of a file the server would serve (not dotfiles, editor swap files or symlinked paths), of `index.html`, `package.json`, or a linked or workspace package (real path outside `node_modules`) (debounced; skipped when `navigator.webdriver` is true); forwards uncaught errors (a capture-phase `window` `error` listener, so failed module loads are forwarded too), unhandled rejections and warn/error diagnostics to `POST /__jasno/log`, which accepts only same-origin requests, caps the body at 64 KB and strips control characters before printing.
- `.jasno/dev.json` records `{ pid, port, url }`; a second `jasno dev` first calls `GET /__jasno/ping` (returns the project root and pid) and reuses the server only if it answers for the same root, else takes over: it starts a new server and overwrites the record (on a port conflict it exits 1 with a `--port` hint).
- Floor: Node `^24.12.0 || >=26.0.0`; runs with `--disable-warning=ExperimentalWarning`.

### `jasno dist`
No bundling, concatenation, minification, renaming of code or transformation beyond type erasure: every shipped `.js` is its `.ts` with types replaced by whitespace, same line and column (§7). Module file names gain a content hash (`index.html` and `assets/**` keep their names); code does not change.
1. **Inputs (allowlist):** `index.html`, `assets/**`, `public/**`, non-test `src/**/*.ts` and the JSON modules they import (not `*.test.ts`, not `.d.ts`, and not files reachable only through a `package.json` `"imports"` target the build does not select, exact or pattern, such as `config.dev.ts`, `api.mock.ts` or `./src/api/*.mock.ts` under `development`; browser code importing a module outside `src/` or a test file fails with `FILE_NOT_PUBLISHED`, as does a symlink in `src/`, `assets/` or `public/`), the static import closure of every dependency the browser files import, and jasno's `prod.js` and `router.js`. Nothing else, never dotfiles; an allowlisted directory containing `.env*`, `*.pem`, `*.key` or a dotfile fails with `SECRET_FILE_IN_OUTPUT` (the one dotfile dist writes is its own `dist/.jasno/manifest.json`, a file list). `jasno dist --list` prints the exact file list, kept files and the manifest included.
2. **Outputs:** `src/a/b.ts` → `dist/src/a/b.<sha256:10>.js` (same directory, so relative resolution and positions hold), stripped with the pinned `amaro`. Dependencies → `dist/_deps/<name>@<version>/<path>.<hash>.js` (the package is the root the resolver reached through `node_modules`, named by its package.json; a nested `{"type":"module"}` marker is not a package); jasno's own files → `dist/jasno/<file>.<hash>.js`. JSON and dependency modules ship byte-identical and are hashed the same way. `assets/**` is copied unhashed to `dist/assets/**`: code refers to it by root path (`'/assets/logo.png'`), which stays valid because code is never rewritten; non-module files under `src/` are not published (`ASSET_OUTSIDE_ASSETS`). `public/**` is copied unhashed to the root of `dist/` (`/robots.txt`, `/favicon.ico`); a `public/` file may not take a name dist generates (`FILE_NOT_PUBLISHED`).
3. One inline import map: every source URL (`/src/a/b.ts`), bare key (`jasno`, `jasno/router`, dependency specifiers, `#imports` keys with the `default` condition or `--condition=<name>`; the condition applies to the app's package.json `imports` only, dependencies always resolve with `browser`, `import`, `default`) → its hashed URL, plus an `integrity` map (sha384) for every module.
4. `modulepreload` links for the entry's full static closure, each repeating its integrity (Chromium double-fetches otherwise); dynamic-import targets are excluded and listed in `dist/.jasno/manifest.json` with their closures.
5. Entry kept inline: `<script type="module">import '/src/main.ts'</script>` (import maps do not apply to `src=`).
6. CSP meta and `_headers`: `script-src 'self' 'sha256-<map>' 'sha256-<entry>'; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'`; `--nonce` prints the nonce + `'strict-dynamic'` variant for servers. Cache headers: HTML and `/assets/*` `no-cache` (revalidated by ETag, since asset names carry no hash); `/src/*`, `/_deps/*` and `/jasno/*` immutable (safe now that names carry hashes).
7. SPA fallback files: `_redirects` (misses under `/src/*`, `/_deps/*`, `/jasno/*`, `/assets/*` → `/404.html 404`, then `/* /index.html 200`, so a stale tab past `--keep` never gets `index.html` as a module) and a copy of `index.html` as `404.html`. On hosts that apply `_headers` by request path whatever the status (as `jasno preview` does), a 404 under `/src/*` may still say immutable (unverified on Netlify and Cloudflare); the harm is bounded, since the URL names content that no longer exists.
8. `--keep N` merges the previous N deploys' hashed files from the existing `dist/` so open tabs keep working (M1). The new `dist/` is built next to the old one and swapped in.
9. Budgets (ADR-29) and `dist/.jasno/manifest.json` (lazy closures, per-package counts, the stripper version).

### `jasno preview`
A static server over `dist/` that applies `_headers`, `_redirects` and the CSP exactly as a static host would: files first, then `_redirects` (200 rewrites, 3xx, 404), then `404.html`; it never serves `_headers`, `_redirects` or dotfiles, and revalidates with a weak ETag (304). It exists for the CI rung "`npm run dist && JASNO_E2E=preview npm run e2e`", the only rung that exercises the shipped artifact (M4).

### `jasno explain CODE`
Prints `node_modules/jasno/errors/CODE.md`: what happened, why, the default fix, the deliberate variant, a before/after example. Until `errors/CODE.md` exists (a v1 exit criterion, 15.7) it prints the code's catalogue rows (a code in two tables, such as `SIGNAL_COERCED`, prints both). `--list` prints every code with its summary, in code-point order; `--json` prints the catalogue `errors/index.json` for tools. Works offline.

---

## (f) Project layout, conventions, templates

```
my-app/
  index.html          <!--jasno:head--> slot, <div id="app">, inline entry script; never an import map
  package.json        "type": "module", dependencies, "imports" (#config, app aliases), scripts, engines
  tsconfig.json       browser program: src minus tests, "types": []
  tsconfig.test.json  test program: *.test.ts, e2e, playwright.config.ts, "types": ["node"]
  playwright.config.ts  one top-level webServer: npm run dev, or npm run preview when JASNO_E2E=preview (webServer is not per project)
  .gitattributes      * text=auto eol=lf   (same bytes, hashes and integrity on every OS)
  .gitignore          node_modules/, dist/, .jasno/
  .nvmrc              the Node version CI pins
  AGENTS.md           jasno block (≤ 8 KB) between <!-- jasno:begin --> / <!-- jasno:end -->; CLAUDE.md contains @AGENTS.md
  src/
    main.ts           mount(App, document.getElementById('app'))
    app.ts            App shell: h.header(null, nav) + h.main(null, router.outlet()), providers, toast region
    routes.ts         the route table (specific before param routes), error and notFound views
    state.ts          app-wide signals (never in component modules)
    api.ts            typed fetch functions: take an AbortSignal, validate the payload at the boundary
    api.mock.ts       optional stand-in behind "#api" (development condition) while there is no backend
    config.dev.ts, config.prod.ts   behind "#config"; public values only
    views/*.ts        one lazy module per route; default-exported component that renders an h.h1 outside show/match
    components/*.ts   one exported component per file
    **/*.test.ts      node:test files next to the code
  e2e/*.spec.ts       Playwright tests
  assets/             static files, published unhashed by jasno dist; refer to them as '/assets/<name>'
  public/             files served at the site root (robots.txt, favicon.ico), copied unhashed to the root of dist/
```

`npm create jasno <dir>` (the `create-jasno` package, `create-jasno/` in the repository, 2026-09-30) scaffolds the minimal working subset of this tree: `index.html`, `package.json` (scripts as below, `jasno` at its own exact version), both tsconfigs, `playwright.config.ts` (Chromium, Firefox, WebKit), `.gitattributes`, `.gitignore`, `.nvmrc`, the AGENTS.md block, `CLAUDE.md`, a CI workflow, `src/main.ts`, `app.ts`, `routes.ts`, `views/home.ts` and `views/about.ts`, one component test and an e2e spec whose `afterEach` fails on page errors and on dev diagnostics (and on a missing `window.__JASNO__` under `jasno dev`, so the check cannot pass vacuously). The rest of the tree (`state.ts`, `api.ts`, `#config`, `components/`, `assets/`, `public/`) is where an app grows. `npm run test:template` in `jasno/` scaffolds against the packed tarball and runs every rung with the template's own scripts.

Conventions: `export const Name = component(function Name(p: NameProps): Node { ... })` with an exported `NameProps`; data props `Read<T>`, optional props `?: Read<T> | undefined`, callbacks plain functions, maybe-rendered content as `() => Child` props; kebab-case file names; relative imports with `.ts`; `import type` for types; packages by bare name; no barrel files (module budget); app-wide state in plain modules; styles colocated with `css` under a component-named root class that the component sets itself; route patterns only in `routes.ts`, URLs from `router.href` or relative `?q=` hrefs; a detail over a list is a search param on the list's route, closed with `router.back()`; per-param work lives in a `match` body keyed on the param; everything under `src/` is public.

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>App</title>
  <!--jasno:head-->
</head>
<body>
  <div id="app"></div>
  <script type="module">import '/src/main.ts';</script>
</body>
</html>
```

`tsconfig.json` (the design's template is `tsconfig.app.json`):

```json
{
  "compilerOptions": {
    "target": "es2025", "module": "nodenext", "moduleResolution": "nodenext",
    "lib": ["es2025", "dom"], "types": [],
    "strict": true, "noEmit": true,
    "allowImportingTsExtensions": true, "erasableSyntaxOnly": true, "verbatimModuleSyntax": true,
    "exactOptionalPropertyTypes": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`tsconfig.test.json` (template: `tsconfig.app-test.json`):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src/**/*.test.ts", "e2e", "playwright.config.ts"],
  "exclude": []
}
```

`package.json` (app):

```json
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "engines": { "node": "^24.12.0 || >=26.0.0" },
  "imports": { "#config": { "development": "./src/config.dev.ts", "default": "./src/config.prod.ts" } },
  "scripts": {
    "check": "jasno check",
    "test": "node --conditions=development --import jasno/testing/happy-dom --test --test-isolation=none \"src/**/*.test.ts\"",
    "dev": "jasno dev",
    "dist": "jasno dist",
    "preview": "jasno preview",
    "e2e": "playwright test"
  },
  "dependencies": { "jasno": "^1.0.0" },
  "devDependencies": {
    "typescript": "~7.0.2",
    "happy-dom": "^20.14.5",
    "@types/node": "^24.12.0",
    "@playwright/test": "^1.63.0"
  }
}
```

`package.json` (the jasno package, as built by `jasno/scripts/build-package.mjs` into `release/` and checked by `scripts/test-package.mjs`, 2026-09-30): the repository runs jasno from its TypeScript sources, but Node refuses type stripping under `node_modules`, so the package ships JavaScript. `"exports"` with `"types"` first in every conditional entry (M8): `"."` → `{ "types": "./dist/jasno.d.ts", "development": "./dist/dev.js", "default": "./dist/prod.js" }`; `"./internal"` → the same two files without types (the internals `jasno/router` and `jasno/testing` import; the same URL as `jasno` per condition, so the package keeps one reactive system); `"./router"` → `{ "types": "./dist/router.d.ts", "development": "./dist/router.dev.js", "default": "./dist/router.js" }` (built per condition so `DEV` inlines); `"./testing"` → `{ "types": "./dist/testing.d.ts", "development": "./dist/testing.js", "default": "./dist/testing-requires-dev.js" }`; `"./testing/happy-dom"` → `{ "types", "default": "./dist/happy-dom.js" }`; `"bin": { "jasno": "./bin/jasno.js" }` (importing `dist/cli.js`; `typescript`, `amaro` and `es-module-lexer` resolve from the project); `"files": ["dist", "bin", "errors", "AGENTS.md"]` (`docs` joins with the recipes); dependencies `amaro` and `es-module-lexer` (pinned); peers `typescript ~7.0.2`, `happy-dom ^20.14.5` (optional). The bundles come from esbuild: `prod.js` is minified with `DEV` substituted at parse time, so the dev build is absent (11.2 KB gzip, `router.js` 5.8 KB; the prototype's per-file modules were 39 KB unminified, 18 modules against 11 in the example's build). The published `.d.ts` files are generated from the curated `jasno.d.ts` and `jasno.elements.d.ts` (ambient blocks become module files; the elements become a module augmentation), not emitted from the sources, whose types are internal; the main file keeps the name `jasno.d.ts`, so AGENTS.md's "This file plus `jasno.d.ts`" names a file in the package. The release check installs the tarball into a copy of the example and runs `jasno check --strict`, `tsc` without `skipLibCheck`, `npm test`, and the browser probe under `jasno dev` and on `jasno dist` + `jasno preview` in Chromium, Firefox and WebKit.

`playwright.config.ts` (template): `const preview = process.env.JASNO_E2E === 'preview';` then `webServer: { command: preview ? 'npm run preview' : 'npm run dev', url: preview ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI }` and the same URL as `use.baseURL`. Playwright's `webServer` is a top-level option (a list starts every server), so v2's per-project servers could not work; one variable picks the server and the same tests run against both.

Scaffolded CI (M4): Node from `.nvmrc`; `npm ci` once `package-lock.json` is committed (`npm install` before, so the first push is green; `create-jasno` says to commit the lockfile); `npx playwright install --with-deps` (all three engines, as the config lists them: the recipe bugs P-R1 and P-R2 showed only in Firefox and WebKit); `npm run check -- --strict`; `npm test`; `npm run e2e`; `npm run dist && JASNO_E2E=preview npm run e2e`.

---

## (g) Testing API and verification ladder

`jasno/testing` API (types in `jasno.d.ts`, semantics B19):
- `mountTest(t, view, { expect? })`: container `div` appended to `document.body`, `view()` under a fresh root, one `flush()`, checks registered on `t.after`. Returns `{ root, diagnostics, dispose() }`; `dispose()` is idempotent and runs the checks at once, first the focus-loss checks still queued for a microtask (B20.2), so an update right before it counts. Fails the test on unexpected warnings, uncaught reactive errors (`UNCAUGHT_ERROR`), missing expected codes and leaked owners; afterwards restores module-level signals.
- `settled({ timeout? })`: waits until flushes, loaders, navigations and promises returned by `on*` handlers are idle (B19.6), with timers captured at import (safe under `mock.timers`).
- `jasno/testing/happy-dom`: side-effect module registering happy-dom globals (`--import`).
- Time: `mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'] })` for app code; `page.clock` in Playwright.
- Network: stub `fetch`, or `provide()` fake services through context.
- Routes: set the start URL with `history.replaceState(null, '', '/users/1')` before `mountTest(t, () => App())`; `await router.navigate(url)` returns a `NavigateResult`. happy-dom has no Navigation API, so Node tests exercise the History adapter. Tests are the only code that touches `history` (`USE_ROUTER` checks browser files only); the RECIPES block says so.
- Keys: `input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))` (without `cancelable`, `preventDefault()` has no effect and correct handlers are reported), then `await Promise.resolve()`: the `KEY_ACTIVATES_NEW_FOCUS` check (B15.7) runs in a microtask after the handler's flush, so it sees what a browser would even though happy-dom never simulates the keypress activation. Simulate the key's default action (happy-dom has none, e.g. `form.requestSubmit()` for Enter in a form field) only after that await; `settled()` also runs the check.
- Dialogs (also in the `jasno/testing/happy-dom` JSDoc): `jasno/testing/happy-dom` adds the dialog focusing steps happy-dom 20.14.5 lacks (`showModal()` focuses `[autofocus]` or the first focusable element, `close()` returns focus to the opener), so the RECIPES dialog patterns behave as in a browser.
- App-wide data in a module-level `createRoot` keeps its state across tests in one process (B19.5): stub `fetch`, then `reload()` it.
- Events: `el.click()` fires `click` and, for checkboxes and radios, `input`/`change` in happy-dom 20.14.5; text input needs `el.focus()` (as a user would: when focus stays on an element that the update removes, `FOCUS_LOST` is reported), then `el.value = ...` plus `dispatchEvent(new Event('input'))`.

Ladder (each rung exits non-zero on failure; stop at the first failing rung; a rung that cannot run is reported as skipped, never as passed):
1. `npm run check` (~1–2 s): both programs, the erasable-syntax guarantee, jasno rules, `index.html` checks.
2. `npm test`: `node --conditions=development --import jasno/testing/happy-dom --test --test-isolation=none "src/**/*.test.ts"`.
3. `npx playwright test` (the config's `webServer` starts or reuses `npm run dev`): focus, keyboard, layout, real accessibility; assert with `getByRole` and `toMatchAriaSnapshot`, one page per file (~60 ms/test, §14); an `afterEach` that fails on `window.__JASNO__.diagnostics({ severity: 'warn' })` turns `FOCUS_LOST`, `KEY_ACTIVATES_NEW_FOCUS` and `VIEW_NO_HEADING` into failures.
4. CI: `npm run dist && JASNO_E2E=preview npx playwright test`: the shipped artifact (hashed files, integrity, CSP, `_headers`, SPA fallback).
5. Exploration: Playwright CLI or MCP plus `window.__JASNO__`; Chrome DevTools MCP for heap snapshots (leaks).

---

## (h) Scope and non-goals

**In v1 (as revised by v2 and v3):** `jasno` core (signal, computed, linkedSignal, untracked, flush, selector, effect, onMount, createRoot, resource, component, `h` with 98 tags, svg, show, match, each, catchError, mount, css, createContext, provide, useContext: 22 runtime exports, v1 had 21), `jasno/router` (route, createRouter; the router object gains `back()` in v3), `jasno/testing` (mountTest, settled, plus `jasno/testing/happy-dom`), five CLI commands (check, dev, dist, preview, explain), dev/prod builds, the diagnostics catalogue with `errors/*.md` and `errors/index.json`, `docs/recipes/*.md`, `__JASNO__`, AGENTS.md.

**Floors.** Node `^24.12.0 || >=26.0.0`. Browsers: Chrome/Edge ≥ 136, Firefox ≥ 138, Safari/iOS ≥ 18.4 (unchanged from v1; `checkVisibility` needs Chrome 105, Firefox 106, Safari 17.4, inside the floor). The Navigation API path needs Chrome 102 / Firefox 147 / Safari 26.2; below that the History adapter runs. `moveBefore` and `ariaNotify` are progressive, with focus re-application and a live region as fallbacks.

**Non-goals:** SSR, hydration, SSG; JSX or any template language; bundling, minification, code transforms (dependencies are copied file by file); decorators and class components; custom elements as the component model, shadow DOM, a custom-element factory (deferred); Proxy stores; `query` and `form` modules; portals; Suspense and transitions; nested routes and overlay routes (a detail over a list is a search param, RECIPES), file-based routing, router view transitions, POST route actions, `beforeLeave` guards; sub-path deployment (the app is served at the origin root; a `base` option is additive later); web workers (`WORKER_UNSUPPORTED`); HMR (full reload only); Service-Worker or in-browser stripping; `Symbol.dispose`/`using`; WebMCP; a devtools UI.

---

## (i) Open questions

1. **Package name checks.** `jasno` is chosen (ADR-36); before docs freeze, run a trademark check and measure how often agents misspell the package name (for example as `json`).
2. Eval outcomes for arms A–H. Flush timing remains the costliest to reverse.
3. Frozen signal values: does the mutation-bug reduction outweigh the `signal<T, T>` friction in generic code (arm H)?
4. `jasno check` type-aware rules on TS 7.1 (beta 2026-10-06, stable 2026-11-24): move to the stable API entry point and widen the pin.
5. Real-device per-module cost (mid-range Android, Safari 27's loader, Firefox warm loads, §7): budgets stay provisional, now including dependency closures.
6. Workers: keep `WORKER_UNSUPPORTED`, or support one recipe (`new Worker(import.meta.resolve('./w.ts'), { type: 'module' })`, import-free worker closure, one named Trusted Types policy)?
7. Screen readers: double announcements with intercepted navigations plus `ariaNotify` (§8); the heading-text announcement for title-less routes needs AT testing.
8. `FOCUS_LOST` noise in real Playwright runs (Chrome focuses buttons on click, Safari does not): measure; demote to info only if correct apps trigger it.
9. Do agents over-apply `untracked` once warnings fail tests? Measured by call counts now that `UNTRACKED_IN_SETUP` is gone.
10. Cost of the dev-only `Symbol.toPrimitive` prototype swap per signal.
11. Preloading lazy-route closures: the router sees `() => import(...)`, not the specifier; `jasno dist` could key the manifest by route pattern.
12. Nested layouts: is `/section/:tab(a|b)` plus `match` enough, or do real apps need layout routes?
13. Resource parity with Angular 22: value clearing on new params, `value()` throwing in `error`, `set()` being a no-op while idle. v3 adds the reverse question: should a failed `reload()` keep the value (SWR/TanStack: `error` with `hasValue()` true)? It would remove the keep-last-value recipe but diverge from Angular (U-K2); decide with the eval's polling and optimistic-save tasks. Decided 2026-09-28 after two apps hand-rolled it (the dashboard pilot and the comparison's support-inbox): `value()` stays as in Angular, and `latest()` returns the last value held for the current params (B9.9).
14. happy-dom lacks the Navigation API; should rung 3 cover the Navigation path per route?
15. Does `mountTest`'s automatic first flush hide ordering bugs that the production microtask flush would show?
16. `: Node` convention: drop it if a TS release stops reporting the routes↔views cycle.
17. `INTERACTIVE_NO_NAME` fidelity against Playwright's accessible-name computation. A first data point (2026-09-29, the Grok pilot): Playwright's locators disagree among themselves; for a `<select>` wrapped in its `<label>`, `getByRole` and Chromium name it by the label text, while `getByLabel(…, { exact: true })` compares the label text with the option texts included.
18. Firefox unbundled cost (~20× Chromium warm per module, §7) as a named support risk.
19. Dependencies whose conditional exports differ between `development` and `default`: confirm dev/prod parity per package in `jasno preview`.
20. A custom-element factory (`h.custom`, S2) once an eval task uses web components.
21. A linkedSignal whose `computation` reads `previous` (`computed` has no `previous`): TS cannot infer the type from a return that depends on it; the JSDoc asks for a return annotation. Revisit if TypeScript improves this inference.
22. `KEY_ACTIVATES_NEW_FOCUS` covers Enter only. Space activates buttons on `keyup`, and WebKit's behaviour for both keys was not measured (the WebKit build would not launch in the kanban review): extend the check once measured.
23. `router.back()` with the Navigation API treats a previous same-origin entry whose path matches a route as the app's. Since 2026-09-28 the entry must also be `sameDocument` (an earlier page load in the tab was traversed to: comparison P-B8), which also excludes a same-origin page outside the SPA; what remains is an entry this document created with `history.pushState` outside the router, which AGENTS.md forbids.
24. `settled()` sees only promises that handlers return: measure in the eval how often agents start work in a handler without returning it, and how often a test then asserts before that work finished (`settled()` resolves early, so no `SETTLE_TIMEOUT` fires).
25. Test-order dependence: plain module variables and detached roots survive between tests (B19.5); the prototype's CI runs every suite in shuffled order to measure it.
26. `SECRET_FILE_IN_OUTPUT` refuses every dotfile, so `public/.well-known/` (security.txt, app association files) cannot be published; allow that one directory, or keep the rule strict? (found by the repair-guide writers, 2026-09-30)

---

## Appendix: evidence gathered while writing v2

All commands used `scratchpad/node_modules/.bin/tsc` (`Version 7.0.2`). Probe files live in `scratchpad/design/v2probe/` (not part of the deliverable).

**E1 Seeded mistakes against v2 `jasno.d.ts`** (`v2probe/msg/m.ts`, verbatim; for chained errors the most specific line of the elaboration is quoted, V2-17):
```
Argument of type 'string | { readonly 'jasno: call it first: items().length, user().name': never; }' is not assignable to parameter of type 'Child'.   // h.span(null, p.user.name)
Operator '>' cannot be applied to types 'number | { readonly 'jasno: call it first: items().length, user().name': never; }' and 'number'.            // p.items.length > 3
Property 'key' is missing in type '{ render: (user: Read<User>) => HTMLLIElement; }' but required in type 'EachOptions<User, string | number>'.
Argument of type '(user: any) => HTMLLIElement' is not assignable to parameter of type 'EachOptions<User, string | number>'.                          // each(list, render)
Property 'push' does not exist on type 'readonly User[]'.                                                                                            // users().push(u)
Property 'sort' does not exist on type 'readonly User[]'.                                                                                            // computed(() => users().sort())
Argument of type '() => string' is not assignable to parameter of type 'LinkedSignalOptions<unknown, unknown>'.                                      // linkedSignal(() => '')
Type 'void' is not assignable to type '{} | null'.                                                                                                   // resource loader resolving void
Object literal may only specify known properties, and 'load' does not exist in type 'ResourceOptions<{} | null, unknown>'.
Type 'undefined' is not assignable to type 'Rendered'.                                                                                               // non-exhaustive match
Type 'User | undefined' is not assignable to type 'MatchKey'.                                                                                        // object match key
Type 'HTMLLIElement[]' is not assignable to type '{ readonly 'jasno: a function child is live text; lists use each(), switches use show() or match()': never; } | TextChild'.
Type 'boolean' is not assignable to type '{ readonly "jasno: open makes a NON-modal dialog; call el.showModal() in a handler and el.close() to close": never; }'.
Expected 1 arguments, but got 2.                                                                                                                     // h.input({...}, 'label') and css`${x}`
Object literal may only specify known properties, and ''aria-lable'' does not exist in type 'HTMLButtonElementProps'.
Type 'boolean' is not assignable to type '{ readonly 'jasno: a signal is not a handler; write () => count.set(...)': never; }'.                          // onclick: count
Argument of type 'string' is not assignable to parameter of type '{ readonly 'jasno: name the type: createContext<T>(name)': never; }'.
Argument of type '(err: unknown) => void' is not assignable to parameter of type '(error: unknown, reset: () => void) => Rendered'.
Type '{ readonly 'jasno: no batch(); writes apply at once, the DOM updates on the next microtask, flush() applies now': never; }' has no call signatures.
Type '{ readonly 'jasno: return a cleanup from onMount or effect: onMount(() => () => socket.close())': never; }' has no call signatures.            // onCleanup(...)
```
The probe suite `v2probe/src/ok.ts` holds 35 `@ts-expect-error` mistakes and the valid forms next to them; the router probe (`v2probe/src/rt/`) holds 7 more (missing loader, pattern without `/`, bad `:tab` literal, typo'd pattern, missing `notFound`, `searchParams.set`, `url.search =`). The whole probe compiles with 0 errors, so every mistake is reported and every valid form (inline arrows into `Read` props, signals of elements, tuples, Maps, `signal<T, T>`, one view for `/users/:id` and `/team/:id`, `href` with a numeric id, `aria-*` live values, `svg` handlers) compiles. The `aria-lable` typo gets TS2353 without a "Did you mean" suggestion (TypeScript offers none for quoted, hyphenated keys); it is still an error, where v1 accepted it.

**E2 Frozen values.** Freezing every object type (`Readonly<T>`) broke `el().textContent = ...` on a signal holding an element, so only arrays, tuples, Map and Set are frozen. In generic code, `signal(initial)` with a type parameter `T` gives `Argument of type 'T' is not assignable to parameter of type 'Frozen<T>'` (also with an arrays-only `Frozen`), because TypeScript cannot prove `T` assignable to a deferred conditional type; `signal<T, T>(initial)` compiles. `computed` is not frozen because generic components compute over `Read<T>`.

**E3 Compile time** (`--extendedDiagnostics`, contended 2-vCPU VM, load ≈ 2.2–2.5; two runs each):

| Configuration | Instantiations | Check time | Total |
|---|---|---|---|
| v2 `tsconfig.json`: jasno.d.ts + lib + example, no `skipLibCheck` (release CI cost) | 89.0k | 1.81–2.08 s | 2.11–2.32 s |
| v2 example, `skipLibCheck` (user cost) | 10.2k | 0.25–0.33 s | 0.53–0.56 s |
| v1 example, `skipLibCheck`, same session | 7.9k | 0.17–0.18 s | 0.40–0.44 s |
| TS critic's 453-line, 26-component dense app ported to v2, `skipLibCheck` | 7.2k | 0.19–0.27 s | 0.47–0.53 s |
| the same app on v1 | 6.5k | 0.21–0.22 s | 0.52–0.53 s |

The guarded `Read` interface, the `each` key parameter and the router's literal-union params add 10–30% instantiations; wall time stays within noise for the dense app and adds about 0.1 s to the example.

**E4 Usability apps re-checked against v2** (`scratchpad/design/usab-v2check/<task>/`, tester code unmodified, tsconfig pointed at v2):

| App | tsc errors (browser + tests) | Root causes (all deliberate API changes) | After mechanical migration (`<task>-migrated/`) |
|---|---|---|---|
| contacts | 11 + 0 | positional `each` (1 site), `linkedSignal(() => base())` (1), `onCleanup` (1), missing `notFound` (1), `router.pending` (1) | 0 |
| todo-timers | 5 + 0 | positional `each` (1), missing `notFound` (1) | 0 |
| dashboard | 20 + 0 | positional `each` (3 sites), `linkedSignal` shorthand (1), `Signal<Theme>` now read-only (1) | 0 |
| wizard | 0 + 0 | none (its test file now type-checks under the test template) | – |

None of the new safety types (guarded `Read`, frozen arrays, void elements, `match` constraints, `css`, `aria-*`, `dialog.open`) produced an error on the testers' code once migrated; the four hand-written import maps are caught by `IMPORT_MAP_HANDWRITTEN` in `jasno check` (not a tsc error).

**E5 Samples.** `tools/agents-samples/` compiles with 0 errors in both programs: the AGENTS.md example and test verbatim, every snippet of the reactive rule, components, markup, lists, async, routing and context sections, and every RECIPES snippet (`recipes.ts`). Writing them found one recipe that needed a return annotation (keep-last-value `linkedSignal`, see open question 21).

**E6 happy-dom 20.14.5 facts** (`v2probe/hd.mjs`, run with `@happy-dom/global-registrator`): `click()` on a checkbox or radio fires `click`, `input`, `change`; `button.click()` does not focus the button; disabling the focused button leaves `document.activeElement` on it, removing it moves focus to `body`; `requestSubmit()` on a form with an empty required textarea fires no `submit` (constraint validation runs, so "onsubmit fires only when valid" holds in tests); `checkVisibility` exists; `reportError`, the Navigation API and `moveBefore` do not (so tests run the History adapter and the `insertBefore` fallback). BCD 8.1.3: `Element.checkVisibility` Chrome 105, Firefox 106, Safari/iOS 17.4; `Promise.try` Chrome 128, Firefox 134, Safari/iOS 18.2, all inside the floor.

## Appendix: evidence gathered while writing v3

All commands used `scratchpad/node_modules/.bin/tsc` (`Version 7.0.2`) and Node 25.1.0. Probe files live in `scratchpad/design/v3probe/` and `scratchpad/design/v3-snippets/` (not part of the deliverable).

**E7 Browser facts behind the new recipes** (Playwright 1.63, Chromium headless shell and Firefox; `v3probe/inline-edit.mjs` and `v3probe/dialog.mjs` emulate jasno's microtask flush in plain DOM code):

| Probe | Chromium | Firefox |
|---|---|---|
| Inline edit through a form: type, press Enter | saved once, editor closed, focus on the title button, not reopened; log `open, save, blur` | same; log `open, save` |
| Same, press Escape | cancelled, focus on the title button | same |
| Same, press Tab | saved, focus on the next control (not pulled back) | same |
| Remove an open modal dialog | no `close` event, focus on `<body>` | same |
| `close()`, then remove | `close` event fires (after the removal), focus back on the opener | same |
| Escape on the dialog | `close` event, focus back on the opener | same |

The first row also shows that Chromium fires `blur` when it removes the focused input and Firefox does not, hence the `if (editing())` guard in the recipe. The kanban review's `probe2.mjs` showed the failure the recipe avoids: an Enter keydown that moves focus without `preventDefault()` reopens the editor in Chromium (`["click-title","save:Enter","blur","click-title"]`), not in Firefox.

**E8 Type checks.** `tsconfig.json` (browser: jasno.d.ts, no `skipLibCheck`, and the example), `tsconfig.test.json`, `tools/agents-samples/tsconfig.json` and its test config: 0 errors each. `v3-snippets/` (every AGENTS.md fenced TS block, each line verbatim in a compiled file apart from v2's two known adaptations, the inline forms of every section and every "tsc accepts these" row): 0 errors, and `neg-v3.ts` confirms that `h.header(nav)` and `Card({ title: t() })` are type errors (both `@ts-expect-error`s consumed). All 80 indented code lines of the RECIPES block (74 in v3; the 2026-09-26 rename recipe added six) appear verbatim in `tools/agents-samples/`. The diagnostic code sets agree (`v3-snippets/codes.mjs`): the `DiagnosticCode` union equals the runtime plus `jasno/testing` tables of (c), `FixNotExpect` is a subset, and every other code named in the four documents is a rejected or deferred proposal. `tools/gen-elements.cjs`, run on a copy whose element region was emptied, regenerates it byte for byte (98 tags, 50 interfaces).

**E9 Compile time** (`--extendedDiagnostics`, contended 2-vCPU VM, load ≈ 2.2–2.7; two runs each):

| Configuration | Instantiations | Check time | Total |
|---|---|---|---|
| v3 `tsconfig.json`: jasno.d.ts + lib + example, no `skipLibCheck` (release CI cost) | 89.4k | 1.84–1.97 s | 2.17–2.27 s |
| v2 `tsconfig.json`, same session | 89.0k | 1.86–1.95 s | 2.17–2.22 s |
| v3 example, `skipLibCheck` (user cost, `v3probe/tsconfig.example-user.json`) | 10.5k | 0.20–0.25 s | 0.45–0.49 s |
| v2 example, `skipLibCheck`, same session | 10.2k | 0.23–0.28 s | 0.49–0.55 s |
| after the 2026-09-26 review (element props in `jasno.elements.d.ts`), no `skipLibCheck` | 94.6k | 2.19–2.24 s | 2.45–2.49 s |
| the same, example with `skipLibCheck` | 10.6k | 0.28–0.30 s | 0.53–0.57 s |

The RECIPES text, the new JSDoc, `router.back` and the mock module leave compile cost within noise. Moving the generated props to their own file (2026-09-26) adds about 5k instantiations without `skipLibCheck` (89.4k → 94.6k); wall time stays within noise.

**E10 Usability apps against v3** (`v3probe/usab/<app>/`, code unmodified, tsconfig pointed at v3): kanban 0 errors, chat 0 errors, the three migrated v1 apps 0 errors each, wizard 0 errors in both programs. v3 only adds API, so nothing that compiled against v2 breaks.

**E11 `#api` resolution** (`tsc --traceResolution` and `import.meta.resolve`): tsc resolves `#api` "in ESM mode with conditions 'import', 'types', 'node'", so it picks the `default` target (`api.ts`, the real types); plain Node resolves `api.ts`; `node --conditions=development` resolves `api.mock.ts`. The mock is typed `typeof Api.listUsers` against the real module, so a drifting mock is a type error.

**E12 AGENTS.md** is 8,191 bytes, pure ASCII (after the 2026-09-26 rename to `jasno`, which cost 69 bytes and was paid for by wording trims with no rule removed; the runtime review then added `input.focus()` to the testing example and shortened its comment). To fit the new rules (per-param `match`, `router.back`, subscriptions in `onMount`, the narrowed after-`await` rule, the viewport meta, the Enter-keydown row) it drops lines that tsc or a runtime check already explains with the fix: array mutation (a type error naming `readonly`), `${}` in `css` (a type error), `import type` (TS1484), route order (`ROUTE_SHADOWED` throws with the order hint), the `navigate()` result values (JSDoc), "callbacks are plain functions" (the example shows it), "late writes are harmless" (RECIPES), and the setup-listener table row (the same rule stays in "Context, cleanup, state", and `LEAK_IN_SETUP` reports it). The pilot review (2026-09-27, changelog P-G3, P-G4) added the rule to compare nodes with `assert.ok(a === b)` and pointed fixes at `npx jasno explain CODE`, paid for by dropping "it runs in the first flush, then on each change" (the `effect` JSDoc says it) and the `errors/CODE.md` path.
