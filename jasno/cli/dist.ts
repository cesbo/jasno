// jasno dist (design.md (e), ADR-29, ADR-35): type erasure only. Every shipped .js is its .ts with types blanked
// (same line and column); module names gain a content hash; one inline import map (source URL → hashed URL, bare
// keys, integrity), modulepreload for the entry's static closure, the production CSP, SPA fallback files.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  importMapIndex, injectHead, isRelative, productionCsp, ready, scriptJson, walk, withoutComments, type Graph, type Mod,
} from './modules.ts';
import { browserModules, entryFiles, entryProblems, filesUnder, isTestFile, posixRel, readIndex } from './project.ts';
import { lineCol, type Problem, type Reporter } from './report.ts';
import { namedPackageOf, prodConditions, readPackage, type PackageJson } from './resolve.ts';

export interface DistOptions { list: boolean; keep: number; conditions: readonly string[]; nonce: boolean }

export const BUDGET = { entryWarn: 150, entryError: 250, lazyWarn: 50 };
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** Names jasno dist generates at the root of dist/: public/ files may not take them. */
const RESERVED = new Set(['index.html', '404.html', '_headers', '_redirects', 'src', '_deps', 'jasno', 'assets']);

type Bytes = string | Buffer;
interface Output { path: string; url: string; content: Bytes; integrity: string; mod: Mod }

const hashOf = (s: Bytes): string => createHash('sha256').update(s).digest('hex').slice(0, 10);
const integrityOf = (s: Bytes): string => 'sha384-' + createHash('sha384').update(s).digest('base64');
const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `src/a/b.ts` → `src/a/b.<hash>.js`; JSON keeps .json. */
function hashedPath(rel: string, content: Bytes): string {
  const ext = extname(rel);
  const out = ext === '.json' ? '.json' : '.js';
  return `${rel.slice(0, rel.length - ext.length)}.${hashOf(content)}${out}`;
}

/** Output path (under dist/) of a module before hashing: app files keep their path, packages go to _deps/ or jasno/. */
function sourcePath(mod: Mod, root: string): string {
  if (mod.owner.kind === 'app') return posixRel(root, mod.file);
  const { pkg } = mod.owner;
  const prefix = pkg.json.name === 'jasno' ? 'jasno' : `_deps/${pkg.json.name ?? 'unnamed'}@${pkg.json.version ?? '0.0.0'}`;
  return `${prefix}/${posixRel(pkg.dir, mod.file)}`;
}

const scopeOf = (mod: Mod): string | undefined => {
  if (mod.owner.kind === 'app') return undefined;
  const { pkg } = mod.owner;
  return pkg.json.name === 'jasno' ? '/jasno/' : `/_deps/${pkg.json.name ?? 'unnamed'}@${pkg.json.version ?? '0.0.0'}/`;
};

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
 * SECRET_FILE_IN_OUTPUT: .env*, *.pem, *.key or any dotfile in a published directory (ADR-29, C3); a symlink there
 * is FILE_NOT_PUBLISHED (dist publishes regular files only, so a link would silently drop or leak its target).
 */
function secrets(root: string): Problem[] {
  const out: Problem[] = [];
  const visit = (d: string): void => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.name.startsWith('.') || /\.(pem|key)$/i.test(e.name)) {
        out.push({ code: 'SECRET_FILE_IN_OUTPUT', severity: 'error', message: `${posixRel(root, p)} is in a published directory; jasno dist never ships dotfiles, .env*, *.pem or *.key.`, hint: 'Move it out of src/, assets/ and public/.', file: p });
      } else if (e.isSymbolicLink()) {
        out.push({ code: 'FILE_NOT_PUBLISHED', severity: 'error', message: `${posixRel(root, p)} is a symlink; jasno dist publishes regular files only.`, hint: 'Copy the file into the directory instead of linking it.', file: p });
      } else if (e.isDirectory()) visit(p);
    }
  };
  for (const d of ['src', 'assets', 'public']) visit(join(root, d));
  return out;
}

/** The static import closure of files (static edges only), in breadth-first order. */
function staticClosure(g: Graph, files: readonly string[]): string[] {
  const seen = new Set<string>();
  const queue = [...files];
  while (queue.length) {
    const f = queue.shift()!;
    if (seen.has(f) || !g.mods.has(f)) continue;
    seen.add(f);
    for (const e of g.mods.get(f)!.edges) if (!e.dynamic && e.file) queue.push(e.file);
  }
  return [...seen];
}

