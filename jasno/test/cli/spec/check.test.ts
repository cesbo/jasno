// Conformance probes for `jasno check` (design.md ADR-24, ADR-26, ADR-33, (c) check rows, (e) check 1-7).
// Written against the spec (and ADR-24's "no false positive on correct code").
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, before, test } from 'node:test';
import { check } from '../../../cli/check.ts';
import { main } from '../../../cli/main.ts';
import { INDEX, JASNO, link, project, reporter } from '../fixture.ts';

const DESIGN = join(JASNO, '..', 'design');
const DTS = join(DESIGN, 'jasno.d.ts');
const OPTIONS = {
  target: 'es2025', module: 'nodenext', moduleResolution: 'nodenext', lib: ['es2025', 'dom'], types: [],
  strict: true, noEmit: true, allowImportingTsExtensions: true, erasableSyntaxOnly: true, verbatimModuleSyntax: true,
  exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, skipLibCheck: true,
};
const TEST_CONFIG = JSON.stringify({ extends: './tsconfig.json', compilerOptions: { types: ['node'] }, include: [DTS, 'src/**/*.test.ts', 'e2e', 'playwright.config.ts'], exclude: [] });
const BASE: Record<string, string | undefined> = {
  'package.json': JSON.stringify({ name: 'app', type: 'module', imports: { '#config': './src/config.ts' }, dependencies: { jasno: '*' } }),
  'index.html': INDEX,
  'tsconfig.json': JSON.stringify({ compilerOptions: OPTIONS, include: [DTS, 'src'], exclude: ['src/**/*.test.ts'] }),
  'tsconfig.test.json': TEST_CONFIG,
  'src/main.ts': "import { mount } from '@jasno/core';\nawait Promise.resolve();\nexport { mount };\n",
  'src/config.ts': 'export default { api: "/api" };\n',
};

const apps: { remove(): void }[] = [];
after(() => { for (const a of apps) a.remove(); });

interface Run { code: number; lines: string[]; root: string }

async function run(files: Record<string, string | undefined>, opts: { strict?: boolean; api?: boolean; ci?: string } = {}): Promise<Run> {
  const app = project(files);
  apps.push(app);
  link(app.root, 'typescript');
  link(app.root, '@types/node');
  const r = reporter(app.root);
  const saved = process.env.CI;
  if (opts.ci === undefined) delete process.env.CI; else process.env.CI = opts.ci;
  try {
    const code = await check(app.root, { strict: opts.strict ?? true, api: opts.api }, r.reporter);
    return { code, lines: r.lines, root: app.root };
  } finally {
    if (saved === undefined) delete process.env.CI; else process.env.CI = saved;
  }
}

const dump = (r: Run): string => r.lines.join('\n');
const has = (r: Run, prefix: string): void => assert.ok(r.lines.some((l) => l.startsWith(prefix)), `missing "${prefix}" in:\n${dump(r)}`);
const lacks = (r: Run, prefix: string): void => assert.ok(!r.lines.some((l) => l.startsWith(prefix)), `unexpected "${prefix}" in:\n${dump(r)}`);
/** No rule or tsc diagnostic at all in files whose path starts with prefix. */
const clean = (r: Run, prefix: string): void => {
  const bad = r.lines.filter((l) => l.startsWith(prefix));
  assert.deepEqual(bad, [], dump(r));
};

/** Every .ts file under dir as { 'src/<rel>': text }. */
function tree(dir: string, into: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) visit(p);
      else if (name.endsWith('.ts')) out[`${into}/${relative(dir, p).split('\\').join('/')}`] = readFileSync(p, 'utf8');
    }
  };
  visit(dir);
  return out;
}

// ------------------------------------------------ 1. real, correct jasno code

test('the design example passes jasno check --strict', async () => {
  const r = reporter(join(DESIGN, 'example'));
  const saved = process.env.CI;
  delete process.env.CI;
  try {
    const code = await check(join(DESIGN, 'example'), { strict: true }, r.reporter);
    assert.deepEqual(r.lines, ['typescript 7.0.2', 'jasno check: 0 errors, 0 warnings.']);
    assert.equal(code, 0);
  } finally {
    if (saved !== undefined) process.env.CI = saved;
  }
});

test('the RECIPES (tools/agents-samples as src/, the test-only startAt in a test file) pass --strict', async () => {
  const samples = tree(join(DESIGN, 'tools', 'agents-samples'), 'src');
  const line = "export const startAt = (url: string) => history.replaceState(null, '', url);   // route tests only\n";
  assert.ok(samples['src/recipes.ts']!.includes(line), 'recipes.ts changed; update this probe');
  samples['src/recipes.ts'] = samples['src/recipes.ts']!.replace(line, '\n');
  samples['src/start.test.ts'] = line;
  const r = await run({ ...BASE, ...samples });
  assert.deepEqual(r.lines, ['typescript 7.0.2', 'jasno check: 0 errors, 0 warnings.']);
  assert.equal(r.code, 0);
});

