// jasno explain CODE (design.md (e)): errors/CODE.md when it exists, else the catalogue rows from errors/index.json
// (generated from design.md (c) by tools/gen-errors.mjs). Works offline and outside a project.
import { readFileSync } from 'node:fs';

interface Row { source: string; severity?: string; when?: string; message?: string; hint?: string; build?: string; tool?: string }
export interface Entry { code: string; rows: Row[] }

const ERRORS = new URL('../errors/', import.meta.url);
const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const indexFile = (): { generatedFrom: string; codes: Record<string, Entry> } =>
  JSON.parse(readFileSync(new URL('index.json', ERRORS), 'utf8')) as { generatedFrom: string; codes: Record<string, Entry> };

export const catalogue = (): Record<string, Entry> => indexFile().codes;

const doc = (code: string): string | undefined => {
  try { return readFileSync(new URL(`${code}.md`, ERRORS), 'utf8'); } catch { return undefined; }
};

/** The catalogue key for user input: exact, upper-cased, case-insensitive, then TS1234 → TS<number>. */
function lookup(codes: Record<string, Entry>, raw: string): { key: string; code: string } | undefined {
  const code = /^\d+$/.test(raw) ? `TS${raw}` : raw.toUpperCase();
  const key = [raw, code, ...Object.keys(codes).filter((k) => k.toUpperCase() === code)].find((k) => codes[k]);
  if (key) return { key, code: key };
  if (/^TS\d+$/.test(code) && codes['TS<number>']) return { key: 'TS<number>', code };
  return undefined;
}

export function explain(args: { code?: string | undefined; list: boolean; json: boolean }, out: (s: string) => void = (s) => console.log(s)): number {
  const codes = catalogue();
  if (args.list || !args.code) {
    if (args.json) { out(JSON.stringify(indexFile())); return 0; }
    if (!args.list) { out('usage: jasno explain <CODE> | --list [--json]'); return 1; }
    for (const e of Object.values(codes).sort((a, b) => byCodePoint(a.code, b.code))) {
      const r = e.rows[0]!;
      out(`${e.code.padEnd(28)} ${(r.severity ?? '').padEnd(14)} ${r.when ?? ''}`);
    }
    return 0;
  }
  const hit = lookup(codes, args.code);
  if (!hit) {
    const code = args.code.toUpperCase();
    const near = Object.keys(codes).filter((c) => c.includes(code) || code.includes(c)).slice(0, 5);
    const message = `jasno explain: unknown code "${args.code}".${near.length ? ` Did you mean ${near.join(', ')}?` : ' jasno explain --list prints every code.'}`;
    out(args.json ? JSON.stringify({ severity: 'error', message }) : message);
    return 1;
  }
  const entry = codes[hit.key]!;
  if (args.json) { out(JSON.stringify({ code: hit.code, rows: entry.rows, doc: doc(hit.code) ?? null })); return 0; }
  const md = doc(hit.code);
  if (md) { out(md.replace(/^<!--[\s\S]*?-->\n?/gm, '').trim()); return 0; } // the generator's markers and spec refs
  const blocks = entry.rows.map((r) => {
    const lines = [`${hit.code} (${r.severity ?? '?'}; ${r.source}${r.build ? `, ${r.build}` : ''}${r.tool ? `, ${r.tool}` : ''})`];
    if (r.when) lines.push(`When: ${r.when}`);
    if (r.message) lines.push(`Message: ${r.message}`);
    if (r.hint) lines.push(`Fix: ${r.hint}`);
    return lines.join('\n');
  });
  if (hit.code.startsWith('TS') && hit.key === 'TS<number>' && hit.code !== 'TS<number>') blocks.push('This is a TypeScript diagnostic: see the message text; jasno check rewrites a few of them (design.md (c)).');
  out(blocks.join('\n\n'));
  return 0;
}