/** Module counts per package (dependencies) or directory (the app), for the budget messages. */
function perGroup(g: Graph, files: readonly string[], root: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of files) {
    const mod = g.mods.get(f)!;
    const key = mod.owner.kind === 'app' ? posixRel(root, dirname(f)) || '.' : mod.owner.pkg.json.name ?? 'unnamed';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

const describe = (counts: Record<string, number>): string =>
  Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');

/** The pinned stripper's version (amaro's dist/ has its own nameless package.json). */
function stripperVersion(): string {
  try { return `amaro@${namedPackageOf(fileURLToPath(import.meta.resolve('amaro')))?.json.version ?? '?'}`; } catch { return 'amaro@?'; }
}

function headersFile(csp: string): string {
  const rule = (path: string, headers: Record<string, string>): string => `${path}\n${Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`;
  return [
    rule('/*', { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' }),
    ...['/', '/index.html', '/404.html', '/assets/*'].map((p) => rule(p, { 'Cache-Control': 'no-cache' })),
    ...['/src/*', '/_deps/*', '/jasno/*'].map((p) => rule(p, { 'Cache-Control': IMMUTABLE })),
  ].join('');
}

/**
 * A miss under a module or asset directory is a missing file (404), not the app: a stale tab past --keep must not
 * get index.html as JavaScript cached for a year. Everything else falls back to index.html (dist 7).
 */
const REDIRECTS = ['/src/*', '/_deps/*', '/jasno/*', '/assets/*'].map((p) => `${p} /404.html 404\n`).join('') + '/* /index.html 200\n';

interface Manifest { stripper: string; deploys: string[][] }

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
        problems.push({ code: 'DYNAMIC_IMPORT_NOT_LITERAL', severity: 'warn', message: 'import() of a computed specifier: its closure is unknown, not budgeted and not in the import map.', hint: "Import a string literal (() => import('./views/x.ts')).", file: mod.file, ...lineCol(mod.scan.code, e.start) });
      }
    }
  }

  // Hashed outputs, the import map and integrity (dist 2, 3). Types are blanked in .ts; other files ship as bytes.
  const outputs = new Map<string, Output>();
  for (const mod of g.mods.values()) {
    const rel = sourcePath(mod, root);
    const content: Bytes = /\.m?ts$/.test(mod.file) ? mod.scan.code : readFileSync(mod.file);
    const path = hashedPath(rel, content);
    outputs.set(mod.file, { path, url: '/' + path, content, integrity: integrityOf(content), mod });
  }
  const imports: Record<string, string> = {};
  const scopes: Record<string, Record<string, string>> = {};
  const integrity: Record<string, string> = {};
  for (const o of outputs.values()) {
    imports['/' + sourcePath(o.mod, root)] = o.url;
    integrity[o.url] = o.integrity;
    for (const e of o.mod.edges) {
      if (!e.file || !e.specifier || isRelative(e.specifier) || !outputs.has(e.file)) continue;
      const target = outputs.get(e.file)!.url;
      const scope = scopeOf(o.mod);
      if (scope) (scopes[scope] ??= {})[e.specifier] = target;
      else imports[e.specifier] = target;
    }
  }

  // Budgets (ADR-29) and lazy closures for the manifest (dist 4, 9).
  const entryClosure = staticClosure(g, entries);
  const entryCounts = perGroup(g, entryClosure, root);
  const n = entryClosure.length;
  if (n > BUDGET.entryWarn) {
    problems.push({ code: 'MODULE_BUDGET_EXCEEDED', severity: n > BUDGET.entryError ? 'error' : 'warn', message: `The entry's static closure has ${n} modules (warn > ${BUDGET.entryWarn}, error > ${BUDGET.entryError}): ${describe(entryCounts)}.`, hint: 'Lazy-load views (route view: () => import(...)) and drop barrel files.', file: entries[0] });
  }
  const lazy: Record<string, { modules: number; perPackage: Record<string, number>; closure: string[] }> = {};
  for (const mod of g.mods.values()) {
    for (const e of mod.edges) {
      if (!e.dynamic || !e.file || !outputs.has(e.file) || lazy[outputs.get(e.file)!.url]) continue;
      const closure = staticClosure(g, [e.file]).filter((f) => !entryClosure.includes(f));
      const url = outputs.get(e.file)!.url;
      lazy[url] = { modules: closure.length, perPackage: perGroup(g, closure, root), closure: closure.map((f) => outputs.get(f)!.url) };
      if (closure.length > BUDGET.lazyWarn) {
        problems.push({ code: 'LAZY_BUDGET_EXCEEDED', severity: 'warn', message: `import('${e.specifier}') loads ${closure.length} modules beyond the entry (warn > ${BUDGET.lazyWarn}): ${describe(lazy[url].perPackage)}.`, file: mod.file, ...lineCol(mod.scan.code, e.start) });
      }
    }
  }

  // public/ files go to the root of dist/ unhashed (robots.txt, favicon.ico); they may not take a generated name.
  const publicFiles = filesUnder(join(root, 'public'));
  for (const f of publicFiles) {
    const top = posixRel(join(root, 'public'), f).split('/')[0]!;
    if (RESERVED.has(top)) problems.push({ code: 'FILE_NOT_PUBLISHED', severity: 'error', file: f, message: `public/${top} would replace what jasno dist generates at /${top}.`, hint: 'Rename it.' });
  }
  for (const p of problems) reporter.add(p);
  if (problems.some((p) => p.severity === 'error')) { reporter.info('jasno dist: nothing written.'); return 1; }

  // index.html: CSP meta, import map, modulepreload with integrity; the entry script stays inline (dist 3-6).
  const preloads = entryClosure.map((f) => outputs.get(f)!).filter((o) => !o.path.endsWith('.json'))
    .map((o) => `<link rel="modulepreload" href="${o.url}" integrity="${o.integrity}">`).join('\n  ');
  const withMap = injectHead(html, `<!--jasno:csp-->\n  <script type="importmap">${scriptJson({ imports, scopes, integrity })}</script>\n  ${preloads}`);
  const policy = productionCsp(withMap);
  const page = withMap.replace('<!--jasno:csp-->', () => `<meta http-equiv="Content-Security-Policy" content="${policy}">`);

  const files = new Map<string, { content?: Bytes; from?: string }>();
  for (const o of outputs.values()) files.set(o.path, { content: o.content });
  for (const f of filesUnder(join(root, 'assets'))) files.set(posixRel(root, f), { from: f });
  for (const f of publicFiles) files.set(posixRel(join(root, 'public'), f), { from: f });
  files.set('index.html', { content: page });
  files.set('404.html', { content: page });
  files.set('_redirects', { content: REDIRECTS });
  files.set('_headers', { content: headersFile(policy) });

  // --keep N: the previous N deploys' hashed files stay, so open tabs keep loading their modules (dist 8).
  const out = join(root, 'dist');
  let previous: string[][] = [];
  try { previous = (JSON.parse(readFileSync(join(out, '.jasno', 'manifest.json'), 'utf8')) as Manifest).deploys ?? []; } catch { /* first build */ }
  const kept = new Map<string, Buffer>();
  for (const path of previous.slice(0, opts.keep).flat()) {
    if (files.has(path) || kept.has(path)) continue;
    try { kept.set(path, readFileSync(join(out, ...path.split('/')))); } catch { /* already gone */ }
  }
  const hashed = [...outputs.values()].map((o) => o.path).sort(byCodePoint);
  const manifest = {
    stripper: stripperVersion(),
    conditions: { dependencies: [...prodConditions()], imports: [...appConditions] },
    entry: { modules: n, perPackage: entryCounts },
    lazy,
    deploys: [hashed, ...previous.slice(0, opts.keep)],
  };
  files.set('.jasno/manifest.json', { content: JSON.stringify(manifest, null, 2) + '\n' });

  if (opts.list) {
    const sourceOf = new Map([...outputs.values()].map((o) => [o.path, posixRel(root, o.mod.file)]));
    for (const path of [...files.keys(), ...kept.keys()].sort(byCodePoint)) {
      const f = files.get(path);
      const source = f?.from ? posixRel(root, f.from) : sourceOf.get(path) ?? (kept.has(path) ? '(kept from a previous deploy)' : undefined);
      reporter.info(`dist/${path}${source ? `  <- ${source}` : ''}`, { path: `dist/${path}` });
    }
    return reporter.exitCode();
  }

  // Build next to dist/ and swap, so a failed write never leaves half a deploy.
  const tmp = join(root, `.dist-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  const write = (path: string, data: Bytes): void => {
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
  reporter.info(`jasno dist: ${files.size} files in dist/ (${outputs.size} modules, entry closure ${n})${kept.size ? `, ${kept.size} kept from previous deploys` : ''}.`, { files: files.size, modules: outputs.size, entry: n });
  if (opts.nonce) {
    reporter.info(`Nonce variant for servers (put nonce="<nonce>" on both inline scripts in index.html): script-src 'nonce-<nonce>' 'strict-dynamic'; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'`);
  }
  return reporter.exitCode();
}
