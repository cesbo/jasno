// Conformance: the CLI's general output contract (design.md (e) intro: exit codes, one line per problem
// `file:line:col CODE message`, --json one object per line, `/` separators; (f): writes go to dist/ and .jasno/ only)
// and `jasno explain` against the catalogue in design.md (c).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after, test } from 'node:test';
import { check } from '../../../cli/check.ts';
import { catalogue, explain } from '../../../cli/explain.ts';
import { main } from '../../../cli/main.ts';
import { Reporter } from '../../../cli/report.ts';
import { INDEX, JASNO, link, project, reporter } from '../fixture.ts';

delete process.env.CI; // warnings must not fail because the test runs in CI

const BIN = join(JASNO, 'bin', 'jasno.js');
const cleanup: (() => void)[] = [];
after(() => { for (const f of cleanup) f(); });

function app(files: Record<string, string>): string {
  const p = project(files);
  cleanup.push(p.remove);
  return p.root;
}

function bare(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'jasno-nopkg-')));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** main() with console.log / console.error captured. */
async function run(argv: string[], cwd?: string): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const { log, error } = console;
  console.log = (...a: unknown[]) => { out.push(a.join(' ')); };
  console.error = (...a: unknown[]) => { err.push(a.join(' ')); };
  try { return { code: await main(argv, cwd), out, err }; } finally { console.log = log; console.error = error; }
}

function bin(args: string[], cwd: string, env: Record<string, string> = {}): { status: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

const lines = (s: string): string[] => s.split('\n').filter(Boolean);
const isJson = (l: string): boolean => { try { return typeof JSON.parse(l) === 'object'; } catch { return false; } };

/** Every file under dir except node_modules, with its size and mtime (what a command wrote). */
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) visit(p);
      else { const s = statSync(p); out[relative(dir, p)] = `${s.size}@${s.mtimeMs}`; }
    }
  };
  visit(dir);
  return out;
}

const PKG = JSON.stringify({ name: 'app', type: 'module', dependencies: { jasno: '*' } });
const MAIN = "import { mount } from '@jasno/core';\nexport { mount };\n";
const OPTIONS = {
  target: 'es2025', module: 'nodenext', moduleResolution: 'nodenext', lib: ['es2025', 'dom'], types: [],
  strict: true, noEmit: true, allowImportingTsExtensions: true, erasableSyntaxOnly: true, verbatimModuleSyntax: true,
  exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, skipLibCheck: true,
};

// ------------------------------------------------ exit codes and arguments

test('exit codes: help 0; no command, unknown command, unknown or stray option, bad values 1', async () => {
  const root = app({ 'package.json': PKG, 'index.html': INDEX, 'src/main.ts': MAIN });
  const codes: Record<string, number> = {};
  for (const argv of [
    [], ['--help'], ['-h'], ['help'], ['check', '--help'], ['explain', '--help'], ['nope'], ['check', '--nope'], ['dist', '--port', '1'],
    ['check', 'stray'], ['dev', '--port', '99999'], ['preview', '--port', 'x'], ['dist', '--keep', '-1'], ['dist', '--keep', '1.5'],
  ]) codes[argv.join(' ')] = (await run(argv, root)).code;
  assert.deepEqual(codes, {
    '': 1, '--help': 0, '-h': 0, help: 0, 'check --help': 0, 'explain --help': 0, nope: 1, 'check --nope': 1, 'dist --port 1': 1,
    'check stray': 1, 'dev --port 99999': 1, 'preview --port x': 1, 'dist --keep -1': 1, 'dist --keep 1.5': 1,
  });
});

test('a directory without package.json fails every project command with exit 1 and one message on stderr', async () => {
  const dir = bare();
  for (const cmd of ['check', 'dev', 'dist', 'preview']) {
    const r = await run([cmd], dir);
    assert.equal(r.code, 1, cmd);
    assert.deepEqual(r.out, [], cmd);
    assert.match(r.err.join('\n'), /No package\.json/, cmd);
  }
});

test('a package.json that is not valid JSON is reported as invalid, not as missing', async () => {
  const root = app({ 'package.json': '{ "name": "app", ', 'index.html': INDEX });
  const r = await run(['dist', '--list'], root);
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.err.join('\n'), /No package\.json/);
  assert.match(r.err.join('\n'), /JSON|invalid|parse/i);
});

