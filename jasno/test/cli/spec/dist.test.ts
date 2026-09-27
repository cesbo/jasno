// Conformance probes for jasno dist and jasno preview against design.md (e) dist 1-9, (e) preview, ADR-29, ADR-35 and
// the (c) dist rows. The findings are fixed or decided (changelog.md "CLI prototype"); tests named "open:" are the
// deliberate gaps, kept as todo.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import vm from 'node:vm';
import { init, parse } from 'es-module-lexer';
import { BUDGET, dist, type DistOptions } from '../../../cli/dist.ts';
import { startPreview } from '../../../cli/preview.ts';
import { http, INDEX, project, reporter } from '../fixture.ts';

await init;

const apps: { remove(): void }[] = [];
after(() => { for (const a of apps) a.remove(); });

type Files = Record<string, string>;
const opts = (o: Partial<DistOptions> = {}): DistOptions => ({ list: false, keep: 0, conditions: [], nonce: false, ...o });

async function build(files: Files, o: Partial<DistOptions> = {}, setup?: (root: string) => void) {
  const app = project(files);
  apps.push(app);
  setup?.(app.root);
  const r = reporter(app.root);
  const code = await dist(app.root, opts(o), r.reporter);
  const at = (p: string) => join(app.root, 'dist', p);
  return {
    ...app, code, lines: r.lines, at,
    read: (p: string) => readFileSync(at(p), 'utf8'),
    bytes: (p: string) => readFileSync(at(p)),
    again: async (o2: Partial<DistOptions> = {}) => { const r2 = reporter(app.root); return { code: await dist(app.root, opts(o2), r2.reporter), lines: r2.lines }; },
    /** Rewrites a source file with a later mtime (modules.ts caches scans by mtime). */
    edit: (p: string, text: string) => { writeFileSync(join(app.root, p), text); const t = new Date(Date.now() + 10_000 * Math.random() + 1000); utimesSync(join(app.root, p), t, t); },
  };
}

interface ImportMap { imports: Record<string, string>; scopes: Record<string, Record<string, string>>; integrity: Record<string, string> }
const mapOf = (html: string): ImportMap => JSON.parse(/<script type="importmap">(.*?)<\/script>/s.exec(html)![1]!) as ImportMap;
const sha384 = (b: Buffer | string) => 'sha384-' + createHash('sha384').update(b).digest('base64');
const sha256b64 = (s: string) => createHash('sha256').update(s).digest('base64');
const listAll = (dir: string, prefix = ''): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? listAll(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]);
const hashedName = /\.[0-9a-f]{10}\.(js|json)$/;

/** Import-map resolution as a browser does it: URL-like specifiers against the referrer, then the longest matching scope, then imports. */
function resolveIn(map: ImportMap, spec: string, referrer: string): string | undefined {
  const key = /^(\/|\.\.?\/)/.test(spec) ? new URL(spec, 'http://h' + referrer).pathname : spec;
  for (const scope of Object.keys(map.scopes).filter((s) => referrer.startsWith(s)).sort((a, b) => b.length - a.length)) {
    const hit = map.scopes[scope]![key];
    if (hit) return hit;
  }
  return map.imports[key];
}

