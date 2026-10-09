// Strip (the pinned amaro, positions preserved), scan imports (es-module-lexer) and walk the module graph from the
// entry with a condition set. jasno dev maps the graph to /src, /@jasno and /@dep URLs; jasno dist to hashed files.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'amaro';
import { init, parse } from 'es-module-lexer';
import { lineCol, type Problem } from './report.ts';
import { namedPackageOf, packageRoots, ResolveError, resolveSpecifier, type Pkg } from './resolve.ts';

export const ready: Promise<void> = init();

export interface StripFailure { message: string; line: number; col: number }

/** Types replaced by whitespace; same line and column (design.md (e) dist). */
export function strip(code: string): string {
  return transformSync(code, { mode: 'strip-only' }).code;
}

function stripFailure(e: unknown): StripFailure {
  const x = e as { message?: string; startLine?: number; startColumn?: number };
  return { message: x.message ?? String(e), line: x.startLine ?? 1, col: (x.startColumn ?? 0) + 1 };
}

export interface RawImport { specifier: string | undefined; dynamic: boolean; start: number }

export interface Scanned {
  /** Browser JavaScript: stripped TypeScript, JavaScript as is, JSON as is. */
  code: string;
  source: string;
  failure: StripFailure | undefined;
  imports: RawImport[];
  hasModuleSyntax: boolean;
}

const scans = new Map<string, { mtime: number; scan: Scanned }>();

export function scanSource(source: string, ts: boolean): Scanned {
  let code = source;
  let failure: StripFailure | undefined;
  if (ts) {
    try { code = strip(source); } catch (e) { failure = stripFailure(e); }
  }
  if (failure) return { code, source, failure, imports: [], hasModuleSyntax: true };
  try {
    const [imports, , , hasModuleSyntax] = parse(code);
    return {
      code, source, failure, hasModuleSyntax,
      // A template-literal import() comes back as a glob ('./views/*.ts'): not a literal, closure unknown.
      // Positions are the specifier's opening quote, where tsc points (the lexer gives the text after it).
      imports: imports.filter((i) => i.type !== 'import-meta').map((i) => ({
        specifier: i.type === 'dynamic' && i.glob ? undefined : i.specifier ?? undefined,
        dynamic: i.type === 'dynamic',
        start: i.type !== 'dynamic' && (code[i.start - 1] === '"' || code[i.start - 1] === "'") ? i.start - 1 : i.start,
      })),
    };
  } catch (e) {
    const idx = (e as { idx?: number }).idx ?? 0;
    return { code, source, failure: { message: 'not a valid module', ...lineCol(code, idx) }, imports: [], hasModuleSyntax: true };
  }
}

/** Reads and scans a module, cached by mtime. */
export function scanFile(file: string): Scanned {
  const mtime = statSync(file).mtimeMs;
  const hit = scans.get(file);
  if (hit && hit.mtime === mtime) return hit.scan;
  const source = readFileSync(file, 'utf8');
  const scan = extname(file) === '.json'
    ? { code: source, source, failure: undefined, imports: [], hasModuleSyntax: true }
    : scanSource(source, extname(file) === '.ts' || extname(file) === '.mts');
  scans.set(file, { mtime, scan });
  return scan;
}

export const isRelative = (s: string): boolean => s.startsWith('./') || s.startsWith('../') || s.startsWith('/');

export interface Edge {
  specifier: string | undefined;
  dynamic: boolean;
  start: number;
  /** The resolved file, when resolution succeeded. */
  file?: string | undefined;
  error?: string | undefined;
}

export interface Mod { file: string; scan: Scanned; edges: Edge[]; owner: Owner }

/** The app (files under the project root) or the package a file belongs to. */
export type Owner = { kind: 'app' } | { kind: 'package'; pkg: Pkg };

export function ownerOf(file: string, root: string): Owner {
  // A package root the resolver reached (through node_modules, even when linked into the project) owns its files;
  // the project itself may sit inside a package (the jasno repository's probe app) and stays the app.
  let best: Pkg | undefined;
  for (const p of packageRoots.values()) {
    if (!file.startsWith(p.dir + sep) || root === p.dir || (root.startsWith(p.dir + sep) && file.startsWith(root + sep))) continue;
    if (!best || p.dir.length > best.dir.length) best = p;
  }
  if (best) return { kind: 'package', pkg: best };
  const rel = relative(root, file);
  if (!rel.startsWith('..') && !rel.split(sep).includes('node_modules')) return { kind: 'app' };
  let pkg: Pkg | undefined;
  try { pkg = namedPackageOf(file); } catch { /* invalid package.json: reported by the resolver */ }
  return pkg ? { kind: 'package', pkg } : { kind: 'app' };
}

