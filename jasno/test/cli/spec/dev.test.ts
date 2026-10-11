// Conformance probes for `jasno dev` against design.md ADR-34, ADR-35, (c) and (e) "jasno dev".
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { dev, startDev, type DevOptions, type DevServer } from '../../../cli/dev.ts';
import { main as cli } from '../../../cli/main.ts';
import { http, INDEX, project, reporter, type Res } from '../fixture.ts';

interface Running { root: string; port: number; base: string; lines: string[]; server: DevServer }

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => { for (const c of cleanups.reverse()) await c(); });

/** A fresh project root with its own server (two servers in one root would share .jasno/dev.json). */
async function start(files: Record<string, string | undefined>, setup?: (root: string) => void, opts: Omit<DevOptions, 'port'> = {}): Promise<Running> {
  const app = project(files);
  setup?.(app.root);
  const r = reporter(app.root);
  const server = await startDev(app.root, { port: 0, ...opts }, r.reporter);
  cleanups.push(() => app.remove(), () => server.close());
  return { root: app.root, port: server.port, base: server.url.replace(/\/$/, ''), lines: r.lines, server };
}

/** A request with the path sent exactly as written (fetch and http(url) normalize %2e%2e and backslashes first). */
function raw(port: number, path: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: opts.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}

const importMap = (html: string): { imports: Record<string, string>; scopes: Record<string, Record<string, string>> } =>
  JSON.parse(/<script type="importmap">(.*?)<\/script>/s.exec(html)![1]!) as never;

const pkg = (name: string, version: string, extra: object = {}): string => JSON.stringify({ name, version, type: 'module', ...extra });

// ---------------------------------------------------------------------------------------------------------------
// The main project: a dependency zoo for the import map, secrets and symlinks for the allowlist.

const STRIP_SRC = `import type { A } from './types.ts';
interface I {
  a: number;
  b: string;
}
type T<U> = { u: U };
export function f<X extends object>(x: X, y?: number): X {
  return x as X;
}
export const g = (v: unknown) => v satisfies unknown;
export class C { #p: number = 1; m(this: C): void {} }
export const h = <V,>(v: V): V => v;
`;

const MAIN = [
  "import 'order';",
  "import 'nested';",
  "import 'arr';",
  "import 'arr2';",
  "import 'pat/features/a.js';",
  "import 'pat/features/deep/b.js';",
  "import 'pat/features/private/c.js';",
  "import 'plain';",
  "import 'selfy';",
  "import 'b';",
  "import 'two-a';",
  "import 'dynamic';",
  "import 'lru';",
  "import 'legacy';",
  "import 'envy';",
  "import 'envdoc';",
  "import 'nodey';",
  "import 'app/util';",
  "import '#store';",
  "import '#plain';",
  "import data from './data.json' with { type: 'json' };",
  'export { data };',
  '',
].join('\n');

const main = await start({
  'package.json': JSON.stringify({
    name: 'app', type: 'module', exports: { './util': './src/util.ts' },
    imports: { '#store': './src/$$store.ts', '#plain': 'plain' },
  }),
  'index.html': INDEX,
  '.env': 'SECRET=TOPSECRET',
  '.git/config': '[core] TOPSECRET',
  'secret.ts': 'export const s = "TOPSECRET";\n',
  'outside/secret.ts': 'export const s = "TOPSECRET";\n',
  'tsconfig.json': '{}',
  'src/main.ts': MAIN,
  'src/util.ts': 'export const u = 1;\n',
  'src/$$store.ts': 'export const store = 1;\n',
  'src/data.json': '{"a":1}',
  'src/strip.ts': STRIP_SRC,
  'src/enum.ts': 'export enum E { A }\n',
  'src/pos.ts': "// a missing module, reported at its opening quote\nimport   './nope.ts';\n",
  'src/m.mts': 'export const m: number = 1;\n',
  'src/logo.png': 'png',
  'assets/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  'assets/page.html': '<!doctype html><script>alert(1)</script>',
  // exports: the first matching key in object order wins (Node), not the order of the condition set
  'node_modules/order/package.json': pkg('order', '1.0.0', { exports: { '.': { default: './d.js', browser: './b.js' } } }),
  'node_modules/order/d.js': 'export {};\n',
  'node_modules/order/b.js': 'export {};\n',
  'node_modules/nested/package.json': pkg('nested', '1.0.0', { exports: { '.': { node: './n.js', browser: { development: './bd.js', default: './bp.js' } } } }),
  'node_modules/nested/n.js': 'export {};\n',
  'node_modules/nested/bd.js': 'export {};\n',
  'node_modules/nested/bp.js': 'export {};\n',
  // array targets: an invalid target falls through (Node does the same) ...
  'node_modules/arr/package.json': pkg('arr', '1.0.0', { exports: { '.': ['not-relative.js', './ok.js'] } }),
  'node_modules/arr/ok.js': 'export {};\n',
  // ... but a valid target naming a missing file does not (Node resolves ./missing.js and fails to load it)
  'node_modules/arr2/package.json': pkg('arr2', '1.0.0', { exports: { '.': ['./missing.js', './present.js'] } }),
  'node_modules/arr2/present.js': 'export {};\n',
  'node_modules/pat/package.json': pkg('pat', '1.0.0', { exports: { './features/*.js': './lib/*.js', './features/deep/*.js': './lib/deep/*.js', './features/private/*': null } }),
  'node_modules/pat/lib/a.js': 'export {};\n',
  'node_modules/pat/lib/deep/b.js': 'export {};\n',
  'node_modules/pat/lib/private/c.js': 'export {};\n',
  'node_modules/plain/package.json': pkg('plain', '1.0.0'),
  'node_modules/plain/index.js': 'export {};\n',
  'node_modules/selfy/package.json': pkg('selfy', '1.0.0', { exports: { '.': './index.js', './x': './x.js' } }),
  'node_modules/selfy/index.js': "import 'selfy/x';\n",
  'node_modules/selfy/x.js': 'export {};\n',
  // two versions of one package: two-a@1 for the app, two-a@2 nested under b
  'node_modules/two-a/package.json': pkg('two-a', '1.0.0', { exports: './index.js' }),
  'node_modules/two-a/index.js': 'export const v = 1;\n',
  'node_modules/b/package.json': pkg('b', '1.0.0', { exports: './index.js' }),
  'node_modules/b/index.js': "import 'two-a';\nimport 'plain';\n",
  'node_modules/b/node_modules/two-a/package.json': pkg('two-a', '2.0.0', { exports: './index.js' }),
  'node_modules/b/node_modules/two-a/index.js': 'export const v = 2;\n',
  'node_modules/dynamic/package.json': pkg('dynamic', '1.0.0', { exports: './index.js' }),
  'node_modules/dynamic/index.js': "const n = 'x';\nexport const load = () => import('./' + n + '.js');\n",
  'node_modules/dynamic/x.js': 'export {};\n',
  'node_modules/unused/package.json': pkg('unused', '1.0.0'),
  'node_modules/unused/index.js': 'export {};\n',
  // the tshy / dual-package layout: a nameless {"type":"module"} marker next to the ESM build
  'node_modules/lru/package.json': JSON.stringify({ name: 'lru', version: '11.0.0', exports: { '.': { import: './dist/esm/index.js', require: './dist/cjs/index.js' } } }),
  'node_modules/lru/dist/esm/package.json': '{"type":"module"}',
  'node_modules/lru/dist/esm/index.js': "export * from '../shared.js';\n",
  'node_modules/lru/dist/shared.js': 'export const LRU = 1;\n',
  // no "exports", an extension-less "main" (Node's legacy main resolution adds .js)
  'node_modules/legacy/package.json': JSON.stringify({ name: 'legacy', version: '1.0.0', main: 'lib/index' }),
  'node_modules/legacy/lib/index.js': 'export const l = 1;\n',
  'node_modules/envy/package.json': pkg('envy', '1.0.0', { exports: './index.js' }),
  'node_modules/envy/index.js': 'export const x = 1;\nexport const mode = process.env.NODE_ENV;\n',
  'node_modules/envdoc/package.json': pkg('envdoc', '1.0.0', { exports: './index.js' }),
  'node_modules/envdoc/index.js': '// Unlike the Node build, this file never reads process.env.\nexport const x = 1;\n',
  'node_modules/nodey/package.json': pkg('nodey', '1.0.0', { exports: './index.js' }),
  'node_modules/nodey/index.js': "import { readFileSync } from 'node:fs';\nexport { readFileSync };\n",
}, (root) => {
  symlinkSync('../secret.ts', join(root, 'src/link.ts'));
  symlinkSync('../outside', join(root, 'src/linkdir'));
  symlinkSync('../secret.ts', join(root, 'assets/link.txt'));
  symlinkSync('../outside', join(root, 'assets/dir'));
});

