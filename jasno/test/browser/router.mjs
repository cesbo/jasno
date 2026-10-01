// Probes the jasno router's Navigation API adapter in Chromium and Firefox (design.md B17).
// Usage: npm run test:browser (or node test/browser/router.mjs [scenarioFilter]); Chromium and Firefox.
import { spawn } from 'node:child_process';
import { mkdirSync, symlinkSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright';

const PORT = 5211;
const base = `http://127.0.0.1:${PORT}`;
const APP = new URL('./app', import.meta.url).pathname;
mkdirSync(APP + '/node_modules/@jasno', { recursive: true });
try { symlinkSync('../../../../..', APP + '/node_modules/@jasno/core'); } catch { /* exists */ }
const server = spawn('node', [new URL('../../bin/jasno.js', import.meta.url).pathname, 'dev', '--port', String(PORT)], { cwd: APP, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.once('data', r));
server.stdout.on('data', (d) => process.stdout.write('  [jasno dev] ' + d));

const only = process.argv[2];
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))));
const settle = async (page) => {
  await page.waitForFunction(() => window.__router && !window.__router.isLoading());
  await page.evaluate(async () => { try { await navigation.transition?.finished; } catch {} });
  await frames(page);
};
const h1 = (page) => page.evaluate(() => document.querySelector('main h1')?.textContent);
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? (a.id ? '#' + a.id : a.tagName.toLowerCase() + (a.textContent ? `(${a.textContent.slice(0, 30)})` : '')) : null; });
const entries = (page) => page.evaluate(() => ({ n: navigation.entries().length, i: navigation.currentEntry.index, h: history.length }));
const mark = (page) => page.evaluate(() => { window.__m = 1; });
const marked = (page) => page.evaluate(() => window.__m === 1);
const path = (page) => { const u = new URL(page.url()); return u.pathname + u.search + u.hash; };
const q = (page) => page.evaluate(() => window.__router.url().searchParams.get('q'));

// Records every ariaNotify call (both browsers have ariaNotify, so the router uses it).
const spyNotify = () => {
  window.__notes = [];
  for (let p = Element.prototype; p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, 'ariaNotify');
    if (!d) continue;
    const orig = d.value;
    p.ariaNotify = function (s, o) { window.__notes.push(s); return orig.call(this, s, o); };
    return;
  }
  // No ariaNotify (WebKit 26): jasno announces through its live region; record each text it writes there.
  new MutationObserver((records) => {
    for (const r of records) if (r.target.nodeType === 1 && r.target.matches('[aria-live=polite]')) window.__notes.push(r.target.textContent);
  }).observe(document, { subtree: true, childList: true });
};
const dropNotify = () => {
  for (const root of [Element.prototype, Document.prototype]) {
    for (let p = root; p; p = Object.getPrototypeOf(p)) if (Object.getOwnPropertyDescriptor(p, 'ariaNotify')) delete p.ariaNotify;
  }
};

