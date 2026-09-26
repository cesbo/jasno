## 0. Method and data snapshot

Browser-support facts come from machine-readable sources queried on 2026-09-25, not from memory: `web-features@3.40.0` (Baseline status), `@mdn/browser-compat-data@8.1.3` (built 2026-09-24), and the webstatus.dev API. Where a claim affects the design, I also opened the MDN page. Latest stable releases in that data: Safari 27 (2026-09-14), Firefox 156 (2026-09-15), Chrome 153/154 (Sept 2026). I ran two experiments in the scratchpad:
- `/tmp/claude-1000/-home-and-ff/96b9f726-1e37-4313-9d48-852096c2ca84/scratchpad/rt/params.ts`: typed route params from a path template. It passes `tsc` 7.0.2 with `strict` and `erasableSyntaxOnly`, and runs directly under `node` 25 with native type stripping.
- `/tmp/claude-1000/-home-and-ff/96b9f726-1e37-4313-9d48-852096c2ca84/scratchpad/exp/index.html`: a Navigation API router, `@scope` inside a constructed stylesheet, a view transition and manual focus. Run in headless Chrome 153.

Note: npm `typescript@latest` is now **7.0.2**, the native Go compiler. Its `lib.dom.d.ts` already types `navigation`/`NavigateEvent` (including `precommitHandler`, `focusReset`, `scroll`), `URLPattern`, `CommandEvent`/`commandForElement`, `Scheduler` and `moveBefore`. It does not type `ariaNotify`, `CloseWatcher` or `ShadowRoot.referenceTarget`. It also declares `scheduler` as always present, but Safari has no Scheduler API. The types claim something the runtime does not have in Safari, so the code must feature-detect it.

## 1. Platform feature status (Sept 2026) and verdict

| Feature | Status | Versions C / F / S | Verdict for the framework |
|---|---|---|---|
| Navigation API | Baseline newly, 2026-01-13 | 102 / 147 / 26.2 | **Core foundation of the router.** No History-API fallback in v1. |
| `intercept({precommitHandler})` | Limited | 141 / 147 (addHandler 148) / Safari TP only | Not in v1. It is an Interop 2026 focus area, so shape the loader API so it can move into precommit later. |
| `NavigateEvent.sourceElement` / `hasUAVisualTransition` | available | 135/147/26.2 · 118/147/26.2 | Use. |
| URLPattern | Baseline newly, 2025-09-15 | 95 / 142 / 26 | **Core matcher.** Also a global in Node 25, so tests work too. |
| Same-document View Transitions | Baseline newly, 2025-10-14; `types` option 125/147/18.2 | 111 / 144 / 18 | Opt-in router flag. Element-scoped VT is Chrome 147 only, so avoid it. |
| Popover | Baseline newly, 2025-01-27 | 116 / 125 / 17 (iOS 18.3) | Use natively. `popover="hint"` is 151/153/TP, so not yet. |
| `<dialog>` | Baseline widely | – | Use. `requestClose()` is Baseline (2025-05-27). `closedby` is 134/141/Safari TP (Interop 2026), so treat it as progressive only. |
| Invoker commands (`command`/`commandfor`) | Baseline newly, 2025-12-12 | 135 / 144 / 26.2 | Use and document as the zero-JS way to open dialogs and popovers. |
| CSS nesting | Baseline **widely**, 2026-06-11 | 120 / 117 / 17.2 | Use freely. |
| `@scope` | Baseline newly, 2026-03-24 | 118 / 146 / 26.4 (`&` inside @scope needs C143) | **Recommended component-scoping story.** |
| Constructable stylesheets / `adoptedStyleSheets` | Baseline widely, 2025-09-27 | 73 / 101 / 16.4 | Core styling primitive. Works on `document`, so no shadow DOM is needed. |
| CSS module scripts (`import s from './a.css' with {type:'css'}`) | **Limited**: Safari blocks it | 123 / 147 / – | Avoid. The WebKit position is "support" (bug 227967) but it has not shipped. |
| JSON import attributes | Baseline newly, 2025-04-29 | 123 / 138 / 17.2 | OK. |
| Anchor positioning | web-features says "limited", but only because the `position-visibility: anchors-valid/anchors-visible` keywords are missing in C/F. Core `anchor-name`, `anchor()`, `position-area`, `position-try-fallbacks` are in all three since 2026-01-13 (C125–129/F147/S26). | – | OK for optional UI modules. Still an Interop 2026 carry-over for reliability. |
| Constraint Validation API | Baseline widely (2021) | – | **Core of the forms story.** |
| `:user-valid` / `:user-invalid` | Baseline widely, 2026-05-02 | 119 / 88 / 16.5 | Use for error styling. No "touched" state is needed. |
| Form-associated custom elements (`ElementInternals`) | Baseline widely, 2025-09-27 | 77 / 98 / 16.4 | Only needed for the optional custom-element interop adapter. |
| `AbortSignal.any()` | Baseline widely, 2026-09-19 | 116 / 124 / 17.4 | Core: combine the navigation signal, component-dispose signal and timeout. |
| `AbortSignal.timeout()` | Baseline newly, 2024-04-18 | 124 / 100 / 16 | Core. |
| `scheduler.yield()` / `postTask` | **Limited**, no Safari | 129 / 142 / – | Feature-detect and fall back to `setTimeout(0)` or a `MessageChannel` trick. |
| Custom elements, Shadow DOM | Baseline widely | – | See §2. Do not use as the component model. |
| Declarative Shadow DOM | Baseline widely, 2026-08-20 | 111 / 123 / 16.4 | Irrelevant, because SSR is a non-goal. |
| Scoped custom element registries | Limited | 146 / Firefox preview / 26 | Not v1. |
| Reference Target (cross-root ARIA) | Chrome 152 only; F/S behind flags; Safari "no signal" | – | Shadow DOM still breaks `aria-labelledby`/`for` across roots. This is a reason to avoid shadow DOM. |
| `ariaNotify()` | Baseline newly, **2026-09-14** | 141 / 150 / 27 | Use for route announcements, with a live-region fallback for Safari < 27. |
| `Element.moveBefore()` | Limited | 133 / 144 / – | Use in keyed-list moves when present (it preserves focus, iframes, animations, open popovers and dialogs), else `insertBefore`. |
| Trusted Types | Baseline newly, 2026-02-24 | 83 / 148 / 26 | The framework must work under `require-trusted-types-for 'script'`. |
| Import maps | Baseline widely, 2025-09-27; `integrity` 127/138/18; multiple maps 133/–/18.4 | – | Core of the no-bundler story. Use one import map only, because Firefox lacks multiple maps. |
| `<link rel=modulepreload>` | Baseline widely, 2026-03-18 | 66 / 115 / 17 | Router uses it for intent preloading. |

