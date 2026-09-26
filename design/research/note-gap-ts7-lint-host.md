## TL;DR

- **The premise is only half right.** TypeScript 7.0.2 has no *supported* API: the 7.0 blog says it "does not ship with an API". But the npm package does ship a working client API under `typescript/unstable/*` (`unstable/sync`, `unstable/async`, `unstable/ast`, …). The bare `require("typescript")` exposes only `version`/`versionMajorMinor`. I built both kinds of framework rules on `typescript/unstable/sync` in tsc 7.0.2. They ran with **zero new dependencies** and matched every expected case in the fixture, with no false positives.
- **None of the off-the-shelf candidates can host the type-aware rules on TS 7 today, except typescript-eslint pinned to TS 6.** oxlint JS plugins: syntactic only. tsgolint: fixed rule set, no custom rules. Biome/GritQL: no type info. amaro: not a checker.
- **Recommendation:** the framework ships its own `fw check` CLI on the TS 7 API. That is exactly the route the TypeScript team recommends ("package it up into your own CLI"). Push as many rules as possible into **types** and **runtime traps**, so only genuinely heuristic rules depend on the unstable API.
- **TS 7.1 dates:** beta 2026-10-06, RC 2026-11-10, stable **2026-11-24**. Its goal is to *stabilize* this same client API. It adds no in-process plugin or third-party rule hook to `tsc` or `tsserver`.

---

## 1. Premise check: TS 7.0.2 has an unstable API, and it churns

`npm view typescript@7.0.2 exports` lists:
`"." → lib/version.cjs`, `./unstable/sync`, `./unstable/async`, `./unstable/ast`, `./unstable/ast/{is,clone,utils,factory,scanner,visitor}`, `./unstable/fs`, `./unstable/proto`. `typescript@next` (7.1.0-dev.20260925.1) has the same entry points.

How it works:
- `new API({cwd})` spawns the bundled native binary.
- It talks msgpack over stdin/stdout. Calls are synchronous through `fs.readSync`/`fs.writeSync` on the pipe fds, in `dist/api/syncChannel.js`, "Pure JS replacement for @typescript/libsyncrpc".

Surface in 7.0.2:
- `Snapshot` → `Project` → `program`, `checker`, `emitter`.
- `Checker` methods: `getTypeAtLocation` (single or array), `getContextualType`, `getPropertiesOfType`, `getSignaturesOfType`, `getResolvedSignature`, `isTypeAssignableTo`, `typeToString`, and more.
- AST nodes have `forEachChild`, `modifiers`, `flags`, `parent`, and `SourceFile.getLineAndCharacterOfPosition`.

That is enough for every requested rule.

