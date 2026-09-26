
# Testing, debugging and diagnostics for a no-build TS SPA framework aimed at AI agents (research as of 2026-09-25)

All versions below were checked against npm or the official docs on 2026-09-25. I measured the numbers myself on the sandbox machine: 2 vCPU, Node v25.1.0, Playwright 1.63.0 with chromium-headless-shell r1243 (Chrome 153). Prototype code lives in `/tmp/claude-1000/-home-and-ff/96b9f726-1e37-4313-9d48-852096c2ca84/scratchpad/proto/` (fw.ts, serve.ts, e2e.ts, fw.test.ts, agent-reporter.ts) and `.../scratchpad/domtest/counter.test.ts`.

## 1. Unit and component tests in Node without a bundler

### Node type stripping (verified)
- Status: **Stable since v25.2.0 and v24.12.0**. Node **v26.0.0 removed `--experimental-transform-types`**. Enums, namespaces with runtime code, parameter properties and import aliases throw `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.
- Node ignores `tsconfig.json`, so `paths` do nothing. Imports must include the `.ts` extension.
- **Node refuses to strip `.ts` files under `node_modules`.** So the framework package itself must publish `.js` plus `.d.ts`. Only the *application* can stay as raw `.ts`.
- Release lines: v26 is Current (released 2026-05-05) and enters LTS after its six-month Current phase. v24 and v22 are LTS. **v25 has been EOL since 2026-03-31**, and that includes the Node installed here. Target Node **>=24.12 or 26**.
- `module.stripTypeScriptTypes(code, {mode:'strip', sourceUrl})` is at Stability 1.2 (release candidate). v26 removed its `transform` and `sourceMap` options. On v25.1 it still prints an ExperimentalWarning. Stripping replaces types with whitespace, so **line:column positions are preserved**. In my browser prototype a thrown error's stack said `/fw.ts:48:55`, and line 48 of the source file was exactly the `throw`. No source maps are needed. Cost is about 3.6 ms per call for a 50-line file, measured over 100 runs.

### node:test features that matter (from the v26.10 docs and `node --help` on 25.1)
- Snapshots are stable since v23.4: `t.assert.snapshot`, `t.assert.fileSnapshot`, `snapshot.setDefaultSnapshotSerializers`, `--test-update-snapshots`.
- MockTimers cover `setTimeout`, `setInterval`, `setImmediate` and `Date`, all on one clock.
- Other useful features:
  - `--test-isolation=process|none`
  - `--test-rerun-failures <file>`
  - `--test-global-setup`
  - `--test-shard`
  - custom reporters written as async generators
- `mock.module` still needs `--experimental-test-module-mocks` on 25.1.
- There is no built-in JSON reporter. Writing one is trivial (see §6).

### DOM emulators (npm, 2026-09-25)

| lib | version | notes |
|---|---|---|
| happy-dom | 20.14.5 | Since v20.0.0 JS evaluation is **disabled by default** (the CVE-2025-61927 VM-escape fix). Installs 19 MB. |
| jsdom | 30.1.1 (30.0.0 on 2026-07-27) | engines: `^22.22.2 \|\| ^24.15.0 \|\| >=26`. Installs 8.7 MB. |
| linkedom | 0.18.13 | Installs 2.7 MB. **Breaks `@testing-library/dom` role queries**: `window.getComputedStyle is not a function`, plus a `computeTextAlternative` crash. |

All three ran unmodified under `node --test` with TS test files and a TS signal library.

Measured on the same TS component, with `@testing-library/dom` 10.4.2:

| | happy-dom | jsdom | linkedom |
|---|---|---|---|
| import of env setup | ~1.0 s | ~2.1-2.4 s | ~0.5 s |
| first `getByRole` test (cold) | 39 ms | 562 ms | fails |
| `getAllByRole('listitem')` on 1000 rows | 592 ms | 2038 ms | fails |
| warm: 1000 rows + 10 full re-renders | 465 ms/iter | 333 ms/iter | 131 ms/iter |

Test isolation dominates run time. With 8 small test files under happy-dom:
- default process isolation: **13.2 s**
- `--test-isolation=none`: **1.8 s** (jsdom: 3.3 s)

Process isolation re-imports the DOM library for every file. A run with `node --import ./setup-happy.ts --test --test-isolation=none` plus `t.assert.snapshot(document.body.innerHTML)` produced readable `.snapshot` files.

### Real browser vs emulation (measured)
Playwright plus headless Chromium, from Node:
- Launch plus first page: **415 ms**. That is faster than importing jsdom.
- `getByRole('listitem').count()` on 1000 rows: **111 ms**, against 592 ms (happy-dom) and 2038 ms (jsdom).
- Component tests through my 30-line type-erasing server:
  - **60 ms/test** when one page is reused and the DOM is reset between tests
  - **389 ms/test** with a fresh browser context per test (every context re-fetches and re-erases the modules)
- For comparison, happy-dom took 39-70 ms per test.

So the "a browser is too slow for unit tests" assumption does not hold for component tests on this hardware. What emulation still wins on is zero infrastructure: no browser binary, no server.

## 2. Browser test runners

- **Playwright 1.63.0** (2026-09-25). Features relevant here:

  | version | feature |
  |---|---|
  | 1.56 | Test agents (planner, generator, healer) via `npx playwright init-agents`. `page.consoleMessages()`, `page.pageErrors()`, `page.requests()` (each keeps up to 200 entries). |
  | 1.59 | `page.ariaSnapshot()`, `browser.bind()` for CLI/MCP clients, `npx playwright test --debug=cli`, `npx playwright trace` for agents exploring failures, screencast API. |
  | 1.60 | `mode:'ai'` and `boxes` options for ARIA snapshots. |
  | 1.62 | Component testing overhauled (still a Vite-based mount). |
  | 1.63 | `ariaSnapshotJSON()`, ARIA snapshots inside traces. |

  Also available: `page.clock` controls Date, timers, rAF, rIC and `performance`. `addInitScript` runs code before the page's own scripts.
  - Playwright component testing (`@playwright/experimental-ct-*`) uses Vite, so it is excluded. Plain Playwright Test driving a no-build dev server works.
- **Vitest 5.0.2** (5.0.0 released 2026-09-03). Browser mode went stable in 4.0 (2025-10-22). Providers ship separately (`@vitest/browser-playwright` etc.). It has locators, ARIA snapshots, `toMatchScreenshot` and Playwright traces. **It hard-depends on `vite` (^6.4 || ^7 || ^8)**, and the docs say "Vitest uses Vite dev server to run your tests". Every module goes through Vite's transform pipeline, which breaks the "the repo module is the module the browser runs" rule. It is usable but off-philosophy.
- **@web/test-runner 1.0.0** (2026-07-07; the only change was dropping Node 18/20). The previous release was 0.20.2 in May 2025, so the release cadence is slow. It runs a dev server with esbuild/rollup plugins, launches browsers through Puppeteer, Playwright, Selenium or WebdriverIO, uses mocha, and can mock modules through import maps. TypeScript goes through the esbuild plugin, which is per-file and therefore acceptable. It is a heavier dependency tree than needed.
- **Deno test**:
  - Native TS, and it **type-checks local modules by default**.
  - Reporters: pretty, dot, junit, tap. Coverage and `--doc` are built in.
  - Sanitizers (`--sanitize-ops`, `--sanitize-resources`) catch leaked async operations and unclosed resources. This is a direct precedent for "leaked effect" detection.
  - DOM testing goes through `npm:` DOM emulators.
  - It is a viable second runtime, but Node is where the ecosystem is.

### A no-build dev and test server is small
My prototype `serve.ts` is about 30 lines: `node:http`, then `readFile`, then `stripTypeScriptTypes` for `.ts`, served as `text/javascript`. One real failure is worth recording. A single parameter property made the import fail silently: the page never rendered and the only symptom was a Playwright 30 s timeout. The fix was to answer with a JS module that throws `SyntaxError("<url>: ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: ...")`, so the error reaches the browser console and `pageerror`.

For the same reason, TypeScript 7.0 matters (GA 2026-07-08, native Go port, 8-12x faster, binary still `tsc`, no stable programmatic API until 7.1). With `erasableSyntaxOnly` it reports `TS1294` on enums and parameter properties *before* runtime. My whole prototype type-checks in **1.4 s** with this config:

```json
{"compilerOptions":{"target":"esnext","module":"nodenext","moduleResolution":"nodenext","noEmit":true,
 "allowImportingTsExtensions":true,"erasableSyntaxOnly":true,"verbatimModuleSyntax":true,"strict":true,
 "lib":["esnext","dom","dom.iterable"],"types":["node"]}}
