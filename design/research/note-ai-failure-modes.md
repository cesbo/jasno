
# How AI coding agents fail on frontend code, and which framework properties help

Date: 2026-09-25. Everything version-dependent below was checked against live pages. I also ran small experiments with Node v25.1.0 and TypeScript 7.0.2 in the scratchpad.

## 0. Summary
Agents rarely fail on syntax. They fail in four ways:
1. **Version mixing.** Their training prior is frozen and mixes several versions of each framework.
2. **Silent semantic traps.** The code compiles and runs, but reactivity or lifecycle is wrong, and the agent cannot see the screen.
3. **Cross-framework bleed.** They default to the most popular idiom, which in frontend usually means React, even inside another framework.
4. **No feedback loop.** There is no textual, runnable signal that says the code is wrong.

What helps, in rough order of evidence strength:
- type errors from the stock compiler
- version-matched docs that are always in context
- errors that name the fix
- runtime state the agent can read as text
- APIs that carry no hidden state and have no call-order rules

---

## 1. Recurring failure modes, framework by framework

### React / Next.js
- **Unneeded effects.** Agents use `useEffect` for derived state, event logic, state resets and parent notification. react.dev lists 8 such cases on "You Might Not Need an Effect". Its rule is that Effects are only for syncing with external systems. Practitioner write-ups of AI-generated React (theroadtoenterprise.com, May 2026; LogRocket, Jun 2026) keep finding the same things:
  - `useEffect` + `useState` fetching with no abort, so requests race
  - no debounce, so every keystroke fetches
  - `exhaustive-deps` or `rules-of-hooks` warnings **suppressed** instead of fixed, leaving stale closures and conditional hooks
  - untyped `any` props
  - inline arrow functions that defeat `React.memo`
  - duplicated utility functions
- **StrictMode double invocation.** In development React mounts, unmounts and remounts on purpose. The natural agent "fix" is a `useRef` guard so the effect "runs once", which react.dev calls out explicitly: "🚩 This won't fix the bug!!!". The issue is behavior that only exists in development, which the agent misreads as a bug.
- **Dependency arrays.** They must list every value the effect reads, so they duplicate what the code already says. React needed a lint rule to keep them in sync, and in Oct 2025 added compiler-powered rules on top (`set-state-in-render`, `set-state-in-effect`, `refs`) in `eslint-plugin-react-hooks`. That React ships these rules at all is a sign of how common the misuse is.
- **Next.js App Router confusion:**
  - `getServerSideProps`/`getStaticProps` written into `app/` files. Per a DEV post (Mar 2026), "the code often compiles, so the bug is silent".
  - `'use client'` added reflexively to whole pages
  - context providers placed in Server Components
  - `redirect()` inside try/catch

  Vercel's own "10 common App Router mistakes" list is mostly about the server/client boundary.
- **Stale training data is the main cause, and Vercel acts on it.** Next 16.3 writes this block into AGENTS.md: "# This is NOT the Next.js you know … APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/`".

### Vue
Per Vue's own docs and the vuejs-ai skills:
- `ref` vs `reactive`: two primitives for the same job
- forgetting `.value` in script
- destructuring a `reactive()` object silently loses reactivity
- passing `state.count` instead of a getter to `watch()`
- assigning derived refs in watchers instead of `computed`
- side effects inside computed getters

The worst trap is that the meaning of an expression depends on where it appears. Ref unwrapping in templates only applies to top-level properties, so `{{ object.id + 1 }}` renders `[object Object]1`. Refs inside reactive arrays or Maps still need `.value`. Vue 3.5 then made destructured props reactive, while destructuring `reactive()` still breaks, so the same syntax behaves differently across versions and contexts.

The vuejs-ai/skills repo (8 skills, including separate Options API and Composition API skills) keeps a rule only if the model cannot solve the problem without it ("Capability" vs "Efficiency").

