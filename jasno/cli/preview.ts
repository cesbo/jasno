// jasno preview (design.md (e)): serves dist/ as a static host would: files first, then _redirects (200 rewrites,
// the SPA fallback), 404.html, and the headers of every matching _headers rule. Used for the CI rung
// "npm run dist && JASNO_E2E=preview npm run e2e", the only one that exercises the shipped artifact.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, sep } from 'node:path';
import { allowedHost, TYPES } from './dev.ts';
import type { Reporter } from './report.ts';

interface Rule { pattern: RegExp; headers: [string, string][] }
interface Redirect { pattern: RegExp; names: string[]; to: string; status: number; force: boolean }

/** A _headers/_redirects path: `*` is the splat, `:name` one segment. */
function compile(path: string): { pattern: RegExp; names: string[] } {
  const names: string[] = [];
  const src = path.split(/(\*|:[A-Za-z_]\w*)/).map((part) => {
    if (part === '*') { names.push('splat'); return '(.*)'; }
    if (part.startsWith(':')) { names.push(part.slice(1)); return '([^/]+)'; }
    return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { pattern: new RegExp(`^${src}$`), names };
}

export function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { rules.push({ pattern: compile(line.trim()).pattern, headers: [] }); continue; }
    const i = line.indexOf(':');
    if (i > 0 && rules.length) rules.at(-1)!.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return rules;
}

export function parseRedirects(text: string): Redirect[] {
  const out: Redirect[] = [];
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2 || parts[0]!.startsWith('#')) continue;
    const { pattern, names } = compile(parts[0]!);
    const code = parts[2] ?? '301';
    out.push({ pattern, names, to: parts[1]!, status: Number.parseInt(code, 10) || 301, force: code.endsWith('!') });
  }
  return out;
}

export interface PreviewServer { url: string; port: number; close(): Promise<void> }

export async function startPreview(root: string, opts: { port: number }, reporter: Reporter): Promise<PreviewServer> {
  const dir = join(root, 'dist');
  const read = (name: string): string => { try { return readFileSync(join(dir, name), 'utf8'); } catch { return ''; } };
  if (!read('index.html')) throw new Error('no dist/index.html; run npm run dist first');

  const fileAt = (path: string): string | undefined => {
    // Static hosts consume _headers and _redirects; they never serve them.
    if (path.split('/').some((s) => s.startsWith('.')) || path === '/_headers' || path === '/_redirects') return undefined;
    let file = join(dir, ...path.split('/'));
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      return statSync(file).isFile() && realpathSync.native(file) === file && file.startsWith(dir + sep) ? file : undefined;
    } catch { return undefined; }
  };

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    if (!allowedHost(req.headers.host)) { res.writeHead(403).end('loopback Host only'); return; }
    let path: string;
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
    const headers = new Map<string, string>();
    for (const rule of parseHeaders(read('_headers'))) if (rule.pattern.test(path)) for (const [k, v] of rule.headers) headers.set(k, v);
    const reply = (status: number, file: string | undefined, extra: Record<string, string> = {}): void => {
      // A weak ETag from size and mtime, so no-cache HTML revalidates with 304 as on a static host (dist 6).
      const st = file ? statSync(file) : undefined;
      const etag = st ? `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"` : undefined;
      const base = { 'content-type': file ? (TYPES[extname(file)] ?? 'application/octet-stream') : 'text/plain', ...(etag ? { etag } : {}), ...Object.fromEntries(headers), ...extra };
      if (status === 200 && etag && req.headers['if-none-match'] === etag) { res.writeHead(304, base); res.end(); return; }
      res.writeHead(status, base);
      res.end(req.method === 'HEAD' ? undefined : file ? readFileSync(file) : String(status));
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(405, undefined);
    let file = fileAt(path);
    const redirects = parseRedirects(read('_redirects'));
    for (const r of redirects) {
      const m = r.pattern.exec(path);
      if (!m || (file && !r.force)) continue;
      let to = r.to;
      r.names.forEach((name, i) => { to = to.replaceAll(`:${name}`, m[i + 1] ?? ''); });
      if (r.status >= 300 && r.status < 400) return reply(r.status, undefined, { location: to });
      file = fileAt(to);
      if (file) return reply(r.status, file);
    }
    if (file) return reply(200, file);
    const missing = fileAt('/404.html');
    return reply(404, missing);
  };

  const listen = (server: Server, p: number, host: string): Promise<void> => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(p, host, () => { server.off('error', reject); resolve(); });
  });
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    try { handle(req, res); } catch (e) { reporter.info(`jasno preview: ${String(e)}`); if (!res.headersSent) res.writeHead(500); res.end(); }
  };
  const servers = [createServer(handler)];
  await listen(servers[0]!, opts.port, '127.0.0.1');
  const port = (servers[0]!.address() as AddressInfo).port;
  const v6 = createServer(handler);
  try { await listen(v6, port, '::1'); servers.push(v6); } catch { /* no IPv6 loopback */ }
  return {
    url: `http://127.0.0.1:${port}/`, port,
    close: () => Promise.all(servers.map((s) => new Promise<void>((r) => { s.close(() => r()); s.closeAllConnections(); }))).then(() => {}),
  };
}

export async function preview(root: string, opts: { port: number }, reporter: Reporter): Promise<number> {
  let server: PreviewServer;
  try { server = await startPreview(root, opts, reporter); } catch (e) {
    const code = (e as { code?: string }).code;
    reporter.info(code === 'EADDRINUSE' ? `jasno preview: port ${opts.port} is in use; pass --port.` : `jasno preview: ${(e as Error).message}`);
    return 1;
  }
  reporter.info(`jasno preview: ${server.url}`, { url: server.url });
  await new Promise<void>((resolve) => {
    const stop = (): void => { void server.close().then(resolve); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return 0;
}
