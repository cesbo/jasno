// Minimal static server for browser checks of the prototype (not the jasno dev CLI): strips types from .ts with
// Node's module.stripTypeScriptTypes, maps jasno and #dev/#props/#api with an import map at <!--jasno:head-->,
// and serves index.html for extensionless paths (the SPA fallback). Usage: node tools/serve.mjs <appRoot> [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { extname, join, resolve, sep } from 'node:path';

const [appRoot = '../design/example', port = '5173'] = process.argv.slice(2);
const root = resolve(appRoot);
const jasnoSrc = resolve(new URL('../src/', import.meta.url).pathname);
const imports = {
  jasno: '/@jasno/index.ts', 'jasno/router': '/@jasno/router.ts',
  '#dev': '/@jasno/dev-on.ts', '#props': '/@jasno/props.ts', '#api': '/src/api.mock.ts',
};
const types = { '.js': 'text/javascript', '.ts': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const base = pathname.startsWith('/@jasno/') ? jasnoSrc : root;
  let file = resolve(base, '.' + decodeURIComponent(pathname.startsWith('/@jasno/') ? pathname.slice(7) : pathname));
  if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    if (extname(pathname)) { res.writeHead(404).end(); return; }
    file = join(root, 'index.html'); // SPA fallback
  }
  let body = await readFile(file, 'utf8');
  if (file.endsWith('.ts')) body = stripTypeScriptTypes(body);
  if (file.endsWith('.html')) body = body.replace('<!--jasno:head-->', `<script type="importmap">${JSON.stringify({ imports })}</script>`);
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
}).listen(Number(port), '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}/`));
