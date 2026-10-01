// jasno dist (design.md (e), ADR-29, ADR-35): esbuild bundles the module graph jasno resolved. The entry and each lazy
// view of the app become hashed chunks under src/, shared code goes to src/chunk.<hash>.js; one inline import map (the
// entry URL, integrity for every chunk), modulepreload for the entry's static chunks, the production CSP and the SPA
// fallback files.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importMapIndex, injectHead, productionCsp, ready, scriptJson, walk, withoutComments, type Graph } from './modules.ts';
import { browserModules, entryFiles, entryImports, entryPath, entryProblems, filesUnder, isTestFile, posixRel, readIndex } from './project.ts';
import { lineCol, type Problem, type Reporter } from './report.ts';
import { namedPackageOf, prodConditions, readPackage, type PackageJson } from './resolve.ts';

export interface DistOptions { list: boolean; keep: number; conditions: readonly string[]; nonce: boolean }

const IMMUTABLE = 'public, max-age=31536000, immutable';
/** Names jasno dist generates at the root of dist/: public/ files may not take them. */
const RESERVED = new Set(['index.html', '404.html', '_headers', '_redirects', 'src', 'assets', '.jasno']);

const integrityOf = (s: Buffer): string => 'sha384-' + createHash('sha384').update(s).digest('base64');
const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The string targets a conditions tree selects (first matching key, Node's order), and all of its string targets. */
function targetsOf(t: unknown, conditions: ReadonlySet<string>): { selected: string[]; all: string[] } {
  if (typeof t === 'string') return { selected: [t], all: [t] };
  if (Array.isArray(t)) {
    const parts = t.map((x) => targetsOf(x, conditions));
    return { selected: parts.find((p) => p.selected.length)?.selected ?? [], all: parts.flatMap((p) => p.all) };
  }
  if (t && typeof t === 'object') {
    let selected: string[] | undefined;
    const all: string[] = [];
    for (const [k, v] of Object.entries(t)) {
      const p = targetsOf(v, conditions);
      all.push(...p.all);
      if (!selected && (k === 'default' || conditions.has(k)) && p.selected.length) selected = p.selected;
    }
    return { selected: selected ?? [], all };
  }
  return { selected: [], all: [] };
}

/** Files under the project a "./" target names; a pattern target ("./src/api/*.mock.ts") names every match. */
function filesOfTarget(root: string, target: string, candidates: readonly string[]): string[] {
  if (!target.startsWith('./')) return [];
  const i = target.indexOf('*');
  if (i < 0) return [resolve(root, target)];
  const prefix = resolve(root, target.slice(0, i)) + (target[i - 1] === '/' ? sep : '');
  const suffix = target.slice(i + 1);
  return candidates.filter((f) => f.startsWith(prefix) && f.endsWith(suffix));
}

/**
 * Files reachable only through a package.json "imports" target the build does not select (config.dev.ts,
 * api.mock.ts, "#api/*" → "./src/api/*.mock.ts" under "development"): not roots, so they ship only if production
 * code imports them (dist 1).
 */
function unselectedFiles(root: string, pkg: PackageJson, appConditions: ReadonlySet<string>): Set<string> {
  const candidates = filesUnder(join(root, 'src'));
  const selected = new Set<string>();
  const unselected = new Set<string>();
  for (const t of Object.values(pkg.imports ?? {})) {
    const { selected: sel, all } = targetsOf(t, appConditions);
    // A selected pattern ("./src/api/*.ts") also matches the mocks; only an exact selected target keeps a file.
    for (const s of sel) if (!s.includes('*')) for (const f of filesOfTarget(root, s, candidates)) selected.add(f);
    for (const s of all) if (!sel.includes(s)) for (const f of filesOfTarget(root, s, candidates)) unselected.add(f);
  }
  const g = walk([...unselected].filter((f) => !selected.has(f)), root, prodConditions(), appConditions);
  return new Set([...g.mods.values()].filter((m) => m.owner.kind === 'app' && !selected.has(m.file)).map((m) => m.file));
}

/**
 * SECRET_FILE_IN_OUTPUT: .env*, *.pem or *.key in a published directory, or any dotfile in src/ or assets/ (ADR-29,
 * C3); public/ is copied as is, so its dotfiles (.well-known/) are published. A symlink there is FILE_NOT_PUBLISHED
 * (dist publishes regular files only, so a link would silently drop or leak its target).
 */
function secrets(root: string): Problem[] {
  const out: Problem[] = [];
  const visit = (d: string, dotfiles: boolean): void => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (/^\.env/i.test(e.name) || /\.(pem|key)$/i.test(e.name) || (!dotfiles && e.name.startsWith('.'))) {
        out.push({ code: 'SECRET_FILE_IN_OUTPUT', severity: 'error', message: `${posixRel(root, p)} is in a published directory; jasno dist never ships .env*, *.pem or *.key, nor dotfiles from src/ and assets/.`, hint: 'Move it out of src/, assets/ and public/.', file: p });
      } else if (e.isSymbolicLink()) {
        out.push({ code: 'FILE_NOT_PUBLISHED', severity: 'error', message: `${posixRel(root, p)} is a symlink; jasno dist publishes regular files only.`, hint: 'Copy the file into the directory instead of linking it.', file: p });
      } else if (e.isDirectory()) visit(p, dotfiles);
    }
  };
  visit(join(root, 'src'), false);
  visit(join(root, 'assets'), false);
  visit(join(root, 'public'), true);
  return out;
}

