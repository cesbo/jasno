# Unbundled production delivery: what it costs (research gap, 2026-09-26)

## Test setup and its limits (read first)

**Client machine**
- DigitalOcean 'Premium AMD' VM with 2 vCPUs.
- Two python3 processes from another project have been using about 100% CPU each for 6.5 days. Load average during the runs was 3.3 to 5.6.
- The kernel uses autogroup scheduling, so nice -10 had no effect (tested). I did not touch the other processes.
- Lighthouse computeBenchmarkIndex(), run inside the page, scored 1045 to 1280. Lighthouse's own table calls that 'low-end desktop' (1000 to 1500).

**Network**
- An isolated netns plus veth pair, shaped with tc netem (sudo). It was removed afterwards.
- Caddy 2.11.4 served real H2 and H3 over TLS 1.3 with precompressed brotli. JS was sent as immutable and HTML as no-cache.

**Browsers**
- Playwright builds: Chromium 153.0.8010.12, Firefox 155.0, and WebKit trunk labelled 26.6 (Linux WPE). The WebKit build is NOT Safari.
- Stable releases per BCD 8.1.3 are Chrome 154 and Firefox 156.

**No phone was available**
- 'Mobile' below means the Russell 2026 P75 network (100 ms RTT, 9/3 Mbps) plus the Lighthouse 4x CPU slowdown.
- The slowdown is applied through a raw CDP session that only calls Emulation.setCPUThrottlingRate. This slows only the renderer.

**Instrumentation**
- Playwright enables CDP Network and Runtime events. That inflated warm loads about 2x (bundle warm 125-350 ms instrumented vs 35-65 ms bare).
- So the final Chromium numbers come from bare.mjs: a plain chrome-headless-shell with a fresh profile. The page reports to /__r (Caddy access log) and reloads itself three times.
  - Cold = the first load. The origin connection is still cold because the start page is on a different origin.
  - Warm = the median of reloads 2 and 3 in the same profile (HTTP cache plus V8 code cache).
  - Runs are interleaved. n = 5 on LAN and n = 3 elsewhere. Medians are reported.

**Graphs**
- Synthetic, component-like modules: s150x12 (150 modules, critical-path depth 12, 454 KB raw), s300x12 (300 modules, 824 KB raw) and s300x24.
- Real graphs:

| Package | Modules | Depth |
|---|---|---|
| date-fns 4.1.0 | 305 | 15 |
| three 0.186.1 src | 389 | 19 |
| lodash-es | 640 | 27 |

**Variants**
- bm: esbuild bundle, minified, no tree-shaking.
- u: unbundled, no preload.
- pu: modulepreload for the whole static graph.
- p: the full deploy recipe. An import map with imports and integrity for every module, then modulepreload with integrity, then an inline entry.

## 1. Load cost

**Cold load overhead is a per-request cost, not a per-byte cost.** Per-module overhead versus the minified bundle is almost the same for 1.7 KB date-fns modules and 5.7 KB three.js modules.

LAN (RTT about 0.1 ms), H2, Chromium bare:

| Graph | Bundle cold | Unbundled + modulepreload cold | Per module |
|---|---|---|---|
| s150 | 117 ms | 984 ms | 5.8 ms |
| s300 | 151 ms | 1727 ms | 5.3 ms |
| date-fns | 114 ms | 1905 ms | 5.9 ms |
| three | 261 ms | 2417 ms | 5.5 ms |

Warm overhead on LAN is 0.3 to 0.6 ms per module:

| Graph | Bundle warm | Unbundled warm |
|---|---|---|
| s150 | 39 ms | 102 ms |
| s300 | 48 ms | 147 ms |

**The cost is in the client, not the server.** The same date-fns graph served by the real jsDelivr/Fastly FRA edge (RTT 0.9 ms) took 2150-2202 ms on H2 and 2361-2730 ms on H3. Local Caddy took 2056 ms (H2) and 2593 ms (H3).

**Where the CPU goes.** Per-process CPU for bare runs, from /proc utime+stime, is extra CPU per module compared with the bundle:

| Process | H2 | H3 |
|---|---|---|
| Network service | about 1.8 ms | about 2.3 ms |
| Renderer | about 1.27 ms | about 1.8 ms |
| Browser | 0.3-0.5 ms | |
| Server (Caddy) | 0.25 ms | |
| **Total** | **about 3.7 ms** | **about 5.3 ms** |

The network service does the most per-module work, and CDP CPU throttling does not slow it down. That is one reason Lighthouse-style emulation underestimates real phones.

**Desktop profile** (40 ms RTT, 10 Mbps), cold / warm medians:

| Graph | Protocol | Bundle | Unbundled + preload | Deploy recipe (p) | No preload (u) | Per module |
|---|---|---|---|---|---|---|
| s150 | H2 | 330 / 66 | 1159 / 145 | 1092 / 152 | 1403 / 147 | 5.5 ms |
| s300 | H2 | 369 / 62 | 1928 / 173 | 2136 / 206 | 2347 / 176 | 5.2 ms |
| s150 | H3 | 265 / 78 | 1469 / 134 | | | 8.0 ms |
| s300 | H3 | 282 / 74 | 3164 / 184 | | | 9.6 ms |

**Mobile profile** (100 ms RTT, 9/3 Mbps, renderer 4x), cold / warm medians:

| Graph | Protocol | Bundle | Unbundled + preload | Deploy recipe (p) | No preload (u) | Per module |
|---|---|---|---|---|---|---|
| s150 | H2 | 710 / 264 | 2039 / 326 | 2240 / 432 | 2580 / 476 | 8.9 ms |
| s300 | H2 | 884 / 241 | 3510 / 639 | 3564 / 751 | 4139 / 661 | 8.8 ms |
| date-fns | H2 | 735 | 3479 | | 4166 | |
| s150 | H3 | 534 | 2041 | | | 10.0 ms |
| s300 | H3 | 661 | 4218 | | | 11.9 ms |

**Reading the numbers**
- **HTTP/3 does not help unbundled delivery.** QUIC saves one handshake RTT, so the bundle got 65-220 ms faster. But QUIC costs more CPU per request in both browser and server, so 150-300 modules loaded slower on H3 than on H2 in every lab profile and on the real CDN.
- **Depth matters less than RTT x depth suggests**, because the load is CPU-bound and CPU work overlaps network waits. Depth 24 versus 12 without preload added 0 to 160 ms. Still, leaving out modulepreload cost a further 0.25 to 0.6 s on mobile. On a fast CPU, where network waits are no longer hidden, the waterfall cost grows toward depth x RTT.
- **Import map plus integrity costs little.** Variant p versus pu is within noise to +0.35 s. The HTML grows by about 70 bytes of brotli per module (p.html is 10.2 KB br for 150 modules and 20.0 KB for 300). That takes more than one initial TCP window on mobile.
- **Per-file compression penalty.** The sum of per-file brotli sizes versus brotli of one concatenated file is 1.57x for three, 2.9x for date-fns and 2.7x for lodash-es. date-fns ships 533 KB of unminified JSDoc-heavy source, against an 82 KB minified bundle. Type stripping keeps comments, so the same penalty applies to us.

**Calibrating to real devices** (estimates; not measured)
- **Desktop.** A modern desktop with idle cores runs the pipeline stages in parallel, so wall time per module approaches the slowest stage. Chrome's own 2018 study on an HP Z840 over local H2 found moment.js (104 modules, depth 6) took 200 ms, or 173 ms with modulepreload. three.js (333 modules) took 291-355 ms. That is about 1-2 ms per module.
  - Planning figure: 1-2 ms per module cold. That gives 150 modules at +0.15 to 0.3 s and 300 at +0.3 to 0.6 s over a bundle.
- **Mid-range Android.** Russell 2026 names the Galaxy A24 4G (Helio G99) as the P75 device; Gizmochina reports its single-core Geekbench score as 561. The lab mobile profile gave 8.8-12 ms per module. Two biases partly cancel: the lab contention inflates every process, while CDP leaves the network service unthrottled.
  - Planning figure: 8-12 ms per module cold. That gives 150 modules at +1.2 to 1.8 s and 300 at +2.6 to 3.6 s. Warm: +0.06 to 0.3 s at 150 and about +0.4 s at 300.
  - Russell's 3 s budget at 100 ms RTT cannot absorb 300 unbundled modules.