export interface Graph { mods: Map<string, Mod>; problems: Problem[] }

/**
 * The static and literal dynamic import closure of roots. Packages resolve with conditions; the app's own "imports"
 * keys with appConditions (jasno dist --condition applies to them only, design.md (e) dist 3).
 */
export function walk(roots: readonly string[], root: string, conditions: ReadonlySet<string>, appConditions = conditions): Graph {
  const mods = new Map<string, Mod>();
  const problems: Problem[] = [];
  const queue = [...roots];
  while (queue.length) {
    const file = queue.shift()!;
    if (mods.has(file)) continue;
    let scan: Scanned;
    try { scan = scanFile(file); } catch { continue; }
    const owner = ownerOf(file, root);
    const mod: Mod = { file, scan, edges: [], owner };
    mods.set(file, mod);
    if (scan.failure) {
      problems.push({ code: 'SYNTAX_REJECTED', severity: 'error', message: `does not parse as a module: ${scan.failure.message}`, file, line: scan.failure.line, col: scan.failure.col });
    }
    if (owner.kind === 'package') problems.push(...browserEsmProblems(mod, owner.pkg));
    for (const imp of scan.imports) {
      const edge: Edge = { specifier: imp.specifier, dynamic: imp.dynamic, start: imp.start };
      mod.edges.push(edge);
      if (imp.specifier === undefined) continue;
      try {
        edge.file = isRelative(imp.specifier)
          ? relativeTarget(imp.specifier, file, root, owner)
          : resolveSpecifier(imp.specifier, file, owner.kind === 'app' && imp.specifier.startsWith('#') ? appConditions : conditions);
      } catch (e) {
        edge.error = e instanceof ResolveError ? e.message : String(e);
        const at = lineCol(scan.code, imp.start);
        // ADR-35 checks a dependency's static closure: an optional peer behind import() may be missing.
        if (owner.kind === 'package' && imp.dynamic) continue;
        const noBrowserEntry = e instanceof ResolveError && e.kind === 'no-condition' && !imp.specifier.startsWith('#');
        problems.push(owner.kind === 'package' || noBrowserEntry
          ? { code: 'DEP_NOT_BROWSER_ESM', severity: 'error', message: `"${imp.specifier}" cannot be resolved for the browser: ${edge.error}`, hint: noBrowserEntry ? 'The package has no entry for the browser/import/default conditions; use a package or version with an ESM build.' : undefined, file, ...at }
          : isRelative(imp.specifier)
            ? { code: edge.error.includes('relative specifiers end in .ts') ? 'TS_EXTENSION' : 'MODULE_NOT_FOUND', severity: 'error', message: edge.error, file, ...at }
            : { code: 'IMPORT_NOT_MAPPED', severity: 'error', message: `"${imp.specifier}" cannot be mapped: ${edge.error}`, hint: 'Import @jasno/core, @jasno/core/router, a package from "dependencies" or a package.json "imports" key.', file, ...at });
        continue;
      }
      queue.push(edge.file);
    }
  }
  return { mods, problems };
}

function relativeTarget(spec: string, file: string, root: string, owner: Owner): string {
  if (spec.startsWith('/') && !spec.startsWith('//')) {
    if (owner.kind !== 'app') throw new ResolveError(`Root-relative "${spec}" inside a package.`);
    return existingFile(join(root, decodeURIComponent(spec.slice(1))), spec);
  }
  return existingFile(fileURLToPath(new URL(spec, pathToFileURL(file))), spec);
}

function existingFile(f: string, spec: string): string {
  try { if (statSync(f).isFile()) return f; } catch { /* below */ }
  const ts = f.endsWith('.js') ? f.slice(0, -3) + '.ts' : '';
  throw new ResolveError(ts && (() => { try { return statSync(ts).isFile(); } catch { return false; } })()
    ? `"${spec}" does not exist; the file is ${spec.slice(0, -3)}.ts (relative specifiers end in .ts).`
    : `"${spec}" does not exist (${f}).`);
}