```

### Specifier parity between Node and browser (verified)
`import ... from '#fw'` resolves in both environments:
- **Node**: through the package.json `"imports"` field.
- **Chromium**: through an import-map key `"#fw"`.

Conditions work as expected: with `"imports":{"#fw":{"development":"./dev.js","default":"./prod.js"}}`, plain `node` loads prod and `node --conditions=development` (or setting that in `NODE_OPTIONS`) loads dev. A bare `'fw'` that exists only in the import map fails in Node with `ERR_MODULE_NOT_FOUND`, so the framework must document one scheme that works in both.

## 3. How agents verify UI in 2026

- **Playwright MCP** (`@playwright/mcp` 0.0.82):
  - Works from accessibility snapshots rather than pixels; elements are addressed by refs.
  - Tools include `browser_snapshot`, `browser_console_messages` (level filter, `filename` to save to a file), `browser_evaluate` and `browser_network_requests`.
  - Useful flags: `--init-script` (runs before page scripts), `--console-level`, `--snapshot-mode full|none`, `--snapshot-boxes`, `--caps vision,pdf,devtools,testing`.
  - The README itself recommends **Playwright CLI plus skills** for coding agents: "CLI invocations are more token-efficient: they avoid loading large tool schemas and verbose accessibility trees". The CLI writes snapshots to `.playwright-cli/page-<ts>.yml` files and addresses elements by ref.
- **Chrome DevTools MCP** (`chrome-devtools-mcp` 1.10.1):
  - `take_snapshot` returns the a11y tree with uids.
  - Also: `evaluate_script`, `list_console_messages` (optionally with stack traces), `wait_for`, performance traces with insights, a Lighthouse audit, **14 heap-snapshot tools** (retainers, dominators, compare snapshots, which is how you find leaked effects), and a CLI mode.
  - **New: third-party developer tools** (Chrome blog, 2026-06-18; experimental; needs `--categoryExperimentalThirdParty=true`; available since v0.25.0):
    - The page listens for a `devtoolstooldiscovery` event on `window` and calls `event.respondWith({name, description, tools:[{name, description, inputSchema, execute}]})`.
    - Agents discover the tools with `list_3p_developer_tools` and call them with `execute_3p_developer_tool`, or through `window.__dtmcp.executeTool()` inside `evaluate_script`.
    - DOM nodes a tool returns are mapped to the same uids as `take_snapshot`.
    - **Angular already ships a Signal Graph tool and a DI Graph tool this way; React is experimenting.**
- **WebMCP** (`document.modelContext`; origin trial in Chrome 149-156, blog 2026-06-09) lets the *application* declare tools to agents. Its stated use cases include a diagnostics tool on a developer settings page. It is aimed mostly at end-user agents, so it is not needed for v1 debugging.
- **ARIA snapshot output**, real output from my prototype:
  - `mode:'ai'` adds refs and state: `- button "Increment" [active] [ref=e5]`.
  - Default mode: `- region "Counter":` / `- status: "Count: 2 (x2 = 4)"`.
  - Cost: a 1000-row list came to **32.8k characters (~8.2k tokens)**. Snapshots need `depth` limits and scoping to a locator.
- The Claude Code best-practices page says to "give Claude a check it can run: tests, a build, a screenshot…", that the context window "fills up fast, and performance degrades as it fills", and that "CLI tools are the most context-efficient way" to interact with things. Diagnostics should therefore be **terse by default, expandable on demand, and written to files when large**.

## 4. Precedents for machine-readable errors

- **React**:
  - `scripts/error-codes/codes.json` holds 598 codes.
  - The prod formatter produces `Minified React error #185; visit https://react.dev/errors/185?args[]=… for the full message…`. The decoder page reconstructs the message from the args.
  - Loop guard: `NESTED_UPDATE_LIMIT = 50` ("Maximum update depth exceeded").
  - `captureOwnerStack()` is dev-only and returns null in prod.
  - `__REACT_DEVTOOLS_GLOBAL_HOOK__`: a renderer calls `hook.inject(internals)` and `onCommitFiberRoot`.
