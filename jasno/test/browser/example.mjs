// The design example in real browsers (Navigation API adapter): node test/browser/example.mjs
import { spawn } from 'node:child_process';
import { chromium, firefox } from 'playwright';
const base = 'http://127.0.0.1:5199';
const server = spawn('node', [new URL('../../tools/serve.mjs', import.meta.url).pathname, new URL('../../../design/example', import.meta.url).pathname, '5199'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.once('data', r));
let failed = 0;
const results = {};
for (const [name, type] of [['chromium', chromium], ['firefox', firefox]]) {
  const log = [];
  const ok = (cond, msg) => { if (!cond) failed++; log.push(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); };
  let browser;
  try {
    browser = await type.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    await page.goto(base + '/');
    await page.waitForSelector('h1:text("People")');
    await page.waitForSelector('li a');
    const adapter = await page.evaluate(() => ('navigation' in window ? 'Navigation API' : 'History'));
    ok(true, `adapter: ${adapter}`);
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
    const diags = await page.evaluate(() => window.__JASNO__?.diagnostics().map((d) => d.message));
    ok(Array.isArray(diags) && diags.length === 0, `__JASNO__.diagnostics() empty (${JSON.stringify(diags)})`);
    const info = await page.evaluate(() => window.__JASNO__?.router());
    ok(info?.route === undefined && info?.error, `__JASNO__.router() ${JSON.stringify(info)}`);
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
