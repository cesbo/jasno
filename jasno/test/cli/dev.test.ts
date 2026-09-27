// jasno dev (design.md (e), ADR-34, ADR-35) against a temp project.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { dev, startDev, type DevServer } from '../../cli/dev.ts';
import { http, INDEX, project, reporter } from './fixture.ts';

const esmDep = {
  'node_modules/dep-esm/package.json': JSON.stringify({
    name: 'dep-esm', version: '1.2.3', type: 'module',
    exports: { '.': { node: './node.js', development: './dev.js', default: './prod.js' }, './sub': './sub.js' },
    imports: { '#internal': './internal.js' },
  }),
  'node_modules/dep-esm/dev.js': "import { x } from '#internal';\nexport const mode = 'dev' + x;\n",
  'node_modules/dep-esm/prod.js': "export const mode = 'prod';\n",
  'node_modules/dep-esm/node.js': "export const mode = 'node';\n",
  'node_modules/dep-esm/sub.js': 'export const sub = 1;\n',
  'node_modules/dep-esm/internal.js': "export const x = '!';\n",
  'node_modules/dep-esm/.secret': 'no',
  'node_modules/dep-cjs/package.json': JSON.stringify({ name: 'dep-cjs', version: '0.1.0', main: 'index.js' }),
  'node_modules/dep-cjs/index.js': "module.exports = { a: require('./a.js') };\n",
};

let app: ReturnType<typeof project>;
let server: DevServer;
let out: string[];
let base: string;

before(async () => {
  app = project({
    'package.json': JSON.stringify({ name: 'app', type: 'module', imports: { '#config': { development: './src/config.dev.ts', default: './src/config.prod.ts' } }, dependencies: { 'dep-esm': '1.2.3' } }),
    'index.html': INDEX,
    '.env': 'SECRET=1',
    'tsconfig.json': '{}',
    'src/main.ts': "import { mount } from 'jasno';\nimport { mode } from 'dep-esm';\nimport { sub } from 'dep-esm/sub';\nimport config from '#config';\nconst n: number = 1;\nexport { mount, mode, sub, config, n };\n",
    'src/config.dev.ts': 'export default { api: "/mock" };\n',
    'src/config.prod.ts': 'export default { api: "/api" };\n',
    'src/data.json': '{"a":1}',
    'src/logo.png': 'png',
    'src/bad.ts': 'const x = ;\n',
    'src/.env': 'SECRET=2',
    'assets/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    ...esmDep,
  });
  const r = reporter(app.root);
  out = r.lines;
  server = await startDev(app.root, { port: 0 }, r.reporter);
  base = server.url.replace(/\/$/, '');
});

after(async () => {
  await server.close();
  app.remove();
});

const get = (path: string, headers: Record<string, string> = {}) => http(base + path, { headers });

test('index.html: one generated import map (development condition, package scopes) and the dev client at the slot', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  assert.match(String(res.headers['content-type']), /^text\/html/);
  const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/.exec(res.body)![1]!) as { imports: Record<string, string>; scopes: Record<string, Record<string, string>> };
  assert.equal(map.imports['jasno'], '/@jasno/src/index.ts');
  assert.equal(map.imports['dep-esm'], '/@dep/dep-esm@1.2.3/dev.js');
  assert.equal(map.imports['dep-esm/sub'], '/@dep/dep-esm@1.2.3/sub.js');
  assert.equal(map.imports['#config'], '/src/config.dev.ts');
  assert.equal(map.scopes['/@dep/dep-esm@1.2.3/']!['#internal'], '/@dep/dep-esm@1.2.3/internal.js');
  assert.equal(map.scopes['/@jasno/']!['#dev'], '/@jasno/src/dev-on.ts');
  assert.match(res.body, /<script type="module" src="\/__jasno\/client.js"><\/script>/);
  assert.ok(!res.body.includes('<!--jasno:head-->'));
});

