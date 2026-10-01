// jasno dist and jasno preview (design.md (e), ADR-29, ADR-35) against temp projects.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { dist, type DistOptions } from '../../cli/dist.ts';
import { startPreview } from '../../cli/preview.ts';
import { http, INDEX, project, reporter } from './fixture.ts';

const FILES = {
  'package.json': JSON.stringify({ name: 'app', type: 'module', imports: { '#config': { development: './src/config.dev.ts', default: './src/config.prod.ts' } } }),
  'index.html': INDEX,
  'src/main.ts': "import { mount } from 'jasno';\nimport { mode } from 'dep-esm';\nimport config from '#config';\nimport data from './data.json' with { type: 'json' };\nconst view = () => import('./views/lazy.ts');\nconst n: number = 1; // kept in place\nexport { mount, mode, config, data, view, n };\n",
  'src/config.dev.ts': "import { fixtures } from './fixtures.ts';\nexport default { api: '/mock', fixtures };\n",
  'src/fixtures.ts': 'export const fixtures = [1, 2];\n',
  'src/config.prod.ts': "export default { api: '/api' };\n",
  'src/data.json': '{"a":1}',
  'src/views/lazy.ts': "import { helper } from './helper.ts';\nexport default helper;\n",
  'src/views/helper.ts': 'export const helper = (x: string): string => x;\n',
  'src/main.test.ts': "import { test } from 'node:test';\ntest('x', () => {});\n",
  'src/types.d.ts': 'declare const x: number;\n',
  'assets/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  'node_modules/dep-esm/package.json': JSON.stringify({ name: 'dep-esm', version: '1.2.3', exports: { '.': { development: './dev.js', default: './prod.js' } }, imports: { '#internal': './internal.js' } }),
  'node_modules/dep-esm/prod.js': "import { x } from '#internal';\nexport const mode = 'prod' + x;\n",
  'node_modules/dep-esm/dev.js': "export const mode = 'dev';\n",
  'node_modules/dep-esm/internal.js': "export const x = '!';\n",
};

const apps: { remove(): void }[] = [];
after(() => { for (const a of apps) a.remove(); });

async function build(files: Record<string, string>, opts: Partial<DistOptions> = {}) {
  const app = project(files);
  apps.push(app);
  const r = reporter(app.root);
  const code = await dist(app.root, { list: false, keep: 0, conditions: [], nonce: false, ...opts }, r.reporter);
  return { ...app, code, lines: r.lines, read: (p: string) => readFileSync(join(app.root, 'dist', p), 'utf8') };
}

const mapOf = (html: string) => JSON.parse(/<script type="importmap">(.*?)<\/script>/.exec(html)![1]!) as {
  imports: Record<string, string>; scopes: Record<string, Record<string, string>>; integrity: Record<string, string>;
};
const listAll = (dir: string, prefix = ''): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? listAll(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]);

