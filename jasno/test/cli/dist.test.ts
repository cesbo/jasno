// jasno dist and jasno preview (design.md (e), ADR-29, ADR-35) against temp projects.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { BUDGET, dist, type DistOptions } from '../../cli/dist.ts';
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

test('modules are their source with types blanked (same length, lines, columns) under hashed names in the same directory', async () => {
  const b = await build(FILES);
  assert.equal(b.code, 0, b.lines.join('\n'));
  const map = mapOf(b.read('index.html'));
  const main = map.imports['/src/main.ts']!;
  assert.match(main, /^\/src\/main\.[0-9a-f]{10}\.js$/);
  const out = b.read(main.slice(1));
  const src = FILES['src/main.ts'];
  assert.equal(out.length, src.length);
  assert.deepEqual(out.split('\n').map((l) => l.length), src.split('\n').map((l) => l.length));
  assert.match(out, /const n         = 1; \/\/ kept in place/);
  assert.equal(map.imports['/src/data.json']!.match(/^\/src\/data\.[0-9a-f]{10}\.json$/)?.length, 1);
});

test('allowlist: no tests, no .d.ts, no files reachable only through an unselected "imports" target; assets copied unhashed', async () => {
  const b = await build(FILES);
  const files = listAll(join(b.root, 'dist'));
  assert.ok(!files.some((f) => /test|types|config\.dev|fixtures/.test(f)), files.join('\n'));
  assert.ok(files.some((f) => /^src\/config\.prod\.[0-9a-f]{10}\.js$/.test(f)));
  assert.ok(files.includes('assets/logo.svg'));
  for (const f of ['index.html', '404.html', '_redirects', '_headers', '.jasno/manifest.json']) assert.ok(files.includes(f), f);
  assert.ok(files.some((f) => /^_deps\/dep-esm@1\.2\.3\/prod\.[0-9a-f]{10}\.js$/.test(f)));
  assert.ok(files.some((f) => /^jasno\/src\/index\.[0-9a-f]{10}\.js$/.test(f)));
  assert.ok(!files.some((f) => f.includes('dev-on') || f.includes('dev.js')), 'production conditions only');
});

test('import map: source URLs and bare keys to hashed URLs, package keys in scopes, sha384 integrity for every module', async () => {
  const b = await build(FILES);
  const map = mapOf(b.read('index.html'));
  assert.match(map.imports['jasno']!, /^\/jasno\/src\/index\./);
  assert.match(map.imports['dep-esm']!, /^\/_deps\/dep-esm@1\.2\.3\/prod\./);
  assert.match(map.imports['#config']!, /^\/src\/config\.prod\./);
  assert.match(map.scopes['/_deps/dep-esm@1.2.3/']!['#internal']!, /^\/_deps\/dep-esm@1\.2\.3\/internal\./);
  assert.match(map.scopes['/jasno/']!['#dev']!, /^\/jasno\/src\/dev-off\./);
  const urls = Object.values(map.imports).filter((u) => u.startsWith('/'));
  for (const url of new Set(urls)) {
    const body = b.read(url.slice(1));
    assert.equal(map.integrity[url], 'sha384-' + createHash('sha384').update(body).digest('base64'), url);
  }
});

test('modulepreload covers the entry static closure with integrity; lazy targets are left out and listed in the manifest', async () => {
  const b = await build(FILES);
  const html = b.read('index.html');
  const map = mapOf(html);
  const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)" integrity="([^"]+)">/g)].map((m) => [m[1]!, m[2]!] as const);
  const hrefs = preloads.map(([h]) => h);
  assert.ok(hrefs.includes(map.imports['/src/main.ts']!));
  assert.ok(hrefs.includes(map.imports['jasno']!));
  assert.ok(!hrefs.includes(map.imports['/src/views/lazy.ts']!));
  assert.ok(!hrefs.some((h) => h.endsWith('.json')));
  for (const [h, i] of preloads) assert.equal(i, map.integrity[h]);
  const manifest = JSON.parse(b.read('.jasno/manifest.json')) as { stripper: string; lazy: Record<string, { modules: number; closure: string[] }> };
  const lazy = manifest.lazy[map.imports['/src/views/lazy.ts']!]!;
  assert.equal(lazy.modules, 2);
  assert.match(manifest.stripper, /^amaro@\d/);
  assert.match(html, /<script type="module">import '\/src\/main\.ts';<\/script>/, 'the entry stays inline');
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
  assert.equal(b.read('_redirects'), '/src/* /404.html 404\n/_deps/* /404.html 404\n/jasno/* /404.html 404\n/assets/* /404.html 404\n/* /index.html 200\n');
  assert.equal(b.read('404.html'), html);
});

