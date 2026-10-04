// The project (design.md (f)): package.json, index.html and src/ at one root, the current directory.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { scanSource } from './modules.ts';
import { lineCol, type Problem } from './report.ts';
import { prodConditions, readPackage, ResolveError, resolveSpecifier, type PackageJson } from './resolve.ts';

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

export const entryPath = (root: string, spec: string): string => join(root, decodeURIComponent(spec.slice(1)));

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

/** A stylesheet the project's @tailwindcss/cli compiles: one that imports tailwindcss or one of its layers (ADR-37). */
export const importsTailwind = (css: string): boolean => /@import\s+["']tailwindcss(?:\/[^"']*)?["']/.test(css);

/**
 * Compiles file with the project's @tailwindcss/cli (its package.json bin, run by this Node from root, so Tailwind's
 * source detection scans the project): the CSS on stdout, or TAILWIND_FAILED when the CLI is missing or exits non-zero.
 */
export function tailwind(root: string, file: string, minify: boolean): Promise<{ css: string; problem?: undefined } | { css?: undefined; problem: Problem }> {
  const fail = (message: string, hint?: string): { problem: Problem } => ({ problem: { code: 'TAILWIND_FAILED', severity: 'error', message, hint, file } });
  let cli: string;
  try {
    const dir = dirname(resolveSpecifier('@tailwindcss/cli/package.json', join(root, 'index.html'), prodConditions()));
    const bin = (readPackage(dir) as { bin?: string | Record<string, string> } | undefined)?.bin;
    const entry = typeof bin === 'string' ? bin : bin?.['tailwindcss'];
    if (!entry) throw new Error('no bin');
    cli = join(dir, entry);
  } catch {
    return Promise.resolve(fail(`${posixRel(root, file)} imports tailwindcss, but @tailwindcss/cli is not installed.`, 'npm install -D @tailwindcss/cli'));
  }
  // ponytail: compiled on every request (a few hundred milliseconds); cache by the mtimes under src/ if it drags.
  return new Promise((resolve) => {
    execFile(process.execPath, [cli, '-i', file, ...(minify ? ['--minify'] : [])], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      const text = stderr.replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim(); // the CLI prints its banner here on success too
      resolve(err ? fail(`@tailwindcss/cli failed on ${posixRel(root, file)}: ${text || err.message}`) : { css: stdout });
    });
  });
}