Features that are Chrome-only or Chrome+Firefox only and should be kept out of v1: `<template for>` (C150), Observable/`EventTarget.when` (C135), `setHTML`/Sanitizer (C146/F148), `CloseWatcher` (C126/F149; WebKit neutral), customizable `<select>` (C135/S27, no Firefox), soft-navigation entries (C151).

## 2. Should framework components be custom elements? No.

Evidence against using custom elements as the component model:
- Ryan Carniato ("Web Components Are Not the Future", Sept 2024) makes these points:
  - Elements are a subset of components.
  - The attribute-vs-property split needs `attr:`/`prop:`/`bool:` disambiguation everywhere.
  - Some events do not cross shadow roots, or report a retargeted target. Solid 1.9 doubled its event-delegation code for shadow DOM and still "falls flat for many cases".
  - Asynchronous upgrade means properties can be set before the class is defined, which "wreak[s] havoc on things like Reactivity tracking and Context APIs".
- Platform gaps as of Sept 2026:
  - ARIA ID references across shadow roots (Reference Target) ship only in Chrome 152.
  - Scoped registries are missing in stable Firefox.
  - `customElements.define()` is global and irreversible, which rules out HMR-style redefinition. This hurts the edit, reload and verify loop an agent runs.
- Style encapsulation is now available without shadow DOM: `@scope (root) to (limit)` plus `adoptedStyleSheets` on `document`. Verified in Chrome 153: with `@scope ([data-c="Card"]) to ([data-c]) { p { color: red } }`, a `<p>` owned by Card is red, and a `<p>` inside a nested `[data-c="Button"]` is not styled.

Recommendation: components are plain functions that return DOM nodes. Put an optional adapter module, `toCustomElement(Component, {props, formAssociated})`, in a separate package for embedding into non-framework pages (it uses `ElementInternals` for form participation). Never use shadow DOM by default.

## 3. Routing