test('the router probe app: the only rule diagnostic is its deliberate location.pathname read (USE_ROUTER warn)', async () => {
  const r = await run({ ...BASE, 'src/main.ts': undefined, 'src/config.ts': undefined, ...tree(join(JASNO, 'test', 'browser', 'app', 'src'), 'src') });
  const rules = r.lines.slice(1, -1).filter((l) => !/^\S+ TS\d+ /.test(l));
  assert.equal(rules.length, 1, dump(r));
  assert.match(rules[0]!, /^src\/routes\.ts:24:65 USE_ROUTER location\.pathname/);
});

// Hand-written correct code that stresses each rule. strict: true, so any warning counts.
const FP: Record<string, string> = {
  // Clean files: nothing may be reported in src/clean-*.
  'src/clean-types.ts': [
    'export interface Bag { readonly size: number; readonly items: readonly string[] }',
    'export type Point = { readonly x: number };',
    'export abstract class Shape { area(): number { return 0; } }',
    'declare global { interface Window { readonly appVersion: string } }',
    'export const using = 1;',
    'export const twice = using + using;',
    '// @decorator in a comment',
    "export const at = '@decorator in a string';",
    "import type { Point as P2 } from './clean-types.ts';",
    'export type P3 = P2;',
    '',
  ].join('\n'),
  'src/clean-data.json': '{"a":1}',
  'src/clean-json.ts': "import data from './clean-data.json' with { type: 'json' };\nexport default data;\n",
  'src/clean-dom.ts': [
    "import { css, h } from '@jasno/core';",
    'declare function load(): Promise<string>;',
    'export const read = (el: HTMLElement) => el.innerHTML.length + el.outerHTML.length;',
    "export const card = h.div({ class: 'card' }, 'x');",
    'export const sheet = css`.card { outline: none; } h1 { all: unset; } .spinner:hover { outline: 0; }`;',
    'export const other = h.button({ onclick: async () => { const o = { currentTarget: 1 }; await load(); return o.currentTarget; } }, "x");',
    'export const props = { onRename: async (e: { currentTarget: string }) => { await load(); return e.currentTarget; } };',
    "export const u = new URL('../assets/logo.png', import.meta.url);",
    '',
  ].join('\n'),
  // Findings: one file per rule so each test looks at its own lines.
  'src/fp-index.ts': 'export type Dict = { readonly [key: string]: number };\nexport interface Names { readonly [id: string]: string }\n',
  'src/fp-triple.ts': [
    '// Tests get Node types from tsconfig.test.json; never write /// <reference types="node" /> here.',
    'export const doc = \'/// <reference types="node" />\';',
    '',
  ].join('\n'),
  'src/fp-focus.ts': "import { css, h } from '@jasno/core';\nexport const sheet = css`\n  button:focus:not(:focus-visible) { outline: none; }\n`;\nexport const b = h.button(null, 'x');\n",
  'src/fp-location.ts': 'export function label(location: { pathname: string; search: string }): string { return location.pathname + location.search; }\n',
  'src/fp-history.ts': [
    'export class UndoHistory { pushState(s: string): void { void s; } replaceState(s: string): void { void s; } }',
    'const history = new UndoHistory();',
    "history.pushState('a');",
    "export function undo(doc: { history: UndoHistory }) { doc.history.replaceState('b'); }",
    '',
  ].join('\n'),
  'src/fp-worker.ts': "class Worker { name: string; constructor(name: string) { this.name = name; } }\nexport const w = new Worker('Ada');\n",
  'src/fx-lib.ts': 'export function effect(fn: () => void): void { fn(); }\nexport function component<T>(fn: T): T { return fn; }\n',
  'src/fp-names.ts': "import { component, effect } from './fx-lib.ts';\neffect(() => { void fetch('/ping'); });\nexport const widget = component(() => 1);\n",
  'src/fp-css.ts': "const css = (s: TemplateStringsArray): string => s.join('');\nexport const txt = css`button { outline: none; }`;\n",
  'src/fp-handlers.ts': [
    "import { h } from '@jasno/core';",
    'declare function load(): Promise<string>;',
    'export const b = h.button({ onclick: async (e) => {',
    '  const text = await load();',
    "  const dlg = h.dialog({ onclose: (e) => { if (e.currentTarget.returnValue === 'yes') console.log(text); } });",
    '  document.body.append(dlg);',
    "} }, 'Open');",
    'export const retry = { once: async (x: { currentTarget: string }) => { await load(); return x.currentTarget; } };',
    'export const c = h.button({ onclick: async (e) => {',
    '  if (!e.isTrusted) { await load(); return; }',
    '  e.currentTarget.disabled = true;',
    "} }, 'Go');",
    '',
  ].join('\n'),
  'src/fp-effect.ts': [
    "import { effect, signal } from '@jasno/core';",
    'const enabled = signal(true);',
    'export const stop = effect(() => {',
    '  if (!enabled()) return;',
    "  const onKey = async (e: KeyboardEvent) => { if (e.key === 's') await navigator.clipboard.writeText('x'); };",
    "  window.addEventListener('keydown', onKey);",
    "  return () => window.removeEventListener('keydown', onKey);",
    '});',
    '',
  ].join('\n'),
};