test('index.html is served with the production CSP; every inline script is allowed by its hash', async () => {
  const res = await get('/');
  const csp = String(res.headers['content-security-policy']);
  assert.match(csp, /require-trusted-types-for 'script'; trusted-types 'none'/);
  assert.match(csp, /object-src 'none'; base-uri 'none'/);
  const inline = [...res.body.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  assert.equal(inline.length, 2); // the import map and the entry
  for (const s of inline) assert.ok(csp.includes(`'sha256-${createHash('sha256').update(s).digest('base64')}'`), s.slice(0, 40));
});

test('.ts is stripped with positions kept and served as JavaScript, no-store', async () => {
  const res = await get('/src/main.ts');
  assert.equal(res.status, 200);
  assert.match(String(res.headers['content-type']), /^text\/javascript/);
  assert.equal(res.headers['cache-control'], 'no-store');
  const src = readFileSync(join(app.root, 'src/main.ts'), 'utf8');
  assert.equal(res.body.length, src.length);
  assert.match(res.body, /const n         = 1;/);
});

test('Host must be a loopback name (DNS rebinding): forged Host gets 403', async () => {
  assert.equal((await get('/', { host: 'evil.example' })).status, 403);
  assert.equal((await get('/', { host: 'evil.example:80' })).status, 403);
  assert.equal((await get('/', { host: `localhost:${server.port}` })).status, 200);
  assert.equal((await get('/', { host: `[::1]:${server.port}` })).status, 200);
  assert.equal((await get('/', { host: `app.localhost:${server.port}` })).status, 200);
});

test('Host: IP literals always pass (rebinding needs a name); --host adds the machine name, other names stay 403', async () => {
  assert.equal((await get('/', { host: `192.168.1.20:${server.port}` })).status, 200);
  assert.equal((await get('/', { host: `[fe80::1]:${server.port}` })).status, 200);
  assert.equal((await get('/', { host: `${hostname()}:${server.port}` })).status, hostname() === 'localhost' ? 200 : 403);
  const other = project({ 'package.json': '{"type":"module"}', 'index.html': INDEX, 'src/main.ts': 'export {};\n' });
  const lan = await startDev(other.root, { port: 0, host: '127.0.0.1' }, reporter(other.root).reporter);
  try {
    assert.equal((await http(lan.url, { headers: { host: `192.168.1.20:${lan.port}` } })).status, 200);
    assert.equal((await http(lan.url, { headers: { host: `${hostname()}:${lan.port}` } })).status, 200);
    assert.equal((await http(lan.url, { headers: { host: `${hostname()}.local:${lan.port}` } })).status, 200);
    assert.equal((await http(lan.url, { headers: { host: `evil.example:${lan.port}` } })).status, 403, 'a rebound domain is refused with --host too');
  } finally {
    await lan.close();
    other.remove();
  }
});

test('allowlist: dotfiles, package.json, tsconfig and node_modules are never served', async () => {
  for (const path of ['/.env', '/src/.env', '/package.json', '/tsconfig.json', '/node_modules/dep-esm/dev.js', '/%2eenv', '/src/%2e%2e/package.json', '/@dep/dep-esm@1.2.3/.secret', '/@dep/dep-esm@1.2.3/package.json/../.secret']) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.ok(!res.body.includes('SECRET'), path);
  }
});