- **Earlier guidance.** V8's modules guide says unbundled production is only for 'small web apps with less than 100 modules in total and ... depth less than 5'.
- **Firefox is a separate risk.** Bare Firefox 155 (lab CA trusted in a fresh profile, no Juggler instrumentation):

| Graph | Bundle cold | Unbundled cold | Bundle warm | Unbundled warm |
|---|---|---|---|---|
| 150 | 344-484 ms | 2070-2751 ms | 0.45 s | 1.6-1.8 s |
| 300 | about 470 ms | 3.5-5.1 s | 0.55-0.65 s | 2.8-3.9 s |

  - Firefox's warm per-module cost (about 8-10 ms) is about 20x Chromium's. Instrumented WebKit/Linux behaved like Chromium: 4.2-4.7 ms per module cold.
- **Related industry data.** Vite 8.1 (2026-06-23) added a bundled dev mode because unbundled requests do not scale: 10x faster full reloads on a 10k-component app, and Linear saw about 40% faster reloads with 10x fewer requests. Khan Academy (2015, re-posted 2025) found 296 files over H2 slower than 28 packages, and compressed bytes grew 2.5%.

## 2. Does modulepreload fetch descendants?

Test mp/mp.mjs. A page contains only `<link rel=modulepreload href=a.js>`. a.js imports b.js and 'lib' through the import map; b.js imports c.js.

| Engine | Fetches descendants? | Requests seen |
|---|---|---|
| Chromium 153 | No | a.js only |
| WebKit trunk | No | a.js only |
| Firefox 155 | Yes | a, b, lib, c (import map resolved; dynamic imports not fetched) |

- When a.js is imported later in Chromium and WebKit, b, lib and c are fetched only at that moment.
- MDN and web.dev both say descendant fetching is an optional optimization, and that listing every module is the only portable approach.
- **The deploy step must list the whole static graph** (the static import closure of the entry). It must leave out dynamic-import targets.

**New finding: Chromium double-fetches** (dbl.mjs, reqcount.mjs)
- If the import map has integrity but the link lacks an integrity attribute, Chromium 153 fetches every module twice. For 150 modules that was 301 requests.
- Firefox and WebKit reuse the preload and apply the import-map integrity. A tampered preloaded module was blocked.
- Fix: repeat the integrity value on every modulepreload link.

**WebKit ignores link integrity**
- With link integrity but no map integrity, WebKit ran a tampered module. It appears to ignore integrity on modulepreload links.
- So rely on import-map integrity, which blocks tampering in all three engines.

I found no Chromium or WebKit bug report for either problem.

## 3. Strict CSP and Trusted Types

Tests csp/csp.mjs, csp2.mjs, csp3.mjs, meta.mjs and dyn.mjs. Every policy also included `object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'`.

- TT was actually enforced in all three engines: innerHTML threw TypeError, and eval threw EvalError when the policy came from a meta tag.
- Firefox shipped TT in 148 and Safari in 26 (BCD).
- The recipe itself touches no TT sink:
  - Parser-inserted inline import maps and entries are not sinks.
  - `import()` is not a sink.
  - A script-created `<link rel=modulepreload integrity>` works in all three engines under both working policies, so a router can preload lazy routes.

**Import-map integrity is enforced everywhere.** Import-map integrity has been supported since Chrome 127, Firefox 138 and Safari 18. A tampered module blocked the whole graph in all three engines.

**Policy matrix** (static imports, dynamic imports):

| Policy | Chromium | Firefox | WebKit |
|---|---|---|---|
| `'nonce-X' 'strict-dynamic'` (nonce on map, entry and links) | pass | pass | pass |
| `'nonce-X'` alone (the nonce propagates to descendant fetches) | pass | pass | pass |
| `'self' 'sha256-map' 'sha256-entry'` (header or meta) | pass | pass | pass |
| `'sha256-map' 'sha256-entry' 'strict-dynamic'`, no preloads | BLOCKED | BLOCKED | pass |
| Same, but every module modulepreloaded | pass | pass | pass |
| Hashes only, no `'self'` | blocked | blocked | blocked |
| Hash of every module (import-map integrity as CSP hash-source) | pass | pass | BLOCKED |

