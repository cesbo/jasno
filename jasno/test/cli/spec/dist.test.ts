// Conformance probes for jasno dist and jasno preview against design.md (e) dist 1-9, (e) preview, ADR-29, ADR-35 and
// the (c) dist rows. Tests named "open:" are the deliberate gaps, kept as todo.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import vm from 'node:vm';
import { dist, validPrefix, type DistOptions } from '../../../cli/dist.ts';
import { main } from '../../../cli/main.ts';
import { startPreview } from '../../../cli/preview.ts';
import { http, INDEX, project, reporter } from '../fixture.ts';

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
const sha256b64 = (s: string) => createHash('sha256').update(s).digest('base64');
const listAll = (dir: string, prefix = ''): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? listAll(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]);
const hashedName = /\.[0-9a-z]{8}\.js$/;

const PKG = (extra: object = {}) => JSON.stringify({ name: 'app', type: 'module', ...extra });
const dep = (name: string, version: string, extra: object = {}) => JSON.stringify({ name, version, type: 'module', ...extra });

// ---------------------------------------------------------------------------------------------------------------
// TypeScript the stripper has to get right before Rolldown sees it.

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

test('tricky TypeScript strips to JavaScript that Rolldown bundles, and the bundle runs', async () => {
  const main = Object.keys(TRICKY).filter((f) => !['src/types.ts'].includes(f)).map((f, i) => `import * as m${i} from './${f.slice(4)}';\nexport { m${i} };`).join('\n') + '\nexport const all = 1;\n';
  const b = await build({ 'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': main, ...TRICKY });
  assert.equal(b.code, 0, b.lines.join('\n'));
  const mod = await import(b.at(mapOf(b.read('index.html')).imports['/src/main.ts']!.slice(1)));
  assert.equal(mod.all, 1);
  assert.equal(Object.keys(mod).length, Object.keys(TRICKY).length, 'every module evaluated');
});

test('open: a type-only statement whose ";" sits on the next line keeps that ";" (the stripper blanks it and the shipped module throws)', { todo: 'upstream: amaro (and Node\'s own type stripping, so npm test shows it) blanks the ";"; CL decision: noted' }, async () => {
  const src = 'let x = 1\ntype T = string\n;[1].forEach(() => {})\nexport { x };\n';
  const b = await build({ 'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': src });
  assert.equal(b.code, 0, b.lines.join('\n'));
  const out = b.read(mapOf(b.read('index.html')).imports['/src/main.ts']!.slice(1));
  // tsc emits `let x = 1;\n[1].forEach(...)`; the blanked file is `let x = 1\n \n [1].forEach(...)`, i.e. 1[1].forEach.
  assert.doesNotThrow(() => vm.runInNewContext(out.replace(/export\s*\{[^}]*\};?/, '')), `shipped:\n${out}`);
});

// ---------------------------------------------------------------------------------------------------------------
// Naming and hashing (dist 2).

test('names carry a content hash; rebuilds are byte-identical; an edit renames the chunk it lands in, not the others; assets keep their names', async () => {
  const files: Files = {
    'package.json': PKG(), 'index.html': INDEX,
    'src/main.ts': "import { a } from './a.b.ts';\nimport { twin } from './twin.ts';\nexport const view = () => import('./views/v.ts');\nexport { a, twin };\n",
    'src/a.b.ts': 'export const a = 1;\n',
    'src/twin.ts': 'export const twin = 1;\n',
    'src/views/v.ts': 'export default 1;\n',
    'assets/app.css': 'body{}', 'assets/deep/a.b.png': 'png',
  };
  const b = await build(files);
  assert.equal(b.code, 0, b.lines.join('\n'));
  const snapshot = () => new Map(listAll(join(b.root, 'dist')).map((f) => [f, b.bytes(f).toString('base64')]));
  const chunk = (prefix: string) => listAll(join(b.root, 'dist')).find((f) => f.startsWith(prefix) && hashedName.test(f))!;
  const before = snapshot();
  const [main, view] = [chunk('src/main.'), chunk('src/views/v.')];
  assert.ok(main && view, [...before.keys()].join('\n'));
  assert.equal((await b.again()).code, 0);
  assert.deepEqual(snapshot(), before, 'deterministic');
  b.edit('src/twin.ts', 'export const twin = 2;\n');
  assert.equal((await b.again()).code, 0);
  assert.notEqual(chunk('src/main.'), main, 'the edited module is in the entry chunk');
  assert.equal(chunk('src/views/v.'), view, 'the lazy view did not change');
  assert.ok(existsSync(b.at('assets/app.css')) && existsSync(b.at('assets/deep/a.b.png')), 'assets keep their names');
});

