# jasno design v2 changelog

Every feedback item on design v1, with its outcome. Fix order preferred: type error > dev runtime throw with hint > diagnostic > `jasno check` rule > doc line. Section references point to `design.md` (ADR-nn, Bn.n, (c)–(i)), `jasno.d.ts` (JSDoc, RECIPES block) and `AGENTS.md`.

**IDs.** Usability semantic bugs (from each app's review, in order): `U-C1..11` contacts, `U-T1..10` todo-timers, `U-D1..13` dashboard, `U-W1..10` wizard. Tester doc gaps: `U-xG#`; reviewer doc ambiguities: `U-xA#`; actionable leaked-idiom notes: `U-xL#`. Critics: reactivity `R1..R11` and `R-m1..R-m11`; TypeScript `TS-01..14`; agent red team `A01..A36`, `G01..G03`; toolchain `C1..C3`, `M1..M10`, `C-m1..C-m5`; scope `S1..S19`.

**Totals.** 271 rows: 44 usability semantic bugs (4 critical, 8 major, 32 minor), 112 critic items (8 critical, 57 major, 47 minor) and 115 tester doc gaps, reviewer ambiguities and leaked-idiom notes. Outcomes: 261 accepted (a few partly), 7 rejected (all app-level code, not jasno), 3 deferred (U-WA14, A10, M10). Every critical and major item is accepted except M10, deferred with a reason; parts deferred inside accepted items: custom elements (S2), a worker recipe (M6), a resource `refresh` option (U-D2), `beforeLeave` guards and nested layouts (S19), and `createRoot` is kept (S16).

## Usability: semantic bugs

| ID | Source | Severity | Outcome | What changed / why not |
|---|---|---|---|---|
| U-C1 | contacts review | critical | accepted | Hand-written import map shadowed the generated one. AGENTS.md now shows the complete `index.html` with `<!--jasno:head-->` and "Never write an import map"; `IMPORT_MAP_HANDWRITTEN` in `jasno check` and `jasno dev`; `jasno dev` refuses to inject a second map and serves an error page; `DUPLICATE_RUNTIME` hint repeats it (ADR-34, (c), (e)). |
| U-C2 | contacts review | major | accepted | Router focused `[autofocus]` inside a closed dialog. B17.8: first `[autofocus]` that passes `checkVisibility()` and is not in a closed dialog or hidden popover, then `h1`, then `main`; focus is verified and falls through; `VIEW_NO_HEADING`; the rule is in AGENTS.md and RECIPES. |
| U-C3 | contacts review | major | accepted | linkedSignal reset wiped edits typed during a save. `linkedSignal({ source, computation(source, previous: { source, value }) })` resets only when the source value changes (ADR-08, B5.6); RECIPES: key an edit draft by the record id, or merge using `previous.source`. |
| U-C4 | contacts review | minor | accepted | Stale `resource.set()` after `await`. `RESOURCE_SET_WHILE_LOADING` (B9.8); AGENTS.md async line and RECIPES "Mutations" (capture params, `reload()`); the design's own example fixed. |
| U-C5 | contacts review | minor | accepted | Disabling the focused button lost focus. `FOCUS_LOST` (B20); AGENTS.md top-mistakes row; RECIPES forms (`aria-disabled` + guard); example `note-form.ts` no longer disables its submit button. |
| U-C6 | contacts review | minor | accepted | `navigate()` rejected with AbortError when superseded. It resolves `NavigateResult` (`'done' \| 'superseded' \| 'failed'`) and never rejects for outcomes (B17.13). |
| U-C7 | contacts review | minor | accepted | No `{ replace: true }` after delete. AGENTS.md routing line and RECIPES. |
| U-C8 | contacts review | minor | accepted | Single-slot module state for the header count, imported from a component module. RECIPES "State and lifetime": app-wide signals in `src/state.ts`, a view publishes in `onMount` and resets in the cleanup; AGENTS.md states the `src/state.ts` rule. |
| U-C9 | contacts review | minor | accepted | Unnamed dialog, misplaced `aria-busy`. `INTERACTIVE_NO_NAME` now checks `dialog` (and `meter`, `progress`); RECIPES dialog uses `aria-labelledby`, status text uses `role: 'status'`. |
| U-C10 | contacts review | minor | rejected | Phone `''` and 204 handling are app API contracts, not jasno; the `api.ts` convention (validate at the boundary) is in design (f). |
| U-C11 | contacts review | minor | accepted | `alive` flag guarded harmless writes. `WRITE_AFTER_DISPOSE` removed; AGENTS.md: "Late writes after disposal are harmless" (ADR-12). |
| U-T1 | todo-timers review | critical | accepted | Same as U-C1. |
| U-T2 | todo-timers review | major | accepted | Row-owned stopwatch died on filtering and navigation. AGENTS.md lists line ("A row dies when its key leaves the list..., state that must survive lives in the item or a parent"); `each`/`show` JSDoc; RECIPES timers keep `startedAt` in the item. |
| U-T3 | todo-timers review | major | accepted | Elapsed time counted interval ticks. RECIPES clock idiom (`now` signal, elapsed derived from timestamps). |
| U-T4 | todo-timers review | minor | accepted | Persistence effect's first run overwrote storage. `effect` JSDoc and AGENTS.md: "runs in the first flush, then on each change"; RECIPES persist: validate what you load first. |
| U-T5 | todo-timers review | minor | accepted | `localStorage.setItem` threw in an effect every second. RECIPES persist uses try/catch; B8.3 reporting defined; tests fail with `UNCAUGHT_ERROR`. |
| U-T6 | todo-timers review | minor | rejected | The 'n' shortcut's editable-target guard is plain DOM logic, not jasno. |
| U-T7 | todo-timers review | minor | accepted | Identical names on repeated row buttons. RECIPES: row-specific `aria-label`s. A cross-row duplicate-name diagnostic is deferred (heuristic, needs eval data). |
| U-T8 | todo-timers review | minor | accepted | Focus lost on remove and on keyed moves without `moveBefore`. B11.4 re-focuses after `insertBefore`; removal reports `FOCUS_LOST`. |
| U-T9 | todo-timers review | minor | accepted | Header inside `main`, views without `h1`. AGENTS.md: App is `h.header(nav)` + `h.main(null, router.outlet())`, every view starts with a static `h.h1`; `VIEW_NO_HEADING`. |
| U-T10 | todo-timers review | minor | accepted | `ROWS_RECREATED` false positive on filter tabs. Replaced by `UNSTABLE_KEY` (key function called twice) (B11.1, ADR-24). |
| U-D1 | dashboard review | critical | accepted | Same as U-C1, plus: the dev client listens for `error` in the capture phase so failed module loads are forwarded; a 404 under `/@jasno/` names the right file ((e)). |
| U-D2 | dashboard review | major | accepted | `setInterval` + `reload()` starved slow requests. `reload()` JSDoc says it aborts a load in flight; RECIPES polling schedules the next reload after the last settled, with visibility handling. A `refresh` option is deferred until the eval shows repeated hand-rolling. |
| U-D3 | dashboard review | major | accepted | Selection was O(N). `selector()` restored (ADR-31, B21); bindings skip `Object.is`-equal DOM writes (B15.3). |
| U-D4 | dashboard review | major | accepted | `insertBefore` fallback lost focus on live-sorted rows. B11.4 re-focuses the moved row's active element. |
| U-D5 | dashboard review | minor | accepted | catchError Retry lost focus. B8.5 focuses the first focusable element of the new content. |
| U-D6 | dashboard review | minor | accepted | Focusable `<tr>` with `aria-selected` in a plain table. RECIPES: one real control per row with `aria-pressed`. A warning for focusable non-widget elements is deferred. |
| U-D7 | dashboard review | minor | rejected | `all: unset` removing the focus ring is app CSS. |
| U-D8 | dashboard review | minor | accepted | `role=status` toast region re-read everything, no dismiss. RECIPES toast region: `aria-live: 'polite'`, row timers, dismiss button; the example's `toast.ts` follows it. |
| U-D9 | dashboard review | minor | accepted | Toast spam from an effect on `status()`; `reload()` JSDoc contradicted B9.12. JSDoc fixed; that effect now reports `EFFECT_WRITES_STATE`; RECIPES: react to failures in the loader. |
| U-D10 | dashboard review | minor | accepted | Unnamed `meter`. `INTERACTIVE_NO_NAME` covers `meter` and `progress`. |
| U-D11 | dashboard review | minor | rejected | `Math.max(0, ...)` and `<` string sort are app logic. |
| U-D12 | dashboard review | minor | accepted | Unvalidated JSON. Convention in design (f): typed fetch functions validate payloads; the example's `api.ts` does. |
| U-D13 | dashboard review | minor | accepted | Theme attribute on `<html>` never cleaned up. RECIPES: effects that touch document-level state return a cleanup. |
| U-W1 | wizard review | critical | accepted | Same as U-C1. |
| U-W2 | wizard review | major | accepted | Success view dropped focus; pre-filled live region not announced. `FOCUS_LOST`; RECIPES focus: status text lives in a region that exists before its text changes. |
| U-W3 | wizard review | minor | accepted | Disabled focused Submit. As U-C5; the example that taught it is fixed. |
| U-W4 | wizard review | minor | accepted | Heading took focus on first render. `onMount` JSDoc says it also runs on first render; RECIPES "focus on change only" (plain boolean prop from the handler path). |
| U-W5 | wizard review | minor | accepted | Availability resource rebuilt on every Back. `show` JSDoc ("everything created inside dies then") and AGENTS.md lists line cover branch lifetime. |
| U-W6 | wizard review | minor | accepted | `undefined` from the API meant "no value". `resource<T extends {} \| null>`: a loader resolving `undefined`/`void` is a type error; AGENTS.md: resolve `null`. |
| U-W7 | wizard review | minor | accepted | Regex validity disagreed with native validation. RECIPES forms: store `e.currentTarget.validity.valid`, rely on native validation. |
| U-W8 | wizard review | minor | rejected | A weak final assertion is test design; the happy-dom click facts it needed are in design (g) and appendix E6. |
| U-W9 | wizard review | minor | rejected | `plan() ?? 'free'` is app code. |
| U-W10 | wizard review | minor | accepted | No dependencies, @types/node unresolved. package.json template with devDependencies (f); separate test program (`tsconfig.test.json`, template `tsconfig.app-test.json`); AGENTS.md Project line. |

## Usability: tester doc gaps, reviewer ambiguities, leaked-idiom notes

| ID | Source | Severity | Outcome | What changed / why not |
|---|---|---|---|---|
| U-CG1 | contacts tester | gap | accepted | Import map and how `.ts` runs: AGENTS.md header ("`jasno dev` strips types") and Project section. |
| U-CG2 | contacts tester | gap | accepted | Publishing state to the shell, writes in `onMount`, functions in signals: RECIPES state; B5.2 (writes in `onMount` are silent); a signal may hold a function (unchanged; `set` is not overloaded). |
| U-CG3 | contacts tester | gap | accepted | Per-record titles: title is a binding owned by the view; a title-less route leaves `document.title` to the view (B17.10); RECIPES. |
| U-CG4 | contacts tester | gap | accepted | Loader vs resource: RECIPES "Loader or resource?". |
| U-CG5 | contacts tester | gap | accepted | One view for two routes: views with the same params can now serve several patterns (TS-04); different params: one view per route sharing a component (RECIPES). |
| U-CG6 | contacts tester | gap | accepted | Resource without params: AGENTS.md "No `params` = load once"; `ResourceOptions` JSDoc. |
| U-CG7 | contacts tester | gap | accepted | Writes after disposal, abort for handler work: AGENTS.md late-writes line; `abortSignal` for side effects. |
| U-CG8 | contacts tester | gap | accepted | Native validation and controlled inputs: RECIPES forms; caret safety from B15.4. |
| U-CG9 | contacts tester | gap | accepted | Dialog patterns: RECIPES modal dialog. |
| U-CG10 | contacts tester | gap | accepted | `jasno check` unavailable: AGENTS.md "If a rung cannot run, say so; never claim it passed"; commands are npm scripts (ADR-36). Shipping a binary into the test harness is outside the design. |
| U-CG11 | contacts tester | gap | accepted | `"type": "module"`: AGENTS.md Project line; `TSCONFIG_DRIFT`; template comments. |
| U-CA1 | contacts review | ambiguity | accepted | As U-C1. |
| U-CA2 | contacts review | ambiguity | accepted | Mount target: `mount(App, document.getElementById('app'))` type-checks (`Element \| null`, `MOUNT_TARGET_MISSING`); the router's live region is appended to `body` at the first announcement (B17.9), so it survives `mount`. |
| U-CA3 | contacts review | ambiguity | accepted | Router focus rule: B17.8, AGENTS.md, RECIPES. |
| U-CA4 | contacts review | ambiguity | accepted | As U-C3. |
| U-CA5 | contacts review | ambiguity | accepted | As U-C4. |
| U-CA6 | contacts review | ambiguity | accepted | As U-CG6. |
| U-CA7 | contacts review | ambiguity | accepted | As U-C11. |
| U-CA8 | contacts review | ambiguity | accepted | As U-C6, U-C7. |
| U-CA9 | contacts review | ambiguity | accepted | As U-CG3, U-CG4. |
| U-CA10 | contacts review | ambiguity | accepted | As U-CG2. |
| U-CA11 | contacts review | ambiguity | accepted | Forms: RECIPES forms; `FOCUS_LOST`; IME/caret: B15.4 never writes an equal value, so composition is not disturbed. |
| U-CA12 | contacts review | ambiguity | accepted | As U-CG9. |
| U-CA13 | contacts review | ambiguity | accepted | As U-CG5. |
| U-CA14 | contacts review | ambiguity | accepted | Effect copying with no diagnostic: `EFFECT_WRITES_STATE` (A04). |
| U-CA15 | contacts review | ambiguity | accepted | `debugName` unmentioned: AGENTS.md runtime line `.why(name)`; `SignalOptions` JSDoc says it names the node in diagnostics and `__JASNO__`. |
| U-CA16 | contacts review | ambiguity | accepted | As U-CG10. |
| U-CL1 | contacts tester | idiom | accepted | "Sync to a global store" effect: `EFFECT_WRITES_STATE`. |
| U-CL2 | contacts tester | idiom | accepted | `getElementById('app')!`: unnecessary now (ADR-17). |
| U-CL3 | contacts tester | idiom | accepted | tsc missed `h.p(null, count())`, `items.length`, effect copies: `items.length` is now a type error when used (TS-01); `count()` in setup is `STRICT_READ_UNTRACKED` at runtime and `SNAPSHOT_TO_ACCESSOR` in `jasno check`; effect copies report `EFFECT_WRITES_STATE`. A `.length` assigned to an unused const stays undetected (documented limitation of the union guard). |
| U-TG1 | todo-timers tester | gap | accepted | As U-C1. |
| U-TG2 | todo-timers tester | gap | accepted | How `.ts` runs: as U-CG1. |
| U-TG3 | todo-timers tester | gap | accepted | Query strings: AGENTS.md routing line; RECIPES; `router.url` is `Signal<ReadonlyURL>`. |
| U-TG4 | todo-timers tester | gap | accepted | Link interception: `createRouter` JSDoc ("only same-origin links whose path matches a route are intercepted") and B17.4. |
| U-TG5 | todo-timers tester | gap | accepted | Per-row resources: `onMount` JSDoc (component, branch or row); RECIPES toast rows own their timers. |
| U-TG6 | todo-timers tester | gap | accepted | Signals in handlers and timers: AGENTS.md reactive rule ("read signals only inside functions you give to jasno"); B1.1. |
| U-TG7 | todo-timers tester | gap | accepted | Where app-lifetime effects live: AGENTS.md ("in App's setup"); `createRoot` JSDoc for module-level work. |
| U-TG8 | todo-timers tester | gap | accepted | css class stamping: `css` JSDoc and AGENTS.md ("put `class: 'card'` on the root"). |
| U-TG9 | todo-timers tester | gap | accepted | routes↔views import cycle: AGENTS.md `: Node` rule; design (f); `jasno check` TS7022 rewrite. |
| U-TG10 | todo-timers tester | gap | accepted | As U-CG11. |
| U-TG11 | todo-timers tester | gap | accepted | Views may omit `p`: shown in the example (`UsersView`, `NotFound`); ADR-06 unchanged. |
| U-TA1 | todo-timers review | ambiguity | accepted | As U-C1. |
| U-TA2 | todo-timers review | ambiguity | accepted | As U-TG3; search-only navigation behaviour in B17.7. |
| U-TA3 | todo-timers review | ambiguity | accepted | As U-TG4. |
| U-TA4 | todo-timers review | ambiguity | accepted | Scroll on search-only navigation: kept (B17.11). |
| U-TA5 | todo-timers review | ambiguity | accepted | As U-T2. |
| U-TA6 | todo-timers review | ambiguity | accepted | As U-T4. |
| U-TA7 | todo-timers review | ambiguity | accepted | As U-TG7. |
| U-TA8 | todo-timers review | ambiguity | accepted | As U-T9. |
| U-TA9 | todo-timers review | ambiguity | accepted | As U-TG8. |
| U-TA10 | todo-timers review | ambiguity | accepted | As U-TG6. |
| U-TA11 | todo-timers review | ambiguity | accepted | Module state in tests: `mountTest` restores module-level signals (B19.5); AGENTS.md testing line. |
| U-TA12 | todo-timers review | ambiguity | accepted | As U-T10. |
| U-TA13 | todo-timers review | ambiguity | accepted | As U-TG9, U-TG11. |
| U-TA14 | todo-timers review | ambiguity | accepted | As U-T7. |
| U-TL1 | todo-timers tester | idiom | rejected | Destructuring swap under `noUncheckedIndexedAccess`: plain TypeScript, not jasno. |
| U-TL2 | todo-timers tester | idiom | accepted | `` `${count}` `` and `h.p(null, count())` compile: templates with any zero-parameter callable are `SIGNAL_IN_TEMPLATE` in `jasno check` (A02); setup snapshots stay runtime diagnostics. |
| U-DG1 | dashboard tester | gap | accepted | As U-C1. |
| U-DG2 | dashboard tester | gap | accepted | "No build step" claim: AGENTS.md now says `jasno dev` strips types; `jasno dist` in design (e). |
| U-DG3 | dashboard tester | gap | accepted | No portal: RECIPES (dialog, popover, toast region in the shell); ADR-18. |
| U-DG4 | dashboard tester | gap | accepted | As U-D3. |
| U-DG5 | dashboard tester | gap | accepted | As U-CG6. |
| U-DG6 | dashboard tester | gap | accepted | As U-D2. |
| U-DG7 | dashboard tester | gap | accepted | Status after an error and keeping the last good value: B9.14 table (`error` + `reload()` → `loading`); RECIPES keep-last-value `linkedSignal`. |
| U-DG8 | dashboard tester | gap | accepted | `update()` in an effect: `update` reads the current value untracked (B2.4); writing in an effect run reports `EFFECT_WRITES_STATE`. |
| U-DG9 | dashboard tester | gap | accepted | Providing a writable signal: context JSDoc ("provide signals for live data"); document-level writes: RECIPES cleanup rule. Which shape to provide is left to the app. |
| U-DG10 | dashboard tester | gap | accepted | `catchError` reset and setup throws: JSDoc ("reset() re-runs tryFn from scratch"), B8.2, B8.5. |
| U-DG11 | dashboard tester | gap | accepted | Subscribe in `onMount` returning the unsubscribe: `onCleanup` removed; AGENTS.md `onMount` sample returns a cleanup. |
| U-DG12 | dashboard tester | gap | accepted | As U-CG10. |
| U-DA1 | dashboard review | ambiguity | accepted | As U-C1; design (e) covers dev and dist behaviour with an existing map and CSP. |
| U-DA2 | dashboard review | ambiguity | accepted | As U-DG2. |
| U-DA3 | dashboard review | ambiguity | accepted | As U-D9. |
| U-DA4 | dashboard review | ambiguity | accepted | As U-CG6. |
| U-DA5 | dashboard review | ambiguity | accepted | `hasValue()` is documented as a tracked read (JSDoc, B9.9). |
| U-DA6 | dashboard review | ambiguity | accepted | Unchanged binding values skip the DOM write (B15.3). |
| U-DA7 | dashboard review | ambiguity | accepted | `selector` restored with an ADR (ADR-31). |
| U-DA8 | dashboard review | ambiguity | accepted | Render-elsewhere: RECIPES popover and toast region keep nodes in the tree; `onMount` JSDoc defines "after insertion". |
| U-DA9 | dashboard review | ambiguity | accepted | As U-D5, U-DG10. |
| U-DA10 | dashboard review | ambiguity | accepted | As U-DG9. |
| U-DA11 | dashboard review | ambiguity | accepted | As U-DG11. |
| U-DA12 | dashboard review | ambiguity | accepted | As U-D9. |
| U-DA13 | dashboard review | ambiguity | accepted | As U-D2. |
| U-DA14 | dashboard review | ambiguity | accepted | As U-D4. |
| U-DA15 | dashboard review | ambiguity | accepted | Accessibility check scope documented (B15.10); widened to dialog, meter, progress; focusable non-widget warning deferred. |
| U-DL1 | dashboard tester | idiom | accepted | Portal habit: RECIPES alternatives (ADR-18). |
| U-DL2 | dashboard tester | idiom | accepted | `createSelector` habit: `selector()`. |
| U-DL3 | dashboard tester | idiom | accepted | `setInterval` polling habit: RECIPES polling. |
| U-WG1 | wizard tester | gap | accepted | As U-C1. |
| U-WG2 | wizard tester | gap | accepted | As U-W10. |
| U-WG3 | wizard tester | gap | accepted | Are `set`/`update` bound: declared as properties and documented as bound (TS-03, A22). |
| U-WG4 | wizard tester | gap | accepted | Debounce and aborted loaders: RECIPES debounce; B7.4 (a load jasno aborted never becomes an error). |
| U-WG5 | wizard tester | gap | accepted | As U-DA5. |
| U-WG6 | wizard tester | gap | accepted | `onMount` scope, branches, first render: JSDoc; B6.9; RECIPES focus on change only. |
| U-WG7 | wizard tester | gap | accepted | As U-TG8. |
| U-WG8 | wizard tester | gap | accepted | Radio groups, number inputs, controlled inputs: RECIPES forms. |
| U-WG9 | wizard tester | gap | accepted | POST actions and async handlers: RECIPES mutations; late writes harmless. |
| U-WG10 | wizard tester | gap | accepted | Which APIs need an owner: B6.8 and the `NO_OWNER` message (effects, `onMount`, resources, components; signals and computeds do not). |
| U-WG11 | wizard tester | gap | accepted | Clicking radios in tests: design (g) and E6 (`click()` fires `click`, `input`, `change`). |
| U-WG12 | wizard tester | gap | accepted | As U-CG10. |
| U-WA1 | wizard review | ambiguity | accepted | As U-C1. |
| U-WA2 | wizard review | ambiguity | accepted | As U-WG3. |
| U-WA3 | wizard review | ambiguity | accepted | As U-WG6. |
| U-WA4 | wizard review | ambiguity | accepted | As U-WG4; the status is `loading` during the debounce wait (B9.4). |
| U-WA5 | wizard review | ambiguity | accepted | As U-DA5, U-W6. |
| U-WA6 | wizard review | ambiguity | accepted | As U-W5. |
| U-WA7 | wizard review | ambiguity | accepted | As U-WG8. |
| U-WA8 | wizard review | ambiguity | accepted | As U-W7. |
| U-WA9 | wizard review | ambiguity | accepted | As U-WG9. |
| U-WA10 | wizard review | ambiguity | accepted | As U-WG10. |
| U-WA11 | wizard review | ambiguity | accepted | As U-WG11, U-W10. |
| U-WA12 | wizard review | ambiguity | accepted | As U-TG8. |
| U-WA13 | wizard review | ambiguity | accepted | Focus outside the router: as U-W2, U-W4; `FOCUS_LOST`. |
| U-WA14 | wizard review | ambiguity | deferred | A `debounced` resource option (Angular 22): the loader-delay recipe covers it; add only if the eval shows repeated hand-rolling. |
| U-WL1 | wizard tester | idiom | accepted | Unbound `username.set` as a callback: safe and typed (bound properties). |
| U-WL2 | wizard tester | idiom | accepted | useEffect-style debounce habit: RECIPES debounce. |

## Critic: reactivity

| ID | Source | Severity | Outcome | What changed / why not |
|---|---|---|---|---|
| R1 | reactivity | major | accepted | Phase (a) is a creation-ordered queue drained until empty; bindings split into user function and apply half; per-consumer cap; regression test for same-flush row DOM (B4.3, B4.5, B4.6, ADR-11). |
| R2 | reactivity | major | accepted | Consumers dropped at the cap stay subscribed and re-armed; the message lists possibly stale bindings (B4.6). |
| R3 | reactivity | major | accepted | Disposal order: mark, children, abort, cleanups (untracked, no owner), unlink; disposed computeds read untracked and uncached (B6.3). A `READ_AFTER_DISPOSE` info code is rejected (info codes invite noise, S17). |
| R4 | reactivity | major | accepted | Cleanups run at most once; stop/dispose idempotent; self-disposal runs the returned cleanup when the run returns; the abort fires at once (B6.5). |
| R5 | reactivity | major | accepted | linkedSignal `{ source, computation }` with a memoized source (ADR-08, B5.6); `set` settles pending recomputation (B3.5); resource params compare shallowly (B9.3). An `equal` option for params is rejected: the shallow default covers the case. |
| R6 | reactivity | major | accepted | State is a pure function of `params()` and the request record (B9.4); params evaluated at creation, loader in phase (a) via `Promise.try` (B9.5); `previous` removed (moot); throwing params give `error`; `reload()`/`set()` no-ops while idle or disposed (B9.7, B9.8). |
| R7 | reactivity | major | accepted | A rejection is ignored only when stale or aborted by jasno; the loader's own AbortError is an error state (B7.4); the router likewise (B17.5). |
| R8 | reactivity | major | accepted | Example fixed; `RESOURCE_SET_WHILE_LOADING`; RECIPES mutations. |
| R9 | reactivity | major | accepted | Region guards (B8.9); first evaluation follows B8.2; CI test with one throwing row among 100 (ADR-11). |
| R10 | reactivity | major | accepted | Internal `report()` falls back to `queueMicrotask` throw; flush continues; `jasno/testing` records and fails the owning test with `UNCAUGHT_ERROR` (ADR-25, B8.3, B19.3). |
| R11 | reactivity | major | accepted | `ROWS_RECREATED` replaced by `UNSTABLE_KEY` (B11.1). |
| R-m1 | reactivity | minor | accepted | Unobserved computeds do not cache or keep links (B1.3); derivations have no owner, creating owned things throws `OWNED_IN_DERIVATION` (B6.11). |
| R-m2 | reactivity | minor | accepted | Lagging builder Reads listed in B3.4 and AGENTS.md's reactive rule. The `STALE_BUILDER_READ` diagnostic is deferred (doc first; add if the eval shows the bug). |
| R-m3 | reactivity | minor | accepted | `render(item, index, key)` passes the plain key (ADR-14). |
| R-m4 | reactivity | minor | accepted | `flush()` in phase (b) drains bindings; in derivations/setup it throws `FLUSH_REENTRANT` in both builds (B4.2). |
| R-m5 | reactivity | minor | accepted | Dev async-loop guard over microtask flushes (B4.10). |
| R-m6 | reactivity | minor | accepted | User errors are never mutated; scheduling writes kept in a `WeakMap` (B4.9, B8.7). |
| R-m7 | reactivity | minor | accepted | Owner link is a dev-only token; disposed owners drop references; `WRITE_AFTER_DISPOSE` removed (B6.2, B6.3). |
| R-m8 | reactivity | minor | accepted | `resource<T extends {} \| null>` (type error for `undefined`/`void` loaders). |
| R-m9 | reactivity | minor | accepted | AGENTS.md's effect sample is `document.title`; fetching belongs to `resource()`. An exported `ignoreAbort` helper is rejected (no remaining use case). |
| R-m10 | reactivity | minor | accepted | `NODE_OUTSIDE_REGION` (B10.6). |
| R-m11 | reactivity | minor | accepted | Module-level signals restored after each test; diagnostics from non-test owners tagged `<module root>` (B19.2, B19.5). |

## Critic: TypeScript

| ID | Source | Severity | Outcome | What changed / why not |
|---|---|---|---|---|
| TS-01 | typescript | major | accepted | `Read<T>` is an interface whose `length`/`name` carry the "call it first" message inline (ADR-05). |
| TS-02 | typescript | major | accepted | Generated props are `MaybeRead<E['x'] \| undefined>`; `class` accepts `Read<string \| undefined>`; style leaves accept `undefined` (ADR-02, ADR-23). |
| TS-03 | typescript | major | accepted | `set`/`update` (and resource `set`/`reload`) are readonly function properties: invariant and visibly bound (ADR-07). |
| TS-04 | typescript | major | accepted | `route<const P extends `/${string}`>(path, options: RouteOptions<NoInfer<P>, D>)` (ADR-21). |
| TS-05 | typescript | major | accepted | `resource<T, P = unknown>`; AGENTS.md shows no type arguments. |
| TS-06 | typescript | major | accepted | `match` render returns `Rendered` (no `null`/`undefined`/booleans) (ADR-14). |
| TS-07 | typescript | minor | accepted | `each(list, { key, render })`: a missing key says `Property 'key' is missing` (ADR-14). |
| TS-08 | typescript | minor | accepted | `createContext<T = message>` (ADR-20). |
| TS-09 | typescript | minor | accepted | `LiveText` carries the message, extended to name `each()` (A35). |
| TS-10 | typescript | minor | accepted | `component` accepts `[props?: unknown]` (ADR-06). |
| TS-11 | typescript | minor | accepted | `jasno check` prints related information, rewrites TS2554 on component values (children hint) and orders the TS7022 cascade after `COMPONENT_RETURN_TYPE` findings ((c)). The `each` rewrite became unnecessary with the object form. |
| TS-12 | typescript | minor | accepted | `href` params accept numbers (literal-union params stay literal). |
| TS-13 | typescript | minor | accepted | Handler brand prints "a signal is not a handler". The component-callback brand (`Callback<A>`) is rejected: rare, and it would add an export. |
| TS-14 | typescript | minor | accepted | AGENTS.md: gate on `hasValue()`, never `value()!`; `hasValue` JSDoc. A discriminated `state()` is deferred to eval data. |

## Critic: agent red team

| ID | Source | Severity | Outcome | What changed / why not |
|---|---|---|---|---|
| A01 | agent red team | critical | accepted | Covered by the guarded `Read` interface (TS-01), which also guards user-declared props; a runtime `name`/`length` trap is rejected (Node's inspector reads `name`, so `console.log(signal)` would throw). |
| A02 | agent red team | major | accepted | `SIGNAL_IN_TEMPLATE` keys on any zero-parameter call signature ((c), (e)). |
| A03 | agent red team | critical | accepted | `LOADER_READ_UNTRACKED` (B9.13, B12.3); AGENTS.md async line and top-mistakes row. |
| A04 | agent red team | major | accepted | `EFFECT_WRITES_STATE` replaces `EFFECT_WRITES_OWN_SOURCE` (ADR-12, B5.3). |
| A05 | agent red team | major | accepted | Effect sample replaced; `ASYNC_IN_EFFECT` `jasno check` warning. |
| A06 | agent red team | critical | accepted | Frozen arrays/Map/Set in `signal()` and `resource()` values; `signal<T, T>` escape (ADR-07). `SET_SAME_OBJECT` is rejected: the type covers the common path. |
| A07 | agent red team | major | accepted | AGENTS.md and `ResourceStatus` JSDoc: gate content on `hasValue()`, spinners on `isLoading()`. The `STATUS_RESOLVED_CHECK` rule is deferred (doc first). |
| A08 | agent red team | minor | accepted | As R-m8. |
| A09 | agent red team | major | accepted | `css(strings)` takes no values (type error). `CSS_IN_SETUP` is rejected: without values a call in setup is harmless. |
| A10 | agent red team | minor | deferred | `CSS_SELECTOR_COLLISION` needs sheet parsing; the component-class convention stands for v1. |
| A11 | agent red team | major | accepted | `NODE_MOVED` (B15.6). |
| A12 | agent red team | major | accepted | `LEAK_IN_SETUP` (B12.8); AGENTS.md: "jasno disposes what jasno creates; window/document listeners and timers go in `onMount`". |
| A13 | agent red team | major | accepted | `CURRENT_TARGET_AFTER_AWAIT` `jasno check` rule; `Handler` JSDoc and AGENTS.md line. The runtime Proxy is rejected (cost on every event). |
| A14 | agent red team | minor | accepted | `SUBMIT_NOT_PREVENTED` (B15.7). |
| A15 | agent red team | major | accepted | Search-param recipe and "never touch history or location" in AGENTS.md; `USE_ROUTER` rule; `ReadonlyURL`. |
| A16 | agent red team | minor | accepted | `NavigateResult`, handled internally (B17.13). |
| A17 | agent red team | minor | accepted | Message-typed `dialog.open` (ADR-02). |
| A18 | agent red team | minor | accepted | Void elements and `textarea` take no children (ADR-02). |
| A19 | agent red team | minor | accepted | Closed `aria-*` keys from `ARIAMixin`; `data-*` booleans: `true` → `''`, `false` removes (B15.4). |
| A20 | agent red team | minor | accepted | RECIPES focus (focus nodes created by a change in their builder's `onMount`). |
| A21 | agent red team | minor | accepted | `<select>` re-applies its bound value after its children change (B15.9). |
| A22 | agent red team | major | accepted | As TS-03; all Signal/Resource/Router members documented as bound. |
| A23 | agent red team | major | accepted | Hint reworded (live first); `UNTRACKED_IN_DERIVATION`; AGENTS.md "untracked() only for values that must never update". |
| A24 | agent red team | minor | accepted | linkedSignal names its source (ADR-08). |
| A25 | agent red team | major | accepted | Example `user.ts` captures the id and reloads; `RESOURCE_SET_WHILE_LOADING`. |
| A26 | agent red team | minor | accepted | Fragments contribute the nodes they had when inserted (B10.5, B11.7, B15.6). |
| A27 | agent red team | minor | accepted | `provide(context, value, fn: () => Node): Node`: an empty scope is a type error, better than the proposed `PROVIDE_EMPTY_SCOPE`. |
| A28 | agent red team | minor | accepted | `match<K extends MatchKey>`: object keys are a type error, better than the proposed doc line or `MATCH_OBJECT_KEY`. |
| A29 | agent red team | major | accepted | `ROUTE_SHADOWED` in both builds (B17.1). |
| A30 | agent red team | minor | accepted | Separate browser program (C1) plus `NODE_TYPES_IN_BROWSER_CODE`; config through `#config` (M3). |
| A31 | agent red team | major | accepted | Module-level signals restored after each test (B19.5), instead of a test-failing `MODULE_STATE_WRITTEN`. |
| A32 | agent red team | major | accepted | `settled()` uses timers captured at import (B19.6, JSDoc). |
| A33 | agent red team | major | accepted | `expect` excludes codes that always mean broken code, at the type level. |
| A34 | agent red team | major | accepted | `jasno dev` sends the production CSP; `NO_HTML_SINK` rule; `svg()` removes the icon reason for `innerHTML`. |
| A35 | agent red team | major | accepted | `LiveText` message names `each()`; `NODE_IN_TEXT_BINDING` hint too. |
| A36 | agent red team | minor | accepted | Solved with the object form; `each(list, render, key)` rejected (the key could not be passed to `render` with a typed value). |
| G01 | agent red team | major | accepted | All five statements fixed: "jasno disposes what jasno creates", non-fetch effect sample, error gating in the async text, builders run when their branch or row is built, `untracked` restricted. |
| G02 | agent red team | major | accepted | The top-mistakes table lists only mistakes tsc accepts; self-explaining rows deleted (ADR-30). |
| G03 | agent red team | minor | accepted | AGENTS.md: `Read<T>` data props, `?: Read<T> \| undefined`; `navigate` JSDoc says `void router.navigate(url)` is fine; RECIPES focus-after-change and guards. |

## Critic: toolchain

| ID | Source | Severity | Outcome | What changed / why not |
|---|---|---|---|---|
| C1 | toolchain | critical | accepted | Browser and test programs; `jasno check` runs both; triple-slash convention removed; file classes defined; `IMPORT_NOT_MAPPED` browser-only (ADR-26, (e)). The design's own validation uses the same split (`tsconfig.json`, `tsconfig.test.json`). |
| C2 | toolchain | critical | accepted | Loopback bind, allowlist, dot-segment rejection, Host check, same-origin log endpoint with size cap and control-character stripping (ADR-34). |
| C3 | toolchain | critical | accepted | Publish allowlist, never dotfiles or tests, `SECRET_FILE_IN_OUTPUT`, `jasno dist --list` (ADR-29). |
| M1 | toolchain | major | accepted | Hashed file names in place; immutable caching per path; `--keep N`; `VIEW_IMPORT_FAILED` with one full navigation (ADR-29, B17.17). |
| M2 | toolchain | major | accepted | Dependencies imported by name, resolved by Node's resolver, copied as file closures; `DEP_NOT_BROWSER_ESM` (ADR-35). |
| M3 | toolchain | major | accepted | Conditional `#config` imports as the one environment mechanism; "everything under src/ is public" in RECIPES and design (f). |
| M4 | toolchain | major | accepted | Production CSP in `jasno dev`; `jasno preview`; CI rung on the shipped artifact; scaffolded CI with pinned Node ((e), (f), (g)). |
| M5 | toolchain | major | accepted | SPA fallback in `jasno dev` and `jasno preview`; `_redirects` and `404.html` from `jasno dist`. |
| M6 | toolchain | major | accepted | `WORKER_UNSUPPORTED` for v1; the narrow worker recipe is deferred (open question 6). |
| M7 | toolchain | major | accepted | Test script names `"src/**/*.test.ts"` in double quotes; `jasno dist` never emits tests. |
| M8 | toolchain | major | accepted | `"types"` first in every conditional export; release packs and type-checks the tarball. |
| M9 | toolchain | major | accepted | `typescript ~7.0.2`; version printed; `TS_VERSION_UNSUPPORTED`; `TYPE_RULES_UNAVAILABLE` warns and fails under `--strict`/`CI`; subprocess fallback. |
| M10 | toolchain | major | deferred | Base-path deployment: a later `base` option defaulting to `/` is additive (existing apps' `href()` output does not change), so no rename risk; it stays a non-goal for v1. |
| C-m1 | toolchain | minor | accepted | Syntax gate parses all stripped files in one process with `vm.SourceTextModule`. |
| C-m2 | toolchain | minor | accepted | Pinned `amaro` in dev, check and dist; version recorded in the manifest; `amaro` and `es-module-lexer` listed as dependencies. |
| C-m3 | toolchain | minor | accepted | Watch only served files, debounced; no live reload under `navigator.webdriver`. |
| C-m4 | toolchain | minor | accepted | `GET /__ff/ping` before reusing a recorded server; jasno and dependencies served under virtual prefixes resolved with Node's resolver (works in workspaces). |
| C-m5 | toolchain | minor | accepted | `.gitattributes` (`eol=lf`), case-sensitive serving, double-quoted globs, `/`-separated URLs from paths ((e), (f)). |

## Critic: scope

| ID | Source | Severity | Outcome | What changed / why not |
|---|---|---|---|---|
| S1 | scope | critical | accepted | RECIPES block in `jasno.d.ts` (visible to sandboxed agents) plus `docs/recipes/` in the package; AGENTS.md points to it and drops self-explaining rows (ADR-30). |
| S2 | scope | critical | accepted (SVG) / deferred (custom elements) | `svg(tag, attributes, ...children)` (ADR-28). `h.custom` is deferred: no usability or eval task used a web component, and `document.createElement` plus `onMount`/`effect` works. |
| S3 | scope | major | accepted | AGENTS.md components line: maybe-rendered or context-needing content is a function prop; `NO_PROVIDER` hint (B13.2). |
| S4 | scope | major | accepted | Required `notFound`; catch-all patterns rejected; unmatched links go to the browser (ADR-21, B17.4, B17.6). |
| S5 | scope | major | accepted | Redirect and guard semantics (B17.13); RECIPES guard and login wall. |
| S6 | scope | major | accepted | Example fixed; RECIPES mutations (capture params, `reload()`, optimistic `set()` before `await`); infinite scroll stays app code. |
| S7 | scope | major | accepted | `dialog.open` message; RECIPES dialog, popover, toast region. Anchor positioning below Safari 26 remains app code. |
| S8 | scope | major | accepted | `catchError` fallback and `RouterOptions.error`/`notFound` return `Rendered`. |
| S9 | scope | major | accepted | 15 message-typed stubs (ADR-32). |
| S10 | scope | major | accepted | `UNSTABLE_KEY`; `INTERACTIVE_NO_NAME` skips hidden inputs and counts submit/reset defaults. |
| S11 | scope | major | accepted | Dependency acquisition through ADR-35; workers declared unsupported (M6). |
| S12 | scope | major | accepted | Docs and diagnostics use npm scripts; the final name is open question 1 (ADR-36). |
| S13 | scope | minor | accepted | Title binding owned by the view; title-less routes leave `document.title` to the view (B17.10). |
| S14 | scope | minor | accepted | Search-param recipe; `ReadonlyURL` makes in-place mutation a type error. |
| S15 | scope | minor | accepted | RECIPES animation; `flush()` JSDoc names `startViewTransition`. Router `viewTransition` is deferred. |
| S16 | scope | minor | accepted (partly) | `onCleanup` removed. `createRoot` kept: a module-level resource needs an owner and `NO_OWNER` must keep catching effects created in handlers (ADR-09). |
| S17 | scope | minor | accepted | Removed `__JASNO__.componentOf` and `config`, `UNTRACKED_IN_SETUP`, `WRITE_AFTER_DISPOSE`, the `jasno explain` footer and `ResourceLoaderContext.previous`; the `jasno explain` command stays as offline sugar. |
| S18 | scope | minor | accepted | (a) `WritableSignal`/`Signal`; (b) `router.isLoading`; (c) stubs for `create*` guesses; (d) `match` vs `keyed` left to the eval (no change). |
| S19 | scope | minor | accepted (partly) | Tabs recipe and `:name(a\|b)` literal unions accepted; `beforeunload` note in RECIPES; `beforeLeave` guards and nested layouts deferred; sub-path deployment stays a non-goal (M10). |

---

# jasno design v3 changelog

Every finding on design v2, with its outcome: two usability runs built from AGENTS.md + jasno.d.ts only (kanban, chat), each with a semantic review (the kanban Enter-key bug was reproduced in Chromium), and a consistency check of v2. Fix order as in v2: type error > dev runtime throw with hint > diagnostic > `jasno check` rule > doc line. References point to the v3 `design.md`, `jasno.d.ts` (JSDoc, RECIPES block) and `AGENTS.md`.

**IDs.** Kanban: `U-K1..12` review semantic bugs, `U-KG1..12` tester doc gaps, `U-KA1..17` reviewer ambiguities, `U-KL1..4` actionable leaked-idiom notes. Chat: `U-CH1..10`, `U-CHG1..10`, `U-CHA1..13`, `U-CHL1..2`. Consistency check: `V2-01..V2-19`. Leaked-idiom notes that needed no action are not listed (kanban: none leaked, planted errors caught, import map correctly not written; chat: none leaked, a `noUncheckedIndexedAccess` fix in plain TypeScript, a ref reflex never written).

**Totals.** 99 rows: 22 usability semantic bugs (9 major, 13 minor), 19 consistency issues (5 major, 14 minor) and 58 tester doc gaps, reviewer ambiguities and leaked-idiom notes. Outcomes: 95 accepted (some partly), 4 rejected (harness limitations and one serving question outside the design), 0 deferred. Every major item is accepted. Parts rejected inside accepted items: keeping the value when a `reload()` fails and `resource.mutate()` (U-K2, U-K3), overlay routes and a per-navigation `scroll` option (U-K5), automatic cross-list focus (U-K8), an `any`-at-the-boundary check (U-K12), a measure-before-flush hook (U-CH4), `title: (data, params)` (U-CH5), a viewport check (U-CH9); deferred inside an accepted item: `DUPLICATE_ACCESSIBLE_NAME` (U-CH8). New API: `router.back(fallback)`. New checks: `KEY_ACTIVATES_NEW_FOCUS` (runtime, dev warn), `FOCUS_STYLE_REMOVED` (`jasno check` warn).

## Usability: semantic bugs

| ID | Source | Severity | Outcome | What changed / why not |
|---|---|---|---|---|
| U-K1 | kanban review | major | accepted | Enter saved and immediately reopened the editor in Chromium: jasno's microtask flush moved focus to the title button between `keydown` and `keypress`, and the keypress clicked it. RECIPES "Inline edit" saves through a form (implicit submission; Escape in `keydown`; blur saves behind an `editing()` guard), verified in Chromium and Firefox (appendix E7); RECIPES Focus: a keydown branch that moves focus calls `e.preventDefault()`; AGENTS.md top-mistakes row; new dev warning `KEY_ACTIVATES_NEW_FOCUS` in the handler wrapper (B15.7, ADR-33), which also fires in happy-dom tests (the reviewer's `KEY_REACTIVATED_FOCUS`, renamed to say what will happen). |
| U-K2 | kanban review | major | accepted (docs); API part rejected | "Rollback" was a refetch: the rejected value stayed visible during the reload, and a failing reload cleared the value and emptied the board. RECIPES "Optimistic saves": undo only your own change with `set()` on the current value, never roll back by reloading, time out the request; AGENTS.md async line ("undo a failed optimistic `set()` with `set()`, never `reload()`"); `Resource.set`/`reload`/`ResourceStatus` JSDoc; B9.6 states that a failed reload drops the value; ADR-15. Keeping the value on a failed reload (SWR/TanStack) is rejected for Angular parity and because the recipe no longer depends on it; open question 13 records it. |
| U-K3 | kanban review | major | accepted (docs) | A reload in `finally` overwrote another save's optimistic value. The recipe reloads only when no other save is in flight (a counter); the `reload` JSDoc says its result replaces optimistic values of saves still in flight. `resource.mutate()` is rejected (a mutation cache is the deferred `query` module's job, ADR-22). |
| U-K4 | kanban review | major | accepted | "Closing navigates back" pushed a new entry, so Back reopened the dialog. New `router.back(fallback)`: traverses back when the previous entry is this app's, else `navigate(fallback, { replace: true })` (B17.18, ADR-21 (12)); RECIPES dialog and Router lines; AGENTS.md routing line. |
| U-K5 | kanban review | major | accepted (docs); API part rejected | The card route rebuilt the whole board: scroll reset, focus went to the new `h1` instead of the Open link. RECIPES "Detail over a list": keep the detail on the list's route as a search param (search-only navigations keep the list, its scroll and focus, B17.7), the dialog opens in `onMount` and closes itself in the cleanup so focus returns to its opener, `onclose` calls `router.back()`; verified dialog facts in E7. Overlay routes (`over`) and `navigate(url, { scroll })` are rejected (ADR-21). |
| U-K6 | kanban review | major | accepted | `all: unset` removed the focus ring from the button the code keeps focusing. Reverses U-D7's rejection: jasno's recipes move focus programmatically, so the docs owe the indicator rule. RECIPES Focus line; `jasno check` warning `FOCUS_STYLE_REMOVED` for a `css` sheet that removes the outline without a `:focus-visible` rule ((c), (e), ADR-33). |
| U-K7 | kanban review | minor | accepted | A Retry button inside `show(status === 'error')` removed itself on click. RECIPES Focus: focus the status line first (as the example's views already do); `FOCUS_LOST` hint names it. |
| U-K8 | kanban review | minor | accepted (docs) | The hand-rolled refocus handshake missed rows that vanish (filter, failed move). RECIPES Focus: a row that moves to another list focuses its new copy in `onMount` (same flush, so no `FOCUS_LOST`; B20.2 says so); when it may vanish, focus something that stays first. Automatic focus of "the same" element in another list's new row is rejected (cross-list identity is app-specific; `FOCUS_LOST` reports misses). |
| U-K9 | kanban review | minor | accepted | Blur silently discarded the typed title. The inline-edit recipe saves on blur, guarded so Chromium's blur on removal after Enter/Escape does not save twice (E7). |
| U-K10 | kanban review | minor | accepted | Enter during IME composition could save half-composed text. The recipe's implicit submission skips composition; the textarea Enter-to-send line checks `isComposing` and Safari's `keyCode === 229`. |
| U-K11 | kanban review | minor | accepted | The card view's title effect had no cleanup, and title-less routes never reset the title. B17.10: a route without a title, `notFound` and the error view restore the document's initial title, so no view needs a cleanup (ADR-21 (8)); RECIPES per-record title and persistence lines. |
| U-K12 | kanban review | minor | accepted (docs) | `res.json()` (typed `any`) passed unvalidated; the PATCH had no timeout. RECIPES "Config and backend": api.ts validates `res.json()`; the optimistic recipe passes `AbortSignal.timeout()`. Rejected: an `ANY_AT_BOUNDARY` check (an `as` cast silences it without validating) and a global `Body.json(): Promise<unknown>` override in jasno.d.ts (it would retype lib.dom for all code). |
| U-CH1 | chat review | major | accepted | Presence worked only because the mock emitted asynchronously; a source that emits on subscribe triggers `EFFECT_WRITES_STATE` inside `effect(() => subscribe(...))`. Resolved by stating the rule, not weakening the check: a callback that fires during the run is tracked by the effect, so subscriptions whose callback sets signals go in `onMount`, per route param inside a `match` body (ADR-12 and ADR-24 v3 notes, B5.3); RECIPES "Per-param lifecycle"; the hint, `effect`/`onMount`/`ViewProps` JSDoc and AGENTS.md (reactive rule, routing line) say it. Exempting `untracked()` writes and a `fromSource()` primitive are rejected (ADR-12). |
| U-CH2 | chat review | major | accepted (docs) | "Read" was tied to row mounting (N writes per render, off-screen rows counted). The per-param recipe records enter/leave in `onMount` inside the `match` body; RECIPES state line: `onMount` writes are fine anywhere, one per body rather than one per row. Mixing client and server clocks is app logic. |
| U-CH3 | chat review | major | accepted | No backend and no dev mock, so no main flow could run under `jasno dev`. RECIPES "No backend yet": `#api` conditional import (`development` → `api.mock.ts`), the mock typed as `typeof Api.x`; the example now does exactly this (`example/src/api.mock.ts`, `package.json` `"imports"`; resolution verified in tsc and Node, E11); `jasno dist` does not publish development-only targets ((e)). |
| U-CH4 | chat review | minor | accepted (docs) | Stick-to-bottom tracked from scroll events raced with pushes. RECIPES chat/log: measure where rows are added, before the write, then `flush()` and scroll; `effect` JSDoc: effects see rows built in the same flush. A measure-before-flush hook is rejected (the handler is the place). |
| U-CH5 | chat review | minor | accepted | Title effect without cleanup. As U-K11; `title: (data, params) => string` rejected (ADR-21). |
| U-CH6 | chat review | minor | accepted (docs) | Optimistic send changed the row key (tmp id → server id), could duplicate on retry, had no timeout. RECIPES Mutations: client-generated id sent as the idempotency key keeps the key and row and makes retries safe; timeout in the recipe; chat/log merge deduplicates by id. |
| U-CH7 | chat review | minor | accepted (docs) | Unvalidated `res.json()`. As U-K12. |
| U-CH8 | chat review | minor | accepted (partly) | Accessibility gaps. RECIPES chat/log uses `role: 'log'`; Enter-to-send handles Safari's IME commit (`keyCode === 229`); row-specific names were already in RECIPES. `DUPLICATE_ACCESSIBLE_NAME` stays deferred (as U-T7: heuristic, needs eval data); the `#` in the heading and the silent status text are app content. |
| U-CH9 | chat review | minor | accepted | AGENTS.md's `index.html` lacked the viewport meta the agent copied verbatim; it now has `<meta name="viewport" content="width=device-width">`. An `INDEX_HTML_NO_VIEWPORT` check is rejected (the snippet is what agents copy). |
| U-CH10 | chat review | minor | accepted (docs) | Switching rooms discarded unsent drafts. RECIPES per-param: state that must survive a switch lives in a parent Map signal keyed by the param; `match` bodies and linkedSignal discard theirs. |

## Usability: tester doc gaps, reviewer ambiguities, leaked-idiom notes

| ID | Source | Severity | Outcome | What changed / why not |
|---|---|---|---|---|
| U-KG1 | kanban tester | gap | accepted | Overlay routes: as U-K5. |
| U-KG2 | kanban tester | gap | accepted | No `router.back()`: as U-K4. |
| U-KG3 | kanban tester | gap | accepted | What an open modal dialog does when its view is disposed: RECIPES dialog says removing an open dialog fires no `close` event and drops focus (verified in Chromium and Firefox, E7), so a dialog in a branch closes itself in its cleanup, and `onclose` checks the URL because `close` still fires after that. |
| U-KG4 | kanban tester | gap | accepted | Optimistic rollback: as U-K2. |
| U-KG5 | kanban tester | gap | accepted | `RESOURCE_SET_WHILE_LOADING` unexplained: `Resource.set` JSDoc (warns only in `loading`, never in `reloading`) and the (c) hint. |
| U-KG6 | kanban tester | gap | accepted | Mutating an app-wide `createRoot` resource from plain async functions: RECIPES Mutations shows `cards` in `src/state.ts` changed by functions there; `createRoot` JSDoc. |
| U-KG7 | kanban tester | gap | accepted | Focus when a row moves between lists: as U-K8. |
| U-KG8 | kanban tester | gap | accepted | "Static h1" imprecise; router focus vs `onMount` order: V2-06 wording; B17.5 states flush (the view's `onMount`) before focus; RECIPES routes line (an `[autofocus]` in a dialog opened in `onMount` counts). |
| U-KG9 | kanban tester | gap | accepted (docs) | Removing a search param, keeping it on links: RECIPES Router (`navigate(router.url().pathname, { replace: true })`; `router.href(...) + router.url().search`). A search argument for `href()` is rejected (one expression). |
| U-KG10 | kanban tester | gap | accepted | `untracked()` seed vs linkedSignal draft: RECIPES Forms "Drafts" line and the inline-edit recipe. |
| U-KG11 | kanban tester | gap | accepted | Props-less route views: `RouteOptions` JSDoc says a component without props works (it always did). |
| U-KG12 | kanban tester | gap | accepted | Title cleanup for title-less views: as U-K11. |
| U-KA1 | kanban review | ambiguity | accepted | Overlay/background routes: as U-K5 (the list keeps its own `h1`, so `VIEW_NO_HEADING` does not arise). |
| U-KA2 | kanban review | ambiguity | accepted | Closing back: as U-K4. |
| U-KA3 | kanban review | ambiguity | accepted | Dialog removal and focus: as U-KG3. |
| U-KA4 | kanban review | ambiguity | accepted | Push navigations scroll to the top: as U-K5 (the search-param detail keeps scroll; a `scroll` option is rejected). |
| U-KA5 | kanban review | ambiguity | accepted | Whether `set()` may restore after an await; failed reload drops the value: as U-K2. |
| U-KA6 | kanban review | ambiguity | accepted | `RESOURCE_SET_WHILE_LOADING` scope: as U-KG5. |
| U-KA7 | kanban review | ambiguity | accepted | Module-level `createRoot` resources and tests (not reset by B19.5; a lazy import during a test would have made the root an `EFFECT_LEAKED` false positive): detached roots are app-lifetime, never reported and not reset (B6.7, B19.4, B19.5, ADR-27); `createRoot`/`mountTest` JSDoc and RECIPES: `reload()` after stubbing `fetch`. |
| U-KA8 | kanban review | ambiguity | accepted | Whether a same-flush focus in the new row counts as restored: yes; B20.2 names the case; as U-K8. |
| U-KA9 | kanban review | ambiguity | accepted | Keydown plus focus move: as U-K1. |
| U-KA10 | kanban review | ambiguity | accepted | Router focus vs view `onMount`, wrong B17.5 cross-references: as U-KG8 and V2-07. |
| U-KA11 | kanban review | ambiguity | accepted | Announcement when a title-less route focuses a non-heading `[autofocus]`: B17.9 uses the view's first `h1` text, else announces nothing (the focused element speaks for itself); double announcement stays open question 7. |
| U-KA12 | kanban review | ambiguity | accepted | What counts as the view's `h1`: as V2-06 (B17.8: the first `h1` in the view's DOM, child components included). |
| U-KA13 | kanban review | ambiguity | accepted | Removing params, `href()` search, and whether `url` updates before the next keystroke: B17.7 now updates `url` synchronously for search-only `navigate()` calls (ADR-21 (10); the `url` JSDoc and RECIPES say so); the rest as U-KG9. |
| U-KA14 | kanban review | ambiguity | accepted | Seeding a one-shot input: as U-KG10. |
| U-KA15 | kanban review | ambiguity | accepted | Views without props: as U-KG11. |
| U-KA16 | kanban review | ambiguity | accepted | `document.title` cleanup: as U-K11. |
| U-KA17 | kanban review | ambiguity | accepted | Missing `tsconfig.test.json` in a project without tests; which packages `npm run check` needs: (e) `jasno check` needs no test program until test or e2e files exist (`TSCONFIG_DRIFT` then); it resolves the local `jasno` and `typescript` from the (f) template. |
| U-KL1 | kanban tester | idiom | accepted | React Router "modal route" habit: RECIPES "Detail over a list" gives the jasno form (as U-K5). |
| U-KL2 | kanban tester | idiom | accepted | `history.back()` dropped because AGENTS.md forbids `history`: `router.back()` (as U-K4). |
| U-KL3 | kanban tester | idiom | accepted | React-Query-style `onError` snapshot restore dropped because of "reload, not set": the habit was right; the rule is narrowed (as U-K2). |
| U-KL4 | kanban tester | idiom | accepted | Unsure whether `autofocus` works on inserted nodes: it does not once the document has focus (the HTML autofocus rules), so v2's "(or autofocus: true)" was wrong; RECIPES Focus now says `autofocus` works only in a dialog opened with `showModal()` and in a routed view (the router focuses it). |
| U-CHG1 | chat tester | gap | rejected | Serving without the CLI / the shape of the injected map: the CLI is the supported server (it strips types and generates the map; design (e) lists the map's contents), and AGENTS.md says `jasno dev` strips types. |
| U-CHG2 | chat tester | gap | accepted | Writes when a param changes on a kept-mounted view: as U-CH2. |
| U-CHG3 | chat tester | gap | accepted | Subscriptions in effects: as U-CH1. |
| U-CHG4 | chat tester | gap | accepted | Whether effects see rows inserted in the same flush: as U-CH4 (`effect` JSDoc). |
| U-CHG5 | chat tester | gap | accepted | "Static" h1 with live text: as V2-06. |
| U-CHG6 | chat tester | gap | accepted | Index route or redirect: RECIPES Router "Redirect (a guard, an index route)": a loader that navigates with `replace` and returns `null`; its view never renders. |
| U-CHG7 | chat tester | gap | accepted | `DUPLICATE_KEY` severity, merging sources: `each()` JSDoc (warns `DUPLICATE_KEY`; deduplicate merged sources by id) and RECIPES chat/log. |
| U-CHG8 | chat tester | gap | rejected | Package name and install step: installing jasno is outside the usability harness (jasno.d.ts stands in for the package); real projects are scaffolded from the (f) template, so AGENTS.md does not spend bytes on dependencies. |
| U-CHG9 | chat tester | gap | rejected | No `@types/node` or jasno runtime for tests: a harness limitation (`tsconfig.app-test.json` resolves `@types/node` from `design/v3/node_modules`; there is no runtime to test against). |
| U-CHG10 | chat tester | gap | accepted | A computed as resource `params` or linkedSignal `source`: JSDoc says any `Read` works (a signal, a computed, `() => x`). |
| U-CHA1 | chat review | ambiguity | accepted | Per-param lifecycle: as U-CH1, U-CH2. |
| U-CHA2 | chat review | ambiguity | accepted | Effects that register callbacks: as U-CH1. |
| U-CHA3 | chat review | ambiguity | accepted | "Static" h1: as V2-06. |
| U-CHA4 | chat review | ambiguity | accepted | Same-flush rows in effects: as U-CH4. |
| U-CHA5 | chat review | ambiguity | accepted | Index route or redirect: as U-CHG6. |
| U-CHA6 | chat review | ambiguity | accepted | `DUPLICATE_KEY`: as U-CHG7. |
| U-CHA7 | chat review | ambiguity | accepted | Signals and computeds as params/source: as U-CHG10. |
| U-CHA8 | chat review | ambiguity | accepted | Where `onMount` writes are sanctioned: as U-CH2 (RECIPES state line). |
| U-CHA9 | chat review | ambiguity | accepted | Project setup (viewport, map, dependencies): as U-CH9; the map and dependencies as U-CHG1, U-CHG8. |
| U-CHA10 | chat review | ambiguity | accepted | Dev mock backend: as U-CH3. |
| U-CHA11 | chat review | ambiguity | accepted | Where JSON is validated: as U-K12. |
| U-CHA12 | chat review | ambiguity | accepted | Stick-to-bottom recipe: as U-CH4. |
| U-CHA13 | chat review | ambiguity | rejected | The harness task asked for an import map while AGENTS.md forbids one: AGENTS.md is right and the agent followed it; the conflict is in the task text, not jasno. |
| U-CHL1 | chat tester | idiom | accepted | `useEffect`-with-deps habit for "mark read on room change": the per-param recipe (as U-CH2). |
| U-CHL2 | chat tester | idiom | accepted | `res.json()` returned as `any`: as U-K12. |

## Consistency check of v2

| ID | Source | Severity | Outcome | What changed / why not |
|---|---|---|---|---|
| V2-01 | consistency | major | accepted | `h.header(nav)` (a type error) replaced by `h.header(null, nav)` in AGENTS.md, RECIPES and design (f); `v3-snippets/neg-v3.ts` keeps the old form as an expected TS2345. |
| V2-02 | consistency | major | accepted | `not-found.ts` sets the title in `onMount` (the effect read no signal: `EFFECT_NO_DEPS`). |
| V2-03 | consistency | major | accepted | Toast rows (example and RECIPES) route the dismiss button and the timer through one `close()` that first hands focus to a neighbour's button, else to the region (`tabIndex: -1`). |
| V2-04 | consistency | major | accepted | "Show more" focuses the first revealed link (`flush()` in the handler, then `focus()`), so removing the button on the last page never drops focus; `user-list.test.ts` asserts the focus on both clicks. |
| V2-05 | consistency | major | accepted (differently) | Fixed at the root with V2-19: the scaffolded Playwright config has one top-level `webServer` chosen by `JASNO_E2E` and no projects, so AGENTS.md's `npx playwright test` is correct as written; design (f), (g) and the CI line use `JASNO_E2E=preview` for the artifact rung. |
| V2-06 | consistency | minor | accepted | "Every view has an `h.h1`" (AGENTS.md) and "renders an `h.h1` outside show/match (its text may be live)" (RECIPES, (f), `VIEW_NO_HEADING` hint), matching B17.8, which now says "the first `h1` in the view's DOM". `user.ts` already complies. |
| V2-07 | consistency | minor | accepted | B17.5 cross-references fixed (focus B17.8, announcement B17.9, title B17.10) and the title binding is created before the view is built, as B17.10 says. |
| V2-08 | consistency | minor | accepted | Top-mistakes row uses `h.a({ title: t() })` (element props accept the snapshot); the component-prop form stays a type error in `neg-v3.ts`. |
| V2-09 | consistency | minor | accepted | RECIPES: "Patterns with the same params may share one view module; otherwise one view per route, sharing a component." |
| V2-10 | consistency | minor | accepted | RECIPES Redirect line: on a data route the view takes `ViewProps<P, User \| null>` (compiled in `tools/agents-samples/views/guarded.ts`), or use the login wall. |
| V2-11 | consistency | minor | accepted | Tabs recipe passes `{ view: () => import('./views/settings.ts') }`. |
| V2-12 | consistency | minor | accepted (correction) | U-C3's "or merge using `previous.source`" is not in RECIPES; the merge form is equivalent to keying the draft by the record id, so the claim is corrected here instead of adding a redundant recipe (RECIPES Forms "Drafts" states the id-keyed form). |
| V2-13 | consistency | minor | accepted | ADR-30 now says the package ships `docs/recipes/*.md` with the same text as the RECIPES block, which AGENTS.md points to (no index line: no bytes). |
| V2-14 | consistency | minor | accepted | `NO_OWNER` hint adds "signal() and computed() need no owner." Correction to U-C2: the focus rule is in RECIPES and B17.8; AGENTS.md says only that the `h1` is focused after navigation. |
| V2-15 | consistency | minor | accepted | `jasno/testing/happy-dom` JSDoc command includes `--test-isolation=none`. |
| V2-16 | consistency | minor | accepted | `VIEW_IMPORT_FAILED` hint uses `npm run dist -- --keep 2` (ADR-36). |
| V2-17 | consistency | minor | accepted | Appendix E1 says the most specific line of a chained error is quoted; the `gen-elements.cjs` header says `aria-*` typos are TS2353 without "Did you mean". The generator still reproduces the element region byte for byte (E8). |
| V2-18 | consistency | minor | accepted | RECIPES Router "Route tests" line; design (g): tests are the only code that touches `history` (`USE_ROUTER` checks browser files only). |
| V2-19 | consistency | minor | accepted | (1) Playwright's `webServer` is top-level, so per-project servers could not work: one server chosen by `JASNO_E2E` (template in (f)); (2) `jasno dist` step 2 names `dist/jasno/<file>.<hash>.js` for jasno's own files. |

**AGENTS.md budget moves.** To fit the new rules within 8,192 bytes (now 8,166), v3 removed from AGENTS.md lines whose mistake tsc or a runtime check already reports with the fix: array mutation (type error naming `readonly`), `${}` in `css` (type error), `import type` (TS1484), route order (`ROUTE_SHADOWED` throws with the hint), `navigate()` result values (JSDoc), "callbacks are plain functions" (the example shows it), "late writes are harmless" (kept in RECIPES; it answered U-C11), the `svg` icon hint (the `svg` JSDoc and RECIPES; `innerHTML` is message-typed) and the setup-listener table row (the rule stays in "Context, cleanup, state"; `LEAK_IN_SETUP` reports it).

## Runtime prototype conformance review (2026-09-26)

Seven agents wrote conformance tests for the M1 runtime prototype (`../jasno`), one per area (core, ownership, resource, lists, elements, dev/testing, recipes): 538 tests, kept in `../jasno/test/spec/`. 71 findings; the runtime bugs among them are fixed in the prototype (not listed). The spec and doc outcomes, decided with the owner:

| ID | Source | Severity | Outcome | What changed / why not |
|---|---|---|---|---|
| RP-01 | ownership probe | ambiguity | accepted | B8.1 holds while the computed has observers; without observers B1.3 wins (recompute, no links), so a pure computation throws an equal error, not the same object. |
| RP-02 | lists probe | ambiguity | accepted | New B21.4: a write re-reads the selector source at once (a derivation the write pulls; B3.2 is about consumers), keeping `isSelected()` and computations over it read-your-writes; source errors are routed in the next flush. Lazy evaluation was rejected: computeds over `isSelected()` would read stale until the flush (model C, ADR-10). The Terms list the selector source as a derivation. |
| RP-03 | ownership, devtest, recipes probes | ambiguity | accepted | B8.5 and B20.3: a `catchError` swap (either direction) focuses the first focusable element of the new content, else its first element (given `tabindex="-1"`, as the router in B17.8); text-only content reports `FOCUS_LOST` with a wrap hint. "Never report" is now "do not report when they restored focus". |
| RP-04 | core probe | ambiguity | accepted | B5.4: `WRITE_IN_SETUP` also inside `untracked()` (it exempts reads, not writes; ADR-12 rejected it as a mute). |
| RP-05 | elements probe | ambiguity | accepted | B15.5: a live update to `undefined` removes a reflected attribute the element did not have at creation (no `href=""`, as ADR-02 intended); `value`/`checked`/`selectedIndex` get their creation value back. |
| RP-06 | elements, recipes probes | bug + ambiguity | accepted | B15.8: `UNKNOWN_PROP` checks jasno's closed prop table generated from `jasno.elements.d.ts` (the DOM-membership check missed `className`, `textContent` and misspelled `aria-*`, and fired on the typed `autofocus` in happy-dom); typed props the engine does not expose are set as attributes; `onClick`-style keys whose lowercase handler exists are reported. |
| RP-07 | elements probe | ambiguity | accepted | B6.11 and the catalogue: `mount()` inside a derivation throws `OWNED_IN_DERIVATION` (its root is an owner). |
| RP-08 | ownership probe | bug | accepted | B6.2: an owner created under a disposed or disposing owner is disposed at once (effects created after `stop()` in the same run, or in `onMount` after its owner was disposed, ran forever). |
| RP-09 | core probe | ambiguity | accepted | B4.10: after the microtask guard trips, the queue is cleared and dropped consumers are re-armed, as in B4.6 (the app stalled). |
| RP-10 | core probe | ambiguity | accepted | B5.3 and the catalogue: `EFFECT_WRITES_STATE` dedupes per (effect, signal) whatever the call site; `FOCUS_LOST` (no call site) per element, action, owner path and cause. |
| RP-11 | resource probe | bug + ambiguity | accepted | B9.4: idle and throwing params forget the request, so the same params later start as `loading` (the old value flashed until the flush). |
| RP-12 | lists probe | ambiguity | accepted | B10.6 covers `each` rows (B8.9 calls them builders). |
| RP-13 | elements probe | bug + ambiguity | accepted | B14.1: a component called in an effect run is setup (B5.4), so writes to its own signals are silent and foreign writes are `WRITE_IN_SETUP`, not `EFFECT_WRITES_STATE`. |
| RP-14 | devtest probe | ambiguity | accepted | B19.2: owners inside a module-level root are tagged `<module root>` even when created during the test. |
| RP-15 | devtest probe | ambiguity | accepted | B19.5: module-level linkedSignals are reset too. |
| RP-16 | resource, devtest, recipes probes | ambiguity | accepted | B19.6: a loader jasno aborted (superseded, `set()`, disposed) is no longer pending; a never-settling stub loader from one test made every later `settled()` time out. |
| RP-17 | elements, recipes probes | doc | accepted | (g) Keys: dispatch `keydown` with `cancelable: true` and await a microtask before simulating the default action (the documented form reported correct handlers and ran the check too early). |
| RP-18 | recipes probe | doc | accepted | (g) Dialogs: `jasno/testing/happy-dom` adds the dialog focusing steps happy-dom 20.14.5 lacks (showModal focuses `[autofocus]`, close returns focus), which the RECIPES dialog patterns need. |
| RP-19 | example run | doc | accepted | (g) Events: focus a field before typing into it; `user-list.test.ts` typed with focus left on a row the filter removed and correctly got `FOCUS_LOST`. |
