## Bottom line

**No published data directly compares any of the three choices.** I found nothing that measures (a) hyperscript or typed tag functions against JSX or templates, (b) `onclick` against `onClick` inside a JS-object API, or (c) reused Angular primitive names against new names for a new framework. The benchmarks that exist (Web-Bench, DesignBench, SvelteBench, the Next.js agent evals, sveltejs/svelte-evals) compare whole frameworks or model versions, never API surface variants. The spec should therefore **make a small A/B eval a pre-v1 gate** rather than treat these choices as settled.

The indirect evidence below does narrow things, and it ranks the stakes:
- **(c) naming is the highest risk.** A semantic mismatch is invisible to the type checker, and docs in context only partly fix it.
- **(a) is moderate.**
- **(b) is the lowest.** TypeScript already reports `onClick` as an error and suggests `onclick`.

## 1. What exists and what it measures

### Web-Bench (ByteDance, arXiv 2505.07473; repo last commit 2026-04-30)
- 50 projects with 20 sequential tasks each.
- UI projects: react, react-no-ts, vue, angular, svelte, threejs. I listed the repo's `projects/` directory: it has no hyperscript, Mithril, VanJS, hyperapp, Lit, Solid or Preact project.
- Pass@2 (best of 5) per framework, in the order React / Vue / Angular / Svelte:
  - Claude-3.7: 65 / 30 / 40 / 25
  - Claude-3.7-Thinking: 60 / 40 / 50 / 55
  - GPT-4o: 35 / 30 / 5 / 20
- The authors' explanations:
  - React leads because of "the largest dataset for LLM training".
  - Vue and Svelte do well because they "exhibit similarities to HTML grammar".
  - Angular has "the most complex grammar".
- These are explanations the authors offer, not measured causes.

### DesignBench (arXiv 2506.06251)
- Compares React, Vue, Angular and vanilla HTML.
- Compile success rates: vanilla best; React 0.85–0.97; Vue 0.68–0.97; Angular 0.61–0.76.
- Most common error types:
  - React: "Unexpected Token" and "Expression Expected", i.e. JSX syntax.
  - Vue: "Missing End Tag".
  - Angular: import/export errors.
- Tag functions would remove closing-tag errors but may add bracket-balancing errors. Nobody has measured that trade.

### Next.js agent evals (nextjs.org/evals, snapshot 2026-09-25, pass@4)
- Measures base success against success with bundled docs (AGENTS.md):
  - Claude Opus 5.5: 97 → 97
  - Claude Sonnet 5: 81 → 97
  - Gemini 3.8 Flash: 90 → 97
- Vercel's 2026-01-27 post tested Next 16 APIs absent from training data (`'use cache'`, `cacheLife()`, `proxy.ts`, `updateTag()`…):
  - baseline 53%
  - skills 53%
  - skills with explicit instructions 79%
  - AGENTS.md docs index 100%
- It measures docs-in-context, not syntax choices.

### Tooling you could reuse
- **`@vercel/agent-eval` 2.3.0** (npm, published 2026-09-18) describes itself as "Test AI coding agents on your framework". sveltejs/svelte-evals uses it, and Vercel's Next.js eval repo is the other reference user. It needs a Vercel sandbox and the AI Gateway.
- **Angular's `web-codegen-scorer` 0.0.70** is framework-agnostic. It scores build success, runtime errors, accessibility and best practices.

## 2. Re-analysis of SvelteBench's raw samples (new data, most relevant to (b) and (c))

SvelteBench (khromov/svelte-bench, pushed 2026-09-23) commits every generated sample. I downloaded all 290 result files:
- 27,396 samples from 292 model IDs, 2025 to 2026-09-22.
- 9 single-file Svelte 5 tasks, 10 samples each.

Method: regex classification of the code, cross-tabulated with test pass/fail. Script: `/tmp/claude-1000/-home-and-ff/96b9f726-1e37-4313-9d48-852096c2ca84/scratchpad/sb/analyze.py`.

Svelte 5 is a natural experiment for this question:
- Its event syntax is lowercase `onclick={...}`.
- The Svelte 4 syntax was the directive `on:click`.
- Event attributes are case-sensitive. The docs say `onClick` "listens to the `Click` event", which makes camelCase a silent failure.

