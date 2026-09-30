// jasno check (design.md (c), (e)): rule fixtures in temp projects, checked with the real TypeScript 7 API.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { check } from '../../cli/check.ts';
import { INDEX, JASNO, link, project, reporter } from './fixture.ts';

const DTS = join(JASNO, '..', 'design', 'jasno.d.ts');
const OPTIONS = {
  target: 'es2025', module: 'nodenext', moduleResolution: 'nodenext', lib: ['es2025', 'dom'], types: [],
  strict: true, noEmit: true, allowImportingTsExtensions: true, erasableSyntaxOnly: true, verbatimModuleSyntax: true,
  exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, skipLibCheck: true,
};
const BASE = {
  'package.json': JSON.stringify({ name: 'app', type: 'module', imports: { '#config': './src/config.ts' }, dependencies: { jasno: '*' } }),
  'index.html': INDEX,
  'tsconfig.json': JSON.stringify({ compilerOptions: OPTIONS, include: [DTS, 'src'], exclude: ['src/**/*.test.ts'] }),
  'tsconfig.test.json': JSON.stringify({ extends: './tsconfig.json', compilerOptions: { types: ['node'] }, include: [DTS, 'src/**/*.test.ts'], exclude: [] }),
  'src/main.ts': "import { mount } from 'jasno';\nimport config from '#config';\nawait Promise.resolve();\nexport { mount, config };\n",
  'src/config.ts': 'export default { api: "/api" };\n',
};

async function run(files: Record<string, string | undefined>, opts: { strict?: boolean; api?: boolean } = {}) {
  const app = project(files);
  apps.push(app);
  link(app.root, 'typescript');
  link(app.root, '@types/node');
  const r = reporter(app.root);
  const code = await check(app.root, { strict: opts.strict ?? false, api: opts.api }, r.reporter);
  return { code, lines: r.lines, root: app.root, has: (prefix: string) => r.lines.some((l) => l.startsWith(prefix)) };
}

const apps: { remove(): void }[] = [];
after(() => { for (const a of apps) a.remove(); });

let rules: Awaited<ReturnType<typeof run>>;
before(async () => {
  rules = await run({
    ...BASE,
    'src/tla.ts': 'await Promise.resolve();\nexport const later = async () => { await 1; };\n',
    'src/ext.ts': "import { mount } from './main.js';\nimport data from './data.json' with { type: 'json' };\nexport { mount, data };\n",
    'src/data.json': '{"a":1}',
    'src/classy.ts': 'export class A {\n  private a = 1;\n  readonly b = 2;\n  #ok = 3;\n  get ok() { return this.#ok + this.a + this.b; }\n}\n',
    'src/decorated.ts': 'function dec(v: unknown, _c: unknown) { return v; }\nexport class B {\n  @dec m() {}\n}\n',
    'src/accessor.ts': 'export class C {\n  accessor x = 1;\n}\n',
    'src/using.ts': 'export function f() {\n  using r = { [Symbol.dispose]() {} };\n  return r;\n}\n',
    'src/sinks.ts': [
      'export function sinks(el: HTMLElement) {',
      "  el.innerHTML = '<b>x</b>';",
      "  el.insertAdjacentHTML('beforeend', '<i>');",
      "  document.write('x');",
      "  history.pushState(null, '', '/x');",
      '  const p = location.pathname;',
      "  new Worker('/w.js');",
      "  void navigator.serviceWorker.register('/sw.js');",
      "  const u = new URL('./logo.png', import.meta.url);",
      "  const ok = new URL('/assets/logo.png', location.origin);",
      '  return [p, u, ok];',
      '}',
      '',
    ].join('\n'),
    'src/imports.ts': "import pad from 'left-pad';\nimport { mountTest } from 'jasno/testing';\nimport { readFileSync } from 'node:fs';\nimport type { Stats } from 'node:fs';\nexport { pad, mountTest, readFileSync };\nexport type { Stats };\n",
    'src/reference.ts': '/// <reference types="node" />\nexport const x = 1;\n',
    'src/handler.ts': [
      "import { h } from 'jasno';",
      'declare function save(): Promise<void>;',
      'export const a = h.button({ onclick: async (e) => { await save(); e.currentTarget.disabled = false; } }, "Save");',
      'export const b = h.button({ onclick: async (e) => { const el = e.currentTarget; await save(); el.disabled = false; } }, "Save");',
      'declare function send(d: FormData): Promise<void>;',
      'export const c = h.form({ onsubmit: async (e) => { e.preventDefault(); await send(new FormData(e.currentTarget)); } });',
      '',
    ].join('\n'),
    'src/effects.ts': "import { effect } from 'jasno';\nexport const stop = effect(() => { void fetch('/x'); });\nexport const fine = effect(() => { document.title = 'x'; });\n",
    'src/components.ts': [
      "import { component, h, signal } from 'jasno';",
      'export function Card(): Node { return h.div(null); }',
      "export const Anon = component(() => h.div(null));",
      'export const Named = component(function Named(): Node {',
      "  const name = signal('x');",
      '  return h.p({ title: name() }, h.span({ title: name }));',
      '});',
      '',
    ].join('\n'),
    'src/signals.ts': "import { signal } from 'jasno';\nconst count = signal(0);\nexport const a = `n=${count}`;\nexport const b = 'n=' + count;\nexport const c = String(count);\nexport const ok = `n=${count()}`;\n",
    'src/styles.ts': "import { css, h } from 'jasno';\nexport const sheet = css`\n  button { outline: none; }\n  .card { outline: 0; }\n  .link { color: red; }\n`;\nexport const b = h.button({ class: 'card primary' }, 'x');\n",
    'src/dup.ts': 'export const x = 1;\nexport { x as y };\nexport { x as y };\n',
    'src/stripfail.ts': 'enum E { A }\nexport { E };\n',
    'src/main.test.ts': "import { test } from 'node:test';\nimport { mount } from './main';\ntest('x', () => { void mount; });\n",
  });
});

