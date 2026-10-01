import { test } from 'node:test';
import assert from 'node:assert/strict';
import { component, effect, h, onMount, signal, type Read } from '@jasno/core';
import { createRouter, route, type ViewProps } from '@jasno/core/router';
import { mountTest, settled } from '@jasno/core/testing';
import { capture, codeOf, deferred } from './helpers.ts';

const View = (name: string, extra: () => Node = () => h.p(null, name)) =>
  async () => ({ default: // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one test view for every pattern
    component(function RouteView(p: ViewProps<any, any>): Node {
    return h.section(null, h.h1(null, name), h.p({ class: 'params' }, () => JSON.stringify(p.params())), h.p({ class: 'data' }, () => String(p.data())), extra());
  }) });

const errorView = (e: unknown, retry: () => void) => h.section({ role: 'alert' }, h.h1(null, 'Error'), h.p(null, String((e as Error).message ?? e)), h.button({ onclick: retry }, 'Retry'));
const notFound = () => h.section(null, h.h1(null, 'Not found'));

function setup(t: Parameters<typeof mountTest>[0], routes: Parameters<typeof createRouter>[0], start = '/') {
  history.replaceState(null, '', start);
  const router = createRouter(routes, { error: errorView, notFound });
  const view = mountTest(t, () => h.main(null, router.outlet()));
  const text = (sel: string) => view.root.querySelector(sel)?.textContent;
  return { router, view, text };
}

// ---------------------------------------------------------------- patterns (B17.1, B17.2)

test('B17.1 invalid patterns throw INVALID_ROUTE_PATTERN; a catch-all asks for notFound', () => {
  for (const p of ['users', '/users/', '/a//b', '/:id:x', '/a:b', '/:x+/y', '/:id/:id', '/:x((']) {
    assert.throws(() => createRouter([route(p as '/', { view: View('x') })], { error: errorView, notFound }), (e) => codeOf(e) === 'INVALID_ROUTE_PATTERN', p);
  }
  assert.throws(() => createRouter([route('/:rest*', { view: View('x') })], { error: errorView, notFound }), (e) => codeOf(e) === 'INVALID_ROUTE_PATTERN' && /notFound/.test(String(e)));
});

test('B17.1 ROUTE_SHADOWED names both patterns; specific-before-param is fine', () => {
  const shadowed = [['/users/:id', '/users/new'], ['/a/:rest+', '/a/b/c'], ['/t/:x(a|b)', '/t/:y(a|b)'], ['/o/:x', '/o/:y(\\d+)']];
  for (const [a, b] of shadowed) {
    assert.throws(() => createRouter([route(a as '/', { view: View('a') }), route(b as '/', { view: View('b') })], { error: errorView, notFound }),
      (e) => codeOf(e) === 'ROUTE_SHADOWED' && String(e).includes(a!) && String(e).includes(b!), `${a} then ${b}`);
  }
  const fine = [['/users/new', '/users/:id'], ['/o/:x(\\d+)', '/o/:y'], ['/p/:x', '/p/:x?'], ['/q/:x(a|b)', '/q/:y(a|c)']];
  for (const [a, b] of fine) createRouter([route(a as '/', { view: View('a') }), route(b as '/', { view: View('b') })], { error: errorView, notFound });
});

test('B17.2 matching: decoding, trailing slash, case, constraints, optional and splat params', async (t) => {
  const { router, text } = setup(t, [
    route('/users/:id', { view: View('user') }),
    route('/settings/:tab(profile|billing)', { view: View('tab') }),
    route('/docs/:path+', { view: View('docs') }),
    route('/lang/:code?', { view: View('lang') }),
  ], '/users/a%20b/');
  await settled();
  assert.equal(text('.params'), '{"id":"a b"}');
  assert.equal(await router.navigate('/settings/billing'), 'done');
  assert.equal(text('.params'), '{"tab":"billing"}');
  await router.navigate('/settings/other');
  assert.equal(text('h1'), 'Not found');
  await router.navigate('/docs/a/b%2Fc');
  assert.equal(text('.params'), '{"path":"a/b/c"}');
  await router.navigate('/lang');
  assert.equal(text('.params'), '{}');
  await router.navigate('/Users/1');
  assert.equal(text('h1'), 'Not found', 'case-sensitive');
});