test('--condition applies to the app\'s "imports" keys', async () => {
  const b = await build(FILES, { conditions: ['development'] });
  const map = mapOf(b.read('index.html'));
  assert.match(map.imports['#config']!, /^\/src\/config\.dev\./);
  assert.match(map.imports['dep-esm']!, /prod\./, 'dependencies keep the production conditions');
  assert.match(map.scopes['/jasno/']!['#dev']!, /dev-off/);
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

test('budgets: MODULE_BUDGET_EXCEEDED (warn, then error) and LAZY_BUDGET_EXCEEDED; DYNAMIC_IMPORT_NOT_LITERAL', async () => {
  const saved = { ...BUDGET };
  Object.assign(BUDGET, { entryWarn: 3, entryError: 100, lazyWarn: 1 });
  try {
    const b = await build({ ...FILES, 'src/dyn.ts': 'export const load = (name: string) => import(`./views/${name}.ts`);\n' });
    assert.equal(b.code, 0);
    assert.ok(b.lines.some((l) => /src\/main\.ts MODULE_BUDGET_EXCEEDED The entry's static closure has \d+ modules/.test(l)), b.lines.join('\n'));
    assert.ok(b.lines.some((l) => l.includes('LAZY_BUDGET_EXCEEDED')));
    assert.ok(b.lines.some((l) => l.startsWith('src/dyn.ts:1:46 DYNAMIC_IMPORT_NOT_LITERAL')), b.lines.join('\n'));
    BUDGET.entryError = 4;
    const c = await build(FILES);
    assert.equal(c.code, 1);
    assert.ok(!existsSync(join(c.root, 'dist')));
  } finally {
    Object.assign(BUDGET, saved);
  }
});

test('--keep N keeps the previous N deploys\' hashed files so open tabs keep loading', async () => {
  const b = await build(FILES);
  const first = mapOf(b.read('index.html')).imports['/src/config.prod.ts']!;
  const r = reporter(b.root);
  writeFileSync(join(b.root, 'src/config.prod.ts'), "export default { api: '/v2' };\n");
  assert.equal(await dist(b.root, { list: false, keep: 1, conditions: [], nonce: false }, r.reporter), 0);
  const second = mapOf(b.read('index.html')).imports['/src/config.prod.ts']!;
  assert.notEqual(first, second);
  assert.ok(existsSync(join(b.root, 'dist', first)), 'kept from the previous deploy');
  writeFileSync(join(b.root, 'src/config.prod.ts'), "export default { api: '/v3' };\n");
  assert.equal(await dist(b.root, { list: false, keep: 1, conditions: [], nonce: false }, r.reporter), 0);
  assert.ok(!existsSync(join(b.root, 'dist', first)), 'two deploys back: removed');
  assert.ok(existsSync(join(b.root, 'dist', second)));
  assert.equal(await dist(b.root, { list: false, keep: 0, conditions: [], nonce: false }, r.reporter), 0);
  assert.ok(!existsSync(join(b.root, 'dist', second)), 'without --keep only this deploy ships');
});

test('--list prints the exact file list and writes nothing', async () => {
  const b = await build(FILES, { list: true });
  assert.equal(b.code, 0);
  assert.ok(!existsSync(join(b.root, 'dist')));
  assert.ok(b.lines.some((l) => /^dist\/src\/main\.[0-9a-f]{10}\.js {2}<- src\/main\.ts$/.test(l)), b.lines.join('\n'));
  assert.ok(b.lines.includes('dist/assets/logo.svg  <- assets/logo.svg'));
});

test('jasno preview serves dist/ as a static host: files, _headers, the _redirects SPA fallback, never dotfiles, loopback Host only', async () => {
  const b = await build(FILES);
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