const expect = (prefix: string): void => assert.ok(rules.has(prefix), `missing "${prefix}" in:\n${rules.lines.join('\n')}`);
const absent = (text: string): void => assert.ok(!rules.lines.some((l) => l.includes(text)), `unexpected "${text}" in:\n${rules.lines.join('\n')}`);

test('prints the loaded TypeScript version first and fails on errors', () => {
  assert.equal(rules.lines[0], 'typescript 7.0.2');
  assert.equal(rules.code, 1);
});

test('TLA_OUTSIDE_ENTRY: top-level await outside the entry; the entry and awaits inside functions are fine', () => {
  expect('src/tla.ts:1:1 TLA_OUTSIDE_ENTRY');
  absent('src/tla.ts:2');
  absent('src/main.ts:3:1 TLA_OUTSIDE_ENTRY');
});

test('TS_EXTENSION: a relative specifier that does not end in .ts (JSON modules keep .json), in browser and test files', () => {
  expect('src/ext.ts:1:23 TS_EXTENSION');
  absent('src/ext.ts:2');
  expect('src/main.test.ts:2:23 TS_EXTENSION');
});

test('NO_TS_CLASS_MODIFIER, NO_DECORATORS, NO_ACCESSOR, NO_USING', () => {
  expect('src/classy.ts:2:3 NO_TS_CLASS_MODIFIER');
  expect('src/classy.ts:3:3 NO_TS_CLASS_MODIFIER');
  absent('src/classy.ts:4');
  expect('src/decorated.ts:3:3 NO_DECORATORS');
  expect('src/accessor.ts:2:3 NO_ACCESSOR');
  expect('src/using.ts:2:3 NO_USING');
});

test('browser sinks: NO_HTML_SINK, USE_ROUTER (error and warn), WORKER_UNSUPPORTED, ASSET_OUTSIDE_ASSETS', () => {
  expect('src/sinks.ts:2:6 NO_HTML_SINK');
  expect('src/sinks.ts:3:3 NO_HTML_SINK');
  expect('src/sinks.ts:4:3 NO_HTML_SINK');
  expect('src/sinks.ts:5:3 USE_ROUTER');
  assert.ok(rules.lines.some((l) => l.startsWith('src/sinks.ts:6:13 USE_ROUTER') && l.includes('router.url()')));
  expect('src/sinks.ts:7:3 WORKER_UNSUPPORTED');
  expect('src/sinks.ts:8:8 WORKER_UNSUPPORTED');
  expect('src/sinks.ts:9:13 ASSET_OUTSIDE_ASSETS');
  absent('src/sinks.ts:10');
});

test('IMPORT_NOT_MAPPED and NODE_TYPES_IN_BROWSER_CODE (a node: import, type-only too, and the triple-slash reference)', () => {
  expect('src/imports.ts:1:17 IMPORT_NOT_MAPPED');
  assert.ok(rules.lines.some((l) => l.startsWith('src/imports.ts:2:27 IMPORT_NOT_MAPPED') && l.includes('for tests')));
  expect('src/imports.ts:3:1 NODE_TYPES_IN_BROWSER_CODE');
  expect('src/imports.ts:4:1 NODE_TYPES_IN_BROWSER_CODE');
  expect('src/reference.ts:1:1 NODE_TYPES_IN_BROWSER_CODE');
  absent('src/main.test.ts:1:22 IMPORT_NOT_MAPPED');
  absent('#config');
});

