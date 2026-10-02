// The design example in Chromium, Firefox and WebKit: node test/browser/example.mjs [preview | history]
// dev: under jasno dev (Navigation API adapter). history: the same with the Navigation API hidden, so the router
// runs its History adapter. preview: jasno dist (with the mock API: --condition development) served by jasno
// preview, the CI rung that exercises the shipped artifact (hashed files, integrity, CSP, _headers, SPA fallback).
import { spawn, spawnSync } from 'node:child_process';
import { chromium, firefox, webkit } from 'playwright';
const preview = process.argv[2] === 'preview';
const historyAdapter = process.argv[2] === 'history';
const PORT = preview ? 5198 : historyAdapter ? 5197 : 5199;
const base = `http://127.0.0.1:${PORT}`;
// EXAMPLE_DIR and JASNO_BIN point the probe at a copy of the example that installed the packed tarball (test-package).
const jasno = process.env.JASNO_BIN ?? new URL('../../bin/jasno.js', import.meta.url).pathname;
const cwd = process.env.EXAMPLE_DIR ?? new URL('../../../design/example', import.meta.url).pathname;
if (preview) {
  const built = spawnSync('node', [jasno, 'dist', '--condition', 'development'], { cwd, stdio: 'inherit' });
  if (built.status !== 0) process.exit(1);
}
const server = spawn('node', [jasno, preview ? 'preview' : 'dev', '--port', String(PORT)], { cwd, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.once('data', r));
server.stdout.on('data', (d) => process.stdout.write('  [jasno dev] ' + d));
let failed = 0;
const results = {};
for (const [name, type] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  const log = [];
  const ok = (cond, msg) => { if (!cond) failed++; log.push(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); };
  let browser;
  try {
    browser = await type.launch();
    const page = await browser.newPage();
    if (historyAdapter) await page.addInitScript(() => { for (let o = window; o; o = Object.getPrototypeOf(o)) if (Object.getOwnPropertyDescriptor(o, 'navigation')) delete o.navigation; });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    await page.goto(base + '/');
    await page.waitForSelector('h1:text("People")');
    await page.waitForSelector('li a');
    const adapter = await page.evaluate(() => ('navigation' in window ? 'Navigation API' : 'History'));
    ok(adapter === (historyAdapter ? 'History' : 'Navigation API'), `adapter: ${adapter}`);
    ok(await page.title() === 'People', `title People (${await page.title()})`);
    const hist0 = await page.evaluate(() => history.length);
    await page.click('li a >> nth=0');
    await page.waitForSelector('h1:text("Ada Lovelace")');
    await page.waitForFunction(() => document.activeElement?.tagName === 'H1');
    ok(new URL(page.url()).pathname === '/users/1', `link click → /users/1 (${page.url()})`);
    ok(await page.title() === 'Ada Lovelace', `title from data (${await page.title()})`);
    ok(await page.evaluate(() => document.activeElement?.textContent) === 'Ada Lovelace', 'focus on the view h1');
    ok(await page.evaluate(() => history.length) === hist0 + 1, 'one history entry pushed');
    await page.waitForSelector('li:text("Send the Bernoulli table")');
    ok(true, 'notes loaded by the view resource');
    await page.fill('textarea', 'from the browser');
    await page.click('button[type=submit]');
    await page.waitForSelector('li:text("from the browser")');
    ok(true, 'note form saves and the list reloads');
    await page.goBack();
    await page.waitForSelector('h1:text("People")');
    ok(new URL(page.url()).pathname === '/', 'back → /');
    await page.goForward();
    await page.waitForSelector('h1:text("Ada Lovelace")');
    ok(true, 'forward → /users/1');
    await page.click('nav a');
    await page.waitForSelector('h1:text("People")');
    ok(true, 'nav link → /');
    await page.goto(base + '/nope');
    await page.waitForSelector('h1:text("Page not found")');
    ok(await page.title() === 'Page not found', `notFound (title ${await page.title()})`);
    await page.goto(base + '/users/999');
    await page.waitForSelector('h1:text("Something went wrong")');
    ok(true, 'loader 404 → error view');
    await page.click('button:text("Try again")');
    await page.waitForSelector('h1:text("Something went wrong")');
    ok(true, 'retry re-runs the navigation');
    if (preview) {
      ok(await page.evaluate(() => window.__JASNO__ === undefined), 'production build: no __JASNO__');
      // jasno dist bundles by default: the entry, the lazy views and shared chunks, all hashed under /src/.
      const hashed = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname).filter((p) => /\.[0-9a-z]{8}\.js$/.test(p)));
      ok(hashed.some((p) => p.startsWith('/src/views/user.')) && hashed.every((p) => p.startsWith('/src/')), `chunks load from hashed URLs (${hashed.length})`);
      ok(!(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => new URL(e.name).pathname.endsWith('.ts')))), 'no .ts request');
    } else {
      const diags = await page.evaluate(() => window.__JASNO__?.diagnostics().map((d) => d.message));
      ok(Array.isArray(diags) && diags.length === 0, `__JASNO__.diagnostics() empty (${JSON.stringify(diags)})`);
      const info = await page.evaluate(() => window.__JASNO__?.router());
      ok(info?.route === undefined && info?.error, `__JASNO__.router() ${JSON.stringify(info)}`);
    }
    ok(errors.length === 0, `no console errors/warnings (${JSON.stringify(errors.slice(0, 3))})`);
  } catch (e) {
    failed++;
    log.push(`FAIL exception: ${String(e).split('\n')[0]}`);
  } finally {
    await browser?.close();
  }
  results[name] = log;
}
for (const [name, log] of Object.entries(results)) console.log(`== ${name}\n${log.join('\n')}`);
server.kill();
process.exit(failed ? 1 : 0);