let fp: Run;
before(async () => {
  fp = await run({
    ...BASE,
    ...FP,
    // A commented-out import map is not an import map.
    'index.html': INDEX.replace('<!--jasno:head-->', '<!--jasno:head-->\n  <!-- migrated: <script type="importmap">{"imports":{}}</script> -->'),
  });
});

test('correct code stays clean: interface/type readonly, abstract class, `using` as a name, decorators in text, JSON and type imports, innerHTML reads, non-interactive outline resets, other currentTarget', () => {
  clean(fp, 'src/clean-');
  lacks(fp, 'src/main.ts');
});

test('NO_TS_CLASS_MODIFIER does not fire on `readonly` index signatures in a type literal and an interface (spec: "members"; error on correct code)', () => {
  clean(fp, 'src/fp-index.ts');
});

test('NODE_TYPES_IN_BROWSER_CODE does not fire on the triple-slash text inside a // comment and a string (only a leading directive references types)', () => {
  clean(fp, 'src/fp-triple.ts');
});

test('FOCUS_STYLE_REMOVED does not fire on `button:focus:not(:focus-visible) { outline: none }`, which keeps the keyboard focus ring (ADR-24 policy)', () => {
  clean(fp, 'src/fp-focus.ts');
});

test('USE_ROUTER (warn) does not fire on a parameter named location that is not window.location (ADR-24 policy)', () => {
  clean(fp, 'src/fp-location.ts');
});

test('USE_ROUTER (error) does not fire on pushState/replaceState of an object that is not window.history', () => {
  clean(fp, 'src/fp-history.ts');
});

test('WORKER_UNSUPPORTED does not fire on `new Worker` of a local class', () => {
  clean(fp, 'src/fp-worker.ts');
});

test('ASYNC_IN_EFFECT, ANONYMOUS_COMPONENT, COMPONENT_RETURN_TYPE fire on effect()/component() imported from another module (ADR-24 policy)', () => {
  clean(fp, 'src/fp-names.ts');
});

test('FOCUS_STYLE_REMOVED does not fire on a local tag function named css (ADR-24 policy)', () => {
  clean(fp, 'src/fp-css.ts');
});

test('CURRENT_TARGET_AFTER_AWAIT does not fire on a nested handler\'s own `e` created after the await', () => {
  lacks(fp, 'src/fp-handlers.ts:5:');
});

test('CURRENT_TARGET_AFTER_AWAIT does not fire on a property named `once` (not an on* handler)', () => {
  lacks(fp, 'src/fp-handlers.ts:8:');
});

test('CURRENT_TARGET_AFTER_AWAIT fires when the only await is in an early-return branch (positional "after the first await")', () => {
  lacks(fp, 'src/fp-handlers.ts:11:');
});

test('ASYNC_IN_EFFECT does not fire on an effect that only installs an async event listener with a cleanup (spec wording; ADR-24 policy)', () => {
  clean(fp, 'src/fp-effect.ts');
});

test('IMPORT_MAP_HANDWRITTEN does not fire on an import map inside an HTML comment', () => {
  lacks(fp, 'index.html');
});

test('a browser file a test imports gets tsc errors from the test program\'s Node types (setTimeout(): Timeout), ADR-26', async () => {
  const r = await run({
    ...BASE,
    'src/timer.ts': 'export function later(fn: () => void): number { const t: number = setTimeout(fn, 10); return t; }\n',
    'src/timer.test.ts': "import { test } from 'node:test';\nimport { later } from './timer.ts';\ntest('x', () => { later(() => {}); });\n",
  });
  clean(r, 'src/timer.ts');
});

// ------------------------------------------------ 2. each catalogue row, smallest failing example