test('CURRENT_TARGET_AFTER_AWAIT: only after the first await; the awaited operand is read before the pause', () => {
  expect('src/handler.ts:3:67 CURRENT_TARGET_AFTER_AWAIT');
  absent('src/handler.ts:4');
  absent('src/handler.ts:6'); // await send(new FormData(e.currentTarget)): a false positive until 2026-09-30
});

test('ASYNC_IN_EFFECT (warn)', () => {
  expect('src/effects.ts:2:21 ASYNC_IN_EFFECT');
  absent('src/effects.ts:3');
});

test('COMPONENT_NOT_WRAPPED, ANONYMOUS_COMPONENT, COMPONENT_RETURN_TYPE (warn)', () => {
  expect('src/components.ts:2:17 COMPONENT_NOT_WRAPPED');
  expect('src/components.ts:3:31 ANONYMOUS_COMPONENT');
  expect('src/components.ts:3:31 COMPONENT_RETURN_TYPE');
  absent('src/components.ts:4');
});

test('type-aware: SIGNAL_IN_TEMPLATE, SIGNAL_COERCED (+ and String()), SNAPSHOT_TO_ACCESSOR', () => {
  expect('src/signals.ts:3:23 SIGNAL_IN_TEMPLATE');
  expect('src/signals.ts:4:25 SIGNAL_COERCED');
  expect('src/signals.ts:5:25 SIGNAL_COERCED');
  absent('src/signals.ts:6');
  expect('src/components.ts:6:23 SNAPSHOT_TO_ACCESSOR');
  absent('src/components.ts:6:47');
});

test('FOCUS_STYLE_REMOVED: outline removed on a tag or a class the file puts on an interactive h.* tag', () => {
  expect('src/styles.ts:3:12 FOCUS_STYLE_REMOVED');
  expect('src/styles.ts:4:11 FOCUS_STYLE_REMOVED');
  absent('src/styles.ts:5');
});

test('the syntax gate: a V8 parse error after stripping, and a file the stripper rejects', () => {
  expect('src/dup.ts:3:10 SYNTAX_REJECTED');
  expect('src/accessor.ts:2:12 SYNTAX_REJECTED');
  expect('src/stripfail.ts:1:1 SYNTAX_REJECTED');
});

test('tsc diagnostics come through as TS<code> lines with file:line:col', () => {
  expect('src/imports.ts:1:17 TS2307');
});

test('a clean project passes; warnings fail only under --strict (or CI)', async () => {
  const clean = await run(BASE);
  assert.equal(clean.code, 0, clean.lines.join('\n'));
  assert.deepEqual(clean.lines, ['typescript 7.0.2', 'jasno check: 0 errors, 0 warnings.']);
  const warn = { ...BASE, 'src/effects.ts': "import { effect } from 'jasno';\nexport const stop = effect(() => { void fetch('/x'); });\n" };
  assert.equal((await run(warn)).code, 0);
  assert.equal((await run(warn, { strict: true })).code, 1);
});

test('a :focus-visible rule anywhere in the program lifts FOCUS_STYLE_REMOVED', async () => {
  const r = await run({ ...BASE, 'src/styles.ts': "import { css } from 'jasno';\nexport const a = css`button { outline: none; }`;\nexport const b = css`:focus-visible { outline: 2px solid; }`;\n" });
  assert.ok(!r.lines.some((l) => l.includes('FOCUS_STYLE_REMOVED')), r.lines.join('\n'));
});

test('TSCONFIG_DRIFT: options, lib, types, test files in the browser program, a missing test program, no "type": "module"', async () => {
  const r = await run({
    ...BASE,
    'package.json': JSON.stringify({ name: 'app', imports: { '#config': './src/config.ts' } }),
    'tsconfig.json': JSON.stringify({ compilerOptions: { ...OPTIONS, target: 'esnext', strict: undefined, types: ['node'], lib: ['es2025', 'dom', 'esnext.disposable'] }, include: [DTS, 'src'] }),
    'tsconfig.test.json': undefined,
    'src/main.test.ts': "import { test } from 'node:test';\ntest('x', () => {});\n",
  });
  const drift = r.lines.filter((l) => l.includes('TSCONFIG_DRIFT'));
  for (const text of ['no "type": "module"', 'target is "esnext"', 'strict is missing', 'esnext.disposable', 'types is ["node"]', 'includes test files', 'no tsconfig.test.json']) {
    assert.ok(drift.some((l) => l.includes(text)), `${text}:\n${drift.join('\n')}`);
  }
});

test('IMPORT_MAP_HANDWRITTEN', async () => {
  const r = await run({ ...BASE, 'index.html': INDEX.replace('<!--jasno:head-->', '<script type="importmap">{}</script>') });
  assert.ok(r.has('index.html:6:3 IMPORT_MAP_HANDWRITTEN'), r.lines.join('\n'));
});

