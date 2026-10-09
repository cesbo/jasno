// Conformance: cli/resolve.ts (shared by jasno dev and jasno dist) against Node's own ESM resolver for the same
// condition sets (ADR-35, design.md (e) dev and dist 3). Node's answer comes from import.meta.resolve in a child
// process run from a probe file in the parent directory; a URL whose file does not exist counts as an error, since
// Node fails to load it. Fixture packages avoid the conditions Node always adds (node, module-sync, node-addons).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, test } from 'node:test';
import { clearPackageCache, DEV_CONDITIONS, prodConditions, resolveSpecifier } from '../../../cli/resolve.ts';
import { project } from '../fixture.ts';

const PROBE = `import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = {};
for (const s of JSON.parse(process.argv[2])) {
  try { const f = fileURLToPath(import.meta.resolve(s)); out[s] = statSync(f).isFile() ? f : 'error'; } catch { out[s] = 'error'; }
}
process.stdout.write(JSON.stringify(out));
`;

const SETS = [
  { name: 'dev', ours: DEV_CONDITIONS, node: ['browser', 'development'] },
  { name: 'dist', ours: prodConditions(), node: ['browser'] },
] as const;

const json = (v: unknown): string => JSON.stringify(v);

const app = project({
  'package.json': json({
    name: 'app', type: 'module',
    exports: { '.': './src/app.js', './util': './src/util.js' },
    imports: {
      '#a': './src/a.js',
      '#p/*': './src/p/*.js',
      '#c': { development: './src/dev.js', default: './src/prod.js' },
      '#dep': 'str',
      '#dep/*': 'sub/*',
      '#bad': '../outside.js',
      '#abs': '/etc/hostname',
      '#arrmissing': ['not-installed', './src/a.js'],
      '#/x': './src/a.js',
    },
  }),
  'probe.mjs': PROBE,
  ...Object.fromEntries(['app', 'util', 'a', 'p/x', 'dev', 'prod'].map((f) => [`src/${f}.js`, ''])),

  'node_modules/str/package.json': json({ name: 'str', exports: './main.js' }),
  'node_modules/str/main.js': '',
  'node_modules/str/other.js': '',

  'node_modules/cond/package.json': json({ name: 'cond', exports: { browser: { development: './b-dev.js', default: './b.js' }, import: './i.js', default: './d.js' } }),
  ...Object.fromEntries(['b-dev', 'b', 'i', 'd'].map((f) => [`node_modules/cond/${f}.js`, ''])),
  'node_modules/cond2/package.json': json({
    name: 'cond2',
    exports: {
      '.': { import: './i.js', browser: './b.js' },
      './o': { development: './dev.js', browser: './b.js', default: './d.js' },
      './w': { browser: { worker: './w.js' }, default: './d.js' },
    },
  }),
  ...Object.fromEntries(['i', 'b', 'dev', 'd', 'w'].map((f) => [`node_modules/cond2/${f}.js`, ''])),

  'node_modules/sub/package.json': json({
    name: 'sub',
    exports: {
      '.': './index.js',
      './feature': { development: './f-dev.js', default: './f.js' },
      './features/*.js': './src/features/*.js',
      './features/internal/*': null,
      './*': './lib/*.js',
      './lib/*': './lib/*',
      './mid/*/index.js': './m/*/i.js',
      './t/*': './t/star/*',
      './t/*.js': './t/js/*.js',
    },
  }),
  ...Object.fromEntries(['index.js', 'f.js', 'f-dev.js', 'src/features/a.js', 'src/features/internal/x.js', 'lib/x.js', 'm/q/i.js', 't/star/a.js', 't/star/a', 't/js/a.js']
    .map((f) => [`node_modules/sub/${f}`, ''])),

  'node_modules/excl/package.json': json({
    name: 'excl',
    exports: { '.': './index.js', './server': { browser: null, default: './server.js' }, './x': null, './lib/*': './lib/*', './lib/private/*': null },
  }),
  ...Object.fromEntries(['index.js', 'server.js', 'x.js', 'lib/a.js', 'lib/private/p.js'].map((f) => [`node_modules/excl/${f}`, ''])),

  'node_modules/arr/package.json': json({
    name: 'arr',
    exports: {
      '.': ['./missing.js', './ok.js'],
      './inv': ['../out.js', './ok.js'],
      './url': ['https://example.com/x.js', './ok.js'],
      './nested': [{ worker: './w.js' }, './ok.js'],
      './nullfirst': [null, './ok.js'],
      './cmissing': [{ browser: './missing.js' }, './ok.js'],
      './num': [42, './ok.js'],
      './empty': [],
      './allbad': ['../a.js', 'b.js'],
    },
  }),
  'node_modules/arr/ok.js': '',

  'node_modules/nulle/package.json': json({ name: 'nulle', exports: null, main: './m.js' }),
  'node_modules/nulle/m.js': '',
  'node_modules/nulle/other.js': '',
  'node_modules/selfnull/package.json': json({ name: 'selfnull', exports: null, main: './m.js' }),
  'node_modules/selfnull/m.js': '',
  'node_modules/selfnull/probe.mjs': PROBE,

  'node_modules/nomain/package.json': json({ name: 'nomain' }),
  'node_modules/nomain/index.js': '',
  'node_modules/nomain/lib/a.js': '',
  'node_modules/withmain/package.json': json({ name: 'withmain', main: './lib/entry.js' }),
  'node_modules/withmain/lib/entry.js': '',
  'node_modules/withmain/index.js': '',
  'node_modules/dirmain/package.json': json({ name: 'dirmain', main: 'lib' }),
  'node_modules/dirmain/lib/index.js': '',
  'node_modules/extless/package.json': json({ name: 'extless', main: './entry' }),
  'node_modules/extless/entry.js': '',
  'node_modules/modfield/package.json': json({ name: 'modfield', main: './dist/x.cjs.js', module: './dist/x.esm.js' }),
  'node_modules/modfield/dist/x.cjs.js': '',
  'node_modules/modfield/dist/x.esm.js': '',
  'node_modules/modgone/package.json': json({ name: 'modgone', main: './x.cjs.js', module: './x.esm.js' }),
  'node_modules/modgone/x.cjs.js': '',
  'node_modules/emptymain/package.json': json({ name: 'emptymain', main: '' }),
  'node_modules/emptymain/index.js': '',

  'node_modules/pj/package.json': json({ name: 'pj', exports: { '.': './i.js' } }),
  'node_modules/pj/i.js': '',
  'node_modules/@scope/pkg/package.json': json({ name: '@scope/pkg', exports: { '.': './s.js', './x': './x.js' } }),
  'node_modules/@scope/pkg/s.js': '',
  'node_modules/@scope/pkg/x.js': '',

  'node_modules/mixed/package.json': json({ name: 'mixed', exports: { '.': './a.js', default: './b.js' } }),
  'node_modules/idxkey/package.json': json({ name: 'idxkey', exports: { 0: './a.js', default: './b.js' } }),
  ...Object.fromEntries(['mixed', 'idxkey'].flatMap((p) => [[`node_modules/${p}/a.js`, ''], [`node_modules/${p}/b.js`, '']])),

  'node_modules/dots/package.json': json({
    name: 'dots',
    exports: { './up': './a/../b.js', './nm': './node_modules/x/i.js', './dbl': './a//b.js', './dot': './a/./b.js', './*': './dist/*' },
  }),
  ...Object.fromEntries(['b.js', 'a/b.js', 'node_modules/x/i.js', 'dist/a.js', 'secret.js'].map((f) => [`node_modules/dots/${f}`, ''])),

  'node_modules/pct/package.json': json({ name: 'pct', exports: { './*': './lib/*', './bs': './lib\\b.js' } }),
  ...Object.fromEntries(['lib/a%2Fb.js', 'lib/a b.js', 'lib/a/b.js', 'lib/b.js'].map((f) => [`node_modules/pct/${f}`, ''])),

  'node_modules/badjson/package.json': '{ "name": "badjson", ',
  'node_modules/badjson/index.js': '',
  'node_modules/badjson/probe.mjs': PROBE,

  'node_modules/outer/package.json': json({ name: 'outer', exports: './index.js' }),
  'node_modules/outer/index.js': '',
  'node_modules/outer/probe.mjs': PROBE,
  'node_modules/outer/node_modules/v/package.json': json({ name: 'v', version: '2.0.0', exports: './v2.js' }),
  'node_modules/outer/node_modules/v/v2.js': '',
  'node_modules/v/package.json': json({ name: 'v', version: '1.0.0', exports: './v1.js' }),
  'node_modules/v/v1.js': '',
  'node_modules/outer/node_modules/dup/package.json': '{ nope',
  'node_modules/outer/node_modules/dup/index.js': '',
  'node_modules/dup/package.json': json({ name: 'dup', exports: './root.js' }),
  'node_modules/dup/root.js': '',
  'node_modules/outer/node_modules/bare/index.js': '',
  'node_modules/bare/package.json': json({ name: 'bare', exports: './root.js' }),
  'node_modules/bare/root.js': '',

  'node_modules/selfpkg/package.json': json({ name: 'selfpkg', exports: { '.': './i.js', './x': './x.js' } }),
  'node_modules/selfpkg/i.js': '',
  'node_modules/selfpkg/x.js': '',
  'node_modules/selfpkg/probe.mjs': PROBE,

  'node_modules/withimports/package.json': json({ name: 'withimports', imports: { '#int': { development: './int-dev.js', default: './int.js' }, '#ext': 'str', '#p/*': './p/*.js' } }),
  ...Object.fromEntries(['int.js', 'int-dev.js', 'p/a.js'].map((f) => [`node_modules/withimports/${f}`, ''])),
  'node_modules/withimports/probe.mjs': PROBE,
});

