// jasno explain and the catalogue it prints (errors/index.json, generated from design.md (c)).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { catalogue, explain } from '../../cli/explain.ts';

const run = (args: Parameters<typeof explain>[0]) => {
  const out: string[] = [];
  return { code: explain(args, (s) => out.push(s)), out: out.join('\n') };
};

test('explain CODE prints the catalogue entry (case-insensitive); TS codes map to TS<number>', () => {
  const r = run({ code: 'focus_lost', list: false, json: false });
  assert.equal(r.code, 0);
  assert.match(r.out, /^FOCUS_LOST \(warn; Runtime, dev\)\nWhen: /);
  assert.match(r.out, /\nFix: Keep the control enabled/);
  assert.match(run({ code: 'TS2835', list: false, json: false }).out, /^TS2835 \(error;/);
  const json = JSON.parse(run({ code: 'SETTLE_TIMEOUT', list: false, json: true }).out) as { code: string; rows: { source: string }[] };
  assert.deepEqual([json.code, json.rows[0]!.source], ['SETTLE_TIMEOUT', 'jasno/testing']);
});

test('an unknown code fails and suggests near names', () => {
  const r = run({ code: 'FOCUS', list: false, json: false });
  assert.equal(r.code, 1);
  assert.match(r.out, /Did you mean .*FOCUS_LOST/);
});

test('--list prints every code; --json the whole catalogue', () => {
  const codes = catalogue();
  assert.equal(run({ list: true, json: false }).out.split('\n').length, Object.keys(codes).length);
  assert.deepEqual(Object.keys((JSON.parse(run({ list: true, json: true }).out) as { codes: object }).codes), Object.keys(codes));
});

test('every code the runtime and the CLI emit is in the catalogue', () => {
  const codes = catalogue();
  const emitted = new Set<string>();
  for (const dir of ['src', 'cli']) {
    for (const f of readdirSync(new URL(`../../${dir}/`, import.meta.url))) {
      if (!f.endsWith('.ts')) continue;
      const text = readFileSync(new URL(`../../${dir}/${f}`, import.meta.url), 'utf8');
      for (const m of text.matchAll(/(?:warn|JasnoError)\(\s*'([A-Z][A-Z0-9_]+)'/g)) emitted.add(m[1]!);
      // `code: 'X'` and `code: cond ? 'X' : 'Y'`
      for (const m of text.matchAll(/\bcode: ([^,}\n]*)/g)) for (const c of m[1]!.matchAll(/'([A-Z][A-Z0-9_]+)'/g)) emitted.add(c[1]!);
    }
  }
  assert.ok(emitted.size > 40);
  const missing = [...emitted].filter((c) => !codes[c]).sort();
  assert.deepEqual(missing, []);
});