const FN: Record<string, string> = {
  'index.html': INDEX.replace('<!--jasno:head-->', '<!--jasno:head-->\n  <script type="importmap">{"imports":{}}</script>'),
  'src/main.ts': "import { mount } from '@jasno/core';\nimport { util } from '../lib/util.ts';\nawait Promise.resolve();\nexport { mount, util };\n",
  'lib/util.ts': "await Promise.resolve();\nexport const util = new SharedWorker('/w.js');\nexport function go() { history.pushState(null, '', '/x'); }\n",
  'src/mods.ts': [
    'export abstract class A {',
    '  protected a = 1;',
    '  public b = 2;',
    '  declare c: number;',
    '  abstract m(): void;',
    '}',
    'export class B extends A {',
    '  override m(): void {}',
    '  static accessor d = 1;',
    '}',
    '',
  ].join('\n'),
  'src/using.ts': [
    'export async function f() {',
    '  await using r = { async [Symbol.asyncDispose]() {} };',
    '  for (using x of [{ [Symbol.dispose]() {} }]) void x;',
    '  return r;',
    '}',
    '',
  ].join('\n'),
  'src/deco.ts': 'function dec(v: unknown, _c: unknown) { return v as never; }\n@dec\nexport class D {\n  @dec x = 1;\n}\n',
  'src/tla.ts': 'for await (const x of [Promise.resolve(1)]) void x;\nexport {};\n',
  'src/strip.ts': 'export namespace N { export const x = 1; }\n',
  'src/nodeimp.ts': "export * from 'node:path';\nexport type T = typeof import('node:fs');\nexport const load = () => import('node:fs');\n",
  'src/sinks.ts': [
    'export function sinks(el: HTMLElement, frame: HTMLIFrameElement) {',
    "  el.outerHTML = '<b>';",
    "  frame.srcdoc = '<p>';",
    "  el.innerHTML += '<i>';",
    "  el['innerHTML'] = '<u>';",
    "  document.write('x');",
    "  window.history.replaceState(null, '', '/y');",
    '  const a = document.location.search;',
    '  const b = window.location.pathname;',
    '  const c = globalThis.location.search;',
    "  const w = new window.Worker('/w.js');",
    "  const s = new SharedWorker('/s.js');",
    '  return [a, b, c, w, s];',
    '}',
    '',
  ].join('\n'),
  'src/handlers.ts': [
    "import { h } from '@jasno/core';",
    'declare function save(): Promise<void>;',
    'export const a = h.button({ async onclick(e) { await save(); e.currentTarget.disabled = true; } }, "x");',
    'export function wire(el: HTMLButtonElement) {',
    '  el.addEventListener("click", async (e) => { await save(); console.log(e.currentTarget); });',
    '  el.onclick = async (e) => { await save(); console.log(e.currentTarget); };',
    '}',
    'export const b = h.button({ onclick: async (e) => { for await (const x of [save()]) void x; e.currentTarget.disabled = true; } }, "x");',
    '',
  ].join('\n'),
  'src/effects.ts': [
    "import { effect, signal } from '@jasno/core';",
    'const id = signal(1);',
    "export const a = effect(() => { void import('./config.ts').then((m) => m.default.api + id()); });",
    'export const b = effect(() => { const run = async () => { await 1; }; void run; });',
    "export const c = effect(() => { void fetch('/x'); });",
    '',
  ].join('\n'),
  'src/comp.ts': [
    "import { component, h, signal, type Read } from '@jasno/core';",
    'export const Card = (): Node => h.div(null);',
    'export const Anon = component(function (): Node { return h.div(null); });',
    'export const NoType = component(function NoType() { return h.div(null); });',
    'export const Live = component(function Live(p: { title: Read<string> }): Node {',
    "  const name = signal('x');",
    '  const n = signal(1);',
    "  return h.div({ title: `t: ${p.title}` }, h.input({ value: name() }), h.p(null, () => n + '!'), h.p(null, () => String(p.title)));",
    '});',
    'export const Child = component(function Child(): Node {',
    "  const notice = signal('');",
    '  return h.p({ role: \'status\' }, notice());',
    '});',
    '',
  ].join('\n'),
  'src/styles.ts': [
    "import { css, h } from '@jasno/core';",
    'export const s = css`',
    '  .x button { all: unset; }',
    '  [tabindex] { outline: 0; }',
    '  * { outline: none; }',
    '  .row:focus-within { outline: none; }',
    '  [contenteditable] { all: initial; }',
    '  summary { all: revert; }',
    '  .nav { a { outline: 0px; } }',
    '  .pill { outline: none !important; }',
    '  .tab:focus { outline: 0; }',
    '  input, select, textarea { outline: none; }',
    '`;',
    "export const l = h.a({ href: '/', class: 'pill' }, 'x');",
    '',
  ].join('\n'),
  'src/assets.ts': "export const a = new URL('./logo.png', import.meta.url);\nexport const b = new URL(`../src/x.png`, import.meta.url);\n",
  'src/imports.ts': "import x from 'devdep';\nimport y from '#nokey';\nexport const z = () => import('left-pad');\nexport { x, y };\n",
  'src/ext.ts': "export { mount } from './main';\nexport const m = () => import('./config.js');\n",
  'src/env.d.ts': '/// <reference types="node" />\n',
};

let fn: Run;
before(async () => { fn = await run({ ...BASE, ...FN }); });