**Foundation: one `navigate` listener, no `pushState`.** The Navigation API gives, for free:
- interception of links, forms, back/forward and programmatic navigations;
- an `event.signal` that aborts when the user presses Stop or a newer navigation starts;
- native loading indicators while the handler's promise is pending;
- `navigation.navigate(url)` returning `{committed, finished}` promises.

`finished` is exactly what a test or an agent needs to await deterministically. Verified in headless Chrome 153:
- Starting `/users/2` while the `/users/1` loader was pending aborted the first handler's signal.
- `n1.finished` rejected with `AbortError`.
- `n2.finished` resolved after render, with `document.title === "User 2"` and focus on the `<h1>`.

This gives race safety for loaders without extra code.

`intercept()` options (MDN): `focusReset` and `scroll` are each `"after-transition"` (default) or `"manual"`.
- The default focus reset goes to the first `[autofocus]` element or to `<body>`.
- The default scroll goes to the fragment or to the top on push/replace. On traverse/reload, scroll restoration is delayed until the handler fulfills and skipped if the user scrolled. Because the router awaits loaders and render inside the handler, back/forward scroll restoration happens after the DOM is ready, with no custom code.
- Skip interception when `!e.canIntercept || e.hashChange || e.downloadRequest !== null`.
- The initial page load fires no `navigate` event, so the router must match `location` on start.

**Matching:** URLPattern.
- Named groups `:id`, modifiers `? * +`, regex groups `:id(\\d+)`, and `{}` non-capturing groups.
- It is case-sensitive, and trailing slashes do not match unless you write `{/}?`.
- It has **no ranking**. The router must define precedence. Declaration order (first match wins) is the simplest rule and the easiest for an agent to predict.

**Typed params from path templates.** This works with TS template literal types and needs no codegen, which matters because file-based routing needs a generator and so conflicts with "no bundler". This is the verified core:
```ts
type Strip<S extends string> = S extends `${infer N}(${string})${infer R}` ? `${N}${R}` : S;
type Seg<S extends string> =
  S extends `:${infer N}?` ? { [K in N]?: string } :
  S extends `:${infer N}+` ? { [K in N]: string } :
  S extends `:${infer N}*` ? { [K in N]?: string } :
  S extends `:${infer N}` ? { [K in N]: string } : {};
type Split<S extends string> = S extends `${infer H}/${infer T}` ? Seg<Strip<H>> & Split<T> : Seg<Strip<S>>;
export type Params<P extends string> = { [K in keyof Split<P>]: Split<P>[K] } & {};
// route('/users/:id(\\d+)/posts/:postId?') -> { id: string; postId?: string }
```
The type-level parser handles only a subset of URLPattern syntax. The spec should **restrict path templates to that documented subset** (`:name`, `:name?`, `:name+`, `:name*`, `:name(regex)`) and add a dev-mode runtime assert that rejects anything else, so the types and the runtime never diverge. Unnamed `*` produces numeric groups (`{'0': ...}`), so require named splats. Search params are untyped strings in URLPattern, so typed search params need a validator (see §5, Standard Schema).

**Nested routes, loaders, lazy modules.**
- TanStack Router's lessons:
  - Child loaders run in parallel with parent loaders.
  - Keep the loader in the eager ("critical") route config and lazy-load only the component, error and pending views. In their words, "the loader is already an asynchronous boundary, so you pay double to both get the chunk *and* wait for the loader".
  - Default pending UI appears only after `pendingMs` = 1000 ms and then stays at least `pendingMinMs` = 500 ms.
  - Route data `staleTime` defaults to 0 for navigations and 30 s for preloads; `gcTime` defaults to 5 min.
- Recommended shape: `route(path, { load?: ({params, signal}) => Promise<T>, view: () => import('./x.ts'), title?: string | (data) => string, children? })`.
- The handler runs `Promise.all` over all matched `load`s and view imports, with `signal` = `AbortSignal.any([e.signal, ...])`.
- Redirects in v1: `navigation.navigate(to, {history:'replace'})` from inside a loader. Later, `precommitHandler` with `controller.redirect()`.
- Preloading without a bundler: on `pointerenter`/`focusin` of an `<a>` whose href matches a route, call `import()` on the view (and optionally warm the loader). Module-graph waterfalls are the main no-bundler cost; mitigate by injecting `<link rel=modulepreload>` for known deps.

