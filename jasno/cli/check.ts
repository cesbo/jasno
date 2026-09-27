// jasno check (design.md (e)): both TypeScript programs through the project's TypeScript 7 API, the syntax gate
// (strip + parse in one process), jasno's syntactic and type-aware rules, and the tsconfig/package.json contract.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Diagnostic, Program } from 'typescript/unstable/sync';
import type { SourceFile } from 'typescript/unstable/ast';
import { importMapIndex, isRelative, ready, scanFile, walk } from './modules.ts';
import { browserModules, entryFiles, entryProblems, filesUnder, isTestFile, readIndex } from './project.ts';
import { lineCol, type Problem, type Reporter } from './report.ts';
import { DEV_CONDITIONS, prodConditions, readPackage, type PackageJson } from './resolve.ts';
import { fileRules, focusStyleRule, referenceRule, typeRules, type CssTemplate } from './rules.ts';

export interface CheckOptions { strict: boolean; /** false: behave as if the TS API failed to load (tests). */ api?: boolean | undefined }

export const TS_RANGE = { major: 7, minor: 0, patch: 2 };

interface LoadedTs {
  version: string;
  tsc: string;
  sync?: typeof import('typescript/unstable/sync');
  ast?: typeof import('typescript/unstable/ast');
  error?: string;
}

/** The project's own TypeScript (npm run check resolves it from devDependencies), not jasno's. */
async function loadTypeScript(root: string, api: boolean): Promise<LoadedTs | undefined> {
  const req = createRequire(join(root, 'package.json'));
  let dir: string;
  try { dir = dirname(req.resolve('typescript/package.json')); } catch { return undefined; }
  const version = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version;
  const loaded: LoadedTs = { version, tsc: join(dir, 'bin', 'tsc') };
  if (!api) return { ...loaded, error: 'the API was disabled' };
  try {
    loaded.sync = await import(pathToFileURL(req.resolve('typescript/unstable/sync')).href) as typeof import('typescript/unstable/sync');
    loaded.ast = await import(pathToFileURL(req.resolve('typescript/unstable/ast')).href) as typeof import('typescript/unstable/ast');
  } catch (e) {
    return { ...loaded, error: (e as Error).message };
  }
  return loaded;
}

const inRange = (v: string): boolean => {
  const [major, minor, patch] = v.split(/[.-]/).map(Number);
  return major === TS_RANGE.major && minor === TS_RANGE.minor && (patch ?? 0) >= TS_RANGE.patch;
};

// ------------------------------------------------ tsconfig (JSONC with extends)