test('success 0, failure 1: dist --list on a clean project, dist with a problem', async () => {
  const ok = app({ 'package.json': PKG, 'index.html': INDEX, 'src/main.ts': MAIN });
  assert.equal((await run(['dist', '--list'], ok)).code, 0);
  const bad = app({ 'package.json': PKG, 'index.html': INDEX, 'src/main.ts': "import './nope.ts';\n" });
  assert.equal((await run(['dist'], bad)).code, 1);
  assert.ok(!existsSync(join(bad, 'dist')));
});

// ------------------------------------------------ problem lines and --json

test('a problem line is `file:line:col CODE message` with a root-relative / path; --json prints the same as one object', () => {
  const root = realpathSync(tmpdir());
  const p = { code: 'X_CODE', severity: 'error' as const, message: 'went wrong.', hint: 'fix it.', file: join(root, 'src', 'a', 'b.ts'), line: 3, col: 7 };
  const text: string[] = [];
  new Reporter(root, false, (l) => text.push(l)).add(p);
  assert.deepEqual(text, ['src/a/b.ts:3:7 X_CODE went wrong. hint: fix it.']);
  const json: string[] = [];
  const r = new Reporter(root, true, (l) => json.push(l));
  r.add(p);
  r.add(p); // printed once
  r.info('done', { n: 1 });
  assert.equal(json.length, 2);
  assert.deepEqual(JSON.parse(json[0]!), { code: 'X_CODE', severity: 'error', message: 'went wrong.', hint: 'fix it.', file: 'src/a/b.ts', line: 3, col: 7 });
  assert.deepEqual(JSON.parse(json[1]!), { info: 'done', n: 1 });
});

test('end to end through main(): MODULE_NOT_FOUND as src/main.ts:1:col, and as JSON lines with --json', async () => {
  const root = app({ 'package.json': PKG, 'index.html': INDEX, 'src/main.ts': "import './nope.ts';\n" });
  const text = await run(['dist'], root);
  assert.ok(text.out.some((l) => /^src\/main\.ts:1:\d+ MODULE_NOT_FOUND /.test(l)), text.out.join('\n'));
  const json = await run(['dist', '--json'], root);
  assert.equal(json.code, 1);
  assert.ok(json.out.length > 0 && json.out.every(isJson), json.out.join('\n'));
  const p = json.out.map((l) => JSON.parse(l) as Record<string, unknown>).find((o) => o.code === 'MODULE_NOT_FOUND');
  assert.deepEqual([p?.file, p?.line, p?.severity], ['src/main.ts', 1, 'error']);
});

test('problem paths are relative with / also for files above the project root (a dependency hoisted by npm workspaces)', async () => {
  const ws = app({
    'node_modules/cjs/package.json': JSON.stringify({ name: 'cjs', version: '1.0.0', main: 'index.js' }),
    'node_modules/cjs/index.js': 'module.exports = 1;\n',
    'packages/web/package.json': JSON.stringify({ name: 'web', type: 'module', dependencies: { cjs: '1.0.0' } }),
    'packages/web/index.html': INDEX,
    'packages/web/src/main.ts': "import x from 'cjs';\nexport { x };\n",
  });
  const r = await run(['dist', '--json'], join(ws, 'packages', 'web'));
  const p = r.out.map((l) => JSON.parse(l) as Record<string, unknown>).find((o) => o.code === 'DEP_NOT_BROWSER_ESM');
  assert.ok(p, r.out.join('\n'));
  assert.equal(p.file, '../../node_modules/cjs/index.js');
});

// ------------------------------------------------ bin/jasno.js as a child process

test('bin/jasno.js in a project: dist --list exits 0, stdout only; --json makes every stdout line an object', () => {
  const root = app({ 'package.json': PKG, 'index.html': INDEX, 'src/main.ts': MAIN });
  const r = bin(['dist', '--list'], root);
  assert.equal(r.status, 0, r.err);
  assert.equal(r.err, '');
  assert.ok(lines(r.out).some((l) => /^dist\/src\/main\.[0-9A-Z]{8}\.js {2}<- src\/main\.ts$/.test(l)), r.out); // bundled by default
  const j = bin(['dist', '--list', '--json'], root);
  assert.equal(j.status, 0);
  assert.ok(lines(j.out).length > 0 && lines(j.out).every(isJson));
});

