// Spec conformance: router navigation pipeline (design.md B17.5-B17.7, B17.10, B17.12, B17.13, B17.16, B17.17,
// B7.3, B7.4; ADR-21; RECIPES "Router", "Redirect", "Per-param lifecycle"). History adapter (happy-dom).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { component, effect, h, onMount, signal, untracked, type Read } from 'jasno';
import { createRouter, route } from 'jasno/router';
import { mountTest, settled } from 'jasno/testing';
import { capture, codeOf, deferred, tick } from '../helpers.ts';
import { hooks } from '../../src/core.ts'; // only to untrack one deliberately leaked promise

type Ctx = Parameters<typeof mountTest>[0];
type Routes = Parameters<typeof createRouter>[0];
type ViewModule = { default: (p: any) => Node }; // eslint-disable-line @typescript-eslint/no-explicit-any -- one probe for every pattern

interface Probe { builds: number; cleanups: number; setupTitle: string[]; firstEffectTitle: string[] }

/** A view module whose component counts builds and cleanups and records document.title at setup and first effect. */
function probe(name: string, extra: (p: { params: Read<any>; data: Read<any> }) => Node = () => h.p(null)) {
  const s: Probe = { builds: 0, cleanups: 0, setupTitle: [], firstEffectTitle: [] };
  const mod: ViewModule = {
    default: component(function Probe(p: { params: Read<any>; data: Read<any> }): Node {
      s.builds++;
      s.setupTitle.push(document.title);
      let first = true;
      effect(() => { p.params(); if (first) { first = false; s.firstEffectTitle.push(document.title); } });
      onMount(() => () => { s.cleanups++; });
      return h.section(null, h.h1(null, name), h.p({ class: 'params' }, () => JSON.stringify(p.params())), h.p({ class: 'data' }, () => String(p.data())), extra(p));
    }) as ViewModule['default'],
  };
  return { s, view: async () => mod };
}

const errorView = (e: unknown, retry: () => void) =>
  h.section({ role: 'alert' }, h.h1(null, 'Error'), h.p(null, String((e as Error)?.message ?? e)), h.button({ onclick: retry }, 'Retry'));
const notFound = () => h.section(null, h.h1(null, 'Not found'));

function setup(t: Ctx, routes: Routes, start = '/', opts: { error?: typeof errorView; notFound?: typeof notFound } = {}) {
  history.replaceState(null, '', start);
  const router = createRouter(routes, { error: opts.error ?? errorView, notFound: opts.notFound ?? notFound });
  const view = mountTest(t, () => h.main(null, router.outlet()));
  const text = (sel: string) => view.root.querySelector(sel)?.textContent;
  return { router, view, text };
}

/** Identity check without assert's deep inspection of DOM nodes (happy-dom nodes are huge to print). */
const same = (a: unknown, b: unknown, msg?: string) => assert.ok(a === b, `${msg ?? 'not the same node'}: ${describe(a)} vs ${describe(b)}`);
const describe = (n: unknown) => (n instanceof Element ? `<${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}>${(n.textContent ?? '').slice(0, 30)}` : String(n));

const liveText = () => document.querySelector('body > [aria-live=polite]')?.textContent;

// ---------------------------------------------------------------- B17.5 pipeline

test('B17.5/B17.16 isLoading is true while loading, the URL commits before the loader, url() keeps describing the rendered view', async (t) => {
  const slow = deferred<string>();
  const atLoader: Record<string, unknown> = {};
  let router!: ReturnType<typeof setup>['router'];
  ({ router } = setup(t, [
    route('/', { view: probe('home').view }),
    route('/slow', { view: probe('slow').view, loader: () => {
      Object.assign(atLoader, { location: location.pathname, url: router.url().pathname, isLoading: router.isLoading() });
      return slow.promise;
    } }),
  ]));
  await settled();
  assert.equal(router.isLoading(), false);
  const p = router.navigate('/slow');
  assert.equal(router.isLoading(), true, 'isLoading true as the navigation starts');
  await tick();
  assert.deepEqual(atLoader, { location: '/slow', url: '/', isLoading: true }, 'URL committed before the loader; url() still the rendered view');
  assert.equal(document.querySelector('main h1')?.textContent, 'home');
  slow.resolve('data');
  assert.equal(await p, 'done');
  assert.equal(router.isLoading(), false);
  assert.equal(router.url().pathname, '/slow');
  assert.equal(document.querySelector('main .data')?.textContent, 'data');
});

test('B17.5 the loader and the view import run in parallel', async (t) => {
  const imp = deferred<ViewModule>();
  const load = deferred<string>();
  const calls: string[] = [];
  const target = probe('p');
  const { router, text } = setup(t, [
    route('/', { view: probe('home').view }),
    route('/p', { view: () => { calls.push('import'); return imp.promise; }, loader: () => { calls.push('loader'); return load.promise; } }),
  ]);
  await settled();
  const p = router.navigate('/p');
  await tick();
  assert.deepEqual([...calls].sort(), ['import', 'loader'], 'both started before either settled');
  load.resolve('x');
  await tick();
  assert.equal(text('h1'), 'home', 'waits for the import');
  imp.resolve(await target.view());
  assert.equal(await p, 'done');
  assert.equal(text('.data'), 'x');
});

test('B17.5 success: at resolution the view is rendered, focus moved, announced, isLoading false', async (t) => {
  const { router, view } = setup(t, [route('/', { view: probe('home').view }), route('/next', { view: probe('next').view, title: 'Next page', loader: async () => 1 })]);
  await settled();
  const p = router.navigate('/next');
  const r = await p;
  assert.equal(r, 'done');
  same(document.activeElement, view.root.querySelector('h1'));
  assert.equal(document.activeElement?.textContent, 'next');
  assert.equal(liveText(), 'Next page');
  assert.equal(router.isLoading(), false);
  assert.equal(router.url().pathname, '/next');
  assert.equal(document.title, 'Next page');
});