Caveats, all verified:
- **Churn between 7.0.2 and 7.1-dev.** My checker crashed on `typescript@7.1.0-dev.20260925.1` with `Error: Cannot update an inactive snapshot`. The cause: `api.updateSnapshot(...)` became private, replaced by `api.createSnapshot().update({openProjects})`. A one-line shim fixed it, and all AST, checker and type calls were unchanged. 7.1-dev also adds `createProgram`, `createSourceFile`, `parseCommandLine`, `transpileModule`, `batch()`, `formatDiagnostics` and `languageService`.
- **Node-only.** `SyncRpcChannel` reads private `stdout._handle.fd`, which breaks on Bun (microsoft/TypeScript#64387, opened 2026-09-22).
- **Not a supported API.** The 7.0 blog says 7.0 "does not ship with an API", and a downstream project stayed on TS 6 rather than depend on `unstable/*`. That project's claim that upstream "reserves the right to change it in a patch release" is uncited (folio-assistant PR #994). Still, it is the prudent assumption.

## 2. Candidates

| Candidate | Syntactic rules | Custom type-aware rules | Status (2026-09-25) | Verdict |
|---|---|---|---|---|
| typescript-eslint + `@typescript/typescript6` | yes | yes, but types come from the TS 6 checker | typescript-eslint 8.70.1, peer `typescript >=4.8.4 <6.1.0`. #12518 ("TypeScript 7.0.2 Support") closed not_planned 2026-07-08 by kirkwaiblinger: "there is no TS 7 API at this time… set up typescript-eslint to use TS 6". Tracking issue #10940: JoshuaKGoldberg on 2026-09-11, "I'm working on this. I don't know how long it will take." | Works now (verified), but slow and adds ~77 MB of deps. Has a `tsc` bin-shadowing trap (see below). |
| oxlint JS plugins (oxlint 1.85.0) | yes (verified) | **no**: docs list "Lint rules that rely on TypeScript type-awareness" as unsupported | alpha (blog 2026-03-11: "no custom type-aware rules") | Good optional editor layer for the syntactic rules. |
| tsgolint v7 (oxlint-tsgolint 7.0.2003) | n/a | **no**: README says "We are not currently accepting PRs for new rules beyond what typescript-eslint supports" | stable 2026-07-22. Tracks TS 7.0.2, 59/61 typescript-eslint type-aware rules. Vendors typescript-go as a git submodule, not a public API. | Its built-in `restrict-template-expressions` and `restrict-plus-operands` catch generic function-in-template and `+` (verified). No framework-specific rules. |
| Biome 2.5.14 GritQL plugins | yes (pattern + `register_diagnostic`, rewrites) | **no** type info in the docs | GA | A third toolchain for syntactic rules only; not worth it. Docs-only evaluation. |
| oxc-parser 0.151.0 bespoke | yes (ESTree+TS AST, 0.3 ms parse) | no | stable | Redundant with an oxlint plugin or the TS 7 AST. |
| amaro 1.2.1 (Node's stripper) | **no** | no | — | `transformSync(code,{mode:"strip-only"})` passes `@dec class`, `accessor`, `using` and `private` through unchanged. It throws only on parameter properties and enums (`UnsupportedSyntax`). It exposes no AST, so it is not a checker. |
| **TS 7 `typescript/unstable/sync` (bespoke `fw check`)** | yes | **yes, on the TS 7 checker** | unstable; stabilization targeted for 7.1 | **Recommended.** |

### typescript-eslint side-by-side: verified, with a trap

- **Setup:** `typescript: npm:@typescript/typescript6@6.0.2` and `typescript-7: npm:typescript@7.0.2`.
- **Hazard:** `@typescript/typescript6` depends on `@typescript/old: npm:typescript@^6`, and that package's `tsc` bin won. `readlink node_modules/.bin/tsc` gave `../@typescript/old/bin/tsc`, and `tsc --version` gave **6.0.3**. This is microsoft/typescript-go#4567, closed 2026-07-09. RyanCavanaugh: "npm picks bin winners based on lexical sort". The workaround alias is `@typescript/native`, and Yarn/Bun behave differently again.
- **Consequence:** a "tsc 7 gate" can silently be TS 6.
- **Result:** my three custom type-aware rules, written with `parserServices`, all fired correctly.

## 3. Prototype on TS 7.0.2 (`fwlint-batch.ts`)

Fixture: `app/src/bad.ts`. tsc 7.0.2 flags only four things in it:
- `./util` (TS2835, which suggests `./util.js`);
- the parameter property (TS1294);
- `Symbol.dispose` (TS2550);
- `using` (TS2318 "Cannot find global type 'Disposable'", **with no file or line**).

It does **not** flag:
- `@dec class`, `accessor`, `private`/`protected`/`public`/`readonly`/`abstract`;
- `import "./util.js"`;
- `${count}`, `"x" + count`, `String(count)`;
- `onClick: count`, or `title: title()` against a `MaybeAccessor<string>` prop.

`fw check` reports all 18 expected hits and flags nothing in the fixture's valid lines (`${count()}`, `onClick: () => count.set(1)`, `title`, `title: "static"`, top-level await in the entry module):
- `TS_EXTENSION` (×2: `./util.js`, `./util`)
- `NO_DECORATORS`
- `NO_ACCESSOR`
- `NO_TS_CLASS_MODIFIER` (×7)
- `NO_USING`
- `TLA_OUTSIDE_ENTRY`
- `SIGNAL_IN_TEMPLATE`
- `SIGNAL_COERCED` (×2: `+` and `String()`)
- `SIGNAL_AS_HANDLER`
- `SNAPSHOT_TO_ACCESSOR`

How the rules work:
- **Signal detection:** the type has a property whose `escapedName` starts with `__@SIGNAL@`. That is the unique-symbol brand in `fw.ts`: `type Accessor<T> = (() => T) & { readonly [SIGNAL]: true }`.
- **Snapshot rule:** a zero-argument call whose callee is signal-typed, and whose `checker.getContextualType(call)` is a union containing a callable member.

Performance: 500 generated files, 12k lines, on this machine.

| Tool | Time |
|---|---|
| Naive per-node IPC (`fwlint.ts`) | **87 s** |
| Batched: one `getTypeAtLocation(nodes[])` per file, memoized by type id, only Identifier/PropertyAccess candidates (`fwlint-batch.ts`) | **3.8 s** |
| `tsc -p` | 3.1 s |
| oxlint + tsgolint (3 rules) | 2.4 s |
| ESLint + typescript-eslint on TS 6 (same 3 custom rules) | **25.8 s** |
| Small fixture: `fw check` / oxlint JS plugin / ESLint + TS 6 | 0.86 s / 0.5 s / 6.4 s |

Lesson: IPC round trips dominate, so batching is mandatory in the spec.

## 4. Move rules out of lint: types and runtime traps (verified)

The less that depends on the unstable API, the better.

**Signal as event handler → types.** tsc 7.0.2 rejects `button({ onClick: count })` with TS2322 ("Types of property '[SIGNAL]' are incompatible"). Arrows, `(e) => e.clientX` with an inferred `e`, and named handlers still pass. The one case that gets through is a signal first widened to `() => number`.

```ts
type Handler<E extends Event> = ((e: E) => void) & { readonly [SIGNAL]?: never };
```

**Coercion → runtime trap.** A shared prototype with `Symbol.toPrimitive` that throws turns `` `${count}` ``, `"x"+count`, `String(count)` and `count+1` into an immediate `TypeError("SIGNAL_COERCED: …")` at the faulty line. `count()+1` still works, and `.call`/`.bind` are intact.

```js
const proto = Object.create(Function.prototype, { [Symbol.toPrimitive]: { value() { throw new TypeError("SIGNAL_COERCED: …"); } } });
function signal(v) { const s = () => v; Object.setPrototypeOf(s, proto); /* … */ return s; }
```

**Symbol.dispose and `using` → lib setting.** `lib: ["es2025","dom"]` already rejects `Symbol.dispose` (TS2550) and `using` (TS2318). Adding `"esnext.disposable"` makes both pass (verified), so the spec must forbid that lib entry. The TS2318 error has no location, so `NO_USING` stays in `fw check` to give agents a line number.

**Extension and syntax errors → dev server hints.** A 404 for `./x.js` when `./x.ts` exists can answer "did you mean ./x.ts" (a cheap dev trap). Decorators and `accessor` fail loudly in the browser as a SyntaxError (Node 25.1: "Invalid or unexpected token" / "Unexpected identifier 'n'"), just without a hint.

**What stays type-aware lint only:**
- `SNAPSHOT_TO_ACCESSOR`. It is inherently heuristic, because a one-shot read can be intentional, so make it a warning with an escape hatch.
- Any future read-after-await rule.

## 5. TS 7.1: schedule and plugin story

Schedule, from microsoft/TypeScript#63703, opened 2026-07-31:
- beta prep 2026-10-02, **beta 2026-10-06**;
- RC 2026-11-10;
- **stable 2026-11-24**.

Scope listed under "Stabilize API": Content Mapper API (typescript-go#4712), Emit API (#4699), Language Service API. Also listed: `es2026` lib/target, investigating Node 26 package maps, and migrating the repo into microsoft/TypeScript (the typescript-go milestone page says that repo was archived 2026-09-01).

The API feature roadmap (microsoft/TypeScript#63875, andrewbranch, 2026-08-04) covers:
- content mappers and LSP-client middleware as the "TS Server Plugin Replacements";
- `createProgram`, `createSourceFile`, `transpileModule`;
- `parseCommandLine`, solution builder, custom transformers.

On third-party plugins, andrewbranch wrote on 2026-08-26: "The conversation around compiler plugins has not changed… The guidance is still that if you want to significantly augment what tsc does with plugins, you should use the APIs to wire it all together and package it up into your own CLI (e.g. like Angular does)."

So 7.1 will **not** let third-party rules run inside `tsc` or show up through `tsserver` plugins. Custom rules run as a separate client, either your own CLI or typescript-eslint once it ports, with no ETA. Editor squiggles for framework rules would need either the oxlint VS Code extension (syntactic only) or a VS Code extension using the 7.1 LSP middleware.

## 6. Proposed spec text

1. **`fw check` is the single gate, not `tsc --noEmit`.**
   - It opens the project through `typescript/unstable/sync`.
   - One pass emits tsc's own diagnostics (`program.getSemanticDiagnostics()` etc.) plus framework rules, in one format.
   - It takes `--json` for agents.
   - It rewrites TS2835's "Did you mean './x.js'" to `.ts`.
   - The entry module is read from `index.html` `<script type="module" src>`.
2. **Peer range `typescript: ">=7.0.2 <7.2"`,** with a tiny compat shim (`createSnapshot` vs `updateSnapshot`). Switch to the stable entry point when 7.1 ships, then narrow the range.
3. **Rules are batched per file and memoized by `type.id`,** and only Identifier/PropertyAccess (and element access) nodes are queried.
4. **Rule codes are descriptive and shared:** SIGNAL_COERCED is thrown by the runtime trap *and* reported by `fw check`.
5. **Optional, not required:** `@fw/oxlint-plugin` for syntactic editor feedback. Do not depend on typescript-eslint + TS 6 or on Biome.

## 7. Resolving the listed conflicts

**Symbol.dispose.**
- BCD 8.1.3 (timestamp 2026-09-24T13:25Z; I re-queried it): `Symbol.dispose`, `Symbol.asyncDispose`, `DisposableStack` and `using` are Safari `"preview"` and safari_ios `false`. Chrome is 125/127/134/134, Firefox 141.
- Safari 27 (current since 2026-09-14) lacks them.
- **Resolution:** the v1 public API uses a string-named `dispose()` only. Never compute `[Symbol.dispose]`: in Safari it would define the key `"undefined"`. Keep `lib: ["es2025","dom"]` as the gate and forbid `esnext.disposable`. Note that TS's own `Snapshot` class implements `[Symbol.dispose]`, which is fine on Node but irrelevant to the browser.

**moduleResolution.**
- Verified on tsc 7.0.2 with `allowImportingTsExtensions` + `noEmit`: `bundler` (module `esnext` or `preserve`) passes `./util`, `./util.js`, `./util.ts` and `import d from "./d.json"`.
- `nodenext` catches `./util` (TS2835, wrong `.js` suggestion) **and** JSON without `with {type:"json"}` (TS1543). Browsers also require that attribute.
- Adding `rewriteRelativeImportExtensions` does not change the suggestion.
- **Resolution:** `module`/`moduleResolution: "nodenext"`, `allowImportingTsExtensions: true`, `noEmit: true`, and `"type": "module"`. `.ts` specifiers are enforced by `fw check` `TS_EXTENSION`, and `fw check` replaces the misleading suggestion. "tsc --noEmit is the gate" should be replaced by "fw check is the gate".

**TS 7 overload errors.**
- **I could not reproduce "no regression".** Same-arity overloads `(a: string)` / `(a: number)` called with `{}`, `true` or an object literal:
  - tsc **6.0.3** lists "Overload 1 of 2… Overload 2 of 2…";
  - tsc **7.0.2** prints only "The last overload gave the following error". It is deterministic, and the same with `--pretty true/false` and `--singleThreaded`.
- With 4 overloads, both versions collapse. With different arities, both pick the arity match and print a plain TS2345.
- Possible explanation for the other result: the side-by-side bin trap, where `node_modules/.bin/tsc` is 6.0.3. Always print `tsc -v`.
- Either way, "avoid overloads" stands, and TS 7 makes it stronger.

**Decorators.**
- Confirmed: `erasableSyntaxOnly` + tsc 7.0.2 exits 0 on `@dec class A {}`.
- amaro passes it through, and Node throws **SyntaxError**, not ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. That code (amaro's `UnsupportedSyntax`) applies to enum, namespace and parameter properties, and tsc flags those with TS1294.
- `accessor` → V8 SyntaxError. BCD has no decorators/auto-accessor entry.
- **Resolution:** `NO_DECORATORS` and `NO_ACCESSOR` in `fw check`; correct the wording in ai-failure-modes.

**ArrowJS.** npm `@arrow-js/core` 1.0.0 was published 2026-03-20T16:55:34Z, and 1.0.6 on 2026-04-01. Use March 20.

**Safari 27.** BCD 8.1.3: safari 27 and safari_ios 27 both 2026-09-14 (current). Use 09-14.
- Also: BCD marks top-level await in Safari 15–26.6 as partial (WebKit bug 242740: breaks when several modules import a TLA module at once), fixed in 27. That is a concrete platform reason for `TLA_OUTSIDE_ENTRY` while Safari 26 is in the support window.

**Node minimum.**
- nodejs.org lists v25 EOL 2026-03-31. The nodejs/Release `schedule.json` says v25 end 2026-06-01, a source discrepancy, but it is EOL either way.
- v26 has been Current since 2026-05-05; the latest is 26.10.0 (2026-09-21). v26 LTS is **2026-10-28** per `schedule.json`.
- Type stripping was marked stable in 25.2.0 (2025-11-11) and 24.12.0 (2025-12-10), in nodejs/node#60600.
- **Resolution:** `engines: ">=24.12"`, which covers 24 LTS and 26. Drop 25. Re-run the experiments on 24.12+ or 26.x, since mine also ran on EOL 25.1.0.

**Reactive-prop rule (relevant to lint).**
- The runtime must tell handlers apart from accessor props, so some key rule is unavoidable: an `on*` prefix, or an `on:{}` namespace.
- With the `Handler` brand above, signal-as-handler becomes a compile error under either choice, so lint no longer decides this.
- If `on*` is chosen, use `/^on[A-Z]/` so a prop like `online` is not treated as a handler.

**Async primitive (relevant to lint).** A read-after-await rule would be type-aware (it needs signal types at call sites), so it would sit on the unstable API. The `{params, load}` split removes the bug by construction, with no tool.

**Diagnostic code format.** One descriptive code (e.g. SIGNAL_COERCED) works as the runtime `TypeError` prefix, the `fw check` code and a docs anchor. That favors descriptive codes over FW101-style numbers.

**Not resolved here** (unrelated to lint): primitive naming, training prior of the factory API, Proxy stores, `devtoolstooldiscovery`.

## 8. Artifacts (scratchpad)

Everything is under `/tmp/claude-1000/-home-and-ff/96b9f726-1e37-4313-9d48-852096c2ca84/scratchpad/`:

- `lint/fwlint-batch.ts`: the recommended checker, all rules, batched.
- `lint/fwlint.ts`: the naive per-node version.
- `lint71/fwlint71.ts`: the checker running on 7.1-dev with the shim.
- `lint/fw-oxlint-plugin.js` + `lint/.oxlintrc.json`: oxlint JS plugin, syntactic rules.
- `lint/.oxlintrc.type.json`: tsgolint built-in rules.
- `lint6/eslint.config.js`: typescript-eslint custom type-aware rules on TS 6.
- `lint/app/src/bad.ts`, `fw.ts`: fixtures.
- `lint/big/`: 500-file perf corpus.
- `lint/brand/a.ts`: Handler brand type test.
- `lint/brand/trap.mjs`: `toPrimitive` runtime trap test.
- `lint/modres/`: moduleResolution matrix.
- `lint/ovl/`: overload error comparison.

IMPLICATIONS
- Make `fw check` the one required gate, not `tsc --noEmit`. It runs on TypeScript 7's `typescript/unstable/sync` API, which ships in typescript@7.0.2. One pass reports tsc's own diagnostics plus the framework rules, with a `--json` mode for agents. Evidence: the prototype caught all 18 expected hits, most of which tsc 7.0.2 misses (decorators, `accessor`, `./x.js`, `${count}`, `onClick: count`, `title()`). It flagged nothing in the fixture's valid lines and adds no new dependencies.
- Pin the peer dependency to `typescript` ">=7.0.2 <7.2" and keep a small compatibility shim. Move to the stable API when 7.1 ships on 2026-11-24. Evidence: the same checker crashed on 7.1.0-dev.20260925.1 ('Cannot update an inactive snapshot') because `updateSnapshot` became `createSnapshot().update`. After a one-line fix it worked, and all AST and checker calls were unchanged.
- Require type rules to batch their queries: one `getTypeAtLocation(nodes[])` call per file, results memoized by type id, and only Identifier or PropertyAccess nodes queried. Evidence: on 500 files / 12k lines, per-node queries took 87 s, batched took 3.8 s, tsc took 3.1 s, and ESLint with typescript-eslint on TS 6 took 25.8 s.
- Make a signal used as an event handler a type error instead of a lint rule: `type Handler<E> = ((e: E) => void) & { readonly [SIGNAL]?: never }`. Evidence: tsc 7.0.2 rejects `onClick: count` with TS2322 and still accepts arrow functions, handlers with an inferred `e`, and named handlers.
- Make coercing a signal a runtime error: give signal functions a shared prototype whose `Symbol.toPrimitive` throws `SIGNAL_COERCED`. Evidence: it traps template literals, `"x"+count`, `String(count)` and `count+1` right at the faulty line, while `count()`, `.call` and `.bind` keep working. `fw check` reports the same code, and tsgolint's `restrict-template-expressions` and `restrict-plus-operands` are an optional generic backup.
- Keep `SNAPSHOT_TO_ACCESSOR` (passing `title()` where an accessor is accepted) as the only heuristic type-aware rule. Report it as a warning, with an explicit escape hatch for one-shot reads that are intentional. Nothing at the type level can tell `title()` from a plain string when the prop accepts `T | () => T`.
- In the v1 public API, use a string method `dispose()` and never `[Symbol.dispose]`. Keep `lib: ["es2025","dom"]` and forbid adding `esnext.disposable`. Evidence: BCD 8.1.3 lists Safari as preview-only and iOS as unsupported, and Safari 27 is current. tsc rejects Symbol.dispose (TS2550) and `using` (TS2318) under es2025, but accepts both once esnext.disposable is added. Keep a `NO_USING` rule, because TS2318 gives no file or line.
- Use tsconfig `module`/`moduleResolution: nodenext` with `allowImportingTsExtensions` and `noEmit`, and have `fw check` enforce `.ts` specifiers. Have `fw check` rewrite TS2835's suggestion from `.js` to `.ts`. Evidence: nodenext also catches extensionless imports (TS2835) and JSON imported without `with {type:'json'}` (TS1543), which bundler does not. Neither mode rejects `./x.js`.
- Add `NO_DECORATORS` and `NO_ACCESSOR` to `fw check`, and correct the ai-failure-modes wording. Evidence: tsc with erasableSyntaxOnly exits 0 on `@dec class`, and amaro passes it through unchanged. The engine then throws a SyntaxError, not ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. The same happens with `accessor`.
- Base `TLA_OUTSIDE_ENTRY` on a platform fact. BCD marks top-level await in Safari 15 to 26.6 as partial (WebKit bug 242740, fixed in 27), and Safari 26 is still in the evergreen support window. `fw check` should read the entry module from index.html.
- Do not make typescript-eslint running on TS 6 a dependency of the framework. It works, but it pulls in about 77 MB of packages and was 7x slower. It checks types with the TS 6 checker, and `node_modules/.bin/tsc` can silently resolve to 6.0.3 (typescript-go#4567, verified locally). Offer an oxlint JS plugin only as an optional source of in-editor syntactic warnings.
- Recommend avoiding overloads in the framework API for a TS 7 reason too. Evidence: with two same-arity overloads, tsc 7.0.2 prints only 'The last overload gave the following error', while 6.0.3 lists each overload. This was deterministic in pretty and non-pretty modes. Always print `tsc -v` in experiments, because of the bin-shadowing trap.
- Set `engines` to ">=24.12" (24 LTS or 26) and drop Node 25. Evidence: v25 is EOL, v26 becomes LTS on 2026-10-28, and type stripping became stable in 24.12.0 and 25.2.0 (nodejs/node#60600). Re-run all experiments on a supported Node version.

OPEN
- Will TS 7.1 stable keep the `typescript/unstable/*` entry points, or move them to a new stable path? How far will the API differ from 7.0.2 and from the 2026-09-25 nightly? Re-test `fw check` on the 7.1 beta when it ships on 2026-10-06.
- Is it acceptable in the spec for `fw check` to depend on an API documented as unstable until 2026-11-24? Or should the type-aware rules ship behind a flag, with only the syntactic rules on by default until 7.1?
- How fast is batched `fw check` above 100k lines, and in watch/incremental mode? Only 12k lines / 500 files was measured (3.8 s). A persistent API session for editor-like use is untested.
- Does giving each signal function a custom prototype via `Object.setPrototypeOf`, for the toPrimitive trap, slow down V8, JSC or SpiderMonkey measurably compared with a plain closure? Needs a micro-benchmark before it becomes normative.
- Why did the earlier re-test find identical overload errors in TS 6.0.3 and 7.0.2 when this one found a difference with two same-arity overloads? The side-by-side `tsc` bin shadowing is a plausible cause but not confirmed.
- `nodenext` resolves bare specifiers with node/import conditions, while the browser uses import maps. Should `fw check` also check that bare imports match the import map? Is `customConditions: ['browser']` needed?
- When will typescript-eslint support TS 7? The only signal is JoshuaKGoldberg's 2026-09-11 comment ('I'm working on this. I don't know how long it will take.'). Will oxlint ever expose type information to JS plugins? No roadmap was found.
- How should editors show framework diagnostics? The TS 7 LSP has no plugin hook. The 7.1 roadmap only mentions VS Code-level LSP client middleware. Is an oxlint-plugin layer, syntactic only, worth maintaining alongside `fw check`?
- What should the escape hatch for SNAPSHOT_TO_ACCESSOR look like, for one-shot reads that are intentional: an `untrack()` or `peek()` call, or a comment directive? It also needs to fit the primitive naming that is still undecided.

SOURCES
- Announcing TypeScript 7.0 (side-by-side with 6.0, no API in 7.0): https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- Announcing TypeScript 7.0 RC (stable API not until 7.1): https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/
- TypeScript 7.1 Iteration Plan (microsoft/TypeScript#63703): https://github.com/microsoft/TypeScript/issues/63703
- API feature roadmap (microsoft/TypeScript#63875), incl. andrewbranch on compiler plugins: https://github.com/microsoft/TypeScript/issues/63875
- SyncRpcChannel reads private stdout._handle.fd, breaks sync API on Bun (microsoft/TypeScript#64387): https://github.com/microsoft/TypeScript/issues/64387
- tsc incorrectly points to v6 rather than v7 (microsoft/typescript-go#4567): https://github.com/microsoft/typescript-go/issues/4567
- TypeScript 7.1 milestone (typescript-go, repo archived 2026-09-01): https://github.com/microsoft/typescript-go/milestone/6
- typescript-eslint: TypeScript 7.0.2 Support (#12518, closed not planned): https://github.com/typescript-eslint/typescript-eslint/issues/12518
- typescript-eslint: Use TS 7 (tsgo) for type information (#10940): https://github.com/typescript-eslint/typescript-eslint/issues/10940
- Oxlint JS Plugins docs (alpha; no type-aware rules): https://oxc.rs/docs/guide/usage/linter/js-plugins
- Oxlint JS Plugins Alpha (2026-03-11): https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha
- Oxlint Type-Aware Linting docs: https://oxc.rs/docs/guide/usage/linter/type-aware.html
- Type-Aware Linting Stable (tsgolint v7, 2026-07-22): https://oxc.rs/blog/2026-07-22-type-aware-linting-stable
- oxc-project/tsgolint README (no custom rules): https://github.com/oxc-project/tsgolint
- InfoQ: tsgolint Reaches Stable v7: https://www.infoq.com/news/2026/09/tsgolint-oxlint-typescript/
- Biome linter plugins (GritQL): https://biomejs.dev/linter/plugins/
- folio-assistant PR #994: TS 7 compiler API exists under unstable paths: https://github.com/litlfred/folio-assistant/pull/994
- Node.js previous releases (v25 EOL, v26 current): https://nodejs.org/en/about/previous-releases
- nodejs/Release schedule.json: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- Node.js v24.12.0 release notes (type stripping stable, #60600): https://github.com/nodejs/nodejs.org/blob/main/apps/site/pages/en/blog/release/v24.12.0.md
- npm registry: typescript (7.0.2 exports incl. ./unstable/*, next = 7.1.0-dev.20260925.1): https://registry.npmjs.org/typescript
- npm registry: @mdn/browser-compat-data 8.1.3: https://registry.npmjs.org/@mdn/browser-compat-data
- npm registry: @arrow-js/core (1.0.0 on 2026-03-20): https://registry.npmjs.org/@arrow-js/core