/** Walks the shipped graph from the entry through the import map; every import must land on a shipped file matching its integrity. */
function walkShipped(root: string, map: ImportMap, entry = '/src/main.ts', staticOnly = false) {
  const problems: string[] = [];
  const seen = new Set<string>();
  const queue: [string, string][] = [[entry, '/']];
  while (queue.length) {
    const [spec, from] = queue.shift()!;
    const url = resolveIn(map, spec, from);
    if (!url) { problems.push(`${from}: "${spec}" does not resolve`); continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    const file = join(root, 'dist', url.slice(1));
    if (!existsSync(file)) { problems.push(`${url} missing`); continue; }
    const bytes = readFileSync(file);
    if (map.integrity[url] !== sha384(bytes)) problems.push(`${url} integrity`);
    if (url.endsWith('.json')) continue;
    for (const i of parse(bytes.toString('utf8'))[0]) {
      if (i.type === 'import-meta' || !i.specifier || (i.type === 'dynamic' && (i.glob || staticOnly))) continue;
      queue.push([i.specifier, url]);
    }
  }
  return { problems, seen };
}

const PKG = (extra: object = {}) => JSON.stringify({ name: 'app', type: 'module', ...extra });
const dep = (name: string, version: string, extra: object = {}) => JSON.stringify({ name, version, type: 'module', ...extra });

// ---------------------------------------------------------------------------------------------------------------
// Output fidelity (dist intro, §7): every shipped .js is its .ts with types replaced by whitespace.

const TRICKY: Files = {
  'src/generics.ts': "export const id = <T,>(x: T): T => x;\nexport const f = async <T extends object>(x: T) => x;\nexport const m = new Map<string, number>();\n",
  'src/satisfies.ts': "export const c = { a: 1 } satisfies Record<string, number>;\nexport const k = ['a', 'b'] as const;\n",
  'src/type-only.ts': "import type { T } from './types.ts';\nimport { type U, v } from './values.ts';\nexport type { T };\nexport { type U, v };\n",
  'src/types.ts': 'export type T = string;\n',
  'src/values.ts': 'export type U = number;\nexport const v: U = 1;\n',
  'src/declare.ts': "declare const g: number;\ndeclare global { interface Window { jasnoProbe: 1 } }\nexport const d = 1;\n",
  'src/overloads.ts': 'export function f(a: string): string;\nexport function f(a: number): number;\nexport function f(a: unknown) { return a; }\n',
  'src/nonnull.ts': "export const q = (s: string) => document.querySelector(s)!;\nexport const r = (x?: { y: number }) => x!.y;\n",
  'src/unicode.ts': "export const x: 'héllo€😀' = 'héllo€😀' as 'héllo€😀';\nexport const y = 1;\n",
  'src/crlf.ts': "export const a: number = 1;\r\nexport const b: string = 'x';\r\n",
  'src/this.ts': 'export function t(this: Window, a?: number, ...r: string[]): a is 1 { return a === 1; }\nexport class C<T> implements Iterable<T> { #x: T[] = []; [Symbol.iterator]() { return this.#x[Symbol.iterator](); } }\n',
};

test('tricky TypeScript ships as its source with only type characters blanked (same length, lines, columns, CRLF kept)', async () => {
  const main = Object.keys(TRICKY).filter((f) => !['src/types.ts'].includes(f)).map((f, i) => `import * as m${i} from './${f.slice(4)}';`).join('\n') + '\nexport const all = 1;\n';
  const b = await build({ 'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': main, ...TRICKY });
  assert.equal(b.code, 0, b.lines.join('\n'));
  const map = mapOf(b.read('index.html'));
  for (const [path, src] of Object.entries(TRICKY)) {
    const url = map.imports['/' + path];
    if (path === 'src/types.ts') { assert.ok(url, 'a type-only module is still a src/**/*.ts file and ships'); }
    const out = b.read(url!.slice(1));
    assert.equal(out.length, src.length, path);
    assert.deepEqual(out.split('\n').map((l) => l.length), src.split('\n').map((l) => l.length), path);
    for (let i = 0; i < src.length; i++) {
      if (out[i] !== src[i]) assert.match(out[i]!, /[ \t]/, `${path}@${i}: "${src[i]}" became "${out[i]}" (only blanking allowed)`);
    }
    assert.equal(out.split('\r\n').length, src.split('\r\n').length, `${path}: CRLF kept`);
  }
});

test('open: a type-only statement whose ";" sits on the next line keeps that ";" (the stripper blanks it and the shipped module throws)', { todo: 'upstream: amaro (and Node\'s own type stripping, so npm test shows it) blanks the ";"; CL decision: noted' }, async () => {
  const src = 'let x = 1\ntype T = string\n;[1].forEach(() => {})\nexport { x };\n';
  const b = await build({ 'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': src });
  assert.equal(b.code, 0, b.lines.join('\n'));
  const out = b.read(mapOf(b.read('index.html')).imports['/src/main.ts']!.slice(1));
  // tsc emits `let x = 1;\n[1].forEach(...)`; the blanked file is `let x = 1\n \n [1].forEach(...)`, i.e. 1[1].forEach.
  assert.doesNotThrow(() => vm.runInNewContext(out.replace('export { x };', '')), `shipped:\n${out}`);
});

test('JSON modules and dependency .js/.mjs files ship byte-identical under hashed names (BOM kept)', async () => {
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("export const bom = 'b';\n")]);
  const b = await build({
    'package.json': PKG(),
    'index.html': INDEX,
    'src/main.ts': "import data from './data.json' with { type: 'json' };\nimport { m } from 'dmjs';\nexport { data, m };\n",
    'src/data.json': '{ "a": [1, 2],\r\n  "é": "\\u00e9" }\n',
    'node_modules/dmjs/package.json': dep('dmjs', '2.0.0', { exports: './lib/index.mjs' }),
    'node_modules/dmjs/lib/index.mjs': "import { bom } from './bom.js';\n/* comment kept */ export const m = bom;\n",
  }, {}, (root) => writeFileSync(join(root, 'node_modules/dmjs/lib/bom.js'), bom));
  assert.equal(b.code, 0, b.lines.join('\n'));
  const map = mapOf(b.read('index.html'));
  const pairs: [string, string][] = [['/src/data.json', 'src/data.json'], ['/_deps/dmjs@2.0.0/lib/index.mjs', 'node_modules/dmjs/lib/index.mjs'], ['/_deps/dmjs@2.0.0/lib/bom.js', 'node_modules/dmjs/lib/bom.js']];
  for (const [key, source] of pairs) {
    const url = map.imports[key];
    assert.ok(url && hashedName.test(url), `${key} → ${url}`);
    assert.ok(b.bytes(url.slice(1)).equals(readFileSync(join(b.root, source))), `${key} byte-identical`);
  }
  assert.match(map.imports['/src/data.json']!, /^\/src\/data\.[0-9a-f]{10}\.json$/);
  assert.match(map.imports['/_deps/dmjs@2.0.0/lib/index.mjs']!, /^\/_deps\/dmjs@2\.0\.0\/lib\/index\.[0-9a-f]{10}\.js$/);
});

test('a dependency file that is not valid UTF-8 ships byte-identical (it is decoded and re-encoded, U+FFFD replaces the byte)', async () => {
  const latin1 = Buffer.from("export const s = 'caf\xe9';\n", 'latin1');
  const b = await build({
    'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': "export { s } from 'legacy';\n",
    'node_modules/legacy/package.json': dep('legacy', '1.0.0', { exports: './index.js' }),
  }, {}, (root) => writeFileSync(join(root, 'node_modules/legacy/index.js'), latin1));
  assert.equal(b.code, 0, b.lines.join('\n'));
  const url = mapOf(b.read('index.html')).imports['legacy']!;
  assert.ok(b.bytes(url.slice(1)).equals(latin1), `shipped ${b.bytes(url.slice(1)).toString('hex')} vs source ${latin1.toString('hex')}`);
});

// ---------------------------------------------------------------------------------------------------------------
// Naming and hashing (dist 2).

