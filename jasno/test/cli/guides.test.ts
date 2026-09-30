// errors/<CODE>.md, the repair guides jasno explain prints and diagnostics link to (phase-3 criterion 5): one per
// catalogue code, the generated header current, Fix, Example and Fixture written, the fixture a test whose body
// asserts the code, and every ts example compiling against jasno.d.ts (a block tagged `ts no-check` is skipped:
// examples of code tsc itself rejects).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { JASNO } from './fixture.ts';

interface Entry { code: string; rows: unknown[] }
const gen = (await import('../../tools/gen-errors.mjs' as string)) as { codes: Record<string, Entry>; header(e: Entry): string };
const guides = Object.values(gen.codes).filter((e) => !e.code.includes('<'));
const read = (code: string): string => readFileSync(join(JASNO, 'errors', `${code}.md`), 'utf8');
const section = (md: string, name: string): string => new RegExp(`^## ${name}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(md)?.[1]?.trim() ?? '';

test('every catalogue code has errors/<CODE>.md, opening with the header the catalogue generates', () => {
  const stale = guides.filter((e) => !existsSync(join(JASNO, 'errors', `${e.code}.md`)) || !read(e.code).startsWith(`${gen.header(e)}\n`));
  assert.deepEqual(stale.map((e) => e.code), [], 'run node tools/gen-errors.mjs');
});

test('every guide explains the problem and fills Fix, Example and Fixture', () => {
  const missing: string[] = [];
  for (const e of guides) {
    const md = read(e.code);
    const intro = md.slice(md.indexOf('<!-- /generated:catalogue -->') + 29, md.indexOf('\n## ')).trim();
    for (const [name, text] of [['intro', intro], ['Fix', section(md, 'Fix')], ['Example', section(md, 'Example')], ['Fixture', section(md, 'Fixture')]]) {
      if (!text) missing.push(`${e.code}: ${name}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every fixture names a test whose body asserts the code (each line, when a code has several)', () => {
  const bad: string[] = [];
  for (const e of guides) {
    const lines = [...section(read(e.code), 'Fixture').matchAll(/^`([^`]+)` › (.+)$/gm)];
    if (!lines.length) bad.push(`${e.code}: no "\`file\` › test title" line`);
    for (const m of lines) {
      const file = join(JASNO, m[1]!);
      if (!existsSync(file)) { bad.push(`${e.code}: ${m[1]} does not exist`); continue; }
      const src = readFileSync(file, 'utf8').replaceAll("\\'", "'");
      const at = src.indexOf(m[2]!.trim());
      const start = src.lastIndexOf('\ntest(', at);
      if (at < 0 || start < 0 || src.slice(start + 1, at).includes('\n')) { bad.push(`${e.code}: no test titled "${m[2]}" in ${m[1]}`); continue; }
      const end = src.indexOf('\ntest(', at);
      if (!src.slice(start, end < 0 ? undefined : end).includes(e.code)) bad.push(`${e.code}: "${m[2]}" does not mention ${e.code}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every ts example compiles against jasno.d.ts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jasno-guides-'));
  try {
    const files: string[] = [];
    for (const e of guides) {
      let i = 0;
      for (const m of read(e.code).matchAll(/^```ts([^\n]*)\n([\s\S]*?)^```/gm)) {
        if (m[1]!.includes('no-check')) continue;
        const name = `${e.code}-${++i}.ts`;
        writeFileSync(join(dir, name), `${m[2]}\nexport {};\n`);
        files.push(name);
      }
    }
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'es2025', module: 'nodenext', moduleResolution: 'nodenext', lib: ['es2025', 'dom'], types: ['node'],
        typeRoots: [join(JASNO, 'node_modules', '@types')], strict: true, noEmit: true, allowImportingTsExtensions: true,
        erasableSyntaxOnly: true, verbatimModuleSyntax: true, exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, skipLibCheck: true,
      },
      include: [join(JASNO, '..', 'design', 'jasno.d.ts'), ...files],
    }));
    writeFileSync(join(dir, 'package.json'), '{ "type": "module" }');
    const r = spawnSync(join(JASNO, 'node_modules', '.bin', 'tsc'), ['-p', dir], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
