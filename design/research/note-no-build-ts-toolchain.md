# Running TypeScript SPA code in browsers without a bundler: state as of 2026-09-25

Method: I opened every page cited below. I also ran experiments in the scratchpad with Node v25.1.0, TypeScript 7.0.2 and 6.0.3, amaro 1.2.1, ts-blank-space 0.9.0, esbuild 0.28.2, oxc-transform 0.151.0, headless Chromium 153 via playwright-core 1.63, @mdn/browser-compat-data 8.1.3 (dated 2026-09-24) and web-features 3.40.0.

**Benchmark caveat:** the machine has 2 vCPUs, and unrelated processes from another session kept both cores near 100% the whole time. Treat absolute timings as inflated. Only the ratios and how things scale are meaningful.

## 1. The language layer

### TC39 Type Annotations ("types as comments")
- It is still **Stage 1**. Champions: Rosenwasser, Cintra, Palmer. The stage-1 list says it was **last presented in 2023-09**, and the README says it "has not been updated regularly". Nothing will run natively in browsers within the v1 horizon.
- The proposal leaves out enums, namespaces, parameter properties and JSX. Several things are marked "up for debate": `declare`, overloads, and the class modifiers `abstract/private/protected/public/readonly/override`. Syntax for generic call-site arguments is still being discussed (possibly `::`). A framework that wants to stay compatible with a future native syntax should avoid all of these as well as the plain non-erasable features. Use `#private`, not `private`.

### TypeScript 5.7–7.0 flags that matter
- **5.7 `rewriteRelativeImportExtensions`**: rewrites `./x.ts` to `./x.js` in emitted output. It does not touch bare specifiers, `paths`, `#imports` or specifiers without an extension. When I tested TS 7.0.2, a non-literal `import(\`./${name}.ts\`)` produced an injected `__rewriteRelativeImportExtension` helper (about 8 lines) at the top of the file. So tsc emit is **not** "source minus types".
- **5.8 `erasableSyntaxOnly`**: errors (TS1294) on `enum`, `namespace` with runtime code, parameter properties, `import =` and `export =`. In TS 7.0.2 it also flags angle-bracket assertions `<T>x`, which matches Node's parser. It does **not** flag standard decorators. Decorators are valid JS, but no browser ships them; BCD has no entry for them. My test file with `@dec class C {}` passed tsc and then threw a SyntaxError in V8.
- **`verbatimModuleSyntax`** is the flag that actually prevents a runtime failure. The strippers happily turn `import { T } from './m.ts'` (T is a type) into valid-looking JS. At link time Node then fails with `SyntaxError: The requested module './m.ts' does not provide an export named 'T'`, and a browser fails the same way. tsc catches it as TS1484, and a re-exported type as TS1205. A stripper is not a checker, so **tsc --noEmit is the gate**.
- **`isolatedDeclarations`** (5.5): TS 7 supports it. `tsc --emitDeclarationOnly --isolatedDeclarations` works, but in TS 6/7 it needs an explicit `rootDir` (error TS5011 otherwise, because of the new 6.0 default). Use it to produce the framework's own `.d.ts` files per file.
- **`allowImportingTsExtensions`** requires `noEmit` or `emitDeclarationOnly`. That fits: tsc only checks, and something else strips.

### TypeScript 6.0 and 7.0 status
- **6.0** shipped 2026-03-23 as the last release built on the JS codebase. New defaults: `strict:true`, `module:esnext`, `target:es2025`, `types:[]`, `rootDir:.`, `noUncheckedSideEffectImports:true`. `lib.dom` now includes `dom.iterable`. Deprecated: `baseUrl`, `moduleResolution node10/classic`, `outFile`, `target es5`, and import assertions (`assert`, replaced by `with`).
- **7.0 (the Go port, "Corsa")** shipped **2026-07-08**. npm `typescript@7.0.2` was current on 2026-09-25. The binary is still called `tsc`. The team reports full builds 7.7–11.9x faster (VS Code 125.7s to 10.6s) and 10.6–16.7x with `--checkers 8`. The 6.0 deprecations are now hard errors. There is **no stable programmatic API until 7.1**, so Vue/Svelte/Astro/Angular tooling and anything built on the TS JS API still needs 6.x. The side-by-side package is `@typescript/typescript6` (bin `tsc6`).
- JSDoc handling got narrower in 7.0. Closure-style function types, `@enum`, `@class`/`@constructor`, constructor functions and standalone `?` are gone (per the typescript-go CHANGES.md).
- My timings (contended machine): a synthetic 500-module project checked in **1.1s with tsc 7** versus **5.1s with tsc 6**, using 88 MB versus 300 MB of memory. Even a 2-file project took about 1.4s, mostly loading `lib.dom`.
- **Install gotcha:** I installed `typescript@7` and `@typescript/typescript6` together. The latter depends on `@typescript/old` = `npm:typescript@^6`, whose bin also claimed `node_modules/.bin/tsc`, so `npx tsc` printed **6.0.3**. `ts-blank-space` separately pulls in its own copy of TS ≤6.0.x (8.8 MB `typescript.js`).