### Findings

**React camelCase almost never leaked in**
- `onClick=`/`onChange=`-style attributes appeared in **8 of 27,396 samples (0.03%)**. All 8 failed, and all came from small or fine-tuned models: ternary-bonsai-27b, seed-1.6, nemotron-30b, qwen3.5-9b, a "SvelteMind" GGUF, hermes-4-405b.
- Frontier-class models: **0 of 7,353**.

**The dominant leak was the framework's own previous version**
- `on:click` appeared in 30.4% of all samples and 38.2% of samples from event-handling tests.
- It depends strongly on vendor. Share of event-test samples using `on:` with no docs:
  - GPT-5 (Aug 2025) through GPT-5.4 (Mar 2026): about 0.55–0.83. GPT-5.5 (2026-04-25): 0.02.
  - Claude Opus 4 (May 2025) onward: 0.00.
  - Gemini 3.x: 0.00.
  - grok-4.3 (2026-05): 0.80. grok-4.5 (2026-07): 0.00.
- Svelte 5 shipped in October 2024, so the stale prior lasted about 7–18 months depending on vendor.
- `on:` still works in Svelte 5. The prior persisted partly because nothing penalised it: pass rate was 0.76 when `on:` was present, for current frontier models.

**Version-matched docs removed the stale prior completely**
- This is a clean paired comparison: same day (2025-05-03), same 7 models, 90 samples per arm.
- The context was the 44,823-character `llms-small.txt`, which begins "You MUST use the Svelte 5 API".
- Pass rate, no docs → docs:
  - o3-mini: 0.16 → 0.88
  - gpt-4o: 0.18 → 0.86
  - o4-mini: 0.13 → 0.89
  - claude-3.7-sonnet: 0.57 → 0.83
  - claude-3.5-haiku: 0.73 → 0.77
  - gemini-2.5-flash: 0.70 → 0.87
  - gemini-2.5-pro: 0.83 → 0.87
- `on:` usage dropped from 0.67 to 0.00 in every model that had it.

**Idioms leaking in from other signal libraries were rare**
- `.set(`/`.update(` calls on state: 271 samples (0.99%), pass rate 4%. Among current frontier models it was 34 samples (0.56%), all from GPT-5 mini/nano/codex-mini. Example: `const count = $state(0); count.set(count() + 1)`.
- Signal-style call reads `x()` of `$state` variables: 69 of 19,468 (0.35%).
- `useState`: 1. `createSignal`: 2.

**Saturation**
- claude-opus-4-6/4-7/4-8, gpt-5.5, gemini-3.1-pro-preview and grok-4.5 all score 1.00 with no docs.
- Simple single-file tasks no longer tell frontier models apart. Our eval needs harder tasks, mid-tier models, and metrics beyond pass@1.

**Caveat on transferability.** `.svelte` is an HTML-template format with a file extension that identifies the framework, and lowercase attributes are the HTML norm. In a plain `.ts` file calling `button({ onclick })`, the import line is the only framework cue. React's `onClick` prior could leak more there. Only our own eval can answer that.

## 3. (a) Tag functions / hyperscript vs JSX or templates

- **Direct data: none.** Searches for Mithril, VanJS, hyperapp, `React.createElement` and htm found no benchmark or paper.
- The two earlier notes' contradictory claims about which form has the stronger training prior (typed factories have "almost no" prior, against `h()` being "the shape agents know best") are both unmeasured.

### What I could verify: type-level diagnostics are identical for both forms
tsc 7.0.2 and 6.0.3 give identical messages. With `Props<E>` derived from lib.dom:
- `h('input', { onChange })` and `button({ onClick })` both give **TS2561 "…Did you mean to write 'onchange'/'onclick'?"**
- Event parameters are inferred in both forms. `e.key` on a click handler is TS2339 on `PointerEvent`; TS 6/7's lib types click as `PointerEvent`.
- A tag typo in `h('buton')` is TS2345. In the tag-function form the same typo is an unknown identifier or import.

So type safety does not decide between `h()` and tag functions. What is left is the training prior, token count and nesting-error profile, which is exactly what an eval measures.