test('B17.5 same route, new params: view kept (no rebuild, no cleanup), params/data/url update together, title function re-runs', async (t) => {
  const pairs: string[] = [];
  let router!: ReturnType<typeof setup>['router'];
  const v = probe('u', (p) => { effect(() => { pairs.push(`${p.params().id}:${router.url().pathname}:${p.data()}`); }); return h.p(null); });
  ({ router } = setup(t, [route('/u/:id', { view: v.view, loader: async ({ params }) => `D${params.id}`, title: (d) => `T ${d}` })], '/u/1'));
  await settled();
  assert.equal(document.title, 'T D1');
  assert.equal(await router.navigate('/u/2'), 'done');
  assert.equal(v.s.builds, 1);
  assert.equal(v.s.cleanups, 0);
  assert.equal(document.querySelector('main .params')?.textContent, '{"id":"2"}');
  assert.equal(document.querySelector('main .data')?.textContent, 'D2');
  assert.equal(document.title, 'T D2');
  assert.deepEqual(pairs, ['1:/u/1:D1', '2:/u/2:D2'], 'an effect never sees params, data and url out of step');
});

test('B17.5/B17.10 same route, new params: a view effect that writes document.title still wins over the title binding', async (t) => {
  const v = probe('u', (p) => { effect(() => { document.title = `Effect ${p.params().id}`; }); return h.p(null); });
  const { router } = setup(t, [route('/u/:id', { view: v.view, loader: async ({ params }) => params.id, title: (d) => `Binding ${d}` })], '/u/1');
  await settled();
  assert.equal(document.title, 'Effect 1');
  await router.navigate('/u/2');
  assert.equal(document.title, 'Effect 2');
});

test('B17.5/B17.10 the title binding is created before the view is built: setup and the first effect run see the new title', async (t) => {
  document.title = 'Index';
  const a = probe('a'), b = probe('b'), c = probe('c');
  const { router } = setup(t, [
    route('/', { view: a.view, title: 'A title' }),
    route('/b', { view: b.view, loader: async () => 'bee', title: (d) => `B ${d}` }),
    route('/c', { view: c.view }),
  ]);
  await settled();
  await router.navigate('/b');
  await router.navigate('/c');
  assert.deepEqual([a.s.setupTitle, a.s.firstEffectTitle], [['A title'], ['A title']]);
  assert.deepEqual([b.s.setupTitle, b.s.firstEffectTitle], [['B bee'], ['B bee']]);
  assert.deepEqual([c.s.setupTitle, c.s.firstEffectTitle], [['Index'], ['Index']], 'a route without title restores index.html title before the view');
});

test('B17.5 flush before focus: a dialog opened in onMount is open, and its [autofocus] gets focus', async (t) => {
  const { router } = setup(t, [route('/', { view: probe('home').view }), route('/d', { view: probe('d', () => {
    const d = h.dialog({ 'aria-label': 'Detail' }, h.button({ autofocus: true, id: 'in-dialog' }, 'Close'));
    onMount(() => { d.showModal(); return () => d.close(); });
    return d;
  }).view })]);
  await settled();
  await router.navigate('/d');
  assert.equal((document.activeElement as HTMLElement | null)?.id, 'in-dialog');
});

test('B17.5 failure: url shows the attempted URL, the previous view owner is disposed, the title restored, isLoading false', async (t) => {
  document.title = 'Index';
  const home = probe('home');
  const boom = new Error('down');
  let got: unknown;
  const { router, text } = setup(t, [route('/', { view: home.view, title: 'Home' }), route('/x', { view: probe('x').view, title: 'X', loader: async () => { throw boom; } })],
    '/', { error: (e, retry) => { got = e; return errorView(e, retry); } });
  await settled();
  assert.equal(document.title, 'Home');
  assert.equal(await router.navigate('/x'), 'failed');
  assert.equal(got, boom, 'the error view receives the loader error itself');
  assert.equal(text('[role=alert] p'), 'down');
  assert.equal(router.url().pathname, '/x');
  assert.equal(home.s.cleanups, 1, 'previous view owner disposed');
  assert.equal(document.title, 'Index');
  assert.equal(router.isLoading(), false);
});

// ---------------------------------------------------------------- B7.3, B7.4 loader abortSignal

test('B7.3/B7.4 a superseded navigation aborts its loader signal with an AbortError; its late settlement is ignored', async (t) => {
  const slow = deferred<string>();
  let signal!: AbortSignal;
  const slowView = probe('slow');
  const { router, text } = setup(t, [
    route('/', { view: probe('home').view }),
    route('/slow', { view: slowView.view, loader: ({ abortSignal }) => { signal = abortSignal; return slow.promise; } }),
    route('/b', { view: probe('b').view }),
  ]);
  await settled();
  const first = router.navigate('/slow');
  await tick();
  assert.equal(signal.aborted, false);
  const second = router.navigate('/b');
  assert.equal(signal.aborted, true);
  assert.ok(signal.reason instanceof DOMException && signal.reason.name === 'AbortError');
  assert.equal(await first, 'superseded');
  assert.equal(await second, 'done');
  slow.resolve('late');
  await settled();
  assert.equal(text('h1'), 'b');
  assert.equal(slowView.s.builds, 0);
});