/** True when offset sits in a comment or a string on its line (a heuristic: there is no tokenizer here). */
function inCommentOrString(code: string, offset: number): boolean {
  const lineStart = code.lastIndexOf('\n', offset - 1) + 1;
  const before = code.slice(lineStart, offset);
  if (/(^|[^:\\'"`])\/\//.test(before)) return true;
  if (code.lastIndexOf('/*', offset) > code.lastIndexOf('*/', offset)) return true;
  const unescaped = (q: string): number => (before.match(new RegExp(`(?<!\\\\)${q}`, 'g')) ?? []).length;
  return unescaped("'") % 2 === 1 || unescaped('"') % 2 === 1 || unescaped('`') % 2 === 1;
}

/** DEP_NOT_BROWSER_ESM (ADR-35): CommonJS or an unguarded process.env read in a dependency's closure. */
function browserEsmProblems(mod: Mod, pkg: Pkg): Problem[] {
  const { code, hasModuleSyntax } = mod.scan;
  const out: Problem[] = [];
  const name = pkg.json.name ?? dirname(mod.file);
  const at = (re: RegExp): { line: number; col: number } => lineCol(code, Math.max(0, code.search(re)));
  if (!hasModuleSyntax && /\brequire\s*\(|\bmodule\.exports\b|\bexports\.[A-Za-z_$]/.test(code)) {
    out.push({ code: 'DEP_NOT_BROWSER_ESM', severity: 'error', message: `${name} ships CommonJS here; browsers load ES modules only.`, hint: 'Use a package or version with an ESM build ("exports" with an "import" or "browser" condition, or "module").', file: mod.file, ...at(/\brequire\s*\(|\bmodule\.exports\b|\bexports\./) });
  }
  // A read guarded by `typeof process` runs fine in browsers; mentions in comments are not reads.
  const read = [...code.matchAll(/\bprocess\.env\b/g)].find((m) => !inCommentOrString(code, m.index));
  if (read && !/\btypeof\s+process\b/.test(code)) {
    out.push({ code: 'DEP_NOT_BROWSER_ESM', severity: 'error', message: `${name} reads process.env, which browsers do not have.`, hint: 'Use a browser build of the package.', file: mod.file, ...lineCol(code, read.index) });
  }
  return out;
}

/** Inline <script> contents without src, in document order (their hashes go into the CSP). */
export function inlineScripts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) if (!/\bsrc\s*=/i.test(m[1] ?? '')) out.push(m[2] ?? '');
  return out;
}

/** HTML comments blanked to spaces, so offsets stay valid. */
export const withoutComments = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length));

/** Offset of a handwritten <script type="importmap"> (the type is trimmed and case-insensitive, as in HTML), or -1. */
export const importMapIndex = (html: string): number => withoutComments(html).search(/<script\b[^>]*\btype\s*=\s*(["']?)\s*importmap\s*\1(?=[\s>\/])/i);
export const hasHandwrittenImportMap = (html: string): boolean => importMapIndex(html) >= 0;

/** Where jasno puts the import map: the <!--jasno:head--> slot, else before </head>, else after <head> or the doctype. */
export function injectHead(html: string, markup: string): string {
  if (html.includes('<!--jasno:head-->')) return html.replace('<!--jasno:head-->', () => markup);
  const clean = withoutComments(html);
  const close = clean.search(/<\/head\s*>/i);
  if (close >= 0) return html.slice(0, close) + markup + '\n' + html.slice(close);
  const open = /<head\b[^>]*>|<!doctype[^>]*>/i.exec(clean);
  const i = open ? open.index + open[0].length : 0;
  return html.slice(0, i) + '\n' + markup + '\n' + html.slice(i);
}

/** JSON for an inline <script>: "<" escaped so no value can close the element. */
export const scriptJson = (value: unknown, space?: number): string => JSON.stringify(value, null, space).replaceAll('<', '\\u003c');

/** The production CSP (design.md (e) dist 6), with every inline script of html allowed by its sha256 hash. */
export function productionCsp(html: string): string {
  const hashes = inlineScripts(html).map((s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`);
  return `script-src 'self' ${hashes.join(' ')}; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'`;
}