## 2. Server-side runtimes
- **Node.js**:
  - Type stripping is on by default since v23.6 and v22.18, no longer warns since v24.3 and v22.18, and is **Stability 2 (Stable) since v25.2 and v24.12**.
  - v26.0.0 removed `--experimental-transform-types`. Node 26 is Current (released 2026-05-05). Node 24 "Krypton" is LTS. v25 went EOL on 2026-03-31.
  - It replaces types with whitespace, so positions are preserved and there are no source maps. It ignores tsconfig. Explicit `.ts` extensions and `import type` are required. Enums, namespaces with runtime code, parameter properties, import aliases and decorators are unsupported. `.tsx` is unsupported, and Node refuses to strip anything under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, which I confirmed).
  - The underlying engine is amaro, a wrapper around `@swc/wasm-typescript` (`process.versions.amaro` is 1.1.4 on v25.1).
  - The public API `module.stripTypeScriptTypes()` is Stability 1.2 (Release Candidate), and Node warns its output "should not be considered stable across Node.js versions". v26 dropped its `transform` and `sourceMap` options.
  - **Gotcha I found:** npm 11's `npm init -y` writes `"type": "commonjs"`. With that field, Node does **not** run ESM syntax detection on `.ts` files, and they fail with "Cannot use import statement outside a module". With no type field, or `"type":"module"`, they work.
- **Deno** strips types and runs them in V8. Imports must use real `.ts` extensions, and type checking is opt-in (`deno check`).
  - Deno 2.8 (2026-05-22) added `deno transpile`: one output file per input, `.ts` becomes `.js`, and import extensions are rewritten. Source maps are optional.
  - `deno bundle` is experimental and built on esbuild. Deno has no built-in dev server that strips per request.
- **Bun**: `bun ./index.html` always bundles, with no unbundled mode. `Bun.Transpiler.transformSync(code)` could strip per request, but it reprints the code, and the docs say nothing about positions or source maps.

## 3. Ways to get TypeScript into the browser without bundling

### Stripper comparison (my tests)
All three position-preserving strippers produced byte-identical output on my test file. esbuild and oxc reprint the code; they changed the line count (19 to 24/25) and dropped the blank-line and comment layout.

Time to strip a 151 KB, 7.6k-line file (contended machine):

| Stripper | ms/run | Positions preserved | Dependency |
|---|---|---|---|
| oxc-transform | 14 | no | native |
| amaro strip-only | 41 | yes | 3.7 MB JS with inlined wasm |
| `node:module` stripTypeScriptTypes | 43 | yes | none (built in) |
| esbuild transformSync | 83 (includes IPC) | no | native |
| ts-blank-space | 102 | yes | TS ≤6.0 parser, 8.8 MB |

A typical 2–10 KB file strips in well under 5 ms with any of them, so per-request stripping is cheap.

### (1) tsc per-file emit (`tsc --watch`)
- Output does not keep positions: type-only lines vanish and code is reformatted, so you need source maps.
- The import rewriting and injected helper break "source minus types".
- You get a second copy of every file in `dist/`. Agents can edit or read that stale copy, and there is a race between saving a file and the emit finishing.
- Verdict: not suitable when the strict constraint applies.

### (2) Dev server that strips types per request (recommended)
The browser only checks the MIME type, not the file extension. So `/src/x.ts` can be served as `text/javascript` with the types blanked out, and the URL is exactly the repo path.

I built a zero-dependency Node server of about 45 lines (`scratchpad/devserver/serve.ts`): `node:http`, `stripTypeScriptTypes`, `fs.watch` plus an SSE live-reload snippet, and a path-traversal guard. Strip errors come back as a module that throws `SyntaxError("/src/bad.ts: TypeScript enum is not supported in strip-only mode")`, so they show up in the browser console. I checked it with curl.