test('names carry the sha256 of the shipped bytes, in the same directory; same content → same hash, rebuilds are identical', async () => {
  const files: Files = {
    'package.json': PKG(), 'index.html': INDEX,
    'src/main.ts': "import './a.b.ts';\nimport './x/a.b.ts';\nimport './twin.ts';\nexport const n = 1;\n",
    'src/a.b.ts': 'export const same = 1;\n',
    'src/x/a.b.ts': 'export const same = 1;\n',
    'src/twin.ts': 'export const same = 1;\n',
    'assets/app.css': 'body{}', 'assets/deep/a.b.png': 'png',
  };
  const b = await build(files);
  assert.equal(b.code, 0, b.lines.join('\n'));
  const map = mapOf(b.read('index.html'));
  const h = createHash('sha256').update(files['src/a.b.ts']!).digest('hex').slice(0, 10);
  assert.equal(map.imports['/src/a.b.ts'], `/src/a.b.${h}.js`);
  assert.equal(map.imports['/src/x/a.b.ts'], `/src/x/a.b.${h}.js`);
  assert.equal(map.imports['/src/twin.ts'], `/src/twin.${h}.js`);
  for (const f of listAll(join(b.root, 'dist')).filter((p) => hashedName.test(p))) {
    const hash = /\.([0-9a-f]{10})\.(js|json)$/.exec(f)![1];
    assert.equal(createHash('sha256').update(b.bytes(f)).digest('hex').slice(0, 10), hash, f);
  }
  const before = new Map(listAll(join(b.root, 'dist')).map((f) => [f, b.bytes(f).toString('base64')]));
  assert.equal((await b.again()).code, 0);
  const afterRebuild = new Map(listAll(join(b.root, 'dist')).map((f) => [f, b.bytes(f).toString('base64')]));
  assert.deepEqual(afterRebuild, before, 'deterministic');
  b.edit('src/twin.ts', 'export const same = 2;\n');
  assert.equal((await b.again()).code, 0);
  const next = mapOf(b.read('index.html'));
  assert.notEqual(next.imports['/src/twin.ts'], map.imports['/src/twin.ts']);
  for (const k of ['/src/main.ts', '/src/a.b.ts', '/src/x/a.b.ts']) assert.equal(next.imports[k], map.imports[k], `${k} unchanged`);
  assert.ok(existsSync(b.at('assets/app.css')) && existsSync(b.at('assets/deep/a.b.png')), 'assets keep their names');
});

// ---------------------------------------------------------------------------------------------------------------
// Import map (dist 3, ADR-35).

const GRAPH: Files = {
  'package.json': PKG({ dependencies: { a: '1', b: '1', c: '2' } }),
  'index.html': INDEX,
  'src/main.ts': "import { mount } from 'jasno';\nimport { a } from 'a';\nimport { b } from 'b';\nimport { c } from 'c';\nimport { route } from 'jasno/router';\nexport { mount, a, b, c, route };\n",
  'node_modules/a/package.json': dep('a', '1.0.0', { exports: { '.': './index.js', './self': './lib/self.mjs' } }),
  'node_modules/a/index.js': "import { c } from 'c';\nimport self from 'a/self';\nexport const a = 'a' + c + self;\n",
  'node_modules/a/lib/self.mjs': "import { up } from '../util/up.js';\nimport data from './data.json' with { type: 'json' };\nexport default up + data.v;\n",
  'node_modules/a/util/up.js': "export const up = 'up';\n",
  'node_modules/a/lib/data.json': '{"v":1}',
  'node_modules/a/node_modules/c/package.json': dep('c', '1.0.0', { exports: './c.js' }),
  'node_modules/a/node_modules/c/c.js': "export const c = 'c1';\n",
  'node_modules/c/package.json': dep('c', '2.0.0', { exports: './c.js' }),
  'node_modules/c/c.js': "export const c = 'c2';\n",
  'node_modules/b/package.json': dep('b', '1.0.0', { exports: './b.js' }),
  'node_modules/b/b.js': "import { c } from 'c';\nexport const b = c;\n",
};