### Svelte 5 vs Svelte 4
The official Svelte MCP server (late 2025) ships a `svelte-autofixer` tool. Its visitor files (`packages/mcp-server/src/mcp/autofixers/visitors/`) are, in effect, a catalog of the mistakes the Svelte team sees LLMs make:
- `imported-runes`: importing `$state` etc. from a module; runes are compiler globals
- `read-state-with-dollar`: reading `$state` as `$count`, a Svelte 4 store habit
- `wrong-property-access-state`: calling `.set()`/`.update()` or reading `.value` on a `$state` variable, which mixes in Svelte 4 store and Vue/Preact-signal APIs
- `use-runes-instead-of-store`: importing `svelte/store`
- `assign-in-effect`: assigning state inside `$effect` instead of using `$derived`
- `derived-with-function`: `$derived(() => …)` instead of `$derived.by`
- `on:click` instead of `onclick` (Advent of Svelte 2025, day 23)

Every message names the fix, e.g. "Please remove this import and use "$state" directly." SvelteBench (khromov) exists specifically to measure Svelte 5 rune correctness.

### SolidJS
- Destructuring props, or `const name = props.name`, breaks reactivity. The Solid docs say to wrap it as `() => props.name` or use `splitProps`/`mergeProps`.
- Components run once, so an early return is permanent.
- A signal must be called (`count()`).
- The solid2-agent-kit README gives the root cause directly: "LLMs are heavily biased toward React when writing TSX, and their Solid knowledge is mostly Solid 1.x." Its regex gate, run after every agent edit, blocks:
  - destructured or spread props
  - React imports, hooks and `className`
  - `useEffect` and `createResource`
  - `"use client"`
  - Solid 1.x `createEffect(fn)` without the new second argument
- Solid 2.0 churn makes this worse. RC shipped Aug 13, 2026: `createResource`, `batch`, `on`, `createComputed` and `produce` are removed, and `createEffect(compute, apply)` is split in two. Solid ships `npx solid-migration-assistant` to flag 1.x patterns.
- Solid 2.0 also moved to microtask batching where reads only see a write after `flush()` (InfoQ, May 2026). A commenter complained this forces developers to "treat reactive values differently from normal variables", which is exactly the kind of non-obvious semantics agents trip on.

### Angular
Angular's official LLM best-practices file (angular.dev/assets/context/best-practices.md, v22) is mostly a list of banned older APIs:
- use standalone components, not NgModules, and "Must NOT set `standalone: true` … default in v20+"
- "Do NOT set `changeDetection: OnPush` … default in v22+"
- use `input()`/`output()` instead of `@Input`/`@Output` decorators
- use `@if/@for` instead of `*ngIf/*ngFor`
- no `ngClass`/`ngStyle`, no `CommonModule`, no `@HostBinding`
- use `inject()` instead of constructor injection
- prefer Signal Forms, signals for state, and `async` pipe for observables

Each changed default costs a rule in the file, because agents keep writing the old explicit form. The Angular CLI MCP server offers `get_best_practices`, `search_documentation`, `onpush_zoneless_migration`, and `devserver.start` / `devserver.wait_for_build`, which return build logs to the agent.

### Lit / web components
- Standard vs experimental decorators, and whether `accessor` is needed.
- `useDefineForClassFields`: with ES2022+ targets, class fields shadow the prototype accessors of reactive properties, so "setting the property won't trigger an element update".
- Three version- and config-dependent fixes exist.
- Good pattern: Lit's dev warnings link to short URLs such as `lit.dev/msg/class-field-shadowing` (verified: 301 redirect to the docs anchor).
- Decorators are ruled out anyway by the no-bundler constraint.

### Frameworks marketed as AI-friendly have the same class of trap
ArrowJS (1.0, Jun 2026) calls itself "the first UI framework for the agentic era". Its template expression slots are **static by default**, and only `${() => state.x}` is reactive. That is the same silent-staleness failure as Solid's forgotten function wrapper.

---

## 2. Training-data staleness and API churn