// A package linked from outside the project (npm link, workspaces): resolution returns real paths.
const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'jasno-linked-')));
const put = (file: string, text = ''): void => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
put(join(elsewhere, 'linked/package.json'), json({ name: 'linked', exports: { '.': './i.js', './f': './f.js' } }));
put(join(elsewhere, 'linked/i.js'));
put(join(elsewhere, 'linked/real-f.js'));
symlinkSync('./real-f.js', join(elsewhere, 'linked/f.js'));
put(join(elsewhere, 'linked/node_modules/lv/package.json'), json({ name: 'lv', exports: './lv.js' }));
put(join(elsewhere, 'linked/node_modules/lv/lv.js'));
put(join(elsewhere, 'linked/probe.mjs'), PROBE);
symlinkSync(join(elsewhere, 'linked'), join(app.root, 'node_modules/linked'));

after(() => { app.remove(); rmSync(elsewhere, { recursive: true, force: true }); });

const show = (f: string): string =>
  f === 'error' ? f : f.startsWith(elsewhere) ? `<linked>/${relative(elsewhere, f)}` : relative(app.root, f);

/** ours and Node's answers for specs from parent (relative to the project root), under both condition sets. */
function compare(parent: string, specs: readonly string[]): { ours: Record<string, string>; node: Record<string, string> } {
  const from = parent.startsWith('/') ? parent : join(app.root, parent);
  const ours: Record<string, string> = {};
  const node: Record<string, string> = {};
  for (const set of SETS) {
    const r = spawnSync(process.execPath, [...set.node.map((c) => `--conditions=${c}`), from, JSON.stringify(specs)], { encoding: 'utf8' });
    const answers = JSON.parse(r.stdout) as Record<string, string>;
    clearPackageCache();
    for (const s of specs) {
      let o: string;
      try { o = resolveSpecifier(s, from, set.ours); } catch { o = 'error'; }
      ours[`${set.name} ${s}`] = show(o);
      node[`${set.name} ${s}`] = show(answers[s] ?? 'missing');
    }
  }
  return { ours, node };
}