- **Why hash plus strict-dynamic breaks.**
  - Descendant module fetches inherit 'parser-inserted' metadata from the inline entry.
  - `'strict-dynamic'` disables `'self'` and host sources.
  - Even an `import()` in the inline entry is blocked in Chromium and Firefox.
  - It only 'works' when preloads load every module, because modulepreload fetches are not parser-inserted.
  - WebKit is more permissive, so a test that passes in Safari can fail in Chrome.
- **Recipe for static hosting.** The deploy step writes a CSP meta tag, or a headers file, containing `script-src 'self'` plus the two sha256 hashes plus TT. The hashes change on every deploy.
- **Recipe with a nonce-capable server.** Use nonce + strict-dynamic, and put the nonce on the map, the entry and every link.
- **Ban hash + strict-dynamic.**

## 4. Node 24.12 vs 26

Test nodecmp/. Binaries: 24.12.0, 24.21.0, 26.0.0 and 26.10.0 from nodejs.org, plus the old 25.1.0.

**Behaviour is identical on all five versions**
- The strip prototype prints the same result and the same stack position (a.ts:5:19).
- stripTypeScriptTypes output is byte-identical on 11 inputs, including the 46 KB elements.ts, and keeps the same length.
- The dev server gives the same hashes, the same enum error module (500), a 404 on path traversal, and SSE reload works.
- The deploy tree hashes identically (75b3078d2a43).
- These error the same way everywhere:
  - enum, namespace and parameter properties: ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX
  - extension-less imports and './x.js' pointing at a .ts file: ERR_MODULE_NOT_FOUND
- `@dec class C {}` passes through unchanged on every version. BCD 8.1.3 has no JS decorators entry at all. This confirms the decorator conflict: a separate check is required.

**Differences**
- stripTypeScriptTypes is still 'Stability 1.2 - Release candidate'. It prints ExperimentalWarning on every version, including 26.10.
- v26.0.0 removed the transform mode and the sourceMap option (verified: ERR_INVALID_ARG_VALUE on 26.x; still works on 24.x).
- Type stripping itself became stable in 25.2.0 and 24.12.0. Running .ts files prints no warning.

**Fix for the dev server**
- Error positions live in e.stack, not e.message. With `{sourceUrl}` passed in, e.stack starts with '/src/bad.ts:3' followed by a code frame on both 24.12 and 26.10.
- serve.ts currently sends only e.message, so the line number is lost.

**Release calendar** (Release schedule.json)

| Version | LTS | Maintenance | End of life |
|---|---|---|---|
| v24 | | from 2026-10-20 | 2028-04-30 |
| v25 | | | 2026-06-01 (nodejs.org lists 2026-03-31) |
| v26 | 2026-10-28 | | 2029-04-30 |

## Conflicts resolved
- **Node minimum.** Use engines '^24.12.0 || >=26.0.0'. Every earlier result reproduces on supported Node.
- **Safari 27 date.** Released 2026-09-14 per BCD 8.1.3. The WebKit 'Features for Safari 27.0' post is dated 2026-09-17. Both earlier notes had one of the two dates. That post announces a rewrite of the ES module loader in native C++, plus fixes for module-resolution performance, so Safari's per-module cost may have changed. It was not measured here.
- **Symbol.dispose.**
  - The Safari 27 post does not mention explicit resource management, and BCD lists it as preview only.
  - Playwright's WebKit trunk build has typeof Symbol.dispose === 'symbol', so it is in trunk but not in shipped Safari.
  - Keep `dispose()` as the contract.
- **Decorators.** Confirmed as described above.
- **Other conflicts** (naming, stores, async primitive, diagnostics) are outside this topic and were not addressed.