test('B17.14 href: encoding, optional segments dropped, splat per sub-segment, numbers', () => {
  const router = createRouter([route('/users/:id', { view: View('u') }), route('/f/:a?/x', { view: View('f') }), route('/d/:p*', { view: View('d') })], { error: errorView, notFound });
  assert.equal(router.href('/users/:id', { id: 'a b/c' }), '/users/a%20b%2Fc');
  assert.equal(router.href('/users/:id', { id: 7 }), '/users/7');
  assert.equal(router.href('/f/:a?/x'), '/f/x');
  assert.equal(router.href('/d/:p*', { p: 'a b/c' }), '/d/a%20b/c');
});

// ---------------------------------------------------------------- navigation (B17.5-B17.7, B17.13, B17.16)

test('B17.5 same route with new params keeps the view and updates its params and data Reads', async (t) => {
  let builds = 0;
  const { router, text } = setup(t, [route('/u/:id', {
    view: async () => ({ default: component(function U(p: { params: Read<{ id: string }>; data: Read<string> }): Node { builds++; return h.section(null, h.h1(null, () => p.data()), h.p(null, () => p.params().id)); }) }),
    loader: async ({ params }) => `user ${params.id}`,
  })], '/u/1');
  await settled();
  assert.equal(text('h1'), 'user 1');
  await router.navigate('/u/2');
  assert.equal(text('h1'), 'user 2');
  assert.equal(builds, 1);
});

test('B17.7 a search-only navigate() updates url synchronously and keeps the view', async (t) => {
  const { router } = setup(t, [route('/', { view: View('home') })]);
  await settled();
  const before = router.url();
  const p = router.navigate('?q=a b');
  assert.equal(router.url().searchParams.get('q'), 'a b', 'before navigate() returns');
  assert.equal(await p, 'done');
  assert.notEqual(router.url(), before);
  assert.equal(location.search, '?q=a%20b');
});

test('B17.5/B17.13 a newer navigation supersedes one whose loader runs; replace leaves no extra entry', async (t) => {
  const slow = deferred<string>();
  const { router, text } = setup(t, [
    route('/a', { view: View('a') }),
    route('/slow', { view: View('slow'), loader: () => slow.promise }),
    route('/login', { view: View('login') }),
  ], '/a');
  await settled();
  const before = history.length;
  const first = router.navigate('/slow');
  assert.equal(router.isLoading(), true);
  const second = router.navigate('/login', { replace: true });
  assert.equal(await first, 'superseded');
  assert.equal(await second, 'done');
  slow.resolve('late');
  await settled();
  assert.equal(text('h1'), 'login');
  assert.equal(location.pathname, '/login');
  assert.equal(history.length, before + 1, 'the superseded entry was replaced');
  assert.equal(router.isLoading(), false);
});

test('B17.6 an unmatched start URL renders notFound (the outlet renders after setup, no FLUSH_REENTRANT)', async (t) => {
  const { text } = setup(t, [route('/', { view: View('home') })], '/nowhere');
  await settled();
  assert.equal(text('h1'), 'Not found');
});

test('B17.6 an unmatched URL renders notFound and restores the initial title', async (t) => {
  document.title = 'App';
  const { router, text } = setup(t, [route('/', { view: View('home'), title: 'Home' })]);
  await settled();
  assert.equal(document.title, 'Home');
  assert.equal(await router.navigate('/nowhere'), 'done');
  assert.equal(text('h1'), 'Not found');
  assert.equal(document.title, 'App');
});

test('B17.5 a failing loader renders the error view with retry; url shows the attempted URL', async (t) => {
  let fail = true;
  const { router, view, text } = setup(t, [
    route('/', { view: View('home') }),
    route('/x', { view: View('x'), loader: async () => { if (fail) throw new Error('down'); return 'ok'; } }),
  ]);
  await settled();
  assert.equal(await router.navigate('/x'), 'failed');
  assert.equal(text('[role=alert] p'), 'down');
  assert.equal(router.url().pathname, '/x');
  fail = false;
  view.root.querySelector('button')!.click();
  await settled();
  assert.equal(text('.data'), 'ok');
});

