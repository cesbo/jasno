## Scope and method

I read the published dev builds of `solid-js@2.0.0-rc.9`, `@solidjs/signals@2.0.0-rc.9` and `@solidjs/web@2.0.0-rc.9` (npm `next`, published 2026-09-18), plus `@solidjs/diagnostics@2.0.0-rc.9` and `mobx@7.0.5` (latest, 2026-09-25). I ran runtime experiments on Node 25.1.0 (EOL; see the last section). Scripts are in `/tmp/claude-1000/-home-and-ff/96b9f726-1e37-4313-9d48-852096c2ca84/scratchpad/solid2/` (`exp.mjs`, `exp2.mjs`, `exp3.mjs`, `mobx-exp.mjs`). The Solid scripts must be run with `node --conditions=browser --conditions=development`. For noise evidence I searched GitHub for `STRICT_READ_UNTRACKED` (65 hits) and `observableRequiresReaction` in mobxjs/mobx (16 hits), and read the relevant issues and PRs in full.

**Premise correction first.** Solid's cheatsheet line about "the single most common AI-generated bug" is about the opposite direction from our case. Solid's compiler wraps JSX expressions in getters, so the Solid bug is passing an accessor where a value is expected (`<X v={count} />`). A type check catches that. The cheatsheet ties this rule together with "don't destructure props" as "together the most common AI-generated bug class". Destructuring is the snapshot read that STRICT_READ_UNTRACKED catches. With no compiler, our snapshot bug (`title: title()`) is the mirror image. The experiments below show the same mechanism catches it.

## 1. Solid 2.0 RC: the exact rule

### Mechanism (from `@solidjs/signals/dist/dev-shared.js`)
- One module-level variable: `let strictRead = false` (a label string or `false`). It is dev-only. In prod, `untrack(fn, label)` ignores the label.
- `untrack(fn, strictReadLabel)` saves `tracking` and `strictRead`, then sets `tracking = false; strictRead = strictReadLabel || false`, runs `fn`, and restores both in `finally`. So a plain `untrack(fn)` with no label clears the label. That is why wrapping a read in `untrack` silences the warning.
- `recompute()` sets `strictRead = false` for the whole run of any memo or effect compute function (`prevStrictRead = strictRead; strictRead = false; tracking = true`). Every nested tracking scope is therefore a clean region.
- `read(el)` has a dev branch: `if (strictRead) warnStrictReadUntracked(strictRead, {ownerId, ownerName, nodeName})`. The store proxy `get` trap has the same check, gated on `strictRead && !inDraft(target) && typeof key === 'string' && key !== 'then' && getObserver() === null`. The `then` exemption came from PR #3263 (2026-09-04). If the value being read is **pending async**, both paths escalate to a thrown `PENDING_ASYNC_UNTRACKED_READ` (severity `error`) instead of a warning.
- Only three places set a label:
  1. `createComponent` → `observedComponent(Comp, props, name)`, which runs `untrack(() => Comp(props), '<' + (name || Comp.name || 'Anonymous') + '>')` inside a transparent `createRoot`. It also sets `owner._name` to the same label.
  2. The apply half of the split `createEffect`: `setStrictRead('an effect callback')`.
  3. The function children of `<Show>` and `<Match>`, labeled `"<Show>"` / `"<Match>"`. `<For>` callback bodies report as `<For>`, because `For` is itself a component and the label is still in effect when its mapper runs. A raw `mapArray` mapper is not labeled.

### It is dynamic scope, not lexical scope
Measured with rc.9. Counts are STRICT_READ_UNTRACKED events captured through `OBSERVE.diagnostics.capture()`.