test('NO_TS_CLASS_MODIFIER: protected, public, declare, override members', () => {
  has(fn, 'src/mods.ts:2:3 NO_TS_CLASS_MODIFIER');
  has(fn, 'src/mods.ts:3:3 NO_TS_CLASS_MODIFIER');
  has(fn, 'src/mods.ts:4:3 NO_TS_CLASS_MODIFIER');
  has(fn, 'src/mods.ts:8:3 NO_TS_CLASS_MODIFIER');
});

test('NO_TS_CLASS_MODIFIER catches `abstract` members (SyntaxKind reverse mapping gives FirstContextualKeyword)', () => {
  has(fn, 'src/mods.ts:5:3 NO_TS_CLASS_MODIFIER');
});

test('NO_ACCESSOR on a static accessor; NO_USING on await using and for (using ...); NO_DECORATORS on class and field decorators', () => {
  has(fn, 'src/mods.ts:9:10 NO_ACCESSOR');
  has(fn, 'src/using.ts:2:3 NO_USING');
  has(fn, 'src/using.ts:3:8 NO_USING');
  has(fn, 'src/deco.ts:2:1 NO_DECORATORS');
  has(fn, 'src/deco.ts:4:3 NO_DECORATORS');
});

test('TLA_OUTSIDE_ENTRY on a top-level for await; the entry may await', () => {
  has(fn, 'src/tla.ts:1:1 TLA_OUTSIDE_ENTRY');
  lacks(fn, 'src/main.ts:3:1 TLA_OUTSIDE_ENTRY');
});

test('SYNTAX_REJECTED: a namespace the stripper rejects', () => {
  assert.ok(fn.lines.some((l) => l.startsWith('src/strip.ts:1:') && l.includes('SYNTAX_REJECTED')), dump(fn));
});

test('NODE_TYPES_IN_BROWSER_CODE: export * from node:, typeof import(node:)', () => {
  has(fn, 'src/nodeimp.ts:1:1 NODE_TYPES_IN_BROWSER_CODE');
  has(fn, 'src/nodeimp.ts:2:17 NODE_TYPES_IN_BROWSER_CODE');
});

test('NODE_TYPES_IN_BROWSER_CODE catches a dynamic import(\'node:fs\') in a browser file (the lexer path runs only without the AST)', () => {
  assert.ok(fn.lines.some((l) => l.startsWith('src/nodeimp.ts:3:') && l.includes('NODE_TYPES_IN_BROWSER_CODE')), dump(fn));
});

test('NODE_TYPES_IN_BROWSER_CODE catches /// <reference types="node" /> in a .d.ts under src/ (Node globals leak into the browser program, ADR-26 C1)', () => {
  has(fn, 'src/env.d.ts:1:1 NODE_TYPES_IN_BROWSER_CODE');
});

test('NO_HTML_SINK: outerHTML, srcdoc, innerHTML +=, document.write; USE_ROUTER: window.history.replaceState, document.location.search, window.location.pathname; WORKER_UNSUPPORTED: SharedWorker', () => {
  has(fn, 'src/sinks.ts:2:6 NO_HTML_SINK');
  has(fn, 'src/sinks.ts:3:9 NO_HTML_SINK');
  has(fn, 'src/sinks.ts:4:6 NO_HTML_SINK');
  has(fn, 'src/sinks.ts:6:3 NO_HTML_SINK');
  has(fn, 'src/sinks.ts:7:3 USE_ROUTER');
  assert.ok(fn.lines.some((l) => l.startsWith('src/sinks.ts:8:13 USE_ROUTER')), dump(fn));
  assert.ok(fn.lines.some((l) => l.startsWith('src/sinks.ts:9:13 USE_ROUTER')), dump(fn));
  has(fn, 'src/sinks.ts:12:13 WORKER_UNSUPPORTED');
});

test('el[\'innerHTML\'] = (NO_HTML_SINK), globalThis.location.search (USE_ROUTER), new window.Worker (WORKER_UNSUPPORTED) are missed', () => {
  assert.ok(fn.lines.some((l) => l.startsWith('src/sinks.ts:5:') && l.includes('NO_HTML_SINK')), dump(fn));
  assert.ok(fn.lines.some((l) => l.startsWith('src/sinks.ts:10:') && l.includes('USE_ROUTER')), dump(fn));
  assert.ok(fn.lines.some((l) => l.startsWith('src/sinks.ts:11:') && l.includes('WORKER_UNSUPPORTED')), dump(fn));
});

test('CURRENT_TARGET_AFTER_AWAIT in an addEventListener callback', () => {
  has(fn, 'src/handlers.ts:5:73 CURRENT_TARGET_AFTER_AWAIT');
});