const index = await http(main.base + '/');
const map = importMap(index.body);
const get = (path: string, headers: Record<string, string> = {}): Promise<Res> => raw(main.port, path, { headers });
const HTML = { accept: 'text/html,application/xhtml+xml' };

// ---------------------------------------------------------------------------------------------------------------
// Allowlist and traversal (ADR-34: "serves an allowlist ... rejects dot segments"; (e) dev "Serves an allowlist")

test('traversal in every encoding, symlinks out of src/ and assets/, dot paths: never 200, never the secret', async () => {
  const paths = [
    '/.env', '/.git/config', '/.jasno/dev.json', '/secret.ts', '/node_modules/two-a/package.json',
    '/src/%2e%2e/secret.ts', '/src/%2E%2E/.env', '/assets/%2e%2e/%2e%2e/etc/passwd', '/assets/%252e%252e/secret.ts',
    '/assets/..%2fsecret.ts', '/assets/..%2f.env', '/assets/%2e%2e%2fsecret.ts', '/assets/%5c..%5csecret.ts',
    '/assets\\..\\secret.ts', '/assets/..\\secret.ts', '/assets/logo.svg%00', '/assets/logo.svg%00.png', '/src/main.ts%00',
    '/src/link.ts', '/src/linkdir/secret.ts', '/assets/link.txt', '/assets/dir/secret.ts', '/@dep/two-a@1.0.0/%2e%2e/%2e%2e/secret.ts', '/@dep/two-a@1.0.0/..%2f..%2fsecret.ts',
    '/@dep/b@1.0.0/node_modules/two-a/index.js', '/@dep/b@1.0.0/node_modules%2ftwo-a/index.js',
    '/src/..%5c..%5csecret.ts', `/assets/${'a/'.repeat(2000)}logo.svg`,
  ];
  for (const path of paths) {
    const res = await get(path);
    assert.notEqual(res.status, 200, path);
    assert.ok(!res.body.includes('TOPSECRET'), path);
  }
});

test('invalid percent-encoding is 400, not a crash', async () => {
  assert.equal((await get('/src/%E0%A4%A')).status, 400);
  assert.equal((await get('/__jasno/ping')).status, 200);
});

test('case variants of prefixes and file names are 404 (static Linux hosts are case-sensitive)', async () => {
  for (const path of ['/ASSETS/logo.svg', '/Src/main.ts', '/@DEP/two-a@1.0.0/index.js', '/@dep/TWO-A@1.0.0/index.js', '/@dep/two-a@1.0.0/INDEX.js', '/Index.html']) {
    assert.equal((await get(path)).status, 404, path);
  }
});

test('dependency files: served under their own prefix, not through a parent\'s nested node_modules (CL-05)', async () => {
  assert.equal((await get('/@dep/two-a@2.0.0/index.js')).status, 200);
  assert.match((await get('/@dep/two-a@2.0.0/index.js')).body, /v = 2/);
  assert.equal((await get('/@dep/b@1.0.0/node_modules/two-a/index.js')).status, 404);
  // CL-05: any file of a resolved package, its package.json included
  assert.equal((await get('/@dep/two-a@1.0.0/package.json')).status, 200);
  // a package the module graph does not resolve is not served
  assert.equal((await get('/@dep/unused@1.0.0/index.js')).status, 404);
});