- **Angular**:
  - `RuntimeError` codes render as `NG0${code}`. In dev, negative codes, meaning a guide page exists, append `Find more at https://v{major}.angular.dev/errors/NG0600`. The doc URL is **versioned**.
  - Relevant codes:

    | code | meaning |
    |---|---|
    | NG0600 | Signal write in a disallowed context (computed or template). Thrown. `untracked` exempts the write. |
    | NG0602 | Disallowed function call inside a reactive context. |
    | NG0955 | Duplicate track keys. |
    | NG0956 | The track expression caused the DOM to be re-created. |
    | NG0100 | ExpressionChangedAfterChecked. |

  - `window.ng` in dev exposes `getComponent`, `getContext`, `getOwningComponent`, `getHostElement`, `getInjector`, `getListeners`, `getDirectives`, `getRootComponents`, `applyChanges`, `isSignal`, `enableProfiling`, and internal `ɵgetSignalGraph`, `ɵgetInjectorProviders`, etc. Prod builds strip it.
- **Rust**: stable `E0308`-style codes (the index runs E0001-E0806). Each entry has an erroneous example, an explanation and a fix. `rustc --explain E0308` prints the page offline. Retired numbers are never reused.
- **Elm 0.15.1** ("Compiler Errors for Humans", 2015-06-30): show "the code exactly as you wrote it", and "every message has a useful hint".
- **Solid**:
  - 1.x: `DevHooks` (`afterCreateOwner`, `afterRegisterGraph`, `afterUpdate`); `"computations created outside a createRoot or render will never be disposed"`; `"Potential Infinite Loop Detected."` after 10e5 queued updates, dev only, while prod throws a bare `Error()`.
  - 2.0 RC (`2.0.0-rc.9`):
    - A top-level reactive read in a component body warns (`[STRICT_READ_UNTRACKED]`).
    - A write inside an owned scope throws (opt out with `ownedWrite: true`).
    - All writes are microtask-batched, and **`flush()` forces a settle; the docs call it "most useful in tests"**.