const scenarios = {
  async initial(page, ok) {
    ok(await page.evaluate(() => document.activeElement === document.body), `first render does not move focus (${await active(page)})`);
    ok(await page.title() === 'List', `title List (${await page.title()})`);
    ok((await page.evaluate(() => window.__notes.length)) === 0, `no announcement on the first render (${await page.evaluate(() => JSON.stringify(window.__notes))})`);
  },

  async searchTyping(page, ok) {
    const e0 = await entries(page);
    await page.click('#q');
    // Per input event, after its flush: the input value and url() agree (the binding never writes an old value back).
    await page.evaluate(() => {
      window.__lag = [];
      const input = document.getElementById('q');
      input.addEventListener('input', () => {
        const sync = window.__router.url().searchParams.get('q');
        if (sync !== input.value) window.__lag.push(`sync ${JSON.stringify(input.value)} vs url ${JSON.stringify(sync)}`);
        queueMicrotask(() => queueMicrotask(() => { const u = window.__router.url().searchParams.get('q');
          if (u !== input.value) window.__lag.push(`after flush ${JSON.stringify(input.value)} vs url ${JSON.stringify(u)}`); }));
      });
    });
    const text = 'hello wörld+&=%x';
    await page.keyboard.type(text, { delay: 0 });
    await frames(page);
    ok(await page.inputValue('#q') === text, `input keeps every keystroke (${await page.inputValue('#q')})`);
    ok(await q(page) === text, `url().q === typed (${await q(page)})`);
    ok(new URL(page.url()).searchParams.get('q') === text, `address bar q (${page.url()})`);
    ok(await page.textContent('#qout') === text, 'bound text updated');
    ok((await page.evaluate(() => window.__lag)).length === 0, `no lag per keystroke (${JSON.stringify(await page.evaluate(() => window.__lag.slice(0, 3)))})`);
    // Caret in the middle survives the binding.
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('Z');
    await frames(page);
    const v = await page.inputValue('#q');
    ok(v === 'hello wörld+&Z=%x', `mid-caret edit (${v})`);
    ok(await page.evaluate(() => document.getElementById('q').selectionStart) === text.length - 2, 'caret stays after the inserted char');
    const e1 = await entries(page);
    ok(e1.n === e0.n && e1.h === e0.h, `replace adds no entries (${JSON.stringify(e0)} -> ${JSON.stringify(e1)})`);
    ok(await active(page) === '#q', `focus stays in the input (${await active(page)})`);
    // navigate() itself: url() is current before it returns.
    const r = await page.evaluate(() => { const p = window.__router.navigate('?q=zz', { replace: true });
      const now = window.__router.url().searchParams.get('q'); return p.then((res) => ({ now, res, loc: location.search })); });
    ok(r.now === 'zz' && r.res === 'done' && r.loc === '?q=zz', `navigate() updates url() before returning (${JSON.stringify(r)})`);
    ok(await page.title() === 'List', 'search-only keeps the title');
  },

  async hash(page, ok) {
    const e0 = await entries(page);
    await page.click('#hash');
    await settle(page);
    const top = () => page.evaluate(() => Math.round(document.getElementById('section').getBoundingClientRect().top));
    ok(path(page) === '/#section', `hash link commits (${path(page)})`);
    ok(await page.evaluate(() => window.__router.url().hash) === '#section', 'url().hash updated');
    ok(Math.abs(await top(page)) <= 2, `hash link scrolls to the fragment (section top ${await top(page)})`);
    ok(await h1(page) === 'List' && !(await active(page)).startsWith('h1'), `no rebuild, no focus move (${await active(page)})`);
    ok((await entries(page)).n === e0.n + 1, 'hash link pushes one entry');
    await page.evaluate(() => { history.scrollRestoration; window.scrollTo(0, 0); });
    await page.goBack();
    await settle(page);
    ok(path(page) === '/', `back from the hash (${path(page)})`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames(page);
    const res = await page.evaluate(() => window.__router.navigate('#section'));
    await settle(page);
    ok(res === 'done' && path(page) === '/#section', `hash-only navigate() (${res} ${path(page)})`);
    ok(browserName === 'firefox' /* Firefox 155 skips this scroll without jasno too (link, Back, navigation.navigate("#x")) */ || Math.abs(await top(page)) <= 2, `hash-only navigate() scrolls to the fragment (section top ${await top(page)})`);
    ok(await page.evaluate(() => window.__notes.length) === 0, `hash-only changes announce nothing (${await page.evaluate(() => JSON.stringify(window.__notes))})`);
  },

  async backForward(page, ok) {
    const e0 = await entries(page);
    await page.click('#nav-a');
    await settle(page);
    ok(await h1(page) === 'Page A' && await active(page) === 'h1(Page A)', `link → /a, h1 focused (${await active(page)})`);
    ok(await page.title() === 'Page A', 'title Page A');
    const e1 = await entries(page);
    ok(e1.n === e0.n + 1 && e1.i === e0.i + 1, `one entry pushed (${JSON.stringify(e1)})`);
    await page.goBack();
    await settle(page);
    ok(await h1(page) === 'List' && await active(page) === 'h1(List)', `goBack → /, h1 focused (${await active(page)})`);
    ok(await page.title() === 'List', 'title List after back');
    await page.goForward();
    await settle(page);
    ok(await h1(page) === 'Page A' && path(page) === '/a', `goForward → /a (${path(page)})`);
    const r = await page.evaluate(() => window.__router.back('/b'));
    await settle(page);
    ok(r === 'done' && path(page) === '/' && await h1(page) === 'List', `router.back() traverses (${r} ${path(page)})`);
    const e2 = await entries(page);
    ok(e2.n === e1.n && e2.i === e0.i, `router.back() is a traverse, no new entry (${JSON.stringify(e2)})`);
    ok(JSON.stringify(await page.evaluate(() => window.__notes)) === '["Page A","List","Page A","List"]', `announcements (${await page.evaluate(() => JSON.stringify(window.__notes))})`);
  },

  async deepLinkBack(page, ok) { // starts at /?card=5 (see starts)
    ok(await page.evaluate(() => document.querySelector('dialog')?.open === true), 'deep link opens the card dialog');
    const e0 = await entries(page);
    await page.click('#card-close');
    await settle(page);
    ok(path(page) === '/', `close → / (${path(page)})`);
    ok(await page.evaluate(() => !document.querySelector('dialog')), 'dialog removed');
    const e1 = await entries(page);
    ok(e1.n === e0.n && e1.h === e0.h && e1.i === e0.i, `fallback replaces, no extra entry (${JSON.stringify(e0)} -> ${JSON.stringify(e1)})`);
    ok(await h1(page) === 'List', 'still in the app');
    const fl = await page.evaluate(() => window.__JASNO__.diagnostics({ code: 'FOCUS_LOST' }).length);
    ok(fl === 0, `RECIPE detail-over-list, closing a deep-linked card reports no FOCUS_LOST (${fl})`);
  },

  async detailOverList(page, ok) {
    await page.evaluate(() => { document.querySelector('main h1').__mark = 1; });
    const e0 = await entries(page);
    for (const [n, how] of [[20, 'close button'], [21, 'Escape'], [22, 'goBack']]) {
      await page.locator('#card' + n).scrollIntoViewIfNeeded();
      const y = await page.evaluate(() => scrollY);
      await page.click('#card' + n);
      await settle(page);
      ok(path(page) === '/?card=' + n, `open card ${n} (${path(page)})`);
      ok(await page.evaluate(() => document.querySelector('dialog')?.open === true), `card ${n} dialog open`);
      ok(await active(page) === '#card-close', `focus in the dialog (${await active(page)})`);
      ok(await page.evaluate(() => scrollY) === y, `scroll kept on open (${y} → ${await page.evaluate(() => scrollY)})`);
      ok((await entries(page)).i === e0.i + 1, 'open pushes an entry');
      if (how === 'close button') await page.click('#card-close');
      else if (how === 'Escape') await page.keyboard.press('Escape');
      else await page.goBack();
      await settle(page);
      await frames(page);
      ok(path(page) === '/', `${how} closes → / (${path(page)})`);
      ok(await page.evaluate(() => !document.querySelector('dialog')), `${how}: dialog removed`);
      const e = await entries(page);
      ok(e.i === e0.i, `${how}: went back, not forward (${JSON.stringify(e)})`);
      ok(await active(page) === '#card' + n, `${how}: focus back on the opener (${await active(page)})`);
      ok(await page.evaluate(() => scrollY) === y, `${how}: scroll kept (${y} → ${await page.evaluate(() => scrollY)})`);
      ok(await page.evaluate(() => document.querySelector('main h1').__mark === 1), `${how}: list not rebuilt`);
    }
    await page.goForward();
    await settle(page);
    ok(await page.evaluate(() => document.querySelector('dialog')?.open === true) && path(page) === '/?card=22', 'forward reopens card 22');
    await page.click('#card-close');
    await settle(page);
    ok(path(page) === '/' && (await entries(page)).i === e0.i, `close after forward goes back (${path(page)})`);
    ok(await page.evaluate(() => window.__notes.length) === 0, `search-only navigations announce nothing (${await page.evaluate(() => JSON.stringify(window.__notes))})`);
  },

  async guardRedirect(page, ok) {
    const e0 = await entries(page);
    await page.click('#nav-guard');
    await settle(page);
    ok(path(page) === '/a' && await h1(page) === 'Page A', `guard redirects to /a (${path(page)})`);
    const e1 = await entries(page);
    ok(e1.n === e0.n + 1 && e1.h === e0.h + 1, `link-click guard redirect keeps the previous entry, leaves no /guard entry (${JSON.stringify(e0)} -> ${JSON.stringify(e1)})`);
    ok(!(await page.evaluate(() => navigation.entries().map((e) => e.url))).some((u) => u.includes('/guard')), 'no /guard in entries');
    ok(await active(page) === 'h1(Page A)', `focus on h1 (${await active(page)})`);
    await page.goBack();
    await settle(page);
    ok(path(page) === '/', `back goes to / (${path(page)})`);
    // Deep link to the guard.
    await page.goto(base + '/guard');
    await settle(page);
    ok(path(page) === '/a' && await h1(page) === 'Page A', `deep-linked guard → /a (${path(page)})`);
    ok(!(await page.evaluate(() => navigation.entries().map((e) => e.url))).some((u) => u.includes('/guard')), 'deep link: no /guard entry');
  },

  async supersede(page, ok) {
    const e0 = await entries(page);
    const r = await page.evaluate(async () => {
      const p1 = window.__router.navigate('/slow');
      await new Promise((ok) => setTimeout(ok, 50));
      const p2 = window.__router.navigate('/a', { replace: true });
      return Promise.all([p1, p2]);
    });
    await settle(page);
    ok(r[0] === 'superseded' && r[1] === 'done', `results ${JSON.stringify(r)}`);
    ok(path(page) === '/a' && await page.title() === 'Page A', `ends on /a (${path(page)} ${await page.title()})`);
    const e1 = await entries(page);
    ok(e1.n === e0.n + 1 && e1.h === e0.h + 1, `replace replaced the superseded entry (${JSON.stringify(e0)} -> ${JSON.stringify(e1)})`);
    ok(await page.evaluate(() => window.__router.isLoading()) === false, 'isLoading false');
    const r2 = await page.evaluate(async () => {
      const p1 = window.__router.navigate('/slow');
      const p2 = window.__router.navigate('/b');
      return Promise.all([p1, p2]);
    });
    await settle(page);
    const e2 = await entries(page);
    ok(r2[0] === 'superseded' && r2[1] === 'done' && path(page) === '/b', `push supersede ${JSON.stringify(r2)} ${path(page)}`);
    ok(e2.n === e1.n + 2, `push keeps both entries (${JSON.stringify(e2)})`);
  },

  async getForm(page, ok) {
    await mark(page);
    await page.fill('#getq', 'abc def');
    await page.click('#getgo');
    await settle(page);
    ok(path(page) === '/search?q=abc+def', `GET form navigates (${path(page)})`);
    ok(await marked(page), 'GET form intercepted (no document load)');
    ok(await h1(page) === 'Search' && await page.textContent('#sq') === 'abc def', `search view renders q (${await page.textContent('#sq').catch(() => '?')})`);
    ok(await active(page) === 'h1(Search)', `focus on h1 (${await active(page)})`);
  },

  async postForm(page, ok) {
    await mark(page);
    const res = page.waitForResponse((r) => r.request().method() === 'POST');
    await page.click('#postgo');
    const status = (await res).status();
    await page.waitForLoadState('load');
    ok(!(await marked(page)), 'POST form left to the browser (document loaded)');
    // jasno dev, like a static host, answers only GET (its SPA fallback is GET-only): the POST reaches the server.
    ok(path(page) === '/a' && status === 405, `POST sent to the server (${path(page)}, ${status})`);
    await page.goBack();
    await settle(page);
  },

  async download(page, ok) {
    await mark(page);
    const dl = page.waitForEvent('download', { timeout: 5000 }).then(() => true, () => false);
    await page.click('#nav-download');
    ok(await dl, 'download link downloads (download event)');
    await frames(page);
    ok(await marked(page) && path(page) === '/' && await h1(page) === 'List', `download link left alone (${path(page)})`);
  },

  async unmatchedLinks(page, ok) {
    await mark(page);
    await page.click('#nav-plain');
    await page.waitForSelector('h1:text("Plain page")');
    ok(!(await marked(page)) && path(page) === '/assets/plain.html', 'unmatched static link loads normally');
    await page.goBack();
    await settle(page);
    ok(await h1(page) === 'List', `back from the static page renders the app (${await h1(page)})`);
    await mark(page);
    await page.click('#nav-nope');
    await page.waitForSelector('main h1:text("Page not found")');
    ok(!(await marked(page)), 'unmatched /nope link loads the document (then notFound)');
    ok(await page.title() === 'Probe', `notFound keeps index.html title (${await page.title()})`);
    await page.goto(base + '/a');
    await settle(page);
    await mark(page);
    const r = await page.evaluate(() => window.__router.navigate('/nope'));
    await settle(page);
    ok(r === 'done' && await marked(page) && await h1(page) === 'Page not found', `navigate('/nope') renders notFound in-app (${r})`);
    ok(await page.title() === 'Probe', `title restored for notFound (${await page.title()})`);
    ok(await active(page) === 'h1(Page not found)', `focus on notFound h1 (${await active(page)})`);
  },

  async targetSelf(page, ok) {
    await mark(page);
    await page.click('#nav-self');
    await page.waitForSelector('main h1:text("Page A")');
    await settle(page);
    ok(!(await marked(page)), 'a[target=_self] is left to the browser (B17.4 "links with a target")');
  },

  async scroll(page, ok) {
    await page.locator('#bottom-a').scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => scrollY);
    ok(y > 2000, `scrolled down (${y})`);
    await page.click('#bottom-a');
    await settle(page);
    ok(path(page) === '/a' && await page.evaluate(() => scrollY) === 0, `push → top (${await page.evaluate(() => scrollY)})`);
    await page.goBack();
    await settle(page);
    const y2 = await page.evaluate(() => scrollY);
    ok(Math.abs(y2 - y) <= 1, `traverse restores scroll (${y} vs ${y2})`);
    await page.evaluate(() => window.scrollTo(0, 900));
    await frames(page);
    await page.evaluate(() => document.getElementById('sort').click());
    await settle(page);
    ok(path(page) === '/?sort=asc' && await page.evaluate(() => scrollY) === 900, `search-only link keeps scroll (${await page.evaluate(() => scrollY)})`);
    await page.evaluate(() => window.__router.navigate('?z=1', { replace: true }));
    await settle(page);
    ok(await page.evaluate(() => scrollY) === 900, `search-only navigate() keeps scroll (${await page.evaluate(() => scrollY)})`);
    await page.goBack();
    await settle(page);
    ok(path(page) === '/' && await page.evaluate(() => scrollY) === 900, `search-only traverse keeps scroll (${path(page)} ${await page.evaluate(() => scrollY)})`);
  },

  async focus(page, ok) {
    await page.click('#nav-b');
    await settle(page);
    ok(await active(page) === '#bname', `[autofocus] input focused (${await active(page)})`);
    ok(await page.title() === 'Probe', `route without title restores index.html title (${await page.title()})`);
    await page.click('#nav-dlg');
    await settle(page);
    ok(await page.evaluate(() => document.querySelector('dialog')?.open === true), 'dialog opened in onMount');
    ok(await active(page) === '#dlg-ok', `[autofocus] inside the open dialog focused, hidden one skipped (${await active(page)})`);
    ok(await page.title() === 'Dialog page', 'title Dialog page');
    await page.keyboard.press('Escape');
    await frames(page);
    await page.click('#nav-a');
    await settle(page);
    ok(await active(page) === 'h1(Page A)', `h1 focused (${await active(page)})`);
    ok(await page.evaluate(() => document.querySelector('main h1').getAttribute('tabindex')) === '-1', 'h1 got tabindex=-1');
    ok(JSON.stringify(await page.evaluate(() => window.__notes)) === '["Page B heading","Dialog page","Page A"]', `announcements (${await page.evaluate(() => JSON.stringify(window.__notes))})`);
  },

  async liveRegion(page, ok) { // ariaNotify removed by an init script
    ok(await page.evaluate(() => typeof document.body.ariaNotify) === 'undefined', 'ariaNotify removed');
    await page.click('#nav-a');
    await settle(page);
    const lr = () => page.evaluate(() => [...document.querySelectorAll('[aria-live=polite]')].map((e) => e.textContent));
    ok(JSON.stringify(await lr()) === '["Page A"]', `live region says the title (${JSON.stringify(await lr())})`);
    await page.click('#nav-b');
    await settle(page);
    ok(JSON.stringify(await lr()) === '["Page B heading"]', `one live region, h1 text (${JSON.stringify(await lr())})`);
    ok(await page.evaluate(() => { const r = document.querySelector('[aria-live=polite]').getBoundingClientRect(); return r.width <= 1 && r.height <= 1; }), 'live region visually hidden');
  },

  async preload(page, ok) {
    const reqs = [];
    page.on('request', (r) => { if (r.url().includes('/src/views/lazy.ts')) reqs.push(r.url()); });
    await page.hover('#nav-lazy');
    await page.waitForTimeout(300);
    ok(reqs.length === 1, `hover preloads the view module (${reqs.length} requests)`);
    await page.click('#nav-lazy');
    await settle(page);
    ok(await h1(page) === 'Lazy' && reqs.length === 1, `click reuses it (${reqs.length} requests)`);
    const r2 = [];
    page.on('request', (r) => { if (r.url().includes('/src/views/b.ts')) r2.push(r.url()); });
    await page.focus('#nav-b');
    await page.waitForTimeout(300);
    ok(r2.length === 1, `focusin preloads (${r2.length})`);
  },

  async importFailed(page, ok) {
    await mark(page);
    const docs = [];
    page.on('request', (r) => { if (r.resourceType() === 'document') docs.push(r.url()); });
    await page.click('#nav-broken');
    await page.waitForSelector('main h1:text("Something went wrong")', { timeout: 5000 });
    await settle(page);
    ok(docs.some((u) => u.endsWith('/broken')), `VIEW_IMPORT_FAILED performs a full document navigation (documents: ${JSON.stringify(docs)})`);
    ok(!(await marked(page)), 'the page was reloaded (marker gone)');
    return { expect: ['VIEW_IMPORT_FAILED'] };
  },

  async commitFirst(page, ok) {
    await page.click('#nav-probe');
    await settle(page);
    const saw = await page.evaluate(() => window.__loaderSaw);
    ok(saw.path === '/probe' && saw.entry === '/probe', `link click commits the URL before the loader runs (loader saw ${JSON.stringify(saw)})`);
    await page.evaluate(() => window.__router.navigate('/'));
    await settle(page);
    await page.evaluate(() => window.__router.navigate('/probe'));
    await settle(page);
    const saw2 = await page.evaluate(() => window.__loaderSaw);
    ok(saw2.path === '/probe', `navigate(): URL committed before the loader runs (loader saw ${JSON.stringify(saw2)})`);
  },

  async gatedBack(page, ok) {
    await page.click('#nav-gated');
    await settle(page);
    ok(path(page) === '/gated', `gate open → /gated (${path(page)})`);
    await page.click('#nav-b');
    await settle(page);
    await page.evaluate(() => { window.__deny = true; });
    await page.goBack(); // traverse to /gated, whose loader now redirects with replace
    await settle(page);
    const urls = await page.evaluate(() => ({ urls: navigation.entries().map((e) => new URL(e.url).pathname), i: navigation.currentEntry.index }));
    ok(path(page) === '/a', `redirect on back → /a (${path(page)})`);
    ok(JSON.stringify(urls) === JSON.stringify({ urls: ['/', '/a', '/b'], i: 1 }), `guard redirect on Back replaces the traversed-to entry (entries ${JSON.stringify(urls)})`);
  },

  async backDuringLoad(page, ok) {
    await page.evaluate(() => { document.querySelector('main h1').__mark = 1; });
    const r = page.evaluate(() => window.__router.navigate('/slow'));
    await page.waitForTimeout(100);
    await page.goBack();
    await settle(page);
    ok(await r === 'superseded', `pending navigation superseded (${await r})`);
    ok(path(page) === '/' && await page.evaluate(() => document.querySelector('main h1').__mark === 1), `back to / keeps the list view (${path(page)})`);
    ok(await page.evaluate(() => window.__router.isLoading()) === false, 'isLoading false');
    ok(await page.title() === 'List', `title List (${await page.title()})`);
  },

  async noHeading(page, ok) {
    await page.click('#nav-nohead');
    await settle(page);
    ok((await active(page)).startsWith('main'), `focus on main (${await active(page)})`);
    ok(await page.evaluate(() => document.querySelector('main').getAttribute('tabindex')) === '-1', 'main got tabindex=-1');
    const d = await page.evaluate(() => window.__JASNO__.diagnostics().map((x) => x.code));
    ok(JSON.stringify(d) === '["VIEW_NO_HEADING"]', `VIEW_NO_HEADING reported (${JSON.stringify(d)})`);
    return { expect: ['VIEW_NO_HEADING'] };
  },

  async reload(page, ok) {
    await page.click('#nav-a');
    await settle(page);
    await mark(page);
    await page.evaluate(() => location.reload());
    await page.waitForTimeout(800);
    await settle(page);
    ok(!(await marked(page)), 'location.reload() reloads the document');
  },
};