test('B17.12 an effect error in the view replaces it with the error view', async (t) => {
  const boom = signal(false);
  const { text } = setup(t, [route('/', { view: View('home', () => { effect(() => { if (boom()) throw new Error('effect broke'); }); return h.p(null); }) })]);
  await settled();
  boom.set(true);
  await settled();
  assert.equal(text('[role=alert] p'), 'effect broke');
});

// ---------------------------------------------------------------- focus, title, announcement (B17.8-B17.10)

test('B17.8 focus after a navigation: [autofocus], else h1 (tabindex -1), else main with VIEW_NO_HEADING; never on the first render', async (t) => {
  const cap = capture();
  const { router, view } = setup(t, [
    route('/', { view: View('home') }),
    route('/form', { view: View('form', () => h.label(null, 'Name', h.input({ autofocus: true }))) }),
    route('/bare', { view: async () => ({ default: component(function Bare(): Node { return h.p(null, 'no heading'); }) }) }),
  ]);
  await settled();
  assert.notEqual(document.activeElement?.tagName, 'H1', 'no focus move on first render');
  await router.navigate('/form');
  assert.equal(document.activeElement?.tagName, 'INPUT');
  await router.navigate('/');
  assert.equal(document.activeElement?.tagName, 'H1');
  assert.equal(document.activeElement?.getAttribute('tabindex'), '-1');
  await router.navigate('/bare');
  assert.equal(document.activeElement, view.root.querySelector('main'));
  cap.stop();
  assert.deepEqual(cap.codes(), ['VIEW_NO_HEADING']);
});

test('B17.10 title: string, (data) => string, none restores the initial title; a view effect wins', async (t) => {
  document.title = 'Initial';
  const { router } = setup(t, [
    route('/', { view: View('home'), title: 'Home' }),
    route('/u/:id', { view: View('u'), loader: async ({ params }) => ({ name: `User ${params.id}` }), title: (u) => (u as { name: string }).name }),
    route('/plain', { view: View('plain') }),
    route('/own', { view: View('own', () => { const name = signal('Own title'); effect(() => { document.title = name(); }); return h.p(null); }), title: 'Route title' }),
  ]);
  await settled();
  assert.equal(document.title, 'Home');
  await router.navigate('/u/7');
  assert.equal(document.title, 'User 7');
  await router.navigate('/plain');
  assert.equal(document.title, 'Initial');
  await router.navigate('/own');
  assert.equal(document.title, 'Own title');
});

test('B17.9 announcement: the route title, else the h1 text, through a polite live region', async (t) => {
  const { router } = setup(t, [route('/', { view: View('home') }), route('/t', { view: View('titled'), title: 'The title' })]);
  await settled();
  await router.navigate('/t');
  const live = document.querySelector('[aria-live=polite]:not(main *)');
  assert.equal(live?.textContent, 'The title');
  await router.navigate('/');
  assert.equal(live?.textContent, 'home');
});

// ---------------------------------------------------------------- History adapter, back, outlet lifecycle

test('B17.4 link clicks: same-origin matching links are intercepted; modified, target, download, external and unmatched are not', async (t) => {
  const { router, view, text } = setup(t, [route('/', { view: View('home', () => h.nav(null,
    h.a({ href: '/next', id: 'plain' }, 'Next'),
    h.a({ href: '/next', target: '_blank', id: 'target' }, 'T'),
    h.a({ href: '/next', download: 'x', id: 'download' }, 'D'),
    h.a({ href: 'https://example.com/next', id: 'external' }, 'E'),
    h.a({ href: '/unknown', id: 'unmatched' }, 'U'))) }), route('/next', { view: View('next') })]);
  await settled();
  // The router listens on document; this window listener runs after it, records its verdict and stops
  // happy-dom from performing the default navigation of links the router left alone.
  let intercepted = false;
  const stop = (e: Event) => { intercepted = e.defaultPrevented; e.preventDefault(); };
  window.addEventListener('click', stop);
  t.after(() => window.removeEventListener('click', stop));
  const click = (id: string, init: MouseEventInit = {}) => {
    view.root.querySelector(`#${id}`)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
    return intercepted;
  };
  for (const id of ['target', 'download', 'external', 'unmatched']) assert.equal(click(id), false, id);
  assert.equal(click('plain', { ctrlKey: true }), false, 'modified');
  assert.equal(click('plain'), true);
  await settled();
  assert.equal(text('h1'), 'next');
  assert.equal(router.url().pathname, '/next');
});