Choice of stripper:
- The Node built-in has no dependencies.
- For deterministic production output, pin `amaro` (the same engine) instead.
- ts-blank-space uses the official TS parser but is tied to TS ≤6.0 until the 7.1 API lands. It also documents cases where it has to adjust ASI and parentheses.

### (3) Service Worker that strips on fetch
- It is feasible. Module service workers are supported in Chrome 91, Firefox 147 and Safari 15, and amaro runs in the browser: es-module-shims ships it as `es-module-shims-typescript.js`, **4.77 MB raw / 1.58 MB gzip**, in strip-only mode.
- Drawbacks:
  - The first load isn't controlled by the worker until a reload or `clients.claim()`.
  - **Shift-reload bypasses the service worker entirely** (web.dev), which would serve raw `.ts`.
  - Stale workers are a classic source of debugging confusion.
  - Playwright's page-level `route()` cannot intercept requests the worker handles.
- Verdict: an optional "zero-install preview" at most, never the default.

### (4) JSDoc-typed `.js` checked by tsc (Svelte's approach)
- This is literally "running code = source". Rich Harris (2023) cited no build step and easier debugging. An issue asking Svelte to move back to TS (#16647, Aug 2025) was closed as not planned.
- Costs:
  - It is verbose (`@template`, `@import`, `@overload`, `@satisfies`).
  - TS 7 narrowed JSDoc support.
  - It conflicts with the requirement that TypeScript is the primary language.
  - LLM training data leans heavily toward inline TS syntax. That last point is my inference, not something I measured.

### (5) Other loaders
- **es-module-shims 2.8.4** in shim mode or with `lang="ts"` strips `.ts` in the browser using the amaro bundle above. It also offers `import.meta.hot` HMR. It's fine for prototypes, but it downloads about 1.6 MB.
- **`jspm serve` (JSPM 4)**: a static server plus type stripping plus hot reload through an injected import-map script and SSE.
- **`esm.sh/tsx`**: in-browser TSX compilation, prototype only.

## 4. Platform features (BCD 8.1.3; browser status: Chrome 154 current, Firefox 156, Safari 27 released 2026-09-17)

| Feature | Chrome | Firefox | Safari | Baseline |
|---|---|---|---|---|
| Import maps | 89 | 108 | 16.4 | Widely available since 2025-09-27 |
| Import map `integrity` | 127 | 138 | 18 | Shipped in all three |
| **Multiple import maps** | 133 | 150, **behind the `dom.multiple_import_maps.enabled` pref** | 18.4 | **Not Baseline** |
| modulepreload | 66 | 115 | 17 | Widely available since 2026-03-18 |
| JSON modules (`with {type:'json'}`) | 123 | 138 | 17.2 | Newly available since 2025-04-29 |
| **CSS module scripts** | 123 | 147 (2026-01-13) | **no** | Not Baseline |
| Text modules (`type:'text'`) | 155 (beta, stable 2026-10-06) | 153 | no | No |
| Top-level await | | | 27 | Newly available only since **2026-09-14** |
| zstd | 123 | 126 | 26.3 | Newly available since 2026-02-11 |
| Compression dictionaries (dcb/dcz) | 130 | preview | no | No |
| HTTP/3 | | | | Newly available since 2024-09-16 |

- Import map rules from MDN:
  - The map must be inline; `src` is not allowed.
  - It applies to static and dynamic imports.
  - It does **not** apply to a `<script src>` attribute, or to modules loaded in workers or worklets.
  - Keys can be URL-like (`/src/x.ts`) and are matched against the resolved URL.
  - When several maps are present, entries that were already resolved or already mapped are dropped.
- Top-level await only became Baseline in Safari 27 because Safari's module loader was rewritten "to fix top-level await". On Safari 26 and earlier, avoid top-level await outside the entry module.
- `modulepreload as=json` is Chrome 147 and Safari 26.2 only.
- TS 7 types JSON imports from the file contents (`resolveJsonModule`). I confirmed it catches `const t: number = data.title`. CSS imports need `declare module '*.css' { const s: CSSStyleSheet; export default s }`.

## 5. Performance of ES modules without a bundler
- **Chrome bottleneck analysis (2018):** moment.js (104 modules) took 173 ms unbundled with modulepreload versus about 90 ms bundled. three.js (333 modules) took 355 ms versus about 290 ms. The costs were round trips, IPC per request, and O(N²) progress tracking.
- **V8 (2018):** "continue using bundlers before deploying modules to production". Unbundled is acceptable below "a few hundred" fine-grained modules.
- **Rolldown:** about 100 concurrent streams per connection is the typical default (nginx `http2_max_concurrent_streams` defaults to **128**). Thousands of modulepreload tags are themselves a cost. Minification plus brotli works much better on a bundle. nginx `http2_push` has been obsolete since 1.25.1; use 103 Early Hints instead.
- **Vite 8.1 (2026-06-23):** added experimental bundled dev mode. On a 10,000-component app it gave about 15x faster startup and 10x faster reloads. Linear saw 10x fewer requests.
- **37signals:** HEY has run on import maps since January 2022, with about 5k lines of JS. importmap-rails uses digested file names in the map and modulepreload by default, and vendors packages from JSPM into `vendor/javascript`. DHH's "No Build" post (2023-10-11) offers no numbers.
- **My measurements (headless Chromium 153, contended VM; latency simulated with a server-side delay per response):**
  - A single bundle took 90–190 ms regardless of module count N.
  - Unbundled over HTTP/2:

    | N | Unbundled (ms) | With modulepreload (ms) |
    |---|---|---|
    | 50 | 443–637 | 368–431 |
    | 150 | 985–1116 | 835–939 |
    | 300 | 1657–1787 | 1691–1851 |
    | 1000 | 5311–5874 | 4988–5398 |

  - Flat trivial modules gave the same slope over HTTP/1.1 and HTTP/2: about **4.5–5.5 ms per module cold** and **about 0.5 ms per module with a warm HTTP cache** (1000 modules: about 4.6 s cold versus about 0.5 s warm).
  - On a saturated low-core machine, which is a reasonable stand-in for low-end phones, the fixed cost per module outweighs round trips. The budget has to be on module count, not only bytes.
- **Byte cost (brotli 11):**
  - Lit's 42 source files: source minus types sent as separate files = 56.2 KB, concatenated = 41 KB (+37% for separate files), minified bundle = 10 KB.
  - For three comment-heavy files, blanking comments while keeping positions cut brotli size by 32% (30.7 KB to 20.8 KB) and left line:col unchanged.

## 6. npm dependencies without a bundler
- **esm.sh**: npm packages as ESM over a CDN, with `?target`, `?bundle`, `?standalone`, `?external`, `?deps` and `?alias`. Types come via the `X-TypeScript-Types` header. It can be self-hosted.
- **JSPM 4**: `jspm install` generates the import map from package.json. Providers include jspm.io, `nodemodules`, esm.sh, unpkg and jsdelivr. `--integrity --preload --out index.html` writes the map into the HTML. It injects the map from a JS file, which relies on multiple-import-map support.
- **Vendoring**: download ESM files into the repo (the importmap-rails model), map them in the import map with integrity, and point tsconfig `paths` at the types.
- **Framework's own package**: must publish JS plus `.d.ts`. Node won't strip `.ts` inside node_modules, and tsc **reports type errors in `.ts` files inside node_modules** using the consumer's settings (I confirmed).

## 7. Recommended toolchain (strict: running code = source minus types)

**Source rules**
- ESM `.ts` files with explicit `./x.ts` imports.
- `package.json` must contain `"type":"module"`.
- tsconfig does type checking only:
```json
{"compilerOptions":{"target":"es2025","module":"esnext","moduleResolution":"bundler","lib":["es2025","dom"],"types":[],
 "strict":true,"noEmit":true,"allowImportingTsExtensions":true,"erasableSyntaxOnly":true,"verbatimModuleSyntax":true,
 "isolatedModules":true,"resolveJsonModule":true,"skipLibCheck":true},"include":["src"]}
```
- Plus lint bans that tsc doesn't cover: decorators and `accessor`, `using` (Safari lacks it), top-level await outside the entry module, and TS class modifiers (use `#private`).

**Dev**
- The framework's `dev.ts` server (Node ≥24.12 or ≥25.2, zero dependencies) serves `/src/*.ts` stripped per request as `text/javascript` with `no-store` and SSE reload.
- Run `tsc --noEmit` (TS 7), in watch mode or on demand after each edit.
- No source maps: browser line:col equals the file line:col.

**Production (`deploy.ts`, prototype in `scratchpad/deploy/deploy.ts`, verified in Chromium 153)**
- Each file `src/a/b.ts` becomes `dist/src/a/b.js` = strip(source), byte for byte. I diffed them to confirm.
- One inline import map `{"/src/a/b.ts":"/src/a/b.js?v=<sha256:10>"}` plus an `integrity` block of sha384 hashes.
- The entry is `<script type="module">import '/src/main.ts'</script>`, because import maps don't apply to `src=`.
- modulepreload links carry an `integrity` attribute. Without it, Chromium logged "preload ... not used due to an integrity mismatch" and fetched the module twice.
- Results in Chromium:
  - Static imports and a non-literal dynamic `import(\`./routes/${r}.ts\`)` both resolved through the map.
  - No `.ts` URL was ever requested. That matters because nginx `mime.types` and `mime-db` map `.ts` to **video/mp2t**, which the browser's strict module MIME check rejects.
  - A thrown error reported `model.js?v=…:3:71`, which is exactly `src/model.ts:3:71`.
- Cache headers: HTML `no-cache`, modules `immutable`. There is no cache-invalidation cascade because module bodies never change; only the map does.
- Optional: blank comments while keeping positions.
- Pin `amaro` so production output is reproducible.

IMPLICATIONS
- Make `.ts` files with explicit `./x.ts` imports the only source format, and serve them as `text/javascript` with types replaced by whitespace. Evidence: Node, amaro and ts-blank-space produced byte-identical output that keeps every position; a thrown error reported `model.js?v=…:3:71`, which is exactly `src/model.ts:3:71`, with no source maps. Agents can go straight from a stack trace to the repo line.
- Make `tsc --noEmit` (TypeScript 7) the required check, with `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `strict` and `types: []`. Evidence: the strippers accepted `import { T }` where T is a type and `export { T }` without complaint, and both failed only at link time ('does not provide an export named T'). Only tsc caught them (TS1484, TS1205). TS 7 checked a 500-module project in 1.1s versus 5.1s for TS 6.
- Add lint rules for what `erasableSyntaxOnly` lets through but browsers reject: decorators and `accessor` (tsc passed `@dec class C{}`, then V8 threw a SyntaxError; no browser ships decorators), `using` (not in Safari), and top-level await outside the entry module (Baseline only since Safari 27, 2026-09-14).
- Ship an official zero-dependency dev server of about 45 lines using `node:module` `stripTypeScriptTypes` (stable type stripping since Node 25.2 and 24.12). It should serve `.ts` as `text/javascript` with `no-store`, add SSE live reload, and return strip errors as a module that throws with the file path. Evidence: the prototype worked under curl and strips a 151 KB file in about 40 ms.
- Production output should be each file stripped (optionally with comments blanked while keeping positions), plus one inline import map mapping `/src/x.ts` to `/src/x.js?v=<hash>`, an `integrity` block, and modulepreload links that carry `integrity` attributes. Evidence: this avoids nginx and mime-db serving `.ts` as video/mp2t, avoids cache-invalidation cascades, and resolved static and non-literal dynamic imports in Chromium 153. Without integrity on the preload links, Chromium fetched the module twice.
- Load the entry through an inline `<script type=module>import '/src/main.ts'</script>` rather than `src=`. Evidence: MDN says import maps don't apply to the `src` attribute or to workers and worklets, so the framework needs its own story for workers, such as direct hashed URLs.
- Use a single import map and never rely on merging several. Evidence: multiple import maps work in Chrome 133 and Safari 18.4 but are behind a pref in Firefox (150 through 156), so they are not Baseline. Plugins must not inject their own maps.
- Budget module count, not just bytes. Keep the framework runtime to one dependency-free ESM file, discourage barrel files and micro-modules, lazy-load routes with `import()`, and warn when the initial static graph exceeds roughly 100–150 modules. Evidence: cold loads grew linearly at about 5 ms per module on a contended 2-vCPU VM versus about 100–190 ms for one bundle; the 2018 Chrome and V8 analysis agrees; Vite 8.1 adopted bundled dev mode for large apps (15x faster startup at 10,000 components).
- Accept and document a transfer-size cost compared with minified bundles, and offer position-preserving comment blanking as a production option. Evidence: Lit's sources were 56 KB brotli as separate stripped files versus 10 KB as a minified bundle; blanking comments cut brotli size by 32% while leaving line:col unchanged.
- Pin the stripper for production builds: the `amaro` package, which Node itself uses, or a pinned Node version. Evidence: Node documents `stripTypeScriptTypes` as Stability 1.2 and warns its output 'should not be considered stable across Node.js versions'. Don't depend on ts-blank-space for now, because it is tied to the TS ≤6.0 parser until TS 7.1 ships an API.
- Templates must set `"type": "module"` in package.json. Evidence: npm 11's `npm init -y` writes `"type": "commonjs"`, which disables Node's ESM detection for `.ts` files and fails with 'Cannot use import statement outside a module'.
- Publish the framework itself as stripped `.js` files plus `.d.ts` generated with `isolatedDeclarations`, not raw `.ts`. Evidence: Node refuses to strip `.ts` inside node_modules, tsc reports type errors in dependency `.ts` files using the consumer's settings, and TS 7 `--emitDeclarationOnly --isolatedDeclarations` works once `rootDir` is set explicitly.
- Handle npm dependencies by vendoring browser-ready ESM files into the repo, with import-map entries and integrity hashes, and mirror them in tsconfig `paths` (or generate one from the other). Evidence: this matches importmap-rails, `jspm install --provider nodemodules --integrity --preload` and esm.sh. Vendoring keeps the code that actually runs readable by agents, and TS 7 resolves `paths` that mirror import-map prefixes.
- CSS strategy: don't rely on `import css with {type:'css'}` yet. Use constructable stylesheets (Baseline widely available) built from TS strings, or `<link>`. Evidence: Safari still lacks CSS module scripts. JSON modules are fine (Baseline since 2025-04-29, and TS 7 types them from the file contents).
- Do not make a Service Worker or in-browser stripping the default dev path. Evidence: shift-reload bypasses service workers, the first load is uncontrolled, Playwright's page-level route() can't intercept requests the worker handles, and the amaro browser bundle is 1.58 MB gzipped. At most, offer it as an optional zero-install preview.
- Keep the framework's TS syntax to a subset that could survive a future native 'types as comments' standard: no class modifiers, no call-site generics where avoidable, no `declare` or overloads in runtime files. Evidence: the TC39 proposal is Stage 1, last presented 2023-09, and marks those constructs as omitted or up for debate.

OPEN
- What is the real per-module cold-load cost on reference hardware (a mid-range Android phone, a desktop) over real HTTP/2 and HTTP/3 with real RTT? My ~5 ms/module figure comes from a 2-vCPU VM that unrelated processes kept saturated. It should be re-measured before hard module budgets go into the spec.
- Is a 2–5x brotli byte penalty against a minified bundle acceptable for v1 target apps? Should the spec allow an opt-in production concatenation or minify mode, which would break the strict 'source minus types' rule, or stay strict and only offer comment blanking that keeps positions?
- Production naming: remap `.ts` URLs to `.js` files through the import map (recommended, works on any static host), or keep `.ts` URLs and require hosts to serve `.ts` as `text/javascript`? The second is simpler but fails on nginx/mime-db defaults and on hosts that can't set headers.
- Does Chromium's modulepreload fetch descendant modules, or only the listed URL? The answer decides whether the deploy script must list the whole static graph (my prototype listed only the entry). The same question applies to Firefox and Safari.
- CSP: inline import maps and inline module entry scripts need `script-src` hashes or nonces under a strict CSP. Should the deploy script emit CSP hashes? This needs verifying across browsers.
- How fast does amaro/SWC pick up new TypeScript syntax (its README says 'TypeScript 5.8')? What happens if TS 7.x adds type syntax the stripper can't parse? The framework needs a policy of pinning the TS version to what the stripper supports, or a test suite for it.
- When TS 7.1 ships its new API, should ts-blank-space (official parser, ~100 ms per 151 KB) replace amaro for exact parity with tsc? Or will Node's built-in engine remain the de facto standard?
- Workers: import maps don't apply to workers or worklets. Should the framework ban module workers in v1, or define how workers get hashed URLs (for example via `new URL(import.meta.resolve(...))`)?
- When will Safari ship CSS module scripts and text modules, and when will Firefox enable multiple import maps by default? These decide whether v1 can use `with {type:'css'}` and let plugins inject their own import maps.

SOURCES
- tc39/proposal-type-annotations (README): https://github.com/tc39/proposal-type-annotations
- tc39/proposal-type-annotations README (omitted/included syntax): https://github.com/tc39/proposal-type-annotations/blob/main/README.md
- TC39 Stage 1 proposals list: https://github.com/tc39/proposals/blob/main/stage-1-proposals.md
- TypeScript blog index: https://devblogs.microsoft.com/typescript/
- Announcing TypeScript 7.0: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- Announcing TypeScript 6.0: https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- InfoQ: Microsoft Releases TypeScript 7.0 with a Native Go Compiler: https://www.infoq.com/news/2026/08/typescript-7-released/
- typescript-go CHANGES.md (JSDoc/JS changes): https://github.com/microsoft/typescript-go/blob/main/CHANGES.md
- TSConfig reference: https://www.typescriptlang.org/tsconfig/
- TypeScript 5.8 release notes (erasableSyntaxOnly): https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html
- TypeScript 5.7 release notes (rewriteRelativeImportExtensions): https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-7.html
- Node.js docs: Modules: TypeScript: https://nodejs.org/api/typescript.html
- Node.js docs: module.stripTypeScriptTypes: https://nodejs.org/api/module.html
- Node.js previous releases: https://nodejs.org/en/about/previous-releases
- nodejs/amaro: https://github.com/nodejs/amaro
- bloomberg/ts-blank-space: https://github.com/bloomberg/ts-blank-space
- Deno: TypeScript support: https://docs.deno.com/runtime/fundamentals/typescript/
- Deno: deno transpile: https://docs.deno.com/runtime/reference/cli/transpile/
- Deno: deno bundle: https://docs.deno.com/runtime/reference/cli/bundle/
- Deno 2.8 release blog: https://deno.com/blog/v2.8
- Bun.Transpiler docs: https://bun.com/docs/runtime/transpiler
- Bun HTML & static sites (bundling): https://bun.com/docs/bundler/html-static
- MDN: <script type=importmap>: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap
- Can I use: import maps: https://caniuse.com/import-maps
- Firefox 150 release notes (multiple import maps behind pref): https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/150
- Firefox 147 release notes (CSS module scripts): https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/147
- WebKit Features for Safari 27.0: https://webkit.org/blog/18325/webkit-features-for-safari-27-0/
- MDN browser-compat-data (v8.1.3 used via npm): https://github.com/mdn/browser-compat-data
- web-features (v3.40.0 used via npm, Baseline statuses): https://github.com/web-platform-dx/web-features
- guybedford/es-module-shims: https://github.com/guybedford/es-module-shims
- JSPM 4.0 Release: https://jspm.org/jspm-4.0-release
- JSPM CLI docs: https://jspm.org/docs/cli/index.html
- esm.sh: https://esm.sh/
- rails/importmap-rails: https://github.com/rails/importmap-rails
- DHH: You can't get faster than No Build: https://world.hey.com/dhh/you-can-t-get-faster-than-no-build-7a44131c
- DHH: HEY is running its JavaScript off import maps: https://world.hey.com/dhh/hey-is-running-its-javascript-off-import-maps-2abcf203
- Chromium: ES module loading bottleneck analysis (2018): https://docs.google.com/document/d/1ovo4PurT_1K4WFwN2MYmmgbLcr7v6DRQN67ESVA-wq0/pub
- V8: JavaScript modules: https://v8.dev/features/modules
- Rolldown: Why do we still need bundlers?: https://rolldown.rs/in-depth/why-bundlers
- Vite: Why Vite: https://vite.dev/guide/why
- Announcing Vite 8.1 (bundled dev mode numbers): https://vite.dev/blog/announcing-vite8-1
- Module behaviour in browsers: waterfalls, preloading, cache invalidation cascades: https://blacksheepcode.com/posts/loading_optimisations_part_4
- nginx ngx_http_v2_module (max concurrent streams, push obsolete): https://nginx.org/en/docs/http/ngx_http_v2_module.html
- nginx default mime.types (.ts -> video/mp2t): https://raw.githubusercontent.com/nginx/nginx/master/conf/mime.types
- web.dev: The service worker lifecycle: https://web.dev/articles/service-worker-lifecycle
- Playwright: Service Workers: https://playwright.dev/docs/service-workers
- DevClass: Svelte switches to JSDoc (2023): https://www.devclass.com/development/2023/05/11/typescript-is-not-worth-it-for-developing-libraries-says-svelte-author-as-team-switches-to-javascript-and-jsdoc/1630004
- sveltejs/svelte #16647: Reconsidering TypeScript for compiler internals: https://github.com/sveltejs/svelte/issues/16647