**View transitions:** wrap only the DOM swap in `document.startViewTransition({update, types:['nav-forward'|'nav-back']})`. Skip it when `e.hasUAVisualTransition` is true (for example, the iOS swipe-back already animated), and respect `prefers-reduced-motion`. Keep it opt-in per router, because it snapshots the page and delays interactivity.

**Forms as navigations:** `NavigateEvent.formData` is non-null only for POST submissions. This enables Remix-style route `action`s with plain `<form method=post>`, with no JS glue beyond the router.

## 4. Data fetching and caching

Concepts to take from TanStack Query and SWR:
- **Keys:** hierarchical array keys. **Invalidation** by prefix, where `['todos']` matches `['todos',{page:1}]`, plus `exact` and a predicate. Invalidation "marks stale … overrides any staleTime" and refetches active queries.
- **TanStack Query defaults:** `staleTime` 0, `gcTime` 5 min, refetch on mount/window-focus/reconnect, 3 retries with exponential backoff, structural sharing.
- **SWR defaults:** `dedupingInterval` 2000 ms, `focusThrottleInterval` 5000 ms, `errorRetryInterval` 5000 ms, `keepPreviousData` false.
- **Cancellation:** the query function receives an `AbortSignal`. Consuming it means the query is cancelled and its state reverted when it becomes inactive or out of date.

Race rule for a fine-grained framework: every async derivation gets a signal that aborts when its inputs change or its owner is disposed, and a stale result must never be written. A pattern built into core (`resource(fn: (signal) => Promise<T>)`) eliminates the classic "out-of-order responses" bug. Agents write that bug often, because nothing in plain `fetch` code flags it.

Split:
- **v1 core:** an async primitive (`resource`/async memo) with `signal`, `loading`, `error`, `latest` (keep the previous value while revalidating) and `refetch`.
- **Optional module:** a keyed cache (dedupe, `staleTime`, `gcTime`, prefix invalidation, focus/reconnect revalidation, mutation plus optimistic rollback), around 1–2 kB.
- The router's `load` should accept a cache-aware function but not require one.

Solid 2.0 (beta May 2026, now RC) is a relevant precedent for a fine-grained framework. Async computations may return promises. `<Loading>` shows a fallback **only for the initial load**. Later refetches are exposed through `isPending(() => expr)` without unmounting the UI, which avoids Suspense-style flashing. `ErrorBoundary` was renamed `Errored`, `SuspenseList` became `Reveal`, and batching became deterministic microtask batching with explicit `flush()`.

## 5. Forms

- Prefer native, uncontrolled forms: a `<form>`, `FormData`, the Constraint Validation API (`required`, `pattern`, `min`, `setCustomValidity`, `reportValidity`) and `:user-invalid` styling (Baseline widely), which removes the need to hand-roll "touched" tracking.
- Controlled inputs are only for fields whose value drives other UI. The framework's reactive binding handles that without a form library.
- Typed form state: accept any **Standard Schema v1** validator (`schema['~standard'].validate(value) -> {value} | {issues: {message, path?}[]}`), with no validator dependency. Verified that zod 4.6.5, valibot 1.5.0 and arktype 2.2.5 expose `~standard`. For zod and valibot, an invalid email yields `path: ["email"]`.
- Optional module `form(schema, {onSubmit})`:
  - parses `FormData`;
  - validates;
  - maps `issue.path` to named controls;
  - calls `setCustomValidity(message)` so native UI, `:invalid` and screen readers all see the same error;
  - wires `aria-invalid`/`aria-describedby`;
  - focuses the first invalid field on submit.
- TanStack Form's design (types derived from `defaultValues`; onChange/onBlur/onSubmit validators; debounced async validators) is the reference for the scope a heavier module could have. That scope is not needed in v1.

## 6. Context / DI

- In fine-grained frameworks, context hangs on the reactive owner tree and is readable only synchronously during setup. It is lost across `await`.
- TC39 AsyncContext (Variable, Snapshot) is still **Stage 2**, so it is not usable.
- Recommendation:
  - `createContext<T>(defaultValue)`, with `provide(ctx, value, () => children)` and `use(ctx)`, valid only during synchronous component setup.
  - A dev-mode throw with an actionable message when called elsewhere.
  - An explicit `capture()` helper to reuse the owner after `await`.