test('B7.4 a loader rejecting with an AbortError from its own controller is a failed navigation', async (t) => {
  let own: unknown;
  const { router, text } = setup(t, [
    route('/', { view: probe('home').view }),
    route('/t', { view: probe('t').view, loader: async () => { const ac = new AbortController(); ac.abort(); own = ac.signal.reason; throw own; } }),
  ]);
  await settled();
  assert.equal(await router.navigate('/t'), 'failed');
  assert.ok(own instanceof DOMException && own.name === 'AbortError');
  assert.equal(text('[role=alert] h1'), 'Error');
});

test('B7.4 a loader that rejects with the (unaborted) signal-shaped TimeoutError is a failure too', async (t) => {
  const { router, text } = setup(t, [
    route('/', { view: probe('home').view }),
    route('/t', { view: probe('t').view, loader: async () => { throw new DOMException('timed out', 'TimeoutError'); } }),
  ]);
  await settled();
  assert.equal(await router.navigate('/t'), 'failed');
  assert.equal(text('[role=alert] p'), 'timed out');
});

// ---------------------------------------------------------------- B17.6 notFound

test('B17.6 navigate() to an unmatched URL: previous view disposed, notFound focused and announced, url updated, resolves done', async (t) => {
  const home = probe('home');
  const { router, view } = setup(t, [route('/', { view: home.view, title: 'Home' })]);
  await settled();
  assert.equal(await router.navigate('/missing?x=1'), 'done');
  assert.equal(home.s.cleanups, 1);
  assert.equal(view.root.querySelector('main h1')?.textContent, 'Not found');
  same(document.activeElement, view.root.querySelector('main h1'));
  assert.equal(liveText(), 'Not found');
  assert.equal(router.url().href, 'http://localhost/missing?x=1');
  assert.equal(router.isLoading(), false);
});

test('B17.6/B17.8 an unmatched start URL renders notFound without moving focus', async (t) => {
  const before = document.activeElement;
  const { router, text } = setup(t, [route('/', { view: probe('home').view })], '/nope');
  await settled();
  assert.equal(text('h1'), 'Not found');
  same(document.activeElement, before);
  assert.equal(router.url().pathname, '/nope');
});

// ---------------------------------------------------------------- B17.7 search- and hash-only

test('B17.7 search-only navigate(): url updated synchronously; no loader, no rebuild, no focus move, isLoading stays false', async (t) => {
  let loads = 0;
  const v = probe('list', () => h.input({ 'aria-label': 'Filter', id: 'filter' }));
  const { router, view } = setup(t, [route('/u/:id', { view: v.view, loader: async () => ++loads })], '/u/1');
  await settled();
  const input = view.root.querySelector<HTMLInputElement>('#filter')!;
  input.focus();
  const p = router.navigate('?q=a');
  assert.equal(router.url().search, '?q=a', 'before navigate() returns');
  assert.equal(router.isLoading(), false);
  assert.equal(await p, 'done');
  await router.navigate('#part');
  assert.equal(router.url().hash, '#part');
  await settled();
  assert.equal(loads, 1);
  assert.deepEqual([v.s.builds, v.s.cleanups], [1, 0]);
  same(document.activeElement, input);
  assert.equal(view.root.querySelector('.data')?.textContent, '1');
});

test('B17.7 Back and forward between search-only entries update url without rebuilding or loading', async (t) => {
  let loads = 0;
  const v = probe('list');
  const { router } = setup(t, [route('/', { view: v.view, loader: async () => ++loads })]);
  await settled();
  await router.navigate('?detail=7');
  assert.equal(router.url().searchParams.get('detail'), '7');
  history.back();
  assert.equal(router.url().search, '', 'popstate updates url synchronously');
  await settled();
  history.forward();
  await settled();
  assert.equal(router.url().searchParams.get('detail'), '7');
  assert.deepEqual([loads, v.s.builds, v.s.cleanups], [1, 1, 0]);
});

test('B17.7 a search-only link click keeps the view and updates url', async (t) => {
  const v = probe('list', () => h.a({ href: '?tab=2', id: 'tab' }, 'Tab 2'));
  const { router, view } = setup(t, [route('/', { view: v.view })]);
  await settled();
  let prevented = false;
  const stop = (e: Event) => { prevented = e.defaultPrevented; e.preventDefault(); };
  window.addEventListener('click', stop);
  t.after(() => window.removeEventListener('click', stop));
  view.root.querySelector<HTMLElement>('#tab')!.click();
  assert.equal(prevented, true);
  assert.equal(router.url().search, '?tab=2');
  await settled();
  assert.equal(v.s.builds, 1);
});

test('B17.7/B17.10 a search-only navigation does not touch document.title', async (t) => {
  const { router } = setup(t, [route('/', { view: probe('home').view, title: 'Home' })]);
  await settled();
  document.title = 'Set by the app';
  await router.navigate('?q=1');
  await router.navigate('/?q=2', { replace: true });
  await settled();
  assert.equal(document.title, 'Set by the app');
});

test('B17.7 a search-only navigate() while a loader runs supersedes it; the rendered view is kept', async (t) => {
  const slow = deferred<string>();
  const home = probe('home');
  const { router, text } = setup(t, [route('/', { view: home.view }), route('/slow', { view: probe('slow').view, loader: () => slow.promise })]);
  await settled();
  const first = router.navigate('/slow');
  const second = router.navigate('/?q=1');
  assert.equal(router.url().search, '?q=1');
  assert.equal(await first, 'superseded');
  assert.equal(await second, 'done');
  assert.equal(router.isLoading(), false);
  slow.resolve('late');
  await settled();
  assert.equal(text('h1'), 'home');
  assert.deepEqual([home.s.builds, home.s.cleanups], [1, 0]);
});

// ---------------------------------------------------------------- B17.10 title

