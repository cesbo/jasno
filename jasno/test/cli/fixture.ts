// CLI test fixtures: a project in a temp directory with node_modules/jasno linked to this package, and raw HTTP
// requests (fetch cannot forge Host).
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Reporter } from '../../cli/report.ts';

export const JASNO = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));

export const INDEX = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>App</title>
  <!--jasno:head-->
</head>
<body>
  <div id="app"></div>
  <script type="module">import '/src/main.ts';</script>
</body>
</html>
`;

/** Writes files (paths relative to the project root) into a fresh temp project. */
export function project(files: Record<string, string | undefined>): { root: string; remove(): void } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jasno-cli-')));
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  symlinkSync(JASNO, join(root, 'node_modules', 'jasno'));
  for (const [path, text] of Object.entries(files)) {
    if (text === undefined) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) };
}

/** Links one of jasno's own node_modules packages (typescript, @types/node) into a fixture project. */
export function link(root: string, name: string): void {
  mkdirSync(dirname(join(root, 'node_modules', name)), { recursive: true });
  symlinkSync(join(JASNO, 'node_modules', name), join(root, 'node_modules', name));
}

export function reporter(root: string): { reporter: Reporter; lines: string[] } {
  const lines: string[] = [];
  return { reporter: new Reporter(root, false, (l) => lines.push(l)), lines };
}

export interface Res { status: number; headers: Record<string, string | string[] | undefined>; body: string }

export function http(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: opts.method ?? 'GET', headers: opts.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}