- **Vue**: `RECURSION_LIMIT = 100`, and the message names the component (`Maximum recursive updates exceeded in component <X>…`).
- **Preact signals**: throws `"Cycle detected"` once `batchIteration > 100`, with no names at all. This is the anti-pattern for agents.
- **Lit**: a separate dev build selected by the `"development"` export condition, "unminified… extra checks and warnings". The prod build is the default "so that projects don't accidentally deploy the larger development build". Warning categories can be toggled.
- **TC39 Signals** is still Stage 1. The proposal's `Signal.subtle.introspectSources/introspectSinks/hasSinks` is the natural shape for a graph API and explicitly anticipates DevTools support.

## 5. Dev vs prod without a bundler

Without a bundler a runtime `if (DEV)` is never dead-code-eliminated, so every dev-check byte ships to users. The options that work:

1. **Two prebuilt entry files published by the framework** (`dist/dev.js`, `dist/prod.js`), selected by:
   - the package `exports` `"development"` condition, for Node, Deno and tools (`node --conditions=development`);
   - the **import map** in the browser (`{"imports":{"fw":"/node_modules/fw/dist/dev.js"}}` for dev, `prod.js` in index.html for prod).

   This is the Lit/Vue model, adapted to import maps.
2. A runtime flag (e.g. `globalThis.__FW_DEV__`) as an *override inside the dev build only*. For example, prod-like behaviour in dev to reproduce a timing bug.

Solid's `exports` put `"import"` before `"development"` at top level, so outside the `browser` branch the dev build never matches. Condition order is easy to get wrong, and the framework should test its own resolution.