test('B17.10 a route without title restores the title document had when createRouter ran, not a later one', async (t) => {
  document.title = 'Index';
  const own = probe('own', () => { const name = signal('Own title'); effect(() => { document.title = name(); }); return h.p(null); });
  const { router } = setup(t, [route('/', { view: own.view }), route('/plain', { view: probe('plain').view }), route('/titled', { view: probe('t').view, title: 'Titled' })]);
  await settled();
  assert.equal(document.title, 'Own title', 'a view effect wins over the reset');
  await router.navigate('/titled');
  assert.equal(document.title, 'Titled');
  document.title = 'Changed later';
  await router.navigate('/plain');
  assert.equal(document.title, 'Index');
});

test('B17.10 a view that sets its title in onMount wins over the reset; so does notFound', async (t) => {
  document.title = 'Index';
  const { router } = setup(t, [
    route('/', { view: probe('home').view, title: 'Home' }),
    route('/m', { view: probe('m', () => { onMount(() => { document.title = 'Mounted'; }); return h.p(null); }).view }),
  ], '/', { notFound: () => { onMount(() => { document.title = 'Lost'; }); return notFound(); } });
  await settled();
  await router.navigate('/m');
  assert.equal(document.title, 'Mounted');
  await router.navigate('/zzz');
  assert.equal(document.title, 'Lost');
});

// ---------------------------------------------------------------- B17.12 outlet boundary, retry

test('B17.12 an error thrown by the view setup renders the error view and the navigation fails', async (t) => {
  document.title = 'Index';
  const { router, text } = setup(t, [
    route('/', { view: probe('home').view }),
    route('/bad', { view: async () => ({ default: component(function Bad(): Node { throw new Error('setup broke'); }) }), title: 'Bad' }),
  ]);
  await settled();
  assert.equal(await router.navigate('/bad'), 'failed');
  assert.equal(text('[role=alert] p'), 'setup broke');
  assert.equal(document.title, 'Index', 'the error view restores the title');
  assert.equal(router.url().pathname, '/bad');
});

test('B17.12 a later binding error replaces the view with the error view', async (t) => {
  const boom = signal(false);
  const v = probe('home', () => h.p(null, () => { if (boom()) throw new Error('binding broke'); return 'ok'; }));
  const { text } = setup(t, [route('/', { view: v.view })]);
  await settled();
  boom.set(true);
  await settled();
  assert.equal(text('[role=alert] p'), 'binding broke');
  assert.equal(v.s.cleanups, 1);
});

test('B17.12 after an effect error, the next navigation to the same URL rebuilds the view', async (t) => {
  const boom = signal(false);
  const v = probe('home', () => { effect(() => { if (boom()) throw new Error('effect broke'); }); return h.p(null); });
  const { router, text } = setup(t, [route('/', { view: v.view })]);
  await settled();
  boom.set(true);
  await settled();
  assert.equal(text('[role=alert] p'), 'effect broke');
  boom.set(false);
  assert.equal(await router.navigate('/'), 'done');
  assert.equal(text('h1'), 'home');
  assert.equal(v.s.builds, 2);
});

test('B17.12 retry() re-runs the navigation to the current URL: loader again, setup again', async (t) => {
  let loads = 0;
  let fail = true;
  const boom = signal(false);
  const v = probe('x', () => { effect(() => { if (boom()) throw new Error('later'); }); return h.p(null); });
  let retry!: () => void;
  const { router, text } = setup(t, [route('/', { view: probe('home').view }), route('/x', { view: v.view, loader: async () => { loads++; if (fail) throw new Error('down'); return loads; } })],
    '/', { error: (e, r) => { retry = r; return errorView(e, r); } });
  await settled();
  const len = history.length;
  assert.equal(await router.navigate('/x'), 'failed');
  fail = false;
  retry();
  await settled();
  assert.equal(text('.data'), '2');
  assert.equal(v.s.builds, 1);
  (document.activeElement as HTMLElement | null)?.blur(); // the outlet's own error swap and focus
  boom.set(true);
  await settled();
  assert.equal(text('[role=alert] p'), 'later');
  boom.set(false);
  retry();
  await settled();
  assert.deepEqual([text('h1'), loads, v.s.builds], ['x', 3, 2]);
  assert.equal(history.length, len + 1, 'retry adds no history entry');
});

// ---------------------------------------------------------------- B17.13 navigate()

test('B17.13 navigate() resolves relative URLs against the current location', async (t) => {
  const { router } = setup(t, [route('/a/b', { view: probe('ab').view }), route('/a/c', { view: probe('ac').view }), route('/x', { view: probe('x').view })], '/a/b?keep=1');
  await settled();
  await router.navigate('c');
  assert.equal(router.url().pathname, '/a/c');
  await router.navigate('../x');
  assert.equal(router.url().pathname, '/x');
  await router.navigate('?q=1');
  assert.equal(router.url().href, 'http://localhost/x?q=1');
  await router.navigate('#h');
  assert.equal(router.url().href, 'http://localhost/x?q=1#h');
});

test('B17.13 navigate() never rejects for navigation outcomes (sync-throwing loader, failed import, throwing title)', async (t) => {
  const { router } = setup(t, [
    route('/', { view: probe('home').view }),
    route('/sync', { view: probe('s').view, loader: (() => { throw new Error('sync'); }) as never }),
    route('/imp', { view: (): Promise<ViewModule> => Promise.reject(new SyntaxError('bad module')) }),
    route('/title', { view: probe('t').view, loader: async () => null, title: (d) => (d as unknown as { name: string }).name }),
  ]);
  await settled();
  assert.equal(await router.navigate('/sync'), 'failed');
  assert.equal(await router.navigate('/imp'), 'failed');
  assert.equal(await router.navigate('/title'), 'failed');
  assert.equal(document.querySelector('[role=alert] h1')?.textContent, 'Error');
});

