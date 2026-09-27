// Generates errors/index.json (the catalogue jasno explain prints) from design.md section (c): one entry per code
// with its table (runtime, jasno/testing, CLI) and columns. Run: node tools/gen-errors.mjs
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
mkdirSync(new URL('../errors/', import.meta.url), { recursive: true });
writeFileSync(new URL('../errors/index.json', import.meta.url), JSON.stringify({ generatedFrom: 'design/design.md (c)', codes }, null, 2) + '\n');
console.log(`errors/index.json: ${Object.keys(codes).length} codes`);