/** JSON with comments and trailing commas, as tsconfig allows. */
export function parseJsonc(text: string): unknown {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

interface TsConfig { compilerOptions: Record<string, unknown>; include?: string[]; exclude?: string[]; files?: string[] }

function readTsconfig(file: string, depth = 0): TsConfig {
  const raw = parseJsonc(readFileSync(file, 'utf8')) as TsConfig & { extends?: string | string[] };
  let base: TsConfig = { compilerOptions: {} };
  for (const ext of [raw.extends ?? []].flat()) {
    if (depth > 8) break;
    let target: string;
    try {
      target = isRelative(ext) ? resolve(dirname(file), ext.endsWith('.json') ? ext : `${ext}.json`) : createRequire(file).resolve(ext);
    } catch { continue; }
    const parent = readTsconfig(target, depth + 1);
    base = { ...base, ...parent, compilerOptions: { ...base.compilerOptions, ...parent.compilerOptions } };
  }
  return { ...base, ...raw, compilerOptions: { ...base.compilerOptions, ...(raw.compilerOptions ?? {}) } };
}

const REQUIRED: Record<string, unknown> = {
  target: 'es2025', module: 'nodenext', moduleResolution: 'nodenext', strict: true, noEmit: true,
  allowImportingTsExtensions: true, erasableSyntaxOnly: true, verbatimModuleSyntax: true,
  exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true,
};

/** TSCONFIG_DRIFT (design.md (c)): the contract the templates in (f) set up. */
function drift(root: string, pkg: PackageJson, nodeFiles: readonly string[], browserProgramFiles: readonly string[] | undefined): Problem[] {
  const out: Problem[] = [];
  const add = (file: string, message: string, hint?: string): void => { out.push({ code: 'TSCONFIG_DRIFT', severity: 'error', message, hint, file }); };
  if (pkg.type !== 'module') add(join(root, 'package.json'), 'package.json has no "type": "module"; every import then fails with TS1295.', 'Add "type": "module".');
  const browser = join(root, 'tsconfig.json');
  const test = join(root, 'tsconfig.test.json');
  if (!existsSync(browser)) { add(browser, 'No tsconfig.json (the browser program).', 'Copy the template from the jasno docs.'); return out; }
  for (const file of [browser, test]) {
    if (!existsSync(file)) continue;
    let cfg: TsConfig;
    try { cfg = readTsconfig(file); } catch (e) { add(file, `Cannot read: ${(e as Error).message}`); continue; }
    const o = cfg.compilerOptions;
    for (const [key, want] of Object.entries(REQUIRED)) {
      const have = typeof o[key] === 'string' ? (o[key] as string).toLowerCase() : o[key];
      if (have !== want) add(file, `compilerOptions.${key} is ${have === undefined ? 'missing' : JSON.stringify(o[key])}; the jasno template sets ${JSON.stringify(want)}.`);
    }
    const lib = ((o.lib as string[] | undefined) ?? []).map((l) => l.toLowerCase());
    if (lib.includes('esnext.disposable')) add(file, '"esnext.disposable" in lib: `using` type-checks but is not supported (NO_USING).', 'Remove it from lib.');
    if (file === browser) {
      for (const l of ['es2025', 'dom']) if (!lib.includes(l)) add(file, `compilerOptions.lib lacks "${l}"; the template sets ["es2025", "dom"].`);
      if (!Array.isArray(o.types) || o.types.length) add(file, `compilerOptions.types is ${JSON.stringify(o.types)}; the browser program needs [] so Node globals never type-check in browser code.`, 'Put "types": ["node"] in tsconfig.test.json.');
    }
  }
  const tests = (browserProgramFiles ?? []).filter((f) => f.startsWith(root + sep) && (isTestFile(f) || f.startsWith(join(root, 'e2e') + sep)));
  if (tests.length) add(browser, `The browser program includes test files (${tests.slice(0, 3).map((f) => f.slice(root.length + 1)).join(', ')}): Node types leak into browser code.`, 'Exclude "src/**/*.test.ts" and keep tests in tsconfig.test.json.');
  if (nodeFiles.length && !existsSync(test)) add(test, `There are test or e2e files (${nodeFiles[0]!.slice(root.length + 1)}) but no tsconfig.test.json, so they are not type-checked with Node types.`, 'Copy the tsconfig.test.json template.');
  return out;
}

// ------------------------------------------------ the syntax gate (check 4)

const GATE = `const vm = require('node:vm');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const out = [];
  for (const { file, code } of JSON.parse(input)) {
    try { new vm.SourceTextModule(code, { identifier: file }); } catch (e) { out.push({ file, message: String((e && e.message) || e) }); }
  }
  process.stdout.write(JSON.stringify(out));
});`;

/** Strip every file with the pinned amaro, then parse all outputs as modules in one child process (m1). */
function syntaxGate(files: readonly string[]): Problem[] {
  const out: Problem[] = [];
  const inputs: { file: string; code: string }[] = [];
  for (const file of files) {
    const scan = scanFile(file);
    if (scan.failure) out.push({ code: 'SYNTAX_REJECTED', severity: 'error', message: `The type stripper rejects this file: ${scan.failure.message}`, file, line: scan.failure.line, col: scan.failure.col });
    else inputs.push({ file, code: scan.code });
  }
  if (!inputs.length) return out;
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning', '-e', GATE], { input: JSON.stringify(inputs), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  let results: { file: string; message: string }[] = [];
  try { results = JSON.parse(r.stdout) as typeof results; } catch {
    out.push({ code: 'SYNTAX_REJECTED', severity: 'error', message: `The syntax gate did not run: ${r.stderr.trim().split('\n')[0] ?? r.status}` });
  }
  // vm errors carry no position; `node --check` on the few failing files does.
  for (const x of results) {
    const code = inputs.find((i) => i.file === x.file)!.code;
    const located = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: code, encoding: 'utf8' });
    const m = /^\[stdin\]:(\d+)\n[^\n]*\n( *)\^/.exec(located.stderr);
    out.push({ code: 'SYNTAX_REJECTED', severity: 'error', message: `Does not parse as a module after type stripping: ${x.message}`, file: x.file, line: m ? Number(m[1]) : 1, col: m ? m[2]!.length + 1 : 1 });
  }
  return out;
}

// ------------------------------------------------ import rules on what the browser actually loads