test('B17.13 ROUTER_NOT_STARTED is thrown synchronously by navigate() and back(), not returned as a rejection', () => {
  const router = createRouter([route('/', { view: probe('home').view })], { error: errorView, notFound });
  let threw: unknown;
  try { void router.navigate('?q=1'); } catch (e) { threw = e; }
  assert.equal(codeOf(threw), 'ROUTER_NOT_STARTED');
});

test('B17.13 a navigate({ replace }) during the view import supersedes it and leaves no history entry behind', async (t) => {
  const imp = deferred<ViewModule>();
  const lazy = probe('lazy');
  const { router, text } = setup(t, [route('/', { view: probe('home').view }), route('/lazy', { view: () => imp.promise }), route('/login', { view: probe('login').view })]);
  await settled();
  const len = history.length;
  const first = router.navigate('/lazy');
  const second = router.navigate('/login', { replace: true });
  assert.equal(await first, 'superseded');
  assert.equal(await second, 'done');
  imp.resolve(await lazy.view());
  await settled();
  assert.equal(text('h1'), 'login');
  assert.equal(history.length, len + 1);
  assert.equal(lazy.s.builds, 0);
});

test('RECIPES Redirect: a loader redirect with replace supersedes the guarded navigation; its view never renders and no entry is left', async (t) => {
  const session = signal(false);
  const admin = probe('admin');
  let router!: ReturnType<typeof setup>['router'];
  const routes = [
    route('/', { view: probe('home').view }),
    route('/admin', { view: admin.view, loader: async () => { if (!session()) { void router.navigate('/login', { replace: true }); return null; } return 'ok'; } }),
    route('/login', { view: probe('login').view }),
  ];
  let view!: ReturnType<typeof setup>['view'];
  ({ router, view } = setup(t, routes));
  await settled();
  const len = history.length;
  assert.equal(await router.navigate('/admin'), 'superseded');
  await settled();
  assert.equal(view.root.querySelector('h1')?.textContent, 'login');
  assert.equal(location.pathname, '/login');
  assert.equal(history.length, len + 1);
  assert.equal(admin.s.builds, 0);
  view.dispose();
  // Deep link to the guarded route: the start entry is replaced.
  ({ router, view } = setup(t, routes, '/admin'));
  const startLen = history.length;
  await settled();
  assert.equal(view.root.querySelector('h1')?.textContent, 'login');
  assert.equal(history.length, startLen);
  assert.equal(admin.s.builds, 0);
});

// ---------------------------------------------------------------- B17.16 url

test('B17.16 url() never shows a superseded or still-loading URL', async (t) => {
  const seen: string[] = [];
  const slow = deferred<string>();
  let router!: ReturnType<typeof setup>['router'];
  const home = probe('home', () => { effect(() => { seen.push(router.url().pathname); }); return h.p(null); });
  ({ router } = setup(t, [route('/', { view: home.view }), route('/slow', { view: probe('slow').view, loader: () => slow.promise }), route('/b', { view: probe('b').view, loader: async () => 'b' })]));
  await settled();
  const first = router.navigate('/slow');
  await tick(); await tick();
  const second = router.navigate('/b');
  await first; await second;
  slow.resolve('late');
  await settled();
  assert.deepEqual(seen, ['/'], 'the home view never saw /slow or /b in url()');
  assert.equal(router.url().pathname, '/b');
});

// ---------------------------------------------------------------- B17.17 view import failures

test('B17.17 a loader TypeError (fetch failure) is not an import failure: no reload, the error view renders', async (t) => {
  sessionStorage.clear();
  const assigned: string[] = [];
  t.mock.method(location, 'assign', (u: string) => { assigned.push(u); });
  const cap = capture();
  const { router, text } = setup(t, [route('/', { view: probe('home').view }), route('/d', { view: probe('d').view, loader: async () => { throw new TypeError('Failed to fetch'); } })]);
  await settled();
  assert.equal(await router.navigate('/d'), 'failed');
  cap.stop();
  assert.deepEqual(assigned, []);
  assert.deepEqual(cap.codes(), []);
  assert.equal(text('[role=alert] p'), 'Failed to fetch');
});

test('B17.17 an import rejection that is not a TypeError renders the error view without a reload', async (t) => {
  sessionStorage.clear();
  const assigned: string[] = [];
  t.mock.method(location, 'assign', (u: string) => { assigned.push(u); });
  const { router, text } = setup(t, [route('/', { view: probe('home').view }), route('/m', { view: (): Promise<ViewModule> => Promise.reject(new SyntaxError('Unexpected token')) })]);
  await settled();
  assert.equal(await router.navigate('/m'), 'failed');
  assert.deepEqual(assigned, []);
  assert.equal(text('[role=alert] p'), 'Unexpected token');
});

test('B17.17 an import TypeError on the start URL reloads once; after the reload the second failure renders the error view', async (t) => {
  sessionStorage.clear();
  const assigned: string[] = [];
  t.mock.method(location, 'assign', (u: string) => { assigned.push(u); });
  const cap = capture();
  const routes = [route('/', { view: probe('home').view }), route('/lazy/:id', { view: (): Promise<ViewModule> => Promise.reject(new TypeError('Failed to fetch dynamically imported module')) })];
  let { view, text } = setup(t, routes, '/lazy/1');
  await settled();
  assert.deepEqual(assigned, ['http://localhost/lazy/1']);
  view.dispose();
  // The "reloaded" document: same session storage, a new router.
  ({ view, text } = setup(t, routes, '/lazy/1'));
  await settled();
  assert.equal(text('[role=alert] h1'), 'Error');
  assert.deepEqual(assigned, ['http://localhost/lazy/1'], 'no second reload');
  cap.stop();
  assert.deepEqual(cap.codes(), ['VIEW_IMPORT_FAILED']);
  sessionStorage.clear();
});