test('allowlist: no tests, no .d.ts, nothing reachable only through an unselected "imports" target, production conditions; assets copied unhashed', async () => {
  const b = await build(FILES);
  const files = listAll(join(b.root, 'dist'));
  const code = files.filter((f) => f.endsWith('.js')).map((f) => b.read(f)).join('\n');
  assert.ok(/["']\/api["']/.test(code) && !/["']\/mock["']/.test(code) && !code.includes('fixtures'), 'config.prod.ts only');
  assert.ok(!/mode\s*=\s*["']dev["']/.test(code), 'dependencies resolve with the production conditions (dep-esm/dev.js is out)');
  assert.ok(files.includes('assets/logo.svg'));
  for (const f of ['index.html', '404.html', '_redirects', '_headers', '.jasno/manifest.json']) assert.ok(files.includes(f), f);
  assert.ok(files.every((f) => !/test|types|_deps|^jasno\//.test(f)), files.join('\n'));
});

test('CSP: a meta tag whose hashes cover both inline scripts; _headers repeats it and sets cache rules; SPA fallback files', async () => {
  const b = await build(FILES);
  const html = b.read('index.html');
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)![1]!;
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  assert.equal(inline.length, 2);
  for (const s of inline) assert.ok(csp.includes(`'sha256-${createHash('sha256').update(s).digest('base64')}'`));
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('importmap'), 'the policy comes before the scripts');
  const headers = b.read('_headers');
  assert.ok(headers.includes(`Content-Security-Policy: ${csp}`));
  assert.match(headers, /\/src\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers, /\/assets\/\*\n {2}Cache-Control: no-cache/);
  assert.equal(b.read('_redirects'), '/src/* /404.html 404\n/assets/* /404.html 404\n/* /index.html 200\n');
  assert.equal(b.read('404.html'), html);
});

test('SECRET_FILE_IN_OUTPUT: a dotfile, .env, *.pem or *.key in src/ or assets/ fails the build and nothing is written', async () => {
  for (const name of ['src/.env', 'assets/.env.local', 'assets/cert.pem', 'src/deploy.key', 'src/.cache/x.ts']) {
    const b = await build({ ...FILES, [name]: 'SECRET' });
    assert.equal(b.code, 1, name);
    assert.ok(b.lines.some((l) => l.includes('SECRET_FILE_IN_OUTPUT')), name);
    assert.ok(!existsSync(join(b.root, 'dist')), name);
  }
});

test('DEP_NOT_BROWSER_ESM: CommonJS or process.env in a dependency closure fails the build', async () => {
  const b = await build({
    ...FILES,
    'src/extra.ts': "import cjs from 'dep-cjs';\nimport env from 'dep-env';\nexport { cjs, env };\n",
    'node_modules/dep-cjs/package.json': JSON.stringify({ name: 'dep-cjs', version: '1.0.0' }),
    'node_modules/dep-cjs/index.js': "module.exports = require('./a.js');\n",
    'node_modules/dep-env/package.json': JSON.stringify({ name: 'dep-env', version: '1.0.0', type: 'module', exports: './index.js' }),
    'node_modules/dep-env/index.js': 'export default process.env.NODE_ENV;\n',
  });
  assert.equal(b.code, 1);
  assert.equal(b.lines.filter((l) => l.includes('DEP_NOT_BROWSER_ESM')).length, 2, b.lines.join('\n'));
});

test('--list prints the exact file list and writes nothing', async () => {
  const b = await build(FILES, { list: true });
  assert.equal(b.code, 0);
  assert.ok(!existsSync(join(b.root, 'dist')));
  assert.ok(b.lines.some((l) => /^dist\/src\/main\.[0-9A-Z]{8}\.js {2}<- src\/main\.ts$/.test(l)), b.lines.join('\n'));
  assert.ok(b.lines.includes('dist/assets/logo.svg  <- assets/logo.svg'));
});

test('jasno preview serves dist/ as a static host: files, _headers, the _redirects SPA fallback, never .jasno/, loopback Host only', async () => {
  const b = await build({ ...FILES, 'public/.well-known/security.txt': 'Contact: mailto:security@example.com\n' });
  const server = await startPreview(b.root, { port: 0 }, reporter(b.root).reporter);
  try {
    const base = server.url.replace(/\/$/, '');
    const deep = await http(base + '/users/1');
    assert.equal(deep.status, 200);
    assert.match(deep.body, /importmap/);
    assert.match(String(deep.headers['content-security-policy']), /trusted-types 'none'/);
    const main = mapOf(deep.body).imports['/src/main.ts']!;
    const js = await http(base + main);
    assert.equal(js.status, 200);
    assert.match(String(js.headers['content-type']), /^text\/javascript/);
    assert.equal(js.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal((await http(base + '/')).headers['cache-control'], 'no-cache');
    const manifest = await http(base + '/.jasno/manifest.json');
    assert.ok(!manifest.body.includes('stripper'));
    assert.match((await http(base + '/.well-known/security.txt')).body, /^Contact: /);
    assert.equal((await http(base + '/', { headers: { host: 'evil.example' } })).status, 403);
  } finally {
    await server.close();
  }
});

test('CSP_HASH_STRICT_DYNAMIC: a handwritten CSP <meta> with strict-dynamic fails; without it, a warning', async () => {
  const meta = (policy: string) => INDEX.replace('<!--jasno:head-->', `<meta http-equiv="Content-Security-Policy" content="${policy}">\n  <!--jasno:head-->`);
  const strict = await build({ ...FILES, 'index.html': meta("script-src 'strict-dynamic' 'sha256-x'") });
  assert.equal(strict.code, 1);
  assert.ok(strict.lines.some((l) => /^index\.html:\d+:\d+ CSP_HASH_STRICT_DYNAMIC/.test(l)), strict.lines.join('\n'));
  const plain = await build({ ...FILES, 'index.html': meta("script-src 'self'") });
  assert.equal(plain.code, 0, plain.lines.join('\n'));
  assert.ok(plain.lines.some((l) => l.includes('CSP_HASH_STRICT_DYNAMIC') && l.includes('stricter of the two')), plain.lines.join('\n'));
});

// ---------------------------------------------------------------- chunks, the import map, resolution, --keep
// The lazy view shares dep-esm with the entry, so a shared chunk exists.
const BFILES = { ...FILES, 'src/views/lazy.ts': "import { helper } from './helper.ts';\nimport { mode } from 'dep-esm';\nexport default (x: string): string => helper(x) + mode;\n" };
const jsFiles = (root: string) => listAll(join(root, 'dist')).filter((f) => f.endsWith('.js'));

test('the entry and the app\'s lazy view are hashed chunks under src/, shared code is src/chunk.<hash>.js, each with a linked source map', async () => {
  const b = await build(BFILES);
  assert.equal(b.code, 0, b.lines.join('\n'));
  const js = jsFiles(b.root);
  assert.ok(js.some((f) => /^src\/main\.[0-9A-Z]{8}\.js$/.test(f)), js.join('\n'));
  assert.ok(js.some((f) => /^src\/views\/lazy\.[0-9A-Z]{8}\.js$/.test(f)), js.join('\n'));
  assert.ok(js.every((f) => /^src\/(main|views\/lazy|chunk)\.[0-9A-Z]{8}\.js$/.test(f)), `no per-file outputs, no _deps/ or jasno/:\n${js.join('\n')}`);
  const all = listAll(join(b.root, 'dist'));
  for (const f of js) {
    assert.ok(all.includes(`${f}.map`), `${f}.map`);
    assert.match(b.read(f), new RegExp(`sourceMappingURL=${f.split('/').pop()!.replace(/\./g, '\\.')}\\.map\\n?$`));
  }
  assert.ok(b.lines.some((l) => /^jasno dist: \d+ files in dist\/ \(\d+ modules in \d+ chunks\)\.$/.test(l)), b.lines.join('\n'));
});

test('the import map maps the entry URL and pins every chunk with sha384; modulepreload is the entry\'s static chunk closure with integrity; the CSP hashes both inline scripts', async () => {
  const b = await build(BFILES);
  const html = b.read('index.html');
  const map = mapOf(html);
  const js = jsFiles(b.root);
  assert.deepEqual(Object.keys(map.imports), ['/src/main.ts']);
  const entry = map.imports['/src/main.ts']!;
  assert.match(entry, /^\/src\/main\.[0-9A-Z]{8}\.js$/);
  assert.deepEqual(Object.keys(map.integrity).sort(), js.map((f) => '/' + f).sort());
  for (const [url, sri] of Object.entries(map.integrity)) {
    assert.equal(sri, 'sha384-' + createHash('sha384').update(readFileSync(join(b.root, 'dist', url))).digest('base64'), url);
  }
  const preloads = new Map([...html.matchAll(/<link rel="modulepreload" href="([^"]+)" integrity="([^"]+)">/g)].map((m) => [m[1]!, m[2]!]));
  const statics = [...b.read(entry.slice(1)).matchAll(/from\s*"\.\/(chunk\.[0-9A-Z]{8}\.js)"/g)].map((m) => `/src/${m[1]}`);
  assert.ok(statics.length > 0);
  for (const url of [entry, ...statics]) assert.equal(preloads.get(url), map.integrity[url], url);
  assert.ok(![...preloads.keys()].some((u) => u.includes('/views/lazy.')), 'the lazy view is fetched on demand');
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)![1]!;
  for (const m of html.matchAll(/<script type="(?:importmap|module)">([\s\S]*?)<\/script>/g)) {
    assert.ok(csp.includes(`'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`), m[1]);
  }
  assert.match(html, /<script type="module">import '\/src\/main\.ts';<\/script>/, 'the entry script stays as written');
});

test('imports resolve as jasno check and dev resolve them (package conditions, a package #import, the app\'s #config, JSON), and the lazy chunk loads', async () => {
  const run = async (b: Awaited<ReturnType<typeof build>>) => {
    const mod = await import(join(b.root, 'dist', mapOf(b.read('index.html')).imports['/src/main.ts']!));
    return { mode: mod.mode, api: mod.config.api, fixtures: mod.config.fixtures, data: mod.data, lazy: (await mod.view()).default('ok'), n: mod.n };
  };
  assert.deepEqual(await run(await build(BFILES)), { mode: 'prod!', api: '/api', fixtures: undefined, data: { a: 1 }, lazy: 'okprod!', n: 1 });
  const dev = await run(await build(BFILES, { conditions: ['development'] }));
  assert.deepEqual([dev.api, dev.fixtures, dev.mode], ['/mock', [1, 2], 'prod!'], '--condition reaches the app\'s imports only');
});

test('DYNAMIC_IMPORT_NOT_LITERAL: import(variable) fails the build at the call, since its target cannot be in the bundle; nothing written', async () => {
  const b = await build({ ...BFILES, 'src/dyn.ts': 'export const load = (name: string) => import(`./views/${name}.ts`);\n' });
  assert.equal(b.code, 1);
  assert.ok(b.lines.some((l) => l.startsWith('src/dyn.ts:1:46 DYNAMIC_IMPORT_NOT_LITERAL')), b.lines.join('\n'));
  assert.ok(!existsSync(join(b.root, 'dist')));
});

test('--keep 1 keeps the previous deploy\'s chunks; --list prints exactly what a build writes; the manifest names the bundler', async () => {
  const b = await build(BFILES);
  const first = mapOf(b.read('index.html')).imports['/src/main.ts']!;
  writeFileSync(join(b.root, 'src/config.prod.ts'), "export default { api: '/v2' };\n");
  const r = reporter(b.root);
  assert.equal(await dist(b.root, { list: true, keep: 1, conditions: [], nonce: false }, r.reporter), 0);
  const listed = r.lines.filter((l) => l.startsWith('dist/')).map((l) => l.split('  ')[0]!.slice('dist/'.length)).sort();
  assert.ok(r.lines.some((l) => /^dist\/src\/main\.[0-9A-Z]{8}\.js {2}<- src\/main\.ts$/.test(l)), r.lines.join('\n'));
  assert.ok(r.lines.some((l) => /^dist\/src\/chunk\.[0-9A-Z]{8}\.js {2}<- \(shared chunk\)$/.test(l)), r.lines.join('\n'));
  assert.equal(await dist(b.root, { list: false, keep: 1, conditions: [], nonce: false }, reporter(b.root).reporter), 0);
  assert.deepEqual(listAll(join(b.root, 'dist')).sort(), listed);
  const second = mapOf(b.read('index.html')).imports['/src/main.ts']!;
  assert.notEqual(first, second);
  assert.ok(existsSync(join(b.root, 'dist', first)), 'kept from the previous deploy');
  assert.match(JSON.parse(b.read('.jasno/manifest.json')).bundler, /^esbuild@\d+\.\d+\.\d+$/);
});