function importRules(root: string, pkg: PackageJson, file: string, browser: boolean, ast: boolean): Problem[] {
  const out: Problem[] = [];
  const scan = scanFile(file);
  if (scan.failure) return out;
  const deps = Object.keys(pkg.dependencies ?? {});
  const keys = Object.keys(pkg.imports ?? {});
  const isKey = (s: string): boolean => keys.some((k) => {
    const i = k.indexOf('*');
    return i < 0 ? k === s : s.startsWith(k.slice(0, i)) && s.endsWith(k.slice(i + 1));
  });
  for (const imp of scan.imports) {
    const s = imp.specifier;
    if (!s) continue;
    const at = { file, ...lineCol(scan.code, imp.start) };
    if (isRelative(s) && !s.startsWith('/')) {
      if (!s.endsWith('.ts') && !s.endsWith('.json')) {
        out.push({ code: 'TS_EXTENSION', severity: 'error', message: `Relative specifier "${s}" does not end in .ts: the browser and Node load exactly this path.`, hint: s.endsWith('.js') ? `Write "${s.slice(0, -3)}.ts".` : `Write "${s}.ts".`, ...at });
      }
      continue;
    }
    if (!browser || s.startsWith('/')) continue;
    if (s.startsWith('node:')) {
      if (!ast) out.push({ code: 'NODE_TYPES_IN_BROWSER_CODE', severity: 'error', message: `"${s}" in a browser file: Node modules do not exist in the browser.`, hint: 'Keep Node code in tests and config files (the test program).', ...at });
      continue;
    }
    const pkgName = s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0]!;
    if (s === 'jasno' || s === 'jasno/router' || (pkgName !== 'jasno' && deps.includes(pkgName)) || (s.startsWith('#') && isKey(s))) continue;
    out.push({
      code: 'IMPORT_NOT_MAPPED', severity: 'error', ...at,
      message: `"${s}" is not jasno, jasno/router, a package in "dependencies" or a package.json "imports" key, so the import map has no entry for it.`,
      hint: s.startsWith('jasno/') ? `${s} is for tests; browser code imports jasno and jasno/router.` : s.startsWith('#') ? `Add "${s}" to package.json "imports".` : `npm install ${pkgName} (a dependency, not a devDependency).`,
    });
  }
  return out;
}

// ------------------------------------------------ TypeScript diagnostics

function flatten(d: Diagnostic): string {
  const chain = (list: readonly Diagnostic[] | undefined): string[] => (list ?? []).flatMap((c) => [c.text, ...chain(c.messageChain)]);
  return [d.text, ...chain(d.messageChain)].join(' ');
}

const texts = new Map<string, string>();
const textOf = (file: string): string => {
  let t = texts.get(file);
  if (t === undefined) { try { t = readFileSync(file, 'utf8'); } catch { t = ''; } texts.set(file, t); }
  return t;
};

