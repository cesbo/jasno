// node scripts/build-package.mjs [--pack]: builds the publishable jasno package into release/ (gitignored).
// The repository runs jasno from its TypeScript sources; Node refuses to strip types under node_modules, so an
// installed package must ship JavaScript. release/ gets:
//   dist/dev.js, dist/prod.js     the public API plus the internals (src/bundle.ts); prod is minified, its dev code gone
//   dist/router{,.dev}.js         @jasno/core/router; its internals come from '@jasno/core/internal', the same file as '@jasno/core'
//   dist/testing.js, testing-requires-dev.js, happy-dom.js
//   dist/cli.js, bin/jasno.js     the CLI (typescript, amaro, es-module-lexer and rolldown resolve from the project)
//   dist/*.d.ts                   module-form types generated from the curated design/jasno.d.ts (RECIPES included)
//   errors/, AGENTS.md, package.json, and the repository's README.md and LICENSE
// --pack also writes release/jasno-<version>.tgz.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { init, parse } from 'es-module-lexer';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DESIGN = join(ROOT, '..', 'design');
const OUT = join(ROOT, 'release');
const DIST = join(OUT, 'dist');
const src = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const runtimeVersion = /export const version = '([^']+)'/.exec(readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8'))?.[1];
if (runtimeVersion !== src.version) throw new Error(`src/index.ts says version ${runtimeVersion}, package.json ${src.version}`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// ---------------------------------------------------------------- JavaScript

const INTERNAL = /^\.\/(core|dom|diag|resource|index|internal)\.ts$/;
/** router/testing builds: the shared modules are external, imported from '@jasno/core/internal'. */
const shareInternals = { name: 'jasno-internal', resolveId: (source) => (INTERNAL.test(source) ? { id: '@jasno/core/internal', external: true } : null) };
/** One file per entry. The '#dev' and '#props' imports resolve by condition (package.json "imports"), and Rolldown
 * folds the imported DEV constant, so the production minify drops the dev-only code. */
async function bundle(entry, out, { dev = false, platform = 'neutral', plugins = [], external, minify = !dev } = {}) {
  const b = await rolldown({
    input: join(ROOT, entry), cwd: ROOT, platform, plugins, external, logLevel: 'warn',
    resolve: { conditionNames: dev ? ['development', 'import', 'default'] : ['import', 'default'] },
    transform: { target: 'es2024' },
  });
  try {
    await b.write({ file: join(DIST, out), format: 'esm', codeSplitting: false, minify, comments: false });
  } finally {
    await b.close();
  }
}
const bare = (id) => !id.startsWith('.') && !id.startsWith('#') && !isAbsolute(id);
await Promise.all([
  bundle('src/bundle.ts', 'dev.js', { dev: true }),
  bundle('src/bundle.ts', 'prod.js'),
  bundle('src/router.ts', 'router.dev.js', { dev: true, plugins: [shareInternals] }),
  bundle('src/router.ts', 'router.js', { plugins: [shareInternals] }),
  bundle('src/testing.ts', 'testing.js', { dev: true, plugins: [shareInternals] }),
  bundle('src/testing-requires-dev.ts', 'testing-requires-dev.js', { plugins: [shareInternals] }),
  bundle('src/happy-dom.ts', 'happy-dom.js', { platform: 'node', external: ['happy-dom'], minify: false }),
  bundle('cli/main.ts', 'cli.js', { platform: 'node', external: bare, minify: false }),
]);

// Every name router and testing import from '@jasno/core/internal' must be exported by both bundles (a missing one would
// only fail at link time in the browser), and the production bundle must not carry the dev build.
await init;
const exportsOf = (file) => new Set(parse(readFileSync(join(DIST, file), "utf8"))[1].map((e) => e.name ?? e.n));
const dev = exportsOf('dev.js'), prod = exportsOf('prod.js');
for (const file of ['router.dev.js', 'router.js', 'testing.js', 'testing-requires-dev.js']) {
  const code = readFileSync(join(DIST, file), 'utf8');
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@jasno\/core\/internal["']/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (name && !(dev.has(name) && prod.has(name))) throw new Error(`${file} imports ${name} from @jasno/core/internal, which the bundles do not export`);
    }
  }
}
for (const file of ['prod.js', 'router.js']) {
  if (readFileSync(join(DIST, file), 'utf8').includes('__JASNO__')) throw new Error(`${file} contains the dev build (__JASNO__)`);
}

// ---------------------------------------------------------------- types

/** Splits the ambient design file into { header, blocks: { [module]: { doc, body } }, rest }: body lines dedented,
 * doc = the comment lines right before a later block. */