### Indirect evidence
- **Low-resource DSLs work when the target resembles what models already write.**
  - SPEAC (Mora et al., NeurIPS 2024) builds an intermediate language models "naturally" know.
  - Giagnorio et al. (arXiv 2606.16827, June 2026): languages with no training data get 0–1% pass@1 on hard tasks, against 59–89% for high-resource ones. Docs and examples in context help only modestly, and most failures are syntactic.
  - This argues for plain TS calls plus DOM names over any new mini-syntax. Both `h()` and tag functions qualify.
- **Code examples in docs matter most.** Chen et al. (arXiv 2503.15231): removing examples dropped Qwen-32B from 0.66–0.82 to 0.22–0.39. Retrieved docs improved results by 83–220% on less-common libraries.

## 4. (b) `onclick` vs `onClick`

- **Direct data for a JS-object API: none.** The SvelteBench numbers in section 2 are the closest proxy: models almost never produced React casing where the docs and prior said lowercase.

### Verified with tsc 7.0.2 and 6.0.3
- **The lowercase handler set comes straight from lib.dom with no hand-maintained table:**
  `{[K in keyof HTMLElementEventMap as \`on${K}\`]?: (ev: HTMLElementEventMap[K] & {currentTarget: E}) => void}`
- With this type:
  - `onClick` → TS2561 "Did you mean to write 'onclick'?"
  - `ondoubleclick` → "Did you mean to write 'ondblclick'?"
  - `e.currentTarget.value` type-checks on `input`.
- **A camelCase form cannot be derived the same way.** `on${Capitalize<K>}` yields `onKeydown` and `onDblclick`, which match neither React (`onKeyDown`, `onDoubleClick`) nor the DOM. React-accurate camelCase needs a maintained mapping table.
- **Raw lib.dom handler types are a trap.** `oninput: e => e.currentTarget.value` gives TS18047 ("possibly null") plus TS2339 (`value` not on `EventTarget`). Remap the types so `currentTarget` is the element.
- **One hole: spreads.** `button({ class: 'x', ...p })` with `p = { onClick }` compiles silently. Passing a variable that holds only wrong keys is caught by TS2559 (weak type).

### Other frameworks' choices
- Solid lowercases: "Event names are mapped to lower case, so `onClick` listens to `click`". Custom-event casing goes through `on:*`.
- Svelte 5 is case-sensitive, which makes `onClick` fail silently. That is the worst combination.

### Reactive-prop rule (conflict resolution)
- The `on` prefix is the DOM's own convention for handler properties, not a framework heuristic. "Function means live, except `on*` keys typed as handlers" is one rule, so the frameworks-survey and ts-typing-prototype positions are compatible.
- A separate `on: { click }` namespace would add a second way to write the same thing.
- Svelte's data show the risk of multiple forms: the namespace form was the one models kept regressing to.
- If a namespace is kept at all, reserve it for custom events and listener options, the way Solid uses `on:*`.

## 5. (c) Reused names (Angular `signal`/`set`/`update`/`effect`…) vs new names

- **Direct data: none for a UI framework.** The code-generation literature is consistent, though: a familiar name imports its familiar semantics.

### Familiar names help when semantics match
- Zan et al. (EMNLP Findings 2022) renamed pandas APIs into a "Monkey" library. Codex 12B dropped from **18.88% to 1.47%** pass@1 (2022-era models, no docs).
- Chen et al. 2025: "LLMs tend to be more robust when using unfamiliar APIs that resemble popular ones". Their example is Ivy mirroring PyTorch and TensorFlow.

### Same or near-same name with different semantics is the worst case
- Wang et al. (ICSE 2025, arXiv 2406.09834): 7 LLMs, 145 API mappings, 28,125 prompts.
  - 70–90% deprecated-API use when the surrounding code is old-style, against 9–18% otherwise.
  - "Minor changes between deprecated APIs and their replacements… often led to more pronounced issues."
- Ashik et al. (arXiv 2604.09515, April 2026): 270 real API updates, 11 models, all ≤34B or GPT-4o-mini.
  - Executable output: 42.55% without structured docs, 66.36% with them.
  - **API modification that keeps the same interface was hardest: 58.19%**, against 79.07% for deprecation and 62.27% for addition.
  - Models "ignore modifications to parameters".