test('a package\'s own non-literal import() target is served (CL-05) and is not DEP_NOT_BROWSER_ESM', async () => {
  assert.equal((await get('/@dep/dynamic@1.0.0/x.js')).status, 200);
  assert.ok(!main.lines.some((l) => l.includes('node_modules/dynamic/')), main.lines.join('\n'));
});

// ---------------------------------------------------------------------------------------------------------------
// Host (ADR-34: "answers 403 unless Host is a loopback name")

test('Host variants: loopback names and IP literals pass (rebinding needs a name), other names are 403', async () => {
  const p = main.port;
  for (const host of [`LOCALHOST:${p}`, `127.0.0.1:${p}`, `127.8.9.10:${p}`, `[::1]:${p}`, `x.localhost:${p}`, `0.0.0.0:${p}`, `[::ffff:7f00:1]:${p}`]) {
    assert.equal((await get('/', { host })).status, 200, host);
  }
  for (const host of [`127.1:${p}`, `evil.example:${p}`, `localhost.evil.example:${p}`, `127.0.0.1.nip.io:${p}`, `localhost.:${p}`]) {
    assert.equal((await get('/', { host })).status, 403, host);
  }
});

test('a request without Host (HTTP/1.0) is refused', async () => {
  const status = await new Promise<string>((resolve, reject) => {
    const s = connect(main.port, '127.0.0.1', () => s.write('GET / HTTP/1.0\r\n\r\n'));
    let buf = '';
    s.on('data', (d) => { buf += String(d); });
    s.on('end', () => resolve(buf.split('\r\n')[0] ?? ''));
    s.on('error', reject);
  });
  assert.match(status, /^HTTP\/1\.[01] 40[03]/);
});

test('a Host that only starts with [::1] is not a loopback name', async () => {
  assert.equal((await get('/', { host: `[::1]evil.example:${main.port}` })).status, 403);
});

test('the server also listens on ::1', async (t) => {
  const res = await http(`http://[::1]:${main.port}/__jasno/ping`).catch(() => undefined);
  if (!res) return t.skip('no IPv6 loopback');
  assert.equal(res.status, 200);
});

// ---------------------------------------------------------------------------------------------------------------
// Methods (CL-04: only GET and HEAD, 405 otherwise, except POST /__jasno/log)

test('/__jasno/ endpoints other than POST /__jasno/log answer 405 to other methods', async () => {
  assert.equal((await raw(main.port, '/__jasno/ping', { method: 'POST' })).status, 405);
  assert.equal((await raw(main.port, '/__jasno/client.js', { method: 'DELETE' })).status, 405);
  assert.equal((await raw(main.port, '/__jasno/nope', { method: 'PUT' })).status, 405);
});

test('HEAD is served like GET without a body, CSP included', async () => {
  const head = await raw(main.port, '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['content-security-policy'], index.headers['content-security-policy']);
  const mod = await raw(main.port, '/src/util.ts', { method: 'HEAD' });
  assert.equal(mod.status, 200);
  assert.match(String(mod.headers['content-type']), /^text\/javascript/);
});

// ---------------------------------------------------------------------------------------------------------------
// CSP ((e) dev "Sends the production CSP"; (e) build 6 for the exact policy)

const sha = (s: string): string => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;
const inline = (html: string): string[] => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);

test('index.html: the CSP is exactly build 6, map hash then entry hash', () => {
  const [mapText, entry] = inline(index.body);
  assert.equal(index.headers['content-security-policy'],
    `script-src 'self' ${sha(mapText!)} ${sha(entry!)}; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'`);
});

test('the SPA fallback carries the same CSP as index.html', async () => {
  const res = await get('/users/1', HTML);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-security-policy'], index.headers['content-security-policy']);
});

test('every inline script of a richer index.html gets its hash (classic, module, JSON-LD, uppercase tag)', async () => {
  const html = INDEX.replace('</head>', '<script>window.a = 1;</script>\n<SCRIPT type="application/ld+json">{"@type":"x"}</SCRIPT>\n</head>');
  const app = await start({ 'package.json': '{"type":"module"}', 'index.html': html, 'src/main.ts': 'export {};\n' });
  const res = await http(app.base + '/');
  const csp = String(res.headers['content-security-policy']);
  for (const s of [...res.body.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!)) assert.ok(csp.includes(sha(s)), s);
});