// ---------------------------------------------------------------- races

test('race: Back during a loader returns to the rendered view without rebuilding it; the pending navigation is superseded', async (t) => {
  const slow = deferred<string>();
  const home = probe('home');
  const { router, text } = setup(t, [route('/', { view: home.view }), route('/slow', { view: probe('slow').view, loader: () => slow.promise })]);
  await settled();
  const p = router.navigate('/slow');
  await tick();
  history.back();
  assert.equal(await p, 'superseded');
  await settled();
  assert.equal(location.pathname, '/');
  assert.equal(router.url().pathname, '/');
  assert.equal(router.isLoading(), false);
  slow.resolve('late');
  await settled();
  assert.equal(text('h1'), 'home');
  assert.deepEqual([home.s.builds, home.s.cleanups], [1, 0]);
});

test('race: Back during a loader to a different route renders that route', async (t) => {
  const slow = deferred<string>();
  const { router, text } = setup(t, [route('/a', { view: probe('a').view }), route('/b', { view: probe('b').view }), route('/slow', { view: probe('slow').view, loader: () => slow.promise })], '/a');
  await settled();
  await router.navigate('/b');
  const p = router.navigate('/slow');
  await tick();
  history.back();
  assert.equal(await p, 'superseded');
  await settled();
  assert.equal(text('h1'), 'b');
  assert.equal(router.url().pathname, '/b');
  slow.resolve('late');
  await settled();
  assert.equal(text('h1'), 'b');
});

test('race: navigate() to the current URL adds no entry, does not rebuild and does not reload data', async (t) => {
  let loads = 0;
  const v = probe('u');
  const { router } = setup(t, [route('/u/:id', { view: v.view, loader: async () => ++loads })], '/u/1?q=1');
  await settled();
  const len = history.length;
  assert.equal(await router.navigate('/u/1?q=1'), 'done');
  await settled();
  assert.equal(history.length, len);
  assert.deepEqual([loads, v.s.builds], [1, 1]);
});

test('race: navigate() twice to the same pending URL pushes one entry and renders once', async (t) => {
  const slow = deferred<string>();
  const v = probe('slow');
  let loads = 0;
  const { router, text } = setup(t, [route('/', { view: probe('home').view }), route('/slow', { view: v.view, loader: () => { loads++; return slow.promise; } })]);
  await settled();
  const len = history.length;
  const a = router.navigate('/slow');
  const b = router.navigate('/slow');
  slow.resolve('x');
  assert.equal(await a, 'superseded');
  assert.equal(await b, 'done');
  assert.equal(history.length, len + 1);
  assert.equal(text('h1'), 'slow');
  assert.equal(v.s.builds, 1);
  assert.ok(loads >= 1);
});

test('race: retry() while another navigation loads leaves a consistent state (rendered view matches url, all promises settle)', async (t) => {
  let retry!: () => void;
  const slow = deferred<string>();
  const { router, text } = setup(t, [
    route('/', { view: probe('home').view }),
    route('/x', { view: probe('x').view, loader: async () => { throw new Error('down'); } }),
    route('/slow', { view: probe('slow').view, loader: () => slow.promise }),
  ], '/', { error: (e, r) => { retry = r; return errorView(e, r); } });
  await settled();
  assert.equal(await router.navigate('/x'), 'failed');
  const p = router.navigate('/slow');
  retry();
  slow.resolve('s');
  const r = await p;
  await settled();
  assert.ok(r === 'done' || r === 'superseded');
  assert.equal(router.isLoading(), false);
  assert.equal(router.url().pathname, location.pathname);
  assert.equal(text('main h1'), router.url().pathname === '/slow' ? 'slow' : 'Error');
});

test('race: disposing the outlet during a loader resolves navigate(), aborts the loader signal, leaks no owner', async (t) => {
  const slow = deferred<string>();
  let signal!: AbortSignal;
  const target = probe('slow');
  const home = probe('home');
  const { router, view } = setup(t, [route('/', { view: home.view }), route('/slow', { view: target.view, loader: ({ abortSignal }) => { signal = abortSignal; return slow.promise; } })]);
  await settled();
  const p = router.navigate('/slow');
  await tick();
  view.dispose(); // throws EFFECT_LEAKED on a leaked owner
  assert.equal(signal.aborted, true);
  assert.ok(signal.reason instanceof DOMException && signal.reason.name === 'AbortError');
  const r = await p;
  assert.ok(r === 'superseded' || r === 'failed', r);
  assert.equal(router.isLoading(), false);
  assert.equal(home.s.cleanups, 1);
  slow.resolve('late');
  await tick();
  await tick();
  assert.equal(target.s.builds, 0);
  assert.throws(() => router.navigate('/'), (e) => codeOf(e) === 'ROUTER_NOT_STARTED');
});

test('race: disposing the outlet during the view import resolves navigate(); a new outlet renders the current URL', async (t) => {
  const imp = deferred<ViewModule>();
  const lazy = probe('lazy');
  const routes = [route('/', { view: probe('home').view }), route('/lazy', { view: () => imp.promise })];
  history.replaceState(null, '', '/');
  const router = createRouter(routes, { error: errorView, notFound });
  const first = mountTest(t, () => h.main(null, router.outlet()));
  await settled();
  const p = router.navigate('/lazy');
  await tick();
  first.dispose();
  assert.ok(['superseded', 'failed'].includes(await p));
  imp.resolve(await lazy.view());
  await tick();
  assert.equal(lazy.s.builds, 0);
  const second = mountTest(t, () => h.main(null, router.outlet()));
  await settled();
  assert.equal(second.root.querySelector('h1')?.textContent, 'lazy');
  assert.equal(router.url().pathname, '/lazy');
});