- Shen et al. (arXiv 2609.26388) found model outputs "often directed toward the meanings suggested by misleading names". The effect is smaller when the answer can be recovered from local code.

### The Svelte autofixer claim is inverted
I read `wrong-property-access-state.ts` in sveltejs/ai-tools (commit a5a92c6, 2026-09-22). It flags `.set`/`.update` calls and `.set`/`.update`/`.$` reads on `$state`/`$derived` variables. It flags them because runes have no such methods.

This shows models *reach for* `.set()`/`.update()`. Svelte stores' `set(v)`/`update(fn)` and Angular's `set`/`update` share one meaning, and the SvelteBench data (section 2) show it leaks in only about 1% of samples, mostly from small models. **For a framework whose `set`/`update` match that meaning, this prior works for us, not against us.** The ai-failure-modes reading ("exactly the false friends") is not supported.

### Where Angular's semantics actually diverge (checked on angular.dev)
- **`resource`** takes `{ params, loader }` (plus `stream`). The loader receives `{ params, abortSignal, previous }`. It is stable in v22.2.
  - A spec name `load` would be exactly the kind of small name change the Wang and Ashik studies flag as most error-prone.
- **`effect`**
  - Always runs asynchronously during change detection. View effects run before their component is checked; root effects run before all components.
  - The callback receives `onCleanup` as its first argument.
  - It returns an `EffectRef` with a `.destroy()` method.
- **What TypeScript can and cannot catch** in a divergent design:
  - Returning a function instead of `EffectRef` is caught by the type checker: `ref.destroy()` → TS2339.
  - A missing `onCleanup` parameter is also caught.
  - Timing differences are invisible to the type checker, and that is where a reused name would do harm.

### Docs versus semantics
Docs in context fixed *syntax* priors completely (SvelteBench `on:` 0.67 → 0; Vercel 53% → 100%). They fixed *semantic* conflicts only partly (Ashik et al. still at 58% for same-interface modifications). So (a) and (b) are mostly neutralised by docs plus tsc; (c) is not.

## 6. Proposed pre-v1 eval (the gate)

**Build.** Make one runtime with thin API skins, so arms differ only in surface syntax. Run each task in each condition.

**Arms**
- **A (authoring)**
  - A1: typed tag functions `div({...}, ...)`
  - A2: `h('div', {...}, ...)`
  - Optional reference: JSX with a build step inside the harness, to measure what going JSX-free costs.
- **B (events)**
  - B1: `onclick`
  - B2: `onClick` with a mapping table
  - B3: `on: { click }`
- **C (names)**
  - C1: Angular-exact names *and* semantics where feasible
  - C2: fresh names
  - C3: Angular names with the planned divergent semantics (e.g. microtask effect, disposer return)

**Conditions**
1. No docs, which measures prior leakage.
2. A single passive AGENTS.md/llms.txt, examples first. This matches Vercel's winning setup.
3. Docs plus tool loop: `tsc --noEmit` and tests, up to N iterations.

**Metrics**
- Hidden behaviour tests, including tests that assert effect timing and disposal.
- tsc errors on the first attempt, by code.
- Rate of leaked idioms from other frameworks, by regex: `onClick`, `className`, `useState`, `.value`, `createSignal`, `.destroy()`, `loader`/`load` mix-ups.
- Iterations to green, and tokens.

**Models**
- At least 3 vendors plus 1 open-weight model, because priors vary by vendor (GPT-5.x wrote `on:` in about 80% of event-test samples; Claude 4+ in 0%).
- Include a mid-tier model, because frontier models saturate.

**Power**
- Two-proportion test, α=0.05, power 0.8. Samples per arm needed:
  - 250 to detect 85% vs 75%
  - 435 to detect 95% vs 90%
  - 906 to detect 85% vs 80%
- A paired design (same task, both arms) lowers these. About 25 tasks × 10 samples per model is the practical floor.

**Decision rule**
- Pick the arm with the best result under condition 3.
- If arms tie within the confidence interval, pick the one closest to DOM or lib.dom names with the fewest tokens.
- Reject any arm with a leaked-idiom rate above a set threshold under condition 2.

## 7. Resolutions of cross-note conflicts