const starts = { deepLinkBack: '/?card=5' };
const results = {};
let browserName;
for (const [bname, type] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  const browser = await type.launch();
  browserName = bname;
  const log = [];
  for (const [name, fn] of Object.entries(scenarios)) {
    if (only && !name.includes(only)) continue;
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 800, height: 600 } });
    await ctx.addInitScript(name === 'liveRegion' ? dropNotify : spyNotify);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
    const checks = [];
    const ok = (c, msg) => checks.push(`${c ? 'ok  ' : 'FAIL'} ${msg}`);
    let expect = [];
    try {
      await page.goto(base + (starts[name] ?? '/'));
      await settle(page);
      expect = (await fn(page, ok))?.expect ?? [];
      const diags = await page.evaluate(() => window.__JASNO__?.diagnostics().map((d) => `${d.code}: ${d.message}`) ?? ['no __JASNO__']);
      const unexpected = diags.filter((d) => !expect.some((c) => d.startsWith(c)));
      ok(unexpected.length === 0, `diagnostics ${JSON.stringify(diags)}`);
      const errs = errors.filter((e) => !expect.some((c) => e.includes(c)) && !/Failed to load resource|404|disallowed MIME|Loading failed for the module/.test(e));
      ok(errs.length === 0, `console ${JSON.stringify(errors.slice(0, 4))}`);
    } catch (e) {
      checks.push(`FAIL exception: ${String(e).split('\n').slice(0, 3).join(' | ')}`);
      if (errors.length) checks.push(`     console: ${JSON.stringify(errors.slice(0, 4))}`);
    }
    await ctx.close();
    log.push(`-- ${name}`, ...checks.map((c) => '   ' + c));
  }
  await browser.close();
  results[bname] = log;
}
server.kill();
for (const [b, log] of Object.entries(results)) console.log(`== ${b}\n${log.join('\n')}`);
const fails = Object.values(results).flat().filter((l) => /^\s*FAIL\b/.test(l)).length;
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