test('race: a navigate() from the new view\'s onMount supersedes; the final view, url and focus belong to the redirect target', async (t) => {
  let router!: ReturnType<typeof setup>['router'];
  ({ router } = setup(t, [
    route('/', { view: probe('home').view }),
    route('/old', { view: probe('old', () => { onMount(() => { void router.navigate('/new', { replace: true }); }); return h.p(null); }).view, title: 'Old' }),
    route('/new', { view: probe('new').view, title: 'New' }),
  ]));
  await settled();
  await router.navigate('/old');
  await settled();
  assert.equal(document.querySelector('main h1')?.textContent, 'new');
  assert.equal(router.url().pathname, '/new');
  assert.equal(document.activeElement?.textContent, 'new');
  assert.equal(liveText(), 'New');
  assert.equal(document.title, 'New');
});

// ---------------------------------------------------------------- more pipeline edges

test('B17.12/B8.3/B8.5 an effect error swap in the outlet (a catchError region) restores focus instead of reporting FOCUS_LOST', async (t) => {
  const boom = signal(false);
  const v = probe('home', () => { effect(() => { if (boom()) throw new Error('effect broke'); }); return h.button({ id: 'act' }, 'Act'); });
  const { view } = setup(t, [route('/', { view: v.view })]);
  await settled();
  view.root.querySelector<HTMLElement>('#act')!.focus();
  boom.set(true);
  await settled(); // fails with FOCUS_LOST when the outlet leaves focus on <body>
  same(document.activeElement, view.root.querySelector('[role=alert] button'), 'first focusable element of the error view (B8.5)');
});

test('B17.5/B17.12 an onMount error of the new view during the navigation flush: error view, focus on it, resolves failed', async (t) => {
  document.title = 'Index';
  const { router, view } = setup(t, [route('/', { view: probe('home').view }), route('/m', { view: probe('m', () => { onMount(() => { throw new Error('mount broke'); }); return h.p(null); }).view, title: 'M' })]);
  await settled();
  assert.equal(await router.navigate('/m'), 'failed');
  assert.equal(view.root.querySelector('[role=alert] p')?.textContent, 'mount broke');
  assert.ok(view.root.querySelector('[role=alert]')!.contains(document.activeElement));
  assert.equal(document.title, 'Index');
  assert.equal(router.isLoading(), false);
});

test('B17.9/B17.5 a failed navigation does not announce the failed route\'s title over the error view', async (t) => {
  const { router } = setup(t, [route('/', { view: probe('home').view }), route('/x', { view: probe('x').view, title: 'X page', loader: async () => { throw new Error('down'); } })]);
  await settled();
  assert.equal(await router.navigate('/x'), 'failed');
  assert.notEqual(liveText(), 'X page');
});

test('B17.5 same route, new params moves focus to the view heading (B17.8) like any navigation', async (t) => {
  const { router, view } = setup(t, [route('/u/:id', { view: probe('u').view })], '/u/1');
  await settled();
  await router.navigate('/u/2');
  same(document.activeElement, view.root.querySelector('h1'));
});

test('B17.7 search-only keeps the scroll position; hash-only scrolls to its fragment', async (t) => {
  const scrolls: unknown[] = [];
  t.mock.method(window, 'scrollTo', (...a: unknown[]) => { scrolls.push(a); });
  const intoView: string[] = [];
  t.mock.method(Element.prototype, 'scrollIntoView', function (this: Element) { intoView.push(this.id); });
  const { router } = setup(t, [route('/', { view: probe('home', () => h.p({ id: 'sec' }, 'Section')).view })]);
  await settled();
  await router.navigate('?q=1');
  await router.navigate('?q=2', { replace: true });
  assert.deepEqual(scrolls, []);
  await router.navigate('#sec');
  assert.deepEqual(intoView, ['sec']);
  assert.deepEqual(scrolls, []);
});

test('B17.8/B17.3 a loader redirect of the start URL is still the first render: focus does not move, nothing is announced', async (t) => {
  const before = document.activeElement;
  const live = document.querySelector('body > [aria-live=polite]');
  const prev = live?.textContent;
  let router!: ReturnType<typeof setup>['router'];
  ({ router } = setup(t, [
    route('/admin', { view: probe('admin').view, loader: async () => { void router.navigate('/login', { replace: true }); return null; } }),
    route('/login', { view: probe('login').view, title: 'Sign in' }),
  ], '/admin'));
  await settled();
  assert.equal(document.querySelector('main h1')?.textContent, 'login');
  same(document.activeElement, before, 'no focus move on the first rendered view');
  assert.equal(document.querySelector('body > [aria-live=polite]')?.textContent, prev, 'no announcement');
});

test('B17.8 a link click that supersedes the initial navigation before the first render moves focus (pilots contacts B1, dashboard B2)', async (t) => {
  const slow = deferred<null>();
  setup(t, [
    route('/', { view: probe('home').view, loader: () => slow.promise }),
    route('/about', { view: probe('about').view }),
  ]);
  const link = h.a({ href: '/about' }, 'About');
  document.body.append(link);
  t.after(() => link.remove());
  link.focus();
  link.click();
  await settled();
  assert.equal(document.querySelector('main h1')?.textContent, 'about');
  same(document.activeElement, document.querySelector('main h1'), 'focus moves to the new view');
  slow.resolve(null);
});