- **Symbol.dispose** (BCD 8.1.3, published 2026-09-24)
  - `Symbol.dispose`, `DisposableStack` and `using` are Safari "preview" only; Safari iOS is `false`.
  - Safari 27 was released on 2026-09-14.
  - **Resolution:** v1 uses a plain `dispose()` method. Add `[Symbol.dispose]` as an alias once it reaches Baseline. It needs `lib: esnext` today, and in Safari it would create the key "undefined".
- **Module resolution** (re-tested with tsc 7.0.2 and Node 25.1)
  - `bundler` accepts `./x` and `./x.js`, both of which fail in Node with ERR_MODULE_NOT_FOUND.
  - `nodenext` catches `./x` with TS2835, but its message suggests `'./x.js'`, which is the wrong fix and one agents will follow.
  - Only `./x.ts` runs.
  - **Resolution:** use `module/moduleResolution: nodenext` with `allowImportingTsExtensions` and `verbatimModuleSyntax`, plus a one-line check that must find nothing (tested):
    `grep -rnP "(?:from|import)\s*\(?\s*['\"]\.{1,2}/[^'\"]*(?<!\.ts)['\"]" src`
- **Decorators and syntax gate**
  - A per-file check is `stripTypeScriptTypes()` followed by `node --check` on the stripped output.
  - Tested on Node 25.1: `@dec class C{}` fails with SyntaxError; `enum` fails with ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX; valid TS passes.
  - In the Node 26.10 docs the API is "1.2 Release candidate"; v26.0.0 removed the `transform` option.
- **tsc exit codes differ between versions:** for the same errors, tsc 7.0.2 exited 1 and tsc 6.0.3 exited 2. Gates should test for non-zero.
- **TS 7 overload regression:** I did not re-run this. The orchestrator's re-test found no regression; I accept it.
- **ArrowJS:** `@arrow-js/core` 1.0.0 was published 2026-03-20T16:55Z and 1.0.6 on 2026-04-01. The March date is correct.
- **Safari 27:** 2026-09-14 per BCD.
- **Node**
  - nodejs.org lists v25 as EOL; its last release was 25.9.0 on 2026-03-31. nodejs/Release `schedule.json` gives v25's end as 2026-06-01. It is EOL either way.
  - v24.21.0 is LTS (2026-09-07), entering maintenance on 2026-10-20.
  - v26.10.0 is Current (2026-09-21), with LTS due 2026-10-28.
  - **Recommend** `engines: ">=24.12.0 <25 || >=26"`, and re-run the experiments on 26.x.
- **Diagnostic code format:** Anthropic's "Writing effective tools for agents" (2025-09-11) says agents handle "natural language names… significantly more successfully than… cryptic identifiers" and should get actionable errors "rather than opaque error codes". A new framework has no training prior for `FW101`. **Use descriptive slugs** (e.g. STATIC_READ_IN_SETUP), each with a one-line fix hint.
- **Training prior of the factory API:** both claims are unmeasured and belong in eval arm A (section 6). The type-safety argument does not decide it (section 3).
- **Primitive naming:** reuse a name only where its signature *and* observable timing match Angular's. Otherwise rename. `resource` means `loader`, never `load`. Run eval arm C.
- **Not re-checked:** stores, the async primitive's tracking model, and `devtoolstooldiscovery` are outside this question.