IMPLICATIONS
- **Module budget.** The initial route's static graph should target 100 modules or fewer, warn at 150, and fail the deploy at 250.
- Evidence: 8-12 ms per module cold in the mobile lab profile (+1.3 to 1.5 s at 150 modules, +2.6 to 3.6 s at 300, versus a minified bundle); an estimated 1-2 ms per module on desktop; and V8's '<100 modules' guidance.
- The count must include transitive npm modules. date-fns alone is 305 modules, lodash-es 640 and three 389, so the tool should report counts per package.
- **Lazy routes and the router.** Each lazy route's closure should be about 50 modules or fewer. The router should inject `<link rel=modulepreload integrity>` for a route's closure from a deploy-time manifest before calling import().
- Verified to work under the strict CSP + TT recipes in Chromium 153, Firefox 155 and WebKit trunk.
- **Deploy step must preload the whole graph.** It has to compute the full static import closure of the entry with a real lexer, not regexes, and emit modulepreload for every module in it.
- Chromium 153 and WebKit do not fetch descendants; Firefox 155 does.
- The current deploy.ts preloads only the entry.
- Dynamic-import targets must be left out.
- **Order and integrity in the HTML.** Emit the import map (imports plus integrity) first, then modulepreload links, and repeat the same integrity value on every link.
- Without link integrity, Chromium 153 fetches every module twice (301 requests for 150 modules).
- WebKit ignores link integrity but enforces import-map integrity, so import-map integrity is the real protection. A tampered module was blocked in all three engines.
- **CSP recipes.** The deploy step should write the CSP (header file or meta) with the hashes, since they change on every deploy.
- Static hosting: `script-src 'self' 'sha256-<map>' 'sha256-<entry>'; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types <policy|'none'>`. Works as header or meta in all three engines.
- With a nonce-capable server: `'nonce-X' 'strict-dynamic'`, with the nonce on the map, the entry and every link.
- Ban `hash + 'strict-dynamic'`: it blocks static imports in Chromium and Firefox but passes in WebKit.
- **Trusted Types.** Deploy output and framework loading must not use TT sinks. That rules out script.src/text, innerHTML and eval, and dynamic-import URL building through sinks.
- import() and script-created modulepreload links are safe.
- TT is enforced in Chrome 83+, Firefox 148+ and Safari 26+.
- **No HTTP/3 claims.** The spec should not say HTTP/3 multiplexing makes unbundled delivery cheap.
- H3 saved one handshake RTT for a bundle but cost 2-4 ms more per module. It was slower than H2 at 150-300 modules in every profile and against the real jsDelivr edge.
- Test and document H2 as the baseline.
- **Byte budget.** Plan for 1.6-2.9x more compressed bytes than a bundle: that is the measured per-file brotli penalty for three, lodash-es and date-fns.
- Type stripping keeps comments. A lint or deploy option to drop large JSDoc blocks from shipped files may be worth it, but it would change byte positions.
- **Budget errors for agents.** Emit named, machine-readable errors, for example MODULE_BUDGET_EXCEEDED listing counts per package plus the largest closures, and IMPORT_NOT_PRELOADED.
- Agents can act on counts. Wall-clock budgets alone are not reproducible on noisy CI; the lab showed load averages of 3-5.6.
- **Framework runtime.** Ship the runtime as a few ES module files (for example core, dom and dev diagnostics). Every module costs about 1-2 ms on desktop and about 10 ms on a mid-range phone, whatever its size.
- **Node engines.** Declare '^24.12.0 || >=26.0.0' and run CI on 24.12.0, latest 24 and latest 26. All prototypes were byte-identical across those.
- Call stripTypeScriptTypes only with default options; v26 removed transform mode and sourceMap.
- Pass sourceUrl so errors carry file:line, and forward e.stack in the dev server.
- Run tools with --disable-warning=ExperimentalWarning, or pin amaro if deploy output must be byte-stable across upgrades.
- **Separate decorator check.** Add one to the lint gate. stripTypeScriptTypes passes `@dec` unchanged on 24.12-26.10, and no engine ships decorators (BCD 8.1.3 has no entry).
- **Disposal contract.** Keep `dispose()` as the public contract. Add a `[Symbol.dispose]` alias only behind `typeof Symbol.dispose === 'symbol'`.
- Shipped Safari 27 (2026-09-14) lacks it; only the WebKit trunk build has it.
- **Firefox as a named risk.** Record Firefox as a support risk for unbundled delivery. Bare Firefox 155 added +1.7 to 2.3 s cold and +1.2 to 1.4 s warm at 150 modules on the lab machine, about 20x Chromium's warm per-module cost. Measure on real hardware before promising parity.

