// Condition-aware package resolution (Node's PACKAGE_RESOLVE, PACKAGE_EXPORTS_RESOLVE, PACKAGE_IMPORTS_RESOLVE and
// LEGACY_MAIN_RESOLVE) shared by jasno dev and jasno dist. Node resolves with the process's --conditions only, so
// the CLI walks "exports"/"imports" itself: development for dev and tests, default (or --condition) for dist
// (ADR-26, ADR-35). The browser must load the file Node picks for the same conditions, with one exception: a package
// without "exports" resolves to its "module" file before "main", as bundlers do (Node never reads "module").
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  main?: string;
  module?: string;
  exports?: unknown;
  imports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface Pkg { dir: string; json: PackageJson }

/** kind: 'not-installed' | 'no-condition' (installed, but nothing for these conditions) | 'invalid' | 'missing'. */
export class ResolveError extends Error {
  kind: string;
  constructor(message: string, kind = 'invalid') { super(message); this.kind = kind; }
}
/** Node's Invalid Package Target: the only error an array of fallbacks skips. */
class InvalidTarget extends ResolveError {}

export const DEV_CONDITIONS: ReadonlySet<string> = new Set(['browser', 'import', 'development', 'default']);
export const prodConditions = (extra: readonly string[] = []): ReadonlySet<string> => new Set(['browser', 'import', ...extra, 'default']);

const packages = new Map<string, PackageJson | null | Error>();

/** The package.json in dir: undefined when there is none; throws when it is not valid JSON (Node throws too). */
export function readPackage(dir: string): PackageJson | undefined {
  let j = packages.get(dir);
  if (j === undefined) {
    let text: string | undefined;
    try { text = readFileSync(join(dir, 'package.json'), 'utf8'); } catch { j = null; }
    if (text !== undefined) {
      try { j = JSON.parse(text) as PackageJson; } catch (e) { j = new Error((e as Error).message); }
    }
    packages.set(dir, j!);
  }
  if (j instanceof Error) throw new ResolveError(`${join(dir, 'package.json')} is not valid JSON (${j.message}).`);
  return j ?? undefined;
}

/** Package roots reached through node_modules or a self-reference: their files belong to that package. */
export const packageRoots = new Map<string, Pkg>();

export function clearPackageCache(): void { packages.clear(); packageRoots.clear(); }

/** The package scope of a file (Node's LOOKUP_PACKAGE_SCOPE): the nearest package.json, named or not. */
export function packageOf(file: string): Pkg | undefined {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    if (dir.split(sep).at(-1) === 'node_modules') return undefined;
    const json = readPackage(dir);
    if (json) return { dir, json };
    if (dirname(dir) === dir) return undefined;
  }
}

/** The nearest package.json with a name: a nested {"type":"module"} marker (dist/esm/package.json) is not a package. */
export function namedPackageOf(file: string): Pkg | undefined {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const json = readPackage(dir);
    if (json?.name) return { dir, json };
    if (dirname(dir) === dir) return undefined;
  }
}

const isFile = (f: string): boolean => { try { return statSync(f).isFile(); } catch { return false; } };
const isDir = (f: string): boolean => { try { return statSync(f).isDirectory(); } catch { return false; } };

/** Node's finalizeResolution: no encoded "/" or "\", the file must exist; the real path is returned. */
function finalize(url: URL, spec: string): string {
  if (/%2f|%5c/i.test(url.pathname)) throw new ResolveError(`"${spec}" contains an encoded "/" or "\\".`);
  const file = fileURLToPath(url);
  if (!isFile(file)) throw new ResolveError(`"${spec}" resolves to ${file}, which does not exist.`, 'missing');
  return realpathSync(file);
}

const within = (dir: string, s: string): URL => new URL(s, pathToFileURL(dir + '/'));

/** Resolves a bare or #imports specifier from parentFile to a real file path. */
export function resolveSpecifier(spec: string, parentFile: string, conditions: ReadonlySet<string>): string {
  return spec.startsWith('#') ? resolveImports(spec, parentFile, conditions) : resolvePackage(spec, parentFile, conditions);
}

