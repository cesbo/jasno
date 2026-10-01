// jasno <command>: check, dev, dist, preview, explain (design.md (e)). Exit 0 on success, 1 on failure.
import { parseArgs } from 'node:util';
import { check } from './check.ts';
import { dev } from './dev.ts';
import { dist } from './dist.ts';
import { explain } from './explain.ts';
import { preview } from './preview.ts';
import { loadProject, ProjectError } from './project.ts';
import { Reporter } from './report.ts';

const USAGE = `usage: jasno <command> [options]
  check     type-check both programs and run jasno's rules   [--strict] [--json]
  dev       local dev server                                 [--port 5173] [--host <addr>] [--json]
  dist      build dist/ (bundled, hashed names)              [--list] [--keep N] [--condition <name>] [--nonce] [--json]
  preview   serve dist/ as a static host would               [--port 4173] [--json]
  explain   print what a diagnostic code means               <CODE> | --list [--json]

  --strict        warnings fail too (CI)
  --condition     an extra condition for the app's package.json "imports" only (#api -> the mock with
                  development); jasno itself ships its production build, so window.__JASNO__ is undefined`;

const COMMON = { json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } as const;
const OPTIONS = {
  check: { ...COMMON, strict: { type: 'boolean' } },
  dev: { ...COMMON, port: { type: 'string' }, host: { type: 'string' } },
  dist: { ...COMMON, list: { type: 'boolean' }, keep: { type: 'string' }, condition: { type: 'string', multiple: true }, nonce: { type: 'boolean' } },
  preview: { ...COMMON, port: { type: 'string' } },
  explain: { ...COMMON, list: { type: 'boolean' } },
} as const;

type Command = keyof typeof OPTIONS;

export async function main(argv: readonly string[], cwd = process.cwd()): Promise<number> {
  const [cmd, ...rest] = argv;
  // With --json every line is JSON, fatal errors included (one {severity, message} object on stdout).
  const json = rest.includes('--json');
  const fail = (message: string, usage = false): number => {
    if (json) console.log(JSON.stringify({ severity: 'error', message }));
    else console.error(usage ? `${message}\n${USAGE}` : message);
    return 1;
  };
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { console.log(USAGE); return cmd ? 0 : 1; }
  if (!Object.hasOwn(OPTIONS, cmd)) return fail(`jasno: unknown command "${cmd}"`, true);
  let parsed;
  try {
    parsed = parseArgs({ args: [...rest], options: OPTIONS[cmd as Command], allowPositionals: cmd === 'explain', strict: true });
  } catch (e) {
    return fail(`jasno ${cmd}: ${(e as Error).message}`, true);
  }
  const v = parsed.values as Record<string, string | boolean | string[] | undefined>;
  if (v.help) { console.log(USAGE); return 0; }
  const port = (fallback: number): number | undefined => {
    if (v.port === undefined) return fallback;
    const n = Number(v.port);
    return Number.isInteger(n) && n >= 0 && n < 65536 ? n : undefined;
  };
  if (cmd === 'explain') return explain({ code: parsed.positionals[0], list: v.list === true, json: v.json === true });
  let project;
  try { project = loadProject(cwd); } catch (e) {
    if (e instanceof ProjectError) return fail(`jasno ${cmd}: ${e.message}`);
    throw e;
  }
  const reporter = new Reporter(project.root, v.json === true);
  switch (cmd as Command) {
    case 'check':
      return check(project.root, { strict: v.strict === true }, reporter);
    case 'dev': {
      const p = port(5173);
      if (p === undefined) return fail('jasno dev: --port must be 0-65535');
      return dev(project.root, { port: p, host: v.host as string | undefined }, reporter);
    }
    case 'dist': {
      const keep = v.keep === undefined ? 0 : Number(v.keep);
      if (!Number.isInteger(keep) || keep < 0) return fail('jasno dist: --keep must be a whole number');
      return dist(project.root, { list: v.list === true, keep, conditions: (v.condition as string[] | undefined) ?? [], nonce: v.nonce === true }, reporter);
    }
    case 'preview': {
      const p = port(4173);
      if (p === undefined) return fail('jasno preview: --port must be 0-65535');
      return preview(project.root, { port: p }, reporter);
    }
    default:
      return fail(`jasno ${cmd}: not implemented in this prototype yet`);
  }
}
