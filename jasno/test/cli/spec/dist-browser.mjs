// jasno dist + jasno preview in real browsers (Chromium, Firefox): node test/cli/spec/dist-browser.mjs
// A small app (jasno, a dependency with a scoped #import, a JSON module, a lazy route) is built, served by preview and
// loaded: modules load from hashed URLs with integrity under the production CSP and Trusted Types; a tampered module is
// blocked; a stale tab keeps loading its lazy route after a --keep 1 deploy; the --nonce variant as printed.
// Every check is a conformance check ("ok"/"FAIL"); all passed in Chromium and Firefox on 2026-09-27.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, firefox } from 'playwright';
import { dist } from '../../../cli/dist.ts';
import { startPreview } from '../../../cli/preview.ts';
import { INDEX, project, reporter } from '../fixture.ts';

const lazySrc = (v) => `import { helper } from './helper.ts';\nexport default 'lazy-${v}:' + helper(2);\n`;
const app = project({
  'package.json': JSON.stringify({ name: 'app', type: 'module', dependencies: { 'dep-esm': '1' } }),
  'index.html': INDEX,
  'src/main.ts': [
    "import { h, mount } from 'jasno';",
    "import { mode } from 'dep-esm';",
    "import data from './data.json' with { type: 'json' };",
    "const lazy = (): Promise<string> => import('./views/lazy.ts').then((m) => m.default);",
    "(globalThis as Record<string, unknown>).loadLazy = lazy;",
    "(globalThis as Record<string, unknown>).tryHtml = (): string => { try { document.body.innerHTML += '<b>x</b>'; return 'allowed'; } catch (e) { return (e as Error).name; } };",
    "mount(() => h.p({ id: 'out' }, `main-v1:${mode}:${data.v}`), document.getElementById('app'));",
    '',
  ].join('\n'),
  'src/data.json': '{"v":1}',
  'src/views/lazy.ts': lazySrc('v1'),
  'src/views/helper.ts': 'export const helper = <T,>(x: T): T => x;\n',
  'node_modules/dep-esm/package.json': JSON.stringify({ name: 'dep-esm', version: '1.2.3', type: 'module', exports: { '.': './prod.js' }, imports: { '#internal': './internal.js' } }),
  'node_modules/dep-esm/prod.js': "import { x } from '#internal';\nexport const mode = 'prod' + x;\n",
  'node_modules/dep-esm/internal.js': "export const x = '!';\n",
});
const at = (p) => join(app.root, p);
const edit = (p, text) => writeFileSync(at(p), text);
const build = async (keep) => {
  const r = reporter(app.root);
  const code = await dist(app.root, { list: false, keep, conditions: [], nonce: false }, r.reporter);
  if (code !== 0) throw new Error(r.lines.join('\n'));
  return JSON.parse(/<script type="importmap">(.*?)<\/script>/s.exec(readFileSync(at('dist/index.html'), 'utf8'))[1]);
};

await build(0);
const server = await startPreview(app.root, { port: 0 }, reporter(app.root).reporter);
const base = server.url.replace(/\/$/, '');
let failed = 0;
const out = [];
const ok = (cond, msg) => { if (!cond) failed++; out.push(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); };