/** The pinned stripper's version (amaro's dist/ has its own nameless package.json). */
function stripperVersion(): string {
  try { return `amaro@${namedPackageOf(fileURLToPath(import.meta.resolve('amaro')))?.json.version ?? '?'}`; } catch { return 'amaro@?'; }
}

function headersFile(csp: string): string {
  const rule = (path: string, headers: Record<string, string>): string => `${path}\n${Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`;
  return [
    rule('/*', { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' }),
    ...['/', '/index.html', '/404.html', '/assets/*'].map((p) => rule(p, { 'Cache-Control': 'no-cache' })),
    rule('/src/*', { 'Cache-Control': IMMUTABLE }),
  ].join('');
}

/**
 * A miss under a module or asset directory is a missing file (404), not the app: a stale tab past --keep must not
 * get index.html as JavaScript cached for a year. Everything else falls back to index.html (dist 7).
 */
const REDIRECTS = ['/src/*', '/assets/*'].map((p) => `${p} /404.html 404\n`).join('') + '/* /index.html 200\n';

interface Manifest { stripper: string; deploys: string[][] }

/**
 * esbuild bundles the graph jasno already resolved, so dev, check and dist agree on every import (the graph answers
 * onResolve, the stripped source answers onLoad; esbuild neither resolves nor parses TypeScript). The entry and the
 * app's lazy targets keep their paths under src/ with a content hash; shared code, a package's lazy targets included,
 * goes to src/chunk.<hash>.js. Identifiers are not minified, so stack traces keep their names, and linked source maps
 * point at the .ts files. Licence comments of dependencies stay at the end of their chunk.
 */
async function bundle(g: Graph, root: string, html: string) {
  const { build, version } = await import('esbuild');
  const entries = entryImports(html).map((e) => ({ spec: e.specifier, file: entryPath(root, e.specifier) })).filter((e) => g.mods.has(e.file));
  const named = new Set(entries.map((e) => e.file));
  const src = join(root, 'src') + sep;
  for (const mod of g.mods.values()) for (const e of mod.edges) if (e.dynamic && e.file?.startsWith(src) && g.mods.has(e.file)) named.add(e.file);
  const out = join(root, 'dist');
  const result = await build({
    absWorkingDir: root, entryPoints: [...named], outdir: out, outbase: root, entryNames: '[dir]/[name].[hash]', chunkNames: 'src/chunk.[hash]',
    bundle: true, splitting: true, format: 'esm', platform: 'browser', target: ['chrome136', 'firefox138', 'safari18.4'],
    minifyWhitespace: true, minifySyntax: true, charset: 'utf8', legalComments: 'eof', sourcemap: 'linked',
    write: false, metafile: true, logLevel: 'silent',
    plugins: [{
      name: 'jasno-graph',
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) => {
          if (args.kind === 'entry-point') return { path: args.path };
          const file = g.mods.get(args.importer)?.edges.find((e) => e.specifier === args.path)?.file;
          // An import the graph left unresolved (an optional peer's import()) stays as written.
          return file ? { path: file } : { path: args.path, external: true };
        });
        b.onLoad({ filter: /.*/ }, (args) => ({ contents: g.mods.get(args.path)?.scan.code ?? readFileSync(args.path, 'utf8'), loader: extname(args.path) === '.json' ? 'json' : 'js' }));
      },
    }],
  });
  const prefix = posixRel(root, out) + '/'; // metafile keys are relative to absWorkingDir: dist/src/main.<hash>.js
  const meta = result.metafile.outputs;
  const chunks = new Map<string, Buffer>();
  const sources = new Map<string, string>();
  const integrity: Record<string, string> = {};
  for (const f of result.outputFiles) {
    const path = posixRel(out, f.path);
    const content = Buffer.from(f.contents);
    chunks.set(path, content);
    if (path.endsWith('.js')) integrity['/' + path] = integrityOf(content);
    sources.set(path, path.endsWith('.map') ? '(source map)' : meta[prefix + path]?.entryPoint ?? '(shared chunk)');
  }
  const byEntry = new Map(Object.entries(meta).filter(([, o]) => o.entryPoint).map(([k, o]) => [o.entryPoint!, k.slice(prefix.length)]));
  const imports: Record<string, string> = {};
  const preload = new Set<string>();
  const visit = (path: string): void => {
    if (preload.has(path)) return;
    preload.add(path);
    for (const i of meta[prefix + path]!.imports) if (i.kind === 'import-statement') visit(i.path.slice(prefix.length));
  };
  for (const e of entries) {
    const path = byEntry.get(posixRel(root, e.file))!;
    imports[e.spec] = '/' + path;
    visit(path);
  }
  return {
    chunks, sources, map: { imports, integrity },
    preloads: [...preload].map((p) => ({ url: '/' + p, integrity: integrity['/' + p]! })),
    modules: Object.keys(result.metafile.inputs).length, bundler: `esbuild@${version}`,
  };
}