test('CURRENT_TARGET_AFTER_AWAIT catches an h.* method-shorthand handler, an el.onclick = async handler and a for await', () => {
  assert.ok(fn.lines.some((l) => l.startsWith('src/handlers.ts:3:') && l.includes('CURRENT_TARGET_AFTER_AWAIT')), `method shorthand:\n${dump(fn)}`);
  assert.ok(fn.lines.some((l) => l.startsWith('src/handlers.ts:6:') && l.includes('CURRENT_TARGET_AFTER_AWAIT')), `el.onclick:\n${dump(fn)}`);
  assert.ok(fn.lines.some((l) => l.startsWith('src/handlers.ts:8:') && l.includes('CURRENT_TARGET_AFTER_AWAIT')), `for await:\n${dump(fn)}`);
});

test('ASYNC_IN_EFFECT: .then( and fetch during the run; an async function the run only defines does not count', () => {
  has(fn, 'src/effects.ts:3:18 ASYNC_IN_EFFECT');
  lacks(fn, 'src/effects.ts:4:18 ASYNC_IN_EFFECT');
  has(fn, 'src/effects.ts:5:18 ASYNC_IN_EFFECT');
});

test('COMPONENT_NOT_WRAPPED (exported arrow), ANONYMOUS_COMPONENT (anonymous function expression), COMPONENT_RETURN_TYPE (named, unannotated)', () => {
  has(fn, 'src/comp.ts:2:14 COMPONENT_NOT_WRAPPED');
  has(fn, 'src/comp.ts:3:31 ANONYMOUS_COMPONENT');
  lacks(fn, 'src/comp.ts:3:31 COMPONENT_RETURN_TYPE');
  has(fn, 'src/comp.ts:4:33 COMPONENT_RETURN_TYPE');
  lacks(fn, 'src/comp.ts:4:33 ANONYMOUS_COMPONENT');
});

test('type-aware: SIGNAL_IN_TEMPLATE on a Read prop, SIGNAL_COERCED on signal + string and String(Read), SNAPSHOT_TO_ACCESSOR on a signal read in setup', () => {
  has(fn, 'src/comp.ts:8:31 SIGNAL_IN_TEMPLATE');
  has(fn, 'src/comp.ts:8:61 SNAPSHOT_TO_ACCESSOR');
  has(fn, 'src/comp.ts:8:88 SIGNAL_COERCED');
  has(fn, 'src/comp.ts:8:121 SIGNAL_COERCED');
  has(fn, 'src/comp.ts:12:34 SNAPSHOT_TO_ACCESSOR'); // a child: h.p(null, count()), top mistake #1 (pilot kanban G6)
});

test('FOCUS_STYLE_REMOVED: all: unset/initial/revert, outline: 0/0px/none !important on tags, [tabindex], [contenteditable], *, :focus-within, :focus, nested a, a class on h.a', () => {
  for (const [line, col] of [[3, 15], [4, 16], [5, 7], [6, 23], [7, 23], [8, 13], [9, 14], [10, 11], [11, 16], [12, 29]]) {
    has(fn, `src/styles.ts:${line}:${col} FOCUS_STYLE_REMOVED`);
  }
});

test('ASSET_OUTSIDE_ASSETS: ./ and a template literal that resolves into src/', () => {
  has(fn, 'src/assets.ts:1:18 ASSET_OUTSIDE_ASSETS');
  has(fn, 'src/assets.ts:2:18 ASSET_OUTSIDE_ASSETS');
});

test('IMPORT_NOT_MAPPED: a devDependency, an unknown #key, a dynamic bare import', () => {
  has(fn, 'src/imports.ts:1:15 IMPORT_NOT_MAPPED');
  has(fn, 'src/imports.ts:2:15 IMPORT_NOT_MAPPED');
  has(fn, 'src/imports.ts:3:31 IMPORT_NOT_MAPPED');
});

test('TS_EXTENSION: export from an extensionless specifier, a dynamic import of .js', () => {
  has(fn, 'src/ext.ts:1:23 TS_EXTENSION');
  has(fn, 'src/ext.ts:2:31 TS_EXTENSION');
});

test('browser files reached through the index.html entry closure outside src/ get no browser rules (TLA_OUTSIDE_ENTRY, WORKER_UNSUPPORTED, USE_ROUTER), (e) check 3', () => {
  has(fn, 'lib/util.ts:1:1 TLA_OUTSIDE_ENTRY');
  has(fn, 'lib/util.ts:2:21 WORKER_UNSUPPORTED');
  has(fn, 'lib/util.ts:3:24 USE_ROUTER');
});

test('IMPORT_MAP_HANDWRITTEN on a real import map', () => {
  assert.ok(fn.lines.some((l) => l.startsWith('index.html') && l.includes('IMPORT_MAP_HANDWRITTEN')), dump(fn));
});

test('IMPORT_MAP_HANDWRITTEN prints no line:col although the <script> has one ((e): file:line:col CODE message)', () => {
  has(fn, 'index.html:7:3 IMPORT_MAP_HANDWRITTEN');
});

// ------------------------------------------------ 3. file classes