- **Version conditioning is weak.** GitChameleon 2.0 (ACL 2026): enterprise models reach only 48–51% on 328 version-conditioned problems.
- **Docs in context don't fully override the prior.** "When LLMs Lag Behind" (arXiv 2604.09515, Apr 2026) used 270 real API updates. 42.55% of generated code was executable without docs, and only 66.36% even when the updated spec was supplied. Old patterns persist against docs in context. Self-reflection added about 11%.
- **Deprecated APIs.** ICSE'25 study with 7 LLMs, 145 API mappings and 28,125 prompts found systematic use of deprecated APIs.
- **Rare APIs get hallucinated.** CloudAPIBench: GPT-4o makes only 38.58% valid calls to low-frequency APIs. Retrieval raises that to 47.94%, but a poor retriever cost 39.02 points on high-frequency APIs. Retrieval can hurt what the model already knew.
- **Package hallucination.** USENIX Sec '25 distinguished paper: 576k samples in Python and JavaScript. At least 5.2% of packages from commercial models and 21.7% from open models don't exist; 205,474 unique fake names.
- **Libraries that don't exist.** LibHalluBench (EMNLP 2026): one-character typos cause fake imports in up to 26% of tasks, fabricated library names are accepted in up to 99% of cases, and time-related wording ("a 2025 library") induces hallucination in up to 85%.
- **Popularity bias.** "LLMs Love Python" (ACL Findings 2026): models "prioritise familiarity and popularity over suitability", and use unneeded libraries in up to 45% of cases. In frontend this shows up as React bias (R. MacManus, Dec 2025: GPT-5's frontend guide picked Next.js, React and HTML "based on their popularity"). A new framework therefore starts with a strong prior pulling toward React idioms.
- **Industry response: ship version-matched docs in the package.**
  - Vercel eval, Jan 27, 2026, on Next 16 APIs absent from training data: baseline 53%; skill 53% (the skill was never invoked in 56% of runs); skill plus explicit instruction 79%; an **8 KB compressed docs index in AGENTS.md scored 100%** on build, lint and test. Their framing: move from "pre-training-led" to "retrieval-led" reasoning.
  - Next 16.2 (Mar 2026) bundles all docs as Markdown in `node_modules/next/dist/docs/`, and create-next-app writes AGENTS.md plus `CLAUDE.md` (`@AGENTS.md`).
  - 16.3 retired its "knowledge" skills in favor of these bundled docs.
  - The nextjs.org/evals leaderboard (Sept 22, 2026) shows the effect is largest for weaker models: Kimi K3 goes from 84% to 97% and Sonnet 5 from 81% to 97% with AGENTS.md. Frontier models are at 97% either way.
- **Formats.** AGENTS.md is now stewarded by the Agentic AI Foundation (Linux Foundation) and used by 60k+ repos. llms.txt (J. Howard, Sep 2024; v2 Aug 2026) is widely generated, including by Next, Angular and Claude Code docs, but it helps mostly for retrieval. Always-loaded context beats context the agent has to decide to fetch.

---

## 3. Properties that measurably help

**Types, checked by the stock compiler**
- Type-Constrained Code Generation (PLDI 2025) found that **94% of compile errors in LLM-generated TypeScript are type-check failures** and only 6% are syntax errors. Enforcing types during decoding cut compile errors by 75.3% (HumanEval) and 52.1% (MBPP), and raised functional correctness by 3.5–5.5% relative.
- GitHub Octoverse 2025: TypeScript became #1 on GitHub in Aug 2025 (2,636,006 monthly contributors, +66.6% YoY). GitHub ties the rise to typed languages making agent-assisted coding more reliable.
- **TypeScript 7.0** (native Go port; npm latest is 7.0.2, about 8–12x faster) ships **without a stable programmatic API**, which is expected in 7.1. Per InfoQ, template tooling for Vue, Svelte, Astro and Angular "cannot use it yet". Plain-TS function components get the fast checker today; template DSLs don't.

**My experiments (tsc 7.0.2, `--strict`)**
- **Tagged templates vs typed factory.** In a lit-style html\`\` tagged template, tsc saw none of these mistakes: `onClikc=…`, `disabled=${"yes"}`. A typed `h(tag, props)` factory keyed on `HTMLElementTagNameMap` caught all four: the misspelled event (TS2561, with a "did you mean" hint), `disabled: "yes"`, `valueAsNumber: "3"`, and the unknown tag `'buton'`.
- **Forgot to call a function-style signal `count: () => number`.** tsc catches:
  - `count + 1` (TS2365)
  - `if (flag)` and `flag ? a : b` (TS2774, "Did you mean to call it instead?")
  - `count === 0` (TS2367)
  - passing it where a `number` is expected

  It **misses** `` `${count}` ``, `"x" + count`, and `user.name`. That last one compiles because `Function.prototype.name` exists, so it is a silent bug.
- **Object-style `Ref<T>` with `.value`.** tsc catches `+` and `===` but misses template literals and `if (ref)`, since an object is always truthy.
- **Dev-mode traps close the gaps.** Overriding `Symbol.toPrimitive` and `name` on the signal function to throw with a fix message ("Signal "count" used as a value. Call it: count()") caught all three missed cases at runtime in Node.

**Feedback loops and actionable errors**
- Self-Debugging (Chen et al.): up to +12% with execution feedback.
- Claude Code's official guidance: "Give Claude a check it can run… Without a check it can run, 'looks done' is the only signal available."
- Anthropic's tool-writing guide: errors should "clearly communicate specific and actionable improvements, rather than opaque error codes", and meaningful names beat opaque IDs.
- Next 16.3 is the most complete production example:
  - Errors come with labeled fix menus (`[stream] [cache] [block]`), each with a URL to a per-error doc page written for agents (Patterns / Trade-offs / Gotchas).
  - A "Copy prompt" button.
  - The same structured text in terminal and CI.
  - The dev-server lock file prints PID, URL and `kill` command, because agents often start a second dev server.
  - Browser errors are forwarded to the terminal because agents "can't access a browser console".

**Runtime introspection as text**
- `next-browser`, since merged into `agent-browser` 0.27, exposes `react tree`, `react inspect <fiberId>`, render profiling and Suspense state as shell commands. Rationale from the 16.2 post: "An LLM can't read a DevTools panel, but it can run `next-browser tree`."

**Locality and explicit updates**
- Remix 3 (beta; the first principle was renamed to "Model-First Development" in PR #11925, Sep 22, 2026) drops hooks. A component is `function C(this: Handle){ let n=0; return () => … this.update() }`, so re-render is an explicit call.
- Its "Religiously Runtime" principle says designing for bundlers, compilers or typegen "leads to poor API design", and requires all tests to run without bundling.
- It ships an agent skill at `.agents/skills/remix/` that is copied into every scaffolded app.

**Greppability and naming**
- Anthropic's context-engineering guidance: agents navigate just in time with glob and grep, and "naming conventions … serve as intuitive signals".
- LLM code understanding degrades sharply when identifier names are removed (arXiv 2510.03178), and misleading names mislead models (Face/Off).
- Long context degrades performance non-uniformly (Chroma "Context Rot", 18 models, Jul 2025). A small surface that is always loaded beats a large one that has to be retrieved.

**No build step in the loop**
- Node 25 runs `.mts` directly by stripping types. Stack traces point at the original line and column without source maps, because ts-blank-space and Amaro replace types with whitespace in place.
- `enum` fails with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. TypeScript 5.8+ `--erasableSyntaxOnly` rejects enums, namespaces with runtime code, parameter properties and `import =`.
- Result: the file the agent edits is the file that runs, and error locations map one to one.

---

## 4. Projects marketed as AI-first or LLM-friendly (2025–2026)

**Remix 3 (beta)**
- Model-First as a core principle; runtime over build; its own component model forked from Preact with no hooks.
- Uses Web APIs (Request, Response, FormData).
- Ships AGENTS.md and a skill.
- Still uses JSX, so it needs a transform.

**ArrowJS 1.0 (Jun 15, 2026; about 3.5k stars)**
- 3 functions (`reactive`, `html`, `component`), under 5 KB, no build step.
- Claims the API "fits in less than 5% of a 200k token context window".
- Ships an agent skill (`npx @arrow-js/skill`).
- Its standout feature is a WASM (QuickJS) sandbox for running *untrusted AI-generated UI*. That targets generative UI at runtime, not agents writing app code.
- Weaknesses: tagged templates aren't type-checked; slots are static by default; the community reported bugs with nested reactivity and with state changes inside watchers.

**Next.js 16.2–16.3**
- Not AI-first by origin, but now the most advanced toolchain for agents: bundled docs, managed AGENTS.md block, MCP `get_compilation_issues`/`compile_route`, agent-browser React introspection, fix-prompt errors, and `.md` for every docs URL.

**Svelte**
- Official MCP server with autofixer, `llms.txt` variants, skills and subagents.

**Angular v22**
- `llms.txt`/`llms-full.txt`, a best-practices system prompt, rules files for each IDE, and a CLI MCP server.

**Vue**
- vuejs-ai/skills: an experiment that may move into the Vue org.

**Runtime generative-UI protocols (a different target)**
- Google A2UI (Dec 15, 2025): declarative JSON, "a flat list of components with ID references which is easy for LLMs to generate incrementally", and a trusted component catalog.
- Lightview cDOM/JPRX: JSON-only reactive UI. It also offers four different UI syntaxes, the opposite of having one way to do things.

**What these projects share:** small surface; no compiler, or a runtime-first design; agent docs shipped with the package; explicit updates or platform primitives. **What they don't do:** publish evals that prove the claim. Only Vercel (nextjs.org/evals, open repo `vercel/next-evals-oss`) and SvelteBench measure anything. The AI-first frameworks make design arguments without benchmarks.

---

## 5. Where agent priorities differ from human-programmer priorities (ranked)

1. **Version unambiguity and stable meaning of names.** Humans learn the current version once. Agents carry a frozen prior that blends every version, and it is only partly overridden by docs (66% executable even with updated docs). Once a name ships, its meaning should never change; new behavior gets a new name.
2. **No silent failures.** Humans see the broken UI. Agents mostly see only terminal text. Every likely misuse should be a type error or a dev-mode throw that names the fix. Destructuring, forgotten calls, static slots and Pages Router code in `app/` are all failures that pass the build.
3. **A check the agent can run beats human conveniences.** A deterministic headless test, typecheck, or structured runtime dump matters more than hot reload, visual devtools or pretty overlays.
4. **Types checked by the stock compiler, with no custom template language.** 94% of LLM compile errors are type errors. Template DSLs lose that signal: tagged templates entirely, and Vue/Svelte/Angular templates on TS 7 until 7.1.
5. **Explicit and local over concise and magical.** Agents don't mind verbosity or typing effort, but they pay heavily to simulate hidden behavior: re-render triggers, compiler rewrites, call-order rules, dev-only double invocation. The exception is explicitness that duplicates what the code already says and must be kept in sync by hand, like React dependency arrays. Agents let that drift and then suppress the lint.
6. **One canonical way, and no false friends.** Agents pick the most popular pattern and borrow APIs from nearby frameworks: `.set()`/`.value`/`$store` in Svelte 5; `className`/`useEffect` in Solid. Humans enjoy flexibility; for agents every alternative is a chance to mix idioms. Names should differ from popular frameworks' names unless the semantics match exactly.
7. **Context economy.** The API plus its rules should fit in about 8 KB of always-loaded text. Docs that are always present beat docs the agent must decide to fetch (100% vs 53–79%).
8. **Deterministic, synchronous semantics.** Read-after-write consistency (the TC39 Signals proposal: set is "immediately reflected" in dependent reads), predictable flush, and the same behavior in dev and prod. Humans can tolerate "it batches sometimes"; agents reason from code text alone.
9. **Greppability.** Unique, descriptive, prefix-namespaced identifiers; explicit imports instead of globals or string registration; routes and components discoverable with glob or grep.
10. **Runtime state as text.** The component tree, the signal graph, and why something updated, as JSON or CLI output instead of a DevTools GUI.

Lower priority for agents than for humans:
- terse syntax
- visual beauty of the API
- gradual learning curve
- size of the ecosystem

The popularity prior partly substitutes for ecosystem, but that same prior is also the main source of cross-framework bleed.


IMPLICATIONS
- No template DSL and no tagged templates. Build the DOM through typed factories keyed on HTMLElementTagNameMap, e.g. `h('button', {onclick, disabled}, ...)` or `button({...})`. Why: 94% of LLM TypeScript compile errors are type-check failures (PLDI 2025); in my tsc 7.0.2 test, html`` templates let 4 of 4 mistakes through and the typed factory caught all 4; and TS 7 has no programmatic API, so Vue/Svelte/Angular template tooling can't use it yet.
- Mark the reactive-vs-static split in types and syntax, and make the silent case loud. Reading a signal in a component's setup body outside a tracking scope should throw in dev unless it goes through an explicit `peek()`/`untrack()`. Why: stale static reads recur across frameworks (Solid destructuring and early returns, Vue destructuring, ArrowJS slots that are static by default).
- Add dev-mode coercion traps to signals: make `Symbol.toPrimitive`, `toString` and `name` throw with the fix text ("Signal 'count' used as a value. Call it: count()"). Why: tsc misses a forgotten call in template literals, string concat and `user.name` (Function.prototype.name). My Node experiment showed the traps catch all three.
- Prefer function-style getters (`count()`) over `.value` objects, or brand the object type. Why: tsc flags an uncalled function in a condition (TS2774, "Did you mean to call it?"), but `if (ref)` on an object is always truthy with no error. Record this trade-off in the spec.
- Pick one state primitive, one derived primitive and one effect primitive. Do not reuse popular names with different semantics: no `useEffect`, and no `ref`/`.value` unless it behaves exactly like Vue or Preact. Why: the Svelte autofixer catches `.set()`/`.update()`/`.value`/`$store` bleeding into $state, and the Solid agent kit bans React `className`/`useEffect` in Solid code.
- Signal writes must be visible to the next read synchronously; only effects and DOM flush in a microtask; provide `flush()` for tests. Why: the TC39 Signals proposal specifies synchronous set-then-get; Solid 2.0's read-after-flush model drew complaints that reactive values have to be treated differently from normal variables.
- No hooks, no call-order rules, no directives, no behavior that only happens in dev. A component function runs once and returns its view; updates come only from signals. Why: agents suppress rules-of-hooks and exhaustive-deps lints, 'fix' StrictMode double effects with ref guards (react.dev warns against this), and confuse 'use client' boundaries. Remix 3 removed hooks for the same model-first reason.
- No dependency arrays or anything else that duplicates the code and must be kept in sync by hand. Rely on automatic tracking plus dev-time detection of untracked reads. Why: React needed exhaustive-deps and compiler-powered lint rules, and AI code routinely disables them, which produces stale closures.
- Make list keys a required, typed argument, e.g. `each(items, item => item.id, render)`; allow index keys only through an explicit opt-in. Why: index keys and missing keys are a known silent bug class, and a required parameter turns the omission into a type error.
- Put all reactive, router and store logic in DOM-free modules that run directly under `node --test` on .ts files. Why: Node 25 strips types natively and stack traces map to the original line and column with no source maps (verified); agents need a check they can run headlessly (Claude Code best practices; Self-Debugging up to +12%).
- Support only TS 5.8+ `--erasableSyntaxOnly` with `--verbatimModuleSyntax`, and state it in the tsconfig the framework ships. Why: enums, namespaces, parameter properties and decorators fail under type stripping (Node gives ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX), and agents write these by habit.
- Give every dev error a stable code, a one-line fix, the component and file:line, and a URL to a per-error doc page written for agents (Patterns, Gotchas). Print the same text to the console, to test output and in a copyable prompt. Why: Next 16.3 fix menus and docs/messages pages, Lit's lit.dev/msg/* links, Svelte autofixer messages, and Anthropic's tool-writing guidance.
- Ship a runtime introspection API that returns JSON: `inspect()` for the component tree with source locations, the signal graph with subscribers, and a 'why did this update' trace. Expose it as a CLI or test helper and forward browser errors to the terminal. Why: next-browser and agent-browser's React tree exist because an LLM can't read a DevTools panel; Next 16.2 forwards browser errors because agents work through the terminal.
- Ship version-matched Markdown docs inside the npm package, plus an 8 KB or smaller AGENTS.md block, managed between markers, that points to them and says 'your training data is wrong about this framework'. Also publish llms.txt and a .md version of every doc page. Why: Vercel's eval scored 100% with an AGENTS.md docs index vs 79% for skills (skills went unused in 56% of runs); Next evals show weaker models jumping 13–16 points with it.
- Budget the whole public API so its reference plus rules fits in about 8 KB, and stay under that. Why: context rot (Chroma, 18 models), always-loaded context beating retrieved context, and ArrowJS's pitch that its API fits in under 5% of the context window.
- Never change what an existing export does. New semantics get a new name, and removed APIs stay as dev stubs that throw with the replacement name plus a codemod. Why: churn is the biggest measured failure (GitChameleon 48–51%; only 66% executable even with updated docs); Angular's best-practices file is mostly 'do NOT use the old thing'; Solid 2.0 needed a migration assistant.
- Use distinctive, prefixed, greppable export names and explicit imports only: no globals, no string-registered components, no file-name magic routes. Put the route table in one module. Why: agents navigate with grep and glob (Anthropic context engineering) and lean heavily on identifier names (arXiv 2510.03178); Remix: 'AI rewards frameworks with clear shapes: routes in one place'.
- From day 1, build a public eval harness modeled on nextjs.org/evals and SvelteBench: tasks with executable tests, run on several models with and without AGENTS.md, tracking which mistakes recur. Feed those mistakes back into types, dev errors and docs. Why: AI-first frameworks such as ArrowJS publish no evidence; Vercel and Svelte improved by measuring.

OPEN
- Does dropping JSX in favor of typed hyperscript factories cost agent fluency? JSX has a huge training prior, factories have almost none. This needs a head-to-head eval: the same tasks, several models, with and without AGENTS.md.
- Should signals be function getters, which get better tsc checks in conditions, or objects with `.get()`/`.value`, which get better checks on property access and are less likely to be confused with a plain function? My test shows each misses different mistakes. Dev traps close both, but only at runtime.
- Should the API deliberately copy a known signal API (Preact signals or the TC39 `Signal.State`/`get()`/`set()` shape) to borrow the training prior, or use distinct names to avoid false friends? It depends on whether semantics can match exactly, including batching and equality.
- How far should dev-mode checking go (untracked reads in setup, coercion traps, leaked effects) before it costs performance or produces false positives? Should it live in a separate dev build of the same files, which is hard without a bundler, or behind a runtime flag?
- TypeScript 7.0 has no stable programmatic API until 7.1. How much should the framework rely on custom lint or tsc plugins versus pure type-level enforcement plus runtime dev checks?
- What is the right size budget for the AGENTS.md block and bundled docs? Vercel's 8 KB index worked for Next.js; a much smaller framework might fit its entire API reference in always-loaded context.
- How does a no-bundler SPA get per-file type erasure in the browser without a build step (a dev server that strips types, pre-emitted .js next to .ts, or a service worker)? Which option keeps line and column identity so browser stack traces point at the source the agent edits?
- Can 'why did this update' and signal-graph introspection be exposed cheaply enough to keep on in dev, and in what text format works best for agents: JSON, or an indented tree with file:line?
- Frameworks marketed as AI-first publish no benchmarks. What eval task set would convincingly show the new framework beats React, Solid or Svelte for agents, rather than just claiming it?

SOURCES
- Vercel: AGENTS.md outperforms skills in our agent evals (Jan 27, 2026): https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
- Next.js 16.2: AI Improvements (Mar 18, 2026): https://nextjs.org/blog/next-16-2-ai
- Next.js 16.3: AI Improvements (Jun 26, 2026): https://nextjs.org/blog/next-16-3-ai-improvements
- Next.js Agent Evals leaderboard: https://nextjs.org/evals
- Vercel: Common mistakes with the Next.js App Router: https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them
- Remix: Wake up, Remix! (Remix 3 principles, May 28, 2025): https://remix.run/blog/wake-up-remix
- remix-run/remix README (Remix 3 beta, Model-First, Religiously Runtime): https://github.com/remix-run/remix
- Remix PR #11925: Use model-first development in guides: https://github.com/remix-run/remix/pull/11925
- OpenReplay: Why Remix 3 Is Designing for AI Coding Agents: https://blog.openreplay.com/remix-3-ai-coding-agents/
- Svelte AI tools overview: https://svelte.dev/docs/ai/overview
- sveltejs/ai-tools (MCP server, svelte-autofixer visitors): https://github.com/sveltejs/ai-tools
- Advent of Svelte 2025 Day 23: Svelte MCP: https://advent.sveltesociety.dev/2025/23
- SvelteBench: https://github.com/khromov/svelte-bench
- Angular: Develop with AI: https://angular.dev/ai/develop-with-ai
- Angular CLI MCP server: https://angular.dev/ai/mcp
- Angular LLM best-practices file: https://angular.dev/assets/context/best-practices.md
- React Compiler v1.0 (Oct 7, 2025): https://react.dev/blog/2025/10/07/react-compiler-1
- react.dev: Synchronizing with Effects (StrictMode double-invoke, ref-guard pitfall): https://react.dev/learn/synchronizing-with-effects
- react.dev: You Might Not Need an Effect: https://react.dev/learn/you-might-not-need-an-effect
- AI-Generated React Code, 9 Patterns That Fail in Production: https://theroadtoenterprise.com/blog/vibe-coding-vs-production-coding-react
- LogRocket: I shipped AI-generated React code: 4 bugs I fixed: https://blog.logrocket.com/generating-the-feature-with-an-ai-coding-assistant/
- DEV: Stop Fighting Framework Drift (AI assistants and Pages vs App Router): https://dev.to/pmpklabs/how-to-make-ai-coding-assistants-actually-useful-stop-fighting-framework-drift-36hm
- Vue: Reactivity Fundamentals: https://vuejs.org/guide/essentials/reactivity-fundamentals.html
- vuejs-ai/skills: https://github.com/vuejs-ai/skills
- vuejs-ai vue-best-practices reactivity reference: https://github.com/vuejs-ai/skills/blob/main/skills/vue-best-practices/references/reactivity.md
- SolidJS docs: Props: https://docs.solidjs.com/concepts/components/props
- solid2-agent-kit: https://github.com/lightsound/solid2-agent-kit
- Solid v2.0.0 RC discussion (Aug 13, 2026): https://github.com/solidjs/solid/discussions/2995
- InfoQ: SolidJS 2.0 Beta, deterministic batching (May 2026): https://www.infoq.com/news/2026/05/solidjs-2-async/
- Lit: Decorators: https://lit.dev/docs/components/decorators/
- Lit: Reactive properties (class field shadowing): https://lit.dev/docs/components/properties/
- ArrowJS homepage: https://arrow-js.com/
- InfoQ: ArrowJS reaches 1.0 (Jun 2026): https://www.infoq.com/news/2026/06/arrowjs-v1-agentic/
- KDnuggets: Is ArrowJS really the UI for the agentic era?: https://www.kdnuggets.com/is-arrowjs-really-the-ui-for-the-agentic-era
- Google: Introducing A2UI (Dec 15, 2025): https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/
- Lightview AI-GUIDANCE.md: https://github.com/anywhichway/lightview/blob/main/AI-GUIDANCE.md
- Type-Constrained Code Generation with Language Models (PLDI 2025): https://arxiv.org/abs/2504.09246
- LLMs Meet Library Evolution: Deprecated API usage (ICSE 2025): https://arxiv.org/abs/2406.09834
- On Mitigating Code LLM Hallucinations with API Documentation (CloudAPIBench): https://arxiv.org/abs/2407.09726
- GitChameleon 2.0: https://arxiv.org/abs/2507.12367
- We Have a Package for You! (USENIX Security 2025): https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen
- Library Hallucinations in LLM-Generated Code (LibHalluBench): https://arxiv.org/abs/2509.22202
- When LLMs Lag Behind: Knowledge Conflicts from Evolving APIs: https://arxiv.org/abs/2604.09515
- A Study of LLMs' Preferences for Libraries and Programming Languages (LLMs Love Python): https://arxiv.org/abs/2503.17181
- Teaching Large Language Models to Self-Debug: https://arxiv.org/abs/2304.05128
- When Names Disappear: Revealing What LLMs Actually Understand About Code: https://arxiv.org/abs/2510.03178
- Unreliable in Practice? A Comprehensive Study of Errors in LLM-Generated Code: https://arxiv.org/abs/2608.00661
- Generative Compilation: On-the-Fly Compiler Feedback: https://arxiv.org/abs/2607.13921
- GitHub Octoverse 2025: AI leads TypeScript to #1: https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/
- InfoQ: TypeScript 7.0 released: https://www.infoq.com/news/2026/08/typescript-7-released/
- TypeScript 5.8 release notes (--erasableSyntaxOnly): https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html
- bloomberg/ts-blank-space: https://github.com/bloomberg/ts-blank-space
- TC39 Signals proposal: https://github.com/tc39/proposal-signals
- Anthropic: Effective context engineering for AI agents: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic: Writing effective tools for agents: https://www.anthropic.com/engineering/writing-tools-for-agents
- Claude Code: Best practices: https://code.claude.com/docs/en/best-practices
- Chroma: Context Rot: https://www.trychroma.com/research/context-rot
- AGENTS.md: https://agents.md/
- llms.txt proposal: https://llmstxt.org/
- Richard MacManus: AI's React Bias vs Native Web: https://ricmac.org/2025/12/15/web-development-in-2025-ais-react-bias-vs-native-web/