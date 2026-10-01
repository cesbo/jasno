// Fixtures for design promises whose CLI check was only partly tested elsewhere.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { check } from '../../cli/check.ts';
import { startDev } from '../../cli/dev.ts';
import { dist } from '../../cli/dist.ts';
import { JASNO, http, INDEX, link, project, reporter } from './fixture.ts';

const apps: { remove(): void }[] = [];
after(() => { for (const a of apps) a.remove(); });

const APP = {
  'package.json': JSON.stringify({ name: 'app', type: 'module' }),
  'index.html': INDEX,
  'src/main.ts': "import { mount } from '@jasno/core';\nexport { mount };\n",
};

async function build(files: Record<string, string | undefined>) {
  const app = project(files);
  apps.push(app);
  const r = reporter(app.root);
  const code = await dist(app.root, { list: false, keep: 0, conditions: [], nonce: false }, r.reporter);
  return { ...app, code, lines: r.lines };
}

test('CL-20: jasno dist reports FILE_NOT_PUBLISHED for a module outside src/, an imported test file, a symlink and a public/ name clash', async () => {
  const outside = await build({ ...APP, 'src/main.ts': "import { x } from '../lib/x.ts';\nexport { x };\n", 'lib/x.ts': 'export const x = 1;\n' });
  assert.equal(outside.code, 1);
  assert.ok(outside.lines.some((l) => l.includes('FILE_NOT_PUBLISHED') && l.includes('outside src/')), outside.lines.join('\n'));
  const testFile = await build({ ...APP, 'src/main.ts': "import { f } from './h.test.ts';\nexport { f };\n", 'src/h.test.ts': 'export const f = 1;\n' });
  assert.ok(testFile.lines.some((l) => l.includes('FILE_NOT_PUBLISHED') && l.includes('a test file')), testFile.lines.join('\n'));
  const linked = project({ ...APP, 'brand/logo.svg': '<svg/>' });
  apps.push(linked);
  mkdirSync(join(linked.root, 'assets'));
  symlinkSync(join(linked.root, 'brand/logo.svg'), join(linked.root, 'assets/logo.svg'));
  const r = reporter(linked.root);
  assert.equal(await dist(linked.root, { list: false, keep: 0, conditions: [], nonce: false }, r.reporter), 1);
  assert.ok(r.lines.some((l) => l.startsWith('assets/logo.svg FILE_NOT_PUBLISHED')), r.lines.join('\n'));
  const clash = await build({ ...APP, 'public/_redirects': '/* /x 200\n' });
  assert.ok(clash.lines.some((l) => l.startsWith('public/_redirects FILE_NOT_PUBLISHED')), clash.lines.join('\n'));
});

test('CL-22, C3: public/ files are published at the root, dotfiles included; .env* in public/ is SECRET_FILE_IN_OUTPUT', async () => {
  const ok = await build({ ...APP, 'public/robots.txt': 'User-agent: *\n', 'public/.well-known/security.txt': 'Contact: mailto:security@example.com\n' });
  assert.equal(ok.code, 0, ok.lines.join('\n'));
  assert.ok(existsSync(join(ok.root, 'dist', '.well-known', 'security.txt')));
  const state = await build({ ...APP, 'public/.jasno/manifest.json': '{}' });
  assert.ok(state.lines.some((l) => l.startsWith('public/.jasno/manifest.json FILE_NOT_PUBLISHED')), state.lines.join('\n'));
  const secret = await build({ ...APP, 'public/.env': 'KEY=1\n' });
  assert.equal(secret.code, 1);
  assert.ok(secret.lines.some((l) => l.startsWith('public/.env SECRET_FILE_IN_OUTPUT')), secret.lines.join('\n'));
});

test('CL-24: a process.env read behind a typeof process guard is not DEP_NOT_BROWSER_ESM', async () => {
  const b = await build({
    ...APP,
    'package.json': JSON.stringify({ name: 'app', type: 'module', dependencies: { guarded: '1.0.0' } }),
    'src/main.ts': "export { mode } from 'guarded';\n",
    'node_modules/guarded/package.json': JSON.stringify({ name: 'guarded', version: '1.0.0', type: 'module', exports: './index.js' }),
    'node_modules/guarded/index.js': "export const mode = typeof process !== 'undefined' && process.env.NODE_ENV === 'production' ? 'prod' : 'dev';\n",
  });
  assert.equal(b.code, 0, b.lines.join('\n'));
});