const NODE_BODY = [
  "import { readFileSync } from 'node:fs';",
  "import pad from 'devdep';",
  "import { component, h, signal } from '@jasno/core';",
  'await Promise.resolve();',
  'export function nodeStuff(el: HTMLElement) {',
  "  history.pushState(null, '', '/x');",
  '  const p = location.pathname;',
  "  el.innerHTML = '<b>';",
  "  const w = new Worker('/w.js');",
  "  const u = new URL('./logo.png', import.meta.url);",
  '  return [p, w, u, readFileSync, pad];',
  '}',
  'export class A {',
  '  private a = 1;',
  '  get v() { return this.a; }',
  '}',
  'export function f() {',
  '  using r = { [Symbol.dispose]() {} };',
  '  return r;',
  '}',
  "export { A as B } from './helper';",
  'const count = signal(0);',
  'export const s = `n=${count}`;',
  'export const Anon = component(() => h.div(null));',
  '',
].join('\n');
const NODE_FILES = ['src/x.test.ts', 'e2e/x.spec.ts', 'playwright.config.ts'];

let classes: Run;
before(async () => {
  classes = await run({ ...BASE, ...Object.fromEntries(NODE_FILES.map((f) => [f, NODE_BODY])), 'src/helper.ts': 'export class A {}\n', 'e2e/helper.ts': 'export class A {}\n', 'helper.ts': 'export class A {}\n' });
});

test('file classes: browser-only rules stay silent in *.test.ts, e2e/** and playwright.config.ts', () => {
  for (const f of NODE_FILES) {
    for (const code of ['IMPORT_NOT_MAPPED', 'NODE_TYPES_IN_BROWSER_CODE', 'WORKER_UNSUPPORTED', 'NO_HTML_SINK', 'USE_ROUTER', 'TLA_OUTSIDE_ENTRY', 'ASSET_OUTSIDE_ASSETS']) {
      assert.ok(!classes.lines.some((l) => l.startsWith(f) && l.includes(` ${code} `)), `${f} ${code}:\n${dump(classes)}`);
    }
  }
});

test('file classes: rules for all files fire in Node files (NO_TS_CLASS_MODIFIER, NO_USING, TS_EXTENSION, ANONYMOUS_COMPONENT, COMPONENT_RETURN_TYPE)', () => {
  for (const f of NODE_FILES) {
    has(classes, `${f}:14:3 NO_TS_CLASS_MODIFIER`);
    has(classes, `${f}:18:3 NO_USING`);
    has(classes, `${f}:21:24 TS_EXTENSION`);
    has(classes, `${f}:24:31 ANONYMOUS_COMPONENT`);
    has(classes, `${f}:24:31 COMPONENT_RETURN_TYPE`);
  }
});

test('SIGNAL_IN_TEMPLATE (not browser-only, (e) check 3) is skipped in Node files: typeRules run for browser files only', () => {
  for (const f of NODE_FILES) has(classes, `${f}:23:23 SIGNAL_IN_TEMPLATE`);
});

// ------------------------------------------------ TSCONFIG_DRIFT, TS_VERSION_UNSUPPORTED, TYPE_RULES_UNAVAILABLE

test('TSCONFIG_DRIFT: e2e files alone (no *.test.ts) need tsconfig.test.json; a test config that relaxes strict or adds esnext.disposable drifts', async () => {
  const e2e = await run({ ...BASE, 'tsconfig.test.json': undefined, 'e2e/app.spec.ts': 'export {};\n' });
  assert.ok(e2e.lines.some((l) => l.startsWith('tsconfig.test.json TSCONFIG_DRIFT') && l.includes('e2e/app.spec.ts')), dump(e2e));
  const relaxed = await run({
    ...BASE,
    'tsconfig.test.json': JSON.stringify({ extends: './tsconfig.json', compilerOptions: { types: ['node'], strict: false, lib: ['es2025', 'dom', 'esnext.disposable'] }, include: [DTS, 'src/**/*.test.ts'] }),
    'src/a.test.ts': 'export {};\n',
  });
  const drift = relaxed.lines.filter((l) => l.startsWith('tsconfig.test.json TSCONFIG_DRIFT'));
  assert.ok(drift.some((l) => l.includes('strict is false')), dump(relaxed));
  assert.ok(drift.some((l) => l.includes('esnext.disposable')), dump(relaxed));
});

test('TSCONFIG_DRIFT demands tsconfig.test.json for a project whose only Node file is playwright.config.ts ("a project without [test or e2e files] needs none")', async () => {
  const r = await run({ ...BASE, 'tsconfig.test.json': undefined, 'playwright.config.ts': 'export default {};\n' });
  lacks(r, 'tsconfig.test.json TSCONFIG_DRIFT');
});