function resolveImports(spec: string, parentFile: string, conditions: ReadonlySet<string>): string {
  // "#/…" keys: current Node resolves them (24.21 and 26 checked; 24.12 and 25.1 still reject them).
  if (spec === '#' || spec.endsWith('/')) throw new ResolveError(`"${spec}" is not a valid "imports" specifier.`);
  const pkg = packageOf(parentFile);
  const map = pkg?.json.imports;
  const hit = map && typeof map === 'object' && !Array.isArray(map) ? matchKey(map, spec) : undefined;
  if (!pkg || !hit) throw new ResolveError(`"${spec}" is not a key of "imports" in ${pkg ? join(pkg.dir, 'package.json') : 'any package.json'}.`, 'not-installed');
  const r = target(hit.target, pkg.dir, conditions, hit.star, true, spec);
  if (r === undefined || r === null) throw new ResolveError(`No "imports" condition of "${spec}" matches ${[...conditions].join(', ')}.`, 'no-condition');
  return typeof r === 'string' ? r : finalize(r, spec);
}

function splitName(spec: string): [string, string] {
  const parts = spec.split('/');
  const n = spec.startsWith('@') ? 2 : 1;
  const rest = parts.slice(n);
  return [parts.slice(0, n).join('/'), rest.length ? './' + rest.join('/') : '.'];
}

function resolvePackage(spec: string, parentFile: string, conditions: ReadonlySet<string>): string {
  const [name, sub] = splitName(spec);
  if (!name || name.startsWith('.') || name.includes('\\') || name.includes('%') || (name.startsWith('@') && !name.includes('/'))) {
    throw new ResolveError(`"${spec}" is not a valid package specifier.`);
  }
  const own = packageOf(parentFile);
  if (own && own.json.name === name && own.json.exports != null) { // self-reference
    packageRoots.set(own.dir, own);
    return exportsOf(own, sub, conditions, spec);
  }
  for (let dir = dirname(parentFile); ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (isDir(candidate)) { // Node stops at the first node_modules/<name> directory, with or without package.json
      const real = realpathSync(candidate);
      const json = readPackage(real) ?? {};
      const pkg = { dir: real, json };
      if (json.name) packageRoots.set(real, pkg);
      if (json.exports != null) return exportsOf(pkg, sub, conditions, spec);
      return sub === '.' ? legacyMain(pkg, spec) : finalize(within(real, sub), spec);
    }
    if (dirname(dir) === dir) break;
  }
  throw new ResolveError(`Package "${name}" is not installed (no node_modules/${name} above ${dirname(parentFile)}).`, 'not-installed');
}

/**
 * LEGACY_MAIN_RESOLVE without the .json/.node candidates a browser cannot import as code, after "module" taken as an
 * exact path (uPlot: "main" is CommonJS, "module" the ES build).
 */
function legacyMain(pkg: Pkg, spec: string): string {
  const { main, module } = pkg.json;
  const tries = main ? [main, `${main}.js`, `${main}/index.js`] : [];
  for (const t of [...(module ? [module] : []), ...tries, './index.js']) {
    const url = within(pkg.dir, t);
    if (isFile(fileURLToPath(url))) return finalize(url, spec);
  }
  throw new ResolveError(`"${spec}" has no "exports" and no main file in ${pkg.dir}.`, 'missing');
}

function exportsOf(pkg: Pkg, sub: string, conditions: ReadonlySet<string>, spec: string): string {
  let ex = pkg.json.exports;
  if (ex && typeof ex === 'object' && !Array.isArray(ex)) {
    const keys = Object.keys(ex);
    const dotted = keys.filter((k) => k.startsWith('.'));
    if (dotted.length && dotted.length !== keys.length) throw new ResolveError(`"exports" in ${join(pkg.dir, 'package.json')} mixes "." keys with condition keys.`);
    if (!dotted.length) ex = { '.': ex };
  } else ex = { '.': ex };
  const hit = matchKey(ex as Record<string, unknown>, sub);
  if (!hit) throw new ResolveError(`"${sub}" is not exported by ${pkg.json.name ?? pkg.dir} ("${spec}").`, 'no-condition');
  const r = target(hit.target, pkg.dir, conditions, hit.star, false, spec);
  if (r === undefined || r === null) throw new ResolveError(`No "exports" condition of "${spec}" matches ${[...conditions].join(', ')}.`, 'no-condition');
  return typeof r === 'string' ? r : finalize(r, spec);
}