// ---------------------------------------------------------------------------------------------------------------
// Import map (dist 3, ADR-35).

const GRAPH: Files = {
  'package.json': PKG({ dependencies: { a: '1', b: '1', c: '2' } }),
  'index.html': INDEX,
  'src/main.ts': "import { mount } from '@jasno/core';\nimport { a } from 'a';\nimport { b } from 'b';\nimport { c } from 'c';\nimport { route } from '@jasno/core/router';\nexport { mount, a, b, c, route };\n",
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

// ---------------------------------------------------------------------------------------------------------------
// modulepreload and the manifest (dist 4, 9).

// ---------------------------------------------------------------------------------------------------------------
// CSP, _headers, SPA fallback (dist 5-7).

const SIMPLE: Files = { 'package.json': PKG(), 'index.html': INDEX, 'src/main.ts': "import { mount } from '@jasno/core';\nexport const lazy = () => import('./views/v.ts');\nexport { mount };\n", 'src/views/v.ts': 'export default 1;\n', 'assets/logo.svg': '<svg/>' };

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
  assert.ok(headers.includes('\n/src/*\n  Cache-Control: public, max-age=31536000, immutable\n'));
  assert.ok(!headers.includes('/_deps/') && !headers.includes('/jasno/'), 'chunks live under /src/ only');
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
  const code = listAll(join(b.root, 'dist')).filter((f) => f.endsWith('.js')).map((f) => b.read(f)).join('\n');
  assert.match(code, /\bshared\b/, 'shared ships');
  assert.doesNotMatch(code, /\b(mock|deep)\b/, 'config.dev.ts and its mocks do not');
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
  const code = listAll(join(b.root, 'dist')).filter((f) => f.endsWith('.js')).map((f) => b.read(f)).join('\n');
  assert.ok(code.includes('/api/users'));
  assert.ok(!code.includes('hunter2'), 'the mock does not ship');
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
  const viewUrl = () => Object.keys(mapOf(b.read('index.html')).integrity).find((u) => u.startsWith('/src/views/v.'))!;
  const urls = [viewUrl()];
  const bodies = [b.read(urls[0]!.slice(1))];
  for (let i = 2; i <= 4; i++) {
    b.edit('src/views/v.ts', `export default ${i};\n`);
    assert.equal((await b.again({ keep: 2 })).code, 0);
    urls.push(viewUrl());
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
  const s = await served({ ...SIMPLE, 'src/main.ts': "import d from './d.json' with { type: 'json' };\nexport { d };\n", 'src/d.json': '{}', 'assets/app.webmanifest': '{}', 'assets/data.json': '{}' });
  try {
    const map = mapOf((await s.get('/')).body);
    const js = await s.get(map.imports['/src/main.ts']!);
    assert.match(String(js.headers['content-type']), /^text\/javascript/);
    assert.equal((await s.get('/assets/data.json')).headers['content-type'], 'application/json');
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

// ---------------------------------------------------------------------------------------------------------------
// --prefix (dist 10): src/ and assets/ under one URL path, index.html at the root (Astra serves /control/assets/).

const PREFIXED: Files = {
  ...SIMPLE,
  'index.html': INDEX.replace('<!--jasno:head-->', [
    '<link rel="stylesheet" href="/assets/app.css">',
    "<link rel=icon href='/assets/i.png'>",
    '<!-- <link href="/assets/commented.css"> -->',
    '<script>var keep = \' src="/assets/x.png" \';</script>',
    '<a href="/assets-not/x">x</a>',
    '<!--jasno:head-->',
  ].join('\n  ')),
  'assets/app.css': '@font-face{font-family:x;src:url(font.woff2)}', 'assets/i.png': 'png',
};

test('dist 10 --prefix: src/ and assets/ move under the prefix; the import map, integrity, preloads and index.html links follow', async () => {
  const b = await build(PREFIXED, { prefix: '/control/assets/' });
  assert.equal(b.code, 0, b.lines.join('\n'));
  const all = listAll(join(b.root, 'dist'));
  assert.deepEqual(all.filter((f) => !f.startsWith('control/assets/')).sort(), ['.jasno/manifest.json', '404.html', '_headers', '_redirects', 'index.html']);
  assert.ok(all.includes('control/assets/assets/app.css') && all.includes('control/assets/assets/i.png'), all.join('\n'));
  const html = b.read('index.html');
  const map = mapOf(html);
  const entry = map.imports['/src/main.ts']!;
  assert.match(entry, /^\/control\/assets\/src\/main\.[0-9a-z]{8}\.js$/);
  assert.ok(Object.keys(map.integrity).length >= 2);
  for (const [url, sri] of Object.entries(map.integrity)) {
    assert.ok(url.startsWith('/control/assets/src/'), url);
    assert.equal(sri, 'sha384-' + createHash('sha384').update(b.bytes(url.slice(1))).digest('base64'), url);
  }
  const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]!);
  assert.ok(preloads.length && preloads.every((u) => u.startsWith('/control/assets/src/')), preloads.join(' '));
  assert.ok(html.includes('<link rel="stylesheet" href="/control/assets/assets/app.css">'));
  assert.ok(html.includes("<link rel=icon href='/control/assets/assets/i.png'>"));
  assert.ok(html.includes('<!-- <link href="/assets/commented.css"> -->'), 'comments stay as written');
  assert.ok(html.includes('var keep = \' src="/assets/x.png" \';'), 'script bodies stay as written');
  assert.ok(html.includes('<a href="/assets-not/x">'), 'only /assets/ moves');
  assert.ok(html.includes("<script type=\"module\">import '/src/main.ts';</script>"), 'the entry goes through the import map');
  const headers = b.read('_headers');
  assert.ok(headers.includes('\n/control/assets/assets/*\n  Cache-Control: no-cache\n') && headers.includes('\n/control/assets/src/*\n  Cache-Control: public, max-age=31536000, immutable\n'), headers);
  assert.ok(!/^\/(src|assets)\//m.test(headers), headers);
  assert.equal(b.read('_redirects'), '/control/assets/src/* /404.html 404\n/control/assets/assets/* /404.html 404\n/* /index.html 200\n');
  const mod = await import(b.at(entry.slice(1)));
  assert.equal(typeof (await mod.lazy()).default, 'number', 'the entry and its lazy chunk load from under the prefix');
  assert.ok(JSON.parse(b.read('.jasno/manifest.json')).deploys[0].every((p: string) => p.startsWith('control/assets/src/')));
  assert.equal(b.read('control/assets/assets/app.css'), PREFIXED['assets/app.css'], 'assets are copied as they are');
});

test('dist 10 --prefix: preview serves the prefixed paths with their cache rules; a public/ file may not take the prefix\'s first segment', async () => {
  const b = await build(PREFIXED, { prefix: '/control/assets/' });
  assert.equal(b.code, 0, b.lines.join('\n'));
  const server = await startPreview(b.root, { port: 0 }, reporter(b.root).reporter);
  const get = (p: string) => http(server.url.replace(/\/$/, '') + p);
  try {
    const page = await get('/');
    const js = await get(mapOf(page.body).imports['/src/main.ts']!);
    assert.equal(js.status, 200);
    assert.equal(js.headers['cache-control'], 'public, max-age=31536000, immutable');
    const css = await get('/control/assets/assets/app.css');
    assert.equal(css.status, 200);
    assert.equal(css.headers['cache-control'], 'no-cache');
    assert.equal((await get('/control/assets/src/main.0123abcd.js')).status, 404, 'a missing chunk is a 404, not index.html');
    assert.equal((await get('/src/main.ts')).status, 200, 'other paths still fall back to index.html');
  } finally { await server.close(); }
  const clash = await build({ ...SIMPLE, 'public/control/x.txt': 'x' }, { prefix: '/control/assets/' });
  assert.equal(clash.code, 1);
  assert.ok(clash.lines.some((l) => l.includes('FILE_NOT_PUBLISHED') && l.includes('public/control')), clash.lines.join('\n'));
});

test('dist 10 --prefix: only a URL path with a trailing slash is accepted; jasno dist refuses anything else and writes nothing', async () => {
  for (const p of ['/', '/control/assets/', '/a.b/', '/v_1/~x-y/']) assert.ok(validPrefix(p), p);
  for (const p of ['', 'control/', '/control', '//x/', '/./', '/../', '/a/../b/', '/a//b/', '/a b/', '/%2e%2e/', '/.hidden/', '/a?b/', '/a#b/', 'https://x/']) assert.ok(!validPrefix(p), p);
  const app = project(SIMPLE);
  apps.push(app);
  const err: string[] = [];
  const { error } = console;
  console.error = (...a: unknown[]) => { err.push(a.join(' ')); };
  try { assert.equal(await main(['dist', '--prefix', '../x/'], app.root), 1); } finally { console.error = error; }
  assert.match(err.join('\n'), /--prefix must be a URL path with a trailing slash/);
  assert.ok(!existsSync(join(app.root, 'dist')), 'nothing written');
});