IMPLICATIONS
- Treat the authoring surface (tag functions vs h()), event-prop casing and primitive naming as unsettled until a pre-v1 A/B eval runs. No published benchmark measures any of them (Web-Bench's projects directory, DesignBench, SvelteBench and nextjs.org/evals all compare whole frameworks, never API variants).
- Budget the eval by stakes, highest first: (c) naming, then (a) authoring form, then (b) event casing. SvelteBench's paired data show docs in context removed a stale syntax prior completely (on: usage 0.67 to 0; pass 0.13-0.18 to 0.86-0.89 for o3-mini, gpt-4o and o4-mini). Semantic API changes with an unchanged interface stay hard even with docs: 58.19% executable in arXiv 2604.09515.
- Type event handlers as `{[K in keyof HTMLElementEventMap as `on${K}`]?: (ev: HTMLElementEventMap[K] & {currentTarget: E}) => void}`. Verified on tsc 7.0.2 and 6.0.3: `onClick` gets TS2561 'Did you mean to write onclick?' in both tag-function and h() forms, and `currentTarget.value` type-checks. camelCase cannot be derived from lib.dom (Capitalize gives onKeydown, not React's onKeyDown).
- Do not use raw lib.dom `on*` property types for handlers. `e.currentTarget` becomes `EventTarget | null`, so the common idiom `e.currentTarget.value` fails with TS18047 and TS2339.
- Add a dev-mode runtime warning for unknown or camelCase `on*` keys. Object spread (`{class:'x', ...p}` with `p = {onClick}`) passes tsc silently. Svelte 5 shows the failure mode: `onClick` there silently listens to a 'Click' event.
- Reactive-prop rule: the `on` prefix marks handlers and every other function value is live. This is the DOM's own convention, not a framework heuristic. Drop the separate `on:{click}` namespace for v1 (at most keep it for custom events and listener options, as Solid does). In SvelteBench, models kept regressing to Svelte's older directive form.
- Reuse Angular names only where signature and observable timing both match exactly. Angular's resource is `{params, loader}` with loader args `{params, abortSignal, previous}`: use `loader`, never `load`, because near-miss names do the most damage (ICSE'25 2406.09834; 2604.09515). Angular's effect runs asynchronously during change detection, passes `onCleanup` and returns `EffectRef.destroy()`. Mirror these or rename.
- The Svelte autofixer does not show that `.set()`/`.update()` are false friends. It flags them because runes lack them, which means models reach for them. Svelte stores and Angular give set/update the same meaning, so keeping them with that meaning uses the prior rather than fighting it.
- Make a single passive AGENTS.md/llms.txt, examples first, the load-bearing agent mechanism in v1. A new framework has no training prior for at least a year (Svelte 5's stale prior persisted 7-18 months depending on vendor). Passive docs beat skills in Vercel's eval (53% to 100%), and code examples were the doc component that mattered most (2503.15231).
- Eval design: ≥3 vendors plus an open-weight model, since priors are vendor-specific (GPT-5 to 5.4 wrote on:click in about 80% of event tests; Claude 4+ in 0%). Include mid-tier models, since frontier models saturate at 1.00 on SvelteBench. Measure first-attempt tsc errors, leaked-idiom rate and iterations to green, not just pass@1. Use about 250 samples per arm to detect a 10pp difference; a paired design lowers this.
- Diagnostics: use descriptive slug codes with one-line fixes, per Anthropic's 2025-09-11 tool-design guidance. Audit every diagnostic for wrong-fix suggestions: TS2835 under nodenext suggests './x.js', which passes tsc and fails at runtime. Pair `nodenext` + `allowImportingTsExtensions` with a check that relative specifiers end in `.ts`.
- Expose `dispose()` rather than `[Symbol.dispose]` in v1. BCD 8.1.3 lists Symbol.dispose, DisposableStack and `using` as Safari preview only, and Safari iOS as false.
- Add a per-file syntax gate (stripTypeScriptTypes followed by `node --check`). It catches decorators, which erasableSyntaxOnly misses. Set engines to `>=24.12.0 <25 || >=26` and re-run all prior experiments on Node 26.x, since v25 is EOL.

OPEN
- Does React's `onClick` / `className` prior leak more in plain `.ts` files, where only the import line identifies the framework, than in `.svelte` files (0.03% there)? Only our own eval (arm B, no-docs condition) can answer this.
- Tag functions vs h(): with deep nesting, do models make more paren/bracket-balancing errors, as a counterpart to the JSX 'Unexpected Token' and Vue 'Missing End Tag' errors in DesignBench? Neither form has ever been measured.
- How large is the semantic false-friend cost if `effect` keeps Angular's name but uses microtask timing and a disposer return? It needs tasks whose hidden tests assert timing and disposal. TypeScript cannot surface it.
- Will a roughly 25-task eval discriminate at all, given frontier models score 1.00 on SvelteBench and 97% on Next.js evals? The gate may have to rely on mid-tier models and on first-attempt tsc-error or iteration counts.
- Harness choice: @vercel/agent-eval 2.3.0 needs a Vercel sandbox and the AI Gateway. Is a local single-shot SvelteBench-style harness (generate, then tsc --noEmit, then browser tests) enough for the first gate, with agentic runs only for the finalists?
- Should the eval include a JSX-with-build reference arm, to quantify what the no-bundler constraint costs agents, even though JSX cannot ship?
- Node v25 EOL date: nodejs.org says 2026-03-31, nodejs/Release schedule.json says 2026-06-01. It does not change any recommendation, but the spec should cite one source.

SOURCES
- Web-Bench: A LLM Code Benchmark Based on Web Standards and Frameworks (arXiv 2505.07473): https://arxiv.org/html/2505.07473
- bytedance/web-bench repository: https://github.com/bytedance/web-bench
- DesignBench: A Comprehensive Benchmark for MLLM-based Front-end Code Generation (arXiv 2506.06251): https://arxiv.org/html/2506.06251
- khromov/svelte-bench README: https://github.com/khromov/svelte-bench/blob/main/README.md
- svelte-bench raw results (benchmarks directory): https://github.com/khromov/svelte-bench/tree/main/benchmarks
- Svelte docs: Basic markup (event attributes are case sensitive): https://svelte.dev/docs/svelte/basic-markup
- sveltejs/ai-tools autofixer visitor wrong-property-access-state.ts: https://github.com/sveltejs/ai-tools/blob/main/packages/mcp-server/src/mcp/autofixers/visitors/wrong-property-access-state.ts
- sveltejs/svelte-evals: https://github.com/sveltejs/svelte-evals
- vercel-labs/agent-eval (@vercel/agent-eval): https://github.com/vercel-labs/agent-eval
- Next.js Agent Evals: https://nextjs.org/evals
- Vercel: AGENTS.md outperforms skills in our agent evals: https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
- angular/web-codegen-scorer: https://github.com/angular/web-codegen-scorer
- When Language Model Meets Private Library (Zan et al., EMNLP Findings 2022, arXiv 2210.17236): https://arxiv.org/abs/2210.17236
- When LLMs Meet API Documentation: Can Retrieval Augmentation Aid Code Generation Just as It Helps Developers? (arXiv 2503.15231): https://arxiv.org/html/2503.15231
- LLMs Meet Library Evolution: Evaluating Deprecated API Usage in LLM-based Code Completion (ICSE 2025, arXiv 2406.09834): https://arxiv.org/html/2406.09834
- When LLMs Lag Behind: Knowledge Conflicts from Evolving APIs in Code Generation (arXiv 2604.09515): https://arxiv.org/html/2604.09515
- On the Lexical Superstition of Large Language Models for Code Comprehension (arXiv 2609.26388): https://arxiv.org/abs/2609.26388v1
- No Resource, No Benchmarks, No Problem? LLM code generation in no-resource languages (arXiv 2606.16827): https://arxiv.org/html/2606.16827v1
- Synthetic Programming Elicitation for Text-to-Code in Very Low-Resource Languages (NeurIPS 2024, arXiv 2406.03636): https://arxiv.org/abs/2406.03636
- CURE: Contrastive Unlearning for Evolving APIs (arXiv 2606.30810): https://arxiv.org/abs/2606.30810
- Bridging the Knowledge Void: Inference-time Acquisition of Unfamiliar Programming Languages (arXiv 2602.06976): https://arxiv.org/abs/2602.06976
- CodeUpdateArena: Benchmarking Knowledge Editing on API Updates (arXiv 2407.06249): https://arxiv.org/abs/2407.06249
- Solid docs: on* event handlers: https://docs.solidjs.com/reference/jsx-attributes/on_
- Angular docs: Async reactivity with resources: https://angular.dev/guide/signals/resource
- Angular docs: Effects: https://angular.dev/guide/signals/effect
- Anthropic Engineering: Writing effective tools for AI agents: https://www.anthropic.com/engineering/writing-tools-for-agents
- Node.js previous releases: https://nodejs.org/en/about/previous-releases
- nodejs/Release schedule.json: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- Node.js v26 docs: module.stripTypeScriptTypes: https://nodejs.org/api/module.html
- @mdn/browser-compat-data (npm, 8.1.3): https://www.npmjs.com/package/@mdn/browser-compat-data
- @arrow-js/core npm registry metadata: https://registry.npmjs.org/@arrow-js/core