Import maps are Baseline since 2023. Multiple maps and the `integrity` key have varying support, so the framework should generate a single map.

## 6. Runtime invariants, inspection API and structured output: what the prototype showed

The prototype (`fw.ts`, about 100 lines) implemented a `Diag` object, an `FwError` class, a graph registry and `window.__FW__`. In Chromium, through Playwright:
- `__FW__.graph()` returned `[{"id":1,"kind":"signal","name":"count","owner":"Counter","value":2,"observers":[3,2]},{"id":2,"kind":"computed","name":"double","runs":3,"sources":[1]},{"id":3,"kind":"effect","name":"p#text","sources":[1,2]}]`.
- `__FW__.why("double")` returned `{"dependsOn":["count"],"triggers":["p#text"]}`.
- The FW102 warning (untracked read in a component body) arrived in `page.on('console')` as text *with* an inline object preview, which is readable over MCP.
- FW101 (write inside a computed) was thrown with `e.diag` = `{code, level, message, node, hint, docs}`, and its stack pointed at the exact `.ts` line.
- In Node with happy-dom, the same `fw.ts` and `app.ts` gave:
  - a deterministic assertion after `flush()`;
  - a snapshot of the graph;
  - FW201 (update loop) thrown after 100 iterations, with the effect names, instead of hanging.
- A 15-line custom node:test reporter printed only this for a failing run: `{"test":"write in computed","at":".../broken.test.ts:4","code":"FW101","message":"[FW101] Write to signal \"a\" inside computed \"c\"","docs":"https://fw.example/e/FW101"}` followed by `{"pass":1,"fail":1}`. The `diag` property survives the test-runner error serialization (`error.cause.diag`).

Deterministic-rendering lessons from the prototype:
- Adding `data-fw="Counter"` debug attributes pollutes `innerHTML` snapshots. Keep component identity in a WeakMap, exposed through `__FW__`, not in the DOM.
- Node ids come from a creation-order counter, so they are stable per run. Reset it per test root.
- Microtask batching needs an explicit `flush()`/`settled()`.
- Time needs `mock.timers.enable({apis:['Date','setTimeout']})` in Node and `page.clock` in the browser.

## 7. Recommended testing and diagnostics design

**Verification ladder (each rung is a command that exits 0 or 1):**
1. `tsc` (TS 7) with the config above: types plus the erasable-only guarantee. About 1-2 s.
2. `node --conditions=development --import fw/testing/happy-dom --test --test-isolation=none 'src/**/*.test.ts'`. Covers logic, reactivity and most component behaviour, and uses `@testing-library/dom` role queries. The framework ships `fw/testing` with:
   - `mount(Comp, props) -> {root, dispose, [Symbol.dispose]}`
   - `flush()` and `await settled()`
   - `failOn:'warn'` (the default in tests: dev warnings become test failures)
   - an automatic leak check on dispose (FW402 if any effect owned by the root is still live).
3. `playwright test` against `fw dev` (the type-erasing static server: `node:http` plus `stripTypeScriptTypes`, with erasure errors served as throwing modules). Use it for focus, keyboard, layout, CSS and real a11y. Reuse one page per file for about 60 ms/test. Assert with `getByRole` and `toMatchAriaSnapshot`. Same component files, no transform.
4. Exploratory, agent-driven checks: Playwright CLI (preferred for tokens) or MCP, or Chrome DevTools MCP. Add `fw` third-party tools (graph, diagnostics, componentAt(uid), why(node)) behind the experimental flag. Use `window.__FW__` as the flag-free fallback reached through `evaluate`.

**Diagnostics contract:**
- Codes are `FW` plus 3 digits, grouped by area:

  | range | area |
  |---|---|
  | 1xx | reactivity |
  | 2xx | scheduling and loops |
  | 3xx | lists and keys |
  | 4xx | ownership, lifecycle, leaks |
  | 5xx | DOM, props, a11y |
  | 9xx | internal |

  Codes are never reused (the Rust rule).