| Case | Events | Label / ownerPath |
|---|---|---|
| `count()` directly in body | 1 | `<Anonymous>` |
| body calls `helper()`, which reads `count()` | 1 | `<Helpered>` |
| child reads `p.title`, where the parent passed `get title(){return count()}` | 1 | `<Child>`, path `["<Parent>","<Child>"]` |
| **snapshot**: parent passes `{ title: count() }` | 1 | `<Parent2>` (the read is in the parent's body) |
| handler defined in setup, called after mount | 0 | – |
| handler defined and **invoked synchronously during setup** | 1 | component label |
| read inside `createMemo` in body (memo never read) | 0 | – |
| body reads the memo it created (`m()`) | 1 | node `computed` |
| explicit `untrack(() => count())` in body | 0 | – |
| `queueMicrotask(() => count())` in body | 0 | – |
| async fn in body: read before first `await` / after | 1 / 0 | – |
| `createSignal(count())` (seeding local state) | 1 | component label |
| store `st.user.name` in body | 2 | one per property hop |
| `const u = st.user` (only passing the sub-proxy along) | 1 | `user` |
| `merge({a:1}, props).title` | 1 | `<MC>` |
| effect apply half reads `count()` | 1 | `an effect callback`, no ownerPath |
| `onSettled` callback / effect compute half | 0 / 0 | – |
| `useContext` in body | 0 | – |
| `<For keyed={false}>` callback body reads `item().x` | 2 | `<For>`, path `["<L>","<For>"]` |
| `Show` keyed function child reads a signal | 2 | `<Show>` |
| calling `Comp(props)` directly, bypassing `createComponent` | **0** | – |
| 100 reads in a loop | **100** events, 100 `console.warn` | no dedupe |
| same component mounted 3× | 3 | – |

Answers to the sub-questions:
- **Helpers called from the body: covered.** Any read made while the component function runs synchronously is reported, however deep the call.
- **Props getters: covered.** The getter runs inside the child's dynamic extent, so the report goes to the child, with the parent visible in `ownerPath`. This is correct for the destructure bug. A snapshot at the call site is caught one level up, in the parent's body.
- **Handlers defined in setup and called later: not covered.** The label has been restored to `false` by then. Two exceptions. A handler invoked synchronously during setup warns: think of `el.focus()` or `el.click()` dispatching an event inside the body. A handler invoked later from an effect apply half warns under `an effect callback`.
- **Attribution without a compiler.** It works through the runtime wrapper, `createComponent` plus `Function.name`. The compiler's only job is to guarantee that every JSX tag goes through `createComponent`. A direct function call is invisible to the check.
- **Writes are a separate check.** `REACTIVE_WRITE_IN_OWNED_SCOPE` throws based on the owner, and `untrack` does not exempt it. The cheatsheet had to correct an earlier claim that it did (#3157).

### Event shape and delivery
- `DiagnosticEvent`: `{sequence, code, kind:'strict-read', severity:'warn', message, ownerId?, ownerName?, nodeName?, ownerPath?, data:{strictRead: label, property?, source?:'store'}}`.
- The event carries **no source location**. The only locator is the console stack trace. The Pictelio team located its read sites ("imageHostStore.ts:329") from stack traces.
- The console message is `[STRICT_READ_UNTRACKED] Reactive value read directly in <Loop> will not update. Move it into a tracking scope (JSX, a memo, or an effect's compute function).` followed by `in <Loop>`. The first report of each code adds a footer pointing to `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` and the GitHub anchor. That SKILL.md prescribes: "If you intentionally want a one-time snapshot, wrap the read in `untrack()`", and also "Do not suppress a diagnostic you do not understand".
- Structured channel: `OBSERVE.diagnostics.subscribe/capture`. `@solidjs/diagnostics`, which describes itself as "Agent-consumable diagnostics harness", adds `captureArtifact` and `expectNoDiagnostics(artifact, {allow})`. The latter fails on **every** captured code, `warn` included. It also ships Vitest matchers, a browser bridge on `globalThis.__SOLID_DIAGNOSTICS__`, and a dev-server endpoint at `/__solid/diagnostics`. Its agent-loops skill, Loop 1, says: "Fix, re-capture, repeat until zero events. Do not allowlist a code you have not understood." solidjs/templates#283 (2026-08-26) turned this on in every solid-v2 template. It reports a blind agent test in which the agent found a seeded stale-closure bug through STRICT_READ_UNTRACKED.
- Solid exposes no severity switch. lightsound/cobracket#30 notes "Solid grades each diagnostic itself … and exposes no switch to escalate them". Its workaround is a `setupFiles` gate: every test runs inside a capture, and teardown asserts the artifact is clean. The escape hatch `expectDiagnostics(code)` **requires** the code to appear, "so the escape hatch cannot decay into a silent mute".
- Dev cost: while `strictRead` is set, every read takes the slow path, and each warning is a separate `console.warn`. PR #3326 benchmarked 500 elements with `style={store.x}` at 97.6 ms against 3.56 ms after its fix. The PR says the old number was "dominated by dev diagnostics (one STRICT_READ_UNTRACKED per leaf read per element)".

### Noise and false-positive reports (betas and RCs)
1. **Library seed reads blamed on the app component.** In TanStack/query#11358 (open, rc.4), `useMutation` and `useQuery` construct observers with `client()` and `options()` in the body. The reporter wrote: "a single screen with a handful of mutations produces dozens of them, which drowns out the diagnostics that *are* about application code". It was fixed by wrapping those reads in `untrack` (#11324 and #11456). #11456 also found that the same reads caused wholesale hook rebuilds when a hook ran inside a memo, so the warning pointed at a real defect. Because of dynamic scope, library-internal reads are reported with the *user's* component label.
2. **Engine-internal reads.** PR #3263: `Promise.resolve(store)`, `return store` from an async function, and `await refresh(store)` made the JS engine probe `.then` through the store proxy, which warned. Against a refetching store it could escalate to a throw that rejected the promise. PR #3326: `style()` and `className()` enumerated store objects in the untracked commit phase, producing one warning per leaf. Both are fixed in rc.8 and rc.9.
3. **Effect apply half.** Kobalte #723 (2026-08-27) wrapped apply-phase reads in `untrack`, including `computeStyle()`, whose dependencies were already tracked through `on(...)`. In a1121611810/Pictelio#427/#428, a home-page refresh logged **573** STRICT_READ_UNTRACKED warnings. Of those, **570** came from two read sites in an image loader called from effect apply halves, once per image (285 images). All of them were intentional snapshots, and five `untrack` annotations brought the count to zero. The spec explicitly kept `untrack` at call sites, not in accessor bodies, so that legitimate reactive consumers would keep working.
4. **Intentional seeds.** `createSignal(initialHomeTab())` in Pictelio; the TanStack observer construction.
5. **True positives that were only learnable through the warning.** solidjs/solid#3126: a destructure-at-top habit in `<For>` callbacks, where "a real app hit this 24 times from one list". The cheatsheet was updated in response.
6. **Lint versus runtime.** eslint-plugin-solid#213: `solid/reactivity` produced a false negative on the actual snapshot bug (`const list = items(); return () => list…`) and warned on the correct fix. The reporter said an agent "had to trust runtime diagnostics evidence over the lint output".

Net: the component-body rule has high precision on application code. The remaining noise came from library code, engine probes, the effect-apply label, and the absence of dedupe. In every case the fix was `untrack`. None of the reports asked to turn the check off.

## 2. MobX `observableRequiresReaction` (7.0.5)

- **The rule is inverted.** A global flag `allowStateReads` is initialised to `!observableRequiresReaction` in `configure()`. It becomes `true` inside derivations (`trackDerivedFunction`) and inside actions (`startAction`). Every `reportObserved` calls `checkIfStateReadsAreAllowed`, which prints ``console.warn(`[mobx] Observable '${name}' being read outside a reactive context.`)``. So MobX warns everywhere **except** inside allowed regions, while Solid warns only **inside** labeled regions.
- **Coverage.** Helpers are covered (dynamic scope again). Handlers called later **do** warn unless wrapped in `action`. `untracked()` does **not** silence the warning, because it only clears `trackingDerivation`; the silencer is `runInAction` or `action`. `reaction`'s effect half runs as an action, so it does not warn. Mine, measured: top-level read 1; autorun 0; `untracked()` 1; `action` or `runInAction` 0; a plain handler 1; `toJS(s)` 8; `JSON.stringify(s)` 7; `s.b.c` 2; 100 reads in a loop 100 (no dedupe); `const x = s.b` 1.
- **Attribution.** There is none. There is no reader context to name, only the observable's debug name (e.g. `Store@2.init`) and the stack trace.
- **History and noise.** The flag was added in 5.14/4.14 (PR #2079, 2019). The maintainer's reasoning there: "can't be true by default, because actions are optional by default and working with observable models outside of reactive context is completely valid", plus "I am afraid there may be some false positives". The docs say the strict settings can be "pretty annoying … Don't be fundamentalist about them", and warn that propTypes can trigger false positives. Open reports:
  - #4607 (2026-01, still open): React 19.2 performance tracks read observable props, which spams warnings in dev. The only remedy offered was to turn the flag off, and the reporter patches React instead.
  - #3835: `observable.box([1])` warns on creation.
  - #3648: warnings under `enableStaticRendering`.
  - #2909: `useEffect` calling an arrow-function action warns.
  
  The `warningSeverity` escalation PR (#3634) was **never merged**, so MobX cannot be configured to throw on these. MobX 7.0.0 (2026-07-30) left these flags unchanged.

## 3. What this means for our rule

- **Detection works without a compiler.** Solid's attribution is already a runtime mechanism: a label set around the component call, plus `Function.name`. Our risk is bypass. `Comp(props)` called directly produced 0 events. Invocation therefore has to be structural, through `h()` or a `component()` wrapper.
- **The snapshot bug is caught at its source**, but only if the code building structure runs inside a labeled region. Solid labels `<Show>`, `<Match>` and `<For>` builder bodies. We must also label the builder callbacks of our control-flow helpers. Otherwise `show(c, () => h(Child, {title: title()}))` runs in a tracked scope and silently remounts the child instead of warning.
- **The rule has two sources of noise, and a third we should avoid.** Dynamic-scope leaks (library and engine reads, synchronous dispatch), and the absence of dedupe. We should not import MobX's inverted rule at all.
- **Intentional snapshots are real.** They show up as seeds, imperative construction, and effect-apply reads. Solid's only answer is `untrack`, and every report above resolved that way. Whether agents then over-apply `untrack` has not been measured anywhere I found. No report showed `untrack` hiding a true bug, but nobody looked.

## 4. Earlier conflicts this evidence helps settle

- **Diagnostic code format.** Solid 2 RC, the only framework I found shipping agent-targeted diagnostics, uses descriptive stable codes (`DiagnosticCode` is a string-literal union of about 50 codes such as `STRICT_READ_UNTRACKED` and `REACTIVE_WRITE_IN_OWNED_SCOPE`). A versioned SKILL.md repair guide sits in `node_modules`, with per-code anchors and a once-per-code console footer. This supports descriptive codes over numeric `FW101`.
- **Agent access path.** Solid uses a page global, `globalThis.__SOLID_DIAGNOSTICS__`, plus a dev-server HTTP endpoint. There is no dependency on DevTools tool discovery. This supports `window.__FW__` as the stable contract.
- **Async primitive.** Solid PR #3602 (2026-09-23) added `UNTRACKED_READ_AFTER_AWAIT`. The PR says "JavaScript has no async context, so the read cannot be attributed to its computation directly". It works around this with a uniquely named async function frame read from V8 async stack traces, and it is **V8-only**, so it is silent in Safari and Firefox. That is concrete evidence for the reactivity note's `resource({params, load})` split, which removes the problem by construction, over a single-function `resource(fn)`, which needs an engine-specific heuristic.
- **Reactive-prop rule.** The strict-read check is indifferent to the `on*` question, because handlers are called later and never warn. So "function means live" plus the strict region is enough to catch the snapshot bug. A key-name exemption only matters for type-level rules, not for this diagnostic.
- **Node / test environment.** `solid-js`'s `node` export condition resolves the **server** build, where diagnostics never fire. My first run gave 0 events for every case until I added `--conditions=browser`. cobracket#30 hit the same trap ("a reactive test that is green while proving nothing"). Every experiment here also ran on EOL Node 25.1.0. The results do not depend on type stripping, but they should be re-run on Node 24.12+ LTS or 26.
- Symbol.dispose, moduleResolution, TS 7 overload text, decorators, ArrowJS and Safari dates, factory training prior, primitive naming, and stores are outside this question and were not re-examined.

IMPLICATIONS
- Copy Solid's rule, not MobX's. Report an untracked read only inside regions the framework labels, never 'everywhere outside reactions/actions'. The MobX maintainers refused to make their inverted rule default-on (PR #2079). It still has open false-positive issues (#4607, #3835, #3648) and no way to escalate severity (#3634 unmerged). Solid's region rule, measured on rc.9, had high precision on application code.
- Implement it as a dev-only module variable `strictLabel` that the component-invocation wrapper sets (`label = name ?? fn.name`) and restores in `finally`. Clear it at the start of every computation, in `untrack`/`peek`, and in the wrapper that calls framework-attached event handlers and ref or lifecycle callbacks. No compiler is needed; Solid's attribution is already this runtime mechanism.
- Make every component invocation go through the framework (h() or a `component(name, fn)` wrapper that labels even when called directly). Calling Comp(props) directly produced 0 warnings in Solid rc.9, so a bypass silently disables the check.
- Run the builder callbacks of control-flow helpers (show, each, switch) inside the strict region, as Solid does for <Show>, <Match> and <For>. Only then is `show(c, () => h(Child, {title: title()}))` caught instead of silently remounting Child. Solid issue #3126 found 24 such reads in one list.
- The snapshot bug `title: title()` is then caught in the parent's setup, where the read happens. Verified: Solid reports it under <Parent2>, with the child's getter reads reported under ownerPath Parent > Child. This is the mechanism the spec's 'types cannot catch it' fallback can rely on.
- Deduplicate: one report per (code, region definition, source node, call site), with a counter. Put the first user stack frame (file:line) in the structured event. Solid emits one console.warn per read: 100 reads gave 100 warnings, Pictelio saw 573 per page refresh, and PR #3326 measured 97.6 ms against 3.56 ms dev cost. Its events have no source location, so agents fall back to console stacks.
- Keep framework internals and devtools out of the user's strict region: then-probes, style/class enumeration, props inspection, serialization. Add a framework self-test that mounting every built-in yields zero diagnostics. Solid needed PRs #3263 and #3326 for exactly these, and TanStack Query flooded app components with library-internal seed reads (#11358).
- Do not label effect apply halves or callbacks, or give them a separate lower-severity code. That label caused most of the observed noise, and the reads were intentional snapshots: 570 of Pictelio's 573 warnings, and Kobalte #723.
- Make legitimate setup reads unnecessary so the escape hatch stays rare. Provide a seed-from-accessor form for local state (the framework reads it outside the strict region) and an onMount path for imperative construction. `createSignal(count())` and observer construction were the recurring intentional-snapshot cases.
- Keep one explicit snapshot escape (peek/untrack). In dev, have it emit an info-level acknowledgement event with the call site, so tests and reviewers can count snapshots instead of the warning vanishing silently. This is a proposal, not prior art: Solid's untrack clears the label without a trace, and whether agents over-apply it is unmeasured.
- Defaults: warn in dev. In tests, fail on STRICT_READ_UNTRACKED by default (failOn:'warn' for this code). The per-test allowance should assert that the code actually occurred (the cobracket #30 pattern), so it cannot become a silent mute. The Solid ecosystem already gates tests on zero diagnostics (@solidjs/diagnostics expectNoDiagnostics, the agent-loops skill, templates#283), and no report asked for the check to be removed.
- Escalate to an error when the value read in a strict region is pending async, as Solid's PENDING_ASYNC_UNTRACKED_READ does. There is nothing correct to snapshot.
- The error message should name both repairs, with 'make it live' as the default and 'intentional snapshot, use peek' second. Ship a versioned repair guide in the package and link it once per code, as Solid's SKILL.md footer does. This settles the diagnostic-code conflict in favour of descriptive codes.
- Resolve the async-primitive conflict toward resource({params, load}). Solid needed a V8-only async-stack-trace heuristic (PR #3602, UNTRACKED_READ_AFTER_AWAIT) to diagnose reads after await, which a split params/load API avoids by construction, and our targets include Safari.
- Ship a single dev build. Do not key a separate server or no-diagnostics build on the `node` export condition. Solid's node condition silently disables all diagnostics in tests, as seen in my experiment and in cobracket #30.

OPEN
- Do agents over-apply untrack/peek once the diagnostic fails their tests, and does it hide real snapshot bugs? No public data. It needs an eval of agent-written components with the gate on, counting untrack sites that were true bugs.
- Does Solid 2 clear the strict label when a delegated DOM event handler is dispatched synchronously during setup (el.focus(), el.click())? My Node experiment had no DOM. The equivalent synchronous-handler case did warn, so our framework must clear the label in its handler wrapper regardless.
- What does capturing the first user stack frame per deduplicated site cost in dev (new Error().stack or V8 structured call sites), and how reliably can framework frames be stripped in Safari and Firefox?
- Will Solid add dedupe, source locations or a severity switch before 2.0 final? rc.9 has none, and PR #3649 shows the observability API is still changing (breaking) after rc.9.
- Should the acknowledged-snapshot info event count against a per-scenario budget (e.g. maxSnapshots), or only be reported? This is untested design.
- All experiments ran on EOL Node 25.1.0. They should be re-run on Node 24.12+ LTS or 26 and in a real browser (Playwright) to confirm counts, especially store-proxy and DOM-handler cases.

SOURCES
- Solid CHEATSHEET.md (next branch): https://raw.githubusercontent.com/solidjs/solid/next/packages/solid/CHEATSHEET.md
- Solid reactivity-diagnostics SKILL.md (read from solid-js@2.0.0-rc.9 tarball): https://github.com/solidjs/solid/blob/main/packages/solid/skills/reactivity-diagnostics/SKILL.md
- @solidjs/diagnostics (README and agent-loops skill read from the 2.0.0-rc.9 tarball): https://www.npmjs.com/package/@solidjs/diagnostics
- TanStack/query #11358: solid-query STRICT_READ_UNTRACKED on Solid 2: https://github.com/TanStack/query/issues/11358
- TanStack/query #11456: untrack the one-shot client and options reads on mount: https://github.com/TanStack/query/pull/11456
- TanStack/query #11324: untrack the client read in useMutation: https://github.com/TanStack/query/pull/11324
- solidjs/solid #3263: exempt the thenable probe from the store strict-read check: https://github.com/solidjs/solid/pull/3263
- solidjs/solid #3326: readShallow() for style/class bindings: https://github.com/solidjs/solid/pull/3326
- solidjs/solid #3126: For/Show callback body is not a tracking scope: https://github.com/solidjs/solid/issues/3126
- solidjs/solid #2897: pending optimistic store readable in component body: https://github.com/solidjs/solid/issues/2897
- solidjs/solid #3602: warn in dev when an async computation reads after await: https://github.com/solidjs/solid/pull/3602
- solidjs/solid #3649: prune observability surface: https://github.com/solidjs/solid/pull/3649
- solidjs/solid #3500: setSignal owned-scope write guard vs store setter: https://github.com/solidjs/solid/issues/3500
- kobaltedev/kobalte #723: avoid STRICT_READ_UNTRACKED in effect callbacks: https://github.com/kobaltedev/kobalte/pull/723
- kobaltedev/kobalte #736: fix strict read untracked: https://github.com/kobaltedev/kobalte/pull/736
- Pictelio #427: SolidJS 2 STRICT_READ_UNTRACKED cleanup spec (573 warnings per refresh): https://github.com/a1121611810/Pictelio/issues/427
- Pictelio #428: five untrack annotations: https://github.com/a1121611810/Pictelio/issues/428
- eslint-plugin-solid #213: solid/reactivity false negative / false positive pair: https://github.com/solidjs-community/eslint-plugin-solid/issues/213
- solidjs/templates #283: enable agent diagnostics and AGENTS.md: https://github.com/solidjs/templates/pull/283
- lightsound/cobracket #30: fail any test that produced a Solid finding: https://github.com/lightsound/cobracket/pull/30
- SolidJS, It's the Little Things (brenelz): https://www.brenelz.com/posts/solidjs-its-the-little-things/
- MobX configuration docs (linting options): https://mobx.js.org/configuration.html
- MobX configuration.md source: https://raw.githubusercontent.com/mobxjs/mobx/main/docs/configuration.md
- mobx #2079: derivationRequiresObservable & observableRequiresReaction: https://github.com/mobxjs/mobx/pull/2079
- mobx #2909: Observable being read outside a reactive context: https://github.com/mobxjs/mobx/issues/2909
- mobx #3634: warning severity configuration (unmerged): https://github.com/mobxjs/mobx/pull/3634
- mobx #3648: enableStaticRendering causes read warnings: https://github.com/mobxjs/mobx/issues/3648
- mobx #3835: extra warning in observable.box(array): https://github.com/mobxjs/mobx/issues/3835
- mobx #4607: React 19.2 performance tracks trigger observableRequiresReaction warnings: https://github.com/mobxjs/mobx/issues/4607