export async function dist(root: string, opts: DistOptions, reporter: Reporter): Promise<number> {
  await ready;
  const html = readIndex(root);
  if (html === undefined) { reporter.info(`jasno dist: no index.html in ${root}.`); return 1; }
  const pkg = readPackage(root) ?? {};
  const index = join(root, 'index.html');
  const problems: Problem[] = [...secrets(root), ...entryProblems(root, html)];
  const mapAt = importMapIndex(html);
  if (mapAt >= 0) {
    problems.push({ code: 'IMPORT_MAP_HANDWRITTEN', severity: 'error', message: 'index.html contains a <script type="importmap">; jasno generates the import map.', hint: 'Delete it and keep the <!--jasno:head--> slot.', file: index, ...lineCol(html, mapAt) });
  }
  const csp = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/i.exec(withoutComments(html));
  if (csp && /'strict-dynamic'/i.test(csp[0])) {
    problems.push({ code: 'CSP_HASH_STRICT_DYNAMIC', severity: 'error', message: "index.html carries its own CSP with 'strict-dynamic': combined with jasno's hash sources it blocks the imports (Chromium, Firefox).", hint: 'Delete the meta tag; jasno dist writes the policy. For a nonce policy, see jasno dist --nonce.', file: index, ...lineCol(html, csp.index) });
  } else if (csp) {
    problems.push({ code: 'CSP_HASH_STRICT_DYNAMIC', severity: 'warn', message: "index.html carries its own CSP <meta>: browsers enforce it together with jasno's policy, so the stricter of the two wins and the app can break only after deploy.", hint: 'Delete the meta tag; jasno dist writes the policy (a server can send more headers).', file: index, ...lineCol(html, csp.index) });
  }
  const entries = entryFiles(root, html);
  if (!entries.length && !problems.some((p) => p.file === index)) {
    problems.push({ code: 'MODULE_NOT_FOUND', severity: 'error', message: "index.html has no inline <script type=\"module\"> importing the entry (import '/src/main.ts').", file: index });
  }
  const appConditions = prodConditions(opts.conditions);
  const skip = unselectedFiles(root, pkg, appConditions);
  const g = walk([...entries, ...browserModules(root).filter((f) => !skip.has(f))], root, prodConditions(), appConditions);
  problems.push(...g.problems);
  for (const mod of g.mods.values()) {
    if (mod.owner.kind === 'app' && (!mod.file.startsWith(join(root, 'src') + sep) || isTestFile(mod.file))) {
      problems.push({ code: 'FILE_NOT_PUBLISHED', severity: 'error', file: mod.file, message: `Browser code imports ${posixRel(root, mod.file)}, which jasno dist does not publish (${isTestFile(mod.file) ? 'a test file' : 'outside src/'}).`, hint: 'Browser modules live under src/ and are not *.test.ts files.' });
    }
    for (const e of mod.edges) {
      if (e.dynamic && e.specifier === undefined) {
        problems.push({ code: 'DYNAMIC_IMPORT_NOT_LITERAL', severity: 'error', message: 'import() of a computed specifier: the bundle holds only modules imported by string literals, so its target is not in dist/.', hint: "Import a string literal (() => import('./views/x.ts')).", file: mod.file, ...lineCol(mod.scan.code, e.start) });
      }
    }
  }

  // public/ files go to the root of dist/ unhashed (robots.txt, favicon.ico); they may not take a generated name.
  const publicFiles = filesUnder(join(root, 'public'), true);
  for (const f of publicFiles) {
    const top = posixRel(join(root, 'public'), f).split('/')[0]!;
    if (RESERVED.has(top)) problems.push({ code: 'FILE_NOT_PUBLISHED', severity: 'error', file: f, message: `public/${top} would replace what jasno dist generates at /${top}.`, hint: 'Rename it.' });
  }
  for (const p of problems) reporter.add(p);
  if (problems.some((p) => p.severity === 'error')) { reporter.info('jasno dist: nothing written.'); return 1; }

  const built = await bundle(g, root, html);

  // index.html: CSP meta, import map, modulepreload with integrity; the entry script stays inline (dist 3-6).
  const preloads = built.preloads.map((p) => `<link rel="modulepreload" href="${p.url}" integrity="${p.integrity}">`).join('\n  ');
  const withMap = injectHead(html, `<!--jasno:csp-->\n  <script type="importmap">${scriptJson(built.map)}</script>\n  ${preloads}`);
  const policy = productionCsp(withMap);
  const page = withMap.replace('<!--jasno:csp-->', () => `<meta http-equiv="Content-Security-Policy" content="${policy}">`);

  const files = new Map<string, { content?: string | Buffer; from?: string }>();
  for (const [path, content] of built.chunks) files.set(path, { content });
  for (const f of filesUnder(join(root, 'assets'))) files.set(posixRel(root, f), { from: f });
  for (const f of publicFiles) files.set(posixRel(join(root, 'public'), f), { from: f });
  files.set('index.html', { content: page });
  files.set('404.html', { content: page });
  files.set('_redirects', { content: REDIRECTS });
  files.set('_headers', { content: headersFile(policy) });

  // --keep N: the previous N deploys' hashed files stay, so open tabs keep loading their chunks (dist 8).
  const out = join(root, 'dist');
  let previous: string[][] = [];
  try { previous = (JSON.parse(readFileSync(join(out, '.jasno', 'manifest.json'), 'utf8')) as Manifest).deploys ?? []; } catch { /* first build */ }
  const kept = new Map<string, Buffer>();
  for (const path of previous.slice(0, opts.keep).flat()) {
    if (files.has(path) || kept.has(path)) continue;
    try { kept.set(path, readFileSync(join(out, ...path.split('/')))); } catch { /* already gone */ }
  }
  const manifest = {
    stripper: stripperVersion(),
    bundler: built.bundler,
    conditions: { dependencies: [...prodConditions()], imports: [...appConditions] },
    deploys: [[...built.chunks.keys()].sort(byCodePoint), ...previous.slice(0, opts.keep)],
  };
  files.set('.jasno/manifest.json', { content: JSON.stringify(manifest, null, 2) + '\n' });

  if (opts.list) {
    for (const path of [...files.keys(), ...kept.keys()].sort(byCodePoint)) {
      const f = files.get(path);
      const source = f?.from ? posixRel(root, f.from) : built.sources.get(path) ?? (kept.has(path) ? '(kept from a previous deploy)' : undefined);
      reporter.info(`dist/${path}${source ? `  <- ${source}` : ''}`, { path: `dist/${path}` });
    }
    return reporter.exitCode();
  }

  // Build next to dist/ and swap, so a failed write never leaves half a deploy.
  const tmp = join(root, `.dist-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  const write = (path: string, data: string | Buffer): void => {
    const file = join(tmp, ...path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
  };
  try {
    for (const [path, data] of kept) write(path, data);
    for (const [path, f] of files) write(path, f.from ? readFileSync(f.from) : f.content!);
    rmSync(out, { recursive: true, force: true });
    renameSync(tmp, out);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const chunks = [...built.chunks.keys()].filter((p) => p.endsWith('.js')).length;
  reporter.info(`jasno dist: ${files.size} files in dist/ (${built.modules} modules in ${chunks} chunks)${kept.size ? `, ${kept.size} kept from previous deploys` : ''}.`, { files: files.size, modules: built.modules, chunks });
  if (opts.nonce) {
    reporter.info(`Nonce variant for servers (put nonce="<nonce>" on both inline scripts in index.html): script-src 'nonce-<nonce>' 'strict-dynamic'; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'`);
  }
  return reporter.exitCode();
}