function ambient(text) {
  const lines = text.split('\n');
  const blocks = {};
  const header = [];
  let pending = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^declare module '([^']+)' \{(\})?$/.exec(lines[i]);
    if (!m) { (Object.keys(blocks).length ? pending : header).push(lines[i]); continue; }
    const body = [];
    if (!m[2]) for (i++; lines[i] !== '}'; i++) body.push(lines[i].startsWith('  ') ? lines[i].slice(2) : lines[i]);
    blocks[m[1]] = { doc: pending.filter((l) => l.trim()), body };
    pending = [];
  }
  return { header, blocks, rest: pending };
}
// In a module .d.ts a non-exported value declaration needs `declare` (TS1046); ambient blocks implied it.
const moduleForm = (lines) => lines.map((l) => (/^(const|let|var|function|class|enum|namespace) /.test(l) ? `declare ${l}` : l));
const relative = (line) => line.replace(/from '@jasno\/core'/g, "from './jasno.js'").replace(/import\('@jasno\/core'\)/g, "import('./jasno.js')");
const api = ambient(readFileSync(join(DESIGN, 'jasno.d.ts'), 'utf8'));
const elements = ambient(readFileSync(join(DESIGN, 'jasno.elements.d.ts'), 'utf8'));
// The trailing global interface (window.__JASNO__) becomes a global augmentation of the module file.
const globals = api.rest.join('\n').trim();
if (!/^interface Window \{[\s\S]*\}$/.test(globals)) throw new Error(`unexpected top-level declarations after the modules:\n${globals}`);
const types = {
  'jasno.d.ts': [...api.header, ...moduleForm(api.blocks['@jasno/core'].body), '', 'declare global {', ...globals.split('\n').map((l) => `  ${relative(l)}`), '}', ''],
  'router.d.ts': ['// @jasno/core/router: types of the router (see RECIPES in jasno.d.ts).', ...api.blocks['@jasno/core/router'].doc, ...moduleForm(api.blocks['@jasno/core/router'].body).map(relative), ''],
  'testing.d.ts': ['// @jasno/core/testing: mountTest, settled, waitFor (see RECIPES in jasno.d.ts).', ...api.blocks['@jasno/core/testing'].doc, ...moduleForm(api.blocks['@jasno/core/testing'].body).map(relative), ''],
  'happy-dom.d.ts': [...api.blocks['@jasno/core/testing/happy-dom'].doc, 'export {};', ''],
  // Element props merge into module '@jasno/core' as a module augmentation, reached by jasno.d.ts's reference line.
  'jasno.elements.d.ts': [...elements.header, 'export {};', "declare module './jasno.js' {", ...elements.blocks['@jasno/core'].body.filter((l) => l !== 'export {};').map((l) => (l ? `  ${l}` : l)), '}', ''],
};
for (const [file, lines] of Object.entries(types)) writeFileSync(join(DIST, file), lines.join('\n'));

// ---------------------------------------------------------------- package

mkdirSync(join(OUT, 'bin'));
writeFileSync(join(OUT, 'bin', 'jasno.js'), `#!/usr/bin/env node
// ExperimentalWarning is silenced as with --disable-warning=ExperimentalWarning (design.md (e) dev).
const nodeListeners = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') for (const l of nodeListeners) l(w); });
const { main } = await import('../dist/cli.js');
process.exitCode = await main(process.argv.slice(2));
`, { mode: 0o755 });
cpSync(join(ROOT, 'errors'), join(OUT, 'errors'), { recursive: true });
cpSync(join(DESIGN, 'AGENTS.md'), join(OUT, 'AGENTS.md'));
for (const f of ['README.md', 'LICENSE']) cpSync(join(ROOT, '..', f), join(OUT, f));
const pkg = {
  name: '@jasno/core',
  version: src.version,
  description: 'A TypeScript-first SPA framework for coding agents: plain TypeScript, no DSL, no build configuration.',
  keywords: ['spa', 'framework', 'signals', 'typescript', 'no-dsl', 'coding-agents'],
  license: 'MIT',
  author: 'Andrei Dyldin',
  homepage: 'https://github.com/cesbo/jasno#readme',
  repository: { type: 'git', url: 'git+https://github.com/cesbo/jasno.git', directory: 'jasno' },
  bugs: 'https://github.com/cesbo/jasno/issues',
  type: 'module',
  engines: src.engines,
  // "types" first in every conditional entry (M8). '@jasno/core/internal' is the same file as '@jasno/core' per condition.
  exports: {
    '.': { types: './dist/jasno.d.ts', development: './dist/dev.js', default: './dist/prod.js' },
    './internal': { development: './dist/dev.js', default: './dist/prod.js' },
    './router': { types: './dist/router.d.ts', development: './dist/router.dev.js', default: './dist/router.js' },
    './testing': { types: './dist/testing.d.ts', development: './dist/testing.js', default: './dist/testing-requires-dev.js' },
    './testing/happy-dom': { types: './dist/happy-dom.d.ts', default: './dist/happy-dom.js' },
    './package.json': './package.json',
  },
  bin: { jasno: './bin/jasno.js' },
  publishConfig: { access: 'public' },
  files: ['dist', 'bin', 'errors', 'AGENTS.md'],
  dependencies: src.dependencies,
  peerDependencies: { typescript: '~7.0.2', 'happy-dom': src.peerDependencies['happy-dom'] },
  peerDependenciesMeta: { 'happy-dom': { optional: true } },
};
writeFileSync(join(OUT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

if (process.argv.includes('--pack')) {
  const out = execFileSync('npm', ['pack', '--json', '--pack-destination', OUT], { cwd: OUT, encoding: 'utf8' });
  const [info] = JSON.parse(out);
  console.log(`packed ${info.filename}: ${info.entryCount} files, ${info.size} bytes`);
}
console.log('built release/');