function fromTs(d: Diagnostic, root: string, rel: (f: string) => string): Problem | undefined {
  if (d.category !== 0 && d.category !== 1) return undefined;
  // ponytail: the prototype links jasno's TypeScript source into the program; its own diagnostics are not the
  // app's (the published package ships .d.ts). Remove when jasno ships declarations.
  if (d.fileName && !d.fileName.startsWith(root + sep)) return undefined;
  let message = flatten(d);
  if (d.code === 2835) message = message.replace(/(['"])(\.{1,2}\/[^'"]*?)\.js\1/g, '$1$2.ts$1');
  const related = (d.relatedInformation ?? []).map((r) => {
    const where = r.fileName ? `${rel(r.fileName)}:${Object.values(lineCol(textOf(r.fileName), r.pos)).join(':')} ` : '';
    return where + r.text;
  });
  if (related.length) message += ` (related: ${related.join('; ')})`;
  return { code: `TS${d.code}`, severity: d.category === 1 ? 'error' : 'warn', message, file: d.fileName, ...(d.fileName ? lineCol(textOf(d.fileName), d.pos) : {}) };
}

/** `file(line,col): error TS1234: message` lines of `tsc --pretty false`. */
function fromTscOutput(stdout: string, cwd: string): Problem[] {
  const out: Problem[] = [];
  for (const line of stdout.split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): (error|warning) TS(\d+): (.*)$/.exec(line);
    if (m) out.push({ code: `TS${m[5]}`, severity: m[4] === 'error' ? 'error' : 'warn', message: m[6]!, file: resolve(cwd, m[1]!), line: Number(m[2]), col: Number(m[3]) });
    else if (/^(error|warning) TS\d+:/.test(line)) {
      const g = /^(error|warning) TS(\d+): (.*)$/.exec(line)!;
      out.push({ code: `TS${g[2]}`, severity: g[1] === 'error' ? 'error' : 'warn', message: g[3]! });
    }
  }
  return out;
}

function enclosingCall(sf: SourceFile, pos: number, K: typeof import('typescript/unstable/ast').SyntaxKind): (SourceFile & { [k: string]: any }) | undefined {
  // TS2554's span starts at the first excess argument: the call that has an argument starting there.
  let found: any;
  const visit = (n: any): void => {
    if (n.pos > pos || n.end < pos) return;
    if (n.kind === K.CallExpression && (n.arguments ?? []).some((a: any) => a.getStart(sf) === pos)) found = n;
    n.forEachChild(visit);
  };
  visit(sf);
  return found;
}

// ------------------------------------------------ the command

export async function check(root: string, opts: CheckOptions, reporter: Reporter): Promise<number> {
  await ready;
  const strict = opts.strict || !!process.env.CI;
  const html = readIndex(root) ?? '';
  const pkg = readPackage(root) ?? {};
  const rel = (f: string): string => (f.startsWith(root + sep) ? f.slice(root.length + 1).split(sep).join('/') : f);
  const ts = await loadTypeScript(root, opts.api !== false);
  if (!ts) {
    reporter.add({ code: 'TS_VERSION_UNSUPPORTED', severity: 'error', message: 'typescript is not installed in this project.', hint: 'npm install -D typescript@~7.0.2' });
    return 1;
  }
  reporter.info(`typescript ${ts.version}`, { typescript: ts.version });
  if (!inRange(ts.version)) {
    reporter.add({ code: 'TS_VERSION_UNSUPPORTED', severity: 'error', message: `typescript ${ts.version} is outside the range jasno is tested with (~${TS_RANGE.major}.${TS_RANGE.minor}.${TS_RANGE.patch}).`, hint: 'npm install -D typescript@~7.0.2' });
    return 1;
  }

  const entries = entryFiles(root, html);
  // Browser files (check 3): the index.html entry's closure (either condition set) plus every non-test file under src/.
  const closure = [DEV_CONDITIONS, prodConditions()].flatMap((c) => [...walk(entries, root, c).mods.values()])
    .filter((m) => m.owner.kind === 'app' && /\.m?ts$/.test(m.file) && !m.file.endsWith('.d.ts')).map((m) => m.file);
  const browser = [...new Set([...browserModules(root), ...entries, ...closure])];
  const declarations = filesUnder(join(root, 'src')).filter((f) => f.endsWith('.d.ts'));
  const nodeFiles = [
    ...filesUnder(join(root, 'src')).filter(isTestFile),
    ...filesUnder(join(root, 'e2e')).filter((f) => /\.m?ts$/.test(f)),
    ...filesUnder(root).filter((f) => dirname(f) === root && /\.config\.m?ts$/.test(f)),
  ];
  const problems: Problem[] = [];
  const mapAt = importMapIndex(html);
  if (mapAt >= 0) {
    problems.push({ code: 'IMPORT_MAP_HANDWRITTEN', severity: 'error', message: 'index.html contains a <script type="importmap">; jasno dev and jasno dist generate the import map.', hint: 'Delete it and keep the <!--jasno:head--> slot.', file: join(root, 'index.html'), ...lineCol(html, mapAt) });
  }
  problems.push(...entryProblems(root, html));
  problems.push(...syntaxGate([...browser, ...nodeFiles]));
  const withAst = !!(ts.sync && ts.ast);
  const nodeSet = new Set(nodeFiles);
  for (const f of browser) problems.push(...importRules(root, pkg, f, true, withAst));
  for (const f of nodeFiles) problems.push(...importRules(root, pkg, f, false, withAst));

  const configs = [join(root, 'tsconfig.json'), join(root, 'tsconfig.test.json')].filter((f) => existsSync(f));
  let browserProgramFiles: readonly string[] | undefined;
  let tsFirst = false;
  if (ts.sync && ts.ast) {
    const api = new ts.sync.API({ cwd: root });
    try {
      const snap = api.updateSnapshot({ openProjects: configs });
      const programs = new Map<string, Program>();
      for (const cfg of configs) {
        const project = snap.getProject(cfg);
        if (!project) {
          problems.push({ code: 'TSCONFIG_DRIFT', severity: 'error', message: 'TypeScript could not load this config as a project, so it was not checked.', file: cfg });
          continue;
        }
        const program = project.program;
        programs.set(cfg, program);
        if (cfg.endsWith('tsconfig.json')) browserProgramFiles = program.getSourceFileNames();
        const diags = [...program.getConfigFileParsingDiagnostics(), ...program.getProgramDiagnostics(), ...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()];
        const isTest = cfg.endsWith('tsconfig.test.json');
        for (const d of diags) {
          // A browser module a test imports is checked by the test program with Node types too; its errors
          // there are not the browser program's (setTimeout(): Timeout, C1 in reverse).
          if (isTest && d.fileName && !nodeSet.has(d.fileName)) continue;
          const p = fromTs(d, root, rel);
          if (!p) continue;
          if (d.code === 2554 && d.fileName) {
            const sf = program.getSourceFile(d.fileName);
            const call = sf && enclosingCall(sf, d.pos, ts.ast.SyntaxKind);
            if (call && call.expression.kind === ts.ast.SyntaxKind.Identifier && /^[A-Z]/.test(call.expression.text)) {
              const t = project.checker.getTypeAtLocation(call.expression);
              if (t && /=> Node$/.test(project.checker.typeToString(t))) p.message += ' jasno: children go in the props object (Card({ title, children: [...] })).';
            }
          }
          if (d.code === 7022) tsFirst = true;
          problems.push(p);
        }
      }
      const css: CssTemplate[] = [];
      const browserProgram = programs.get(join(root, 'tsconfig.json'));
      const testProgram = programs.get(join(root, 'tsconfig.test.json'));
      for (const [files, program, isBrowser] of [[browser, browserProgram, true], [nodeFiles, testProgram, false]] as const) {
        if (!program) continue;
        for (const file of files) {
          const sf = program.getSourceFile(file);
          if (!sf) continue;
          const ctx = { file, root, text: textOf(file), browser: isBrowser, entry: entries.includes(file) };
          const checker = snap.getProject(isBrowser ? join(root, 'tsconfig.json') : join(root, 'tsconfig.test.json'))!.checker;
          const r = fileRules(sf, ctx, ts.ast, checker);
          problems.push(...r.problems);
          if (isBrowser) css.push(...r.css);
          problems.push(...typeRules(sf, ctx, ts.ast, checker, isBrowser));
        }
      }
      if (browserProgram) {
        for (const file of declarations) {
          const sf = browserProgram.getSourceFile(file);
          if (sf) problems.push(...referenceRule(sf, { file, root, text: textOf(file), browser: true, entry: false }));
        }
      }
      problems.push(...focusStyleRule(css));
    } finally {
      api.close();
    }
  } else {
    problems.push({ code: 'TYPE_RULES_UNAVAILABLE', severity: 'warn', message: `The TypeScript API did not load (${ts.error}); tsc ran as a subprocess, and the rules that need the syntax tree or types were skipped.`, hint: 'Reinstall typescript@~7.0.2; the warning fails the check under --strict or CI.' });
    for (const cfg of configs) {
      const r = spawnSync(process.execPath, [ts.tsc, '--pretty', 'false', '--noEmit', '-p', cfg], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      problems.push(...fromTscOutput(r.stdout, root).filter((p) => !p.file || p.file.startsWith(root + sep)));
      if (cfg.endsWith('tsconfig.json')) {
        const list = spawnSync(process.execPath, [ts.tsc, '--listFilesOnly', '-p', cfg], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        browserProgramFiles = list.stdout.split('\n').map((l) => l.trim()).filter(Boolean).map((f) => resolve(root, f));
      }
    }
  }
  // A tsconfig.test.json is needed once there are test or e2e files ((c) TSCONFIG_DRIFT); a config file alone does not count.
  problems.push(...drift(root, pkg, nodeFiles.filter((f) => !(dirname(f) === root && /\.config\.m?ts$/.test(f))), browserProgramFiles));

  // TS7022 on the router export: the COMPONENT_RETURN_TYPE findings first, the downstream implicit-any dropped.
  let list = problems;
  if (tsFirst) {
    const cyclic = new Set(problems.filter((p) => p.code === 'TS7022').map((p) => p.file));
    list = [
      ...problems.filter((p) => p.code === 'COMPONENT_RETURN_TYPE'),
      ...problems.filter((p) => p.code !== 'COMPONENT_RETURN_TYPE' && !(p.code === 'TS7006' && cyclic.has(p.file))),
    ];
  } else {
    const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
    list = [...problems].sort((a, b) => byCodePoint(a.file ?? '', b.file ?? '') || (a.line ?? 0) - (b.line ?? 0) || (a.col ?? 0) - (b.col ?? 0));
  }
  for (const p of list) reporter.add(p);
  const errors = reporter.problems.filter((p) => p.severity === 'error').length;
  const warnings = reporter.problems.length - errors;
  reporter.info(`jasno check: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}${warnings && !strict ? ' (warnings fail only under --strict or CI)' : ''}.`, { errors, warnings });
  return reporter.exitCode(strict);
}