test('dependency and jasno files are served under /@dep/<name>@<version>/ and /@jasno/', async () => {
  assert.equal((await get('/@dep/dep-esm@1.2.3/dev.js')).status, 200);
  assert.equal((await get('/@jasno/src/core.ts')).status, 200);
  assert.equal((await get('/@jasno/node_modules/amaro/package.json')).status, 404);
  const miss = await get('/@jasno/dev.js');
  assert.equal(miss.status, 404);
  assert.match(miss.body, /\/@jasno\/src\//);
});

test('/src: x.js for x.ts answers with the TS_EXTENSION hint; a non-module file with ASSET_OUTSIDE_ASSETS; JSON modules are served', async () => {
  const js = await get('/src/main.js');
  assert.equal(js.status, 404);
  assert.match(js.body, /TS_EXTENSION/);
  const png = await get('/src/logo.png');
  assert.equal(png.status, 404);
  assert.match(png.body, /ASSET_OUTSIDE_ASSETS/);
  assert.ok(out.some((l) => l.includes('src/logo.png ASSET_OUTSIDE_ASSETS')));
  const json = await get('/src/data.json');
  assert.equal(json.status, 200);
  assert.match(String(json.headers['content-type']), /^application\/json/);
});

test('assets/ is served; a case variant of a file name is 404 (static hosts are case-sensitive)', async () => {
  const svg = await get('/assets/logo.svg');
  assert.equal(svg.status, 200);
  assert.equal(svg.headers['content-type'], 'image/svg+xml');
  assert.equal((await get('/assets/Logo.svg')).status, 404);
  assert.equal((await get('/src/Main.ts')).status, 404);
});

test('SPA fallback: HTML navigations to extension-less paths get index.html; never under /src, /@dep, /@jasno', async () => {
  const html = { accept: 'text/html,application/xhtml+xml' };
  assert.match((await get('/users/1', html)).body, /importmap/);
  assert.equal((await get('/users/1')).status, 404);
  assert.equal((await get('/users/1.png', html)).status, 404);
  assert.equal((await get('/src/nope', html)).status, 404);
  assert.equal((await get('/@dep/nope', html)).status, 404);
  assert.equal((await get('/@jasno/nope', html)).status, 404);
  assert.equal((await http(base + '/users/1', { method: 'POST', headers: html })).status, 405);
});

test('a strip failure is served as a module that throws SyntaxError with file:line:col, and printed', async () => {
  const res = await get('/src/bad.ts');
  assert.equal(res.status, 200);
  assert.match(res.body, /^throw new SyntaxError\(".*\[SYNTAX_REJECTED\] \/src\/bad\.ts:1:11/);
  assert.ok(out.some((l) => l.startsWith('src/bad.ts:1:11 SYNTAX_REJECTED')));
});

test('/__jasno/log: same-origin only, 64 KB cap, control characters stripped before printing', async () => {
  const origin = base;
  const body = JSON.stringify({ kind: 'error', text: 'boom\u001b[2J\u0007 at x', page: '/p' });
  const ok = await http(base + '/__jasno/log', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body });
  assert.equal(ok.status, 204);
  assert.ok(out.includes('browser error (/p): boom[2J at x'), out.join('\n'));
  assert.equal((await http(base + '/__jasno/log', { method: 'POST', headers: { origin: 'http://evil.example' }, body })).status, 403);
  assert.equal((await http(base + '/__jasno/log', { method: 'POST', body })).status, 403);
  assert.equal((await http(base + '/__jasno/log', { method: 'POST', headers: { origin, 'sec-fetch-site': 'cross-site' }, body })).status, 403);
  const big = JSON.stringify({ kind: 'error', text: 'x'.repeat(70_000) });
  assert.equal((await http(base + '/__jasno/log', { method: 'POST', headers: { origin }, body: big })).status, 413);
  assert.equal((await get('/__jasno/log')).status, 405);
});

test('dependency closures with CommonJS fail with DEP_NOT_BROWSER_ESM', async () => {
  writeFileSync(join(app.root, 'src/uses-cjs.ts'), "import x from 'dep-cjs';\nexport default x;\n");
  await get('/');
  assert.ok(out.some((l) => l.includes('DEP_NOT_BROWSER_ESM') && l.includes('dep-cjs')), out.join('\n'));
});

test('a handwritten import map: dev injects nothing and serves an error page naming IMPORT_MAP_HANDWRITTEN', async () => {
  const index = join(app.root, 'index.html');
  writeFileSync(index, INDEX.replace('<!--jasno:head-->', '<script type="importmap">{"imports":{}}</script>'));
  try {
    const res = await get('/');
    assert.equal(res.status, 500);
    assert.match(res.body, /IMPORT_MAP_HANDWRITTEN/);
    assert.ok(out.some((l) => l.startsWith('index.html:6:3 IMPORT_MAP_HANDWRITTEN')), out.join('\n'));
  } finally {
    writeFileSync(index, INDEX);
  }
});

test('live reload: a change under src/ sends a reload event', async () => {
  const events = await fetch(base + '/__jasno/events');
  const reader = events.body!.getReader();
  await reader.read(); // the greeting comment
  writeFileSync(join(app.root, 'src/config.dev.ts'), 'export default { api: "/mock2" };\n');
  const chunk = await Promise.race([reader.read(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no reload')), 3000))]);
  assert.match(new TextDecoder().decode(chunk.value), /event: reload/);
  await reader.cancel();
});

test('.jasno/dev.json records the server; a second jasno dev for the same root reuses it (/__jasno/ping)', async () => {
  const rec = JSON.parse(readFileSync(join(app.root, '.jasno/dev.json'), 'utf8')) as { pid: number; port: number; url: string };
  assert.deepEqual(rec, { pid: process.pid, port: server.port, url: server.url });
  const ping = JSON.parse((await get('/__jasno/ping')).body) as { root: string };
  assert.equal(ping.root, app.root);
  const r = reporter(app.root);
  assert.equal(await dev(app.root, { port: 0 }, r.reporter), 0);
  assert.deepEqual(r.lines, [`jasno dev: already running at ${server.url}`]);
  assert.ok(existsSync(join(app.root, '.jasno/dev.json')));
});