- Every diagnostic is `{code, level, message, hint, docs, component?, node?, ownerPath?}`. The first line of the text is self-contained: `[FW101] … hint: … docs: https://fw.dev/v1/e/FW101`, with versioned URLs (the Angular pattern).
- Docs also ship **inside the package** (`errors/FW101.md` plus `errors.json`), with `npx fw explain FW101` for sandboxed agents that have no web access.
- The prod build throws the code plus args only, like React's #185 decoder.

**Initial invariant set:**

| code | rule | behaviour | precedent |
|---|---|---|---|
| FW101 | Write inside a computed | throw | NG0600, Solid 2 |
| FW102 | Untracked read in a component body | warn | Solid 2 |
| FW201 | Update loop over 100 flush iterations, **naming the nodes in the cycle** | throw | Vue 100, React 50, Preact nameless |
| FW202 | Computed reads itself | throw | |
| FW301 | Missing list key | make `key` a *required* typed parameter, so this is a type error rather than a runtime check | |
| FW302 | Duplicate keys | warn | NG0955 |
| FW303 | Every row re-created on update | warn | NG0956 |
| FW401 | Effect created with no owner | warn | Solid |
| FW402 | Effects left alive after dispose | error in tests | Deno sanitizers |
| FW403 | Effect ran after its owner was disposed | | |

Optionally, the dev overlay renders uncaught errors as a `role="alert"` element so they show up in the ARIA snapshot an agent already receives after each action.