test('CL-35: jasno dist reports IMPORT_NOT_MAPPED for a bare import that does not resolve', async () => {
  const b = await build({ ...APP, 'src/main.ts': "import pad from 'left-pad';\nexport { pad };\n" });
  assert.equal(b.code, 1);
  assert.ok(b.lines.some((l) => l.startsWith('src/main.ts:1:17 IMPORT_NOT_MAPPED')), b.lines.join('\n'));
});

test('CL-22, CL-35: jasno dev serves public/ at the root, prints IMPORT_NOT_MAPPED, 404s empty segments, hints .mts', async () => {
  const app = project({
    ...APP,
    'src/main.ts': "import pad from 'left-pad';\nexport { pad };\n",
    'src/util.ts': 'export const u = 1;\n',
    'src/old.mts': 'export const o = 1;\n',
    'public/robots.txt': 'User-agent: *\n',
  });
  apps.push(app);
  const r = reporter(app.root);
  const server = await startDev(app.root, { port: 0 }, r.reporter);
  try {
    const base = server.url.replace(/\/$/, '');
    const robots = await http(base + '/robots.txt');
    assert.equal(robots.status, 200);
    assert.equal(robots.body, 'User-agent: *\n');
    await http(base + '/');
    assert.ok(r.lines.some((l) => l.startsWith('src/main.ts:1:17 IMPORT_NOT_MAPPED')), r.lines.join('\n'));
    assert.equal((await http(base + '/src//util.ts')).status, 404);
    assert.equal((await http(base + '/src/util.ts/')).status, 404);
    const mts = await http(base + '/src/old.mts');
    assert.equal(mts.status, 404);
    assert.match(mts.body, /rename it to old\.ts/);
  } finally {
    await server.close();
  }
});

async function checked(files: Record<string, string | undefined>) {
  const app = project(files);
  apps.push(app);
  link(app.root, 'typescript');
  link(app.root, '@types/node');
  const r = reporter(app.root);
  const code = await check(app.root, { strict: false }, r.reporter);
  return { code, lines: r.lines };
}

const OPTIONS = {
  target: 'es2025', module: 'nodenext', moduleResolution: 'nodenext', lib: ['es2025', 'dom'], types: [],
  strict: true, noEmit: true, allowImportingTsExtensions: true, erasableSyntaxOnly: true, verbatimModuleSyntax: true,
  exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, skipLibCheck: true,
};
const DTS = join(JASNO, '..', 'design', 'jasno.d.ts');
const CHECKED = {
  ...APP,
  'tsconfig.json': JSON.stringify({ compilerOptions: OPTIONS, include: [DTS, 'src'], exclude: ['src/**/*.test.ts'] }),
  'tsconfig.test.json': JSON.stringify({ extends: './tsconfig.json', compilerOptions: { types: ['node'] }, include: [DTS, 'src/**/*.test.ts'], exclude: [] }),
};

test('CL-27: jasno check reports MODULE_NOT_FOUND for an entry index.html names that is no file', async () => {
  const r = await checked({ ...CHECKED, 'index.html': INDEX.replace('/src/main.ts', '/src/mian.ts') });
  assert.equal(r.code, 1);
  assert.ok(r.lines.some((l) => /^index\.html:\d+:\d+ MODULE_NOT_FOUND/.test(l)), r.lines.join('\n'));
});

test('C1: tsc errors in a test file come from the test program (Node types) and are reported', async () => {
  const r = await checked({ ...CHECKED, 'src/main.test.ts': "import { test } from 'node:test';\nconst n: string = 1;\ntest('x', () => { void n; });\n" });
  assert.equal(r.code, 1);
  assert.ok(r.lines.some((l) => l.startsWith('src/main.test.ts:2:7 TS2322')), r.lines.join('\n'));
});