test('import map: every import of every shipped module (relative inside packages and jasno, bare, self-reference, JSON) resolves from its hashed URL to a shipped file with matching integrity', async () => {
  const b = await build(GRAPH);
  assert.equal(b.code, 0, b.lines.join('\n'));
  const map = mapOf(b.read('index.html'));
  const { problems, seen } = walkShipped(b.root, map);
  assert.deepEqual(problems, []);
  assert.ok([...seen].some((u) => u.startsWith('/_deps/c@1.0.0/')) && [...seen].some((u) => u.startsWith('/_deps/c@2.0.0/')), 'two versions of c ship side by side');
  assert.match(map.scopes['/_deps/a@1.0.0/']!['c']!, /^\/_deps\/c@1\.0\.0\//);
  assert.match(map.scopes['/_deps/b@1.0.0/']!['c']!, /^\/_deps\/c@2\.0\.0\//);
  assert.match(map.imports['c']!, /^\/_deps\/c@2\.0\.0\//);
  assert.match(map.scopes['/_deps/a@1.0.0/']!['a/self']!, /^\/_deps\/a@1\.0\.0\/lib\/self\.[0-9a-f]{10}\.js$/);
  // Every shipped module has a source-URL key and an integrity entry.
  const manifest = JSON.parse(b.read('.jasno/manifest.json')) as { deploys: string[][] };
  const values = new Set([...Object.values(map.imports), ...Object.values(map.scopes).flatMap((s) => Object.values(s))]);
  for (const p of manifest.deploys[0]!) {
    assert.ok(values.has('/' + p), `${p} reachable through the map`);
    assert.equal(map.integrity['/' + p], sha384(b.bytes(p)), p);
  }
  assert.deepEqual(new Set(Object.keys(map.integrity)), new Set(manifest.deploys[0]!.map((p) => '/' + p)), 'integrity for every module, nothing else');
});

test('a package with a nested type-only package.json (dist/esm/package.json) ships under _deps/<name>@<version>/<path> and its files do not collide with another such package', async () => {
  const nested = (n: string): Files => ({
    [`node_modules/${n}/package.json`]: dep(n, '3.1.0', { exports: { '.': { import: './dist/esm/index.js' } } }),
    [`node_modules/${n}/dist/esm/package.json`]: JSON.stringify({ type: 'module' }),
    [`node_modules/${n}/dist/esm/index.js`]: "export { u } from './util.js';\n",
    [`node_modules/${n}/dist/esm/util.js`]: `export const u = '${n}';\n`,
  });
  const b = await build({ 'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': "import { u as p } from 'p';\nimport { u as q } from 'q';\nexport { p, q };\n", ...nested('p'), ...nested('q') });
  assert.equal(b.code, 0, b.lines.join('\n'));
  const map = mapOf(b.read('index.html'));
  assert.match(map.imports['p'] ?? '', /^\/_deps\/p@3\.1\.0\/dist\/esm\/index\.[0-9a-f]{10}\.js$/, `p → ${map.imports['p']}`);
  assert.deepEqual(walkShipped(b.root, map).problems, []);
  const shipped = new Set([...walkShipped(b.root, map).seen].map((u) => b.read(u.slice(1))));
  assert.ok(shipped.has("export const u = 'p';\n") && shipped.has("export const u = 'q';\n"), 'both util.js files are reached');
});

test('a workspace dependency symlinked from node_modules to a directory inside the project ships under _deps/<name>@<version>/', async () => {
  const b = await build({
    'package.json': PKG({ dependencies: { lib: 'file:packages/lib' } }), 'index.html': INDEX,
    'src/main.ts': "export { lib } from 'lib';\n",
    'packages/lib/package.json': dep('lib', '0.1.0', { exports: './index.js' }),
    'packages/lib/index.js': "export const lib = 1;\n",
  }, {}, (root) => symlinkSync(join(root, 'packages/lib'), join(root, 'node_modules/lib')));
  assert.equal(b.code, 0, b.lines.join('\n'));
  const map = mapOf(b.read('index.html'));
  assert.match(map.imports['lib']!, /^\/_deps\/lib@0\.1\.0\/index\.[0-9a-f]{10}\.js$/, `lib → ${map.imports['lib']}`);
});

// ---------------------------------------------------------------------------------------------------------------
// modulepreload and the manifest (dist 4, 9).

test('modulepreload is exactly the entry static closure (JSON aside) with integrity; dynamic targets and their closures are in the manifest', async () => {
  const b = await build({
    ...GRAPH,
    'src/main.ts': GRAPH['src/main.ts']!.replace('export {', "import cfg from './cfg.json' with { type: 'json' };\nexport const view = () => import('./views/v.ts');\nexport { cfg, "),
    'src/cfg.json': '{}',
    'src/views/v.ts': "import { w } from './w.ts';\nimport { a } from 'a';\nexport const more = () => import('./more.ts');\nexport default w + a;\n",
    'src/views/w.ts': 'export const w = 1;\n',
    'src/views/more.ts': "import { x } from './x.ts';\nexport default x;\n",
    'src/views/x.ts': 'export const x = 2;\n',
    'src/orphan.ts': 'export const orphan = 1;\n',
  });
  assert.equal(b.code, 0, b.lines.join('\n'));
  const html = b.read('index.html');
  const map = mapOf(html);
  const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)" integrity="([^"]+)">/g)];
  const closure = [...walkShipped(b.root, map, '/src/main.ts', true).seen];
  const expected = closure.filter((u) => !u.endsWith('.json'));
  assert.deepEqual(preloads.map((m) => m[1]).sort(), expected.sort());
  for (const m of preloads) assert.equal(m[2], map.integrity[m[1]!]);
  const manifest = JSON.parse(b.read('.jasno/manifest.json')) as { lazy: Record<string, { modules: number; closure: string[]; perPackage: Record<string, number> }>; entry: { modules: number; perPackage: Record<string, number> } };
  assert.deepEqual(Object.keys(manifest.lazy).sort(), [map.imports['/src/views/more.ts'], map.imports['/src/views/v.ts']].sort());
  assert.deepEqual(manifest.lazy[map.imports['/src/views/v.ts']!]!.closure.sort(), [map.imports['/src/views/v.ts'], map.imports['/src/views/w.ts']].sort());
  assert.deepEqual(manifest.lazy[map.imports['/src/views/more.ts']!]!.closure.sort(), [map.imports['/src/views/more.ts'], map.imports['/src/views/x.ts']].sort());
  assert.equal(manifest.entry.modules, closure.length, 'entry count includes the JSON modules');
  assert.ok(!preloads.some((m) => m[1] === map.imports['/src/orphan.ts']), 'unreachable src files ship but are not preloaded');
});

// ---------------------------------------------------------------------------------------------------------------
// CSP, _headers, SPA fallback (dist 5-7).

const SIMPLE: Files = { 'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': "import { mount } from 'jasno';\nexport const lazy = () => import('./views/v.ts');\nexport { mount };\n", 'src/views/v.ts': 'export default 1;\n', 'assets/logo.svg': '<svg/>' };

test('CSP meta and _headers are exactly the (e) dist 6 policy: map hash, then entry hash; cache rules per path; --nonce prints the nonce variant without hashes', async () => {
  const b = await build(SIMPLE, { nonce: true });
  assert.equal(b.code, 0, b.lines.join('\n'));
  const html = b.read('index.html');
  const map = /<script type="importmap">(.*?)<\/script>/s.exec(html)![1]!;
  const entry = /<script type="module">(.*?)<\/script>/s.exec(html)![1]!;
  assert.equal(entry, "import '/src/main.ts';");
  const csp = `script-src 'self' 'sha256-${sha256b64(map)}' 'sha256-${sha256b64(entry)}'; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'`;
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${csp}">`));
  const headers = b.read('_headers');
  assert.ok(headers.includes(`/*\n  Content-Security-Policy: ${csp}\n`));
  for (const p of ['/', '/index.html', '/404.html', '/assets/*']) assert.ok(headers.includes(`\n${p}\n  Cache-Control: no-cache\n`), p);
  for (const p of ['/src/*', '/_deps/*', '/jasno/*']) assert.ok(headers.includes(`\n${p}\n  Cache-Control: public, max-age=31536000, immutable\n`), p);
  const nonce = b.lines.find((l) => l.includes("'strict-dynamic'"))!;
  assert.ok(nonce.includes("script-src 'nonce-<nonce>' 'strict-dynamic'; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'"), nonce);
  assert.ok(!nonce.includes('sha256-'), 'no hash sources next to strict-dynamic');
});

test('CSP_HASH_STRICT_DYNAMIC: index.html carrying its own CSP with \'strict-dynamic\' (the only CSP "config" a project has) fails the build', async () => {
  const html = INDEX.replace('<!--jasno:head-->', `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'strict-dynamic'">\n  <!--jasno:head-->`);
  const b = await build({ ...SIMPLE, 'index.html': html });
  assert.ok(b.lines.some((l) => l.includes('CSP_HASH_STRICT_DYNAMIC')), b.lines.join('\n'));
  assert.equal(b.code, 1);
});

// ---------------------------------------------------------------------------------------------------------------
// Allowlist and SECRET_FILE_IN_OUTPUT (dist 1).

test('allowlist: a file reachable through a development target ships when production code also imports it; dev-only files do not', async () => {
  const b = await build({
    'package.json': PKG({ imports: { '#config': { development: './src/config.dev.ts', default: './src/config.prod.ts' } } }),
    'index.html': INDEX,
    'src/main.ts': "import config from '#config';\nimport { shared } from './shared.ts';\nexport { config, shared };\n",
    'src/config.dev.ts': "import { shared } from './shared.ts';\nimport { mock } from './mock/data.ts';\nexport default { shared, mock };\n",
    'src/mock/data.ts': "import { deep } from './deep.ts';\nexport const mock = deep;\n",
    'src/mock/deep.ts': 'export const deep = 1;\n',
    'src/config.prod.ts': 'export default {};\n',
    'src/shared.ts': 'export const shared = 1;\n',
  });
  assert.equal(b.code, 0, b.lines.join('\n'));
  const files = listAll(join(b.root, 'dist'));
  assert.ok(files.some((f) => /^src\/shared\.[0-9a-f]{10}\.js$/.test(f)), 'shared ships');
  assert.ok(!files.some((f) => /config\.dev|mock\//.test(f)), files.join('\n'));
});

test('files reachable only through a development pattern target ("#api/*") do not ship', async () => {
  const b = await build({
    'package.json': PKG({ imports: { '#api/*': { development: './src/api/*.mock.ts', default: './src/api/*.ts' } } }),
    'index.html': INDEX,
    'src/main.ts': "import { users } from '#api/users';\nexport { users };\n",
    'src/api/users.ts': "export const users = () => fetch('/api/users');\n",
    'src/api/users.mock.ts': "export const users = async () => [{ name: 'fixture', password: 'hunter2' }];\n",
  });
  assert.equal(b.code, 0, b.lines.join('\n'));
  const files = listAll(join(b.root, 'dist'));
  assert.ok(files.some((f) => /^src\/api\/users\.[0-9a-f]{10}\.js$/.test(f)));
  assert.ok(!files.some((f) => f.includes('users.mock')), files.filter((f) => f.startsWith('src/')).join('\n'));
});

test('a *.test.ts file imported by browser code never ships', async () => {
  const b = await build({ 'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': "import { fixture } from './helpers.test.ts';\nexport { fixture };\n", 'src/helpers.test.ts': 'export const fixture = 1;\n' });
  assert.ok(!existsSync(b.at('src')) || !listAll(b.at('src')).some((f) => f.includes('.test.')), 'no test file in dist/');
});

test('a module outside src/ (../server/env.ts) imported by browser code is not published ("Nothing else")', async () => {
  const b = await build({
    'package.json': PKG(), 'index.html': INDEX,
    'src/main.ts': "import { DB_PASSWORD } from '../server/env.ts';\nexport const n = DB_PASSWORD.length;\n",
    'server/env.ts': "export const DB_PASSWORD: string = 'hunter2';\n",
  });
  assert.ok(!existsSync(b.at('server')), `shipped: ${existsSync(b.at('server')) ? listAll(b.at('server')).join(', ') : ''}`);
  assert.equal(b.code, 1, 'reported, not silently shipped or silently dropped');
});

test('SECRET_FILE_IN_OUTPUT: every listed pattern, in nested directories of src/ and assets/, fails with the file named and nothing written', async () => {
  const names = ['src/.env', 'src/a/b/.env.production', 'assets/deep/dir/.htpasswd', 'assets/x/.npmrc', 'src/.git/config', 'assets/tls/site.PEM', 'src/keys/deploy.key', 'assets/.well-known/security.txt'];
  for (const name of names) {
    const b = await build({ ...SIMPLE, 'dist/previous.txt': 'kept', [name]: 'SECRET' });
    assert.equal(b.code, 1, name);
    const line = b.lines.find((l) => l.includes('SECRET_FILE_IN_OUTPUT'));
    assert.ok(line, `${name}: ${b.lines.join('\n')}`);
    const shown = name.includes('.git/') ? 'src/.git' : name.includes('.well-known') ? 'assets/.well-known' : name;
    assert.ok(line.includes(shown), `${line} names ${shown}`);
    assert.equal(b.read('previous.txt'), 'kept', 'nothing written: the previous dist/ is untouched');
  }
});

test('a symlink in assets/ or src/ pointing at a secret outside never publishes the secret', async () => {
  const b = await build({ ...SIMPLE, 'private/.env': 'S3CR3T_MARK=1', 'private/id.key': 'S3CR3T_MARK', 'private/notes.txt': 'S3CR3T_MARK' }, {}, (root) => {
    symlinkSync(join(root, 'private/.env'), join(root, 'assets/robots.txt'));
    symlinkSync(join(root, 'private'), join(root, 'assets/shared'));
    symlinkSync(join(root, 'private'), join(root, 'src/private'));
  });
  const shipped = existsSync(join(b.root, 'dist')) ? listAll(join(b.root, 'dist')) : [];
  for (const f of shipped) assert.ok(!b.read(f).includes('S3CR3T_MARK'), f);
});

test('a symlinked asset (assets/logo.png → ../brand/logo.png) is published or reported, not silently dropped', async () => {
  const b = await build({ ...SIMPLE, 'brand/logo.png': 'PNG' }, {}, (root) => symlinkSync(join(root, 'brand/logo.png'), join(root, 'assets/logo.png')));
  const reported = b.lines.some((l) => l.includes('assets/logo.png'));
  assert.ok(reported || existsSync(b.at('assets/logo.png')), `code ${b.code}: ${b.lines.join('\n')}`);
});

// ---------------------------------------------------------------------------------------------------------------
// --keep, --list, nothing written on error (dist 1, 8).

test('--keep 2 over four deploys keeps exactly the previous two deploys\' hashed files, byte-identical; --keep 0 then 2 keeps only what dist/ still has', async () => {
  const b = await build(SIMPLE);
  const urls = [mapOf(b.read('index.html')).imports['/src/views/v.ts']!];
  const bodies = [b.read(urls[0]!.slice(1))];
  for (let i = 2; i <= 4; i++) {
    b.edit('src/views/v.ts', `export default ${i};\n`);
    assert.equal((await b.again({ keep: 2 })).code, 0);
    urls.push(mapOf(b.read('index.html')).imports['/src/views/v.ts']!);
    bodies.push(b.read(urls.at(-1)!.slice(1)));
  }
  assert.equal(new Set(urls).size, 4);
  assert.ok(!existsSync(b.at(urls[0]!.slice(1))), 'deploy 1 dropped');
  for (const i of [1, 2, 3]) assert.equal(b.read(urls[i]!.slice(1)), bodies[i], `deploy ${i + 1} present`);
  const manifest = JSON.parse(b.read('.jasno/manifest.json')) as { deploys: string[][] };
  assert.equal(manifest.deploys.length, 3);
  b.edit('src/views/v.ts', 'export default 5;\n');
  assert.equal((await b.again({ keep: 0 })).code, 0);
  b.edit('src/views/v.ts', 'export default 6;\n');
  assert.equal((await b.again({ keep: 2 })).code, 0);
  for (const i of [1, 2, 3]) assert.ok(!existsSync(b.at(urls[i]!.slice(1))), `deploy ${i + 1} gone after --keep 0`);
});

test('--list prints exactly the files a build with the same options writes (kept files and .jasno/manifest.json included)', async () => {
  const b = await build(SIMPLE);
  b.edit('src/views/v.ts', 'export default 2;\n');
  const listed = await b.again({ list: true, keep: 1 });
  assert.equal(listed.code, 0);
  const paths = listed.lines.filter((l) => l.startsWith('dist/')).map((l) => l.split('  <- ')[0]!.slice(5));
  assert.equal((await b.again({ keep: 1 })).code, 0);
  assert.deepEqual(paths.sort(), listAll(join(b.root, 'dist')).sort());
});

test('an error build leaves the previous dist/ untouched', async () => {
  const b = await build(SIMPLE);
  const before = listAll(join(b.root, 'dist'));
  b.edit('src/main.ts', "import './missing.ts';\n");
  const r = await b.again();
  assert.equal(r.code, 1);
  assert.ok(r.lines.includes('jasno dist: nothing written.'));
  assert.deepEqual(listAll(join(b.root, 'dist')), before);
});

// ---------------------------------------------------------------------------------------------------------------
// Budgets (ADR-29, (c)).

/** An entry closure of exactly n modules: main.ts, `depModules` dependency modules it reaches, and src/m/f<i>.ts. */
function fanOut(n: number, depModules: number, extra: Files = {}): Files {
  const files: Files = { 'package.json': PKG(), 'index.html': INDEX, ...extra };
  const lines = [extra['src/main.ts'] ?? ''];
  for (let i = 0; i < n - 1 - depModules; i++) { files[`src/m/f${i}.ts`] = `export const v${i} = ${i};\n`; lines.push(`import './m/f${i}.ts';`); }
  files['src/main.ts'] = lines.join('\n') + '\nexport {};\n';
  return files;
}

test('budgets at the exact boundaries: entry 150 silent, 151 warn, 250 warn, 251 error; lazy 50 silent, 51 warn; counts per directory and package', async () => {
  assert.deepEqual({ ...BUDGET }, { entryWarn: 150, entryError: 250, lazyWarn: 50 });
  const d = { 'node_modules/dp/package.json': dep('dp', '1.0.0', { exports: './i.js' }), 'node_modules/dp/i.js': "import './j.js';\nexport {};\n", 'node_modules/dp/j.js': 'export {};\n' };
  const at = async (n: number) => {
    const b = await build(fanOut(n, 2, { ...d, 'src/main.ts': "import 'dp';" }));
    const m = JSON.parse(existsSync(b.at('.jasno/manifest.json')) ? b.read('.jasno/manifest.json') : '{}') as { entry?: { modules: number; perPackage: Record<string, number> } };
    return { ...b, budget: b.lines.filter((l) => l.includes('MODULE_BUDGET_EXCEEDED')), m };
  };
  const b150 = await at(150);
  assert.equal(b150.code, 0);
  assert.deepEqual(b150.budget, []);
  assert.equal(b150.m.entry!.modules, 150);
  assert.deepEqual(b150.m.entry!.perPackage, { src: 1, 'src/m': 147, dp: 2 });
  const b151 = await at(151);
  assert.equal(b151.code, 0);
  assert.equal(b151.budget.length, 1);
  assert.match(b151.budget[0]!, /151 modules .*src\/m 148, dp 2, src 1/);
  const b250 = await at(250);
  assert.equal(b250.code, 0);
  assert.equal(b250.budget.length, 1);
  const b251 = await at(251);
  assert.equal(b251.code, 1);
  assert.ok(b251.lines.some((l) => l.includes('nothing written')));
  const lazy = async (n: number) => {
    const files: Files = { 'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': "export const v = () => import('./l/l.ts');\n" };
    const lines: string[] = [];
    for (let i = 0; i < n - 1; i++) { files[`src/l/g${i}.ts`] = `export const v${i} = ${i};\n`; lines.push(`import './g${i}.ts';`); }
    files['src/l/l.ts'] = lines.join('\n') + '\nexport {};\n';
    const b = await build(files);
    return b.lines.filter((l) => l.includes('LAZY_BUDGET_EXCEEDED'));
  };
  assert.deepEqual(await lazy(50), []);
  const w = await lazy(51);
  assert.equal(w.length, 1);
  assert.match(w[0]!, /^src\/main\.ts:1:\d+ LAZY_BUDGET_EXCEEDED .*51 modules.*src\/l 51/);
});

// ---------------------------------------------------------------------------------------------------------------
// DEP_NOT_BROWSER_ESM, MODULE_NOT_FOUND, DYNAMIC_IMPORT_NOT_LITERAL ((c) dist rows).

test('DEP_NOT_BROWSER_ESM (not IMPORT_NOT_MAPPED) when a dependency the app imports has no browser ESM entry ("exports" with require/node only)', async () => {
  const b = await build({
    'package.json': PKG({ dependencies: { nodeonly: '1' } }), 'index.html': INDEX, 'src/main.ts': "import x from 'nodeonly';\nexport { x };\n",
    'node_modules/nodeonly/package.json': JSON.stringify({ name: 'nodeonly', version: '1.0.0', exports: { node: './index.cjs', require: './index.cjs' } }),
    'node_modules/nodeonly/index.cjs': 'module.exports = 1;\n',
  });
  assert.equal(b.code, 1);
  assert.ok(b.lines.some((l) => l.includes('DEP_NOT_BROWSER_ESM')), b.lines.join('\n'));
});

test('a dependency that mentions process.env only in a comment or string is not rejected as DEP_NOT_BROWSER_ESM', async () => {
  const b = await build({
    'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': "export { hint } from 'doc';\n",
    'node_modules/doc/package.json': dep('doc', '1.0.0', { exports: './index.js' }),
    'node_modules/doc/index.js': "// Unlike v1 we never read process.env here.\nexport const hint = 'set process.env.DEBUG in Node only';\n",
  });
  assert.equal(b.code, 0, b.lines.join('\n'));
});

test('an unresolvable import() inside a dependency does not fail the build (ADR-35 checks the static closure; an optional peer is not in it)', async () => {
  const b = await build({
    'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': "export { load } from 'opt';\n",
    'node_modules/opt/package.json': dep('opt', '1.0.0', { exports: './index.js' }),
    'node_modules/opt/index.js': "export const load = () => import('optional-peer').catch(() => null);\n",
  });
  assert.equal(b.code, 0, b.lines.join('\n'));
});

test('MODULE_NOT_FOUND for a missing relative or root-relative import (file:line:col), TS_EXTENSION for .js with a .ts sibling; nothing written', async () => {
  const cases: [string, RegExp][] = [
    ["import './nope.ts';\n", /^src\/main\.ts:1:8 MODULE_NOT_FOUND /],
    ["export {};\nconst v = () => import('/src/views/gone.ts');\n", /^src\/main\.ts:2:\d+ MODULE_NOT_FOUND /],
    ["import './views/v.js';\n", /^src\/main\.ts:1:8 TS_EXTENSION /],
  ];
  for (const [main, re] of cases) {
    const b = await build({ ...SIMPLE, 'src/main.ts': main });
    assert.equal(b.code, 1, main);
    assert.ok(b.lines.some((l) => re.test(l)), `${main}: ${b.lines.join('\n')}`);
    assert.ok(!existsSync(join(b.root, 'dist')));
  }
});

test('an entry named in index.html that does not exist is MODULE_NOT_FOUND (not SYNTAX_REJECTED "no inline script")', async () => {
  const b = await build({ ...SIMPLE, 'index.html': INDEX.replace('/src/main.ts', '/src/app.ts') });
  assert.equal(b.code, 1);
  assert.ok(b.lines.some((l) => l.includes('MODULE_NOT_FOUND') && l.includes('/src/app.ts')), b.lines.join('\n'));
});

test('DYNAMIC_IMPORT_NOT_LITERAL: import(variable) warns at the call, the build succeeds', async () => {
  const b = await build({ ...SIMPLE, 'src/dyn.ts': 'export const load = (name: string) => import(name);\n' });
  assert.equal(b.code, 0, b.lines.join('\n'));
  assert.ok(b.lines.some((l) => /^src\/dyn\.ts:1:\d+ DYNAMIC_IMPORT_NOT_LITERAL /.test(l)), b.lines.join('\n'));
});

// ---------------------------------------------------------------------------------------------------------------
// jasno preview: a static host over dist/ ((e) preview; Netlify / Cloudflare Pages semantics).

async function served(files: Files = SIMPLE, redirects?: string) {
  const b = await build(files);
  assert.equal(b.code, 0, b.lines.join('\n'));
  if (redirects !== undefined) writeFileSync(b.at('_redirects'), redirects);
  const server = await startPreview(b.root, { port: 0 }, reporter(b.root).reporter);
  const base = server.url.replace(/\/$/, '');
  return { b, server, base, get: (p: string, o: Parameters<typeof http>[1] = {}) => http(base + p, o) };
}

test('preview: content types, HEAD, 405, traversal and dotfiles refused, loopback Host names accepted', async () => {
  const s = await served({ ...SIMPLE, 'src/main.ts': "import d from './d.json' with { type: 'json' };\nexport { d };\n", 'src/d.json': '{}', 'assets/app.webmanifest': '{}' });
  try {
    const map = mapOf((await s.get('/')).body);
    const js = await s.get(map.imports['jasno'] ?? map.imports['/src/main.ts']!);
    assert.match(String(js.headers['content-type']), /^text\/javascript/);
    assert.equal((await s.get(map.imports['/src/d.json']!)).headers['content-type'], 'application/json');
    assert.equal((await s.get('/assets/logo.svg')).headers['content-type'], 'image/svg+xml');
    assert.equal((await s.get('/assets/app.webmanifest')).headers['content-type'], 'application/manifest+json');
    const head = await s.get('/assets/logo.svg', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-type'], 'image/svg+xml');
    assert.equal((await s.get('/', { method: 'POST' })).status, 405);
    for (const p of ['/assets/%2e%2e/%2e%2e/package.json', '/assets/..%2f..%2fpackage.json', '/.jasno/manifest.json', '/%2ejasno/manifest.json']) {
      const r = await s.get(p);
      assert.ok(!r.body.includes('"name":"app"') && !r.body.includes('stripper'), `${p}: ${r.status}`);
    }
    for (const host of ['localhost', `localhost:${s.server.port}`, `127.0.0.1:${s.server.port}`, `[::1]:${s.server.port}`, 'app.localhost']) {
      assert.equal((await s.get('/', { headers: { host } })).status, 200, host);
    }
    for (const host of ['evil.example', `evil.example:${s.server.port}`, 'localhost.evil.example', '127.0.0.1.nip.io']) {
      assert.equal((await s.get('/', { headers: { host } })).status, 403, host);
    }
  } finally { await s.server.close(); }
});

test('preview: _redirects as Netlify/Cloudflare apply them: first match wins, files shadow non-forced rules, 200! forces, :placeholders and :splat, 3xx Location, 404 rules, 404.html', async () => {
  const s = await served({ ...SIMPLE, 'assets/real.txt': 'real' }, [
    '# comment',
    '/old/:id  /new/:id  301',
    '/blog/*  /news/:splat  302',
    '/assets/*  /index.html  200',
    '/force/logo  /assets/logo.svg  200!',
    '/gone/*  /404.html  404',
    '/users/*  /index.html  200',
  ].join('\n') + '\n');
  try {
    const moved = await s.get('/old/7');
    assert.equal(moved.status, 301);
    assert.equal(moved.headers['location'], '/new/7');
    assert.equal((await s.get('/blog/2024/post')).headers['location'], '/news/2024/post');
    assert.equal((await s.get('/assets/real.txt')).body, 'real', 'an existing file shadows a non-forced rule');
    assert.match((await s.get('/assets/missing.txt')).body, /importmap/, 'the rule applies when no file exists');
    assert.equal((await s.get('/force/logo')).body, '<svg/>');
    const gone = await s.get('/gone/x');
    assert.equal(gone.status, 404);
    assert.match(gone.body, /importmap/, '404.html body');
    assert.equal((await s.get('/users/1')).status, 200);
    const miss = await s.get('/nowhere');
    assert.equal(miss.status, 404, 'no rule: 404 with 404.html');
    assert.match(miss.body, /importmap/);
  } finally { await s.server.close(); }
});

test('preview does not serve _headers and _redirects as files (static hosts consume them)', async () => {
  const s = await served();
  try {
    for (const p of ['/_headers', '/_redirects']) {
      const r = await s.get(p);
      assert.ok(!r.body.includes('Cache-Control') && !r.body.includes('/index.html 200'), `${p}: ${r.status} ${r.headers['content-type']}`);
    }
  } finally { await s.server.close(); }
});

test('no-cache HTML is revalidated by ETag ("revalidated by ETag", (e) dist 6): preview sends an ETag and answers If-None-Match with 304', async () => {
  const s = await served();
  try {
    const first = await s.get('/');
    const etag = first.headers['etag'];
    assert.ok(typeof etag === 'string' && etag.length > 0, 'ETag on /');
    assert.equal((await s.get('/', { headers: { 'if-none-match': etag } })).status, 304);
  } finally { await s.server.close(); }
});

test('open: an SPA deep link (/users/1, served through the 200 rewrite) is HTML and gets Cache-Control: no-cache like /', { todo: 'decision: _headers cannot target a rewrite (Cloudflare joins duplicate headers); hosts default HTML to revalidation' }, async () => {
  const s = await served();
  try {
    const r = await s.get('/users/1');
    assert.equal(r.status, 200);
    assert.match(String(r.headers['content-type']), /^text\/html/);
    assert.equal(r.headers['cache-control'], 'no-cache');
  } finally { await s.server.close(); }
});

test('a hashed module URL that is not in dist/ (a stale tab past --keep) answers 404, not index.html as 200 text/html cached immutable for a year', async () => {
  const s = await served();
  try {
    const r = await s.get('/src/views/v.0123456789.js');
    assert.equal(r.status, 404, `${r.status} ${r.headers['content-type']} ${r.headers['cache-control']}`);
    // preview applies _headers by request path whatever the status, so this 404 still says immutable; whether
    // Netlify and Cloudflare do the same is unverified (bounded harm, noted in the spec).
  } finally { await s.server.close(); }
});

test('root files a site needs (/robots.txt) can be published; today assets/ reaches only /assets/*, dist/ is wiped, and the SPA rewrite answers index.html', async () => {
  const s = await served({ ...SIMPLE, 'public/robots.txt': 'User-agent: *\n' }); // public/ → the root of dist/
  try {
    const r = await s.get('/robots.txt');
    assert.doesNotMatch(String(r.headers['content-type']), /text\/html/, `status ${r.status}, ${r.headers['content-type']}`);
  } finally { await s.server.close(); }
});



