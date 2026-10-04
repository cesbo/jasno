// jasno dev (design.md (e), ADR-34, ADR-35): a local, allowlisted server with the production CSP. It strips .ts on
// request, generates the import map from the module graph (development condition), reloads on change and prints
// browser errors and diagnostics in the terminal.
import { mkdirSync, readFileSync, realpathSync, rmSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { hostname } from 'node:os';
import { extname, join, sep } from 'node:path';
import {
  importMapIndex, injectHead, isRelative, productionCsp, ready, scanFile, scriptJson, walk, type Graph, type Mod,
} from './modules.ts';
import { browserModules, entryFiles, entryProblems, importsTailwind, posixRel, readIndex, tailwind } from './project.ts';
import { clean, lineCol, type Reporter } from './report.ts';
import { clearPackageCache, DEV_CONDITIONS, type Pkg } from './resolve.ts';

export interface DevOptions { port: number; host?: string | undefined }

export const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json',
  '.map': 'application/json', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

const LOG_LIMIT = 64 * 1024;

/** The dev client: live reload (not under WebDriver) and error/diagnostic forwarding to the terminal. */
const CLIENT = `// jasno dev client
const send = (kind, text) => {
  try { fetch('/__jasno/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, text: String(text).slice(0, 16000), page: location.pathname }), keepalive: true }).catch(() => {}); } catch {}
};
addEventListener('error', (e) => {
  const t = e.target;
  if (t && t !== window && t instanceof Element) send('load', 'failed to load ' + (t.getAttribute('src') || t.getAttribute('href') || '<' + t.localName + '>'));
  else send('error', (e.error && e.error.stack) || e.message);
}, true);
addEventListener('unhandledrejection', (e) => send('unhandled rejection', (e.reason && e.reason.stack) || String(e.reason)));
for (const level of ['warn', 'error']) {
  const original = console[level];
  console[level] = (...args) => {
    original.apply(console, args);
    const text = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    if (level === 'error' || /^\\[[A-Z][A-Z0-9_]*\\]/.test(text)) send(level, text);
  };
}
if (!navigator.webdriver) new EventSource('/__jasno/events').addEventListener('reload', () => location.reload());
`;

export interface DevServer { url: string; port: number; close(): Promise<void> }

const prefixOf = (pkg: Pkg): string => (pkg.json.name === '@jasno/core' ? '/@jasno/' : `/@dep/${pkg.json.name ?? 'unnamed'}@${pkg.json.version ?? '0.0.0'}/`);

const hostnameOf = (host: string): string => (host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.replace(/:\d+$/, '')).toLowerCase();

/**
 * DNS rebinding protection (ADR-34): rebinding needs a domain name, so loopback names, *.localhost and any IP
 * literal are accepted; with --host also this machine's own name (a LAN client may use it). Every other name gets
 * 403, with --host too: a rebound domain resolving to the LAN address still sends its own name.
 */
export function allowedHost(host: string | undefined, hostOptIn?: string): boolean {
  if (!host) return false;
  const bracketed = /^\[([0-9a-f:.]+)\](:\d+)?$/i.exec(host);
  if (bracketed) return true; // an IPv6 literal
  if (host.includes('[') || host.includes(']')) return false;
  const n = hostnameOf(host);
  if (n === 'localhost' || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.localhost$/.test(n) || /^\d{1,3}(\.\d{1,3}){3}$/.test(n)) return true;
  if (!hostOptIn) return false;
  const own = hostname().toLowerCase();
  return n === own || n === `${own}.local`;
}


/** A reusable server recorded in .jasno/dev.json: the one answering /__jasno/ping for this root. */
async function running(root: string): Promise<string | undefined> {
  try {
    const rec = JSON.parse(readFileSync(join(root, '.jasno', 'dev.json'), 'utf8')) as { url: string };
    const res = await fetch(new URL('/__jasno/ping', rec.url), { signal: AbortSignal.timeout(800) });
    const body = (await res.json()) as { root?: string };
    return body.root === root ? rec.url : undefined;
  } catch {
    return undefined;
  }
}

export async function startDev(root: string, opts: DevOptions, reporter: Reporter): Promise<DevServer> {
  await ready;
  /** URL prefix → package directory, filled by module graph walks. */
  const packages = new Map<string, string>();
  const clients = new Set<ServerResponse>();
  /** Linked packages (a file: or workspace dependency, realpath outside node_modules) reload the page when they change. */
  const watchedPackages = new Set<string>();
  const packageWatchers: FSWatcher[] = [];
  function watchPackage(dir: string): void {
    // Installed copies under node_modules do not change while you work; linked and workspace packages do.
    if (watchedPackages.has(dir) || dir.split(sep).includes('node_modules')) return;
    watchedPackages.add(dir);
    try {
      packageWatchers.push(watch(dir, { recursive: true }, (_e, name) => {
        if (name && name.split(sep).some((x) => x.startsWith('.') || x === 'node_modules')) return;
        if (name && !/\.(ts|js|mjs|json)$/.test(name)) return;
        changed();
      }));
    } catch { /* ignore */ }
  }
  let port = opts.port;

  const urlOf = (file: string, mod?: Mod): string => {
    const owner = mod?.owner;
    if (!owner || owner.kind === 'app') return '/' + posixRel(root, file);
    return prefixOf(owner.pkg) + posixRel(owner.pkg.dir, file);
  };

  const graph = (): { graph: Graph; map: { imports: Record<string, string>; scopes: Record<string, Record<string, string>> } } => {
    const html = readIndex(root) ?? '';
    const g = walk([...entryFiles(root, html), ...browserModules(root)], root, DEV_CONDITIONS);
    const imports: Record<string, string> = {};
    const scopes: Record<string, Record<string, string>> = {};
    for (const mod of g.mods.values()) {
      if (mod.owner.kind === 'package') packages.set(prefixOf(mod.owner.pkg), mod.owner.pkg.dir);
    }
    for (const mod of g.mods.values()) {
      for (const e of mod.edges) {
        if (!e.file || !e.specifier || isRelative(e.specifier)) continue;
        const target = urlOf(e.file, g.mods.get(e.file));
        if (mod.owner.kind === 'app') imports[e.specifier] = target;
        else (scopes[prefixOf(mod.owner.pkg)] ??= {})[e.specifier] = target;
      }
    }
    for (const p of [...entryProblems(root, html), ...g.problems]) reporter.add(p);
    for (const dir of new Set(packages.values())) watchPackage(dir);
    return { graph: g, map: { imports, scopes } };
  };

  /** Every response carries the production CSP (dist's _headers apply it to /*); index.html adds its script hashes. */
  const BASE_CSP = productionCsp('');
  const send = (res: ServerResponse, req: IncomingMessage, status: number, type: string, body: string | Buffer, headers: Record<string, string> = {}): void => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': BASE_CSP, ...headers });
    res.end(req.method === 'HEAD' ? undefined : body);
  };

  const errorPage = (res: ServerResponse, req: IncomingMessage, status: number, code: string, message: string): void => {
    const html = `<!doctype html><meta charset="utf-8"><title>${code}</title><h1>${code}</h1><p>${message.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</p>`;
    send(res, req, status, TYPES['.html']!, html, { 'content-security-policy': productionCsp(html) });
  };

  /** The file itself, not a symlink target or a case variant (static Linux hosts are case-sensitive). */
  const exact = (file: string): boolean => {
    try { return statSync(file).isFile() && realpathSync.native(file) === file; } catch { return false; }
  };

  const serveIndex = (req: IncomingMessage, res: ServerResponse): void => {
    const html = readIndex(root);
    if (html === undefined) return send(res, req, 404, TYPES['.txt']!, `jasno dev: no index.html in ${root}.`);
    const mapAt = importMapIndex(html);
    if (mapAt >= 0) {
      reporter.add({ code: 'IMPORT_MAP_HANDWRITTEN', severity: 'error', message: 'index.html contains a <script type="importmap">; jasno generates the import map.', hint: 'Delete it and keep the <!--jasno:head--> slot.', file: join(root, 'index.html'), ...lineCol(html, mapAt) });
      return errorPage(res, req, 500, 'IMPORT_MAP_HANDWRITTEN', 'index.html contains a <script type="importmap">. jasno dev and jasno dist generate the import map; delete yours and keep the <!--jasno:head--> slot.');
    }
    const { map } = graph();
    const out = injectHead(html, `<script type="importmap">${scriptJson(map)}</script>\n  <script type="module" src="/__jasno/client.js"></script>`);
    send(res, req, 200, TYPES['.html']!, out, { 'content-security-policy': productionCsp(out) });
  };

  const serveModule = (req: IncomingMessage, res: ServerResponse, file: string, url: string): void => {
    const ext = extname(file);
    if (ext === '.ts' || ext === '.mts') {
      const scan = scanFile(file);
      if (scan.failure) {
        const where = `${url}:${scan.failure.line}:${scan.failure.col}`;
        reporter.add({ code: 'SYNTAX_REJECTED', severity: 'error', message: `does not parse as a module: ${scan.failure.message}`, file, line: scan.failure.line, col: scan.failure.col });
        return send(res, req, 200, TYPES['.js']!, `throw new SyntaxError(${JSON.stringify(`[SYNTAX_REJECTED] ${where} ${scan.failure.message}`)});\n`);
      }
      return send(res, req, 200, TYPES['.ts']!, scan.code);
    }
    send(res, req, 200, TYPES[ext] ?? 'application/octet-stream', readFileSync(file));
  };

  /** 404, printed with the code and hint when there is one (TS_EXTENSION, ASSET_OUTSIDE_ASSETS). */
  const notFound = (req: IncomingMessage, res: ServerResponse, path: string, code?: string, message?: string, hint?: string, file?: string): void => {
    if (code) reporter.add({ code, severity: 'error', message: message!, hint, file });
    else if (path !== '/favicon.ico') reporter.info(`404 ${path}${hint ? ` hint: ${hint}` : ''}`);
    send(res, req, 404, TYPES['.txt']!, code ? `[${code}] ${message}${hint ? ` ${hint}` : ''}` : `404 ${path}${hint ? `: ${hint}` : ''}`);
  };
  const JASNO_HINT = "jasno's modules are under /@jasno/src/ (@jasno/core → /@jasno/src/index.ts, @jasno/core/router → /@jasno/src/router.ts); import them by name.";

  const readBody = (req: IncomingMessage): Promise<string | undefined> => new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > LOG_LIMIT) { resolve(undefined); return; } // keep draining; the 413 closes the connection
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(undefined));
  });

  const internal = async (req: IncomingMessage, res: ServerResponse, path: string): Promise<void> => {
    if (path === '/__jasno/client.js') return send(res, req, 200, TYPES['.js']!, CLIENT);
    if (path === '/__jasno/ping') return send(res, req, 200, TYPES['.json']!, JSON.stringify({ root, pid: process.pid }));
    if (path === '/__jasno/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': jasno dev\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (path === '/__jasno/log') {
      if (req.method !== 'POST') return send(res, req, 405, TYPES['.txt']!, 'POST only');
      const origin = req.headers.origin;
      const site = req.headers['sec-fetch-site'];
      if (origin !== `http://${req.headers.host}` || (site !== undefined && site !== 'same-origin')) return send(res, req, 403, TYPES['.txt']!, 'same-origin only');
      if (Number(req.headers['content-length'] ?? 0) > LOG_LIMIT) return send(res, req, 413, TYPES['.txt']!, 'too large');
      const body = await readBody(req);
      if (body === undefined) return send(res, req, 413, TYPES['.txt']!, 'too large', { connection: 'close' });
      let msg: { kind?: unknown; text?: unknown; page?: unknown };
      try { msg = JSON.parse(body) as typeof msg; } catch { return send(res, req, 400, TYPES['.txt']!, 'bad json'); }
      reporter.info(`browser ${String(msg.kind ?? 'log').replace(/\s+/g, ' ')}${msg.page ? ` (${String(msg.page).replace(/\s+/g, ' ')})` : ''}: ${String(msg.text ?? '')}`); // the Reporter strips control characters
      return send(res, req, 204, TYPES['.txt']!, '');
    }
    send(res, req, 404, TYPES['.txt']!, '404');
  };

  const packageFile = (req: IncomingMessage, res: ServerResponse, path: string): void => {
    let prefix = [...packages.keys()].find((p) => path.startsWith(p));
    if (!prefix) { graph(); prefix = [...packages.keys()].find((p) => path.startsWith(p)); }
    if (!prefix) return notFound(req, res, path, undefined, undefined, path.startsWith('/@jasno/') ? JASNO_HINT : undefined);
    const rest = path.slice(prefix.length);
    const dir = packages.get(prefix)!;
    const file = join(dir, ...rest.split('/'));
    if (rest.split('/').includes('node_modules') || !file.startsWith(dir + sep) || !exact(file)) {
      if (prefix === '/@jasno/' && file.endsWith('.js') && exact(file.slice(0, -3) + '.ts')) {
        return notFound(req, res, path, undefined, undefined, `the module is ${path.slice(0, -3)}.ts; import '@jasno/core' and '@jasno/core/router' by name.`);
      }
      return notFound(req, res, path, undefined, undefined, prefix === '/@jasno/' ? JASNO_HINT : undefined);
    }
    serveModule(req, res, file, path);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!allowedHost(req.headers.host, opts.host)) {
      return send(res, req, 403, TYPES['.txt']!, `jasno dev answers only loopback names (Host "${clean(req.headers.host ?? '')}" refused: DNS rebinding protection). Open http://127.0.0.1:${port}/, or start it with --host.`);
    }
    let path: string;
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); } catch { return send(res, req, 400, TYPES['.txt']!, 'bad path'); }
    const segs = path.split('/');
    if (path.includes('\0') || path.includes('\\') || segs.some((s) => s === '.' || s === '..' || /^\.env/i.test(s))) return notFound(req, res, path);
    // Other dot segments reach only public/, which jasno dist copies with its dotfiles (.well-known/).
    const dotted = segs.some((s) => s.startsWith('.'));
    const isLog = path === '/__jasno/log' && req.method === 'POST';
    if (!isLog && req.method !== 'GET' && req.method !== 'HEAD') return send(res, req, 405, TYPES['.txt']!, 'GET only');
    if (path.startsWith('/__jasno/')) return internal(req, res, path);
    if (path === '/' || path === '/index.html') return serveIndex(req, res);
    const under = (prefix: string): boolean => path === prefix || path.startsWith(prefix + '/');
    const served = under('/src') || under('/assets') || under('/@jasno') || under('/@dep');
    if (dotted && served) return notFound(req, res, path);
    // A static host has no empty segments: /src/x.ts/ and /src//x.ts are not /src/x.ts.
    if (served && path.slice(1).split('/').includes('')) return notFound(req, res, path);
    if (path.startsWith('/@jasno/') || path.startsWith('/@dep/')) return packageFile(req, res, path);
    const file = join(root, ...path.split('/'));
    if (path.startsWith('/src/')) {
      const ext = extname(file);
      if ((ext === '.ts' || ext === '.json') && exact(file)) return serveModule(req, res, file, path);
      if (ext === '.js' && exact(file.slice(0, -3) + '.ts')) {
        return notFound(req, res, path, 'TS_EXTENSION', `${path} does not exist; the module is ${path.slice(0, -3)}.ts.`, "Relative specifiers end in '.ts'.", file);
      }
      if (ext !== '.ts' && ext !== '.json' && exact(file)) {
        const code = /\.(mts|cts|mjs|cjs|js|tsx|jsx)$/.test(ext);
        return notFound(req, res, path, 'ASSET_OUTSIDE_ASSETS', `${path} is not a module; jasno dist does not publish other files under src/, so this URL would 404 in production.`, code ? `jasno modules are .ts files: rename it to ${path.split('/').pop()!.replace(/\.\w+$/, '.ts')}.` : `Move it to assets/ and use '/assets/${path.split('/').pop()}'.`, file);
      }
      return notFound(req, res, path);
    }
    if (path.startsWith('/assets/')) {
      if (!exact(file)) return notFound(req, res, path);
      // A stylesheet that imports tailwindcss is served compiled by the project's @tailwindcss/cli (ADR-37).
      if (extname(file) === '.css' && importsTailwind(readFileSync(file, 'utf8'))) {
        const r = await tailwind(root, file, false);
        if (r.problem) { reporter.add(r.problem); return send(res, req, 500, TYPES['.txt']!, `[${r.problem.code}] ${r.problem.message}${r.problem.hint ? ` ${r.problem.hint}` : ''}`); }
        return send(res, req, 200, TYPES['.css']!, r.css);
      }
      return send(res, req, 200, TYPES[extname(file)] ?? 'application/octet-stream', readFileSync(file));
    }
    // public/ files are served at the root (robots.txt, favicon.ico), as jasno dist copies them.
    const pub = join(root, 'public', ...path.split('/'));
    if (!path.slice(1).split('/').includes('') && exact(pub)) return send(res, req, 200, TYPES[extname(pub)] ?? 'application/octet-stream', readFileSync(pub));
    // SPA fallback: an HTML navigation to an extension-less path that is not a file (design.md (e) dev); never
    // under /src, /@dep, /@jasno or /assets, where a miss is a missing file.
    const last = path.split('/').pop() ?? '';
    if (!served && !extname(last) && (req.headers.accept ?? '').includes('text/html')) return serveIndex(req, res);
    return notFound(req, res, path);
  };

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    handle(req, res).catch((e: unknown) => {
      reporter.info(`jasno dev: ${e instanceof Error ? e.stack : String(e)}`);
      if (!res.headersSent) send(res, req, 500, TYPES['.txt']!, 'internal error');
      else res.end();
    });
  };

  const listen = (server: Server, p: number, host: string): Promise<void> => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(p, host, () => { server.off('error', reject); resolve(); });
  });

  const servers: Server[] = [createServer(handler)];
  await listen(servers[0]!, opts.port, opts.host ?? '127.0.0.1');
  port = (servers[0]!.address() as AddressInfo).port;
  if (!opts.host) {
    const v6 = createServer(handler);
    try { await listen(v6, port, '::1'); servers.push(v6); } catch { /* no IPv6 loopback */ }
  }
  const host = opts.host ? (opts.host.includes(':') ? `[${opts.host}]` : opts.host) : '127.0.0.1';
  const url = `http://${host}:${port}/`;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      clearPackageCache();
      reporter.forget(); // a problem fixed and reintroduced prints again
      for (const c of clients) c.write('event: reload\ndata: 1\n\n');
    }, 80);
  };
  const watchers: FSWatcher[] = [];
  /** Only changes to files the server would serve reload the page (no swap files, dotfiles or unserved types). */
  const servedChange = (dir: string, modulesOnly: boolean) => (_e: string, name: string | null): void => {
    if (!name) return changed();
    const segs = name.split(sep);
    if (segs.some((x) => x.startsWith('.') || x === 'node_modules') || name.endsWith('~')) return;
    if (modulesOnly && !/\.(ts|json|js|mjs)$/.test(name)) return;
    try { if (realpathSync.native(join(dir, name)) !== join(dir, name)) return; } catch { /* deleted: reload */ }
    changed();
  };
  for (const [d, modulesOnly] of [['src', true], ['assets', false], ['public', false]] as const) {
    try { watchers.push(watch(join(root, d), { recursive: true }, servedChange(join(root, d), modulesOnly))); } catch { /* missing directory */ }
  }
  try { watchers.push(watch(root, (_e, name) => { if (name === 'index.html' || name === 'package.json') changed(); })); } catch { /* ignore */ }

  const record = join(root, '.jasno', 'dev.json');
  mkdirSync(join(root, '.jasno'), { recursive: true });
  writeFileSync(record, JSON.stringify({ pid: process.pid, port, url }) + '\n');

  return {
    url, port,
    close: async () => {
      clearTimeout(timer);
      for (const w of [...watchers, ...packageWatchers]) w.close();
      for (const c of clients) c.end();
      await Promise.all(servers.map((s) => new Promise<void>((r) => { s.close(() => r()); s.closeAllConnections(); })));
      try { if ((JSON.parse(readFileSync(record, 'utf8')) as { pid: number }).pid === process.pid) rmSync(record); } catch { /* gone */ }
    },
  };
}

export async function dev(root: string, opts: DevOptions, reporter: Reporter): Promise<number> {
  const existing = await running(root);
  if (existing) { reporter.info(`jasno dev: already running at ${existing}`, { url: existing }); return 0; }
  let server: DevServer;
  try {
    server = await startDev(root, opts, reporter);
  } catch (e) {
    const code = (e as { code?: string }).code;
    reporter.info(code === 'EADDRINUSE' ? `jasno dev: port ${opts.port} is in use; pass --port.` : `jasno dev: ${String(e)}`);
    return 1;
  }
  if (opts.host) reporter.info(`jasno dev: listening on ${opts.host}: other machines can reach it, and everything under src/ is public.`);
  reporter.info(`jasno dev: ${server.url}`, { url: server.url });
  await new Promise<void>((resolve) => {
    const stop = (): void => { void server.close().then(resolve); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return 0;
}