test('TS_VERSION_UNSUPPORTED outside ~7.0.2, and when typescript is missing', async () => {
  const app = project({ ...BASE, 'node_modules/typescript/package.json': JSON.stringify({ name: 'typescript', version: '7.1.0' }) });
  apps.push(app);
  const r = reporter(app.root);
  assert.equal(await check(app.root, { strict: false }, r.reporter), 1);
  assert.deepEqual(r.lines.map((l) => l.split(' ').slice(0, 2).join(' ')), ['typescript 7.1.0', 'TS_VERSION_UNSUPPORTED typescript']);
  const none = project(BASE);
  apps.push(none);
  const n = reporter(none.root);
  assert.equal(await check(none.root, { strict: false }, n.reporter), 1);
  assert.match(n.lines[0]!, /^TS_VERSION_UNSUPPORTED typescript is not installed/);
});

test('without the TS API: tsc runs as a subprocess, TYPE_RULES_UNAVAILABLE warns (fails under --strict)', async () => {
  const files = { ...BASE, 'src/bad.ts': "export const n: number = 'x';\n", 'src/ext.ts': "export { mount } from './main.js';\n" };
  const r = await run(files, { api: false });
  assert.ok(r.has('TYPE_RULES_UNAVAILABLE'), r.lines.join('\n'));
  assert.ok(r.has('src/bad.ts:1:14 TS2322'), r.lines.join('\n'));
  assert.ok(r.has('src/ext.ts:1:23 TS_EXTENSION'), 'rules that need no syntax tree still run');
  const ok = await run(BASE, { api: false });
  assert.equal(ok.code, 0, ok.lines.join('\n'));
  assert.equal((await run(BASE, { api: false, strict: true })).code, 1);
});

test('TS2835 suggestions name .ts; TS2554 on a component call adds the children hint', async () => {
  const r = await run({
    ...BASE,
    'tsconfig.json': JSON.stringify({ compilerOptions: { ...OPTIONS, allowImportingTsExtensions: true }, include: [DTS, 'src'], exclude: ['src/**/*.test.ts'] }),
    'src/noext.ts': "import { mount } from './main';\nexport { mount };\n",
    'src/card.ts': "import { component, h } from 'jasno';\nexport const Card = component(function Card(p: { title: string }): Node { return h.div(null, p.title); });\nexport const c = Card({ title: 'x' }, h.p(null));\n",
  });
  assert.ok(r.lines.some((l) => l.startsWith('src/noext.ts:1:23 TS2835') && l.includes("'./main.ts'")), r.lines.join('\n'));
  assert.ok(r.lines.some((l) => l.includes('TS2554') && l.includes('children go in the props object')), r.lines.join('\n'));
});

test('TS7022 on the router export: COMPONENT_RETURN_TYPE findings print first, the downstream implicit any is dropped', async () => {
  const r = await run({
    ...BASE,
    'src/routes.ts': [
      "import { createRouter, route } from 'jasno/router';",
      'export const router = createRouter([',
      "  route('/x', { view: () => import('./x.ts'), loader: async () => ({ name: 'x' }), title: (d) => d.name }),",
      "], { error: () => 'error', notFound: () => 'not found' });",
      '',
    ].join('\n'),
    'src/x.ts': "import { component, h } from 'jasno';\nimport { router } from './routes.ts';\nexport default component(function X() { return h.a({ href: router.href('/x') }, 'x'); });\n",
  });
  const codes = r.lines.slice(1, -1).map((l) => l.split(' ')[1]);
  assert.ok(codes.includes('TS7022'), r.lines.join('\n'));
  assert.equal(codes[0], 'COMPONENT_RETURN_TYPE', r.lines.join('\n'));
  assert.ok(!r.lines.some((l) => l.startsWith('src/routes.ts') && l.includes('TS7006')), r.lines.join('\n'));
});

test('FILE_NOT_PUBLISHED at rung 1: browser code importing a module outside src/ or a test file', async () => {
  const r = await run({
    ...BASE,
    'src/main.ts': "import { mount } from 'jasno';\nimport { secret } from '../server/env.ts';\nimport { fixture } from './helpers.test.ts';\nexport { mount, secret, fixture };\n",
    'server/env.ts': "export const secret = 'x';\n",
    'src/helpers.test.ts': 'export const fixture = 1;\n',
  });
  assert.ok(r.has('src/main.ts:2:24 FILE_NOT_PUBLISHED'), r.lines.join('\n'));
  assert.ok(r.has('src/main.ts:3:25 FILE_NOT_PUBLISHED'), r.lines.join('\n'));
});