const same = (parent: string, specs: readonly string[]): void => {
  const { ours, node } = compare(parent, specs);
  assert.deepEqual(ours, node);
};

// ------------------------------------------------ conformant

test('exports as a string, as a conditions object (nested; first matching key in object order) and as a subpath map', () => {
  same('probe.mjs', ['str', 'str/other.js', 'str/package.json', 'cond', 'cond/x', 'cond2', 'cond2/o', 'cond2/w']);
});

test('subpath patterns: trailing and middle "*", longest prefix first, then the longer key; null patterns exclude', () => {
  same('probe.mjs', [
    'sub', 'sub/feature', 'sub/features/a.js', 'sub/features/internal/x.js', 'sub/features/.js', 'sub/x', 'sub/lib/x.js',
    'sub/mid/q/index.js', 'sub/t/a.js', 'sub/t/a', 'sub/package.json', 'excl', 'excl/x', 'excl/lib/a.js', 'excl/lib/private/p.js',
  ]);
});

test('arrays: invalid targets are skipped, null and unmatched conditions fall through, empty arrays export nothing', () => {
  same('probe.mjs', ['arr/inv', 'arr/url', 'arr/nested', 'arr/nullfirst', 'arr/num', 'arr/empty', 'arr/allbad']);
});

test('./package.json is private unless exported; scoped packages; invalid package names (%, \\, bare scope)', () => {
  same('probe.mjs', ['pj', 'pj/package.json', '@scope/pkg', '@scope/pkg/x', '@scope/pkg/y', '@scope', 'pct%2Fx', 'str\\x', 'no-such-package']);
});