OPEN
- **Real-device numbers.** No physical Galaxy A24-class phone or clean desktop was available. The lab client was a 2-vCPU VM saturated by another project's processes. Real devices (WebPageTest or a device lab) should confirm the 8-12 ms per module (mobile) and 1-2 ms per module (desktop) planning figures before the budgets become normative.
- **Safari/iOS per-module cost.** It is unmeasured. Playwright's Linux WebKit uses a different network stack, and Safari 27 shipped a rewritten C++ module loader with fixes for module-resolution performance.
- **Firefox warm loads.** Why do they cost about 8-10 ms per module even when every module comes from cache? Is it a missing bytecode cache for modules? Does it reproduce on real hardware and in Firefox 156+?
- **Chromium double-fetch.** Is it filed or fixed in Chrome 154+? It happens when the import map has integrity but the modulepreload link has none. The same question applies to WebKit ignoring integrity on modulepreload links. Neither was found in the issue trackers.
- **Hard budget versus escape hatch.** Should the spec make the module budget a hard deploy failure, or allow an explicit concatenation escape hatch? The hatch would contradict the 'repo module = browser module' rule.
- **Compression Dictionary Transport.** Could shared dictionaries remove the 1.6-2.9x per-file brotli penalty? Not researched.
- **Deploy-step lexer.** Should the deploy step use es-module-lexer, the TypeScript scanner, or a stdlib-only parser to compute the static closure reliably? The current prototype preloads only the entry.

SOURCES
- V8: JavaScript modules (bundling guidance, <100 modules / depth <5): https://v8.dev/features/modules
- Chrome team: ES module loading - Bottleneck analysis and Optimization plans (2018): https://docs.google.com/document/d/1ovo4PurT_1K4WFwN2MYmmgbLcr7v6DRQN67ESVA-wq0/pub
- Alex Russell: The Performance Inequality Gap, 2026: https://infrequently.org/2025/11/performance-inequality-gap-2026/
- Lighthouse throttling docs (BenchmarkIndex table, 4x CPU): https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md
- Lighthouse page-functions.js (computeBenchmarkIndex source): https://raw.githubusercontent.com/GoogleChrome/lighthouse/main/core/lib/page-functions.js
- Gizmochina: Galaxy A24 4G (Helio G99) Geekbench scores: https://www.gizmochina.com/2023/01/18/samsung-galaxy-a24-4g-with-helio-g99-soc-appears-on-geekbench-database/
- Vite 8.1 announcement (bundled dev mode numbers): https://vite.dev/blog/announcing-vite8-1
- Khan Academy: Forgo JS packaging? Not so fast: https://blog.khanacademy.org/forgo-js-packaging-not-so-fast/
- MDN: rel=modulepreload: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/modulepreload
- web.dev: Preload modules: https://web.dev/articles/modulepreload
- HTML Standard: link types (modulepreload): https://html.spec.whatwg.org/multipage/links.html
- W3C CSP Level 3 (strict-dynamic, external hash matching): https://w3c.github.io/webappsec-csp/
- Shopify Engineering: Shipping module script integrity in Chrome & Safari: https://shopify.engineering/shipping-support-for-module-script-integrity-in-chrome-safari
- JSPM: JavaScript Integrity Manifests with Import Maps: https://jspm.org/js-integrity-with-import-maps
- Guy Bedford: ES Module Preloading & Integrity: https://guybedford.com/es-module-preloading-integrity
- WebKit Features for Safari 27.0: https://webkit.org/blog/18325/webkit-features-for-safari-27-0/
- Node.js docs: module.stripTypeScriptTypes (v26.10.0): https://nodejs.org/api/module.html
- Node.js docs: TypeScript type stripping history (v26.10.0): https://nodejs.org/api/typescript.html
- Node.js previous releases: https://nodejs.org/en/about/previous-releases
- Node.js Release schedule.json: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- Node.js dist index (release dates): https://nodejs.org/dist/index.json
- @mdn/browser-compat-data 8.1.3 (npm, queried locally): https://www.npmjs.com/package/@mdn/browser-compat-data