/** An exact key, else the pattern key with the longest prefix before its "*" (Node's PATTERN_KEY_COMPARE). */
function matchKey(map: Record<string, unknown>, key: string): { target: unknown; star: string | undefined } | undefined {
  if (Object.hasOwn(map, key) && !key.includes('*')) return { target: map[key], star: undefined };
  let best: string | undefined;
  for (const k of Object.keys(map)) {
    const i = k.indexOf('*');
    if (i < 0 || !key.startsWith(k.slice(0, i)) || !key.endsWith(k.slice(i + 1)) || key.length < k.length) continue;
    if (!best || i > best.indexOf('*') || (i === best.indexOf('*') && k.length > best.length)) best = k;
  }
  if (!best) return undefined;
  const i = best.indexOf('*');
  return { target: map[best], star: key.slice(i, key.length - (best.length - i - 1)) };
}

/** A ".", ".." or node_modules segment (Node's invalid segments; empty segments are only deprecated there). */
const INVALID_SEGMENT = /(^|\\|\/)((\.|%2e)(\.|%2e)?|(n|%6e|%4e)(o|%6f|%4f)(d|%64|%44)(e|%65|%45)(_|%5f)(m|%6d|%4d)(o|%6f|%4f)(d|%64|%44)(u|%75|%55)(l|%6c|%4c)(e|%65|%45)(s|%73|%53))(\\|\/|$)/i;

/**
 * PACKAGE_TARGET_RESOLVE: a URL (not yet checked for existence), a resolved file (a bare "imports" target),
 * null (excluded) or undefined (no condition matched).
 */
function target(t: unknown, dir: string, conditions: ReadonlySet<string>, star: string | undefined, isImports: boolean, spec: string): URL | string | null | undefined {
  if (typeof t === 'string') {
    const s = star === undefined ? t : t.replaceAll('*', star);
    if (!t.startsWith('./')) {
      if (isImports && !t.startsWith('../') && !t.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(t)) return resolvePackage(s, join(dir, 'package.json'), conditions);
      throw new InvalidTarget(`Invalid target "${t}" for "${spec}" in ${join(dir, 'package.json')}.`);
    }
    if (INVALID_SEGMENT.test(t.slice(2))) throw new InvalidTarget(`Invalid target "${t}" for "${spec}": a ".", ".." or node_modules segment.`);
    if (star !== undefined && INVALID_SEGMENT.test(star)) throw new ResolveError(`"${spec}" matches "${star}", which contains a ".", ".." or node_modules segment.`);
    const url = within(dir, s);
    if (!fileURLToPath(url).startsWith(dir + sep)) throw new InvalidTarget(`Target "${t}" for "${spec}" leaves its package.`);
    return url;
  }
  if (Array.isArray(t)) {
    let last: unknown;
    for (const x of t) {
      let r;
      try { r = target(x, dir, conditions, star, isImports, spec); } catch (e) {
        if (e instanceof InvalidTarget) { last = e; continue; }
        throw e;
      }
      if (r === undefined) continue;
      if (r === null) { last = null; continue; }
      return r;
    }
    if (last === undefined || last === null) return last;
    throw last;
  }
  if (t && typeof t === 'object') {
    for (const [k, v] of Object.entries(t)) {
      if (/^\d+$/.test(k)) throw new ResolveError(`Condition key "${k}" in ${join(dir, 'package.json')} is an array index.`);
      if (k === 'default' || conditions.has(k)) {
        const r = target(v, dir, conditions, star, isImports, spec);
        if (r === undefined) continue;
        return r;
      }
    }
    return undefined;
  }
  if (t === null) return null;
  throw new InvalidTarget(`Invalid target for "${spec}" in ${join(dir, 'package.json')}.`);
}
