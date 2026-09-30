// Generates errors/index.json (the catalogue jasno explain prints) from design.md section (c): one entry per code
// with its table (runtime, jasno/testing, CLI) and columns, and the generated header of every errors/<CODE>.md.
// Run: node tools/gen-errors.mjs (importing it writes nothing).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const md = readFileSync(new URL('../../design/design.md', import.meta.url), 'utf8');
const section = md.slice(md.indexOf('## (c) Diagnostics catalogue'), md.indexOf('## (d)'));
const cells = (line) => line.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replaceAll('\\|', '|'));
const plain = (s) => s.replace(/`([^`]*)`/g, '$1');
const codes = {};
for (const part of section.split(/^### /m).slice(1)) {
  const source = plain(part.slice(0, part.indexOf('\n')).trim());
  const rows = part.split('\n').filter((l) => l.startsWith('|'));
  const header = cells(rows[0]).map((h) => h.toLowerCase());
  for (const row of rows.slice(2)) {
    const values = cells(row);
    const entry = { source };
    header.forEach((h, i) => { if (h !== 'code') entry[h === 'message template' ? 'message' : h] = plain(values[i] ?? ''); });
    // A code listed in two tables (SIGNAL_COERCED: runtime TypeError and check rule) keeps both rows.
    for (const m of values[0].matchAll(/`([A-Z][A-Z0-9_<>a-z]*)`/g)) (codes[m[1]] ??= { code: m[1], rows: [] }).rows.push(entry);
  }
}
export { codes };

// errors/<CODE>.md, the repair guide jasno explain prints and diagnostics link to: the top region is generated from the
// same rows (so a table edit cannot leave a stale guide); the body below it is written by hand. A missing guide is
// created with empty sections. TS<number> (tsc's own codes) has no guide.
export const START = '<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->';
export const END = '<!-- /generated:catalogue -->';
const SPEC_REF = /\s*\(((?:B\d+(?:\.\d+)?|ADR-\d+|C\d|M\d+|U-[A-Z]+\d+|CL-\d+)(?:,\s*(?:B\d+(?:\.\d+)?|ADR-\d+|C\d|M\d+|U-[A-Z]+\d+|CL-\d+))*)\)/g;
export function header(entry) {
  const refs = [];
  const lines = [START, `# ${entry.code}`, ''];
  for (const r of entry.rows) {
    const when = r.when.replace(SPEC_REF, (_, ref) => { refs.push(ref); return ''; });
    // 'dev', 'dev + prod', and either with a parenthetical note ('dev (the reload happens in both builds)').
    const [, build = '', note] = /^(dev \+ prod|dev)\s*(?:\((.*)\))?$/.exec(r.build ?? '') ?? [];
    const where = r.source === 'Runtime' ? `runtime, ${build === 'dev' ? 'dev builds' : 'dev and production builds'}${note ? ` (${note})` : ''}`
      : r.source === 'jasno/testing' ? 'jasno/testing' : `reported by jasno ${r.tool.split(/,\s*/).join(', jasno ')}`;
    lines.push(`**${r.severity}**, ${where}: ${when}.`, '');
    if (r.message) lines.push(`- Message: \`${r.message}\``);
    if (r.hint) lines.push(`- Hint: ${r.hint}`);
    if (r.message || r.hint) lines.push('');
  }
  if (refs.length) lines.push(`<!-- design.md: ${[...new Set(refs)].join(', ')} -->`);
  lines.push(END);
  return lines.join('\n');
}
const BODY = '\n\n## Fix\n\n## Example\n\n## Fixture\n';
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  mkdirSync(new URL('../errors/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../errors/index.json', import.meta.url), JSON.stringify({ generatedFrom: 'design/design.md (c)', codes }, null, 2) + '\n');
  console.log(`errors/index.json: ${Object.keys(codes).length} codes`);
  let created = 0;
  for (const entry of Object.values(codes)) {
    if (entry.code.includes('<')) continue;
    const file = new URL(`../errors/${entry.code}.md`, import.meta.url);
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { text = START + END + BODY; created++; }
    const a = text.indexOf(START), b = text.indexOf(END);
    if (a !== 0 || b < 0) throw new Error(`errors/${entry.code}.md: the generated region must open the file`);
    writeFileSync(file, header(entry) + text.slice(b + END.length));
  }
  console.log(`errors/<CODE>.md: ${Object.keys(codes).filter((c) => !c.includes('<')).length} guides (${created} created)`);
}