test('no "exports": main, else index.js; subpaths are files, extensionless or directory subpaths are not completed', () => {
  same('probe.mjs', ['nomain', 'withmain', 'withmain/index.js', 'nomain/lib/a.js', 'nomain/lib/a', 'nomain/lib']);
});

test('self-reference by the package\'s own name (only with "exports")', () => {
  same('probe.mjs', ['app', 'app/util', 'app/nope']);
  same('node_modules/selfpkg/probe.mjs', ['selfpkg', 'selfpkg/x', 'selfpkg/nope']);
});

test('"imports": exact keys, patterns, conditions, bare package targets (with patterns), invalid targets, unknown keys', () => {
  same('probe.mjs', ['#a', '#p/x', '#c', '#dep', '#dep/feature', '#bad', '#abs', '#nope', '#']);
  same('node_modules/withimports/probe.mjs', ['#int', '#ext', '#p/a', '#missing', '#a']);
});

test('symlinked packages resolve to real paths (and their own node_modules); the nearest node_modules copy wins', () => {
  same('probe.mjs', ['linked', 'linked/f', 'v', 'outer']);
  same(join(elsewhere, 'linked/probe.mjs'), ['lv', 'linked/f']);
  same('node_modules/outer/probe.mjs', ['v']);
});

test('a package.json that is invalid JSON makes the package unresolvable', () => {
  same('probe.mjs', ['badjson', 'badjson/index.js']);
});

test('empty segments in a target are only deprecated in Node (DEP0166), not invalid', () => {
  same('probe.mjs', ['dots/dbl', 'dots/a.js']);
});

// ------------------------------------------------ divergences from Node

test('array fallbacks: a valid "./" target wins even when its file is missing, and a failing bare "imports" target is not skipped', () => {
  same('probe.mjs', ['arr', 'arr/cmissing', '#arrmissing']);
});

test('a condition whose value is null excludes the subpath instead of falling through to later conditions', () => {
  same('probe.mjs', ['excl/server']);
});

test('"exports": null is the same as no "exports" (main and subpaths resolve)', () => {
  same('probe.mjs', ['nulle', 'nulle/other.js']);
});

test('"exports": null disables self-reference (the name resolves through node_modules to "main")', () => {
  same('node_modules/selfnull/probe.mjs', ['selfnull']);
});

test('legacy "main" is completed like Node (extension, /index.js, then index.js)', () => {
  same('probe.mjs', ['dirmain', 'extless', 'emptymain']);
});

test('no "exports": "module" (an exact path) before "main", as bundlers do; Node reads only "main"', () => {
  const { ours, node } = compare('probe.mjs', ['modfield', 'modgone']);
  assert.deepEqual(ours, {
    'dev modfield': 'node_modules/modfield/dist/x.esm.js', 'dev modgone': 'node_modules/modgone/x.cjs.js',
    'dist modfield': 'node_modules/modfield/dist/x.esm.js', 'dist modgone': 'node_modules/modgone/x.cjs.js',
  });
  assert.equal(node['dist modfield'], 'node_modules/modfield/dist/x.cjs.js');
});

test('targets with "..", "." or node_modules segments, and pattern matches containing them, are invalid', () => {
  same('probe.mjs', ['dots/up', 'dots/nm', 'dots/dot', 'dots/../secret.js', 'dots/x/../a.js']);
});

test('percent-encoding and backslashes in subpaths and targets follow URL resolution', () => {
  same('probe.mjs', ['pct/a%2Fb.js', 'pct/a%20b.js', 'pct/a\\b.js', 'pct/bs']);
});

test('node_modules/<name> stops the lookup even when its package.json is missing or invalid JSON (the outer copy is not used)', () => {
  same('node_modules/outer/probe.mjs', ['dup', 'bare']);
});

test('an invalid package.json is the package scope of its files ("imports" fails), not skipped for an outer package\'s "imports"', () => {
  same('node_modules/badjson/probe.mjs', ['#a']);
});

test('an "exports" object mixing "." keys with condition keys, or with array-index keys, is invalid', () => {
  same('probe.mjs', ['mixed', 'idxkey']);
});

test('"#/…" imports keys resolve as in current Node (24.21 and 26); Node 24.12 and 25.1 still reject them', () => {
  const { ours, node } = compare('probe.mjs', ['#/x']);
  assert.deepEqual(ours, { 'dev #/x': 'src/a.js', 'dist #/x': 'src/a.js' });
  if (Object.values(node).every((v) => v !== 'error')) assert.deepEqual(ours, node); // where this Node accepts them
});