test('RECIPES Redirect: a loader redirect to a search-only URL of the rendered view keeps it and replaces the guarded entry', async (t) => {
  const home = probe('home');
  let router!: ReturnType<typeof setup>['router'];
  ({ router } = setup(t, [
    route('/', { view: home.view }),
    route('/admin', { view: probe('admin').view, loader: async () => { void router.navigate('/?login=1', { replace: true }); return null; } }),
  ]));
  await settled();
  const len = history.length;
  assert.equal(await router.navigate('/admin'), 'superseded');
  await settled();
  assert.equal(router.url().href, 'http://localhost/?login=1');
  assert.equal(history.length, len + 1);
  assert.deepEqual([home.s.builds, home.s.cleanups], [1, 0]);
});

test('race: router.back() during a loader resolves with the traversal result and supersedes the pending navigation', async (t) => {
  const slow = deferred<string>();
  const home = probe('home');
  const { router } = setup(t, [route('/', { view: home.view }), route('/slow', { view: probe('slow').view, loader: () => slow.promise })]);
  await settled();
  const p = router.navigate('/slow');
  await tick();
  const b = router.back('/');
  assert.equal(await p, 'superseded');
  assert.equal(await b, 'done');
  assert.equal(router.url().pathname, '/');
  assert.deepEqual([home.s.builds, home.s.cleanups], [1, 0]);
  slow.resolve('x');
  await settled();
});

test('race: disposing the outlet before router.back()\'s popstate arrives still settles the back() promise', async (t) => {
  const { router, view } = setup(t, [route('/', { view: probe('home').view }), route('/d', { view: probe('d').view })]);
  await settled();
  await router.navigate('/d');
  // Browsers fire popstate asynchronously after history.back(); happy-dom fires it synchronously.
  const realBack = History.prototype.back;
  t.mock.method(history, 'back', function (this: History) { setTimeout(() => realBack.call(history), 0); });
  // The never-settling promise would sit in jasno/testing's pending set and time out every later settled() in this
  // process, so this one call is not tracked.
  const saved = hooks.pending;
  hooks.pending = undefined;
  let b: Promise<string>;
  try { b = router.back('/'); } finally { hooks.pending = saved; }
  view.dispose();
  let result: unknown = 'pending';
  void b.then((r) => { result = r; });
  await new Promise((r) => setTimeout(r, 20));
  assert.notEqual(result, 'pending', 'back() promise never settles after the outlet is gone');
});

test('B17.5/B17.13 a search-only navigate() from the new view\'s onMount does not turn the completed navigation into superseded', async (t) => {
  let router!: ReturnType<typeof setup>['router'];
  ({ router } = setup(t, [
    route('/', { view: probe('home').view }),
    route('/tabs', { view: probe('tabs', () => { onMount(() => { if (!router.url().search) void router.navigate('?tab=first', { replace: true }); }); return h.p(null); }).view }),
  ]));
  await settled();
  const r = await router.navigate('/tabs');
  await settled();
  assert.equal(router.url().search, '?tab=first');
  assert.equal(document.querySelector('main h1')?.textContent, 'tabs');
  assert.equal(r, 'done', 'the view rendered and stays; no loader was running to supersede');
});

test('B17.3 an outlet disposed during the navigation flush (onMount flips a login wall) leaves no live region behind', async (t) => {
  const session = signal(true);
  history.replaceState(null, '', '/');
  const router = createRouter([
    route('/', { view: probe('home').view }),
    route('/bye', { view: probe('bye', () => { onMount(() => { session.set(false); }); return h.p(null); }).view, title: 'Bye' }),
  ], { error: errorView, notFound });
  const { show } = await import('jasno');
  t.after(() => { for (const el of document.querySelectorAll('body > [aria-live=polite]')) el.remove(); }); // the leaked region
  mountTest(t, () => h.div(null, show(session, () => h.main(null, router.outlet()), () => h.p({ id: 'login' }, 'Log in'))));
  await settled();
  assert.equal(document.querySelector('body > [aria-live=polite]'), null, 'no live region before the first announcement');
  const r = await router.navigate('/bye');
  await settled();
  assert.ok(document.getElementById('login'), 'the outlet is gone');
  assert.ok(r === 'superseded' || r === 'done', r);
  assert.equal(document.querySelector('body > [aria-live=polite]')?.textContent ?? null, null, 'the router announced after its outlet was disposed');
});

test('B17.5 url() already shows the new URL when the new view is built (setup) and when the error view renders', async (t) => {
  let router!: ReturnType<typeof setup>['router'];
  const atSetup: string[] = [];
  ({ router } = setup(t, [
    route('/', { view: probe('home').view }),
    route('/n', { view: probe('n', () => { atSetup.push(untracked(router.url).pathname); return h.p(null); }).view }),
    route('/f', { view: probe('f').view, loader: async () => { throw new Error('x'); } }),
  ], '/', { error: (e, r) => { atSetup.push(`error at ${untracked(router.url).pathname}`); return errorView(e, r); } }));
  await settled();
  await router.navigate('/n');
  await router.navigate('/f');
  assert.deepEqual(atSetup, ['/n', 'error at /f']);
});

test('B17.10 a same-route param navigation on a route without title does not keep the previous record\'s title', async (t) => {
  document.title = 'Index';
  const v = probe('u', (p) => { const id = untracked(p.params).id as string; onMount(() => { document.title = `User ${id}`; }); return h.p(null); });
  const { router } = setup(t, [route('/u/:id', { view: v.view })], '/u/1');
  await settled();
  assert.equal(document.title, 'User 1');
  await router.navigate('/u/2');
  assert.equal(v.s.builds, 1);
  assert.notEqual(document.title, 'User 1', 'a stale title never survives a navigation');
});