- For app-wide singletons (API client, auth store), prefer plain ES module exports. They are greppable and explicit, and agents resolve them with go-to-definition instead of tracing providers.

## 7. Error boundaries and loading states

- Needed in core:
  - `catchError(fn, fallback(err, reset))` covering component setup, effects and rejected async derivations;
  - route-level `error` views;
  - a default root boundary that logs the component or route path.
- For loading:
  - initial-load fallback only (following Solid 2.0);
  - `pending` signals for refreshes;
  - a router-level `isNavigating` derived from `navigation.transition`/`navigatesuccess`/`navigateerror`.
- The browser already shows its native loading indicator during intercepted handlers. A pending UI with delay/min-duration thresholds (TanStack's 1000/500 ms) avoids flicker.

## 8. Document title and accessibility on route change

- Research: the Gatsby/Fable Tech Labs user testing (Marcy Sutton, 2019) covered screen reader, magnification, voice, keyboard and switch users.
  - Screen reader users found focusing a heading "the best experience".
  - Resetting focus to the top of the app was "very overwhelming".
  - Visible focus outlines guided magnifier, voice and keyboard users.
  - Final pattern: a small focused control or heading plus a live-region announcement of the page name.
- The Navigation API explainer notes that focusing a heading or wrapper beats the default `<body>` reset. It also says AT "will announce the start of the navigation, and its completion" for intercepted navigations. How well real screen readers do this is unverified.
- Evidence that agents will not add this themselves: the W4A 2025 study on LLM-generated UI found critical WCAG violations even with accessibility-oriented prompts.
- Therefore core router defaults:
  - `focusReset:'manual'`;
  - after render, set `document.title` from the route;
  - focus the route's `[autofocus]`, else its first `h1` (with `tabindex=-1` added), else `<main>`;
  - announce the title via `document.body.ariaNotify(title)`, falling back to a visually hidden `aria-live=polite` region;
  - skip the focus move on same-path search/hash changes (for example, filter UIs);
  - keep `scroll:'after-transition'`.
- Head: in a client-only SPA only `document.title` matters. Meta tags matter for SEO/SSR, which is a non-goal, so ship no head manager.

## 9. Styling without a bundler

A `css` tagged template in a `.ts` module builds a `CSSStyleSheet` (`replaceSync`), deduplicated per module and adopted into `document.adoptedStyleSheets`. Authors write `@scope ([data-c=Name]) to ([data-c]) { ... }` with native nesting. The framework stamps `data-c` on a component's root element. Plain `<link rel=stylesheet>` also works. Do not rely on CSS module scripts until Safari ships them.

## 10. v1 core vs optional modules

**Core:**
- The router (Navigation API + URLPattern; nested routes, parallel `load` with signals, lazy `view`, title, focus/announce, scroll via the platform, POST actions via `formData`, typed params, opt-in view transitions).
- The async resource primitive.
- Context.
- Error and loading boundaries.
- A `css` helper (about 10 lines).
- Small ambient `.d.ts` additions (`ariaNotify`).

**Optional modules:**
- `query` (keyed cache/invalidation).
- `form` (Standard Schema binding).
- `custom-element` adapter.
- Scroll restoration for nested scroll containers, keyed by `navigation.currentEntry.key`.

**Leave to the platform, with no wrappers:** dialog, popover, invoker commands, anchor positioning, constraint validation. Ship docs and examples only. Every framework wrapper would be more API for agents to learn, and more places for them to get it wrong.

IMPLICATIONS
- Build the router directly on the Navigation API (Baseline newly 2026-01-13: Chrome 102, Firefox 147, Safari 26.2) with no History-API fallback. One `navigate` listener, and `event.signal` is passed to every loader. Verified in Chrome 153: a superseded navigation aborts the old loader's signal and rejects its `finished` with AbortError, which gives race-free loaders for free.
- Make `navigation.navigate(url).finished` (or a router wrapper that returns it) the documented way to await 'navigation rendered' in tests and agent verification scripts. It resolves only after the intercept handler has loaded data and rendered.
- Use URLPattern (Baseline 2025-09-15) as the matcher, with declaration-order precedence, because URLPattern has no ranking. Restrict path templates to a subset (`:name`, `:name?`, `:name+`, `:name*`, `:name(re)`) that the TS template-literal `Params<P>` type parses exactly. Add a dev-mode assert that rejects anything else so types never diverge from runtime (verified with tsc 7.0.2 plus erasableSyntaxOnly).
- Routes are code, not files. File-based routing needs a generator, which conflicts with 'no bundler'. A single typed route table is also easier for agents to read and edit.
- Keep `load` in the eager route config and lazy-import only `view`. Run all matched loaders and view imports with Promise.all (TanStack Router's critical vs non-critical split avoids the double async boundary). Add intent preloading on pointerenter/focusin via `import()` and `<link rel=modulepreload>` (Baseline widely 2026-03-18) to counter unbundled module waterfalls.
- Design the loader API so it can later run in `intercept({precommitHandler})`: Chrome 141 and Firefox 147 have it, Safari only in Technology Preview, and it is an Interop 2026 focus area. In v1, loaders run post-commit and redirects use `navigation.navigate(to,{history:'replace'})`.
- Route-change accessibility is on by default in core, because LLM-generated UI code has critical WCAG violations even when prompted for accessibility (W4A 2025). Use focusReset:'manual'; set document.title; focus [autofocus], else h1[tabindex=-1], else main (heading focus rated best in the Gatsby user testing); announce via ariaNotify (Baseline 2026-09-14) with an aria-live fallback; skip the focus move on search/hash-only changes; keep scroll:'after-transition' so back/forward restoration happens after render.
- Components are plain functions, not custom elements, and use no shadow DOM by default. Cross-root ARIA (Reference Target) ships only in Chrome 152, scoped registries are missing in Firefox stable, `customElements.define` is irreversible (so no hot redefinition), and there are prop/attr and event-retargeting problems. Offer an optional `toCustomElement` adapter using ElementInternals (Baseline widely) for embedding.
- Styling: a `css` tagged template builds a constructable stylesheet (Baseline widely 2025-09-27) adopted on document, with `@scope ([data-c=X]) to ([data-c])` donut scoping (Baseline 2026-03-24; verified in Chrome 153) and native nesting (Baseline widely 2026-06-11). Do not depend on CSS module scripts, because Safari lacks `with {type:'css'}`.
- Put an async primitive in core (`resource(fn(signal))` with loading/error/latest/refetch), where the signal aborts on input change or dispose and stale results are dropped. Show a loading fallback only on the initial load and expose `pending` for refreshes (following Solid 2.0's Loading/isPending). Put a keyed cache with prefix invalidation, staleTime/gcTime, dedupe and focus revalidation in an optional `query` module.
- Forms: native first (FormData, Constraint Validation, :user-invalid, all Baseline widely). Route actions come from `NavigateEvent.formData` for POST forms. An optional `form` module accepts any Standard Schema v1 validator (zod 4.6.5, valibot 1.5.0 and arktype 2.2.5 verified to expose `~standard`) and maps issue.path to setCustomValidity plus aria-invalid, with no validator dependency.
- Do not wrap dialog, popover, invoker commands (Baseline 2025-12-12) or anchor positioning in framework components. Document the native patterns instead. `closedby`, `popover=hint` and CloseWatcher are not in Safari stable, so use them only as progressive enhancements.
- Feature-detect APIs that TS 7 lib.dom types as always present but Safari lacks: `scheduler.yield` (C129/F142, no Safari) and `moveBefore` (C133/F144, no Safari). Ship a tiny ambient .d.ts for `ariaNotify`, which TS 7.0.2 lib.dom lacks.
- Stay Trusted-Types-safe (Baseline 2026-02-24). Never route dynamic strings through innerHTML. If template cloning uses innerHTML for static markup, create it through a named TT policy.
- Context: `createContext`/`provide`/`use`, valid only during synchronous setup, with a dev-mode throw that carries a fix-it message, plus an explicit `capture()` for use after await. AsyncContext is still TC39 Stage 2. Recommend plain module exports for app-wide singletons.

OPEN
- Do real screen readers (VoiceOver in Safari 26.2+, NVDA in Firefox 147+, JAWS) actually announce intercepted Navigation API navigations as the explainer says? If so, the ariaNotify announcement could cause double announcements. This needs manual AT testing before the default is fixed.
- Should v1 support Safari < 26.2 or Firefox < 147 (no Navigation API) with a History-API shim, or state minimum versions of Chrome 102 / Firefox 147 / Safari 26.2? That depends on the target audience's iOS update lag, since devices stuck on iOS 18 never get it.
- When Safari ships precommitHandler (Interop 2026), should loaders move pre-commit (URL changes only when data is ready, like MPA behavior) or stay post-commit (instant URL plus pending UI)? This is a UX decision that affects the loader and redirect API.
- What is the no-bundler production performance of deep route module graphs, measured as the waterfall cost of unbundled imports with modulepreload vs a bundled baseline? It needs a benchmark on a realistic app (for example 200 modules) over HTTP/2 and HTTP/3.
- Precedence rule for overlapping routes: is plain declaration order enough, or is a specificity sort (static > param > splat) worth the extra rule for agents to learn?
- Should the query/cache module be first-party in v1 or deferred? Most SPAs need invalidation after mutations, but the core resource primitive plus router loaders may cover simple apps.
- How much of the TypeScript path-template parser should be supported? Search params need validation too, via Standard Schema or plain parse functions. Which does the router accept without adding a dependency?

SOURCES
- MDN: Navigation API: https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API
- MDN: NavigateEvent.intercept(): https://developer.mozilla.org/en-US/docs/Web/API/NavigateEvent/intercept
- MDN: Navigation.navigate(): https://developer.mozilla.org/en-US/docs/Web/API/Navigation/navigate
- MDN: NavigateEvent.formData: https://developer.mozilla.org/en-US/docs/Web/API/NavigateEvent/formData
- web.dev: Navigation API is now Baseline Newly Available: https://web.dev/blog/baseline-navigation-api
- Ollie Williams: The navigate event (precommitHandler support): https://olliewilliams.xyz/blog/the-navigate-event/
- WICG Navigation API explainer: https://github.com/WICG/navigation-api/blob/main/README.md
- webstatus.dev API: Navigation API: https://api.webstatus.dev/v1/features/navigation
- web-features (npm, v3.40.0): https://www.npmjs.com/package/web-features
- @mdn/browser-compat-data (npm, v8.1.3): https://www.npmjs.com/package/@mdn/browser-compat-data
- MDN: URL Pattern API: https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API
- MDN: Using the View Transition API: https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using
- MDN: Invoker Commands API: https://developer.mozilla.org/en-US/docs/Web/API/Invoker_Commands_API
- MDN: Using the Popover API: https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using
- MDN: @scope: https://developer.mozilla.org/en-US/docs/Web/CSS/@scope
- MDN: Element.ariaNotify(): https://developer.mozilla.org/en-US/docs/Web/API/Element/ariaNotify
- MDN: Scheduler.yield(): https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield
- MDN: Element.moveBefore(): https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore
- Web features explorer: CSS import attributes: https://web-platform-dx.github.io/web-features-explorer/features/css-modules/
- Web features explorer: Anchor positioning: https://web-platform-dx.github.io/web-features-explorer/features/anchor-positioning/
- WebKit: Announcing Interop 2026: https://webkit.org/blog/17818/announcing-interop-2026/
- Chrome Platform Status: Reference Target for Cross-root ARIA: https://chromestatus.com/feature/5188237101891584
- Ryan Carniato: Web Components Are Not the Future: https://dev.to/ryansolid/web-components-are-not-the-future-48bh
- Gatsby: What we learned from user testing of accessible client-side routing: https://www.gatsbyjs.com/blog/2019-07-11-user-testing-accessible-client-routing/
- When LLM-Generated Code Perpetuates UI Accessibility Barriers (W4A 2025): https://mintviz.usv.ro/publications/2025.W4A.3.pdf
- TanStack Query: Important Defaults: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- TanStack Query: Query Invalidation: https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
- TanStack Query: Query Cancellation: https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation
- SWR API options: https://swr.vercel.app/docs/api
- TanStack Router: Data Loading: https://tanstack.com/router/latest/docs/framework/react/guide/data-loading
- TanStack Router: Code Splitting: https://tanstack.com/router/latest/docs/framework/react/guide/code-splitting
- React Router: Data Loading: https://reactrouter.com/start/data/data-loading
- InfoQ: SolidJS 2.0 Beta, first-class async and reworked Suspense (May 2026): https://www.infoq.com/news/2026/05/solidjs-2-async/
- TC39 AsyncContext proposal: https://github.com/tc39/proposal-async-context
- Standard Schema: https://standardschema.dev/
- Standard Schema spec repository: https://github.com/standard-schema/standard-schema
- TanStack Form overview: https://tanstack.com/form/latest/docs/overview