test('files under /assets/ get the production CSP too (the build\'s _headers applies it to /*)', async () => {
  for (const path of ['/assets/page.html', '/assets/logo.svg']) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.match(String(res.headers['content-security-policy']), /require-trusted-types-for 'script'/, path);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Import map ((e) dev: "one generated import map ... with the development condition"; ADR-35 Node's resolver)

test('exports: first matching key in object order, nested conditions, invalid array entries fall through', () => {
  assert.equal(map.imports['order'], '/@dep/order@1.0.0/d.js');
  assert.equal(map.imports['nested'], '/@dep/nested@1.0.0/bd.js');
  assert.equal(map.imports['arr'], '/@dep/arr@1.0.0/ok.js');
});

test('an array target naming a missing file is not skipped (Node resolves it and fails)', () => {
  assert.notEqual(map.imports['arr2'], '/@dep/arr2@1.0.0/present.js');
});

test('subpath patterns: the longest prefix wins; a null target is not exported and is reported', () => {
  assert.equal(map.imports['pat/features/a.js'], '/@dep/pat@1.0.0/lib/a.js');
  assert.equal(map.imports['pat/features/deep/b.js'], '/@dep/pat@1.0.0/lib/deep/b.js');
  assert.equal(map.imports['pat/features/private/c.js'], undefined);
  assert.ok(main.lines.some((l) => l.startsWith('src/main.ts:7:8 ') && l.includes('pat/features/private/c.js')), main.lines.join('\n'));
});

test('two versions of one package: the app gets 1.0.0, b\'s scope gets its nested 2.0.0', () => {
  assert.equal(map.imports['two-a'], '/@dep/two-a@1.0.0/index.js');
  assert.equal(map.scopes['/@dep/b@1.0.0/']!['two-a'], '/@dep/two-a@2.0.0/index.js');
  // a dependency importing another top-level dependency goes under its scope too
  assert.equal(map.scopes['/@dep/b@1.0.0/']!['plain'], '/@dep/plain@1.0.0/index.js');
});

test('self-reference: the app by its own name, a package by its own name (under its scope)', () => {
  assert.equal(map.imports['app/util'], '/src/util.ts');
  assert.equal(map.scopes['/@dep/selfy@1.0.0/']!['selfy/x'], '/@dep/selfy@1.0.0/x.js');
});

test('an app "imports" key that names a package maps to the package file', () => {
  assert.equal(map.imports['#plain'], '/@dep/plain@1.0.0/index.js');
});

test('a "$$" in a mapped path survives injection (String.replace patterns)', () => {
  assert.equal(map.imports['#store'], '/src/$$store.ts');
});

test('a package with a nameless {"type":"module"} marker is still /@dep/<name>@<version>/', async () => {
  assert.equal(map.imports['lru'], '/@dep/lru@11.0.0/dist/esm/index.js');
  // its relative import leaves dist/esm/; the browser asks for /@dep/lru@11.0.0/dist/shared.js
  assert.equal((await get('/@dep/lru@11.0.0/dist/shared.js')).status, 200);
});

test('an extension-less "main" without "exports" resolves like Node (lib/index -> lib/index.js)', () => {
  assert.equal(map.imports['legacy'], '/@dep/legacy@1.0.0/lib/index.js');
});

// ---------------------------------------------------------------------------------------------------------------
// DEP_NOT_BROWSER_ESM ((c): "a dependency's closure contains CommonJS, process.env or an unresolvable bare import")

test('DEP_NOT_BROWSER_ESM: process.env at its position, a node: import at its position', () => {
  assert.ok(main.lines.some((l) => l.startsWith('node_modules/envy/index.js:2:21 DEP_NOT_BROWSER_ESM')), main.lines.join('\n'));
  assert.ok(main.lines.some((l) => l.startsWith('node_modules/nodey/index.js:1:30 DEP_NOT_BROWSER_ESM') && l.includes('node:fs')), main.lines.join('\n'));
});

test('"process.env" in a comment is not a process.env read', () => {
  assert.ok(!main.lines.some((l) => l.includes('node_modules/envdoc/') && l.includes('DEP_NOT_BROWSER_ESM')), main.lines.join('\n'));
});

// ---------------------------------------------------------------------------------------------------------------
// Modules under /src ((e) dev: stripping, SYNTAX_REJECTED, TS_EXTENSION, ASSET_OUTSIDE_ASSETS)

test('strip: same length, same line breaks, code at the same offsets', async () => {
  const res = await get('/src/strip.ts');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, STRIP_SRC.length);
  const breaks = (s: string): number[] => [...s.matchAll(/\n/g)].map((m) => m.index);
  assert.deepEqual(breaks(res.body), breaks(STRIP_SRC));
  for (const code of ['return x', 'export class C', '#p', '=> v']) assert.equal(res.body.indexOf(code), STRIP_SRC.indexOf(code), code);
  assert.ok(!/interface|satisfies|: number/.test(res.body), res.body);
});

test('an enum is a strip failure: served as a module that throws SyntaxError with file:line:col', async () => {
  const res = await get('/src/enum.ts');
  assert.equal(res.status, 200);
  assert.match(String(res.headers['content-type']), /^text\/javascript/);
  assert.match(res.body, /^throw new SyntaxError\("\[SYNTAX_REJECTED\] \/src\/enum\.ts:1:\d+ /);
});

test('one strip failure prints one line (not once from the graph and again on request)', async () => {
  await get('/src/enum.ts');
  const distinct = new Set(main.lines.filter((l) => l.startsWith('src/enum.ts:') && l.includes('SYNTAX_REJECTED')));
  assert.equal(distinct.size, 1, [...distinct].join('\n'));
});

test('MODULE_NOT_FOUND prints file:line:col at the opening quote of the specifier', () => {
  assert.ok(main.lines.some((l) => l.startsWith('src/pos.ts:2:10 MODULE_NOT_FOUND ')), main.lines.join('\n'));
});

test('ASSET_OUTSIDE_ASSETS only for existing non-module files under /src/', async () => {
  assert.match((await get('/src/logo.png')).body, /ASSET_OUTSIDE_ASSETS/);
  const missing = await get('/src/nope.png');
  assert.equal(missing.status, 404);
  assert.doesNotMatch(missing.body, /ASSET_OUTSIDE_ASSETS/);
  assert.doesNotMatch((await get('/assets/nope.png')).body, /ASSET_OUTSIDE_ASSETS/);
  assert.equal((await get('/src/data.json')).status, 200);
});

test('a .mts file under /src/ is "any other file": 404 with the ASSET_OUTSIDE_ASSETS hint', async () => {
  const res = await get('/src/m.mts');
  assert.equal(res.status, 404);
  assert.match(res.body, /ASSET_OUTSIDE_ASSETS/);
});

test('a 404 under /@jasno/ names the correct file (/@jasno/src/router.js -> /@jasno/src/router.ts)', async () => {
  const res = await get('/@jasno/src/router.js');
  assert.equal(res.status, 404);
  assert.match(res.body, /\/@jasno\/src\/router\.ts/);
});

test('a module URL with a trailing slash is 404, as on a static host', async () => {
  assert.equal((await get('/src/util.ts/')).status, 404);
});

// ---------------------------------------------------------------------------------------------------------------
// SPA fallback ((e) dev: "a GET with Accept: text/html, no file extension and no matching file serves index.html;
// never under /src, /@dep or /@jasno, and never for .ts/.js")

test('SPA fallback: extension-less HTML navigations only; never for .ts/.js or without Accept: text/html', async () => {
  assert.equal((await get('/users/1', HTML)).status, 200);
  assert.equal((await get('/deep/a/b/c', HTML)).status, 200);
  assert.equal((await get('/users/1.ts', HTML)).status, 404);
  assert.equal((await get('/users/1.js', HTML)).status, 404);
  assert.equal((await get('/users/1', { accept: '*/*' })).status, 404);
});

test('no SPA fallback for /src, /@dep and /@jasno themselves', async () => {
  for (const path of ['/src', '/@dep', '/@jasno']) assert.equal((await get(path, HTML)).status, 404, path);
});

test('an extension-less miss under /assets/ is a missing file (404), as in the build\'s _redirects', async () => {
  const res = await get('/assets/docs', HTML);
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------------------------------------------
// /__jasno/log (ADR-34: "accepts /__jasno/log only from its own origin with a size cap and strips control characters
// before printing")

const log = (body: string, headers: Record<string, string> = {}): Promise<Res> =>
  raw(main.port, '/__jasno/log', { method: 'POST', headers: { origin: main.base, 'content-type': 'application/json', ...headers }, body });

test('/__jasno/log: exactly 64 KB is accepted, one byte more is 413', async () => {
  const envelope = JSON.stringify({ text: '' }).length;
  assert.equal((await log(JSON.stringify({ text: 'a'.repeat(65536 - envelope) }))).status, 204);
  assert.equal((await log(JSON.stringify({ text: 'b'.repeat(65537 - envelope) }))).status, 413);
});

test('/__jasno/log: an oversized chunked body (no content-length) is dropped, not printed, and the server lives', async () => {
  await log('c'.repeat(70_000), { 'transfer-encoding': 'chunked' }).then((r) => assert.equal(r.status, 413), () => { /* connection dropped: capped */ });
  assert.ok(!main.lines.some((l) => l.includes('ccccc')));
  assert.equal((await get('/__jasno/ping')).status, 200);
});

test('/__jasno/log: CR, ESC and C1 controls are stripped; another origin on the same server is refused', async () => {
  assert.equal((await log(JSON.stringify({ kind: 'error', text: 'one\rtwo\u009b2Jthree\u001b[1m' }))).status, 204);
  assert.ok(main.lines.includes('browser error: onetwo2Jthree[1m'), main.lines.slice(-3).join('\n'));
  const other = `http://localhost:${main.port}`; // same server, different origin than Host 127.0.0.1
  assert.equal((await log('{}', { origin: other })).status, 403);
});

test('/__jasno/log kind and page cannot start a fake terminal line', async () => {
  await log(JSON.stringify({ kind: 'error\nsrc/main.ts:1:1 SYNTAX_REJECTED forged', text: 't', page: '/p\nsrc/x.ts:2:2 TS_EXTENSION forged' }));
  assert.ok(!main.lines.some((l) => /(^|\n)src\/[^\n]*forged/.test(l)), main.lines.slice(-2).join('\n'));
});

test('a 404 path cannot put control characters in the terminal (any web page can request it via <img>)', async () => {
  await get('/x%0Asrc%2Fmain.ts:1:1%20SYNTAX_REJECTED%20forged%1b[2J');
  assert.ok(!main.lines.some((l) => /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(l) || /\nsrc\/main\.ts:1:1/.test(l)), JSON.stringify(main.lines.slice(-2)));
});

// ---------------------------------------------------------------------------------------------------------------
// The dev client ((e) dev: capture-phase error listener, live reload skipped under navigator.webdriver)

test('the dev client forwards errors in the capture phase and skips live reload under WebDriver', async () => {
  const res = await get('/__jasno/client.js');
  assert.match(String(res.headers['content-type']), /^text\/javascript/);
  assert.match(res.body, /addEventListener\('error', [\s\S]*?\}, true\);/);
  assert.match(res.body, /if \(!navigator\.webdriver\) new EventSource\('\/__jasno\/events'\)/);
});

// ---------------------------------------------------------------------------------------------------------------
// index.html: handwritten import maps, injection point, the entry

test('IMPORT_MAP_HANDWRITTEN: quote style, case and attribute order variants are all refused', async () => {
  const app = await start({ 'package.json': '{"type":"module"}', 'index.html': INDEX, 'src/main.ts': 'export {};\n' });
  for (const tag of ["<script type='importmap'>{}</script>", '<SCRIPT TYPE="IMPORTMAP">{}</SCRIPT>', '<script async\n  type=importmap>{}</script>', '<script/type="importmap">{}</script>']) {
    writeFileSync(join(app.root, 'index.html'), INDEX.replace('<!--jasno:head-->', tag));
    const res = await http(app.base + '/');
    assert.equal(res.status, 500, tag);
    assert.match(res.body, /IMPORT_MAP_HANDWRITTEN/, tag);
    assert.doesNotMatch(res.body, /__jasno\/client/, tag);
    assert.match(String(res.headers['content-security-policy']), /trusted-types 'none'/, tag);
  }
});

test('type=" importmap " (whitespace is stripped by the HTML rule) is a handwritten import map', async () => {
  const app = await start({ 'package.json': '{"type":"module"}', 'index.html': INDEX.replace('<!--jasno:head-->', '<script type=" importmap ">{}</script>'), 'src/main.ts': 'export {};\n' });
  assert.equal((await http(app.base + '/')).status, 500);
});

test('an import map inside an HTML comment is not a handwritten import map', async () => {
  const app = await start({ 'package.json': '{"type":"module"}', 'index.html': INDEX.replace('<!--jasno:head-->', '<!--jasno:head-->\n  <!-- old: <script type="importmap">{}</script> -->'), 'src/main.ts': 'export {};\n' });
  assert.equal((await http(app.base + '/')).status, 200);
});

test('without the slot the map goes before </head>', async () => {
  const app = await start({ 'package.json': '{"type":"module"}', 'index.html': INDEX.replace('  <!--jasno:head-->\n', ''), 'src/main.ts': 'export {};\n' });
  const res = await http(app.base + '/');
  assert.match(res.body, /<script type="module" src="\/__jasno\/client.js"><\/script>\n<\/head>/);
});

test('without <head> the injected markup does not precede <!doctype> (quirks mode)', async () => {
  const html = "<!doctype html>\n<title>App</title>\n<script type=\"module\">import '/src/main.ts';</script>\n";
  const app = await start({ 'package.json': '{"type":"module"}', 'index.html': html, 'src/main.ts': 'export {};\n' });
  assert.match((await http(app.base + '/')).body, /^<!doctype html>/i);
});

test('an entry in index.html that names no file is MODULE_NOT_FOUND when the map is built', async () => {
  const app = await start({ 'package.json': '{"type":"module"}', 'index.html': INDEX.replace('/src/main.ts', '/src/mian.ts'), 'src/main.ts': 'export {};\n' });
  await http(app.base + '/');
  assert.ok(app.lines.some((l) => l.includes('MODULE_NOT_FOUND') && l.includes('/src/mian.ts')), app.lines.join('\n'));
});

// ---------------------------------------------------------------------------------------------------------------
// Live reload ((e) dev: "full reload on change of a served file (debounced)"; ADR-34 "watches only served files")

const reloads = async (base: string): Promise<{ count(): number; stop(): Promise<void> }> => {
  const res = await fetch(base + '/__jasno/events');
  const reader = res.body!.getReader();
  let n = 0;
  void (async () => {
    for (;;) {
      const c = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (c.done) return;
      n += (new TextDecoder().decode(c.value).match(/event: reload/g) ?? []).length;
    }
  })();
  await sleep(150);
  return { count: () => n, stop: () => reader.cancel() };
};

const WATCHED = {
  'package.json': '{"type":"module"}', 'index.html': INDEX, 'src/main.ts': "import 'wdep';\n", 'assets/a.txt': 'a',
  'README.md': 'x', 'tsconfig.json': '{}', '.env': 'A=1',
  'node_modules/wdep/package.json': pkg('wdep', '1.0.0', { exports: './index.js' }), 'node_modules/wdep/index.js': 'export {};\n',
};

test('live reload: src/, assets/, index.html and package.json changes reload; files outside the allowlist do not; debounced', async () => {
  const app = await start(WATCHED);
  await http(app.base + '/');
  const ev = await reloads(app.base);
  const after = async (fn: () => void): Promise<number> => { const n = ev.count(); fn(); await sleep(400); return ev.count() - n; };
  try {
    assert.equal(await after(() => writeFileSync(join(app.root, 'src/main.ts'), "import 'wdep';\n// edit\n")), 1);
    assert.equal(await after(() => writeFileSync(join(app.root, 'assets/a.txt'), 'b')), 1);
    assert.equal(await after(() => writeFileSync(join(app.root, 'index.html'), INDEX + '\n')), 1);
    assert.equal(await after(() => writeFileSync(join(app.root, 'package.json'), '{"type":"module" }')), 1);
    assert.equal(await after(() => { mkdirSync(join(app.root, 'src/new')); writeFileSync(join(app.root, 'src/new/x.ts'), 'export {};\n'); }), 1);
    for (const f of ['README.md', 'tsconfig.json', '.env']) assert.equal(await after(() => writeFileSync(join(app.root, f), 'changed')), 0, f);
    // five writes inside the debounce window: one reload
    assert.equal(await after(() => { for (let i = 0; i < 5; i++) writeFileSync(join(app.root, 'src/main.ts'), `import 'wdep';\n// ${i}\n`); }), 1);
  } finally {
    await ev.stop();
  }
});

test('editor swap files and other unserved files under src/ do not reload the page', async () => {
  // src/linked -> ../other: its files are never served (symlink), so they are not watched either
  const app = await start({ ...WATCHED, 'other/x.txt': 'x' }, (root) => symlinkSync('../other', join(root, 'src/linked')));
  const ev = await reloads(app.base);
  try {
    for (const f of ['src/.main.ts.swp', 'src/main.ts~', 'src/notes.md', 'src/.env', 'other/x.txt']) {
      const n = ev.count();
      writeFileSync(join(app.root, f), 'x');
      await sleep(400);
      assert.equal(ev.count() - n, 0, f);
    }
  } finally {
    await ev.stop();
  }
});

test('a change to a served dependency file (/@dep/...) reloads the page', async () => {
  // A linked (workspace or file:) package; an installed copy under node_modules is not watched (it does not change).
  const { 'node_modules/wdep/package.json': wpkg, 'node_modules/wdep/index.js': windex, ...rest } = WATCHED;
  const app = await start({ ...rest, 'packages/wdep/package.json': wpkg, 'packages/wdep/index.js': windex });
  mkdirSync(join(app.root, 'node_modules'), { recursive: true });
  symlinkSync(join(app.root, 'packages/wdep'), join(app.root, 'node_modules/wdep'));
  await http(app.base + '/');
  assert.equal((await http(app.base + '/@dep/wdep@1.0.0/index.js')).status, 200);
  const ev = await reloads(app.base);
  try {
    writeFileSync(join(app.root, 'packages/wdep/index.js'), 'export const changed = 1;\n');
    await sleep(400);
    assert.equal(ev.count(), 1);
  } finally {
    await ev.stop();
  }
});

// ---------------------------------------------------------------------------------------------------------------
// .jasno/dev.json and /__jasno/ping ((e) dev: "reuses the server only if it answers for the same root, else takes over")

const readRecord = (root: string): { pid: number; port: number; url: string } | undefined => {
  try { return JSON.parse(readFileSync(join(root, '.jasno/dev.json'), 'utf8')) as never; } catch { return undefined; }
};

/** Runs `jasno dev` until it has written a record other than `stale`, then stops it as Ctrl-C would. */
async function runDev(root: string, port: number, stale: string | undefined): Promise<{ code: number; lines: string[]; record: ReturnType<typeof readRecord> }> {
  const r = reporter(root);
  const done = dev(root, { port }, r.reporter);
  let record: ReturnType<typeof readRecord>;
  for (let i = 0; i < 100; i++) {
    const settled = await Promise.race([done.then(() => true), sleep(30).then(() => false)]);
    record = readRecord(root);
    if (settled || (record && record.url !== stale)) break;
  }
  const quick = await Promise.race([done.then((c) => c), sleep(0).then(() => undefined)]);
  if (quick !== undefined) return { code: quick, lines: r.lines, record };
  process.emit('SIGTERM');
  return { code: await done, lines: r.lines, record };
}

test('dev.json: a stale record (nothing listening) is replaced by a new server', async () => {
  const app = project({ 'package.json': '{"type":"module"}', 'index.html': INDEX, 'src/main.ts': 'export {};\n' });
  cleanups.push(() => app.remove());
  const stale = 'http://127.0.0.1:9/';
  mkdirSync(join(app.root, '.jasno'));
  writeFileSync(join(app.root, '.jasno/dev.json'), JSON.stringify({ pid: 999999, port: 9, url: stale }));
  const { code, lines, record } = await runDev(app.root, 0, stale);
  assert.equal(code, 0);
  assert.equal(record?.pid, process.pid);
  assert.notEqual(record?.url, stale);
  assert.ok(lines.some((l) => l === `jasno dev: ${record?.url}`), lines.join('\n'));
});

test('dev.json: a live record for another root is not reused', async () => {
  const other = await start({ 'package.json': '{"type":"module"}', 'index.html': INDEX, 'src/main.ts': 'export {};\n' });
  const app = project({ 'package.json': '{"type":"module"}', 'index.html': INDEX, 'src/main.ts': 'export {};\n' });
  cleanups.push(() => app.remove());
  mkdirSync(join(app.root, '.jasno'));
  writeFileSync(join(app.root, '.jasno/dev.json'), JSON.stringify(readRecord(other.root)));
  const { code, lines, record } = await runDev(app.root, 0, other.server.url);
  assert.equal(code, 0);
  assert.ok(!lines.some((l) => l.includes('already running')), lines.join('\n'));
  assert.notEqual(record?.url, other.server.url);
});

test('dev.json: when another root\'s server holds the port, jasno dev fails with a --port hint', async () => {
  const other = await start({ 'package.json': '{"type":"module"}', 'index.html': INDEX, 'src/main.ts': 'export {};\n' });
  const app = project({ 'package.json': '{"type":"module"}', 'index.html': INDEX, 'src/main.ts': 'export {};\n' });
  cleanups.push(() => app.remove());
  mkdirSync(join(app.root, '.jasno'));
  writeFileSync(join(app.root, '.jasno/dev.json'), JSON.stringify(readRecord(other.root)));
  const { code, lines } = await runDev(app.root, other.port, other.server.url);
  assert.equal(code, 1);
  assert.deepEqual(lines, [`jasno dev: port ${other.port} is in use; pass --port.`]);
});

// ---------------------------------------------------------------------------------------------------------------
// --proxy ((e) dev: "paths under a --proxy prefix are forwarded with any method, WebSocket upgrades included")

/** A backend: a request echoes { method, url, host, body } with two cookies; an upgrade gets a real WebSocket handshake
 * and one text frame holding its URL (under /api/refuse/ a 401 instead). */
async function backend(): Promise<{ origin: string; host: string }> {
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += String(c); });
    req.on('end', () => {
      res.writeHead(201, { 'content-type': 'application/json', 'set-cookie': ['a=1; Path=/', 'b=2; Path=/; HttpOnly'] });
      res.end(JSON.stringify({ method: req.method, url: req.url, host: req.headers.host, body }));
    });
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  server.on('upgrade', (req, socket) => {
    socket.on('error', () => socket.destroy());
    if (req.url?.startsWith('/api/refuse/')) return void socket.end('HTTP/1.1 401 Unauthorized\r\ncontent-length: 4\r\n\r\nnope');
    const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const payload = Buffer.from(req.url ?? '');
    socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin: `http://${host}`, host };
}

/** A port nothing listens on. */
const closedPort = async (): Promise<number> => {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
};

/** An upgrade request: the status the client sees (101 when the tunnel opened). */
const upgrade = (port: number, path: string, host = `127.0.0.1:${port}`): Promise<number> => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port, path, headers: { host, connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' } });
  req.on('upgrade', (_res, socket) => { socket.destroy(); resolve(101); });
  req.on('response', (res) => { res.resume(); resolve(res.statusCode ?? 0); });
  req.on('error', reject);
  req.end();
});

/** A dev() run expected to return by itself: if it starts a server instead, stop it as Ctrl-C would, and fail. */
async function returns(run: Promise<number>): Promise<number> {
  const code = await Promise.race([run, sleep(3000, undefined, { ref: false })]);
  if (code !== undefined) return code;
  process.emit('SIGTERM');
  await run;
  assert.fail('jasno dev started a server instead of returning');
}

const SIMPLE = { 'package.json': '{"type":"module"}', 'index.html': INDEX, 'src/main.ts': 'export {};\n' };
const api = await backend();
const v2 = await backend();
const downPort = await closedPort();
const proxied = await start(SIMPLE, undefined, { proxy: { '/api/': api.origin, '/api/v2/': v2.origin, '/down/': `http://127.0.0.1:${downPort}` } });

test('proxy: any method, the body, the path and query reach the backend with its own Host; its response passes untouched', async () => {
  // the query byte for byte (a WHATWG URL would re-encode ' as %27)
  const res = await raw(proxied.port, "/api/save?id=1&q='a%20b'", { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' });
  assert.equal(res.status, 201);
  assert.deepEqual(JSON.parse(res.body), { method: 'POST', url: "/api/save?id=1&q='a%20b'", host: api.host, body: '{"a":1}' });
  assert.deepEqual(res.headers['set-cookie'], ['a=1; Path=/', 'b=2; Path=/; HttpOnly']);
  assert.equal(res.headers['content-security-policy'], undefined);
  assert.equal(res.headers['cache-control'], undefined);
  assert.equal(JSON.parse((await raw(proxied.port, '/api/', { method: 'DELETE' })).body).method, 'DELETE');
});

test('proxy: other paths are still served locally, GET only', async () => {
  const index = await raw(proxied.port, '/');
  assert.equal(index.status, 200);
  assert.match(String(index.headers['content-security-policy']), /trusted-types 'none'/);
  assert.equal((await raw(proxied.port, '/src/main.ts')).status, 200);
  assert.equal((await raw(proxied.port, '/apix', { method: 'POST' })).status, 405);
  assert.equal((await raw(proxied.port, '/api', { method: 'POST' })).status, 405);
  assert.equal((await raw(proxied.port, '/api/%2e%2e/.env')).status, 404);
});

test('proxy: the longest prefix wins', async () => {
  assert.equal(JSON.parse((await raw(proxied.port, '/api/v2/users')).body).host, v2.host);
  assert.equal(JSON.parse((await raw(proxied.port, '/api/v1/users')).body).host, api.host);
});

test('proxy: a WebSocket opens through the prefix and receives frames; close() resolves while it is open', async () => {
  const app = await start(SIMPLE, undefined, { proxy: { '/api/': api.origin } });
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/api/ws?x=1`);
  ws.onerror = () => {};
  const message = await Promise.race([
    new Promise<string>((resolve) => { ws.onmessage = (e) => resolve(String(e.data)); }),
    sleep(3000).then(() => 'timeout'),
  ]);
  assert.equal(message, '/api/ws?x=1');
  assert.equal(ws.readyState, WebSocket.OPEN);
  assert.equal(await Promise.race([app.server.close().then(() => 'closed'), sleep(2000).then(() => 'hung')]), 'closed');
});

test('proxy: an upgrade the backend refuses gets its answer; upgrades outside the prefixes are 404', async () => {
  assert.equal(await upgrade(proxied.port, '/api/ws'), 101);
  assert.equal(await upgrade(proxied.port, '/api/refuse/x'), 401);
  for (const path of ['/', '/src/main.ts', '/__jasno/events', '/apix', '/api/../src/main.ts']) assert.equal(await upgrade(proxied.port, path), 404, path);
});

test('proxy: a path that normalizes to //host/x still goes to the target, not to that host', async () => {
  const app = await start(SIMPLE, undefined, { proxy: { '/': api.origin } });
  for (const path of [`/.//${v2.host}/secret`, `/%2e//${v2.host}/secret`]) {
    assert.deepEqual(JSON.parse((await raw(app.port, path)).body), { method: 'GET', url: `//${v2.host}/secret`, host: api.host, body: '' }, path);
  }
});

test('proxy: a backend that is down is a 502 naming it, printed, and the server keeps serving', async () => {
  const res = await raw(proxied.port, '/down/x');
  assert.equal(res.status, 502);
  assert.ok(res.body.includes(`http://127.0.0.1:${downPort}`), res.body);
  assert.ok(proxied.lines.some((l) => l.startsWith(`jasno dev: proxy /down/ -> http://127.0.0.1:${downPort}: `)), proxied.lines.join('\n'));
  assert.equal(await upgrade(proxied.port, '/down/ws'), 502);
  assert.equal((await raw(proxied.port, '/__jasno/ping')).status, 200);
  assert.equal((await raw(proxied.port, '/api/x')).status, 201);
});

test('proxy: a forged Host is 403 on proxied paths too, for requests and upgrades', async () => {
  const host = `evil.example:${proxied.port}`;
  assert.equal((await raw(proxied.port, '/api/x', { method: 'POST', headers: { host } })).status, 403);
  assert.equal(await upgrade(proxied.port, '/api/ws', host), 403);
});

test('--proxy parsing: <path> needs a leading and a trailing slash, <target> must be a bare http(s) origin', async () => {
  const app = project(SIMPLE);
  cleanups.push(() => app.remove());
  const err: string[] = [];
  const { error } = console;
  console.error = (...a: unknown[]) => { err.push(a.join(' ')); };
  try {
    for (const value of ['api=http://x', '/api=http://x', '/api/', '=http://x', '/=http://x', '/__jasno/=http://x', '/__jasno/x/=http://x', '/api/=', '/api/=ftp://x', '/api/=http://u:p@x', '/api/=http://x/base', '/api/=http://x?q=1', '/api/=nope']) {
      err.length = 0;
      assert.equal(await returns(cli(['dev', '--port', '0', `--proxy=${value}`], app.root)), 1, value);
      assert.deepEqual(err, [`jasno dev: --proxy must be <path>=<target>, such as /api/=http://127.0.0.1:8000 (got "${value}")`], value);
    }
  } finally { console.error = error; }
});

test('reuse: /__jasno/ping reports --proxy; the same proxy reuses the server, a different one is refused', async () => {
  const app = await start(SIMPLE, undefined, { proxy: { '/api/': api.origin, '/control/': v2.origin } });
  assert.deepEqual(JSON.parse((await raw(app.port, '/__jasno/ping')).body).proxy, { '/api/': api.origin, '/control/': v2.origin });
  const log: string[] = [];
  const { log: original } = console;
  console.log = (...a: unknown[]) => { log.push(a.join(' ')); };
  try {
    // through main(): parsing normalizes the target to its origin, and the order of the flags does not matter
    assert.equal(await returns(cli(['dev', '--port', '0', '--proxy', `/control/=${v2.origin}/`, `--proxy=/api/=${api.origin}`], app.root)), 0);
    assert.equal(await returns(cli(['dev', '--port', '0'], app.root)), 1);
  } finally { console.log = original; }
  assert.deepEqual(log, [`jasno dev: already running at ${app.server.url}`, `jasno dev: already running at ${app.server.url} with different --proxy settings; stop it first.`]);
  const r = reporter(app.root);
  assert.equal(await returns(dev(app.root, { port: 0, proxy: { '/api/': api.origin } }, r.reporter)), 1);
});
