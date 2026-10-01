// The project (design.md (f)): package.json, index.html and src/ at one root, the current directory.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { scanSource } from './modules.ts';
import { lineCol, type Problem } from './report.ts';
import { readPackage, ResolveError, type PackageJson } from './resolve.ts';

export interface Project { root: string; pkg: PackageJson }

export class ProjectError extends Error {}

export function loadProject(dir: string): Project {
  const root = realpathSync(dir);
  let pkg: PackageJson | undefined;
  try { pkg = readPackage(root); } catch (e) {
    if (e instanceof ResolveError) throw new ProjectError(`${e.message} Fix it; jasno reads the project from it.`);
    throw e;
  }
  if (!pkg) throw new ProjectError(`No package.json in ${root}; run jasno from the project root (the directory with package.json and index.html).`);
  return { root, pkg };
}

export const readIndex = (root: string): string | undefined => {
  try { return readFileSync(join(root, 'index.html'), 'utf8'); } catch { return undefined; }
};

export const isTestFile = (f: string): boolean => /\.test\.ts$/.test(f);

/** Every file under dir (no node_modules, and no dot entries unless dotfiles), sorted. */
export function filesUnder(dir: string, dotfiles = false): string[] {
  const out: string[] = [];
  const visit = (d: string): void => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if ((!dotfiles && e.name.startsWith('.')) || e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) visit(p);
      else if (e.isFile()) out.push(p);
    }
  };
  visit(dir);
  return out.sort();
}

/** Browser modules: non-test .ts files under src/ (design.md (e) check 3). */
export const browserModules = (root: string): string[] =>
  filesUnder(join(root, 'src')).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && !isTestFile(f));

/** Root-relative imports of index.html's inline module scripts ('/src/main.ts'), with their offsets in html. */
export function entryImports(html: string): { specifier: string; offset: number }[] {
  const out: { specifier: string; offset: number }[] = [];
  const text = html.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length));
  for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[1] ?? '';
    if (!/\btype\s*=\s*["']?module\b/i.test(attrs) || /\bsrc\s*=/i.test(attrs)) continue;
    const start = m.index + m[0].indexOf('>') + 1;
    for (const imp of scanSource(m[2] ?? '', false).imports) {
      if (imp.specifier?.startsWith('/') && !imp.specifier.startsWith('//')) out.push({ specifier: imp.specifier, offset: start + imp.start });
    }
  }
  return out;
}

const entryPath = (root: string, spec: string): string => join(root, decodeURIComponent(spec.slice(1)));

/** The entry files index.html imports (root-relative URLs such as '/src/main.ts'). */
export function entryFiles(root: string, html: string): string[] {
  return entryImports(html).map((e) => entryPath(root, e.specifier)).filter((f) => existsSync(f));
}

/** MODULE_NOT_FOUND (TS_EXTENSION for x.js when x.ts exists) for an entry index.html names that is no file. */
export function entryProblems(root: string, html: string): Problem[] {
  const out: Problem[] = [];
  for (const e of entryImports(html)) {
    const file = entryPath(root, e.specifier);
    if (existsSync(file)) continue;
    const ts = e.specifier.endsWith('.js') && existsSync(file.slice(0, -3) + '.ts');
    out.push({
      code: ts ? 'TS_EXTENSION' : 'MODULE_NOT_FOUND', severity: 'error', file: join(root, 'index.html'), ...lineCol(html, e.offset),
      message: ts ? `The entry "${e.specifier}" does not exist; the module is ${e.specifier.slice(0, -3)}.ts.` : `The entry "${e.specifier}" that index.html imports does not exist.`,
    });
  }
  return out;
}

export const posixRel = (from: string, to: string): string => relative(from, to).split(sep).join('/');