async function open(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().split('\n')[0]); });
  await page.addInitScript(() => {
    globalThis.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => globalThis.__violations.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  return { ctx, page, errors };
}
const lazyResult = (page) => page.evaluate(() => globalThis.loadLazy().then((v) => v, (e) => `rejected: ${String(e).split('\n')[0]}`));

try {
  for (const [name, type] of [['chromium', chromium], ['firefox', firefox]]) {
    out.push(`== ${name}`);
    const browser = await type.launch();
    try {
      edit('src/views/lazy.ts', lazySrc('v1'));
      await build(0);
      // 1. The app under the production CSP, Trusted Types and integrity.
      const a = await open(browser);
      await a.page.goto(base + '/');
      await a.page.waitForSelector('#out', { timeout: 5000 }).catch(() => {});
      ok(await a.page.textContent('#out').catch(() => null) === 'main-v1:prod!:1', `app runs: dependency with scoped #import, JSON module (${await a.page.textContent('#out').catch((e) => String(e))})`);
      const loaded = await a.page.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname));
      ok(loaded.every((p) => !p.endsWith('.ts')) && loaded.some((p) => /^\/_deps\/dep-esm@1\.2\.3\/internal\.[0-9a-f]{10}\.js$/.test(p)), 'modules load from hashed URLs, none from .ts');
      ok(!loaded.some((p) => p.includes('/views/lazy.')), 'the lazy route is not preloaded');
      ok(a.errors.length === 0 && (await a.page.evaluate(() => globalThis.__violations)).length === 0, `no console errors or CSP violations (${JSON.stringify(a.errors.slice(0, 3))})`);
      const tt = await a.page.evaluate(() => globalThis.tryHtml());
      ok(tt === 'TypeError', `Trusted Types enforced (innerHTML → ${tt})`);

      // 2. Stale tab: loaded at v1, never touched the lazy route; deploy v2 with --keep 1; the old lazy route still loads.
      const stale = await open(browser);
      await stale.page.goto(base + '/');
      await stale.page.waitForSelector('#out');
      edit('src/views/lazy.ts', lazySrc('v2'));
      await build(1);
      ok(await lazyResult(stale.page) === 'lazy-v1:2', `stale tab loads its v1 lazy route after a --keep 1 deploy (${await lazyResult(stale.page)})`);
      const fresh = await open(browser);
      await fresh.page.goto(base + '/');
      await fresh.page.waitForSelector('#out');
      ok(await lazyResult(fresh.page) === 'lazy-v2:2', 'a new tab gets v2');
      // Without --keep the stale tab's lazy module is gone; what the browser sees is the SPA rewrite (200 text/html).
      const stale2 = await open(browser);
      await stale2.page.goto(base + '/');
      await stale2.page.waitForSelector('#out');
      edit('src/views/lazy.ts', lazySrc('v3'));
      await build(0);
      const gone = await lazyResult(stale2.page);
      ok(gone.startsWith('rejected'), `past --keep the stale lazy import fails (${gone})`);

      // 3. A tampered module (edited after the build) is blocked by integrity: a lazy one and a preloaded dependency.
      const map = await build(0);
      const lazyUrl = map.imports['/src/views/lazy.ts'];
      writeFileSync(at('dist' + lazyUrl), readFileSync(at('dist' + lazyUrl), 'utf8').replace("'lazy-", "'TAMPERED-"));
      const t = await open(browser);
      await t.page.goto(base + '/');
      await t.page.waitForSelector('#out');
      const tampered = await lazyResult(t.page);
      ok(tampered.startsWith('rejected'), `tampered lazy module blocked by import-map integrity (${tampered})`);
      const depUrl = map.imports['/_deps/dep-esm@1.2.3/internal.js'];
      await build(0);
      writeFileSync(at('dist' + depUrl), "export const x = '?';\n");
      const t2 = await open(browser);
      await t2.page.goto(base + '/');
      await t2.page.waitForTimeout(1000);
      const text = await t2.page.textContent('#out').catch(() => null);
      ok(text === null, `tampered preloaded dependency blocks the entry (#out: ${JSON.stringify(text)}; ${JSON.stringify(t2.errors.slice(0, 2))})`);

      // 4. The --nonce variant as printed: nonce on both inline scripts, the policy as a header, the meta removed.
      await build(0);
      const html = readFileSync(at('dist/index.html'), 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replaceAll('<script type=', '<script nonce="n0nce" type=');
      writeFileSync(at('dist/index.html'), html);
      writeFileSync(at('dist/_headers'), readFileSync(at('dist/_headers'), 'utf8').replace(/Content-Security-Policy: .*/, "Content-Security-Policy: script-src 'nonce-n0nce' 'strict-dynamic'; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'"));
      const n = await open(browser);
      await n.page.goto(base + '/');
      await n.page.waitForSelector('#out', { timeout: 5000 }).catch(() => {});
      ok(await n.page.textContent('#out').catch(() => null) === 'main-v1:prod!:1', 'nonce variant: the app runs');
      ok(await lazyResult(n.page) === 'lazy-v3:2', 'nonce variant: the lazy route loads');
      const v = await n.page.evaluate(() => globalThis.__violations);
      ok(v.length === 0 && n.errors.length === 0, `nonce variant: no CSP violations or console errors (${v.length}: ${JSON.stringify(v.slice(0, 2))} ${JSON.stringify(n.errors.slice(0, 2))})`);
      for (const x of [a, stale, fresh, stale2, t, t2, n]) await x.ctx.close();
    } catch (e) {
      failed++;
      out.push(`FAIL exception: ${String(e).split('\n')[0]}`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
  app.remove();
}
console.log(out.join('\n'));
process.exit(failed ? 1 : 0);