test('TS_VERSION_UNSUPPORTED below the tested patch (7.0.1) and on another major (6.0.3)', async () => {
  for (const version of ['7.0.1', '6.0.3']) {
    const app = project({ ...BASE, 'node_modules/typescript/package.json': JSON.stringify({ name: 'typescript', version }) });
    apps.push(app);
    const r = reporter(app.root);
    assert.equal(await check(app.root, { strict: false }, r.reporter), 1);
    assert.equal(r.lines[0], `typescript ${version}`);
    assert.match(r.lines[1]!, /^TS_VERSION_UNSUPPORTED /);
  }
});

test('without the TS API: the stripped-text rules still run (syntax gate, IMPORT_NOT_MAPPED, runtime node: import, IMPORT_MAP_HANDWRITTEN, TSCONFIG_DRIFT), AST rules are skipped (CL-02), and CI fails the warning', async () => {
  const files = {
    ...BASE,
    'package.json': JSON.stringify({ name: 'app', imports: { '#config': './src/config.ts' }, dependencies: { jasno: '*' } }),
    'index.html': INDEX.replace('<!--jasno:head-->', '<script type="importmap">{}</script>'),
    'src/bad.ts': "import pad from 'left-pad';\nimport { readFileSync } from 'node:fs';\nexport { pad, readFileSync };\nexport function s(el: HTMLElement) { el.innerHTML = 'x'; }\n",
    'src/strip.ts': 'export enum E { A }\n',
  };
  const r = await run(files, { api: false, strict: false, ci: '1' });
  has(r, 'TYPE_RULES_UNAVAILABLE');
  assert.ok(r.lines.some((l) => l.startsWith('src/strip.ts:1:') && l.includes('SYNTAX_REJECTED')), dump(r));
  has(r, 'src/bad.ts:1:17 IMPORT_NOT_MAPPED');
  has(r, 'src/bad.ts:2:30 NODE_TYPES_IN_BROWSER_CODE');
  assert.ok(r.lines.some((l) => /^index\.html:\d+:\d+ IMPORT_MAP_HANDWRITTEN/.test(l)), dump(r));
  has(r, 'package.json TSCONFIG_DRIFT');
  assert.ok(!r.lines.some((l) => l.includes(' NO_HTML_SINK ')), `AST rule ran without the API:\n${dump(r)}`);
  assert.equal(r.code, 1);
  const warnOnly = await run(BASE, { api: false, strict: false, ci: '1' });
  assert.equal(warnOnly.code, 1, `CI set: TYPE_RULES_UNAVAILABLE fails\n${dump(warnOnly)}`);
});

// ------------------------------------------------ 4. output contract

const WARN_ONLY = { ...BASE, 'src/effects.ts': "import { effect } from '@jasno/core';\nexport const stop = effect(() => { void fetch('/x'); });\n" };

test('exit codes: a warning passes without --strict and fails when CI is set', async () => {
  const plain = await run(WARN_ONLY, { strict: false });
  assert.equal(plain.code, 0, dump(plain));
  assert.match(plain.lines.at(-1)!, /0 errors, 1 warning \(warnings fail only under --strict or CI\)/);
  const ci = await run(WARN_ONLY, { strict: false, ci: '1' });
  assert.equal(ci.code, 1, dump(ci));
});

test('--json through the CLI: one JSON object per line, the typescript version in the metadata, file:line:col fields', async () => {
  const app = project(WARN_ONLY);
  apps.push(app);
  link(app.root, 'typescript');
  link(app.root, '@types/node');
  const out: string[] = [];
  const log = console.log;
  const saved = process.env.CI;
  delete process.env.CI;
  console.log = (line: string) => { out.push(line); };
  let code: number;
  try { code = await main(['check', '--json'], app.root); } finally {
    console.log = log;
    if (saved !== undefined) process.env.CI = saved;
  }
  assert.equal(code, 0);
  const objects = out.map((l) => JSON.parse(l) as Record<string, unknown>);
  assert.deepEqual(objects[0], { info: 'typescript 7.0.2', typescript: '7.0.2' });
  const warn = objects.find((o) => o.code === 'ASYNC_IN_EFFECT');
  assert.ok(warn, out.join('\n'));
  assert.equal(warn.severity, 'warn');
  assert.equal(warn.file, 'src/effects.ts');
  assert.equal(warn.line, 2);
  assert.equal(warn.col, 21);
  assert.equal(typeof warn.message, 'string');
  assert.ok(objects.at(-1)!.info, 'summary line last');
});

test('tsc diagnostics print their related information; positions are UTF-16 columns (non-ASCII before the error)', async () => {
  const r = await run({
    ...BASE,
    'src/related.ts': "interface X { a: string }\nexport const x: X = {};\nexport const s = 'ü😀'; export const n: number = s;\n",
  });
  assert.ok(r.lines.some((l) => l.startsWith('src/related.ts:2:14 TS2741') && l.includes('related: src/related.ts:1:15')), dump(r));
  has(r, 'src/related.ts:3:38 TS2322');
});