test('bin/jasno.js without package.json: check exits 1 with a stderr message; explain works there (offline, no project)', () => {
  const dir = bare();
  const c = bin(['check'], dir);
  assert.equal(c.status, 1);
  assert.equal(c.out, '');
  assert.match(c.err, /^jasno check: No package\.json/);
  const e = bin(['explain', 'focus_lost'], dir);
  assert.equal(e.status, 0, e.err);
  assert.match(e.out, /^# FOCUS_LOST\n/); // the repair guide
  assert.equal(e.err, '');
  assert.equal(bin(['explain', '--list'], dir).status, 0);
});

test('bin/jasno.js hides ExperimentalWarning and still prints other warnings', () => {
  const dir = bare();
  // Fires after bin/jasno.js has installed its handler (the timer keeps the process alive until then).
  writeFileSync(join(dir, 'late.mjs'), "setTimeout(() => { process.emitWarning('probe-experimental', 'ExperimentalWarning'); process.emitWarning('probe-other'); }, 1000);\n");
  const r = spawnSync(process.execPath, ['--import', './late.mjs', BIN, 'explain', 'FOCUS_LOST'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /probe-experimental/);
  assert.match(r.stderr, /probe-other/);
});

test('--json output is JSON lines on every path, including fatal errors (no package.json, unknown option, unknown explain code)', () => {
  const dir = bare();
  const root = app({ 'package.json': PKG, 'index.html': INDEX, 'src/main.ts': MAIN });
  const bad: string[] = [];
  for (const [args, cwd] of [[['check', '--json'], dir], [['dist', '--json', '--nope'], root], [['explain', 'NOPE', '--json'], dir]] as const) {
    const r = bin([...args], cwd);
    assert.equal(r.status, 1);
    const all = [...lines(r.out), ...lines(r.err)];
    if (!all.length || !all.every(isJson)) bad.push(`${args.join(' ')}: ${JSON.stringify(all)}`);
  }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------ writes: dist/ and .jasno/ only

test('check, dist --list and explain write nothing; dist writes only under dist/', async () => {
  const root = app({
    'package.json': PKG, 'index.html': INDEX, 'src/main.ts': MAIN,
    'tsconfig.json': JSON.stringify({ compilerOptions: OPTIONS, include: [join(JASNO, '..', 'design', 'jasno.d.ts'), 'src'] }),
  });
  link(root, 'typescript');
  const before = tree(root);
  for (const argv of [['check'], ['dist', '--list'], ['explain', '--list']]) {
    await run(argv, root);
    assert.deepEqual(tree(root), before, argv.join(' '));
  }
  assert.equal((await run(['dist'], root)).code, 0);
  const added = Object.keys(tree(root)).filter((f) => !(f in before));
  assert.ok(added.length > 0 && added.every((f) => f.startsWith('dist/')), added.join('\n'));
  assert.deepEqual(Object.fromEntries(Object.entries(tree(root)).filter(([f]) => !f.startsWith('dist/'))), before);
});

test('check without the TS API (tsc subprocess) writes nothing, even when tsconfig.json lacks noEmit', async () => {
  const { noEmit: _, ...emitting } = OPTIONS;
  const root = app({ 'package.json': PKG, 'index.html': INDEX, 'src/main.ts': 'export const a: number = 1;\n', 'tsconfig.json': JSON.stringify({ compilerOptions: emitting, include: ['src'] }) });
  link(root, 'typescript');
  const before = tree(root);
  const r = reporter(root);
  assert.equal(await check(root, { strict: false, api: false }, r.reporter), 1); // TSCONFIG_DRIFT for noEmit
  assert.deepEqual(tree(root), before);
});

// ------------------------------------------------ jasno explain and the catalogue (design.md (c))

const DESIGN = readFileSync(join(JASNO, '..', 'design', 'design.md'), 'utf8');
const SECTION = DESIGN.slice(DESIGN.indexOf('## (c) Diagnostics catalogue'), DESIGN.indexOf('## (d)'));
interface Row { table: string; codes: string[]; fields: Record<string, string> }
const ROWS: Row[] = [];
for (const part of SECTION.split(/^### /m).slice(1)) {
  const table = part.slice(0, part.indexOf('\n')).trim();
  const md = part.split('\n').filter((l) => l.startsWith('|'));
  const cells = (l: string): string[] => l.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replaceAll('\\|', '|'));
  const header = cells(md[0]!).map((h) => (h.toLowerCase() === 'message template' ? 'message' : h.toLowerCase()));
  for (const l of md.slice(2)) {
    const v = cells(l);
    const fields: Record<string, string> = {};
    header.forEach((h, i) => { if (i > 0) fields[h] = (v[i] ?? '').replace(/`([^`]*)`/g, '$1'); });
    ROWS.push({ table, codes: [...v[0]!.matchAll(/`([^`]+)`/g)].map((m) => m[1]!), fields });
  }
}
const ROW_COUNT = new Map<string, number>();
for (const r of ROWS) for (const c of r.codes) ROW_COUNT.set(c, (ROW_COUNT.get(c) ?? 0) + 1);

const ex = (args: Parameters<typeof explain>[0]): { code: number; out: string } => {
  const out: string[] = [];
  return { code: explain(args, (s) => out.push(s)), out: out.join('\n') };
};
const entryOf = (code: string): Record<string, unknown> => JSON.parse(ex({ code, list: false, json: true }).out) as Record<string, unknown>;

/** Row cells that differ from the entry `get` returns for each of the row's codes (the catalogue or explain --json). */
function mismatches(rows: readonly Row[], only: (code: string) => boolean, get: (code: string) => Record<string, unknown> | string): string[] {
  const bad: string[] = [];
  for (const row of rows) {
    for (const code of row.codes.filter(only)) {
      const got = get(code);
      if (typeof got === 'string') { bad.push(`${code}: ${got}`); continue; }
      // One row per table the code is listed in (SIGNAL_COERCED has two).
      const table = row.table.replace(/`/g, '');
      const e = (got.rows as Record<string, unknown>[]).find((r) => r.source === table);
      if (!e) { bad.push(`${code}: no row for ${table}`); continue; }
      for (const [k, want] of Object.entries(row.fields)) if (e[k] !== want) bad.push(`${code} (${row.table}) ${k}: ${JSON.stringify(e[k])} != ${JSON.stringify(want)}`);
    }
  }
  return bad;
}
const fromCatalogue = (code: string): Record<string, unknown> | string => (catalogue()[code] as unknown as Record<string, unknown> | undefined) ?? 'not in errors/index.json';
const fromExplain = (code: string): Record<string, unknown> | string => {
  const r = ex({ code, list: false, json: true });
  return r.code === 0 ? JSON.parse(r.out) as Record<string, unknown> : `explain failed: ${r.out}`;
};

test('every catalogue row in design.md (c) is an explain entry with that row\'s severity, build/tool, when, message and hint', () => {
  assert.ok(ROWS.length >= 70);
  assert.ok(ROWS.every((r) => r.codes.length > 0));
  for (const c of ['NO_DECORATORS', 'NO_ACCESSOR', 'SIGNAL_IN_TEMPLATE', 'SIGNAL_COERCED', 'TS<number>', 'MODULE_NOT_FOUND']) assert.ok(ROW_COUNT.has(c), c);
  assert.deepEqual(mismatches(ROWS, (c) => ROW_COUNT.get(c) === 1, fromCatalogue), []);
  assert.deepEqual(mismatches(ROWS, (c) => ROW_COUNT.get(c) === 1 && c !== 'TS<number>', fromExplain), []); // TS<number>: tested below
  assert.deepEqual(Object.keys(catalogue()).sort(), [...ROW_COUNT.keys()].sort());
});

test('a code listed in two tables (SIGNAL_COERCED: runtime TypeError and check rule) keeps both rows', () => {
  const multi = [...ROW_COUNT].filter(([, n]) => n > 1).map(([c]) => c);
  assert.deepEqual(multi, ['SIGNAL_COERCED']);
  assert.deepEqual(mismatches(ROWS, (c) => multi.includes(c), fromExplain), []);
});

test('explain: lower-case input; TS codes (TS2835, 2835, ts7022) use the TS<number> entry; unknown codes fail with exit 1', () => {
  assert.equal(entryOf('no_accessor').code, 'NO_ACCESSOR');
  assert.equal(entryOf('signal_in_template').code, 'SIGNAL_IN_TEMPLATE');
  for (const [q, code] of [['TS2835', 'TS2835'], ['2835', 'TS2835'], ['ts7022', 'TS7022']]) {
    const e = entryOf(q!) as { code: string; rows: { when: string }[] };
    assert.deepEqual([e.code, e.rows[0]!.when], [code, catalogue()['TS<number>']!.rows[0]!.when]);
  }
  const unknown = ex({ code: 'NOT_A_CODE', list: false, json: false });
  assert.equal(unknown.code, 1);
  assert.match(unknown.out, /unknown code "NOT_A_CODE"/);
  assert.equal(ex({ list: false, json: false }).code, 1); // no code: usage
});

test('--list prints every catalogue code once, with its severity and when', () => {
  const r = ex({ list: true, json: false });
  assert.equal(r.code, 0);
  const listed = r.out.split('\n').map((l) => l.split(/\s+/)[0]!);
  assert.deepEqual([...listed].sort(), Object.keys(catalogue()).sort());
  for (const l of r.out.split('\n')) {
    const e = catalogue()[l.split(/\s+/)[0]!]!.rows[0]!;
    assert.ok(l.includes(e.severity!) && l.includes(e.when!), l);
  }
});

test('every code --list prints can be explained (TS<number> is upper-cased to TS<NUMBER> and rejected)', () => {
  const r = ex({ list: true, json: false });
  const failing = r.out.split('\n').map((l) => l.split(/\s+/)[0]!).filter((c) => ex({ code: c, list: false, json: false }).code !== 0);
  assert.deepEqual(failing, []);
});

test('--list prints the same order in every locale (it sorts with localeCompare)', () => {
  const dir = bare();
  const c = bin(['explain', '--list'], dir, { LC_ALL: 'C' });
  const lt = bin(['explain', '--list'], dir, { LC_ALL: 'lt_LT.UTF-8' });
  assert.equal(c.status, 0);
  assert.equal(lt.out, c.out);
});

test('--json prints the catalogue errors/index.json (design.md (e) explain)', () => {
  const r = ex({ list: true, json: true });
  assert.equal(r.code, 0);
  assert.equal(r.out.split('\n').length, 1);
  assert.deepEqual(JSON.parse(r.out), JSON.parse(readFileSync(join(JASNO, 'errors', 'index.json'), 'utf8')));
});

test('the repair guide the runtime points at (docs: node_modules/@jasno/core/errors/CODE.md) exists for every code and ships in the package', () => {
  const diag = readFileSync(join(JASNO, 'src', 'diag.ts'), 'utf8');
  assert.match(diag, /node_modules\/@jasno\/core\/errors\/\$\{code\}\.md/);
  const pkg = JSON.parse(readFileSync(join(JASNO, 'package.json'), 'utf8')) as { files?: string[] };
  if (pkg.files) assert.ok(pkg.files.some((f) => f === 'errors' || f.startsWith('errors/')), 'package.json "files" must include errors/');
  const missing = Object.keys(catalogue()).filter((c) => c !== 'TS<number>' && !existsSync(join(JASNO, 'errors', `${c}.md`)));
  assert.deepEqual(missing, []);
});

/** Code literals on non-comment lines of src/ and cli/ ('X_Y', "X_Y" or `X_Y...`), and whether TS codes are built. */
function emitted(): Set<string> {
  const out = new Set<string>();
  for (const dir of ['src', 'cli']) {
    for (const f of readdirSync(join(JASNO, dir))) {
      if (!f.endsWith('.ts')) continue;
      for (const l of readFileSync(join(JASNO, dir, f), 'utf8').split('\n')) {
        const t = l.trim();
        if (t.startsWith('//') || t.startsWith('*')) continue;
        for (const m of l.matchAll(/['"`]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)['"`]/g)) out.add(m[1]!);
        if (/code: `TS\$\{/.test(l)) out.add('TS<number>');
      }
    }
  }
  return out;
}

test('every code literal in src/ and cli/ is in the catalogue; removed codes are neither catalogued nor emitted', () => {
  const codes = catalogue();
  const seen = emitted();
  assert.deepEqual([...seen].filter((c) => !codes[c]).sort(), []);
  for (const gone of ['UNTRACKED_IN_SETUP', 'WRITE_AFTER_DISPOSE', 'ROWS_RECREATED', 'EFFECT_WRITES_OWN_SOURCE', 'NO_ROUTE_MATCH']) {
    assert.ok(!codes[gone] && !seen.has(gone), gone);
  }
});

test('every catalogue code has an emitter in src/ or cli/ (CSP_HASH_STRICT_DYNAMIC has none)', () => {
  const seen = emitted();
  assert.deepEqual(Object.keys(catalogue()).filter((c) => !seen.has(c)), []);
});