IMPLICATIONS
- Framework must publish per-file-erased .js + .d.ts (Node refuses to strip TS under node_modules); only app code stays .ts. Evidence: nodejs.org/api/typescript.html.
- Minimum runtime: Node >=24.12 or 26 (type stripping stable in 25.2/24.12; v25 is EOL since 2026-03-31; v26 removed --experimental-transform-types). Document tsconfig with erasableSyntaxOnly+allowImportingTsExtensions+verbatimModuleSyntax+noEmit; TS 7 flags enums/parameter properties as TS1294 and typechecked the prototype in 1.4s.
- Ship a tiny built-in `fw dev` server (node:http + module.stripTypeScriptTypes, ~30 lines) that preserves line:col (verified stack /fw.ts:48:55 == source) and serves erasure failures as a throwing module; without that a parameter property produced a silent failed import and a 30s Playwright timeout.
- Use one specifier scheme that resolves identically in Node and browser: package.json "imports"/"exports" in Node and the same keys in the import map (verified '#fw' works in both; bare import-map-only names fail in Node with ERR_MODULE_NOT_FOUND).
- Dev/prod = two prebuilt files (dist/dev.js, dist/prod.js) selected by the "development" export condition in Node (verified node --conditions=development) and by the import map in the browser; never rely on runtime if(DEV) because nothing tree-shakes without a bundler (Lit/Vue precedent).
- Default Node test command: node --conditions=development --import fw/testing/happy-dom --test --test-isolation=none (8 files: 13.2s with process isolation vs 1.8s with none). happy-dom is the default env; jsdom as fidelity fallback; linkedom unsupported (Testing Library getByRole crashes: no getComputedStyle).
- Ship fw/testing with mount()/dispose (Symbol.dispose), flush()/settled(), failOn:'warn' default in tests, and an automatic leaked-effect check on dispose, modeled on Solid 2 flush() and Deno test sanitizers.
- Treat a real browser as a first-class component-test target, not only E2E: Chromium launch 415ms, getByRole on 1000 rows 111ms vs 592ms happy-dom/2038ms jsdom, 60ms/test when reusing a page. Recommend Playwright Test against `fw dev`; do not depend on Vitest browser mode (hard dependency on vite ^6.4||^7||^8) or Playwright CT (Vite-based).
- Adopt ARIA snapshots (Playwright YAML, mode:'ai' with refs) as the canonical UI assertion/inspection format and design components to be addressable by role+accessible name; add a dev check for interactive elements without an accessible name since agents target getByRole. Keep snapshots scoped: a 1000-row list is ~8.2k tokens.
- Diagnostics contract: stable FWnnn codes (never reused), Diag object {code, level, message, hint, docs, component, node, ownerPath}, self-contained first text line with a versioned docs URL (Angular v{major}.angular.dev pattern), prod builds emit code+args only (React #185 decoder pattern), docs shipped in-package + `fw explain CODE` (rustc --explain) for offline agents.
- Loop/cycle errors must name the participating nodes and component (Vue names the component; Preact's bare 'Cycle detected' and Solid's 'Potential Infinite Loop Detected.' give agents nothing to act on). Prototype FW201 threw after 100 iterations with effect names instead of hanging.
- Make missing list keys a type error (required `key` param) rather than a runtime warning; keep runtime dev checks for duplicate keys and full re-creation (Angular NG0955/NG0956).
- Expose a dev-only inspection API: window.__FW__ {graph(filter), why(node), diagnostics(), componentOf(el)} reachable via Playwright evaluate/MCP evaluate_script, plus the same functions as Chrome DevTools MCP third-party tools via the devtoolstooldiscovery event (Angular ships Signal Graph + DI Graph tools this way). Require names on signals/computeds (optional param, auto-derived where possible) so graph output is meaningful.
- Keep debug identity out of the DOM (data-* attributes polluted innerHTML snapshots in the prototype); use WeakMaps + the inspect API. Ids must come from per-root counters; tests control time via node:test MockTimers (Date+timers) and Playwright page.clock.
- Provide an agent reporter for node:test (prototype: 15 lines, silent on pass, one JSON line per failure with file:line, code, docs, then {pass,fail}); Playwright CLI/MCP guidance says token efficiency matters, so large outputs (graphs, snapshots) should support filters/depth and write-to-file.

OPEN
- Should the default component-test target be a real browser rather than DOM emulation? On this 2-vCPU box Chromium matched or beat happy-dom and jsdom on startup and role queries. That needs re-measuring on typical developer laptops and CI runners, including cold module-fetch cost when each test gets a fresh browser context (389 ms/test measured).
- Is it worth shipping an in-page test harness, so the same test file runs in node:test and inside the browser (the WTR/Vitest-browser model)? Or is 'Node tests with happy-dom plus Playwright tests that mount through page.evaluate' enough?
- Node 26 marks module.stripTypeScriptTypes as release candidate (Stability 1.2). Should `fw dev` depend on it, or on amaro 1.2.1 / ts-blank-space 0.9.0 (which pins typescript 5.1-6.0 and so conflicts with TS 7)? And how should production erasure be done: a per-file deploy step, or serving .ts through an erasing server?
- Should the framework depend on Chrome DevTools MCP third-party tools? They are experimental and need the --categoryExperimentalThirdParty flag. Or should it treat window.__FW__ as the only stable contract and ship the devtoolstooldiscovery adapter as optional?
- Should there be a Node-side ARIA-snapshot serializer compatible with Playwright's YAML format, so happy-dom tests and browser tests share one snapshot format? Accessible-name computation fidelity in happy-dom is the risk.
- How much dev-mode overhead is acceptable? Candidates: always-on graph registry, capturing creation stacks for leak reports, owner paths on every diagnostic. The alternative is making them opt-in through __FW__.config({captureStacks:true}).
- Should signal and computed names be auto-derived, and how? Stack parsing is fragile and costly, and a required name parameter adds API noise. Without names, graph and loop diagnostics degrade to ids.
- Should the prod build carry full messages (small cost, since it is prebuilt by the framework anyway) or only code plus args with a decoder page, as React does?
- Should the framework also emit WebMCP tools (document.modelContext, Chrome 149-156 origin trial) for app-level agent interaction, or stay out of scope for v1?
- Is a dev error overlay rendered as role=alert (visible in the ARIA snapshots agents already receive) acceptable for human developers, or should it only appear on demand?

SOURCES
- Node.js docs: Modules: TypeScript (type stripping stability, limitations): https://nodejs.org/api/typescript.html
- Node.js docs: Test runner (snapshots, mock timers, isolation, reporters, rerun failures): https://nodejs.org/api/test.html
- Node.js docs: module.stripTypeScriptTypes: https://nodejs.org/api/module.html
- Node.js previous releases / release lines: https://nodejs.org/en/about/previous-releases
- Vitest Browser Mode guide (v5.0.2): https://vitest.dev/guide/browser/
- Vitest 4.0 release blog (browser mode stable): https://vitest.dev/blog/vitest-4
- Modern Web: @web/test-runner overview: https://modern-web.dev/docs/test-runner/overview/
- @web/test-runner CHANGELOG (1.0.0): https://raw.githubusercontent.com/modernweb-dev/web/master/packages/test-runner/CHANGELOG.md
- Playwright release notes: https://playwright.dev/docs/release-notes
- Playwright ARIA snapshots: https://playwright.dev/docs/aria-snapshots
- Playwright Page API (ariaSnapshot, ariaSnapshotJSON, consoleMessages, pageErrors): https://playwright.dev/docs/api/class-page
- Playwright Clock: https://playwright.dev/docs/clock
- Playwright MCP (GitHub README): https://github.com/microsoft/playwright-mcp
- Playwright CLI (GitHub README): https://github.com/microsoft/playwright-cli
- Chrome DevTools MCP (GitHub README): https://github.com/ChromeDevTools/chrome-devtools-mcp
- Chrome DevTools MCP tool reference: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
- Chrome DevTools MCP: third-party developer tools: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/third-party-developer-tools.md
- Chrome blog: third-party developer tools for Chrome DevTools for agents (2026-06-18): https://developer.chrome.com/blog/devtools-for-agents-3p-tools
- Chrome blog: Join the WebMCP origin trial (2026-06-09): https://developer.chrome.com/blog/ai-webmcp-origin-trial
- Angular error encyclopedia: https://angular.dev/errors
- Angular NG0600: Signal write in a disallowed context: https://angular.dev/errors/NG0600
- Angular source: global_utils.ts (window.ng debug API): https://github.com/angular/angular/blob/main/packages/core/src/render3/util/global_utils.ts
- Angular source: errors.ts (RuntimeError formatting): https://github.com/angular/angular/blob/main/packages/core/src/errors.ts
- React error decoder #185: https://react.dev/errors/185
- React source: formatProdErrorMessage.js: https://github.com/facebook/react/blob/main/packages/shared/formatProdErrorMessage.js
- React error codes.json: https://github.com/facebook/react/blob/main/scripts/error-codes/codes.json
- React source: ReactFiberWorkLoop.js (NESTED_UPDATE_LIMIT): https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberWorkLoop.js
- React source: ReactFiberDevToolsHook.js: https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberDevToolsHook.js
- React captureOwnerStack reference: https://react.dev/reference/react/captureOwnerStack
- Rust compiler error index: https://doc.rust-lang.org/error_codes/error-index.html
- Elm: Compiler Errors for Humans (2015): https://elm-lang.org/news/compiler-errors-for-humans
- Solid 2.0 MIGRATION.md (dev diagnostics, flush): https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/MIGRATION.md
- Solid source: reactive/signal.ts (DevHooks, infinite loop guard): https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts
- Vue source: runtime-core scheduler.ts (RECURSION_LIMIT): https://github.com/vuejs/core/blob/main/packages/runtime-core/src/scheduler.ts
- Preact signals core source (Cycle detected): https://github.com/preactjs/signals/blob/main/packages/core/src/index.ts
- Lit: Development and production builds: https://lit.dev/docs/tools/development/
- Vue Quick Start (import maps, dev build note): https://vuejs.org/guide/quick-start.html
- MDN: script type=importmap: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap
- Deno testing fundamentals: https://docs.deno.com/runtime/fundamentals/testing/
- Deno CLI: deno test reference: https://docs.deno.com/runtime/reference/cli/test/
- GitHub advisory GHSA-37j7-fg3j-429f (happy-dom CVE-2025-61927): https://github.com/advisories/GHSA-37j7-fg3j-429f
- Announcing TypeScript 7.0: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- TC39 Signals proposal: https://github.com/tc39/proposal-signals
- Claude Code best practices (verification, context efficiency): https://code.claude.com/docs/en/best-practices