test('B17.18 back(): one history step inside the app, else navigate(fallback, { replace: true })', async (t) => {
  const { router, text } = setup(t, [route('/', { view: View('home') }), route('/detail', { view: View('detail') })], '/detail');
  await settled();
  const len = history.length;
  assert.equal(await router.back('/'), 'done', 'deep link: fallback');
  assert.equal(text('h1'), 'home');
  assert.equal(history.length, len, 'replaced, no new entry');
  await router.navigate('/detail');
  assert.equal(await router.back('/'), 'done');
  assert.equal(location.pathname, '/');
  assert.equal(text('h1'), 'home');
});

test('B17.3/B17.13 ROUTER_NOT_STARTED before outlet(); OUTLET_ALREADY_ACTIVE for a second outlet; disposal stops listening', async (t) => {
  const router = createRouter([route('/', { view: View('home') }), route('/b', { view: View('b') })], { error: errorView, notFound });
  assert.throws(() => router.navigate('/b'), (e) => codeOf(e) === 'ROUTER_NOT_STARTED');
  assert.throws(() => router.back('/'), (e) => codeOf(e) === 'ROUTER_NOT_STARTED');
  history.replaceState(null, '', '/');
  const view = mountTest({ after() {} }, () => h.main(null, router.outlet()));
  assert.throws(() => mountTest({ after() {} }, () => h.main(null, router.outlet())), (e) => codeOf(e) === 'OUTLET_ALREADY_ACTIVE');
  await settled();
  view.dispose();
  assert.throws(() => router.navigate('/b'), (e) => codeOf(e) === 'ROUTER_NOT_STARTED');
  void t;
});

test('B17.17 a view import TypeError reports VIEW_IMPORT_FAILED and reloads once; a second failure renders the error view', async (t) => {
  const cap = capture();
  const assigned: string[] = [];
  t.mock.method(location, 'assign', (u: string) => { assigned.push(u); });
  sessionStorage.clear();
  const { router, text } = setup(t, [route('/', { view: View('home') }), route('/lazy', { view: (): ReturnType<ReturnType<typeof View>> => Promise.reject(new TypeError('Failed to fetch module')) })]);
  await settled();
  assert.equal(await router.navigate('/lazy'), 'failed');
  assert.deepEqual(assigned, ['http://localhost/lazy']);
  assert.equal(await router.navigate('/lazy', { replace: true }), 'failed');
  assert.equal(text('[role=alert] p'), 'Failed to fetch module');
  cap.stop();
  assert.deepEqual(cap.codes(), ['VIEW_IMPORT_FAILED']);
  sessionStorage.clear();
});

test('__JASNO__.router() reports url, route, isLoading and the last error', async (t) => {
  const { router } = setup(t, [route('/', { view: View('home') }), route('/e', { view: View('e'), loader: async () => { throw new Error('nope'); } })]);
  await settled();
  const dev = (globalThis as unknown as { __JASNO__: { router(): unknown } }).__JASNO__;
  assert.deepEqual(dev.router(), { url: 'http://localhost/', route: '/', isLoading: false, error: undefined });
  await router.navigate('/e');
  assert.deepEqual(dev.router(), { url: 'http://localhost/e', route: undefined, isLoading: false, error: 'nope' });
});

test('onMount of the new view runs before the router moves focus (a dialog opened in onMount gets the autofocus)', async (t) => {
  const order: string[] = [];
  const { router } = setup(t, [route('/', { view: View('home') }), route('/d', { view: View('d', () => {
    const input = h.input({ 'aria-label': 'x', autofocus: true, onfocus: () => order.push('focus') });
    onMount(() => { order.push('mount'); });
    return input;
  }) })]);
  await settled();
  await router.navigate('/d');
  assert.deepEqual(order, ['mount', 'focus']);
});
